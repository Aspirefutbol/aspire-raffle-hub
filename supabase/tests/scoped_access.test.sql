-- pgTAP: scoped roles (Team Manager/Captain, Seller/Family), platform-admin
-- lockdown, and audit checkpoint RPCs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000dd001', 'sc-admin@test.local', now()),
  ('00000000-0000-0000-0000-0000000dd002', 'sc-director@test.local', now()),
  ('00000000-0000-0000-0000-0000000dd003', 'captain-a@test.local', now()),
  ('00000000-0000-0000-0000-0000000dd004', 'captain-none@test.local', now()),
  ('00000000-0000-0000-0000-0000000dd005', 'family-a@test.local', now()),
  ('00000000-0000-0000-0000-0000000dd006', 'family-b@test.local', now()),
  ('00000000-0000-0000-0000-0000000dd007', 'sc-platform@test.local', now()),
  ('00000000-0000-0000-0000-0000000dd008', 'captain-orgb@test.local', now()),
  ('00000000-0000-0000-0000-0000000dd009', 'new-platform@test.local', now());

insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000dd007');

insert into public.organizations (id, name, slug) values
  ('30000000-0000-0000-0000-00000000000a', 'Scope Org A', 'scope-a'),
  ('30000000-0000-0000-0000-00000000000b', 'Scope Org B', 'scope-b');

insert into public.organization_members (id, organization_id, user_id) values
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000dd001'),
  ('80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000dd002'),
  ('80000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000dd003'),
  ('80000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000dd004'),
  ('80000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000dd005'),
  ('80000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000dd006'),
  ('80000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000dd001'),
  ('80000000-0000-0000-0000-0000000000b8', '30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000dd008');
insert into public.organization_member_roles (organization_id, member_id, role_key) values
  ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000001', 'ORGANIZATION_ADMIN'),
  ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'DIRECTOR'),
  ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000003', 'TEAM_CAPTAIN'),
  ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000004', 'TEAM_CAPTAIN'),
  ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'PARTICIPANT_FAMILY'),
  ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000006', 'PARTICIPANT_FAMILY'),
  ('30000000-0000-0000-0000-00000000000b', '80000000-0000-0000-0000-0000000000b1', 'ORGANIZATION_ADMIN'),
  ('30000000-0000-0000-0000-00000000000b', '80000000-0000-0000-0000-0000000000b8', 'TEAM_CAPTAIN');

