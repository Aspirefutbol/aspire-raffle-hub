-- Phase 1: enrollment, participant-owned stock, offline issuance, corrections,
-- explicit read scopes, composite integrity, and append-only audit/ledgers.
-- Fixture identifiers are deliberately known to every test actor: hiding IDs
-- is never relied upon for authorization. All fixture state rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(267);

create function pg_temp.id(p_key text) returns uuid language sql immutable as $$
  select md5('raffle-pgtap-fundraising:' || p_key)::uuid;
$$;
create function pg_temp.as_user(p_key text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', pg_temp.id('user-' || p_key), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_db_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.participant(p_campaign text, p_player text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.campaign_participants
  where campaign_id = pg_temp.id('campaign-' || p_campaign)
    and player_id = pg_temp.id('player-' || p_player);
$$;
create function pg_temp.n(p_sql text) returns bigint language plpgsql as $$
declare result bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into result;
  return result;
end;
$$;
create temporary table sale_results (label text primary key, result jsonb not null);
create temporary table test_values (label text primary key, value jsonb not null);
grant select, insert, update on pg_temp.sale_results, pg_temp.test_values to authenticated;
create function pg_temp.sale(p_label text) returns uuid language sql stable as $$
  select (result ->> 'sale_id')::uuid from pg_temp.sale_results where label = p_label;
$$;
create function pg_temp.state(p_campaign text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sales', (select count(*) from public.campaign_sales where campaign_id = pg_temp.id('campaign-' || p_campaign)),
    'tickets', (select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-' || p_campaign)),
    'issued', (select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-' || p_campaign) and status = 'ISSUED'),
    'voided', (select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-' || p_campaign) and status = 'VOIDED'),
    'allocated', (select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-' || p_campaign) and status = 'ALLOCATED'),
    'allocations', (select count(*) from public.ticket_allocations where campaign_id = pg_temp.id('campaign-' || p_campaign)),
    'counter', (select next_sequence from public.campaign_ticket_counters where campaign_id = pg_temp.id('campaign-' || p_campaign)),
    'ticket_head', (select max(chain_pos) from public.ticket_events where campaign_id = pg_temp.id('campaign-' || p_campaign)),
    'money_head', (select max(chain_pos) from public.money_events where campaign_id = pg_temp.id('campaign-' || p_campaign)),
    'audit_head', (select max(chain_pos) from public.audit_events where organization_id = pg_temp.id('org-a'))
  );
$$;

create function pg_temp.retry(p_quantity integer default 2, p_name text default 'Buyer family-first',
  p_payment text default 'cash', p_notes text default 'First offline collection',
  p_participant uuid default null, p_campaign uuid default null)
returns jsonb language sql as $$
  select public.record_campaign_sale(pg_temp.id('org-a'), coalesce(p_campaign, pg_temp.id('campaign-main')),
    coalesce(p_participant, pg_temp.participant('main', 'a1')), 'family-first', p_name,
    p_quantity, p_quantity::bigint * 500, p_payment, 'buyer@example.test', '555-0100', p_notes);
$$;

-- Independent actors keep the permission conjunctions observable. The three
-- mixed memberships hold broader read permissions but no org-wide sale right.
insert into auth.users (id, email, email_confirmed_at)
select pg_temp.id('user-' || actor), actor || '@fundraising.test', now()
from unnest(array['admin', 'director', 'manager', 'finance', 'captain',
  'family-a', 'family-b', 'dual', 'manager-family', 'auditor-family',
  'corrector', 'admin-director', 'outsider', 'unlinked', 'org-b-admin', 'shared-family']) actor;

insert into public.organizations (id, name, slug, legal_name, jurisdiction_profile,
  address_line1, city, region, support_email) values
  (pg_temp.id('org-a'), 'Fundraising Org A', 'fundraising-org-a', 'Fundraising Org A Inc',
    'TEXAS_CREA_OFFLINE_PAYMENT', '1 Test Street', 'Houston', 'TX', 'support@fundraising.test'),
  (pg_temp.id('org-b'), 'Fundraising Org B', 'fundraising-org-b', 'Fundraising Org B Inc',
    'TEXAS_CREA_OFFLINE_PAYMENT', '2 Test Street', 'Austin', 'TX', 'support@other.test');

insert into public.organization_members (id, organization_id, user_id)
select pg_temp.id('member-' || actor), pg_temp.id('org-a'), pg_temp.id('user-' || actor)
from unnest(array['admin', 'director', 'manager', 'finance', 'captain',
  'family-a', 'family-b', 'dual', 'manager-family', 'auditor-family',
  'corrector', 'admin-director', 'unlinked', 'shared-family']) actor;
insert into public.organization_members (id, organization_id, user_id) values
  (pg_temp.id('member-org-b-admin'), pg_temp.id('org-b'), pg_temp.id('user-org-b-admin'));
insert into public.organization_member_roles (organization_id, member_id, role_key)
select pg_temp.id('org-a'), pg_temp.id('member-' || actor), role_key
from (values
  ('admin', 'ORGANIZATION_ADMIN'), ('director', 'DIRECTOR'),
  ('manager', 'CAMPAIGN_MANAGER'), ('finance', 'FINANCE_ADMIN'), ('captain', 'TEAM_CAPTAIN'),
  ('family-a', 'PARTICIPANT_FAMILY'), ('family-b', 'PARTICIPANT_FAMILY'),
  ('shared-family', 'PARTICIPANT_FAMILY'), ('unlinked', 'PARTICIPANT_FAMILY'),
  ('dual', 'TEAM_CAPTAIN'), ('dual', 'PARTICIPANT_FAMILY'),
  ('manager-family', 'CAMPAIGN_MANAGER'), ('manager-family', 'PARTICIPANT_FAMILY'),
  ('auditor-family', 'AUDITOR'), ('auditor-family', 'PARTICIPANT_FAMILY'),
  ('corrector', 'CAMPAIGN_MANAGER'), ('corrector', 'DIRECTOR'),
  ('admin-director', 'ORGANIZATION_ADMIN'), ('admin-director', 'DIRECTOR')
) roles(actor, role_key);
insert into public.organization_member_roles (organization_id, member_id, role_key) values
  (pg_temp.id('org-b'), pg_temp.id('member-org-b-admin'), 'ORGANIZATION_ADMIN'),
  (pg_temp.id('org-b'), pg_temp.id('member-org-b-admin'), 'DIRECTOR');

insert into public.teams (id, organization_id, name) values
  (pg_temp.id('team-a'), pg_temp.id('org-a'), 'Fundraising Team A'),
  (pg_temp.id('team-b'), pg_temp.id('org-a'), 'Fundraising Team B'),
  (pg_temp.id('team-other'), pg_temp.id('org-b'), 'Other Tenant Team');
insert into public.households (id, organization_id, name) values
  (pg_temp.id('house-a'), pg_temp.id('org-a'), 'Family A Household'),
  (pg_temp.id('house-b'), pg_temp.id('org-a'), 'Family B Household'),
  (pg_temp.id('house-c'), pg_temp.id('org-a'), 'Unlinked Household'),
  (pg_temp.id('house-other'), pg_temp.id('org-b'), 'Other Tenant Household');
insert into public.guardians (id, organization_id, household_id, first_name, last_name)
select pg_temp.id('guardian-' || actor), pg_temp.id('org-a'), pg_temp.id('house-' || household), actor, 'Guardian'
from (values ('family-a', 'a'), ('shared-family', 'a'), ('manager-family', 'a'),
  ('family-b', 'b'), ('dual', 'b'), ('auditor-family', 'b')) guardians(actor, household);
insert into public.players (id, organization_id, household_id, first_name, last_name, status, archived_at)
values
  (pg_temp.id('player-a1'), pg_temp.id('org-a'), pg_temp.id('house-a'), 'Ana', 'Alpha', 'active', null),
  (pg_temp.id('player-a2'), pg_temp.id('org-a'), pg_temp.id('house-c'), 'Aria', 'Other', 'active', null),
  (pg_temp.id('player-b1'), pg_temp.id('org-a'), pg_temp.id('house-b'), 'Ben', 'Bravo', 'active', null),
  (pg_temp.id('player-b2'), pg_temp.id('org-a'), pg_temp.id('house-a'), 'Beth', 'Alpha', 'active', null),
  (pg_temp.id('player-archived'), pg_temp.id('org-a'), pg_temp.id('house-a'), 'Archived', 'Player', 'archived', now()),
  (pg_temp.id('player-other'), pg_temp.id('org-b'), pg_temp.id('house-other'), 'Other', 'Tenant', 'active', null);
insert into public.team_memberships (organization_id, player_id, team_id)
select pg_temp.id('org-a'), pg_temp.id('player-' || player), pg_temp.id('team-' || team)
from (values ('a1', 'a'), ('a2', 'a'), ('b1', 'b'), ('b2', 'b'), ('archived', 'a')) membership(player, team);
insert into public.team_memberships (organization_id, player_id, team_id) values
  (pg_temp.id('org-b'), pg_temp.id('player-other'), pg_temp.id('team-other'));
insert into public.team_staff_assignments (organization_id, team_id, member_id) values
  (pg_temp.id('org-a'), pg_temp.id('team-a'), pg_temp.id('member-captain')),
  (pg_temp.id('org-a'), pg_temp.id('team-a'), pg_temp.id('member-dual'));
insert into public.guardian_user_links (organization_id, guardian_id, member_id)
select pg_temp.id('org-a'), pg_temp.id('guardian-' || actor), pg_temp.id('member-' || actor)
from unnest(array['family-a', 'shared-family', 'manager-family', 'family-b', 'dual', 'auditor-family']) actor;

insert into public.campaigns (id, organization_id, name, ticket_price_cents, ticket_prefix,
  starts_at, sales_close_at, draw_at, default_allocation, goal_amount_cents,
  player_goal_default_cents, team_goal_default_cents)
select pg_temp.id('campaign-' || campaign), pg_temp.id('org-a'), 'Fundraising ' || campaign,
  500, prefix, now() - interval '1 day', now() + interval '10 days', now() + interval '11 days',
  4, 10000, 2000, 5000
from (values ('main', 'MAIN'), ('alt', 'ALT'), ('draft', 'DRAFT'), ('future', 'FUTURE')) campaigns(campaign, prefix);
insert into public.campaigns (id, organization_id, name, ticket_price_cents, ticket_prefix,
  starts_at, sales_close_at, draw_at, default_allocation, goal_amount_cents) values
  (pg_temp.id('campaign-other'), pg_temp.id('org-b'), 'Other Tenant Campaign', 500, 'OTHER',
    now() - interval '1 day', now() + interval '10 days', now() + interval '11 days', 4, 10000);

set local role authenticated;
select pg_temp.as_user('manager');

-- Selection modes use current active roster records and preserve enrollment
-- snapshots; retrying a selection never creates a second participant.
select is(public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  false, array[pg_temp.id('team-a')], '{}'), 2, 'campaign manager enrolls active Team A players only');
select is(public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  false, array[pg_temp.id('team-a')], '{}'), 0, 'duplicate team enrollment is idempotent');
select is(public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  false, '{}', array[pg_temp.id('player-a1'), pg_temp.id('player-b1')], 2500),
  2, 'explicit player selection adds the new player and updates the selected existing goal');
select is(public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'), true),
  1, 'all-active enrollment adds the remaining active player');
select is((select count(*) from public.campaign_participants where campaign_id = pg_temp.id('campaign-main')),
  4::bigint, 'the campaign has exactly four active participants');
select is((select count(*) from public.campaign_participants where player_id = pg_temp.id('player-archived')),
  0::bigint, 'archived roster players are excluded');
select is((select goal_amount_cents from public.campaign_participants where id = pg_temp.participant('main', 'b1')),
  2500, 'explicit participant goal is saved');
select is((select team_id from public.campaign_participants where id = pg_temp.participant('main', 'a1')),
  pg_temp.id('team-a'), 'participant snapshots the selected player team');
select is((select household_id from public.campaign_participants where id = pg_temp.participant('main', 'a1')),
  pg_temp.id('house-a'), 'participant snapshots the selected player household');
select throws_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  false, array[pg_temp.id('team-other')], '{}') $$, '23514', null, 'another tenant team cannot be enrolled');
select throws_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  false, '{}', array[pg_temp.id('player-other')]) $$, '23514', null, 'another tenant player cannot be enrolled');
select throws_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  false, '{}', array[pg_temp.id('player-a1')], -1) $$, '23514', null, 'negative player goals are rejected');
select lives_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-alt'), true) $$,
  'same organization can enroll players in a second campaign');
