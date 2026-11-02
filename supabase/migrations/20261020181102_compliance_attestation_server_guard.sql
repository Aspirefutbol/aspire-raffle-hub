-- =============================================================================
-- Controlled pilot compliance hardening: require explicit director attestation
-- confirmations at the database boundary. Additive follow-up; do not rewrite the
-- already-versioned compliance foundation migration.
-- =============================================================================

alter table public.campaigns
  add column compliance_attestation jsonb;

comment on column public.campaigns.compliance_attestation is
  'Immutable director attestation facts recorded with the current compliance confirmation.';

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
    'compliance_confirmation_hash', c.compliance_confirmation_hash,
    'compliance_attestation', c.compliance_attestation
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
       or new.compliance_confirmation_hash is not null
       or new.compliance_attestation is not null then
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
    or new.compliance_attestation is distinct from old.compliance_attestation
  ) then
    raise exception 'Compliance confirmation can only change through the director attestation.' using errcode = 'insufficient_privilege';
  end if;

  if old.status in ('DRAFT','READY') and not confirming
     and public.campaign_compliance_fields(new) is distinct from public.campaign_compliance_fields(old) then
    new.compliance_confirmed_at := null;
    new.compliance_confirmed_by := null;
    new.compliance_confirmation_hash := null;
    new.compliance_attestation := null;
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

drop function if exists public.confirm_campaign_compliance(uuid,text);

create function public.confirm_campaign_compliance(
  p_campaign_id uuid,
  p_reason text,
  p_entity_confirmed boolean,
  p_raffle_count_confirmed boolean,
  p_prize_sales_confirmed boolean
)
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
  attestation jsonb;
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
  if p_entity_confirmed is distinct from true
     or p_raffle_count_confirmed is distinct from true
     or p_prize_sales_confirmed is distinct from true then
    raise exception 'All Texas compliance confirmations are required.' using errcode='check_violation';
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

  attestation := jsonb_build_object(
    'entity_eligibility_and_name_change_evidence_reviewed', true,
    'calendar_year_count_and_charitable_use_reviewed', true,
    'prize_possession_sales_promotion_and_compensation_restrictions_reviewed', true
  );
  confirmation_hash := public.campaign_compliance_hash(c,o);
  perform set_config('raffle_hub.compliance_confirmation', c.id::text, true);
  perform public.set_audit_reason(reason);
  update public.campaigns
    set compliance_confirmed_at=clock_timestamp(),
        compliance_confirmed_by=me,
        compliance_confirmation_hash=confirmation_hash,
        compliance_attestation=attestation
  where id=c.id;
  perform set_config('raffle_hub.compliance_confirmation', '', true);
  perform public.set_audit_reason(null);

  return jsonb_build_object(
    'campaign_id', c.id,
    'confirmed_at', (select compliance_confirmed_at from public.campaigns where id=c.id),
    'confirmed_by', me,
    'confirmation_hash', confirmation_hash,
    'attestation', attestation
  );
end;
$$;

revoke all on function public.confirm_campaign_compliance(uuid,text,boolean,boolean,boolean)
  from public, anon;
grant execute on function public.confirm_campaign_compliance(uuid,text,boolean,boolean,boolean)
  to authenticated;
