-- =============================================================================
-- Raffle Hub — 2100 Scoped access (Team Manager/Captain, Seller/Family),
-- platform-admin lockdown, and audit checkpoint RPCs for external anchoring.
--
-- * TEAM_CAPTAIN gets `roster.read_assigned_teams`: read access ONLY to teams
--   they are assigned to (team_staff_assignments), the players currently on
--   those teams, and the guardians/households linked to those players.
-- * PARTICIPANT_FAMILY gets `roster.read_own_family`: read access ONLY to the
--   guardian record(s) their account is linked to (guardian_user_links), that
--   household, and its players.
-- * Org-wide `roster.read` (admins, directors, auditors, …) is unchanged; the
--   new SELECT policies are additional permissive policies.
-- * Scoped users get no write access. Assignments are managed by holders of
--   members.manage through SECURITY DEFINER functions with explicit checks.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permissions
-- -----------------------------------------------------------------------------

insert into public.permissions (key, category, description, scope) values
  ('roster.read_assigned_teams', 'roster', 'Read only the teams the member is assigned to, their current players and those players'' guardians', 'organization'),
  ('roster.read_own_family',     'roster', 'Read only the member''s own linked guardian record, household and players', 'organization');

insert into public.role_permissions (role_key, permission_key) values
  ('TEAM_CAPTAIN',       'roster.read_assigned_teams'),
  ('PARTICIPANT_FAMILY', 'roster.read_own_family'),
  -- Admins already read the whole roster; holding these lets them assign the
  -- Captain and Seller/Family roles under the grant rule (can_assign_role).
  ('ORGANIZATION_ADMIN', 'roster.read_assigned_teams'),
  ('ORGANIZATION_ADMIN', 'roster.read_own_family');

-- -----------------------------------------------------------------------------
-- 2. Scope tables
-- -----------------------------------------------------------------------------

create table public.team_staff_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  team_id         uuid not null,
  member_id       uuid not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  archived_at     timestamptz,
  archived_by     uuid references auth.users (id) on delete set null,
  foreign key (team_id, organization_id) references public.teams (id, organization_id),
  foreign key (member_id, organization_id) references public.organization_members (id, organization_id)
);
comment on table public.team_staff_assignments is
  'ORGANIZATION. Which members (Team Manager/Captain) may read which teams. Archived, never deleted.';
create unique index team_staff_assignments_active_uq on public.team_staff_assignments (team_id, member_id) where archived_at is null;
create index team_staff_assignments_member_idx on public.team_staff_assignments (member_id) where archived_at is null;

create table public.guardian_user_links (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  guardian_id     uuid not null,
  member_id       uuid not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  archived_at     timestamptz,
  archived_by     uuid references auth.users (id) on delete set null,
  foreign key (guardian_id, organization_id) references public.guardians (id, organization_id),
  foreign key (member_id, organization_id) references public.organization_members (id, organization_id)
);
comment on table public.guardian_user_links is
  'ORGANIZATION. Links a signed-in member (Seller/Family) to the guardian record they are. Defines family scope. Archived, never deleted.';
-- One account per guardian record at a time.
create unique index guardian_user_links_active_guardian_uq on public.guardian_user_links (guardian_id) where archived_at is null;
create index guardian_user_links_member_idx on public.guardian_user_links (member_id) where archived_at is null;

alter table public.team_staff_assignments enable row level security;
alter table public.guardian_user_links    enable row level security;

-- Readable by member managers/readers and by the member themselves; no client writes.
create policy team_staff_assignments_select on public.team_staff_assignments for select to authenticated
  using (public.has_org_permission(organization_id, 'members.read')
         or member_id in (select m.id from public.organization_members m where m.user_id = (select auth.uid())));
create policy guardian_user_links_select on public.guardian_user_links for select to authenticated
  using (public.has_org_permission(organization_id, 'members.read')
         or member_id in (select m.id from public.organization_members m where m.user_id = (select auth.uid())));
revoke insert, update, delete, truncate on public.team_staff_assignments, public.guardian_user_links from anon, authenticated;

create trigger team_staff_assignments_audit after insert or update on public.team_staff_assignments
  for each row execute function public.audit_row_change('TEAM_STAFF');
create trigger guardian_user_links_audit after insert or update on public.guardian_user_links
  for each row execute function public.audit_row_change('FAMILY_LINK');

-- -----------------------------------------------------------------------------
-- 3. Scope helpers (SECURITY DEFINER: they read scope tables regardless of the
--    caller's RLS, always keyed on auth.uid(), and require the scope permission
--    on an active membership of an active organization via has_org_permission).
-- -----------------------------------------------------------------------------