select lives_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-draft'),
  false, '{}', array[pg_temp.id('player-a1')]) $$, 'draft campaign has an enrollment for lifecycle denial checks');
select lives_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-future'),
  false, '{}', array[pg_temp.id('player-a1')]) $$, 'future campaign has an enrollment for window denial checks');

select pg_temp.as_user('family-a');
select throws_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'), true) $$,
  '42501', null, 'families cannot enroll or expand participant scope');
select pg_temp.as_user('captain');
select throws_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'), true) $$,
  '42501', null, 'captains cannot enroll or expand participant scope');
select pg_temp.as_user('finance');
select throws_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'), true) $$,
  '42501', null, 'finance role does not gain campaign setup permission');
select pg_temp.as_user('director');
select throws_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'), true) $$,
  '42501', null, 'director approval authority does not imply campaign management');

select pg_temp.as_user('admin-director');
update public.campaigns set starts_at = now() + interval '1 day', sales_close_at = now() + interval '10 days'
where id = pg_temp.id('campaign-future');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-main'), 'READY') $$,
  'main campaign is ready with valid ticket disclosures');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-main'), 'ACTIVE', 'Board approved fundraising fixture') $$,
  'director activates the main campaign with an audited reason');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-alt'), 'READY') $$, 'second campaign becomes ready');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-alt'), 'ACTIVE', 'Board approved second fixture') $$,
  'second campaign becomes active');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-future'), 'READY') $$, 'future raffle becomes ready');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-future'), 'ACTIVE', 'Board approved future fixture') $$,
  'future raffle is active before its sales window opens');

-- Stock is generated once, assigned to a participant, and shared by that
-- participant's currently linked guardians. Sale recording cannot mint stock.
select pg_temp.as_user('manager');
select is(public.generate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 3),
  3, 'manager generates initial available ticket stock');
select is(public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-main')),
  16, 'default preparation assigns four tickets to each of four players');
select is(public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-main')),
  0, 'repeating default preparation assigns no duplicate inventory');
select is((select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-main')),
  16::bigint, 'preparation generates only the missing campaign stock');
select is((select count(distinct ticket_number) from public.tickets where campaign_id = pg_temp.id('campaign-main')),
  16::bigint, 'generated ticket numbers are unique per campaign');
select is((select count(*) from public.ticket_allocations where campaign_id = pg_temp.id('campaign-main')),
  4::bigint, 'each initial participant has one immutable allocation');
select is((select count(*) from public.tickets where participant_id = pg_temp.participant('main', 'a1') and status = 'ALLOCATED'),
  4::bigint, 'Family A player has an assigned pool of four tickets');
select is((select count(*) from public.ticket_events where campaign_id = pg_temp.id('campaign-main') and event_type = 'ALLOCATED'),
  16::bigint, 'each allocated ticket has a canonical ledger event');
select lives_ok($$ select public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-alt')) $$,
  'second campaign receives separate assigned stock');
select throws_ok($$ select public.generate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 0) $$,
  '23514', null, 'zero generated stock is rejected');
