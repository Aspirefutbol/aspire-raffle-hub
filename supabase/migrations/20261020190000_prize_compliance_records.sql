-- =============================================================================
-- Controlled pilot prize compliance records.
-- Texas CREA pilot scope: non-cash prizes only; residential dwelling prizes are
-- deferred to a separate legal/product path. Purchased prizes are capped at
-- $75,000. Every active prize must have possession/bond evidence before the
-- director can attest or activate the campaign.
-- =============================================================================

create table public.campaign_prizes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null check (length(btrim(description)) between 3 and 2000),
  fair_value_cents bigint not null check (fair_value_cents between 1 and 1000000000),
  source text not null check (source in ('DONATED','PURCHASED')),
  possession_basis text not null check (possession_basis in ('OWNED_OR_POSSESSED','BONDED')),
  evidence_ref text not null check (length(btrim(evidence_ref)) between 3 and 1000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  unique (id,organization_id,campaign_id),
  foreign key (campaign_id,organization_id) references public.campaigns(id,organization_id)
);

comment on table public.campaign_prizes is
  'Controlled-pilot raffle prize compliance records. No cash/residential prize path is supported.';
comment on column public.campaign_prizes.evidence_ref is
  'Private operator reference to donation/purchase/possession or bond evidence; not exposed on public ticket artifact.';

create index campaign_prizes_campaign_idx
  on public.campaign_prizes(campaign_id,archived_at,created_at,id);

create trigger campaign_prizes_set_updated_at before update on public.campaign_prizes
  for each row execute function public.set_updated_at();
create trigger campaign_prizes_set_actor before insert or update on public.campaign_prizes
  for each row execute function public.set_actor_columns();
create trigger campaign_prizes_audit after insert or update on public.campaign_prizes
  for each row execute function public.audit_row_change('CAMPAIGN_PRIZE');
create trigger campaign_prizes_no_delete before delete on public.campaign_prizes
  for each row execute function public.prevent_hard_delete();

alter table public.campaign_prizes enable row level security;
revoke insert,update,delete on public.campaign_prizes from anon,authenticated,service_role;
grant select on public.campaign_prizes to authenticated;
create policy campaign_prizes_select on public.campaign_prizes for select to authenticated
using (public.has_org_permission(organization_id,'campaigns.read'));

create or replace function public.campaign_prize_ticket_description(p_campaign_id uuid)
returns text
language sql
stable
set search_path=''
as $$
  select string_agg(
    p.name || ': ' || p.description ||
    case when p.fair_value_cents > 0
      then ' (estimated value $' || trim(to_char(p.fair_value_cents / 100.0,'FM9999999990.00')) || ')'
      else '' end,
    E'\n'
    order by p.created_at,p.id
  )
  from public.campaign_prizes p
  where p.campaign_id=p_campaign_id and p.archived_at is null;
$$;

