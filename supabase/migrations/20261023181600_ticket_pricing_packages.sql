-- Additive campaign pricing. Existing sales, money events, ticket numbers and
-- frozen drawing evidence are not rewritten. No new roles or public endpoints.
-- Generated with the pinned CLI on the isolated implementation runner.

create function public.valid_campaign_ticket_packages(p_single bigint, p_packages jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; q numeric; p numeric; seen integer[] := '{}';
begin
  if p_single is not null and (p_single < 1 or p_single > 100000) then return false; end if;
  if jsonb_typeof(p_packages) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_packages) > 19 then return false; end if;
  if jsonb_array_length(p_packages) > 0 and p_single is null then return false; end if;
  for item in select value from jsonb_array_elements(p_packages) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if not (item ?& array['quantity','priceCents']) or item - 'quantity' - 'priceCents' <> '{}'::jsonb then return false; end if;
    if jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'priceCents') is distinct from 'number' then return false; end if;
    q := (item->>'quantity')::numeric; p := (item->>'priceCents')::numeric;
    if q <> trunc(q) or q < 2 or q > 500 or p <> trunc(p) or p < q or p > q*p_single then return false; end if;
    if q::integer = any(seen) then return false; end if;
    seen := array_append(seen,q::integer);
  end loop;
  return true;
exception when others then return false;
end; $$;
revoke all on function public.valid_campaign_ticket_packages(bigint,jsonb) from public,anon;
-- Pure validation is needed by the campaign CHECK under caller-bound RLS.
grant execute on function public.valid_campaign_ticket_packages(bigint,jsonb) to authenticated,service_role;

alter table public.campaigns add column ticket_packages jsonb not null default '[]'::jsonb;
alter table public.campaigns add constraint campaigns_ticket_packages_valid
  check (public.valid_campaign_ticket_packages(ticket_price_cents,ticket_packages));
comment on column public.campaigns.ticket_packages is
  'Optional discounted bundles {quantity,priceCents}; single price remains ticket_price_cents. Locked at activation.';
alter table public.campaign_sales add column pricing_snapshot jsonb;
comment on column public.campaign_sales.pricing_snapshot is
  'Immutable server-calculated V1 package quote and per-ticket cents. NULL only for pre-package legacy sales; never backfilled.';