select throws_ok($$ select public.generate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 10001) $$,
  '23514', null, 'generation above the bounded batch size is rejected');
select throws_ok($$ select public.generate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-draft'), 1) $$,
  '23514', null, 'draft raffle cannot receive issued stock');
select throws_ok($$ select public.allocate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('alt', 'a1'), 1) $$, '23514', null, 'allocation cannot use a participant from another campaign in the same organization');
select throws_ok($$ select public.allocate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 1) $$, '23514', null, 'allocation fails rather than manufacturing unassigned stock');
select lives_ok($$ select public.set_campaign_participant_goal(pg_temp.id('org-a'), pg_temp.participant('main', 'b2'), 3000) $$,
  'campaign manager can set a player goal');
select lives_ok($$ select public.set_campaign_team_goal(pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.id('team-a'), 7500) $$,
  'campaign manager can set a team goal');
select throws_ok($$ select public.set_campaign_participant_goal(pg_temp.id('org-a'), pg_temp.participant('main', 'b2'), -1) $$,
  '23514', null, 'participant goal cannot be negative');
select throws_ok($$ select public.set_campaign_team_goal(pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.id('team-other'), 7500) $$,
  '23514', null, 'a team goal cannot reference another tenant');

select pg_temp.as_user('family-a');
select throws_ok($$ select public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$,
  '42501', null, 'family cannot replenish its own assigned inventory');
select throws_ok($$ select public.allocate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 1) $$, '42501', null, 'family cannot assign campaign inventory');
select pg_temp.as_user('captain');
select throws_ok($$ select public.generate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 1) $$,
  '42501', null, 'captain read access cannot create ticket stock');

select pg_temp.as_user('family-a');
select ok(public.can_issue_campaign_participant(pg_temp.id('org-a'), pg_temp.participant('main', 'a1')),
  'linked family can issue for its enrolled player');
select ok(not public.can_issue_campaign_participant(pg_temp.id('org-a'), pg_temp.participant('main', 'a2')),
  'linked family cannot issue for an unrelated teammate');
select lives_ok($$
  insert into pg_temp.sale_results values ('family-first', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'),
    ' family-first ', ' Buyer family-first ', 2, 1000, ' CASH ',
    ' BUYER@EXAMPLE.TEST ', ' 555-0100 ', ' First offline collection '))
$$, 'family records an offline sale against its assigned player inventory');
select is((select (result ->> 'quantity')::integer from pg_temp.sale_results where label = 'family-first'),
  2, 'sale response contains the exact ticket quantity');
select is((select jsonb_array_length(result -> 'ticket_numbers') from pg_temp.sale_results where label = 'family-first'),
  2, 'two unique issued ticket numbers are returned');
select is((select result ->> 'replayed' from pg_temp.sale_results where label = 'family-first'),
  'false', 'first issuance is a new sale');
select is((select buyer_name from public.campaign_sales where id = pg_temp.sale('family-first')),
  'Buyer family-first', 'buyer name is trimmed');
select is((select buyer_email from public.campaign_sales where id = pg_temp.sale('family-first')),
  'buyer@example.test', 'optional buyer email is normalized');
select is((select created_by from public.campaign_sales where id = pg_temp.sale('family-first')),
  pg_temp.id('user-family-a'), 'sale attribution comes from the authenticated caller');
select is((select count(*) from public.tickets where sale_id = pg_temp.sale('family-first') and status = 'ISSUED'),
  2::bigint, 'issued inventory is attributed to the sale');

reset role;
select pg_temp.as_db_admin();
select is((select count(*) from public.money_events where metadata ->> 'sale_id' = pg_temp.sale('family-first')::text
  and event_type = 'SALE_COLLECTED' and amount_cents = 1000), 1::bigint,
  'sale collection appends one positive money event');
select is((select count(*) from public.ticket_events where metadata ->> 'sale_id' = pg_temp.sale('family-first')::text
  and event_type = 'ISSUED'), 2::bigint, 'every issued ticket appends an issuance event');
select is((select count(*) from public.audit_events where action = 'SALE_CREATED' and entity_id = pg_temp.sale('family-first')
  and actor_id = pg_temp.id('user-family-a')), 1::bigint, 'sale creation is audited with the real seller');
select ok(exists (select 1 from public.audit_events where action = 'MONEY_EVENT_CREATED'
  and actor_id = pg_temp.id('user-family-a') and metadata ->> 'reason' = 'First offline collection'),
  'money collection is audited with the recorded note');

set local role authenticated;
select pg_temp.as_user('family-a');
insert into pg_temp.test_values values ('before-retry', pg_temp.state('main'));
select lives_ok($$
  insert into pg_temp.sale_results values ('family-retry', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'),
    'family-first', 'Buyer family-first', 2, 1000, 'cash',
    'buyer@example.test', '555-0100', 'First offline collection'))
$$, 'normalized exact retry succeeds');
select is(pg_temp.sale('family-retry'), pg_temp.sale('family-first'), 'exact retry returns the existing sale identity');
select is((select result -> 'ticket_numbers' from pg_temp.sale_results where label = 'family-retry'),
  (select result -> 'ticket_numbers' from pg_temp.sale_results where label = 'family-first'),
  'retry returns the same ticket numbers');
select is((select result ->> 'replayed' from pg_temp.sale_results where label = 'family-retry'),
  'true', 'exact retry explicitly reports replay');
select is(pg_temp.state('main'), (select value from pg_temp.test_values where label = 'before-retry'),
  'retry changes no sales, stock, allocations, ledger positions, or audit positions');

select throws_ok($$ select pg_temp.retry(1) $$, '23505', null, 'retry key cannot change quantity or collected amount');
select throws_ok($$ select pg_temp.retry(p_name => 'Different buyer') $$, '23505', null, 'retry key cannot change buyer');
select throws_ok($$ select pg_temp.retry(p_payment => 'check') $$, '23505', null, 'retry key cannot change payment method');
select throws_ok($$ select pg_temp.retry(p_notes => 'Changed note') $$, '23505', null, 'retry key cannot change notes');
select throws_ok($$ select pg_temp.retry(p_participant => pg_temp.participant('main', 'b2')) $$,
  '23505', null, 'retry key cannot be moved to another owned participant');
select throws_ok($$ select pg_temp.retry(p_participant => pg_temp.participant('alt', 'a1'), p_campaign => pg_temp.id('campaign-alt')) $$,
  '23505', null, 'caller-bound retry key cannot be moved to a different campaign');

