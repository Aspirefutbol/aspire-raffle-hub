-- pgTAP tests: tenant isolation, permission enforcement, audit, roster functions.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres; RLS bypassed)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'auditor-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'outsider@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', 'super@test.local');

insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000f1');

insert into public.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b');

insert into public.organization_members (id, organization_id, user_id) values
  ('60000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1'),
  ('60000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1');
insert into public.organization_member_roles (organization_id, member_id, role_key) values
  ('10000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-0000000000a1', 'ORGANIZATION_ADMIN'),
  ('10000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-0000000000a2', 'AUDITOR'),
  ('10000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-0000000000b1', 'ORGANIZATION_ADMIN');

insert into public.teams (id, organization_id, name) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'A Team'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A Team 2'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'B Team');

insert into public.households (id, organization_id, name) values
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'B Household');

insert into public.players (id, organization_id, first_name, last_name) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Ann', 'Alpha'),
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Bob', 'Beta');

-- Composite tenant FK: an Org A player cannot point at an Org B household.
select throws_ok(
  $$ insert into public.players (organization_id, household_id, first_name, last_name)
     values ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b', 'X', 'Y') $$,
  '23503', null, 'cross-tenant household reference is rejected by composite FK');

-- ---------------------------------------------------------------------------
-- Org A admin
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is((select count(*) from public.organizations)::int, 1, 'admin A sees only their organization');
select is((select count(*) from public.players)::int, 1, 'admin A sees only Org A players');
select is((select count(*) from public.player_directory)::int, 1, 'player_directory respects RLS');
select ok(public.has_org_permission('10000000-0000-0000-0000-00000000000a', 'roster.write'), 'admin A has roster.write in A');
select ok(not public.has_org_permission('10000000-0000-0000-0000-00000000000b', 'roster.read'), 'admin A has no access to B');

select lives_ok(
  $$ insert into public.players (organization_id, first_name, last_name)
     values ('10000000-0000-0000-0000-00000000000a', 'New', 'Player') $$,
  'admin A can create a player in A');

select throws_ok(
  $$ insert into public.players (organization_id, first_name, last_name)
     values ('10000000-0000-0000-0000-00000000000b', 'Sneaky', 'Write') $$,
  '42501', null, 'admin A cannot create a player in B');