-- Exact dynamic programming, same choice order/tie policy as the TS calculator.
-- All supported campaign totals are bounded by 500 * 100000 integer cents.
create function public.quote_campaign_ticket_packages(p_quantity integer,p_single bigint,p_packages jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  totals bigint[]; counts integer[]; choices integer[]; used integer[];
  tickets integer; q integer; price bigint; candidate bigint; candidate_count integer;
  remaining integer; lines jsonb := '[]';
begin
  if p_quantity is null or p_quantity not between 1 and 500 or p_single is null
     or not public.valid_campaign_ticket_packages(p_single,p_packages) then
    raise exception 'Invalid ticket package pricing or quantity.' using errcode='check_violation';
  end if;
  totals := array_fill(null::bigint,array[p_quantity+1],array[0]);
  counts := array_fill(null::integer,array[p_quantity+1],array[0]);
  choices := array_fill(null::integer,array[p_quantity+1],array[0]);
  used := array_fill(0,array[501],array[0]);
  totals[0]:=0; counts[0]:=0;
  for tickets in 1..p_quantity loop
    for q,price in
      select x.quantity,x.price from (
        select 1 as quantity,p_single as price
        union all select (v->>'quantity')::integer,(v->>'priceCents')::bigint from jsonb_array_elements(p_packages) v
      ) x order by x.quantity desc
    loop
      if q > tickets then continue; end if;
      if totals[tickets-q] is null then continue; end if;
      candidate:=totals[tickets-q]+price; candidate_count:=counts[tickets-q]+1;
      if totals[tickets] is null or candidate < totals[tickets]
         or (candidate=totals[tickets] and candidate_count<counts[tickets]) then
        totals[tickets]:=candidate; counts[tickets]:=candidate_count; choices[tickets]:=q;
      end if;
    end loop;
  end loop;
  remaining:=p_quantity;
  while remaining>0 loop
    q:=choices[remaining];
    if q is null then raise exception 'Unable to quote exact ticket quantity.' using errcode='check_violation'; end if;
    used[q]:=used[q]+1; remaining:=remaining-q;
  end loop;
  for q,price in
    select x.quantity,x.price from (
      select 1 as quantity,p_single as price
      union all select (v->>'quantity')::integer,(v->>'priceCents')::bigint from jsonb_array_elements(p_packages) v
    ) x order by x.quantity desc
  loop
    if used[q]>0 then lines:=lines||jsonb_build_array(jsonb_build_object('quantity',q,'priceCents',price,'count',used[q])); end if;
  end loop;
  return jsonb_build_object('quantity',p_quantity,'totalCents',totals[p_quantity],'packages',lines);
end; $$;
revoke all on function public.quote_campaign_ticket_packages(integer,bigint,jsonb) from public,anon,authenticated,service_role;

create function public.campaign_sale_pricing(p_quantity integer,p_single bigint,p_packages jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare quote jsonb; line jsonb; q integer; price bigint; repeats integer; j integer; k integer; amounts bigint[] := '{}';
begin
  quote:=public.quote_campaign_ticket_packages(p_quantity,p_single,p_packages);
  for line in select value from jsonb_array_elements(quote->'packages') loop
    q:=(line->>'quantity')::integer; price:=(line->>'priceCents')::bigint; repeats:=(line->>'count')::integer;
    for k in 1..repeats loop
      for j in 1..q loop
        amounts:=array_append(amounts,price/q+case when j<=price%q then 1 else 0 end);
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('version',1,'singleTicketPriceCents',p_single,
    'packages',jsonb_build_array(jsonb_build_object('quantity',1,'priceCents',p_single))||p_packages,
    'quote',quote,'ticketAmountsCents',to_jsonb(amounts));
end; $$;
revoke all on function public.campaign_sale_pricing(integer,bigint,jsonb) from public,anon,authenticated,service_role;

create function public.sale_pricing_consistent(s public.campaign_sales,c public.campaigns)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if s.pricing_snapshot is null then
    return c.ticket_packages='[]'::jsonb and s.amount_cents=s.quantity::bigint*c.ticket_price_cents;
  end if;
  return s.pricing_snapshot=public.campaign_sale_pricing(s.quantity,c.ticket_price_cents,c.ticket_packages)
    and (s.pricing_snapshot->'quote'->>'totalCents')::bigint=s.amount_cents;
exception when others then return false;
end; $$;
revoke all on function public.sale_pricing_consistent(public.campaign_sales,public.campaigns) from public,anon,authenticated,service_role;



create or replace function public.campaign_compliance_payload(c public.campaigns, o public.organizations)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'operator_legal_name', coalesce(o.legal_name, o.name),
    'operator_address', jsonb_strip_nulls(jsonb_build_object(
      'line1', o.address_line1, 'line2', o.address_line2, 'city', o.city,
      'region', o.region, 'postal_code', o.postal_code, 'country', o.country
    )),
    'jurisdiction_profile', o.jurisdiction_profile,
    'ticket_price_cents', c.ticket_price_cents,
    'draw_at', c.draw_at,
    'prize_description', c.prize_description,
    'charitable_purpose', c.charitable_purpose,
    'raffle_year_sequence', c.raffle_year_sequence,
    'rules_text', c.rules_text
  ) || case when c.ticket_packages='[]'::jsonb then '{}'::jsonb else jsonb_build_object('ticket_packages',c.ticket_packages) end;
$$;

create or replace function public.campaign_compliance_fields(c public.campaigns)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'ticket_price_cents', c.ticket_price_cents,
    'draw_at', c.draw_at,
    'rules_text', c.rules_text,
    'prize_description', c.prize_description,
    'charitable_purpose', c.charitable_purpose,
    'raffle_year_sequence', c.raffle_year_sequence
  ) || case when c.ticket_packages='[]'::jsonb then '{}'::jsonb else jsonb_build_object('ticket_packages',c.ticket_packages) end;
$$;

create or replace function public.campaign_locked_fields(c public.campaigns)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'name', c.name,
    'campaign_type', c.campaign_type,
    'season_id', c.season_id,
    'ticket_price_cents', c.ticket_price_cents,
    'ticket_packages', c.ticket_packages,
    'ticket_prefix', c.ticket_prefix,
    'jurisdiction_mode', c.jurisdiction_mode,
    'timezone', c.timezone,
    'starts_at', c.starts_at,
    'draw_at', c.draw_at,
    'operator_legal_name', c.operator_legal_name,
    'operator_address', c.operator_address,
    'rules_text', c.rules_text,
    'rules_version', c.rules_version,
    'prize_description', c.prize_description,
    'charitable_purpose', c.charitable_purpose,
    'raffle_year_sequence', c.raffle_year_sequence,
    'compliance_confirmed_at', c.compliance_confirmed_at,
    'compliance_confirmed_by', c.compliance_confirmed_by,
    'compliance_confirmation_hash', c.compliance_confirmation_hash,
    'compliance_attestation', c.compliance_attestation
  );
