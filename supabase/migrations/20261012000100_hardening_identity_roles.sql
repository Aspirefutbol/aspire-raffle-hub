-- =============================================================================
-- Raffle Hub — 1100 Hardening: identity, platform vs organization permissions,
-- protected organization fields, multi-role memberships, invitations,
-- audit reasons.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Audit reason capture
-- Functions that perform sensitive changes set the transaction-local setting
-- raffle_hub.reason; every audit trigger copies it into metadata.reason.
-- -----------------------------------------------------------------------------

create or replace function public.audit_context()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'import_id', nullif(current_setting('raffle_hub.import_id', true), ''),
    'reason', nullif(current_setting('raffle_hub.reason', true), '')
  ));
$$;

create or replace function public.set_audit_reason(p_reason text)
returns void
language sql
set search_path = ''
as $$
  select set_config('raffle_hub.reason', coalesce(btrim(p_reason), ''), true);
$$;

-- Generic row auditor (replaces 0100 version): adds reason, and a dedicated
-- <PREFIX>_STATUS_CHANGED verb when a table's status column changes.
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
    elsif 'status' = any (changed) and tg_table_name in ('campaigns', 'organizations') then
      verb := 'STATUS_CHANGED';
    else
      verb := 'UPDATED';
    end if;
  end if;

  org_id := coalesce((coalesce(new_json, old_json) ->> 'organization_id')::uuid,
                     case when tg_table_name = 'organizations' then (coalesce(new_json, old_json) ->> 'id')::uuid end);

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id,
                                   before_data, after_data, changed_fields, metadata)
  values (org_id, auth.uid(), prefix || '_' || verb, tg_table_name,
          (coalesce(new_json, old_json) ->> 'id')::uuid,
          old_json, new_json, coalesce(changed, '{}'), public.audit_context());
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Permission scopes: platform permissions can never be granted to an
--    organization role (and vice versa).
-- -----------------------------------------------------------------------------

alter table public.permissions
  add column scope text not null default 'organization' check (scope in ('platform', 'organization'));

alter table public.permissions drop constraint permissions_key_check;
alter table public.permissions add constraint permissions_key_check check (key ~ '^[a-z_]+\.[a-z_]+$');

insert into public.permissions (key, category, description, scope) values
  ('platform.organizations', 'platform',  'Create organizations; change protected organization fields (slug, status, jurisdiction, platform config)', 'platform'),
  ('platform.admins',        'platform',  'Grant or revoke platform administrators', 'platform'),
  ('campaigns.activate',     'campaigns', 'Governance: activate, close out, record drawn and archive campaigns', 'organization'),
  ('tickets.issue',          'tickets',   'Issue tickets from assigned inventory (ticket phase)', 'organization'),
  ('tickets.void',           'tickets',   'Void and reissue tickets with a reason (ticket phase)', 'organization'),
  ('reconciliation.manage',  'money',     'Record turn-ins, batches and payment exceptions (reconciliation phase)', 'organization'),
  ('adjustments.approve',    'money',     'Approve adjustments, reversals and write-offs (reconciliation phase)', 'organization'),
  ('drawing.manage',         'drawing',   'Prepare and lock drawing pools (drawing phase)', 'organization'),
  ('drawing.certify',        'drawing',   'Certify drawing results (drawing phase)', 'organization'),
  ('exports.run',            'reports',   'Run data exports (reporting phase)', 'organization');

insert into public.roles (key, scope, name, description, sort_order) values
  ('DIRECTOR', 'organization', 'Director', 'Governance: campaign activation and closeout, write-off approval, draw certification.', 5);

update public.roles set name = 'Team Manager / Captain', description = 'Team-level visibility and family follow-up (team-scoped access arrives with campaigns).'
 where key = 'TEAM_CAPTAIN';
update public.roles set name = 'Seller / Family', description = 'Sells tickets for their player(s); household-scoped access arrives with campaigns.'
 where key = 'PARTICIPANT_FAMILY';
update public.roles set description = 'Day-to-day operations of one organization: roster, members, settings, campaigns, corrections.'
 where key = 'ORGANIZATION_ADMIN';

