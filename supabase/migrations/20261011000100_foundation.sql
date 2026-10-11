-- =============================================================================
-- Raffle Hub — 0100 Foundation
-- Platform → Organization tenancy, identity (profiles), role/permission catalog,
-- membership, authorization helpers used by RLS, and the append-only audit log.
-- See docs/database-schema.md and docs/roles-permissions.md.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Shared trigger functions
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Stamps created_by / updated_by from the authenticated user. Tables opt in by
-- attaching this trigger; columns that don't exist on a table are skipped.
create or replace function public.set_actor_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  row_json jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    if row_json ? 'created_by' and new.created_by is null then
      new.created_by := actor;
    end if;
  end if;
  if row_json ? 'updated_by' then
    new.updated_by := actor;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- GLOBAL: profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  full_name            text,
  avatar_url           text,
  last_organization_id uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.profiles is 'GLOBAL / user-scoped. Public profile for each auth user.';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- GLOBAL: role & permission catalog
-- -----------------------------------------------------------------------------

create table public.roles (
  key         text primary key check (key ~ '^[A-Z][A-Z_]*$'),
  scope       text not null check (scope in ('platform', 'organization')),
  name        text not null,
  description text not null default '',
  sort_order  integer not null default 0,
  unique (key, scope)
);
comment on table public.roles is 'GLOBAL catalog. Platform roles are granted via platform_admins; organization roles via organization_members.';

create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  category    text not null,
  description text not null default ''
);
comment on table public.permissions is 'GLOBAL catalog of granular permission keys checked by has_org_permission().';

create table public.role_permissions (
  role_key       text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);
comment on table public.role_permissions is 'GLOBAL. Which permissions each organization role grants.';

insert into public.roles (key, scope, name, description, sort_order) values
  ('SUPER_ADMIN',        'platform',     'Super Admin',          'Platform operator. Full access to every organization.', 0),
  ('ORGANIZATION_ADMIN', 'organization', 'Organization Admin',   'Full control of one organization: roster, members, settings.', 10),
  ('CAMPAIGN_MANAGER',   'organization', 'Campaign Manager',     'Runs fundraising campaigns; reads the roster.', 20),
  ('FINANCE_ADMIN',      'organization', 'Finance Admin',        'Money integrity: reconciliation and financial exports (later phases).', 30),
  ('TEAM_CAPTAIN',       'organization', 'Team Captain',         'Team-level visibility (team-scoped access arrives with campaigns).', 40),
  ('AUDITOR',            'organization', 'Auditor (read-only)',  'Read-only access to roster, members and the audit log.', 50),
  ('PARTICIPANT_FAMILY', 'organization', 'Participant / Family', 'Family/seller account (household-scoped access arrives with self-registration).', 60);

insert into public.permissions (key, category, description) values
  ('organization.manage', 'organization', 'Edit organization profile, seasons and settings'),
  ('members.read',        'organization', 'View organization members and their roles'),
  ('members.manage',      'organization', 'Change member roles and status'),
  ('roster.read',         'roster',       'View teams, players, households and guardians'),
  ('roster.write',        'roster',       'Create, edit and archive teams, players, households and guardians'),
  ('roster.import',       'roster',       'Run roster imports'),
  ('audit.read',          'audit',        'View the audit log'),
  ('campaigns.read',      'campaigns',    'View campaigns'),
  ('campaigns.manage',    'campaigns',    'Create and configure campaigns');

insert into public.role_permissions (role_key, permission_key)
select 'ORGANIZATION_ADMIN', key from public.permissions
union all
select 'CAMPAIGN_MANAGER', unnest(array['roster.read', 'members.read', 'campaigns.read', 'campaigns.manage'])
union all
select 'FINANCE_ADMIN', unnest(array['roster.read', 'campaigns.read'])
union all
select 'AUDITOR', unnest(array['roster.read', 'members.read', 'audit.read', 'campaigns.read']);
-- TEAM_CAPTAIN and PARTICIPANT_FAMILY intentionally receive no organization-wide
-- grants yet; they will get team-/household-scoped policies in later phases.

-- -----------------------------------------------------------------------------
-- GLOBAL: platform administrators (SUPER_ADMIN)
-- -----------------------------------------------------------------------------

create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
comment on table public.platform_admins is 'GLOBAL. Users holding the SUPER_ADMIN platform role. Managed with the service role only.';

-- -----------------------------------------------------------------------------
-- ORGANIZATION (tenant root)
-- -----------------------------------------------------------------------------