$$;

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
  pricing jsonb;
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
      'amount_cents', previous_sale.amount_cents, 'quantity', previous_sale.quantity, 'replayed', true, 'pricing_snapshot', previous_sale.pricing_snapshot);
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
  pricing := public.campaign_sale_pricing(p_quantity,campaign.ticket_price_cents,campaign.ticket_packages);
  if p_amount_cents <> (pricing->'quote'->>'totalCents')::bigint then
    raise exception 'Amount collected must equal the approved ticket package total.' using errcode = 'check_violation';
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
      'quantity', p_quantity, 'corrects_sale_id', p_corrects_sale_id, 'pricing_snapshot', pricing)), sold_at);

  insert into public.campaign_sales (id, organization_id, campaign_id, participant_id,
    buyer_name, buyer_email, buyer_phone, quantity, amount_cents, payment_method, notes,
    sold_at, created_by, idempotency_key, request_fingerprint, collection_event_id, corrects_sale_id, pricing_snapshot)
  values (sale_id, campaign.organization_id, campaign.id, participant.id,
    buyer_name, buyer_email, buyer_phone, p_quantity, p_amount_cents, payment, notes,
    sold_at, me, request_key, fingerprint, collection_id, p_corrects_sale_id, pricing);

  update public.tickets t set status = 'ISSUED', sale_id = record_campaign_sale.sale_id
  where t.id = any(ticket_ids);

  insert into public.ticket_events (organization_id, campaign_id, ticket_id, event_type,
    participant_id, idempotency_key, metadata, occurred_at)
  select campaign.organization_id, campaign.id, t.id, 'ISSUED', participant.id, record_campaign_sale.request_key,
    jsonb_strip_nulls(jsonb_build_object('sale_id', record_campaign_sale.sale_id, 'collection_event_id', record_campaign_sale.collection_id,
      'allocation_id', t.allocation_id, 'ticket_number', t.ticket_number,
      'corrects_sale_id', p_corrects_sale_id,
      'price_cents', (pricing->'ticketAmountsCents'->>(array_position(ticket_ids,t.id)-1))::bigint,
      'pricing_version', 1)), record_campaign_sale.sold_at
  from public.tickets t where t.id = any(ticket_ids)
  order by t.sequence_number;

  perform set_config('raffle_hub.fundraising_write', prior_write_context, true);
  perform public.set_audit_reason(prior_reason);
  return jsonb_build_object('sale_id', sale_id, 'ticket_numbers', ticket_numbers,
    'amount_cents', p_amount_cents, 'quantity', p_quantity, 'replayed', false, 'pricing_snapshot', pricing);
end;
$$;

create or replace function public.fundraising_campaigns(
  p_organization_id uuid,
  p_view text default 'admin'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  required_permission text;
begin
  required_permission := case p_view
    when 'admin' then 'campaigns.read'
    when 'family' then 'roster.read_own_family'
    when 'team' then 'roster.read_assigned_teams'
    else null end;
  if required_permission is null then
    raise exception 'Unknown fundraising view.' using errcode = 'invalid_parameter_value';
  end if;
  if not public.has_org_permission(p_organization_id, required_permission)
     or not exists (select 1 from public.organizations o
                    where o.id = p_organization_id and o.status = 'active' and o.archived_at is null) then
    raise exception 'Fundraising workspace unavailable.' using errcode = 'insufficient_privilege';
  end if;

  with visible_participants as materialized (
    select cp.* from public.campaign_participants cp
    where cp.organization_id = p_organization_id
      and public.can_read_fundraising_participant(cp.id, p_view)
  ),
  participation as (
    select cp.campaign_id,
      count(*) filter (where cp.status = 'active') as player_count,
      count(distinct cp.team_id) filter (where cp.status = 'active') as team_count
    from visible_participants cp group by cp.campaign_id
  ),
  sales as (
    select s.campaign_id, sum(s.amount_cents) as raised_cents, sum(s.quantity) as tickets_sold
    from public.campaign_sales s
    join visible_participants cp on cp.id = s.participant_id
      and cp.organization_id = s.organization_id and cp.campaign_id = s.campaign_id
    where not exists (select 1 from public.sale_reversals r where r.sale_id = s.id)
    group by s.campaign_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status,
      'ticket_price_cents', c.ticket_price_cents, 'ticket_packages', c.ticket_packages, 'goal_amount_cents', c.goal_amount_cents,
      'player_goal_default_cents', c.player_goal_default_cents,
      'team_goal_default_cents', c.team_goal_default_cents,
      'default_allocation', c.default_allocation, 'ticket_prefix', c.ticket_prefix,
      'starts_at', c.starts_at, 'sales_close_at', c.sales_close_at, 'draw_at', c.draw_at,
      'description', c.description, 'support_email', c.support_email, 'support_phone', c.support_phone
    ),
    'totals', jsonb_build_object(
      'raised_cents', coalesce(s.raised_cents, 0), 'tickets_sold', coalesce(s.tickets_sold, 0),
      'player_count', coalesce(p.player_count, 0), 'team_count', coalesce(p.team_count, 0)
    )
  ) order by case c.status when 'ACTIVE' then 0 when 'READY' then 1 when 'DRAFT' then 2
                           when 'CLOSED' then 3 when 'DRAWN' then 4 else 5 end,
             c.created_at desc, c.id), '[]'::jsonb)
  into result
  from public.campaigns c
  left join participation p on p.campaign_id = c.id
  left join sales s on s.campaign_id = c.id
  where c.organization_id = p_organization_id
    and (p_view = 'admin' or exists (
      select 1 from visible_participants cp where cp.campaign_id = c.id
    ));
  return result;
end;
$$;