insert into public.role_permissions (role_key, permission_key)
select 'SUPER_ADMIN', key from public.permissions where scope = 'platform'
union all
-- tickets.issue lets admins issue on a family's behalf and, by the grant rule, assign Seller / Family.
select 'ORGANIZATION_ADMIN', unnest(array['tickets.issue', 'tickets.void', 'reconciliation.manage', 'drawing.manage', 'exports.run'])
union all
select 'DIRECTOR', unnest(array['roster.read', 'members.read', 'audit.read', 'campaigns.read', 'campaigns.activate',
                                'adjustments.approve', 'drawing.certify', 'exports.run'])
union all
select 'CAMPAIGN_MANAGER', unnest(array['tickets.void', 'drawing.manage'])
union all
select 'FINANCE_ADMIN', unnest(array['reconciliation.manage', 'exports.run'])
union all
select 'AUDITOR', unnest(array['exports.run'])
union all
select 'PARTICIPANT_FAMILY', unnest(array['tickets.issue']);

create or replace function public.guard_role_permission_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select scope from public.roles where key = new.role_key)
     is distinct from (select scope from public.permissions where key = new.permission_key) then
    raise exception 'Role % (%) cannot hold permission % (%): scopes differ.',
      new.role_key, (select scope from public.roles where key = new.role_key),
      new.permission_key, (select scope from public.permissions where key = new.permission_key)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger role_permissions_scope_guard before insert or update on public.role_permissions
  for each row execute function public.guard_role_permission_scope();

-- Fail the migration if any existing grant crosses scopes.
do $$
begin
  if exists (select 1 from public.role_permissions rp
             join public.roles r on r.key = rp.role_key
             join public.permissions p on p.key = rp.permission_key
             where r.scope <> p.scope) then
    raise exception 'Cross-scope role permission found';
  end if;
end;
$$;