create or replace function public.invalidate_campaign_compliance(p_campaign_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id=p_campaign_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.status not in ('DRAFT','READY') then
    raise exception 'Prize compliance records are locked after activation.' using errcode='check_violation';
  end if;
  if c.compliance_confirmed_at is null and c.compliance_confirmation_hash is null
     and c.compliance_attestation is null then return; end if;
  perform set_config('raffle_hub.compliance_confirmation',c.id::text,true);
  perform public.set_audit_reason(coalesce(nullif(btrim(p_reason),''),'Prize compliance changed; re-attestation required'));
  update public.campaigns
    set compliance_confirmed_at=null,
        compliance_confirmed_by=null,
        compliance_confirmation_hash=null,
        compliance_attestation=null
  where id=c.id;
  perform set_config('raffle_hub.compliance_confirmation','',true);
  perform public.set_audit_reason(null);
end;
$$;

create or replace function public.upsert_campaign_prize(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_prize_id uuid,
  p_name text,
  p_description text,
  p_fair_value_cents bigint,
  p_source text,
  p_possession_basis text,
  p_evidence_ref text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare c public.campaigns; prize_id uuid := coalesce(p_prize_id,gen_random_uuid());
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into c from public.campaigns
   where id=p_campaign_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.status not in ('DRAFT','READY') then
    raise exception 'Prize compliance records are locked after activation.' using errcode='check_violation';
  end if;
  if length(btrim(coalesce(p_name,''))) not between 1 and 200
     or length(btrim(coalesce(p_description,''))) not between 3 and 2000
     or p_fair_value_cents is null or p_fair_value_cents < 1
     or p_source not in ('DONATED','PURCHASED')
     or p_possession_basis not in ('OWNED_OR_POSSESSED','BONDED')
     or length(btrim(coalesce(p_evidence_ref,''))) not between 3 and 1000 then
    raise exception 'Complete all prize compliance fields.' using errcode='check_violation';
  end if;
  if p_source='PURCHASED' and p_fair_value_cents > 7500000 then
    raise exception 'A purchased controlled-pilot prize cannot exceed $75,000.' using errcode='check_violation';
  end if;

  if p_prize_id is null then
    insert into public.campaign_prizes(
      id,organization_id,campaign_id,name,description,fair_value_cents,source,possession_basis,evidence_ref
    ) values(
      prize_id,p_organization_id,p_campaign_id,btrim(p_name),btrim(p_description),
      p_fair_value_cents,p_source,p_possession_basis,btrim(p_evidence_ref)
    );
  else
    update public.campaign_prizes set
      name=btrim(p_name),description=btrim(p_description),fair_value_cents=p_fair_value_cents,
      source=p_source,possession_basis=p_possession_basis,evidence_ref=btrim(p_evidence_ref)
    where id=p_prize_id and organization_id=p_organization_id and campaign_id=p_campaign_id
      and archived_at is null;
    if not found then raise exception 'Prize not found.' using errcode='no_data_found'; end if;
  end if;
  perform public.invalidate_campaign_compliance(c.id,'Prize compliance record changed; re-attestation required');
  return prize_id;
end;
$$;

create or replace function public.archive_campaign_prize(
  p_organization_id uuid,p_prize_id uuid,p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare p public.campaign_prizes; c public.campaigns; reason text:=nullif(btrim(p_reason),'');
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into p from public.campaign_prizes
   where id=p_prize_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Prize not found.' using errcode='no_data_found'; end if;
  select * into c from public.campaigns where id=p.campaign_id for update;
  if c.status not in ('DRAFT','READY') then
    raise exception 'Prize compliance records are locked after activation.' using errcode='check_violation';
  end if;
  if reason is null or length(reason) not between 3 and 500 then
    raise exception 'A removal reason of 3–500 characters is required.' using errcode='check_violation';
  end if;
  if p.archived_at is not null then return; end if;
  perform public.set_audit_reason(reason);
  update public.campaign_prizes set archived_at=clock_timestamp(),archived_by=auth.uid() where id=p.id;
  perform public.set_audit_reason(null);
  perform public.invalidate_campaign_compliance(c.id,'Prize removed; re-attestation required');
end;
$$;

create or replace function public.campaign_readiness(p_campaign_id uuid)
returns text[]
language plpgsql
stable
set search_path=''
as $$
declare
  c public.campaigns;
  o public.organizations;
  missing text[] := '{}';
  compliance_required boolean;
  expected_hash text;
  prize_count integer;
  invalid_prize_count integer;
begin
  select * into c from public.campaigns where id=p_campaign_id;
  if not found then return array['campaign not found']; end if;
  select * into o from public.organizations where id=c.organization_id;

  if c.ticket_price_cents is null then missing:=array_append(missing,'ticket price'); end if;
  if c.ticket_prefix is null then missing:=array_append(missing,'ticket number prefix'); end if;
  if c.starts_at is null then missing:=array_append(missing,'sales start date'); end if;
  if c.sales_close_at is null then missing:=array_append(missing,'sales close date'); end if;
  if c.draw_at is null then missing:=array_append(missing,'drawing date'); end if;
  if coalesce(o.legal_name,o.name) is null then missing:=array_append(missing,'organization legal name'); end if;
  if o.address_line1 is null or o.city is null or o.region is null then missing:=array_append(missing,'organization legal address'); end if;
  if coalesce(c.support_email,o.support_email,c.support_phone,o.support_phone) is null then
    missing:=array_append(missing,'support contact');
  end if;

  compliance_required:=coalesce(public.campaign_compliance_required(c.organization_id),false);
  if compliance_required and c.campaign_type='raffle' then
    if coalesce(o.jurisdiction_profile,'')<>'TEXAS_CREA_OFFLINE_PAYMENT' then
      missing:=array_append(missing,'Texas CREA jurisdiction profile');
    end if;
    if nullif(btrim(coalesce(c.charitable_purpose,'')),'') is null then
      missing:=array_append(missing,'charitable purpose');
    end if;
    if c.raffle_year_sequence is null then missing:=array_append(missing,'raffle calendar-year number'); end if;

    select count(*),
      count(*) filter(where
        p.fair_value_cents<1
        or p.source not in ('DONATED','PURCHASED')
        or p.possession_basis not in ('OWNED_OR_POSSESSED','BONDED')
        or length(btrim(p.evidence_ref))<3
        or (p.source='PURCHASED' and p.fair_value_cents>7500000)
      )
    into prize_count,invalid_prize_count
    from public.campaign_prizes p where p.campaign_id=c.id and p.archived_at is null;
    if prize_count=0 then missing:=array_append(missing,'at least one documented non-cash prize'); end if;
    if invalid_prize_count>0 then missing:=array_append(missing,'valid prize source/value/possession evidence'); end if;

    expected_hash:=public.campaign_compliance_hash(c,o);
    if c.compliance_confirmed_at is null
       or c.compliance_confirmed_by is null
       or c.compliance_confirmation_hash is distinct from expected_hash
       or coalesce((c.compliance_attestation->>'entity_eligibility_and_name_change_evidence_reviewed')::boolean,false) is not true
       or coalesce((c.compliance_attestation->>'calendar_year_count_and_charitable_use_reviewed')::boolean,false) is not true
       or coalesce((c.compliance_attestation->>'prize_possession_sales_promotion_and_compensation_restrictions_reviewed')::boolean,false) is not true then
      missing:=array_append(missing,'current Texas compliance attestation');
    end if;
  end if;
  return missing;
end;
$$;

create or replace function public.confirm_campaign_compliance(
  p_campaign_id uuid,
  p_reason text,
  p_entity_confirmed boolean,
  p_raffle_count_confirmed boolean,
  p_prize_sales_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  c public.campaigns;
  o public.organizations;
  reason text:=nullif(btrim(p_reason),'');
  confirmation_hash text;
  me uuid:=auth.uid();
  attestation jsonb;
  ticket_prize_description text;
  invalid_prize_count integer;
begin
  select * into c from public.campaigns where id=p_campaign_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  perform public.assert_org_permission(c.organization_id,'campaigns.activate');
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
  if coalesce(o.jurisdiction_profile,'')<>'TEXAS_CREA_OFFLINE_PAYMENT' then
    raise exception 'Texas CREA jurisdiction profile is required.' using errcode='check_violation';
  end if;
  if reason is null or length(reason) not between 3 and 500 then
    raise exception 'A compliance attestation reason of 3–500 characters is required.' using errcode='check_violation';
  end if;
  if c.ticket_price_cents is null or c.draw_at is null
     or nullif(btrim(coalesce(c.charitable_purpose,'')),'') is null
     or c.raffle_year_sequence is null
     or coalesce(o.legal_name,o.name) is null
     or o.address_line1 is null or o.city is null or o.region is null then
    raise exception 'Complete the legal operator, ticket, purpose, and raffle-year fields before attestation.'
      using errcode='check_violation';
  end if;

  select public.campaign_prize_ticket_description(c.id),
    count(*) filter(where
      p.fair_value_cents<1
      or p.source not in ('DONATED','PURCHASED')
      or p.possession_basis not in ('OWNED_OR_POSSESSED','BONDED')
      or length(btrim(p.evidence_ref))<3
      or (p.source='PURCHASED' and p.fair_value_cents>7500000)
    )
  into ticket_prize_description,invalid_prize_count
  from public.campaign_prizes p
  where p.campaign_id=c.id and p.archived_at is null;
  if ticket_prize_description is null then
    raise exception 'At least one documented non-cash prize is required.' using errcode='check_violation';
  end if;
  if invalid_prize_count>0 then
    raise exception 'Prize source/value/possession evidence is incomplete or outside controlled-pilot limits.'
      using errcode='check_violation';
  end if;

  attestation:=jsonb_build_object(
    'entity_eligibility_and_name_change_evidence_reviewed',true,
    'calendar_year_count_and_charitable_use_reviewed',true,
    'prize_possession_sales_promotion_and_compensation_restrictions_reviewed',true
  );

  perform set_config('raffle_hub.compliance_confirmation',c.id::text,true);
  perform public.set_audit_reason(reason);
  update public.campaigns set prize_description=ticket_prize_description where id=c.id
    returning * into c;
  confirmation_hash:=public.campaign_compliance_hash(c,o);
  update public.campaigns set
    compliance_confirmed_at=clock_timestamp(),
    compliance_confirmed_by=me,
    compliance_confirmation_hash=confirmation_hash,
    compliance_attestation=attestation
  where id=c.id;
  perform set_config('raffle_hub.compliance_confirmation','',true);
  perform public.set_audit_reason(null);

  return jsonb_build_object(
    'campaign_id',c.id,
    'confirmed_at',(select compliance_confirmed_at from public.campaigns where id=c.id),
    'confirmed_by',me,
    'confirmation_hash',confirmation_hash,
    'attestation',attestation
  );
end;
$$;

revoke all on public.campaign_prizes from anon;
revoke all on function public.campaign_prize_ticket_description(uuid),
  public.invalidate_campaign_compliance(uuid,text),
  public.upsert_campaign_prize(uuid,uuid,uuid,text,text,bigint,text,text,text),
  public.archive_campaign_prize(uuid,uuid,text) from public,anon;
grant execute on function public.upsert_campaign_prize(uuid,uuid,uuid,text,text,bigint,text,text,text),
  public.archive_campaign_prize(uuid,uuid,text) to authenticated;