create or replace function public.campaign_progress(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_view text default 'admin',
  p_team_id uuid default null,
  p_player_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.campaigns;
  result jsonb;
  required_permission text;
begin
  required_permission := case p_view
    when 'admin' then 'campaigns.read'
    when 'family' then 'roster.read_own_family'
    when 'team' then 'roster.read_assigned_teams'
    else null end;
  if required_permission is null then
    raise exception 'Unknown fundraising view.' using errcode = 'invalid_parameter_value';
  end if;
  if not public.has_org_permission(p_organization_id, required_permission)
     or not exists (select 1 from public.organizations o
                    where o.id = p_organization_id and o.status = 'active' and o.archived_at is null) then
    raise exception 'Fundraising workspace unavailable.' using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.campaigns
  where id = p_campaign_id and organization_id = p_organization_id;
  if not found or (p_view <> 'admin' and not exists (
    select 1 from public.campaign_participants cp
    where cp.organization_id = p_organization_id and cp.campaign_id = p_campaign_id
      and public.can_read_fundraising_participant(cp.id, p_view)
  )) then
    raise exception 'Campaign unavailable.' using errcode = 'insufficient_privilege';
  end if;

  -- Apply the current actor's scope and requested filters BEFORE every metric,
  -- ranking and sale list. An unauthorized filter returns no records/metadata.
  with visible_participants as materialized (
    select cp.*, concat_ws(' ', p.first_name, p.last_name) as player_name, t.name as team_name
    from public.campaign_participants cp
    join public.players p on p.id = cp.player_id and p.organization_id = cp.organization_id
    left join public.teams t on t.id = cp.team_id and t.organization_id = cp.organization_id
    where cp.organization_id = p_organization_id and cp.campaign_id = p_campaign_id
      and public.can_read_fundraising_participant(cp.id, p_view)
      and (p_team_id is null or cp.team_id = p_team_id)
      and (p_player_id is null or cp.player_id = p_player_id)
  ),
  visible_sales as materialized (
    select s.*, cp.player_name,
      exists (select 1 from public.sale_reversals r where r.sale_id = s.id) as reversed
    from public.campaign_sales s
    join visible_participants cp on cp.id = s.participant_id
      and cp.organization_id = s.organization_id and cp.campaign_id = s.campaign_id
  ),
  sale_sums as (
    select s.participant_id,
      coalesce(sum(s.amount_cents) filter (where not s.reversed), 0) as raised_cents,
      coalesce(sum(s.quantity) filter (where not s.reversed), 0) as tickets_sold
    from visible_sales s group by s.participant_id
  ),
  ticket_stats as (
    select t.participant_id,
      count(*) filter (where t.status = 'ALLOCATED') as available_tickets,
      (array_agg(t.ticket_number order by t.sequence_number, t.id))[1] as first_ticket,
      (array_agg(t.ticket_number order by t.sequence_number desc, t.id desc))[1] as last_ticket
    from public.tickets t
    join visible_participants cp on cp.id = t.participant_id
      and cp.organization_id = t.organization_id and cp.campaign_id = t.campaign_id
    group by t.participant_id
  ),
  metrics as materialized (
    select cp.*, coalesce(cp.goal_amount_cents, c.player_goal_default_cents) as effective_goal,
      coalesce(s.raised_cents, 0) as raised_cents, coalesce(s.tickets_sold, 0) as tickets_sold,
      coalesce(ts.available_tickets, 0) as available_tickets, ts.first_ticket, ts.last_ticket
    from visible_participants cp
    left join sale_sums s on s.participant_id = cp.id
    left join ticket_stats ts on ts.participant_id = cp.id
  ),
  team_metrics as (
    select m.team_id, m.team_name,
      coalesce(g.goal_amount_cents, c.team_goal_default_cents) as goal_amount_cents,
      sum(m.raised_cents) as raised_cents, sum(m.tickets_sold) as tickets_sold,
      count(*) filter (where m.status = 'active') as player_count
    from metrics m
    left join public.campaign_team_goals g on g.organization_id = p_organization_id
      and g.campaign_id = p_campaign_id and g.team_id = m.team_id
    where m.team_id is not null
    group by m.team_id, m.team_name, g.goal_amount_cents
  ),
  recent as (
    select s.* from visible_sales s order by s.sold_at desc, s.created_at desc, s.id desc limit 20
  )
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status,
      'ticket_price_cents', c.ticket_price_cents, 'ticket_packages', c.ticket_packages, 'goal_amount_cents', c.goal_amount_cents,
      'player_goal_default_cents', c.player_goal_default_cents,
      'team_goal_default_cents', c.team_goal_default_cents,
      'default_allocation', c.default_allocation, 'ticket_prefix', c.ticket_prefix,
      'starts_at', c.starts_at, 'sales_close_at', c.sales_close_at, 'draw_at', c.draw_at,
      'description', c.description, 'support_email', c.support_email, 'support_phone', c.support_phone
    ),
    'totals', (select jsonb_build_object(
      'raised_cents', coalesce(sum(m.raised_cents), 0),
      'tickets_sold', coalesce(sum(m.tickets_sold), 0),
      'player_count', count(*) filter (where m.status = 'active'),
      'team_count', count(distinct m.team_id) filter (where m.status = 'active')
    ) from metrics m),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'player_id', m.player_id, 'player_name', m.player_name,
      'team_id', m.team_id, 'team_name', m.team_name, 'status', m.status,
      'goal_amount_cents', m.effective_goal, 'raised_cents', m.raised_cents,
      'tickets_sold', m.tickets_sold, 'available_tickets', m.available_tickets,
      'ticket_range', jsonb_build_object('first', m.first_ticket, 'last', m.last_ticket),
      'can_record_sale', coalesce(
        c.status = 'ACTIVE' and c.campaign_type = 'raffle' and m.status = 'active'
        and m.available_tickets > 0 and c.starts_at <= now() and c.sales_close_at > now()
        and exists (select 1 from public.players p where p.id = m.player_id
                    and p.organization_id = p_organization_id and p.status = 'active' and p.archived_at is null)
        and public.has_org_permission(p_organization_id, 'tickets.issue')
        and (public.has_org_permission(p_organization_id, 'organization.manage')
             or (public.has_org_permission(p_organization_id, 'roster.read_own_family')
                 and m.player_id in (select public.my_family_player_ids()))), false)
    ) order by lower(m.player_name), m.player_id) from metrics m), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
      'id', tm.team_id, 'name', tm.team_name, 'goal_amount_cents', tm.goal_amount_cents,
      'raised_cents', tm.raised_cents, 'tickets_sold', tm.tickets_sold, 'player_count', tm.player_count
    ) order by lower(tm.team_name), tm.team_id) from team_metrics tm), '[]'::jsonb),
    'recent_sales', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'participant_id', s.participant_id, 'player_name', s.player_name,
      'quantity', s.quantity, 'amount_cents', s.amount_cents,
      'payment_method', s.payment_method, 'sold_at', s.sold_at, 'reversed', s.reversed,
      -- Associations expose IDs only from the same already-authorized
      -- participant subset. They never expand family/team or tenant scope.
      'corrects_sale_id', (select original.id from visible_sales original
        where original.id = s.corrects_sale_id
          and original.organization_id = p_organization_id
          and original.campaign_id = p_campaign_id
          and original.participant_id = s.participant_id),
      'replacement_sale_id', (select replacement.id from visible_sales replacement
        where replacement.corrects_sale_id = s.id
          and replacement.organization_id = p_organization_id
          and replacement.campaign_id = p_campaign_id
          and replacement.participant_id = s.participant_id),
      'ticket_numbers', coalesce((select jsonb_agg(t.ticket_number order by t.sequence_number, t.id)
        from public.tickets t where t.sale_id = s.id and t.organization_id = p_organization_id
          and t.campaign_id = p_campaign_id), '[]'::jsonb),
      'can_reverse', p_view = 'admin' and not s.reversed and c.status in ('ACTIVE', 'CLOSED')
        and public.has_org_permission(p_organization_id, 'tickets.void')
        and public.has_org_permission(p_organization_id, 'adjustments.approve')
    ) order by s.sold_at desc, s.created_at desc, s.id desc) from recent s), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.public_seller_page(p_token text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('organization',o.name,'campaign',c.name,'description',c.description,'rules',c.rules_text,
 'ticket_price_cents',c.ticket_price_cents, 'ticket_packages', c.ticket_packages,'sales_close_at',c.sales_close_at,'draw_at',c.draw_at,'timezone',c.timezone,
 'support_email',c.support_email,'support_phone',c.support_phone,'requests_open',true)
 from public.campaign_seller_links l join public.campaigns c on c.id=l.campaign_id
 join public.organizations o on o.id=l.organization_id join public.campaign_participants cp on cp.id=l.participant_id
 join public.players p on p.id=cp.player_id
 where length(p_token)=64 and l.opaque_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 and l.revoked_at is null and l.expires_at>now() and c.status='ACTIVE' and c.starts_at<=now() and c.sales_close_at>now()
 and o.status='active' and cp.status='active' and p.status='active' and p.archived_at is null
 -- A removed membership/guardian link invalidates previously shared links too.
 and exists(select 1 from public.organization_members m join public.organization_member_roles mr on mr.member_id=m.id
 join public.role_permissions rp on rp.role_key=mr.role_key
 where m.organization_id=l.organization_id and m.user_id=l.seller_user_id and m.status='active' and rp.permission_key='tickets.issue')
 and exists(select 1 from public.organization_members m join public.organization_member_roles mr on mr.member_id=m.id join public.role_permissions rp on rp.role_key=mr.role_key where m.organization_id=l.organization_id and m.user_id=l.seller_user_id and m.status='active' and rp.permission_key='roster.read_own_family')
 and exists(select 1 from public.organization_members m join public.guardian_user_links gul on gul.member_id=m.id and gul.organization_id=m.organization_id
 join public.guardians g on g.id=gul.guardian_id and g.organization_id=gul.organization_id
 where m.user_id=l.seller_user_id and m.organization_id=l.organization_id and m.status='active' and gul.archived_at is null and g.archived_at is null and (g.household_id=p.household_id or exists(select 1 from public.player_guardians pg where pg.player_id=p.id and pg.guardian_id=g.id)));
$$;

create or replace function public.sale_ticket_receipt(p_organization_id uuid, p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  s public.campaign_sales;
  c public.campaigns;
  reversed boolean;
  tickets jsonb;
  prize_description text;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select * into s from public.campaign_sales
  where id=p_sale_id and organization_id=p_organization_id;
  if not found or not public.can_read_fundraising_sale(s.id) then raise insufficient_privilege; end if;
  select * into c from public.campaigns where id=s.campaign_id and organization_id=p_organization_id;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;

  select exists(select 1 from public.sale_reversals r where r.sale_id=s.id) into reversed;
  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_number',t.ticket_number,
    'status',t.status,
    'price_cents', case when s.pricing_snapshot is null then c.ticket_price_cents
      else (s.pricing_snapshot->'ticketAmountsCents'->>((t.sale_position-1)::integer))::bigint end
  ) order by t.sequence_number,t.id),'[]'::jsonb)
  into tickets
  from (select tx.*, row_number() over (order by tx.sequence_number,tx.id) as sale_position
    from public.tickets tx where tx.organization_id=p_organization_id and tx.campaign_id=s.campaign_id and tx.sale_id=s.id) t;

  prize_description := coalesce(
    nullif(btrim(c.prize_description),''),
    public.campaign_prize_ticket_description(c.id)
  );

  return jsonb_build_object(
    'sale_id',s.id,
    'campaign_id',c.id,
    'campaign_name',c.name,
    'buyer_name',s.buyer_name,
    'sold_at',s.sold_at,
    'amount_cents',s.amount_cents,
    'quantity',s.quantity,
    'payment_method',s.payment_method,
    'reversed',reversed,
    'tickets',tickets,
    'operator_legal_name',c.operator_legal_name,
    'operator_address',c.operator_address,
    'ticket_price_cents',c.ticket_price_cents,
    'ticket_packages',c.ticket_packages,
    'pricing_snapshot',s.pricing_snapshot,
    'prize_description',prize_description,
    'charitable_purpose',c.charitable_purpose,
    'draw_at',c.draw_at,
    'timezone',c.timezone,
    'support_email',c.support_email,
    'support_phone',c.support_phone,
    'rules_text',c.rules_text
  );