create or replace function public.has_platform_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    join public.role_permissions rp on rp.role_key = 'SUPER_ADMIN' and rp.permission_key = p_permission
    where pa.user_id = (select auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Organizations: protected fields + platform configuration
-- -----------------------------------------------------------------------------

alter table public.organizations
  add column platform_config jsonb not null default '{}'::jsonb;

comment on column public.organizations.platform_config is
  'Platform-controlled configuration (plan, feature flags, limits). Writable only by platform administrators.';

create or replace function public.guard_organization_protected_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  protected text[] := '{}';
begin
  -- Direct database sessions (migrations, service role) and platform admins may change anything.
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;
  if new.slug is distinct from old.slug then protected := array_append(protected, 'slug'::text); end if;
  if new.status is distinct from old.status then protected := array_append(protected, 'status'::text); end if;
  if new.jurisdiction_profile is distinct from old.jurisdiction_profile then protected := array_append(protected, 'jurisdiction_profile'::text); end if;
  if new.platform_config is distinct from old.platform_config then protected := array_append(protected, 'platform_config'::text); end if;
  if new.archived_at is distinct from old.archived_at then protected := array_append(protected, 'archived_at'::text); end if;
  if new.id is distinct from old.id then protected := array_append(protected, 'id'::text); end if;
  if cardinality(protected) > 0 then
    raise exception 'Only platform administrators can change: %', array_to_string(protected, ', ')
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger organizations_guard_protected before update on public.organizations
  for each row execute function public.guard_organization_protected_fields();

-- Platform-only change of protected fields, with a mandatory reason that is
-- recorded on the audit event.
create or replace function public.platform_update_organization(
  p_organization_id uuid,
  p_changes jsonb,
  p_reason text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := array['slug', 'status', 'jurisdiction_profile', 'platform_config'];
  unknown text[];
begin
  if not public.has_platform_permission('platform.organizations') then
    raise exception 'Only platform administrators can change protected organization settings.'
      using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason (at least 5 characters) is required for protected changes.' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(k), '{}') into unknown from jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) k where not (k = any (allowed));
  if cardinality(unknown) > 0 then
    raise exception 'Unsupported protected fields: %', array_to_string(unknown, ', ') using errcode = 'check_violation';
  end if;

  perform public.set_audit_reason(p_reason);
  update public.organizations o set
    slug                 = case when p_changes ? 'slug' then p_changes ->> 'slug' else o.slug end,
    status               = case when p_changes ? 'status' then p_changes ->> 'status' else o.status end,
    archived_at          = case when p_changes ? 'status' then
                             case when p_changes ->> 'status' = 'archived' then coalesce(o.archived_at, now()) else null end
                           else o.archived_at end,
    jurisdiction_profile = case when p_changes ? 'jurisdiction_profile' then nullif(p_changes ->> 'jurisdiction_profile', '') else o.jurisdiction_profile end,
    platform_config      = case when p_changes ? 'platform_config' then p_changes -> 'platform_config' else o.platform_config end
  where o.id = p_organization_id;
  if not found then
    raise exception 'Organization not found.' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Dedicated audit event naming exactly which protected fields changed.
create or replace function public.audit_organization_protected()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields text[] := '{}';
begin
  if new.slug is distinct from old.slug then fields := array_append(fields, 'slug'::text); end if;
  if new.status is distinct from old.status then fields := array_append(fields, 'status'::text); end if;
  if new.jurisdiction_profile is distinct from old.jurisdiction_profile then fields := array_append(fields, 'jurisdiction_profile'::text); end if;
  if new.platform_config is distinct from old.platform_config then fields := array_append(fields, 'platform_config'::text); end if;
  if cardinality(fields) = 0 then
    return new;
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, before_data, after_data, changed_fields, metadata)
  values (new.id, auth.uid(), 'ORGANIZATION_PROTECTED_CHANGED', 'organizations', new.id,
          jsonb_build_object('slug', old.slug, 'status', old.status, 'jurisdiction_profile', old.jurisdiction_profile, 'platform_config', old.platform_config),
          jsonb_build_object('slug', new.slug, 'status', new.status, 'jurisdiction_profile', new.jurisdiction_profile, 'platform_config', new.platform_config),
          fields, public.audit_context());
  return new;
end;
$$;

create trigger organizations_audit_protected after update on public.organizations
  for each row execute function public.audit_organization_protected();

-- -----------------------------------------------------------------------------
-- 4. Multi-role memberships
-- -----------------------------------------------------------------------------

alter table public.organization_members add constraint organization_members_id_org_key unique (id, organization_id);

create table public.organization_member_roles (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id       uuid not null,
  role_key        text not null,
  role_scope      text not null default 'organization' check (role_scope = 'organization'),
  granted_at      timestamptz not null default now(),
  granted_by      uuid references auth.users (id) on delete set null,
  primary key (member_id, role_key),
  foreign key (member_id, organization_id) references public.organization_members (id, organization_id) on delete cascade,
  foreign key (role_key, role_scope) references public.roles (key, scope)
);
comment on table public.organization_member_roles is 'ORGANIZATION-SCOPED. Roles held by a member (a member may hold several).';
create index organization_member_roles_org_role_idx on public.organization_member_roles (organization_id, role_key);

insert into public.organization_member_roles (organization_id, member_id, role_key, granted_at, granted_by)
select organization_id, id, role_key, created_at, created_by from public.organization_members;

-- Old single-role machinery.
drop trigger organization_members_guard_last_admin on public.organization_members;
drop function public.guard_last_org_admin();
alter table public.organization_members drop column role_key cascade;
alter table public.organization_members drop column role_scope;

-- Membership only counts while the organization itself is active.
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
        join public.organizations o on o.id = m.organization_id and o.status = 'active'
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
        join public.organizations o on o.id = m.organization_id and o.status = 'active'
        join public.organization_member_roles r on r.member_id = m.id
        join public.role_permissions rp on rp.role_key = r.role_key
        where m.organization_id = p_organization_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and rp.permission_key = p_permission
      );
$$;

create or replace function public.my_org_permissions(p_organization_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_platform_admin() then
      (select array_agg(key order by key) from public.permissions where scope = 'organization')
    else coalesce((
      select array_agg(distinct rp.permission_key order by rp.permission_key)
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id and o.status = 'active'
      join public.organization_member_roles r on r.member_id = m.id
      join public.role_permissions rp on rp.role_key = r.role_key
      where m.organization_id = p_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    ), '{}')
  end;
$$;

create or replace function public.my_org_roles(p_organization_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.role_key order by ro.sort_order), '{}')
  from public.organization_members m
  join public.organization_member_roles r on r.member_id = m.id
  join public.roles ro on ro.key = r.role_key
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