-- Org A: Team A (household A, player A1, guardian GA), Team B (household B, player B1, guardian GB).
insert into public.teams (id, organization_id, name) values
  ('31000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'Team A'),
  ('31000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000a', 'Team B'),
  ('31000000-0000-0000-0000-0000000000bb', '30000000-0000-0000-0000-00000000000b', 'Other Org Team');
insert into public.households (id, organization_id, name) values
  ('32000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'Household A'),
  ('32000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000a', 'Household B');
insert into public.guardians (id, organization_id, household_id, first_name, last_name, email) values
  ('33000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', '32000000-0000-0000-0000-00000000000a', 'Gina', 'Alpha', 'gina@a.test'),
  ('33000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000a', '32000000-0000-0000-0000-00000000000b', 'Gus', 'Bravo', 'gus@b.test');
insert into public.players (id, organization_id, household_id, first_name, last_name) values
  ('34000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-00000000000a', '32000000-0000-0000-0000-00000000000a', 'Ana', 'Alpha'),
  ('34000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000a', '32000000-0000-0000-0000-00000000000b', 'Ben', 'Bravo');
insert into public.team_memberships (organization_id, player_id, team_id) values
  ('30000000-0000-0000-0000-00000000000a', '34000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-00000000000a', '34000000-0000-0000-0000-0000000000b1', '31000000-0000-0000-0000-00000000000b');
insert into public.player_guardians (organization_id, player_id, guardian_id, relationship, is_primary) values
  ('30000000-0000-0000-0000-00000000000a', '34000000-0000-0000-0000-0000000000a1', '33000000-0000-0000-0000-00000000000a', 'parent', true),
  ('30000000-0000-0000-0000-00000000000a', '34000000-0000-0000-0000-0000000000b1', '33000000-0000-0000-0000-00000000000b', 'parent', true);

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.as_db_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
create or replace function pg_temp.n(p_sql text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into c;
  return c;
end;
$$;
create or replace function pg_temp.n_dml(p_sql text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'with q as (' || p_sql || ') select count(*) from q' into c;
  return c;
end;
$$;
grant execute on function pg_temp.n(text), pg_temp.n_dml(text) to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Admin assigns scope (members.manage), with validation and audit
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd001');
select is(public.set_team_staff_assignments('80000000-0000-0000-0000-000000000003', array['31000000-0000-0000-0000-00000000000a'::uuid], 'Coaches Team A'),
  1, 'admin assigns Captain A to Team A');
select throws_ok($$ select public.set_team_staff_assignments('80000000-0000-0000-0000-000000000003', array['31000000-0000-0000-0000-0000000000bb'::uuid]) $$,
  '23503', null, 'a team from another organization cannot be assigned');
select lives_ok($$ select public.link_family_guardian('80000000-0000-0000-0000-000000000005', '33000000-0000-0000-0000-00000000000a', 'Verified parent') $$,
  'admin links Family A to guardian Gina (Household A)');
select lives_ok($$ select public.link_family_guardian('80000000-0000-0000-0000-000000000006', '33000000-0000-0000-0000-00000000000b') $$,
  'admin links Family B to guardian Gus (Household B)');
select throws_ok($$ select public.link_family_guardian('80000000-0000-0000-0000-000000000006', '33000000-0000-0000-0000-00000000000a') $$,
  '23505', null, 'a guardian already linked to another account cannot be linked again');
select is((select count(*)::int from public.audit_events where action = 'TEAM_STAFF_CREATED' and metadata ->> 'reason' = 'Coaches Team A'),
  1, 'team assignment is audited with its reason');
select is((select count(*)::int from public.audit_events where action = 'FAMILY_LINK_CREATED' and metadata ->> 'reason' = 'Verified parent'),
  1, 'family link is audited with its reason');

-- Admin / Director keep org-wide access.
select is(pg_temp.n('select 1 from public.players where organization_id = ''30000000-0000-0000-0000-00000000000a'''), 2::bigint, 'admin still sees every player');
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd002');
select is(pg_temp.n('select 1 from public.teams where organization_id = ''30000000-0000-0000-0000-00000000000a'''), 2::bigint, 'director still sees every team');
select throws_ok($$ select public.set_team_staff_assignments('80000000-0000-0000-0000-000000000004', array['31000000-0000-0000-0000-00000000000b'::uuid]) $$,
  '42501', null, 'director (no members.manage) cannot assign teams');

-- ---------------------------------------------------------------------------
-- 2. Captain A — assigned to Team A only
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd003');
select is(pg_temp.n('select 1 from public.teams where id = ''31000000-0000-0000-0000-00000000000a'''), 1::bigint, 'Captain A can read Team A');
select is(pg_temp.n('select 1 from public.teams where id = ''31000000-0000-0000-0000-00000000000b'''), 0::bigint, 'Captain A cannot read Team B');
select is(pg_temp.n('select 1 from public.teams'), 1::bigint, 'Captain A sees exactly one team');
select is(pg_temp.n('select 1 from public.players where id = ''34000000-0000-0000-0000-0000000000a1'''), 1::bigint, 'Captain A can read Team A players');
select is(pg_temp.n('select 1 from public.players where id = ''34000000-0000-0000-0000-0000000000b1'''), 0::bigint, 'Captain A cannot read Team B players');
select is(pg_temp.n('select 1 from public.player_directory'), 1::bigint, 'player directory shows Captain A only Team A players');
select is(pg_temp.n('select 1 from public.guardians where id = ''33000000-0000-0000-0000-00000000000a'''), 1::bigint, 'Captain A can read guardians of Team A players');
select is(pg_temp.n('select 1 from public.guardians where id = ''33000000-0000-0000-0000-00000000000b'''), 0::bigint, 'Captain A cannot read other guardians');
select is(pg_temp.n('select 1 from public.households where id = ''32000000-0000-0000-0000-00000000000a'''), 1::bigint, 'Captain A can read the household of a Team A player');
select is(pg_temp.n('select 1 from public.households where id = ''32000000-0000-0000-0000-00000000000b'''), 0::bigint, 'Captain A cannot read other households');
select is(pg_temp.n('select 1 from public.team_memberships'), 1::bigint, 'Captain A sees only current Team A memberships');
select ok(public.can_access_team('31000000-0000-0000-0000-00000000000a') and not public.can_access_team('31000000-0000-0000-0000-00000000000b'),
  'can_access_team: Team A yes, Team B no');
select ok(public.can_access_player('34000000-0000-0000-0000-0000000000a1') and not public.can_access_player('34000000-0000-0000-0000-0000000000b1'),
  'can_access_player: A1 yes, B1 no');
select ok(public.can_access_household('32000000-0000-0000-0000-00000000000a') and not public.can_access_household('32000000-0000-0000-0000-00000000000b'),
  'can_access_household: A yes, B no');
select ok(not public.has_org_permission('30000000-0000-0000-0000-00000000000a', 'roster.read'), 'Captain A holds no org-wide roster.read');
-- Direct API attempts are rejected, not just hidden.
select throws_ok($$ select public.roster_overview('30000000-0000-0000-0000-00000000000a') $$, '42501', null, 'Captain A cannot call the org-wide roster overview');
select throws_ok($$ select public.list_households('30000000-0000-0000-0000-00000000000a') $$, '42501', null, 'Captain A cannot list all households');
select throws_ok($$ insert into public.players (organization_id, first_name, last_name) values ('30000000-0000-0000-0000-00000000000a', 'Sneaky', 'Add') $$,
  '42501', null, 'Captain A cannot insert players');
select throws_ok($$ select public.create_player('30000000-0000-0000-0000-00000000000a', '{"first_name":"X","last_name":"Y"}'::jsonb) $$,
  '42501', null, 'Captain A cannot create players through the RPC');
select is(pg_temp.n_dml($q$ update public.players set notes = 'hacked' where id = '34000000-0000-0000-0000-0000000000a1' returning 1 $q$), 0::bigint,
  'Captain A cannot update even a visible player (0 rows)');
select throws_ok($$ select public.set_team_staff_assignments('80000000-0000-0000-0000-000000000003', array['31000000-0000-0000-0000-00000000000b'::uuid]) $$,
  '42501', null, 'Captain A cannot assign themselves another team');
select throws_ok($$ insert into public.team_staff_assignments (organization_id, team_id, member_id) values
  ('30000000-0000-0000-0000-00000000000a', '31000000-0000-0000-0000-00000000000b', '80000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'Captain A cannot insert an assignment directly');

-- A captain with no assignment sees nothing.
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd004');
select is(pg_temp.n('select 1 from public.teams') + pg_temp.n('select 1 from public.players') + pg_temp.n('select 1 from public.guardians'),
  0::bigint, 'an unassigned captain sees no teams, players or guardians');

-- A captain in another organization sees nothing in Org A.
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd008');
select is(pg_temp.n('select 1 from public.players where organization_id = ''30000000-0000-0000-0000-00000000000a'''), 0::bigint,
  'a captain in another organization sees no Org A players');

-- ---------------------------------------------------------------------------
-- 3. Families — own household only
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd005');
select is(pg_temp.n('select 1 from public.households where id = ''32000000-0000-0000-0000-00000000000a'''), 1::bigint, 'Family A can read its own household');
select is(pg_temp.n('select 1 from public.players where id = ''34000000-0000-0000-0000-0000000000a1'''), 1::bigint, 'Family A can read its own player');
select is(pg_temp.n('select 1 from public.households where id = ''32000000-0000-0000-0000-00000000000b'''), 0::bigint, 'Family A cannot read Family B household');
select is(pg_temp.n('select 1 from public.players where id = ''34000000-0000-0000-0000-0000000000b1'''), 0::bigint, 'Family A cannot read Family B player');
select is(pg_temp.n('select 1 from public.guardians'), 1::bigint, 'Family A sees only its own guardian record');
select is(pg_temp.n('select 1 from public.teams'), 1::bigint, 'Family A sees only its own player''s current team');
select is(pg_temp.n('select 1 from public.player_directory'), 1::bigint, 'player directory shows Family A only its own player');
select throws_ok($$ insert into public.guardians (organization_id, first_name, last_name) values ('30000000-0000-0000-0000-00000000000a', 'X', 'Y') $$,
  '42501', null, 'Family A cannot insert guardians');
select throws_ok($$ select public.link_family_guardian('80000000-0000-0000-0000-000000000005', '33000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'Family A cannot link itself to another family');
select is(pg_temp.n_dml($q$ update public.households set name = 'Mine now' where id = '32000000-0000-0000-0000-00000000000a' returning 1 $q$), 0::bigint,
  'Family A cannot update its own household (read-only scope)');

select pg_temp.as_user('00000000-0000-0000-0000-0000000dd006');
select is(pg_temp.n('select 1 from public.players where id = ''34000000-0000-0000-0000-0000000000b1'''), 1::bigint, 'Family B can read its own player');
select is(pg_temp.n('select 1 from public.players where id = ''34000000-0000-0000-0000-0000000000a1'''), 0::bigint, 'Family B cannot read Family A player');

-- ---------------------------------------------------------------------------
-- 4. Scope ends when the assignment, role, or membership ends
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd001');
select is(public.set_team_staff_assignments('80000000-0000-0000-0000-000000000003', '{}'::uuid[], 'Season over'), 0, 'admin removes Captain A''s teams');
select is((select count(*)::int from public.team_staff_assignments where member_id = '80000000-0000-0000-0000-000000000003' and archived_at is not null),
  1, 'removed assignment is archived, not deleted');
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd003');
select is(pg_temp.n('select 1 from public.players'), 0::bigint, 'Captain A loses access when unassigned');

select pg_temp.as_user('00000000-0000-0000-0000-0000000dd001');
select lives_ok($$ select public.set_member_status('80000000-0000-0000-0000-000000000005', 'suspended', 'Paused') $$, 'admin suspends Family A');
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd005');
select is(pg_temp.n('select 1 from public.players'), 0::bigint, 'a suspended family loses access');

select pg_temp.as_user('00000000-0000-0000-0000-0000000dd001');
select lives_ok($$ select public.unlink_family_guardian((select id from public.guardian_user_links where member_id = '80000000-0000-0000-0000-000000000006' and archived_at is null), 'Wrong account') $$,
  'admin unlinks Family B');
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd006');
select is(pg_temp.n('select 1 from public.players'), 0::bigint, 'an unlinked family loses access');

-- ---------------------------------------------------------------------------
-- 5. Platform admin lockdown
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.platform_admins', 'insert')
          and not has_table_privilege('authenticated', 'public.platform_admins', 'update')
          and not has_table_privilege('authenticated', 'public.platform_admins', 'delete')
          and not has_table_privilege('anon', 'public.platform_admins', 'insert'),
  'authenticated and anon hold no write privilege on platform_admins');

select pg_temp.as_user('00000000-0000-0000-0000-0000000dd001');
select throws_ok($$ insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000dd001') $$,
  '42501', null, 'Org Admin cannot create a platform admin');
select throws_ok($$ select public.set_member_roles('80000000-0000-0000-0000-000000000001', array['ORGANIZATION_ADMIN', 'SUPER_ADMIN']) $$,
  '23514', 'Unknown role: SUPER_ADMIN', 'role assignment cannot grant SUPER_ADMIN');
select throws_ok($$ insert into public.organization_member_roles (organization_id, member_id, role_key) values
  ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000001', 'SUPER_ADMIN') $$,
  '42501', null, 'SUPER_ADMIN cannot be inserted as an organization role');
select throws_ok($$ select public.add_organization_member('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000dd009', array['SUPER_ADMIN']) $$,
  '23514', 'Unknown role: SUPER_ADMIN', 'adding a member cannot grant SUPER_ADMIN');
select is(pg_temp.n('select 1 from public.platform_admins'), 0::bigint, 'Org Admin cannot see platform admin records');
select ok(not public.is_platform_admin(), 'Org Admin is still not a platform admin');

select pg_temp.as_user('00000000-0000-0000-0000-0000000dd002');
select throws_ok($$ insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000dd002') $$,
  '42501', null, 'Director cannot create a platform admin');

select pg_temp.as_user('00000000-0000-0000-0000-0000000dd007');
select is(pg_temp.n('select 1 from public.platform_admins'), 1::bigint, 'a platform admin can read only their own record');
select throws_ok($$ insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000dd009') $$,
  '42501', null, 'even a platform admin cannot add platform admins through the API');
select throws_ok($$ delete from public.platform_admins where user_id = '00000000-0000-0000-0000-0000000dd007' $$,
  '42501', null, 'a platform admin cannot remove platform admins through the API');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and has_function_privilege('authenticated', p.oid, 'execute')
             and pg_get_functiondef(p.oid) ~* '(insert\s+into|update|delete\s+from)\s+public\.platform_admins'),
  0, 'no client-callable SECURITY DEFINER function writes platform_admins');

-- Defense in depth: even if someone mistakenly grants INSERT, the trigger refuses JWT callers.
reset role;
grant insert on public.platform_admins to authenticated;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd001');
select throws_ok($$ insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000dd001') $$,
  '42501', null, 'the guard trigger blocks JWT callers even with a mistaken grant');
reset role;
revoke insert on public.platform_admins from authenticated;

-- Privileged database access (no end-user JWT) can manage platform admins, and it is audited.
select pg_temp.as_db_admin();
select public.set_audit_reason('Onboarding a platform operator (test)');
select lives_ok($$ insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000dd009') $$,
  'privileged database access can add a platform admin');
select is((select metadata ->> 'reason' from public.audit_events where action = 'PLATFORM_ADMIN_GRANTED'
           and entity_id = '00000000-0000-0000-0000-0000000dd009' and organization_id is null),
  'Onboarding a platform operator (test)', 'platform admin grant is audited in the platform partition with its reason');
select lives_ok($$ delete from public.platform_admins where user_id = '00000000-0000-0000-0000-0000000dd009' $$,
  'privileged database access can remove a platform admin');
select is((select count(*)::int from public.audit_events where action = 'PLATFORM_ADMIN_REVOKED' and entity_id = '00000000-0000-0000-0000-0000000dd009'),
  1, 'platform admin removal is audited');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$ insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000dd009') $$,
  'the service role (server-side, no user) can add a platform admin');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Audit checkpoint RPCs (service role only)
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000dd001');
select throws_ok($$ select * from public.audit_checkpoint_rows() $$, '42501', null, 'end users cannot run the audit checkpoint');
select throws_ok($$ select public.audit_chain_hash_at('30000000-0000-0000-0000-00000000000a', 1) $$, '42501', null, 'end users cannot read raw chain hashes');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok((select bool_and(ok) from public.audit_checkpoint_rows()), 'every chain verifies in the checkpoint');
select is((select head_hash from public.audit_checkpoint_rows() where organization_id = '30000000-0000-0000-0000-00000000000a'),
  public.audit_chain_hash_at('30000000-0000-0000-0000-00000000000a',
    (select last_chain_pos from public.audit_checkpoint_rows() where organization_id = '30000000-0000-0000-0000-00000000000a')),
  'checkpoint head equals the stored hash at the last chain position');
select ok((select rows_checked > 0 and head_hash is not null from public.audit_checkpoint_rows() where organization_id is null),
  'the platform partition (platform admin changes) is included and verified');
reset role;

select * from finish();
rollback;
