-- =============================================================================
-- Controlled pilot compliance: Texas CREA launch attestation + printable ticket
-- disclosure projection. Additive; existing campaigns remain readable and their
-- lifecycle/history is not rewritten.
-- =============================================================================

alter table public.campaigns
  add column prize_description text check (prize_description is null or length(btrim(prize_description)) between 3 and 4000),
  add column charitable_purpose text check (charitable_purpose is null or length(btrim(charitable_purpose)) between 3 and 2000),
  add column raffle_year_sequence smallint check (raffle_year_sequence is null or raffle_year_sequence between 1 and 4),
  add column compliance_confirmed_at timestamptz,
  add column compliance_confirmed_by uuid references auth.users(id) on delete set null,
  add column compliance_confirmation_hash text check (compliance_confirmation_hash is null or compliance_confirmation_hash ~ '^[a-f0-9]{64}$');

comment on column public.campaigns.prize_description is
  'Locked general description of raffle prize(s), used on issued ticket artifacts.';
comment on column public.campaigns.charitable_purpose is
  'Approved charitable use of raffle proceeds for operator compliance review.';
comment on column public.campaigns.raffle_year_sequence is
  'Operator-attested raffle number in the legal entity calendar year (1-4 for Texas CREA mode).';
comment on column public.campaigns.compliance_confirmation_hash is
  'SHA-256 fingerprint of the legal operator + ticket-critical compliance payload at director attestation.';

create or replace function public.campaign_compliance_required(p_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((o.platform_config->>'texas_crea_compliance_required')::boolean, false)
  from public.organizations o
  where o.id = p_organization_id;
$$;

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
  );
$$;

create or replace function public.campaign_compliance_hash(c public.campaigns, o public.organizations)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(public.campaign_compliance_payload(c,o)::text, 'sha256'), 'hex');
$$;

-- Extend the immutable post-activation disclosure set.
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
    'compliance_confirmation_hash', c.compliance_confirmation_hash
  );
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
  );
$$;

create or replace function public.guard_campaign_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  transitioning boolean := coalesce(current_setting('raffle_hub.campaign_transition', true), '') = new.id::text;
  confirming boolean := coalesce(current_setting('raffle_hub.compliance_confirmation', true), '') = new.id::text;
  old_locked jsonb;
  new_locked jsonb;
  diff text[];
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'New campaigns start as DRAFT.' using errcode = 'check_violation';
    end if;
    if new.compliance_confirmed_at is not null
       or new.compliance_confirmed_by is not null
       or new.compliance_confirmation_hash is not null then
      raise exception 'Compliance must be confirmed through the director attestation.' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'A campaign can’t move to another organization.' using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status and not transitioning then
    raise exception 'Campaign status can only change through a lifecycle transition.' using errcode = 'insufficient_privilege';
  end if;

  if old.status in ('CLOSED', 'DRAWN', 'ARCHIVED') and not transitioning then
    raise exception 'This campaign is % and can no longer be edited.', lower(old.status) using errcode = 'check_violation';
  end if;

  if not confirming and (
    new.compliance_confirmed_at is distinct from old.compliance_confirmed_at
    or new.compliance_confirmed_by is distinct from old.compliance_confirmed_by
    or new.compliance_confirmation_hash is distinct from old.compliance_confirmation_hash
  ) then
    raise exception 'Compliance confirmation can only change through the director attestation.' using errcode = 'insufficient_privilege';
  end if;

  -- Any pre-activation change to the compliance payload invalidates the prior
  -- attestation. The hash also detects organization legal-name/address changes.
  if old.status in ('DRAFT','READY') and not confirming
     and public.campaign_compliance_fields(new) is distinct from public.campaign_compliance_fields(old) then
    new.compliance_confirmed_at := null;
    new.compliance_confirmed_by := null;
    new.compliance_confirmation_hash := null;
  end if;

  if old.status in ('ACTIVE', 'CLOSED', 'DRAWN', 'ARCHIVED') then
    old_locked := public.campaign_locked_fields(old);
    new_locked := public.campaign_locked_fields(new);
    select coalesce(array_agg(key order by key), '{}') into diff
    from jsonb_each(new_locked) n where n.value is distinct from old_locked -> key;
    if cardinality(diff) > 0 then
      raise exception 'Locked after activation: %', array_to_string(diff, ', ') using errcode = 'check_violation';
    end if;
  end if;

  if new.archived_at is distinct from old.archived_at and not transitioning then
    raise exception 'Archive a campaign through its lifecycle.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.campaign_readiness(p_campaign_id uuid)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.campaigns;
  o public.organizations;
  missing text[] := '{}';
  compliance_required boolean;
  expected_hash text;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then
    return array['campaign not found'];
  end if;
  select * into o from public.organizations where id = c.organization_id;

  if c.ticket_price_cents is null then missing := array_append(missing, 'ticket price'::text); end if;
  if c.ticket_prefix is null then missing := array_append(missing, 'ticket number prefix'::text); end if;
  if c.starts_at is null then missing := array_append(missing, 'sales start date'::text); end if;
  if c.sales_close_at is null then missing := array_append(missing, 'sales close date'::text); end if;
  if c.draw_at is null then missing := array_append(missing, 'drawing date'::text); end if;
  if coalesce(o.legal_name, o.name) is null then missing := array_append(missing, 'organization legal name'::text); end if;
  if o.address_line1 is null or o.city is null or o.region is null then missing := array_append(missing, 'organization legal address'::text); end if;
  if coalesce(c.support_email, o.support_email, c.support_phone, o.support_phone) is null then missing := array_append(missing, 'support contact'::text); end if;

  compliance_required := coalesce(public.campaign_compliance_required(c.organization_id), false);
  if compliance_required and c.campaign_type = 'raffle' then
    if coalesce(o.jurisdiction_profile,'') <> 'TEXAS_CREA_OFFLINE_PAYMENT' then
      missing := array_append(missing, 'Texas CREA jurisdiction profile'::text);
    end if;
    if nullif(btrim(coalesce(c.prize_description,'')), '') is null then
      missing := array_append(missing, 'prize description'::text);
    end if;
    if nullif(btrim(coalesce(c.charitable_purpose,'')), '') is null then
      missing := array_append(missing, 'charitable purpose'::text);
    end if;
    if c.raffle_year_sequence is null then
      missing := array_append(missing, 'raffle calendar-year number'::text);
    end if;
    expected_hash := public.campaign_compliance_hash(c,o);
    if c.compliance_confirmed_at is null
       or c.compliance_confirmed_by is null
       or c.compliance_confirmation_hash is distinct from expected_hash then
      missing := array_append(missing, 'current Texas compliance attestation'::text);
    end if;
  end if;
  return missing;