-- A user may only grant or revoke a role whose every permission they hold
-- themselves (no privilege escalation), plus members.manage.
create or replace function public.can_assign_role(p_organization_id uuid, p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.roles where key = p_role_key and scope = 'organization')
     and (
       public.is_platform_admin()
       or (
         public.has_org_permission(p_organization_id, 'members.manage')
         and not exists (
           select 1 from public.role_permissions rp
           where rp.role_key = p_role_key
             and not public.has_org_permission(p_organization_id, rp.permission_key)
         )
       )
     );
$$;

-- Every organization keeps at least one active Organization Admin.
-- Deferred so role swaps inside one transaction are checked at commit.
create or replace function public.assert_org_has_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org uuid := coalesce(
    case when tg_op = 'DELETE' then old.organization_id end,
    case when tg_op <> 'DELETE' then new.organization_id end);
begin
  if not exists (select 1 from public.organizations where id = org) then
    return null; -- organization itself is being removed
  end if;
  if not exists (
    select 1 from public.organization_members m
    join public.organization_member_roles r on r.member_id = m.id and r.role_key = 'ORGANIZATION_ADMIN'
    where m.organization_id = org and m.status = 'active'
  ) and exists (select 1 from public.organization_members where organization_id = org) then
    raise exception 'An organization must keep at least one active Organization Admin.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger organization_member_roles_keep_admin
  after delete or update on public.organization_member_roles
  deferrable initially deferred
  for each row execute function public.assert_org_has_admin();

create constraint trigger organization_members_keep_admin
  after delete or update of status on public.organization_members
  deferrable initially deferred
  for each row execute function public.assert_org_has_admin();

-- Audit: MEMBER_ADDED / MEMBER_STATUS_CHANGED on memberships,
-- ROLE_GRANTED / ROLE_REVOKED on role rows.
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
  elsif new.status is distinct from old.status then
    action_name := 'MEMBER_STATUS_CHANGED';
  else
    return new;
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  values (new.organization_id, auth.uid(), action_name, 'organization_members', new.id,
          case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status) end,
          jsonb_build_object('status', new.status),
          jsonb_build_object('user_id', new.user_id) || public.audit_context());
  return new;
end;
$$;

create or replace function public.audit_member_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record := coalesce(new, old);
begin
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data, metadata)
  values (r.organization_id, auth.uid(),
          case tg_op when 'INSERT' then 'ROLE_GRANTED' else 'ROLE_REVOKED' end,
          'organization_members', r.member_id,
          jsonb_build_object('role_key', r.role_key),
          jsonb_build_object('role_key', r.role_key,
                             'user_id', (select user_id from public.organization_members where id = r.member_id))
            || public.audit_context());
  return r;
end;
$$;

create trigger organization_member_roles_audit after insert or delete on public.organization_member_roles
  for each row execute function public.audit_member_role_change();

create or replace function public.stamp_granted_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Attribute grants to the caller. accept_my_invitations() runs as the invitee
  -- but records the inviter, signalled via raffle_hub.granted_by.
  new.granted_by := coalesce(nullif(current_setting('raffle_hub.granted_by', true), '')::uuid, auth.uid(), new.granted_by);
  return new;
end;
$$;

create trigger organization_member_roles_stamp before insert on public.organization_member_roles
  for each row execute function public.stamp_granted_by();

alter table public.organization_member_roles enable row level security;

create policy organization_member_roles_select on public.organization_member_roles for select to authenticated
  using (
    public.has_org_permission(organization_id, 'members.read')
    or exists (select 1 from public.organization_members m where m.id = member_id and m.user_id = (select auth.uid()))
  );
create policy organization_member_roles_insert on public.organization_member_roles for insert to authenticated
  with check (public.can_assign_role(organization_id, role_key));
create policy organization_member_roles_delete on public.organization_member_roles for delete to authenticated
  using (public.can_assign_role(organization_id, role_key));
revoke update on public.organization_member_roles from anon, authenticated;