insert into pg_temp.test_values values ('before-invalid', pg_temp.state('main'));
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-empty-buyer', '', 1, 500, 'cash') $$,
  '23514', null, 'sale needs a buyer name');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-buyer-length', repeat('x', 201), 1, 500, 'cash') $$,
  '23514', null, 'buyer name has a bounded length');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), '', 'Buyer', 1, 500, 'cash') $$,
  '23514', null, 'empty retry key is rejected');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), repeat('k', 201), 'Buyer', 1, 500, 'cash') $$,
  '23514', null, 'retry key has a bounded length');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-quantity', 'Buyer', 0, 500, 'cash') $$,
  '23514', null, 'ticket quantity must be positive');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-quantity-bound', 'Buyer', 501, 250500, 'cash') $$,
  '23514', null, 'ticket sale quantity is bounded');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-amount', 'Buyer', 1, 0, 'cash') $$,
  '23514', null, 'zero collected amount is rejected');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-price', 'Buyer', 1, 499, 'cash') $$,
  '23514', null, 'sale amount must equal ticket face value');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-card', 'Buyer', 1, 500, 'card') $$,
  '23514', null, 'online or card payment cannot enter the cash/check workflow');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-email', 'Buyer', 1, 500, 'cash', 'buyer@@invalid') $$,
  '23514', null, 'malformed optional buyer email is rejected');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-phone', 'Buyer', 1, 500, 'cash', null, repeat('1', 51)) $$,
  '23514', null, 'buyer phone has a bounded length');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-notes', 'Buyer', 1, 500, 'cash', null, null, repeat('n', 2001)) $$,
  '23514', null, 'sale notes have a bounded length');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-date-before', 'Buyer', 1, 500, 'cash', p_sold_at => now() - interval '2 days') $$,
  '23514', null, 'sale timestamp cannot predate the sales window');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-date-future', 'Buyer', 1, 500, 'cash', p_sold_at => now() + interval '1 hour') $$,
  '23514', null, 'sale cannot be backdated into the future');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'bad-date-infinite', 'Buyer', 1, 500, 'cash', p_sold_at => 'infinity'::timestamptz) $$,
  '23514', null, 'nonfinite sale timestamp is rejected');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'oversell', 'Buyer', 5, 2500, 'cash') $$,
  '23514', null, 'family cannot oversell its assigned stock');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-draft'),
  pg_temp.participant('draft', 'a1'), 'bad-draft', 'Buyer', 1, 500, 'cash') $$,
  '23514', null, 'new sale requires an active campaign');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-future'),
  pg_temp.participant('future', 'a1'), 'bad-future-window', 'Buyer', 1, 500, 'cash') $$,
  '23514', null, 'active campaign still requires an open sales window');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('alt', 'a1'), 'bad-cross-campaign', 'Buyer', 1, 500, 'cash') $$,
  'P0002', null, 'sale cannot reference a same-organization participant from a different campaign');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-other'),
  pg_temp.participant('main', 'a1'), 'bad-tenant-campaign', 'Buyer', 1, 500, 'cash') $$,
  'P0002', null, 'campaign identifier must belong to the supplied organization');
select is(pg_temp.state('main'), (select value from pg_temp.test_values where label = 'before-invalid'),
  'all invalid sales leave inventory, ledger heads, audit heads, and sale facts unchanged');

-- A broad read permission never becomes an org-wide issuance permission.
select pg_temp.as_user('captain');
select is((select count(*) from public.campaign_participants where campaign_id = pg_temp.id('campaign-main')),
  2::bigint, 'captain sees only two participants on its assigned team');
select is((select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-main')),
  8::bigint, 'captain sees only assigned-team inventory');
select is((select count(*) from public.campaign_sales where campaign_id = pg_temp.id('campaign-main')),
  0::bigint, 'captain cannot read raw buyer records for teammates');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'captain-issue', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'captain read access does not confer ticket issuance');

select pg_temp.as_user('dual');
select ok(public.can_access_player(pg_temp.id('player-a1')), 'Captain plus Family can read an assigned-team player');
select ok(not public.can_issue_campaign_participant(pg_temp.id('org-a'), pg_temp.participant('main', 'a1')),
  'Captain plus Family cannot issue for that unrelated teammate');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'dual-widen', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'captain scope cannot widen the family write scope');
select lives_ok($$
  insert into pg_temp.sale_results values ('dual-own', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'b1'),
    'dual-own', 'Buyer dual own family', 1, 500, 'cash'))
$$, 'Captain plus Family issues for its own family outside the assigned team');

select pg_temp.as_user('shared-family');
select lives_ok($$
  insert into pg_temp.sale_results values ('shared-own', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'),
    'family-first', 'Buyer shared guardian', 1, 500, 'check'))
$$, 'second linked guardian shares the same participant inventory pool');
select isnt(pg_temp.sale('shared-own'), pg_temp.sale('family-first'),
  'same text retry key from a different seller is not another seller sale replay');
select is((select count(*) from public.tickets where participant_id = pg_temp.participant('main', 'a1') and status = 'ALLOCATED'),
  1::bigint, 'shared guardian sale consumes the same remaining assigned pool');

select pg_temp.as_user('manager-family');
select ok(public.has_org_permission(pg_temp.id('org-a'), 'campaigns.read'), 'Campaign Manager plus Family has broad campaign reads');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a2'), 'manager-family-widen', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'campaign management cannot widen family issuance to other players');
select lives_ok($$
  insert into pg_temp.sale_results values ('manager-own', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'),
    'manager-own', 'Buyer manager own family', 1, 500, 'cash'))
$$, 'Campaign Manager plus Family can still issue for its own household');

select pg_temp.as_user('auditor-family');
select ok(public.has_org_permission(pg_temp.id('org-a'), 'audit.read'), 'Auditor plus Family holds org-wide audit reads');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a2'), 'auditor-family-widen', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'audit read access cannot widen family issuance');
select lives_ok($$
  insert into pg_temp.sale_results values ('auditor-own', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'b1'),
    'auditor-own', 'Buyer auditor own family', 1, 500, 'check'))
$$, 'Auditor plus Family can issue only for its own linked player');

select pg_temp.as_user('family-b');
select lives_ok($$
  insert into pg_temp.sale_results values ('family-b-own', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'b1'),
    'family-b-own', 'Secret Buyer Family B', 1, 500, 'cash', 'private-buyer@other.test'))
$$, 'second family records its own participant sale');
select is((select count(*) from public.campaign_sales where campaign_id = pg_temp.id('campaign-main')),
  3::bigint, 'Family B sees only its three shared-household sale facts');
select is((select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-main')),
  4::bigint, 'Family B sees only its own household inventory');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'family-b-other', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'Family B cannot record a sale for Family A');

select pg_temp.as_user('family-a');
select lives_ok($$
  insert into pg_temp.sale_results values ('family-cross-team', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'b2'),
    'family-cross-team', 'Buyer own child in another team', 1, 500, 'cash'))
$$, 'family issuance follows its household across teams');
select is((select count(*) from public.campaign_sales where campaign_id = pg_temp.id('campaign-main')),
  4::bigint, 'Family A sees only sales belonging to its two enrolled children');
select is((select count(*) from public.ticket_allocations where campaign_id = pg_temp.id('campaign-main')),
  2::bigint, 'Family A cannot enumerate unrelated allocations');
select is((select count(*) from public.campaign_sales where id = pg_temp.sale('family-b-own')),
  0::bigint, 'unrelated family buyer record is hidden even with a known sale ID');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'exhausted-pool', 'Buyer', 1, 500, 'cash') $$,
  '23514', null, 'participant pool is exhausted across all its linked sellers');

select pg_temp.as_user('admin');
select lives_ok($$
  insert into pg_temp.sale_results values ('admin-other-player', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a2'),
    'admin-other-player', 'Buyer administrative sale', 1, 500, 'cash'))
$$, 'organization admin can record an authorized org-wide manual sale');
select is((select count(*) from public.campaign_sales where campaign_id = pg_temp.id('campaign-main')),
  8::bigint, 'admin can read all eight immutable sale facts');

select pg_temp.as_user('manager');
select is((select count(*) from public.campaign_sales where campaign_id = pg_temp.id('campaign-main')),
  0::bigint, 'campaign management alone does not disclose raw buyer records');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a2'), 'manager-issue', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'Campaign Manager alone cannot issue tickets');
select pg_temp.as_user('finance');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a2'), 'finance-issue', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'finance reconciliation permission alone cannot issue tickets');
select pg_temp.as_user('director');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a2'), 'director-issue', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'Director approval authority alone cannot issue tickets');
select pg_temp.as_user('unlinked');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'unlinked-issue', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'unlinked family account has no participant issuance scope');
select pg_temp.as_user('outsider');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'outsider-issue', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'authenticated outsider cannot record tenant sales');
select pg_temp.as_user('org-b-admin');
select is((select count(*) from public.campaign_sales where campaign_id = pg_temp.id('campaign-main')),
  0::bigint, 'other-tenant admin cannot read known campaign sale facts');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'other-org-issue', 'Buyer', 1, 500, 'cash') $$,
  '42501', null, 'other-tenant admin cannot issue against this organization');

