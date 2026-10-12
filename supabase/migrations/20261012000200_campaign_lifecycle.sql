-- =============================================================================
-- Raffle Hub — 1200 Campaign lifecycle enforcement
--
--   DRAFT → READY → ACTIVE → CLOSED → DRAWN → ARCHIVED
--   READY → DRAFT (back to editing)        DRAFT → ARCHIVED (abandon a draft)
--
-- Status can only change through transition_campaign(), which checks the edge,
-- the caller's permission, readiness, and requires a reason (except
-- DRAFT → READY). Ticket-critical fields are locked once a campaign is ACTIVE.
-- Every transition writes an append-only campaign_events row and an audit
-- event (CAMPAIGN_STATUS_CHANGED with metadata.reason).
-- =============================================================================

-- No campaign rows exist yet in any environment; the status vocabulary changes.
alter table public.campaigns drop constraint campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('DRAFT', 'READY', 'ACTIVE', 'CLOSED', 'DRAWN', 'ARCHIVED'));

alter table public.campaigns
  add column description           text,
  add column ticket_price_cents    integer check (ticket_price_cents is null or ticket_price_cents > 0),
  add column goal_amount_cents     bigint check (goal_amount_cents is null or goal_amount_cents >= 0),
  add column family_target_tickets integer check (family_target_tickets is null or family_target_tickets >= 0),
  add column default_allocation    integer check (default_allocation is null or default_allocation >= 0),
  add column ticket_prefix         text check (ticket_prefix is null or ticket_prefix ~ '^[A-Z0-9]{2,8}$'),
  add column support_email         text,
  add column support_phone         text,
  add column operator_legal_name   text,
  add column operator_address      jsonb,
  add column rules_text            text,
  add column rules_version         integer not null default 1 check (rules_version > 0),
  add column activated_at          timestamptz,
  add column activated_by          uuid references auth.users (id) on delete set null,
  add column closed_at             timestamptz,
  add column closed_by             uuid references auth.users (id) on delete set null,
  add column drawn_at              timestamptz,
  add column drawn_by              uuid references auth.users (id) on delete set null,
  add column archived_by           uuid references auth.users (id) on delete set null;

comment on column public.campaigns.draw_at is 'Scheduled drawing date/time (disclosed on tickets; locked after activation).';
comment on column public.campaigns.drawn_at is 'When the drawing was recorded (status DRAWN).';
comment on column public.campaigns.operator_legal_name is 'Legal operator snapshot taken at activation (required ticket disclosure).';

-- Fields that appear on tickets or determine money: frozen from ACTIVE onward.
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
    'rules_version', c.rules_version
  );
$$;

create or replace function public.campaign_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('DRAFT', 'READY'), ('READY', 'DRAFT'), ('READY', 'ACTIVE'),
    ('ACTIVE', 'CLOSED'), ('CLOSED', 'DRAWN'), ('DRAWN', 'ARCHIVED'),
    ('DRAFT', 'ARCHIVED')
  );
$$;

create or replace function public.guard_campaign_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  transitioning boolean := coalesce(current_setting('raffle_hub.campaign_transition', true), '') = new.id::text;
  old_locked jsonb;
  new_locked jsonb;
  diff text[];
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'New campaigns start as DRAFT.' using errcode = 'check_violation';
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

create trigger campaigns_guard before insert or update on public.campaigns
  for each row execute function public.guard_campaign_write();

-- -----------------------------------------------------------------------------
-- Append-only campaign event ledger (hash-chained in migration 1300)
-- -----------------------------------------------------------------------------

create table public.campaign_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  campaign_id     uuid not null,
  event_type      text not null check (event_type in ('STATUS_CHANGED')),
  from_status     text,
  to_status       text,
  reason          text,
  actor_id        uuid references auth.users (id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id),
  check (event_type <> 'STATUS_CHANGED' or (from_status is not null and to_status is not null))
);
comment on table public.campaign_events is 'HISTORICAL. Append-only campaign lifecycle ledger.';
create index campaign_events_campaign_idx on public.campaign_events (campaign_id, occurred_at);