end;
$$;

create or replace function public.drawing_eligible_entries(p_organization_id uuid,p_campaign_id uuid,p_snapshot_id uuid)
returns setof public.drawing_snapshot_entries language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select p_snapshot_id,t.organization_id,t.campaign_id,t.id,t.ticket_number,t.sequence_number,
    s.id,cp.id,cp.player_id,btrim(p.first_name||' '||p.last_name),cp.team_id,tm.name,
    s.created_by,s.buyer_name,s.buyer_email,s.buyer_phone,s.sold_at,case when s.pricing_snapshot is null then s.amount_cents/s.quantity
      else (s.pricing_snapshot->'ticketAmountsCents'->>((row_number() over (partition by s.id order by t.sequence_number,t.id)-1)::integer))::bigint end,
    repeat('0',64)
  from public.tickets t
  join public.campaign_sales s on s.id=t.sale_id and s.organization_id=t.organization_id and s.campaign_id=t.campaign_id and s.participant_id=t.participant_id
  join public.campaign_participants cp on cp.id=s.participant_id and cp.organization_id=s.organization_id and cp.campaign_id=s.campaign_id
  join public.players p on p.id=cp.player_id and p.organization_id=cp.organization_id
  left join public.teams tm on tm.id=cp.team_id and tm.organization_id=cp.organization_id
  where t.organization_id=p_organization_id and t.campaign_id=p_campaign_id and t.status='ISSUED'
    and not exists(select 1 from public.sale_reversals r where r.sale_id=s.id and r.organization_id=s.organization_id and r.campaign_id=s.campaign_id)
  order by t.sequence_number,t.id;