select throws_ok($$ select public.roster_overview('10000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'roster_overview refuses another organization');

select throws_ok($$ delete from public.players where id = '40000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'players cannot be hard-deleted');

-- Transactional create_player with new household + guardian + team
select lives_ok($$
  select public.create_player(
    '10000000-0000-0000-0000-00000000000a',
    '{"first_name":"Cara","last_name":"Gamma","date_of_birth":"2012-01-02"}',
    '20000000-0000-0000-0000-00000000000a',
    '{"name":"Gamma Household"}',
    '{"first_name":"Gail","last_name":"Gamma","email":"gail@example.test","relationship":"mother"}')
$$, 'create_player succeeds');

select is((select count(*) from public.player_directory
           where first_name = 'Cara' and team_name = 'A Team' and household_name = 'Gamma Household'
             and primary_guardian_email = 'gail@example.test')::int, 1,
          'create_player linked team, household and primary guardian');

select is((select is_primary_contact from public.guardians where email = 'gail@example.test'), true,
          'first guardian becomes household primary contact');

-- Team change preserves history
select ok(public.set_player_team('10000000-0000-0000-0000-00000000000a',
          (select id from public.players where first_name = 'Cara'), '20000000-0000-0000-0000-0000000000a2'),
          'set_player_team changes team');
select is((select count(*) from public.team_memberships
           where player_id = (select id from public.players where first_name = 'Cara'))::int, 2,
          'team history keeps the previous membership');
select is((select count(*) from public.team_memberships
           where player_id = (select id from public.players where first_name = 'Cara') and ended_at is null)::int, 1,
          'exactly one current team');

select is(public.bulk_set_player_team('10000000-0000-0000-0000-00000000000a',
          array['40000000-0000-0000-0000-00000000000a'::uuid, '40000000-0000-0000-0000-00000000000b'::uuid],
          '20000000-0000-0000-0000-00000000000a'), 1,
          'bulk team assignment only touches players in the caller''s organization');

-- Audit trail written by triggers
select ok(exists (select 1 from public.audit_events where action = 'PLAYER_CREATED'
                  and after_data ->> 'first_name' = 'Cara'), 'PLAYER_CREATED audited');
select ok(exists (select 1 from public.audit_events where action = 'PLAYER_TEAM_CHANGED'
                  and metadata ->> 'to_team_id' = '20000000-0000-0000-0000-0000000000a2'), 'PLAYER_TEAM_CHANGED audited');

select throws_ok($$ insert into public.audit_events (organization_id, action, entity_type)
                    values ('10000000-0000-0000-0000-00000000000a', 'FAKE_EVENT', 'x') $$,
  '42501', null, 'clients cannot write audit events');
select throws_ok($$ delete from public.audit_events $$, '42501', null, 'clients cannot delete audit events');

update public.players set archived_at = now(), status = 'archived'
 where id = (select id from public.players where first_name = 'Cara');
select ok(exists (select 1 from public.audit_events where action = 'PLAYER_ARCHIVED'), 'PLAYER_ARCHIVED audited');
select is((select count(*) from public.team_memberships
           where player_id = (select id from public.players where first_name = 'Cara') and ended_at is null)::int, 0,
          'archiving a player ends their current membership');

-- Import commit: one new player with guardian, one use-existing, one error
insert into public.imports (id, organization_id, file_name, status, row_count)
values ('50000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'roster.csv', 'validated', 3);
insert into public.import_rows (organization_id, import_id, row_number, raw, data, status, resolution, household_key, match_player_id, match_type) values
  ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', 1, '{}',
   '{"first_name":"Dee","last_name":"Delta","team_id":"20000000-0000-0000-0000-00000000000a","guardian1_first_name":"Don","guardian1_last_name":"Delta","guardian1_email":"don@example.test"}',
   'ready', 'create', 'new:don@example.test', null, 'NEW_RECORD'),
  ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', 2, '{}',
   '{"first_name":"Ann","last_name":"Alpha"}', 'duplicate', 'use_existing', null,
   '40000000-0000-0000-0000-00000000000a', 'EXACT_MATCH'),
  ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', 3, '{}',
   '{"first_name":""}', 'error', null, null, null, null);

select is(public.commit_player_import('50000000-0000-0000-0000-00000000000a') ->> 'players_created', '1',
          'commit_player_import creates the ready row');
select is((select status from public.imports where id = '50000000-0000-0000-0000-00000000000a'), 'completed',
          'import marked completed');
select is((select count(*) from public.player_directory where first_name = 'Dee'
           and household_name = 'Delta Household' and team_name = 'A Team')::int, 1,
          'imported player got household and team');
select ok(exists (select 1 from public.audit_events where action = 'PLAYER_IMPORTED'), 'PLAYER_IMPORTED audited');
select throws_ok($$ select public.commit_player_import('50000000-0000-0000-0000-00000000000a') $$,
  '23514', null, 'a completed import cannot be committed twice');

-- ---------------------------------------------------------------------------
-- Org A auditor (read-only)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
select ok((select count(*) from public.players) > 0, 'auditor can read the roster');
select throws_ok(
  $$ insert into public.players (organization_id, first_name, last_name)
     values ('10000000-0000-0000-0000-00000000000a', 'Nope', 'Nope') $$,
  '42501', null, 'auditor cannot create players');

-- ---------------------------------------------------------------------------
-- Outsider and super admin
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select is((select count(*) from public.players)::int, 0, 'a user with no membership sees no players');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select is((select count(*) from public.organizations where slug in ('org-a', 'org-b'))::int, 2,
          'super admin sees every organization');

select * from finish();
rollback;