create or replace function public.my_assigned_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.team_id
  from public.team_staff_assignments a
  join public.organization_members m on m.id = a.member_id and m.status = 'active' and m.user_id = (select auth.uid())
  join public.teams t on t.id = a.team_id and t.archived_at is null
  where a.archived_at is null
    and public.has_org_permission(a.organization_id, 'roster.read_assigned_teams');
$$;

create or replace function public.my_family_guardian_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.guardian_id
  from public.guardian_user_links l
  join public.organization_members m on m.id = l.member_id and m.status = 'active' and m.user_id = (select auth.uid())
  join public.guardians g on g.id = l.guardian_id and g.archived_at is null
  where l.archived_at is null
    and public.has_org_permission(l.organization_id, 'roster.read_own_family');
$$;

create or replace function public.my_family_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct g.household_id
  from public.guardians g
  where g.id in (select public.my_family_guardian_ids()) and g.household_id is not null;
$$;

-- Players currently on an assigned team.
create or replace function public.my_team_player_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.player_id
  from public.team_memberships tm
  join public.players p on p.id = tm.player_id and p.archived_at is null
  where tm.ended_at is null and tm.team_id in (select public.my_assigned_team_ids());
$$;

-- Players in the family's household, or linked directly to the family's guardian record.
create or replace function public.my_family_player_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.players p
  where p.archived_at is null and p.household_id in (select public.my_family_household_ids())
  union
  select pg.player_id from public.player_guardians pg
  join public.players p on p.id = pg.player_id and p.archived_at is null
  where pg.guardian_id in (select public.my_family_guardian_ids());
$$;

create or replace function public.my_scoped_player_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_team_player_ids()
  union
  select public.my_family_player_ids();
$$;

create or replace function public.my_scoped_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_family_household_ids()
  union
  select p.household_id from public.players p
  where p.id in (select public.my_team_player_ids()) and p.household_id is not null;
$$;

-- Captains: guardians linked to their team's players. Families: their own
-- guardian record(s), the other guardians of their household, and guardians
-- linked to their players.
create or replace function public.my_scoped_guardian_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pg.guardian_id from public.player_guardians pg where pg.player_id in (select public.my_scoped_player_ids())
  union
  select public.my_family_guardian_ids()
  union
  select g.id from public.guardians g where g.household_id in (select public.my_family_household_ids());
$$;

-- Teams a scoped user may see: assigned teams, plus the current team of their own family's players.
create or replace function public.my_scoped_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_assigned_team_ids()
  union
  select tm.team_id from public.team_memberships tm
  where tm.ended_at is null and tm.player_id in (select public.my_family_player_ids());
$$;

-- Boolean helpers (org-wide roster.read OR scoped access).
create or replace function public.can_access_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.id = p_team_id
                 and (public.has_org_permission(t.organization_id, 'roster.read')
                      or t.id in (select public.my_scoped_team_ids())));
$$;

create or replace function public.can_access_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.players p where p.id = p_player_id
                 and (public.has_org_permission(p.organization_id, 'roster.read')
                      or p.id in (select public.my_scoped_player_ids())));
$$;

create or replace function public.can_access_household(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.households h where h.id = p_household_id
                 and (public.has_org_permission(h.organization_id, 'roster.read')
                      or h.id in (select public.my_scoped_household_ids())));
$$;

revoke all on function public.my_assigned_team_ids(), public.my_family_guardian_ids(), public.my_family_household_ids(),
  public.my_team_player_ids(), public.my_family_player_ids(), public.my_scoped_player_ids(), public.my_scoped_household_ids(),
  public.my_scoped_guardian_ids(), public.my_scoped_team_ids(),
  public.can_access_team(uuid), public.can_access_player(uuid), public.can_access_household(uuid) from public, anon;