-- Setting the RPC's private context cannot restore revoked table privileges.
select pg_temp.as_user('family-a');
select set_config('raffle_hub.fundraising_write', pg_temp.id('campaign-main')::text, true);
select throws_ok($$ insert into public.ticket_allocations (organization_id, campaign_id, participant_id, quantity)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'), 1) $$,
  '42501', null, 'spoofed write context cannot create an allocation');
select throws_ok($$ update public.tickets set ticket_number = 'HACKED' where participant_id = pg_temp.participant('main', 'a1') $$,
  '42501', null, 'spoofed write context cannot change ticket identity');
select throws_ok($$ update public.campaign_sales set notes = 'rewritten' where id = pg_temp.sale('family-first') $$,
  '42501', null, 'family cannot overwrite immutable financial history');
select throws_ok($$ delete from public.campaign_sales where id = pg_temp.sale('family-first') $$,
  '42501', null, 'family cannot hard-delete sale history');
select throws_ok($$ update public.campaign_participants set goal_amount_cents = 1 where id = pg_temp.participant('main', 'a1') $$,
  '42501', null, 'family cannot overwrite participant facts directly');
select throws_ok($$ update public.campaign_team_goals set goal_amount_cents = 1 where campaign_id = pg_temp.id('campaign-main') $$,
  '42501', null, 'family cannot change a team fundraising goal');
select throws_ok($$ select * from public.campaign_ticket_counters $$,
  '42501', null, 'internal campaign counters are not an unscoped client read surface');

-- Every read model applies its requested scope before totals, filters, ranks,
-- and recent sales. Raw buyer fields are excluded from all progress responses.
select pg_temp.as_user('admin');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'raised_cents')::bigint,
  4500::bigint, 'admin campaign total is the nine tickets collected at face value');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'tickets_sold')::bigint,
  9::bigint, 'admin campaign sold quantity is the sum of all sales');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'player_count')::integer,
  4, 'admin sees four participating players');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'team_count')::integer,
  2, 'admin sees two participating teams');
select is((select (item ->> 'goal_amount_cents')::bigint from jsonb_array_elements(
  public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'teams') item
  where item ->> 'id' = pg_temp.id('team-a')::text), 7500::bigint, 'explicit team goal appears in its projection');
select is((select (item ->> 'goal_amount_cents')::bigint from jsonb_array_elements(
  public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'teams') item
  where item ->> 'id' = pg_temp.id('team-b')::text), 5000::bigint, 'unspecified team goal falls back to campaign default');
select is((select (item ->> 'goal_amount_cents')::bigint from jsonb_array_elements(
  public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'participants') item
  where item ->> 'player_id' = pg_temp.id('player-b2')::text), 3000::bigint, 'participant goal override appears in progress');
select is((select (item ->> 'goal_amount_cents')::bigint from jsonb_array_elements(
  public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'participants') item
  where item ->> 'player_id' = pg_temp.id('player-a2')::text), 2000::bigint, 'unspecified participant goal uses the campaign default');
select ok(not exists (select 1 from jsonb_array_elements(
  public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'recent_sales') item
  where item ?| array['buyer_name', 'buyer_email', 'buyer_phone', 'notes']),
  'progress responses redact buyer contacts and private notes even for admin');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'admin',
  p_player_id => pg_temp.id('player-b1')) -> 'totals' ->> 'raised_cents')::bigint,
  1500::bigint, 'admin player filter recomputes totals for the selected participant');
select is(jsonb_array_length(public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  'admin', p_player_id => pg_temp.id('player-other')) -> 'participants'), 0,
  'other-tenant player filter returns no participant metadata');

select pg_temp.as_user('family-a');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family') -> 'totals' ->> 'raised_cents')::bigint,
  2500::bigint, 'Family A total includes only its two children across teams');
select is(jsonb_array_length(public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family') -> 'participants'),
  2, 'Family A progress contains only its own two participants');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family',
  pg_temp.id('team-b')) -> 'totals' ->> 'raised_cents')::bigint,
  500::bigint, 'family team filter cannot include an unrelated family in that team');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family',
  p_player_id => pg_temp.id('player-b1')) -> 'totals' ->> 'raised_cents')::bigint,
  0::bigint, 'known unrelated player filter cannot expand family totals');
select is(jsonb_array_length(public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family',
  p_player_id => pg_temp.id('player-b1')) -> 'recent_sales'), 0,
  'unrelated family filter reveals no recent-sale metadata');
select ok(not exists (select 1 from jsonb_array_elements(public.fundraising_campaigns(pg_temp.id('org-a'), 'family')) item
  where item -> 'campaign' ->> 'id' = pg_temp.id('campaign-draft')::text),
  'family campaign list cannot disclose a draft campaign');
select throws_ok($$ select public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-draft'), 'family') $$,
  '42501', null, 'direct family lookup cannot disclose draft campaign details');
select throws_ok($$ select public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'admin') $$,
  '42501', null, 'family cannot request the admin progress mode');
select throws_ok($$ select public.campaign_progress(pg_temp.id('org-b'), pg_temp.id('campaign-other'), 'family') $$,
  '42501', null, 'family read RPC cannot cross tenants');
select throws_ok($$ select public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'everything') $$,
  '22023', null, 'unknown progress mode is rejected');

select pg_temp.as_user('dual');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'team') -> 'totals' ->> 'raised_cents')::bigint,
  2500::bigint, 'dual member team mode includes only the assigned team');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family') -> 'totals' ->> 'raised_cents')::bigint,
  1500::bigint, 'dual member family mode includes only its own household');
select is(jsonb_array_length(public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family') -> 'participants'),
  1, 'captain role cannot add teammates to explicit family mode');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'team',
  pg_temp.id('team-b')) -> 'totals' ->> 'raised_cents')::bigint,
  0::bigint, 'family access to Team B cannot expand explicit captain team mode');
select pg_temp.as_user('manager-family');
select is(jsonb_array_length(public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family') -> 'participants'),
  2, 'Campaign Manager read authority does not expand explicit family projection');
select pg_temp.as_user('auditor-family');
select is(jsonb_array_length(public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family') -> 'participants'),
  1, 'Auditor read authority does not expand explicit family projection');
select pg_temp.as_user('captain');
select throws_ok($$ select public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'admin') $$,
  '42501', null, 'captain cannot request org-wide admin totals');
select throws_ok($$ select public.fundraising_campaigns(pg_temp.id('org-a'), 'family') $$,
  '42501', null, 'captain without family role cannot request a family workspace');

-- Correcting a receipt is two explicit append-only transactions: an approved
-- reversal, then an authorized replacement consuming fresh assigned stock.
select pg_temp.as_user('family-a');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'premature-correction', 'Buyer corrected', 1, 500, 'cash',
  p_corrects_sale_id => pg_temp.sale('family-first')) $$,
  '23514', null, 'a correction cannot precede the original sale approved reversal');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), 'Wrong buyer') $$,
  '42501', null, 'family cannot approve its own reversal');
select pg_temp.as_user('admin');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), 'Wrong buyer') $$,
  '42501', null, 'Org Admin alone has void permission but not approval authority');
select pg_temp.as_user('director');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), 'Wrong buyer') $$,
  '42501', null, 'Director alone has approval authority but not ticket void permission');
select pg_temp.as_user('finance');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), 'Wrong buyer') $$,
  '42501', null, 'Finance role does not gain void or approval permissions');
select pg_temp.as_user('corrector');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), '') $$,
  '23514', null, 'reversal requires an explanatory reason');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), repeat('r', 501)) $$,
  '23514', null, 'reversal reason has a bounded length');