create table public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(trim(name)) > 0),
  legal_name           text,
  slug                 text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'),
  organization_type    text not null default 'sports_club'
                       check (organization_type in ('sports_club', 'nonprofit', 'school', 'ministry', 'community', 'other')),
  timezone             text not null default 'America/Chicago',
  address_line1        text,
  address_line2        text,
  city                 text,
  region               text,
  postal_code          text,
  country              text not null default 'US',
  support_email        text,
  support_phone        text,
  -- Legal operating profile applied to campaigns later (e.g. TEXAS_CREA_OFFLINE_PAYMENT).
  jurisdiction_profile text,
  settings             jsonb not null default '{}'::jsonb,
  status               text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id) on delete set null,
  updated_by           uuid references auth.users (id) on delete set null,
  archived_at          timestamptz
);
comment on table public.organizations is 'TENANT ROOT. Every organization-owned row carries organization_id.';

alter table public.profiles
  add constraint profiles_last_organization_fk
  foreign key (last_organization_id) references public.organizations (id) on delete set null;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger organizations_set_actor before insert or update on public.organizations
  for each row execute function public.set_actor_columns();

-- -----------------------------------------------------------------------------
-- ORGANIZATION-SCOPED: organization members (user ↔ org with one role)
-- -----------------------------------------------------------------------------

create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role_key        text not null,
  role_scope      text not null default 'organization' check (role_scope = 'organization'),
  status          text not null default 'active' check (status in ('invited', 'active', 'suspended', 'removed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  unique (organization_id, user_id),
  -- Composite FK guarantees only organization-scope roles are assigned here.
  foreign key (role_key, role_scope) references public.roles (key, scope)
);
comment on table public.organization_members is 'ORGANIZATION-SCOPED. Membership + role of a user in an organization.';
create index organization_members_user_idx on public.organization_members (user_id) where status = 'active';

create trigger organization_members_set_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();
create trigger organization_members_set_actor before insert or update on public.organization_members
  for each row execute function public.set_actor_columns();

-- -----------------------------------------------------------------------------
-- Authorization helpers (used by RLS and by the application)
-- SECURITY DEFINER so policies can consult membership without recursive RLS.
-- -----------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or exists (
        select 1 from public.organization_members m
        where m.organization_id = p_organization_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
      );
$$;

create or replace function public.has_org_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or exists (
        select 1
        from public.organization_members m
        join public.role_permissions rp on rp.role_key = m.role_key
        where m.organization_id = p_organization_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and rp.permission_key = p_permission
      );
$$;

-- Effective permissions of the current user in an organization (for the UI).
create or replace function public.my_org_permissions(p_organization_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_platform_admin() then (select array_agg(key order by key) from public.permissions)
    else coalesce((
      select array_agg(distinct rp.permission_key order by rp.permission_key)
      from public.organization_members m
      join public.role_permissions rp on rp.role_key = m.role_key
      where m.organization_id = p_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    ), '{}')
  end;
$$;

-- True when the current user shares an active organization with p_user_id.
create or replace function public.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members me
    join public.organization_members them
      on them.organization_id = me.organization_id and them.status = 'active'
    where me.user_id = (select auth.uid()) and me.status = 'active'
      and them.user_id = p_user_id
  );
$$;

-- Never leave an organization without an active ORGANIZATION_ADMIN.
create or replace function public.guard_last_org_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role_key = 'ORGANIZATION_ADMIN' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role_key <> 'ORGANIZATION_ADMIN' or new.status <> 'active')
     and not exists (
       select 1 from public.organization_members
       where organization_id = old.organization_id and id <> old.id
         and role_key = 'ORGANIZATION_ADMIN' and status = 'active'
     )
  then
    raise exception 'An organization must keep at least one active Organization Admin.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organization_members_guard_last_admin
  before update or delete on public.organization_members
  for each row execute function public.guard_last_org_admin();

-- -----------------------------------------------------------------------------
-- HISTORICAL / AUDIT: append-only audit events
-- -----------------------------------------------------------------------------

create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  actor_id        uuid references auth.users (id) on delete set null,
  action          text not null check (action ~ '^[A-Z][A-Z_]*$'),
  entity_type     text not null,
  entity_id       uuid,
  before_data     jsonb,
  after_data      jsonb,
  changed_fields  text[] not null default '{}',
  metadata        jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now()
);
comment on table public.audit_events is 'HISTORICAL / AUDIT. Append-only. Written by triggers and SECURITY DEFINER functions only.';
create index audit_events_org_time_idx on public.audit_events (organization_id, occurred_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, occurred_at desc);

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function public.prevent_audit_mutation();