$$;

create or replace function public.drawing_readiness(p_organization_id uuid,p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.campaigns; blockers text[]:='{}'; warnings text[]:='{}'; n bigint; value bigint; chains_ok boolean;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.read');
  select * into c from public.campaigns where id=p_campaign_id and organization_id=p_organization_id;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.campaign_type<>'raffle' or c.archived_at is not null then blockers:=array_append(blockers,'Use an unarchived raffle campaign.'); end if;
  if c.status<>'CLOSED' then blockers:=array_append(blockers,'Close campaign sales before freezing drawing entries.'); end if;
  if public.drawing_current_snapshot(c.id) is not null then blockers:=array_append(blockers,'A drawing snapshot is already frozen.'); end if;
  if c.ticket_price_cents is null or c.ticket_prefix is null or c.draw_at is null
    or nullif(btrim(c.operator_legal_name),'') is null or c.operator_address is null
    or c.rules_text is null or nullif(btrim(c.rules_text),'') is null
    or c.jurisdiction_mode is null or (nullif(btrim(c.support_email),'') is null and nullif(btrim(c.support_phone),'') is null) then
    blockers:=array_append(blockers,'Required locked raffle disclosures are incomplete.'); end if;
  if exists(select 1 from public.tickets t left join public.campaign_sales s on s.id=t.sale_id and s.organization_id=t.organization_id and s.campaign_id=t.campaign_id and s.participant_id=t.participant_id
    where t.campaign_id=c.id and t.status='ISSUED' and (s.id is null or exists(select 1 from public.sale_reversals r where r.sale_id=t.sale_id)))
    or exists(select 1 from public.campaign_sales s where s.campaign_id=c.id and not exists(select 1 from public.sale_reversals r where r.sale_id=s.id)
      and ((select count(*) from public.tickets t where t.sale_id=s.id and t.status='ISSUED')<>s.quantity
        or not public.sale_pricing_consistent(s,c)
        or (s.pricing_snapshot is not null and not exists(select 1 from public.money_events pm where pm.id=s.collection_event_id and pm.metadata->'pricing_snapshot'=s.pricing_snapshot))
        or not exists(select 1 from public.money_events m where m.id=s.collection_event_id and m.organization_id=s.organization_id and m.campaign_id=s.campaign_id and m.participant_id=s.participant_id and m.event_type='SALE_COLLECTED' and m.amount_cents=s.amount_cents and m.payment_method=s.payment_method)))
    or exists(select 1 from public.tickets t where t.campaign_id=c.id and t.status='ISSUED'
      and not exists(select 1 from public.ticket_events e where e.ticket_id=t.id and e.organization_id=t.organization_id
        and e.campaign_id=t.campaign_id and e.participant_id=t.participant_id and e.event_type='ISSUED' and e.metadata->>'sale_id'=t.sale_id::text))
    or exists(select 1 from public.sale_reversals r join public.campaign_sales s on s.id=r.sale_id where r.campaign_id=c.id
      and ((select count(*) from public.tickets t where t.sale_id=s.id and t.status='VOIDED')<>s.quantity
        or not exists(select 1 from public.money_events m where m.id=r.reversal_event_id and m.organization_id=r.organization_id
          and m.campaign_id=r.campaign_id and m.participant_id=s.participant_id and m.event_type='REVERSAL'
          and m.reverses_event_id=s.collection_event_id and m.amount_cents=-s.amount_cents and m.approved_by=r.approved_by))) then
    blockers:=array_append(blockers,'Issued tickets, sale facts, or collection references are inconsistent.'); end if;
  select count(*),coalesce(sum(face_value_cents),0) into n,value from public.drawing_eligible_entries(p_organization_id,p_campaign_id,gen_random_uuid());
  if n=0 then blockers:=array_append(blockers,'At least one eligible issued ticket is required.'); end if;
  if exists(select 1 from public.tickets where campaign_id=c.id group by ticket_number having count(*)>1) then blockers:=array_append(blockers,'Duplicate campaign ticket numbers exist.'); end if;
  select bool_and(v.ok) into chains_ok from (
    select ok from public.verify_hash_chain('campaign_events','campaign_id',c.id)
    union all select ok from public.verify_hash_chain('ticket_events','campaign_id',c.id)
    union all select ok from public.verify_hash_chain('money_events','campaign_id',c.id)
    union all select ok from public.verify_hash_chain('audit_events','organization_id',p_organization_id)) v;
  if not coalesce(chains_ok,false) then blockers:=array_append(blockers,'Campaign or organization ledger verification failed.'); end if;
  warnings:=array_append(warnings,'Confirm approved prize readiness and physical/external drawing arrangements when freezing.');
  warnings:=array_append(warnings,'Seller collections do not confirm organization receipt or check clearance; outstanding funds do not change ticket eligibility.');
  if exists(select 1 from public.drawing_eligible_entries(p_organization_id,p_campaign_id,gen_random_uuid()) e where e.buyer_email is null and e.buyer_phone is null) then
    warnings:=array_append(warnings,'Some eligible buyers have no email or phone contact.'); end if;
  return jsonb_build_object('campaign_id',c.id,'status',c.status,'ready',cardinality(blockers)=0,'blocking',to_jsonb(blockers),'warnings',to_jsonb(warnings),
    'eligible_ticket_count',n,'total_face_value_cents',value,'current_snapshot_id',public.drawing_current_snapshot(c.id));
end; $$;

create or replace function public.freeze_drawing(p_organization_id uuid,p_campaign_id uuid,p_idempotency_key text,p_reason text,p_prize_readiness_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare c public.campaigns; s public.drawing_snapshots; prior public.drawing_snapshots; readiness jsonb; entries_hash text; fingerprint text;
  prior_write text:=coalesce(current_setting('raffle_hub.drawing_write',true),''); prior_reason text:=current_setting('raffle_hub.reason',true);
begin
  c:=public.drawing_lock_campaign(p_organization_id,p_campaign_id,'drawing.manage');
  perform public.drawing_validate_request(p_idempotency_key,p_reason);
  fingerprint:=encode(extensions.digest(jsonb_build_object('organization_id',p_organization_id,'campaign_id',p_campaign_id,'reason',btrim(p_reason),'prize_readiness_confirmed',p_prize_readiness_confirmed)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('drawing-freeze:'||p_organization_id::text||':'||auth.uid()::text||':'||btrim(p_idempotency_key),0));
  select * into s from public.drawing_snapshots where organization_id=p_organization_id and created_by=auth.uid() and idempotency_key=btrim(p_idempotency_key);
  if found then
    if s.request_fingerprint<>fingerprint then raise exception 'This idempotency key was already used for a different drawing freeze.' using errcode='unique_violation'; end if;
    return jsonb_build_object('snapshot_id',s.id,'version',s.version,'count',s.ticket_count,'total_face_value_cents',s.total_face_value_cents,'manifest_hash',s.manifest_hash,'replayed',true);
  end if;
  if not coalesce(p_prize_readiness_confirmed,false) then raise exception 'Confirm approved prizes and drawing readiness before freezing.' using errcode='check_violation'; end if;
  readiness:=public.drawing_readiness(p_organization_id,p_campaign_id);
  if not (readiness->>'ready')::boolean then raise exception 'Drawing is not ready: %',readiness->'blocking' using errcode='check_violation'; end if;
  -- Roster labels are frozen consistently; attribution IDs are enrollment facts.
  perform 1 from public.players p where p.id in (select cp.player_id from public.campaign_participants cp where cp.campaign_id=c.id) order by p.id for share;
  perform 1 from public.teams t where t.id in (select cp.team_id from public.campaign_participants cp where cp.campaign_id=c.id) order by t.id for share;
  select * into prior from public.drawing_snapshots where campaign_id=c.id order by version desc limit 1;
  s.id:=gen_random_uuid(); s.organization_id:=p_organization_id; s.campaign_id:=c.id;
  s.version:=coalesce(prior.version,0)+1; s.supersedes_snapshot_id:=prior.id; s.created_at:=clock_timestamp(); s.created_by:=auth.uid();
  s.reason:=btrim(p_reason); s.idempotency_key:=btrim(p_idempotency_key); s.request_fingerprint:=fingerprint; s.prize_readiness_confirmed:=true;
  s.disclosures:=jsonb_build_object('campaign_name',c.name,'ticket_price_cents',c.ticket_price_cents,'ticket_packages',c.ticket_packages,'ticket_prefix',c.ticket_prefix,
    'jurisdiction_mode',c.jurisdiction_mode,'timezone',c.timezone,'starts_at',c.starts_at,'sales_close_at',c.sales_close_at,'draw_at',c.draw_at,
    'operator_legal_name',c.operator_legal_name,'operator_address',c.operator_address,'support_email',c.support_email,'support_phone',c.support_phone,
    'rules_text',c.rules_text,'rules_version',c.rules_version,'approved_prize_readiness',true);
  s.source_ledger_heads:=public.drawing_source_heads(p_organization_id,c.id);
  select count(*),sum(e.face_value_cents),encode(extensions.digest(string_agg(encode(extensions.digest((to_jsonb(e)-'entry_hash')::text,'sha256'),'hex'),'' order by e.sequence_number,e.ticket_id),'sha256'),'hex')
    into s.ticket_count,s.total_face_value_cents,entries_hash from public.drawing_eligible_entries(p_organization_id,c.id,s.id) e;
  s.manifest:=public.drawing_manifest(s,entries_hash); s.manifest_hash:=encode(extensions.digest(s.manifest::text,'sha256'),'hex');
  perform set_config('raffle_hub.drawing_write',c.id::text,true); perform public.set_audit_reason(s.reason);
  insert into public.drawing_snapshots select (s).*;
  insert into public.drawing_snapshot_entries select * from public.drawing_eligible_entries(p_organization_id,c.id,s.id);
  insert into public.drawing_events(organization_id,campaign_id,snapshot_id,event_type,reason,idempotency_key,request_fingerprint,metadata)
    values(p_organization_id,c.id,s.id,'FROZEN',s.reason,s.idempotency_key,fingerprint,jsonb_build_object('version',s.version,'manifest_hash',s.manifest_hash,'ticket_count',s.ticket_count));
  if not (public.drawing_integrity(s.id)->>'ok')::boolean then raise exception 'Frozen drawing verification failed.' using errcode='check_violation'; end if;
  perform set_config('raffle_hub.drawing_write',prior_write,true); perform public.set_audit_reason(prior_reason);
  return jsonb_build_object('snapshot_id',s.id,'version',s.version,'count',s.ticket_count,'total_face_value_cents',s.total_face_value_cents,'manifest_hash',s.manifest_hash,'replayed',false);
end; $$;

-- CREATE OR REPLACE preserves the existing access control lists. Reassert the
-- internal-only new helpers; do not grant anonymous access or broaden seller roles.
revoke all on function public.quote_campaign_ticket_packages(integer,bigint,jsonb),
  public.campaign_sale_pricing(integer,bigint,jsonb),
  public.sale_pricing_consistent(public.campaign_sales,public.campaigns)
  from public,anon,authenticated,service_role;