insert into pg_temp.test_values values ('before-reversal', pg_temp.state('main'));
select lives_ok($$
  insert into pg_temp.test_values values ('approved-reversal', to_jsonb(public.reverse_campaign_sale(
    pg_temp.id('org-a'), pg_temp.sale('family-first'), 'Buyer name corrected after review')))
$$, 'Campaign Manager plus Director can approve one atomic reversal');
select is(public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), 'Authorized retry'),
  (select (value #>> '{}')::uuid from pg_temp.test_values where label = 'approved-reversal'),
  'repeated authorized reversal returns its original identity');

reset role;
select pg_temp.as_db_admin();
select is((select count(*) from public.sale_reversals where sale_id = pg_temp.sale('family-first')),
  1::bigint, 'only one reversal fact exists for the original sale');
select is((select approved_by from public.sale_reversals where sale_id = pg_temp.sale('family-first')),
  pg_temp.id('user-corrector'), 'reversal stores the authenticated approval authority');
select is((select amount_cents from public.money_events where reverses_event_id =
  (select collection_event_id from public.campaign_sales where id = pg_temp.sale('family-first'))),
  -1000::bigint, 'reversal money is the negative original collection');
select is((select count(*) from public.ticket_events where event_type = 'VOIDED'
  and ticket_id in (select id from public.tickets where sale_id = pg_temp.sale('family-first'))),
  2::bigint, 'reversal appends one void event for each issued ticket');
select is((select count(*) from public.tickets where sale_id = pg_temp.sale('family-first') and status = 'VOIDED'),
  2::bigint, 'original ticket numbers stay permanently voided');
select is((select count(*) from public.campaign_sales where id = pg_temp.sale('family-first') and amount_cents = 1000 and quantity = 2),
  1::bigint, 'reversal leaves the original immutable sale intact');
select ok(exists (select 1 from public.audit_events where action = 'SALE_REVERSAL_CREATED'
  and actor_id = pg_temp.id('user-corrector') and metadata ->> 'reason' = 'Buyer name corrected after review'),
  'reversal is audited with approver and reason');

set local role authenticated;
select pg_temp.as_user('admin');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'raised_cents')::bigint,
  3500::bigint, 'approved reversal reduces campaign amount raised');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'tickets_sold')::bigint,
  7::bigint, 'approved reversal reduces valid sold ticket quantity');
select is(public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-main')),
  0, 'default preparation counts issued and voided tickets toward original allotment');
select pg_temp.as_user('family-a');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'correction-without-stock', 'Buyer corrected', 2, 1000, 'cash',
  p_corrects_sale_id => pg_temp.sale('family-first')) $$,
  '23514', null, 'approved correction cannot reuse voided stock or issue without a fresh allocation');

select pg_temp.as_user('manager');
select is(public.generate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 3),
  3, 'manager adds fresh numbered stock for an approved correction');
select lives_ok($$ select public.allocate_campaign_tickets(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 2) $$, 'manager explicitly assigns fresh stock to the corrected participant');
select pg_temp.as_user('family-a');
select lives_ok($$
  insert into pg_temp.sale_results values ('replacement', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'),
    'replacement', 'Buyer corrected after approval', 2, 1000, 'cash',
    p_corrects_sale_id => pg_temp.sale('family-first')))
$$, 'original authorized family records a replacement after approved reversal');
select ok(not exists (select 1 from jsonb_array_elements_text(
  (select result -> 'ticket_numbers' from pg_temp.sale_results where label = 'replacement')) number
  where number in (select jsonb_array_elements_text(result -> 'ticket_numbers')
    from pg_temp.sale_results where label = 'family-first')),
  'replacement receives fresh ticket numbers rather than reusing voided numbers');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'a1'), 'second-replacement', 'Another correction', 1, 500, 'cash',
  p_corrects_sale_id => pg_temp.sale('family-first')) $$,
  '23505', null, 'a reversed sale can have only one replacement');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'b2'), 'wrong-player-correction', 'Correction', 1, 500, 'cash',
  p_corrects_sale_id => pg_temp.sale('family-first')) $$,
  '23514', null, 'approved correction cannot move the sale to another owned participant');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-alt'),
  pg_temp.participant('alt', 'a1'), 'wrong-campaign-correction', 'Correction', 1, 500, 'cash',
  p_corrects_sale_id => pg_temp.sale('family-first')) $$,
  '23514', null, 'approved correction cannot move a sale to another campaign in the same organization');
select lives_ok($$
  insert into pg_temp.sale_results values ('alt-sale', public.record_campaign_sale(
    pg_temp.id('org-a'), pg_temp.id('campaign-alt'), pg_temp.participant('alt', 'a1'),
    'alt-sale', 'Buyer second campaign', 1, 500, 'cash'))
$$, 'same player can independently sell assigned stock in another campaign');

reset role;
select pg_temp.as_db_admin();
insert into public.money_events (organization_id, campaign_id, participant_id, event_type, amount_cents, payment_method)
values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'), 'TURN_IN', 700, 'cash');
set local role authenticated;
select pg_temp.as_user('admin');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'raised_cents')::bigint,
  4500::bigint, 'progress nets replacements and reversals without double-counting custody turn-ins');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'tickets_sold')::bigint,
  9::bigint, 'replacement restores only its new valid ticket quantity');
select is((select sum(amount_cents) from public.money_events where campaign_id = pg_temp.id('campaign-main')
  and event_type in ('SALE_COLLECTED', 'REVERSAL')), 4500::numeric,
  'sale collection and reversal ledger net agrees with the fundraising projection');
select is((select (item ->> 'raised_cents')::bigint from jsonb_array_elements(
  public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-alt')) -> 'participants') item
  where item ->> 'player_id' = pg_temp.id('player-a2')::text), 0::bigint,
  'enrolled zero-sale players stay visible with zero progress');

-- Privileged fixtures bypass only the transaction-context guard so genuine
-- relational constraints, immutable identities, and append-only triggers are
-- tested rather than merely the authenticated privilege rejection above.
reset role;
select pg_temp.as_db_admin();
select set_config('raffle_hub.fundraising_write', pg_temp.id('campaign-main')::text, true);
insert into pg_temp.test_values values ('before-bad-references', pg_temp.state('main'));
select throws_ok($$ insert into public.ticket_allocations (organization_id, campaign_id, participant_id, quantity, created_by)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('alt', 'a1'), 1, pg_temp.id('user-admin')) $$,
  '23503', null, 'allocation composite FK rejects a same-tenant different-campaign participant');
select throws_ok($$ insert into public.money_events (organization_id, campaign_id, participant_id, event_type, amount_cents, payment_method)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('alt', 'a1'), 'SALE_COLLECTED', 500, 'cash') $$,
  '23503', null, 'money participant composite FK rejects same-tenant different-campaign attribution');
select throws_ok($$ insert into public.campaign_sales (organization_id, campaign_id, participant_id,
  buyer_name, quantity, amount_cents, payment_method, created_by, idempotency_key, request_fingerprint, collection_event_id)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('alt', 'a1'),
    'Bad reference', 1, 500, 'cash', pg_temp.id('user-admin'), 'bad-reference-participant', 'fixture',
    (select collection_event_id from public.campaign_sales where id = pg_temp.sale('shared-own'))) $$,
  '23503', null, 'sale participant composite FK rejects a same-tenant different-campaign participant');
select throws_ok($$ insert into public.campaign_sales (organization_id, campaign_id, participant_id,
  buyer_name, quantity, amount_cents, payment_method, created_by, idempotency_key, request_fingerprint, collection_event_id)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'),
    'Bad collection', 1, 500, 'cash', pg_temp.id('user-admin'), 'bad-reference-collection', 'fixture',
    (select collection_event_id from public.campaign_sales where id = pg_temp.sale('alt-sale'))) $$,
  '23503', null, 'sale collection composite FK rejects a money event from another campaign');
