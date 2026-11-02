-- =============================================================================
-- Phase 1: atomic offline sales and append-only corrections.
--
-- These are the only sale writers. Campaign locks serialize issuance with
-- allocation, enrollment and lifecycle transitions. Inventory belongs to a
-- participant: linked guardians share that player's assigned ticket pool.
-- Existing ledger rows and hash payloads retain their original shapes.
-- =============================================================================

-- Internal only: hold the caller's current authorization rows until commit.
-- Revoking membership/roles or suspending an organization then serializes with
-- sale writes. The public entry points recheck their exact permissions after
-- these locks; an earlier permission check alone would leave a revocation race.
create function public.lock_fundraising_membership(p_organization_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
<<lock_fundraising_membership>>
declare
  member_id uuid;
begin
  perform 1 from public.organizations o where o.id = p_organization_id for share;
  if not found then
    raise exception 'Organization not found.' using errcode = 'no_data_found';
  end if;

  -- Preserve the existing SQL-managed platform permission bypass without
  -- granting platform or organization authority to any new role.
  perform 1 from public.platform_admins pa where pa.user_id = auth.uid() for share;
  if found then
    return null;
  end if;

  select m.id into member_id from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.status = 'active'
  for share;
  if not found then
    raise exception 'Active organization membership is required.' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.organization_member_roles mr
  where mr.member_id = lock_fundraising_membership.member_id
    and mr.organization_id = p_organization_id
  order by mr.role_key for share;
  return member_id;
end;
$$;
revoke all on function public.lock_fundraising_membership(uuid) from public, anon, authenticated, service_role;

create or replace function public.record_campaign_sale(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_participant_id uuid,
  p_idempotency_key text,
  p_buyer_name text,
  p_quantity integer,
  p_amount_cents bigint,
  p_payment_method text,
  p_buyer_email text default null,
  p_buyer_phone text default null,
  p_notes text default null,
  p_sold_at timestamptz default null,
  p_corrects_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
<<record_campaign_sale>>
declare
  campaign public.campaigns;
  participant public.campaign_participants;
  player public.players;
  member_id uuid;
  family_guardian_id uuid;
  family_household_id uuid;
  previous_sale public.campaign_sales;
  corrected_sale public.campaign_sales;
  me uuid := auth.uid();
  sale_id uuid := gen_random_uuid();
  collection_id uuid := gen_random_uuid();
  ticket_ids uuid[];
  ticket_numbers jsonb;
  request_key text := nullif(btrim(p_idempotency_key), '');
  buyer_name text := nullif(btrim(p_buyer_name), '');
  buyer_email text := nullif(lower(btrim(p_buyer_email)), '');
  buyer_phone text := nullif(btrim(p_buyer_phone), '');
  notes text := nullif(btrim(p_notes), '');
  payment text := lower(btrim(p_payment_method));
  sold_at timestamptz := coalesce(p_sold_at, now());
  checked_at timestamptz;
  fingerprint text;
  prior_write_context text := coalesce(current_setting('raffle_hub.fundraising_write', true), '');
  prior_reason text := current_setting('raffle_hub.reason', true);
begin
  perform public.assert_org_permission(p_organization_id, 'tickets.issue');
  if me is null then
    raise exception 'A signed-in seller is required.' using errcode = 'insufficient_privilege';
  end if;

  select c.* into campaign from public.campaigns c
  where c.id = p_campaign_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Campaign not found.' using errcode = 'no_data_found';
  end if;

  select cp.* into participant from public.campaign_participants cp
  where cp.id = p_participant_id and cp.organization_id = campaign.organization_id
    and cp.campaign_id = campaign.id
  for update;
  if not found then
    raise exception 'Participant not found in this campaign.' using errcode = 'no_data_found';
  end if;

  select p.* into player from public.players p
  where p.id = participant.player_id and p.organization_id = campaign.organization_id
  for share;
  if not found or player.status <> 'active' or player.archived_at is not null
     or participant.status <> 'active' then
    raise exception 'The campaign participant and player must be active.' using errcode = 'check_violation';
  end if;

  member_id := public.lock_fundraising_membership(campaign.organization_id);
  perform public.assert_org_permission(campaign.organization_id, 'tickets.issue');
  -- Family scope is explicit. The broader roster/team read union must never
  -- turn a combined Captain + Family membership into a team-wide seller.
  if not public.has_org_permission(campaign.organization_id, 'organization.manage') then
    if not public.has_org_permission(campaign.organization_id, 'roster.read_own_family') then
      raise exception 'You may record sales only for your linked players.' using errcode = 'insufficient_privilege';
    end if;

    -- Lock one sufficient live guardian authorization, including the guardian
    -- itself. Player FOR SHARE above protects the current household relation.
    select g.id, g.household_id into family_guardian_id, family_household_id
    from public.guardian_user_links l
    join public.guardians g on g.id = l.guardian_id and g.organization_id = l.organization_id
    where l.organization_id = campaign.organization_id and l.member_id = record_campaign_sale.member_id
      and l.archived_at is null and g.archived_at is null
      and ((player.household_id is not null and g.household_id = player.household_id)
        or exists (select 1 from public.player_guardians pg
          where pg.player_id = player.id and pg.guardian_id = g.id and pg.organization_id = campaign.organization_id))
    order by l.id limit 1 for share of l, g;
    if not found then
      raise exception 'You may record sales only for your linked players.' using errcode = 'insufficient_privilege';
    end if;
    if player.household_id is null or family_household_id is distinct from player.household_id then
      perform 1 from public.player_guardians pg
      where pg.player_id = player.id and pg.guardian_id = family_guardian_id
        and pg.organization_id = campaign.organization_id for share;
      if not found then
        raise exception 'You may record sales only for your linked players.' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if not (participant.player_id in (select public.my_family_player_ids())) then
      raise exception 'You may record sales only for your linked players.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if request_key is null or length(request_key) > 200 then
    raise exception 'An idempotency key of 1–200 characters is required.' using errcode = 'check_violation';
  end if;
  if buyer_name is null or length(buyer_name) > 200 then
    raise exception 'Buyer name must contain 1–200 characters.' using errcode = 'check_violation';
  end if;
  if length(coalesce(buyer_email, '')) > 254
     or (buyer_email is not null and buyer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid buyer email of at most 254 characters.' using errcode = 'check_violation';
  end if;
  if length(coalesce(buyer_phone, '')) > 50 or length(coalesce(notes, '')) > 2000 then
    raise exception 'Buyer phone or notes exceed the allowed length.' using errcode = 'check_violation';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'Quantity must be between 1 and 500.' using errcode = 'check_violation';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Amount collected must be positive.' using errcode = 'check_violation';
  end if;
  if payment is null or payment not in ('cash', 'check') then
    raise exception 'Only authorized offline cash or check payments are supported.' using errcode = 'check_violation';
  end if;

  -- Keep an omitted timestamp null in the request fingerprint: evaluating
  -- now() for that field would make an otherwise identical retry differ.
  fingerprint := encode(extensions.digest(jsonb_build_object(
    'organization_id', campaign.organization_id,
    'campaign_id', campaign.id,
    'participant_id', participant.id,
    'buyer_name', buyer_name,
    'buyer_email', buyer_email,
    'buyer_phone', buyer_phone,
    'quantity', p_quantity,
    'amount_cents', p_amount_cents,
    'payment_method', payment,
    'notes', notes,
    'sold_at', p_sold_at,
    'corrects_sale_id', p_corrects_sale_id
  )::text, 'sha256'), 'hex');

  -- Keys are caller-bound across the organization, not merely the campaign.
  -- This also serializes the uncommon reuse of one key across campaigns.
  perform pg_advisory_xact_lock(hashtextextended(
    'campaign-sale:' || campaign.organization_id::text || ':' || me::text || ':' || request_key, 0));
  select s.* into previous_sale from public.campaign_sales s
  where s.organization_id = campaign.organization_id and s.created_by = me
    and s.idempotency_key = request_key;
  if found then
    if previous_sale.request_fingerprint <> fingerprint then
      raise exception 'This idempotency key was already used for a different sale.' using errcode = 'unique_violation';
    end if;
    select coalesce(jsonb_agg(t.ticket_number order by t.sequence_number), '[]'::jsonb)
    into ticket_numbers from public.tickets t
    where t.sale_id = previous_sale.id and t.organization_id = campaign.organization_id
      and t.campaign_id = campaign.id;
    return jsonb_build_object('sale_id', previous_sale.id, 'ticket_numbers', ticket_numbers,
      'amount_cents', previous_sale.amount_cents, 'quantity', previous_sale.quantity, 'replayed', true);
  end if;

  -- A previously committed sale can be retried after closure; new issuance
  -- always requires an active raffle and a currently open sales window.
  if campaign.campaign_type <> 'raffle' or campaign.status <> 'ACTIVE'
     or campaign.archived_at is not null then
    raise exception 'Sales can only be recorded for an active raffle campaign.' using errcode = 'check_violation';
  end if;
  checked_at := clock_timestamp();
  if campaign.starts_at is null or campaign.sales_close_at is null
     or checked_at < campaign.starts_at or checked_at >= campaign.sales_close_at then
    raise exception 'The campaign sales window is not open.' using errcode = 'check_violation';
  end if;
  if not isfinite(sold_at) or sold_at < campaign.starts_at or sold_at >= campaign.sales_close_at
     or sold_at > checked_at + interval '5 minutes' then
    raise exception 'Sale timestamp must fall within the campaign sales window and cannot be in the future.' using errcode = 'check_violation';
  end if;
  if campaign.ticket_price_cents is null
     or p_amount_cents <> campaign.ticket_price_cents::bigint * p_quantity::bigint then
    raise exception 'Amount collected must equal quantity times the campaign ticket price.' using errcode = 'check_violation';
  end if;

  if p_corrects_sale_id is not null then
    select s.* into corrected_sale from public.campaign_sales s
    where s.id = p_corrects_sale_id and s.organization_id = campaign.organization_id
      and s.campaign_id = campaign.id and s.participant_id = participant.id
    for update;
    if not found or not exists (
      select 1 from public.sale_reversals r
      where r.sale_id = p_corrects_sale_id and r.organization_id = campaign.organization_id
        and r.campaign_id = campaign.id and r.approved_by is not null
    ) then
      raise exception 'A correction must replace an approved reversal for the same player and campaign.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.campaign_sales s where s.corrects_sale_id = p_corrects_sale_id) then
      raise exception 'This reversed sale already has a replacement.' using errcode = 'unique_violation';
    end if;
  end if;

  select array_agg(t.id order by t.sequence_number),
         jsonb_agg(t.ticket_number order by t.sequence_number)
  into ticket_ids, ticket_numbers
  from (
    select stock.id, stock.sequence_number, stock.ticket_number from public.tickets stock
    where stock.organization_id = campaign.organization_id and stock.campaign_id = campaign.id
      and stock.participant_id = participant.id and stock.status = 'ALLOCATED' and stock.sale_id is null
    order by stock.sequence_number
    limit p_quantity
    for update
  ) t;
  if coalesce(cardinality(ticket_ids), 0) <> p_quantity then
    raise exception 'Not enough assigned tickets remain for this player.' using errcode = 'check_violation';
  end if;

  perform set_config('raffle_hub.fundraising_write', campaign.id::text, true);
  perform public.set_audit_reason(notes);

  insert into public.money_events (id, organization_id, campaign_id, participant_id,
    event_type, amount_cents, payment_method, metadata, occurred_at)
  values (collection_id, campaign.organization_id, campaign.id, participant.id,
    'SALE_COLLECTED', p_amount_cents, payment,
    jsonb_strip_nulls(jsonb_build_object('sale_id', sale_id, 'player_id', participant.player_id,
      'quantity', p_quantity, 'corrects_sale_id', p_corrects_sale_id)), sold_at);

  insert into public.campaign_sales (id, organization_id, campaign_id, participant_id,
    buyer_name, buyer_email, buyer_phone, quantity, amount_cents, payment_method, notes,
    sold_at, created_by, idempotency_key, request_fingerprint, collection_event_id, corrects_sale_id)
  values (sale_id, campaign.organization_id, campaign.id, participant.id,
    buyer_name, buyer_email, buyer_phone, p_quantity, p_amount_cents, payment, notes,
    sold_at, me, request_key, fingerprint, collection_id, p_corrects_sale_id);

  update public.tickets t set status = 'ISSUED', sale_id = record_campaign_sale.sale_id
  where t.id = any(ticket_ids);

  insert into public.ticket_events (organization_id, campaign_id, ticket_id, event_type,
    participant_id, idempotency_key, metadata, occurred_at)
  select campaign.organization_id, campaign.id, t.id, 'ISSUED', participant.id, record_campaign_sale.request_key,
    jsonb_strip_nulls(jsonb_build_object('sale_id', record_campaign_sale.sale_id, 'collection_event_id', record_campaign_sale.collection_id,
      'allocation_id', t.allocation_id, 'ticket_number', t.ticket_number,
      'corrects_sale_id', p_corrects_sale_id)), record_campaign_sale.sold_at
  from public.tickets t where t.id = any(ticket_ids)
  order by t.sequence_number;

  perform set_config('raffle_hub.fundraising_write', prior_write_context, true);
  perform public.set_audit_reason(prior_reason);
  return jsonb_build_object('sale_id', sale_id, 'ticket_numbers', ticket_numbers,
    'amount_cents', p_amount_cents, 'quantity', p_quantity, 'replayed', false);
end;
$$;

create or replace function public.reverse_campaign_sale(
  p_organization_id uuid,
  p_sale_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
<<reverse_campaign_sale>>
declare
  campaign public.campaigns;
  sale public.campaign_sales;
  collection public.money_events;
  reversal_id uuid;
  reversal_event_id uuid := gen_random_uuid();
  me uuid := auth.uid();
  reason text := nullif(btrim(p_reason), '');
  ticket_ids uuid[];
  prior_write_context text := coalesce(current_setting('raffle_hub.fundraising_write', true), '');
  prior_reason text := current_setting('raffle_hub.reason', true);
begin
  perform public.assert_org_permission(p_organization_id, 'tickets.void');
  perform public.assert_org_permission(p_organization_id, 'adjustments.approve');
  if me is null then
    raise exception 'A signed-in approver is required.' using errcode = 'insufficient_privilege';
  end if;
  if reason is null or length(reason) < 3 or length(reason) > 500 then
    raise exception 'A reversal reason of 3–500 characters is required.' using errcode = 'check_violation';
  end if;

  select s.* into sale from public.campaign_sales s
  where s.id = p_sale_id and s.organization_id = p_organization_id;
  if not found then
    raise exception 'Sale not found.' using errcode = 'no_data_found';
  end if;
  select c.* into campaign from public.campaigns c
  where c.id = sale.campaign_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Campaign not found.' using errcode = 'no_data_found';
  end if;
  select s.* into sale from public.campaign_sales s where s.id = p_sale_id
  for update;

  perform public.lock_fundraising_membership(campaign.organization_id);
  perform public.assert_org_permission(campaign.organization_id, 'tickets.void');
  perform public.assert_org_permission(campaign.organization_id, 'adjustments.approve');

  select r.id into reversal_id from public.sale_reversals r
  where r.sale_id = sale.id and r.organization_id = campaign.organization_id
    and r.campaign_id = campaign.id;
  if found then
    return reversal_id;
  end if;

  -- Ticket validity freezes once the drawing is recorded. An already
  -- committed reversal remains retryable after that point, but new financial
  -- reconciliation without ticket changes belongs to a separate workflow.
  if campaign.status not in ('ACTIVE', 'CLOSED') then
    raise exception 'Sales can only be reversed before the drawing is recorded.' using errcode = 'check_violation';
  end if;

  select m.* into collection from public.money_events m
  where m.id = sale.collection_event_id and m.organization_id = campaign.organization_id
    and m.campaign_id = campaign.id and m.participant_id = sale.participant_id
    and m.event_type = 'SALE_COLLECTED';
  if not found or collection.amount_cents <> sale.amount_cents
     or collection.payment_method is distinct from sale.payment_method then
    raise exception 'Sale collection ledger does not match the original sale.' using errcode = 'check_violation';
  end if;

  select array_agg(t.id order by t.sequence_number) into ticket_ids
  from (
    select stock.id, stock.sequence_number from public.tickets stock
    where stock.organization_id = campaign.organization_id and stock.campaign_id = campaign.id
      and stock.sale_id = sale.id and stock.participant_id = sale.participant_id and stock.status = 'ISSUED'
    order by stock.sequence_number for update
  ) t;
  if coalesce(cardinality(ticket_ids), 0) <> sale.quantity then
    raise exception 'Issued ticket inventory does not match the original sale.' using errcode = 'check_violation';
  end if;

  reversal_id := gen_random_uuid();
  perform set_config('raffle_hub.fundraising_write', campaign.id::text, true);
  perform public.set_audit_reason(reason);

  insert into public.money_events (id, organization_id, campaign_id, participant_id,
    event_type, amount_cents, payment_method, reverses_event_id, reason, approved_by, metadata)
  values (reversal_event_id, campaign.organization_id, campaign.id, sale.participant_id,
    'REVERSAL', -sale.amount_cents, sale.payment_method, collection.id, reason, me,
    jsonb_build_object('sale_id', sale.id, 'reversal_id', reversal_id, 'quantity', sale.quantity));

  insert into public.sale_reversals (id, organization_id, campaign_id, sale_id,
    collection_event_id, reversal_event_id, reason, created_by, approved_by)
  values (reversal_id, campaign.organization_id, campaign.id, sale.id,
    collection.id, reversal_event_id, reason, me, me);

  -- A voided number is retained with its original allocation and sale. It is
  -- never put back into AVAILABLE or ALLOCATED inventory.
  update public.tickets t set status = 'VOIDED' where t.id = any(ticket_ids);
  insert into public.ticket_events (organization_id, campaign_id, ticket_id, event_type,
    participant_id, reason, idempotency_key, metadata)
  select campaign.organization_id, campaign.id, t.id, 'VOIDED', sale.participant_id,
    reverse_campaign_sale.reason, 'reversal:' || reverse_campaign_sale.reversal_id::text,
    jsonb_build_object('sale_id', sale.id, 'reversal_id', reverse_campaign_sale.reversal_id,
      'reversal_event_id', reverse_campaign_sale.reversal_event_id, 'ticket_number', t.ticket_number)
  from public.tickets t where t.id = any(ticket_ids)
  order by t.sequence_number;

  perform set_config('raffle_hub.fundraising_write', prior_write_context, true);
  perform public.set_audit_reason(prior_reason);
  return reversal_id;
end;
$$;

revoke all on function public.record_campaign_sale(uuid, uuid, uuid, text, text, integer, bigint, text, text, text, text, timestamptz, uuid),
  public.reverse_campaign_sale(uuid, uuid, text) from public, anon;
grant execute on function public.record_campaign_sale(uuid, uuid, uuid, text, text, integer, bigint, text, text, text, text, timestamptz, uuid),
  public.reverse_campaign_sale(uuid, uuid, text) to authenticated;