grant execute on function public.my_assigned_team_ids(), public.my_family_guardian_ids(), public.my_family_household_ids(),
  public.my_team_player_ids(), public.my_family_player_ids(), public.my_scoped_player_ids(), public.my_scoped_household_ids(),
  public.my_scoped_guardian_ids(), public.my_scoped_team_ids(),
  public.can_access_team(uuid), public.can_access_player(uuid), public.can_access_household(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Scoped SELECT policies (permissive: OR'd with the org-wide roster.read ones)
-- -----------------------------------------------------------------------------

create policy teams_select_scoped on public.teams for select to authenticated
  using (id in (select public.my_scoped_team_ids()));
create policy players_select_scoped on public.players for select to authenticated
  using (id in (select public.my_scoped_player_ids()));
create policy households_select_scoped on public.households for select to authenticated
  using (id in (select public.my_scoped_household_ids()));
create policy guardians_select_scoped on public.guardians for select to authenticated
  using (id in (select public.my_scoped_guardian_ids()));
create policy player_guardians_select_scoped on public.player_guardians for select to authenticated
  using (player_id in (select public.my_scoped_player_ids()) and guardian_id in (select public.my_scoped_guardian_ids()));
-- Captains see only current memberships; families see their own players' history.
create policy team_memberships_select_scoped on public.team_memberships for select to authenticated
  using ((ended_at is null and player_id in (select public.my_team_player_ids()))
         or player_id in (select public.my_family_player_ids()));
-- Season names (not sensitive) so team context renders.
create policy seasons_select_scoped on public.seasons for select to authenticated
  using (public.has_org_permission(organization_id, 'roster.read_assigned_teams')
         or public.has_org_permission(organization_id, 'roster.read_own_family'));

-- -----------------------------------------------------------------------------
-- 5. Managing scope (members.manage)
-- -----------------------------------------------------------------------------

-- Replaces a member's set of assigned teams. Removed assignments are archived.
create or replace function public.set_team_staff_assignments(p_member_id uuid, p_team_ids uuid[], p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.organization_members;
  me uuid := auth.uid();
  wanted uuid[] := coalesce(p_team_ids, '{}');
  bad int;
  n int;
begin
  select * into m from public.organization_members where id = p_member_id;
  if not found then
    raise exception 'Member not found.' using errcode = 'no_data_found';
  end if;
  perform public.assert_org_permission(m.organization_id, 'members.manage');
  select count(*) into bad from unnest(wanted) t(id)
  where not exists (select 1 from public.teams x where x.id = t.id and x.organization_id = m.organization_id);
  if bad > 0 then
    raise exception 'One or more teams don’t belong to this organization.' using errcode = 'foreign_key_violation';
  end if;

  perform public.set_audit_reason(p_reason);
  update public.team_staff_assignments
     set archived_at = now(), archived_by = me
   where member_id = m.id and archived_at is null and not (team_id = any (wanted));
  insert into public.team_staff_assignments (organization_id, team_id, member_id, created_by)
  select m.organization_id, t.id, m.id, me
  from (select distinct unnest(wanted) as id) t
  where not exists (select 1 from public.team_staff_assignments a
                    where a.member_id = m.id and a.team_id = t.id and a.archived_at is null);
  perform public.set_audit_reason(null);

  select count(*) into n from public.team_staff_assignments where member_id = m.id and archived_at is null;
  return n;
end;
$$;

create or replace function public.link_family_guardian(p_member_id uuid, p_guardian_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.organization_members;
  g public.guardians;
  link_id uuid;
begin
  select * into m from public.organization_members where id = p_member_id;
  if not found then
    raise exception 'Member not found.' using errcode = 'no_data_found';
  end if;
  perform public.assert_org_permission(m.organization_id, 'members.manage');
  select * into g from public.guardians where id = p_guardian_id and organization_id = m.organization_id and archived_at is null;
  if not found then
    raise exception 'Guardian not found in this organization.' using errcode = 'foreign_key_violation';
  end if;
  if exists (select 1 from public.guardian_user_links where guardian_id = g.id and archived_at is null and member_id <> m.id) then
    raise exception 'That guardian is already linked to another account. Unlink it first.' using errcode = 'unique_violation';
  end if;
  select id into link_id from public.guardian_user_links where guardian_id = g.id and member_id = m.id and archived_at is null;
  if link_id is not null then
    return link_id;
  end if;
  perform public.set_audit_reason(p_reason);
  insert into public.guardian_user_links (organization_id, guardian_id, member_id, created_by)
  values (m.organization_id, g.id, m.id, auth.uid())
  returning id into link_id;
  perform public.set_audit_reason(null);
  return link_id;
end;
$$;

create or replace function public.unlink_family_guardian(p_link_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.guardian_user_links;
begin
  select * into l from public.guardian_user_links where id = p_link_id and archived_at is null;
  if not found then
    raise exception 'Link not found.' using errcode = 'no_data_found';
  end if;
  perform public.assert_org_permission(l.organization_id, 'members.manage');
  perform public.set_audit_reason(p_reason);
  update public.guardian_user_links set archived_at = now(), archived_by = auth.uid() where id = l.id;
  perform public.set_audit_reason(null);
end;
$$;

revoke all on function public.set_team_staff_assignments(uuid, uuid[], text), public.link_family_guardian(uuid, uuid, text),
  public.unlink_family_guardian(uuid, text) from public, anon;
grant execute on function public.set_team_staff_assignments(uuid, uuid[], text), public.link_family_guardian(uuid, uuid, text),
  public.unlink_family_guardian(uuid, text) to authenticated;

-- Member list now carries each member's scope (teams, linked guardians).
create or replace function public.list_org_members(
  p_organization_id uuid,
  p_q text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.assert_org_permission(p_organization_id, 'members.read');
  with base as (
    select m.id as member_id, m.user_id, m.status, m.created_at,
           p.full_name, p.email,
           coalesce((select array_agg(r.role_key order by ro.sort_order)
                     from public.organization_member_roles r join public.roles ro on ro.key = r.role_key
                     where r.member_id = m.id), '{}') as roles,
           coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
                     from public.team_staff_assignments a join public.teams t on t.id = a.team_id
                     where a.member_id = m.id and a.archived_at is null), '[]'::jsonb) as teams,
           coalesce((select jsonb_agg(jsonb_build_object('link_id', l.id, 'guardian_id', g.id,
                                                         'guardian_name', g.first_name || ' ' || g.last_name,
                                                         'household_name', h.name) order by g.last_name)
                     from public.guardian_user_links l
                     join public.guardians g on g.id = l.guardian_id
                     left join public.households h on h.id = g.household_id
                     where l.member_id = m.id and l.archived_at is null), '[]'::jsonb) as family_links
    from public.organization_members m
    left join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and m.status <> 'removed'
      and (nullif(btrim(p_q), '') is null
           or p.full_name ilike '%' || public.escape_like(btrim(p_q)) || '%'
           or p.email ilike '%' || public.escape_like(btrim(p_q)) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(b) order by lower(coalesce(b.full_name, b.email)), b.member_id)
      from (select * from base order by lower(coalesce(full_name, email)), member_id
            limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)) b
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Platform admin lockdown
--    Grants were already revoked (0100). Defense in depth: any write that
--    carries an end-user JWT is refused even if a grant is added by mistake,
--    and every change is audited (organization_id NULL = platform partition).
-- -----------------------------------------------------------------------------

revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated; -- RLS: own row only

create or replace function public.guard_platform_admin_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null or current_user in ('anon', 'authenticated') then
    raise exception 'Platform administrators can only be changed with privileged database access.'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger platform_admins_guard before insert or update or delete on public.platform_admins
  for each row execute function public.guard_platform_admin_write();

create or replace function public.audit_platform_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id,
                                   before_data, after_data, changed_fields, metadata)
  values (null, auth.uid(),
          case tg_op when 'INSERT' then 'PLATFORM_ADMIN_GRANTED' when 'DELETE' then 'PLATFORM_ADMIN_REVOKED' else 'PLATFORM_ADMIN_UPDATED' end,
          'platform_admins', coalesce(new.user_id, old.user_id),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          '{}', public.audit_context() || jsonb_build_object('db_user', session_user, 'db_role', current_user));
  return coalesce(new, old);
end;
$$;

create trigger platform_admins_audit after insert or update or delete on public.platform_admins
  for each row execute function public.audit_platform_admin_change();

-- -----------------------------------------------------------------------------
-- 7. Audit checkpoints (service role only) — used by scripts/audit-checkpoint.mjs
--    to export the chain head of every partition outside the database.
-- -----------------------------------------------------------------------------

create or replace function public.audit_checkpoint_rows()
returns table (
  organization_id uuid, organization_name text, organization_slug text,
  ok boolean, rows_checked bigint, first_bad_pos bigint, head_hash text, last_chain_pos bigint
)
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  o record;
begin
  for o in
    select x.id, x.name, x.slug from public.organizations x
    union all
    select null::uuid, '(platform)', null::text   -- organization_id IS NULL partition (platform events)
  loop
    return query
      select o.id, o.name, o.slug, v.ok, v.rows_checked, v.first_bad_pos, v.head_hash,
             (select max(a.chain_pos) from public.audit_events a where a.organization_id is not distinct from o.id)
      from public.verify_hash_chain('audit_events', 'organization_id', o.id) v;
  end loop;
end;
$$;

-- Hash stored at a chain position (to prove a later chain still contains a prior checkpoint's head).
create or replace function public.audit_chain_hash_at(p_organization_id uuid, p_chain_pos bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.row_hash from public.audit_events a
  where a.organization_id is not distinct from p_organization_id and a.chain_pos = p_chain_pos;
$$;

create or replace function public.audit_schema_version()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  begin
    execute 'select max(version) from supabase_migrations.schema_migrations' into v;
  exception when others then
    v := null;
  end;
  return v;
end;
$$;

revoke all on function public.audit_checkpoint_rows(), public.audit_chain_hash_at(uuid, bigint), public.audit_schema_version()
  from public, anon, authenticated;
grant execute on function public.audit_checkpoint_rows(), public.audit_chain_hash_at(uuid, bigint), public.audit_schema_version()
  to service_role;