-- -----------------------------------------------------------------------------
-- The only way to change campaign status
-- -----------------------------------------------------------------------------

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
  return missing;
end;
$$;

-- SECURITY DEFINER because campaign_events accepts no client writes; the
-- permission check below is explicit and uses the caller's auth.uid().
create or replace function public.transition_campaign(p_campaign_id uuid, p_to text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.campaigns;
  o public.organizations;
  required_permission text;
  missing text[];
  me uuid := auth.uid();
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'Campaign not found.' using errcode = 'no_data_found';
  end if;

  if not public.campaign_transition_allowed(c.status, p_to) then
    raise exception 'A campaign can’t move from % to %.', c.status, coalesce(p_to, 'NULL') using errcode = 'check_violation';
  end if;

  required_permission := case
    when p_to in ('READY', 'DRAFT', 'CLOSED') then 'campaigns.manage'
    when c.status = 'DRAFT' and p_to = 'ARCHIVED' then 'campaigns.manage'
    else 'campaigns.activate'
  end;
  perform public.assert_org_permission(c.organization_id, required_permission);

  if not (c.status = 'DRAFT' and p_to = 'READY') and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required to move a campaign from % to %.', c.status, p_to using errcode = 'check_violation';
  end if;

  if p_to in ('READY', 'ACTIVE') then
    missing := public.campaign_readiness(c.id);
    if p_to = 'ACTIVE' and c.sales_close_at is not null and c.sales_close_at <= now() then
      missing := array_append(missing, 'sales close date is in the past'::text);
    end if;
    if cardinality(missing) > 0 then
      raise exception 'Not ready: missing %', array_to_string(missing, ', ') using errcode = 'check_violation';
    end if;
  end if;

  select * into o from public.organizations where id = c.organization_id;

  perform set_config('raffle_hub.campaign_transition', c.id::text, true);
  perform public.set_audit_reason(p_reason);

  update public.campaigns set
    status              = p_to,
    -- Snapshot the legal operator disclosure at activation; locked afterwards.
    operator_legal_name = case when p_to = 'ACTIVE' then coalesce(o.legal_name, o.name) else operator_legal_name end,
    operator_address    = case when p_to = 'ACTIVE' then jsonb_strip_nulls(jsonb_build_object(
                             'line1', o.address_line1, 'line2', o.address_line2, 'city', o.city,
                             'region', o.region, 'postal_code', o.postal_code, 'country', o.country))
                          else operator_address end,
    support_email       = case when p_to = 'ACTIVE' then coalesce(support_email, o.support_email) else support_email end,
    support_phone       = case when p_to = 'ACTIVE' then coalesce(support_phone, o.support_phone) else support_phone end,
    jurisdiction_mode   = case when p_to = 'ACTIVE' then coalesce(jurisdiction_mode, o.jurisdiction_profile) else jurisdiction_mode end,
    timezone            = case when p_to = 'ACTIVE' then coalesce(timezone, o.timezone) else timezone end,
    activated_at        = case when p_to = 'ACTIVE' then now() else activated_at end,
    activated_by        = case when p_to = 'ACTIVE' then me else activated_by end,
    closed_at           = case when p_to = 'CLOSED' then now() else closed_at end,
    closed_by           = case when p_to = 'CLOSED' then me else closed_by end,
    drawn_at            = case when p_to = 'DRAWN' then now() else drawn_at end,
    drawn_by            = case when p_to = 'DRAWN' then me else drawn_by end,
    archived_at         = case when p_to = 'ARCHIVED' then now() else archived_at end,
    archived_by         = case when p_to = 'ARCHIVED' then me else archived_by end
  where id = c.id;

  insert into public.campaign_events (organization_id, campaign_id, event_type, from_status, to_status, reason, actor_id)
  values (c.organization_id, c.id, 'STATUS_CHANGED', c.status, p_to, nullif(btrim(coalesce(p_reason, '')), ''), me);

  perform set_config('raffle_hub.campaign_transition', '', true);
  perform public.set_audit_reason(null);
  return p_to;
end;
$$;