-- Generic row-change auditor. TG_ARGV[0] = action prefix (e.g. 'PLAYER').
-- Emits <PREFIX>_CREATED / _UPDATED / _ARCHIVED / _RESTORED. When the session
-- variable raffle_hub.import_id is set (inside an import), inserts emit
-- <PREFIX>_IMPORTED instead of _CREATED.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix     text := tg_argv[0];
  old_json   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_json   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  ignored    text[] := array['updated_at', 'updated_by'];
  changed    text[];
  verb       text;
  import_id  text := nullif(current_setting('raffle_hub.import_id', true), '');
  org_id     uuid;
  meta       jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    verb := case when import_id is not null then 'IMPORTED' else 'CREATED' end;
  elsif tg_op = 'DELETE' then
    verb := 'DELETED';
  else
    select coalesce(array_agg(key order by key), '{}') into changed
    from jsonb_each(new_json) n
    where not (key = any (ignored))
      and n.value is distinct from old_json -> key;
    if cardinality(changed) = 0 then
      return new;
    end if;
    if old_json ? 'archived_at' and (old_json ->> 'archived_at') is null and (new_json ->> 'archived_at') is not null then
      verb := 'ARCHIVED';
    elsif old_json ? 'archived_at' and (old_json ->> 'archived_at') is not null and (new_json ->> 'archived_at') is null then
      verb := 'RESTORED';
    else
      verb := 'UPDATED';
    end if;
  end if;

  org_id := coalesce((coalesce(new_json, old_json) ->> 'organization_id')::uuid,
                     case when tg_table_name = 'organizations' then (coalesce(new_json, old_json) ->> 'id')::uuid end);
  if import_id is not null then
    meta := jsonb_build_object('import_id', import_id);
  end if;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id,
                                   before_data, after_data, changed_fields, metadata)
  values (org_id, auth.uid(), prefix || '_' || verb, tg_table_name,
          (coalesce(new_json, old_json) ->> 'id')::uuid,
          old_json, new_json, coalesce(changed, '{}'), meta);
  return coalesce(new, old);
end;
$$;

create trigger organizations_audit after insert or update on public.organizations
  for each row execute function public.audit_row_change('ORGANIZATION');

-- Membership changes: MEMBER_ADDED / ROLE_CHANGED / MEMBER_STATUS_CHANGED.
create or replace function public.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'MEMBER_ADDED';
  elsif new.role_key is distinct from old.role_key then
    action_name := 'ROLE_CHANGED';
  elsif new.status is distinct from old.status then
    action_name := 'MEMBER_STATUS_CHANGED';
  else
    return new;
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  values (new.organization_id, auth.uid(), action_name, 'organization_members', new.id,
          case when tg_op = 'UPDATE' then jsonb_build_object('role_key', old.role_key, 'status', old.status) end,
          jsonb_build_object('role_key', new.role_key, 'status', new.status),
          jsonb_build_object('user_id', new.user_id));
  return new;
end;
$$;

create trigger organization_members_audit after insert or update on public.organization_members
  for each row execute function public.audit_membership_change();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.roles                enable row level security;
alter table public.permissions          enable row level security;
alter table public.role_permissions     enable row level security;
alter table public.platform_admins      enable row level security;
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_events         enable row level security;

-- Catalogs: readable by any signed-in user; writable only by migrations/service role.
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- Profiles: see yourself and people you share an organization with; edit yourself.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id) or public.is_platform_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Platform admins: a user may see their own row (lets the UI detect SUPER_ADMIN).
create policy platform_admins_select_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Organizations
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (public.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_permission(id, 'organization.manage'))
  with check (public.has_org_permission(id, 'organization.manage'));

-- Organization members
create policy organization_members_select on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or public.has_org_permission(organization_id, 'members.read'));
create policy organization_members_insert on public.organization_members for insert to authenticated
  with check (public.has_org_permission(organization_id, 'members.manage'));
create policy organization_members_update on public.organization_members for update to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage'));

-- Audit: read-only for holders of audit.read; no client writes at all.
create policy audit_events_select on public.audit_events for select to authenticated
  using (organization_id is not null and public.has_org_permission(organization_id, 'audit.read'));

revoke insert, update, delete on public.audit_events from anon, authenticated;
revoke insert, update, delete on public.platform_admins from anon, authenticated;
revoke insert, update, delete on public.roles, public.permissions, public.role_permissions from anon, authenticated;