select throws_ok($$ insert into public.campaign_sales (organization_id, campaign_id, participant_id,
  buyer_name, quantity, amount_cents, payment_method, created_by, idempotency_key, request_fingerprint, collection_event_id, corrects_sale_id)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'b1'),
    'Bad correction', 1, 500, 'cash', pg_temp.id('user-admin'), 'bad-reference-correction', 'fixture',
    (select collection_event_id from public.campaign_sales where id = pg_temp.sale('family-b-own')), pg_temp.sale('shared-own')) $$,
  '23503', null, 'correction composite FK rejects a different participant within the same campaign');
select throws_ok($$ insert into public.tickets (organization_id, campaign_id, sequence_number, ticket_number,
  status, participant_id, allocation_id, sale_id, created_by)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), 999, 'BAD-SALE', 'ISSUED', pg_temp.participant('main', 'a1'),
    (select id from public.ticket_allocations where participant_id = pg_temp.participant('main', 'a1') limit 1),
    pg_temp.sale('alt-sale'), pg_temp.id('user-admin')) $$,
  '23503', null, 'ticket sale composite FK rejects a different campaign sale');
select throws_ok($$ insert into public.tickets (organization_id, campaign_id, sequence_number, ticket_number,
  status, participant_id, allocation_id, created_by)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), 999, 'BAD-ALLOCATION', 'ALLOCATED', pg_temp.participant('main', 'a1'),
    (select id from public.ticket_allocations where participant_id = pg_temp.participant('alt', 'a1') limit 1), pg_temp.id('user-admin')) $$,
  '23503', null, 'ticket allocation composite FK rejects a different campaign allocation');
select throws_ok($$ insert into public.tickets (organization_id, campaign_id, sequence_number, ticket_number, created_by)
  values (pg_temp.id('org-b'), pg_temp.id('campaign-main'), 999, 'BAD-TENANT', pg_temp.id('user-admin')) $$,
  '23503', null, 'ticket campaign composite FK rejects another organization');
select set_config('raffle_hub.fundraising_write', pg_temp.id('campaign-alt')::text, true);
select throws_ok($$ insert into public.sale_reversals (organization_id, campaign_id, sale_id, collection_event_id,
  reversal_event_id, reason, created_by, approved_by)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-alt'), pg_temp.sale('shared-own'),
    (select collection_event_id from public.campaign_sales where id = pg_temp.sale('alt-sale')),
    (select collection_event_id from public.campaign_sales where id = pg_temp.sale('alt-sale')),
    'Bad campaign reference', pg_temp.id('user-corrector'), pg_temp.id('user-corrector')) $$,
  '23503', null, 'reversal sale composite FK rejects a same-tenant different-campaign sale');
select set_config('raffle_hub.fundraising_write', pg_temp.id('campaign-main')::text, true);
select throws_ok($$ insert into public.tickets (organization_id, campaign_id, sequence_number, ticket_number, created_by)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), 1, 'DUPLICATE-SEQUENCE', pg_temp.id('user-admin')) $$,
  '23505', null, 'unique constraint prevents a second ticket with the same campaign sequence');
select throws_ok($$ insert into public.tickets (organization_id, campaign_id, sequence_number, ticket_number, created_by)
  values (pg_temp.id('org-a'), pg_temp.id('campaign-main'), 999,
    (select ticket_number from public.tickets where campaign_id = pg_temp.id('campaign-main') order by sequence_number limit 1), pg_temp.id('user-admin')) $$,
  '23505', null, 'unique constraint prevents a second ticket with the same campaign number');
select throws_ok($$ update public.campaign_sales set amount_cents = 1 where id = pg_temp.sale('family-first') $$,
  '42501', null, 'even privileged writes cannot rewrite a historical sale');
select throws_ok($$ delete from public.campaign_sales where id = pg_temp.sale('family-first') $$,
  '42501', null, 'even privileged writes cannot delete a historical sale');
select throws_ok($$ update public.ticket_allocations set quantity = 1 where participant_id = pg_temp.participant('main', 'a1') $$,
  '42501', null, 'allocation history is immutable even for privileged callers');
select throws_ok($$ delete from public.sale_reversals where sale_id = pg_temp.sale('family-first') $$,
  '42501', null, 'approved reversal history cannot be deleted');
select throws_ok($$ update public.tickets set ticket_number = 'RENAMED' where sale_id = pg_temp.sale('family-first') $$,
  '42501', null, 'ticket identity is immutable after issuance');
select throws_ok($$ update public.tickets set status = 'ISSUED' where sale_id = pg_temp.sale('family-first') $$,
  '23514', null, 'voided tickets cannot transition back to issued');
select throws_ok($$ delete from public.tickets where sale_id = pg_temp.sale('family-first') $$,
  '42501', null, 'issued and voided tickets are never hard-deleted');
select throws_ok($$ update public.campaign_participants set team_id = pg_temp.id('team-b')
  where id = pg_temp.participant('main', 'a1') $$,
  '42501', null, 'enrollment team snapshot cannot be rewritten');
select is(pg_temp.state('main'), (select value from pg_temp.test_values where label = 'before-bad-references'),
  'failed references and forbidden mutations leave sales, counters, and chains unchanged');

-- Current authorization is re-evaluated even for an already committed retry.
set local role authenticated;
select pg_temp.as_user('admin');
select lives_ok($$ select public.unlink_family_guardian(
  (select id from public.guardian_user_links where member_id = pg_temp.id('member-family-a') and archived_at is null), 'Access revoked') $$,
  'admin can revoke a family guardian link');
select pg_temp.as_user('family-a');
select is((select count(*) from public.campaign_sales where campaign_id = pg_temp.id('campaign-main')),
  0::bigint, 'revoked family link immediately hides raw sale facts');
select is(jsonb_array_length(public.fundraising_campaigns(pg_temp.id('org-a'), 'family')),
  0, 'revoked family link immediately removes its fundraising campaigns');
select throws_ok($$ select pg_temp.retry() $$, '42501', null, 'revoked guardian cannot obtain a cached sale retry');
select pg_temp.as_user('admin');
select lives_ok($$ select public.link_family_guardian(pg_temp.id('member-family-a'), pg_temp.id('guardian-family-a'), 'Access restored') $$,
  'family account can be safely relinked');
select pg_temp.as_user('family-a');
select lives_ok($$ select pg_temp.retry() $$, 'authorized exact retry works after family relinking');

select pg_temp.as_user('admin');
select lives_ok($$ select public.set_member_status(pg_temp.id('member-family-a'), 'suspended', 'Temporary suspension') $$,
  'admin can suspend a family membership');
select pg_temp.as_user('family-a');
select throws_ok($$ select pg_temp.retry() $$, '42501', null, 'suspended membership cannot receive a cached sale response');
select throws_ok($$ select public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family') $$,
  '42501', null, 'suspended membership cannot read progress');
select pg_temp.as_user('admin');
select lives_ok($$ select public.set_member_status(pg_temp.id('member-family-a'), 'active', 'Membership restored') $$,
  'admin can restore a family membership');