end;
$$;

create or replace function public.confirm_campaign_compliance(p_campaign_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  c public.campaigns;
  o public.organizations;
  reason text := nullif(btrim(p_reason), '');
  confirmation_hash text;
  me uuid := auth.uid();
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  perform public.assert_org_permission(c.organization_id, 'campaigns.activate');
  if me is null then raise exception 'A signed-in director is required.' using errcode='insufficient_privilege'; end if;
  if c.status not in ('DRAFT','READY') then
    raise exception 'Compliance must be confirmed before campaign activation.' using errcode='check_violation';
  end if;
  if not coalesce(public.campaign_compliance_required(c.organization_id),false) then
    raise exception 'Texas compliance enforcement is not enabled for this organization.' using errcode='check_violation';
  end if;
  select * into o from public.organizations where id=c.organization_id;
  if coalesce(o.jurisdiction_profile,'') <> 'TEXAS_CREA_OFFLINE_PAYMENT' then
    raise exception 'Texas CREA jurisdiction profile is required.' using errcode='check_violation';
  end if;
  if reason is null or length(reason) not between 3 and 500 then
    raise exception 'A compliance attestation reason of 3–500 characters is required.' using errcode='check_violation';
  end if;
  if c.ticket_price_cents is null or c.draw_at is null
     or nullif(btrim(coalesce(c.prize_description,'')),'') is null
     or nullif(btrim(coalesce(c.charitable_purpose,'')),'') is null
     or c.raffle_year_sequence is null
     or coalesce(o.legal_name,o.name) is null
     or o.address_line1 is null or o.city is null or o.region is null then
    raise exception 'Complete the legal operator, ticket, prize, purpose, and raffle-year fields before attestation.'
      using errcode='check_violation';
  end if;

  confirmation_hash := public.campaign_compliance_hash(c,o);
  perform set_config('raffle_hub.compliance_confirmation', c.id::text, true);
  perform public.set_audit_reason(reason);
  update public.campaigns
    set compliance_confirmed_at=clock_timestamp(),
        compliance_confirmed_by=me,
        compliance_confirmation_hash=confirmation_hash
  where id=c.id;
  perform set_config('raffle_hub.compliance_confirmation', '', true);
  perform public.set_audit_reason(null);

  return jsonb_build_object(
    'campaign_id', c.id,
    'confirmed_at', (select compliance_confirmed_at from public.campaigns where id=c.id),
    'confirmed_by', me,
    'confirmation_hash', confirmation_hash
  );
end;
$$;

-- Authorized family/admin ticket artifact projection. No public token access and
-- no additional sale/ticket mutation authority.
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
    'status',t.status
  ) order by t.sequence_number,t.id),'[]'::jsonb)
  into tickets
  from public.tickets t
  where t.organization_id=p_organization_id and t.campaign_id=s.campaign_id and t.sale_id=s.id;

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
    'prize_description',c.prize_description,
    'charitable_purpose',c.charitable_purpose,
    'draw_at',c.draw_at,
    'timezone',c.timezone,
    'support_email',c.support_email,
    'support_phone',c.support_phone,
    'rules_text',c.rules_text
  );
end;
$$;

revoke all on function public.campaign_compliance_required(uuid),
  public.confirm_campaign_compliance(uuid,text),
  public.sale_ticket_receipt(uuid,uuid) from public, anon;
revoke all on function public.campaign_compliance_payload(public.campaigns,public.organizations),
  public.campaign_compliance_hash(public.campaigns,public.organizations),
  public.campaign_compliance_fields(public.campaigns) from public,anon;
grant execute on function public.campaign_compliance_required(uuid),
  public.campaign_compliance_payload(public.campaigns,public.organizations),
  public.campaign_compliance_hash(public.campaigns,public.organizations),
  public.campaign_compliance_fields(public.campaigns),
  public.confirm_campaign_compliance(uuid,text),
  public.sale_ticket_receipt(uuid,uuid) to authenticated;