-- Replace a member's role set atomically (diff-based, so audit shows exactly what changed).
create or replace function public.set_member_roles(p_member_id uuid, p_roles text[], p_reason text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  m public.organization_members;
  r text;
  bad text[];
begin
  select * into m from public.organization_members where id = p_member_id for update;
  if not found then
    raise exception 'Member not found.' using errcode = 'no_data_found';
  end if;
  perform public.assert_org_permission(m.organization_id, 'members.manage');
  if cardinality(coalesce(p_roles, '{}')) = 0 then
    raise exception 'A member needs at least one role. Suspend the member instead.' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(x), '{}') into bad
  from unnest(p_roles) x where not exists (select 1 from public.roles where key = x and scope = 'organization');
  if cardinality(bad) > 0 then
    raise exception 'Unknown role: %', array_to_string(bad, ', ') using errcode = 'check_violation';
  end if;

  perform public.set_audit_reason(p_reason);

  for r in select distinct x from unnest(p_roles) x
           where not exists (select 1 from public.organization_member_roles where member_id = p_member_id and role_key = x) loop
    if not public.can_assign_role(m.organization_id, r) then
      raise exception 'You can’t grant the % role: it includes permissions you don’t have.', r using errcode = 'insufficient_privilege';
    end if;
    insert into public.organization_member_roles (organization_id, member_id, role_key) values (m.organization_id, p_member_id, r);
  end loop;

  for r in select role_key from public.organization_member_roles
           where member_id = p_member_id and not (role_key = any (p_roles)) loop
    if not public.can_assign_role(m.organization_id, r) then
      raise exception 'You can’t remove the % role: it includes permissions you don’t have.', r using errcode = 'insufficient_privilege';
    end if;
    delete from public.organization_member_roles where member_id = p_member_id and role_key = r;
  end loop;
end;
$$;

-- Add (or reactivate) an existing user as a member with roles.
create or replace function public.add_organization_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_roles text[],
  p_reason text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  member uuid;
begin
  perform public.assert_org_permission(p_organization_id, 'members.manage');
  perform public.set_audit_reason(p_reason);
  insert into public.organization_members (organization_id, user_id, status)
  values (p_organization_id, p_user_id, 'active')
  on conflict (organization_id, user_id) do update set status = 'active'
  returning id into member;
  perform public.set_member_roles(member, p_roles, p_reason);
  return member;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Identity: profile email is read-only for clients and mirrors auth.users
-- -----------------------------------------------------------------------------

revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, last_organization_id) on public.profiles to authenticated;

create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id and email is distinct from coalesce(new.email, '');
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_auth_user_email_change();

-- Exact, case-insensitive lookup of an auth user by email. No pattern
-- matching (so "_" and "%" are literal), and an error instead of a guess if
-- more than one account could match. Server-only: executable by service_role.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized text := lower(btrim(coalesce(p_email, '')));
  matches uuid[];
begin
  if normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address.' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(id), '{}') into matches
  from auth.users where lower(email) = normalized and deleted_at is null;
  if cardinality(matches) > 1 then
    raise exception 'More than one account matches this email; resolve it in the auth dashboard.' using errcode = 'cardinality_violation';
  end if;
  return matches[1];
end;
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Invitations
-- -----------------------------------------------------------------------------

create table public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_keys       text[] not null check (cardinality(role_keys) > 0),
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by      uuid references auth.users (id) on delete set null,
  accepted_by     uuid references auth.users (id) on delete set null,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  expires_at      timestamptz not null default (now() + interval '14 days'),
  last_sent_at    timestamptz,
  send_count      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.organization_invitations is 'ORGANIZATION-SCOPED. Pending access for an email; accepted on first verified sign-in.';
create unique index organization_invitations_one_pending_uq on public.organization_invitations (organization_id, email) where status = 'pending';
create index organization_invitations_email_idx on public.organization_invitations (email) where status = 'pending';

create trigger organization_invitations_set_updated_at before update on public.organization_invitations
  for each row execute function public.set_updated_at();