reset role;
select pg_temp.as_db_admin();
delete from public.organization_member_roles where member_id = pg_temp.id('member-family-a') and role_key = 'PARTICIPANT_FAMILY';
set local role authenticated;
select pg_temp.as_user('family-a');
select throws_ok($$ select pg_temp.retry() $$, '42501', null, 'revoked family role cannot receive an existing sale replay');
reset role;
select pg_temp.as_db_admin();
insert into public.organization_member_roles (organization_id, member_id, role_key)
values (pg_temp.id('org-a'), pg_temp.id('member-family-a'), 'PARTICIPANT_FAMILY');
update public.organizations set status = 'suspended' where id = pg_temp.id('org-a');
set local role authenticated;
select pg_temp.as_user('family-a');
select throws_ok($$ select pg_temp.retry() $$, '42501', null, 'suspended organization cannot return a cached sale replay');
select is((select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-main')),
  0::bigint, 'suspended organization hides its assigned ticket inventory');
reset role;
select pg_temp.as_db_admin();
update public.organizations set status = 'active' where id = pg_temp.id('org-a');

set local role authenticated;
select pg_temp.as_user('admin');
select lives_ok($$ select public.set_team_staff_assignments(pg_temp.id('member-captain'), '{}', 'Team access revoked') $$,
  'admin can revoke a captain assignment');
select pg_temp.as_user('captain');
select is(jsonb_array_length(public.fundraising_campaigns(pg_temp.id('org-a'), 'team')),
  0, 'revoked captain assignment removes all team fundraising campaigns');
select is((select count(*) from public.tickets where campaign_id = pg_temp.id('campaign-main')),
  0::bigint, 'revoked captain cannot read former team tickets');
select pg_temp.as_user('admin');
select lives_ok($$ select public.set_team_staff_assignments(pg_temp.id('member-captain'), array[pg_temp.id('team-a')], 'Team access restored') $$,
  'admin can restore a captain assignment');
select lives_ok($$ select public.set_player_team(pg_temp.id('org-a'), pg_temp.id('player-a1'), pg_temp.id('team-b')) $$,
  'roster player can move to another current team');
select is((select team_id from public.campaign_participants where id = pg_temp.participant('main', 'a1')),
  pg_temp.id('team-a'), 'roster move does not rewrite campaign team attribution');
select pg_temp.as_user('captain');
select is(jsonb_array_length(public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'team') -> 'participants'),
  1, 'captain loses moved player access despite its historical Team A snapshot');
select pg_temp.as_user('admin');
select lives_ok($$ select public.set_player_team(pg_temp.id('org-a'), pg_temp.id('player-a1'), pg_temp.id('team-a')) $$,
  'roster current team can be restored without changing the enrollment');

reset role;
select pg_temp.as_db_admin();
update public.players set household_id = pg_temp.id('house-c') where id = pg_temp.id('player-a1');
set local role authenticated;
select pg_temp.as_user('family-a');
select throws_ok($$ select pg_temp.retry() $$, '42501', null, 'former household snapshot does not preserve issuance after a live household transfer');
reset role;
select pg_temp.as_db_admin();
select is((select household_id from public.campaign_participants where id = pg_temp.participant('main', 'a1')),
  pg_temp.id('house-a'), 'household transfer does not rewrite campaign attribution');
update public.players set household_id = pg_temp.id('house-a') where id = pg_temp.id('player-a1');

set local role authenticated;
select pg_temp.as_user('manager');
select throws_ok($$ select public.withdraw_campaign_participant(pg_temp.id('org-a'), pg_temp.participant('main', 'b2'), '') $$,
  '23514', null, 'withdrawal requires an audit reason');
select lives_ok($$ select public.withdraw_campaign_participant(pg_temp.id('org-a'), pg_temp.participant('main', 'b2'), 'Player withdrew from fundraiser') $$,
  'campaign manager can withdraw an enrolled participant without deleting history');
select pg_temp.as_user('family-a');
select ok(not public.can_issue_campaign_participant(pg_temp.id('org-a'), pg_temp.participant('main', 'b2')),
  'withdrawn participant has no new-sale entitlement');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'b2'), 'family-cross-team', 'Buyer own child in another team', 1, 500, 'cash') $$,
  '23514', null, 'withdrawal blocks even an exact committed sale replay');
select pg_temp.as_user('admin');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'raised_cents')::bigint,
  4500::bigint, 'withdrawal preserves historical fundraising totals');
select is((public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'totals' ->> 'player_count')::integer,
  3, 'withdrawal reduces active participating player count only');
select is((select count(*) from public.ticket_events where participant_id = pg_temp.participant('main', 'b2') and event_type = 'UNALLOCATED'),
  3::bigint, 'withdrawal appends events releasing unused assigned stock');
select is(public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'), false, '{}', array[pg_temp.id('player-b2')]),
  1, 'explicit re-enrollment reactivates the same participant');
select is(public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-main')),
  3, 're-enrollment restores only the released missing default stock');

-- Campaign closure and drawing gate new writes while retaining safe retries.
select pg_temp.as_user('admin-director');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-main'), 'CLOSED', 'Sales window closed for review') $$,
  'director closes campaign through the existing lifecycle');
select pg_temp.as_user('family-a');
select lives_ok($$ select pg_temp.retry() $$, 'authorized original sale retry succeeds after campaign closure');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'), pg_temp.id('campaign-main'),
  pg_temp.participant('main', 'b2'), 'closed-new-sale', 'New Buyer', 1, 500, 'cash') $$,
  '23514', null, 'closed campaign denies new issuance even when assigned tickets remain');
select pg_temp.as_user('manager');
select throws_ok($$ select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'), true) $$,
  '23514', null, 'closed campaign denies new enrollment');
select throws_ok($$ select public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$,
  '23514', null, 'closed campaign denies new default inventory preparation');
select pg_temp.as_user('admin-director');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-main'), 'DRAWN', 'Drawing certified fixture') $$,
  'director records drawing through existing guarded lifecycle');
select pg_temp.as_user('corrector');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('admin-other-player'), 'Late reversal after drawing') $$,
  '23514', null, 'new reversal cannot change ticket validity after drawing');
select is(public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), 'Terminal-state retry'),
  (select (value #>> '{}')::uuid from pg_temp.test_values where label = 'approved-reversal'),
  'previously committed approved reversal remains replayable after drawing');
select ok(not exists (select 1 from jsonb_array_elements(
  public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main')) -> 'recent_sales') item
  where (item ->> 'can_reverse')::boolean), 'drawn campaign read flags offer no new reversal action');
select pg_temp.as_user('admin-director');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-main'), 'ARCHIVED', 'Campaign archived after drawing') $$,
  'authorized manager can archive the drawn campaign');
select pg_temp.as_user('corrector');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('admin-other-player'), 'Late reversal after archive') $$,
  '23514', null, 'new reversal is also denied after archive');
select is(public.reverse_campaign_sale(pg_temp.id('org-a'), pg_temp.sale('family-first'), 'Archived-state retry'),
  (select (value #>> '{}')::uuid from pg_temp.test_values where label = 'approved-reversal'),
  'committed reversal retry remains available after archive');
select pg_temp.as_user('family-a');
select throws_ok($$ select public.campaign_progress(pg_temp.id('org-a'), pg_temp.id('campaign-main'), 'family') $$,
  '42501', null, 'archived campaign disappears from family read scope');

select pg_temp.as_user('admin-director');
select ok((select bool_and(ok) from public.verify_campaign_ledgers(pg_temp.id('campaign-main'))),
  'campaign, ticket, and money chains verify after issuance, withdrawal, reversals, and lifecycle transitions');
select ok((select ok from public.verify_audit_chain(pg_temp.id('org-a'))),
  'organization audit chain verifies after every fundraising operation');

reset role;
select pg_temp.as_db_admin();
select ok(not has_function_privilege('anon', 'public.record_campaign_sale(uuid,uuid,uuid,text,text,integer,bigint,text,text,text,text,timestamptz,uuid)', 'EXECUTE'),
  'anonymous users have no sale issuance function privilege');
select ok(not has_function_privilege('anon', 'public.reverse_campaign_sale(uuid,uuid,text)', 'EXECUTE'),
  'anonymous users have no reversal function privilege');
select ok(not has_function_privilege('anon', 'public.campaign_progress(uuid,uuid,text,uuid,uuid)', 'EXECUTE'),
  'anonymous users have no fundraising progress function privilege');
select ok(not has_function_privilege('authenticated', 'public.guard_fundraising_write()', 'EXECUTE'),
  'private transaction guard is not a callable client API');

select * from finish();
rollback;