create or replace function public.guard_invitation_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.invited_by := auth.uid();
    end if;
    foreach r in array new.role_keys loop
      if auth.uid() is not null and not public.can_assign_role(new.organization_id, r) then
        raise exception 'You can’t invite someone as %: it includes permissions you don’t have.', r using errcode = 'insufficient_privilege';
      end if;
    end loop;
  else
    -- Only bookkeeping and status may change; identity of the invite is fixed.
    if new.email is distinct from old.email or new.organization_id is distinct from old.organization_id
       or new.role_keys is distinct from old.role_keys or new.invited_by is distinct from old.invited_by then
      raise exception 'Invitations can’t be edited; revoke and invite again.' using errcode = 'check_violation';
    end if;
    if old.status <> 'pending' and new.status is distinct from old.status then
      raise exception 'This invitation is already %.', old.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger organization_invitations_guard before insert or update on public.organization_invitations
  for each row execute function public.guard_invitation_write();

create or replace function public.audit_invitation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'INVITATION_CREATED';
  elsif new.status is distinct from old.status then
    action_name := 'INVITATION_' || upper(new.status);
  elsif new.send_count > old.send_count then
    action_name := 'INVITATION_RESENT';
  else
    return new;
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data, metadata)
  values (new.organization_id, auth.uid(), action_name, 'organization_invitations', new.id,
          jsonb_build_object('email', new.email, 'role_keys', new.role_keys, 'status', new.status),
          public.audit_context());
  return new;
end;
$$;

create trigger organization_invitations_audit after insert or update on public.organization_invitations
  for each row execute function public.audit_invitation_change();

alter table public.organization_invitations enable row level security;
create policy organization_invitations_select on public.organization_invitations for select to authenticated
  using (public.has_org_permission(organization_id, 'members.read'));
create policy organization_invitations_insert on public.organization_invitations for insert to authenticated
  with check (public.has_org_permission(organization_id, 'members.manage'));
create policy organization_invitations_update on public.organization_invitations for update to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage'));
revoke delete on public.organization_invitations from anon, authenticated;

-- Converts the current user's pending invitations into memberships. Runs on
-- sign-in. Requires a confirmed email that exactly matches the invitation.
create or replace function public.accept_my_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  confirmed timestamptz;
  inv public.organization_invitations;
  member uuid;
  accepted integer := 0;
begin
  if me is null then
    return 0;
  end if;
  select lower(email), email_confirmed_at into my_email, confirmed from auth.users where id = me;
  if my_email is null or confirmed is null then
    return 0;
  end if;

  update public.organization_invitations set status = 'expired'
   where email = my_email and status = 'pending' and expires_at <= now();

  for inv in
    select * from public.organization_invitations
    where email = my_email and status = 'pending' and expires_at > now()
    order by created_at
    for update
  loop
    perform public.set_audit_reason('Accepted invitation ' || inv.id::text);
    insert into public.organization_members (organization_id, user_id, status)
    values (inv.organization_id, me, 'active')
    on conflict (organization_id, user_id) do update set status = 'active'
    returning id into member;
    perform set_config('raffle_hub.granted_by', coalesce(inv.invited_by::text, ''), true);
    insert into public.organization_member_roles (organization_id, member_id, role_key)
    select inv.organization_id, member, k
    from unnest(inv.role_keys) k
    on conflict (member_id, role_key) do nothing;
    perform set_config('raffle_hub.granted_by', '', true);
    update public.organization_invitations
       set status = 'accepted', accepted_by = me, accepted_at = now()
     where id = inv.id;
    accepted := accepted + 1;
  end loop;
  perform public.set_audit_reason(null);
  return accepted;
end;
$$;
revoke all on function public.accept_my_invitations() from public, anon;
grant execute on function public.accept_my_invitations() to authenticated;

-- -----------------------------------------------------------------------------
-- 7. created_by can no longer be spoofed by clients
-- -----------------------------------------------------------------------------

create or replace function public.set_actor_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  row_json jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' and row_json ? 'created_by' then
    -- Authenticated writes are always attributed to the caller.
    new.created_by := coalesce(actor, new.created_by);
  end if;
  if tg_op = 'UPDATE' and row_json ? 'created_by' then
    new.created_by := old.created_by;
  end if;
  if row_json ? 'updated_by' then
    new.updated_by := actor;
  end if;
  return new;
end;
$$;
