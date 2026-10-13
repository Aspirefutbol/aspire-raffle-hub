-- Local drawing acceptance: immutable eligibility snapshots, scoped exports,
-- explicit operator evidence, Director certification, and source-prefix audit.
-- Known fixture IDs never act as authorization. Every fact rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(218);

create function pg_temp.id(p_key text) returns uuid language sql immutable as $$
  select md5('raffle-pgtap-drawing:' || p_key)::uuid;
$$;
create function pg_temp.as_user(p_actor text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', pg_temp.id('user-' || p_actor), 'role', 'authenticated')::text, true);
$$;
create temporary table drawing_results (label text primary key, result jsonb not null);
grant select, insert, update on pg_temp.drawing_results to authenticated;
create function pg_temp.result(p_label text) returns jsonb language sql stable as $$
  select result from pg_temp.drawing_results where label = p_label;
$$;
create function pg_temp.sale(p_label text) returns uuid language sql stable as $$
  select (pg_temp.result(p_label) ->> 'sale_id')::uuid;
$$;
create function pg_temp.snapshot(p_label text) returns uuid language sql stable as $$
  select (pg_temp.result(p_label) ->> 'snapshot_id')::uuid;
$$;
create function pg_temp.participant(p_campaign text, p_player text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.campaign_participants
  where campaign_id = pg_temp.id('campaign-' || p_campaign)
    and player_id = pg_temp.id('player-' || p_player);
$$;
create function pg_temp.ticket(p_sale text, p_offset integer default 0) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.tickets where sale_id = pg_temp.sale(p_sale)
  order by sequence_number offset p_offset limit 1;
$$;
create function pg_temp.ticket_number(p_sale text, p_offset integer default 0) returns text
language sql stable security definer set search_path = '' as $$
  select ticket_number from public.tickets where sale_id = pg_temp.sale(p_sale)
  order by sequence_number offset p_offset limit 1;
$$;

insert into auth.users (id, email, email_confirmed_at)
select pg_temp.id('user-' || actor), actor || '@drawing.test', now()
from unnest(array['admin', 'operator-two', 'manager', 'director', 'finance',
  'auditor', 'family', 'captain', 'dual', 'both', 'foreign', 'outsider']) actor;
insert into public.organizations (id, name, slug, legal_name, jurisdiction_profile,
  address_line1, city, region, support_email) values
  (pg_temp.id('org-a'), 'Drawing Org A', 'drawing-org-a', 'Drawing Org A Inc',
    'TEXAS_CREA_OFFLINE_PAYMENT', '1 Test Street', 'Houston', 'TX', 'support@drawing.test'),
  (pg_temp.id('org-b'), 'Drawing Org B', 'drawing-org-b', 'Drawing Org B Inc',
    'TEXAS_CREA_OFFLINE_PAYMENT', '2 Test Street', 'Austin', 'TX', 'support@foreign.test');
insert into public.organization_members (id, organization_id, user_id)
select pg_temp.id('member-' || actor), pg_temp.id('org-a'), pg_temp.id('user-' || actor)
from unnest(array['admin', 'operator-two', 'manager', 'director', 'finance',
  'auditor', 'family', 'captain', 'dual', 'both']) actor;
insert into public.organization_members (id, organization_id, user_id) values
  (pg_temp.id('member-foreign'), pg_temp.id('org-b'), pg_temp.id('user-foreign'));
insert into public.organization_member_roles (organization_id, member_id, role_key)
select pg_temp.id('org-a'), pg_temp.id('member-' || actor), role_key
from (values
  ('admin', 'ORGANIZATION_ADMIN'), ('operator-two', 'ORGANIZATION_ADMIN'),
  ('manager', 'CAMPAIGN_MANAGER'), ('director', 'DIRECTOR'), ('finance', 'FINANCE_ADMIN'),
  ('auditor', 'AUDITOR'), ('family', 'PARTICIPANT_FAMILY'), ('captain', 'TEAM_CAPTAIN'),
  ('dual', 'TEAM_CAPTAIN'), ('dual', 'PARTICIPANT_FAMILY'),
  ('both', 'ORGANIZATION_ADMIN'), ('both', 'DIRECTOR')
) roles(actor, role_key);
insert into public.organization_member_roles (organization_id, member_id, role_key) values
  (pg_temp.id('org-b'), pg_temp.id('member-foreign'), 'ORGANIZATION_ADMIN'),
  (pg_temp.id('org-b'), pg_temp.id('member-foreign'), 'DIRECTOR');
insert into public.teams (id, organization_id, name) values
  (pg_temp.id('team-a'), pg_temp.id('org-a'), 'Drawing Team A'),
  (pg_temp.id('team-b'), pg_temp.id('org-b'), 'Drawing Team B');
insert into public.households (id, organization_id, name) values
  (pg_temp.id('house-a'), pg_temp.id('org-a'), 'Drawing Family');
insert into public.guardians (id, organization_id, household_id, first_name, last_name) values
  (pg_temp.id('guardian-a'), pg_temp.id('org-a'), pg_temp.id('house-a'), 'Drawing', 'Parent'),
  (pg_temp.id('guardian-dual'), pg_temp.id('org-a'), pg_temp.id('house-a'), 'Dual', 'Parent');
insert into public.players (id, organization_id, household_id, first_name, last_name) values
  (pg_temp.id('player-a1'), pg_temp.id('org-a'), pg_temp.id('house-a'), 'Eligible', 'Replacement'),
  (pg_temp.id('player-a2'), pg_temp.id('org-a'), pg_temp.id('house-a'), 'Withdrawn', 'Check'),
  (pg_temp.id('player-a3'), pg_temp.id('org-a'), null, 'Unreconciled', 'Cash'),
  (pg_temp.id('player-b1'), pg_temp.id('org-b'), null, 'Foreign', 'Ticket');
insert into public.team_memberships (organization_id, player_id, team_id)
select pg_temp.id('org-a'), pg_temp.id('player-' || player), pg_temp.id('team-a')
from unnest(array['a1', 'a2', 'a3']) player;
insert into public.team_memberships (organization_id, player_id, team_id) values
  (pg_temp.id('org-b'), pg_temp.id('player-b1'), pg_temp.id('team-b'));
insert into public.guardian_user_links (organization_id, guardian_id, member_id) values
  (pg_temp.id('org-a'), pg_temp.id('guardian-a'), pg_temp.id('member-family')),
  (pg_temp.id('org-a'), pg_temp.id('guardian-dual'), pg_temp.id('member-dual'));
insert into public.team_staff_assignments (organization_id, team_id, member_id) values
  (pg_temp.id('org-a'), pg_temp.id('team-a'), pg_temp.id('member-captain')),
  (pg_temp.id('org-a'), pg_temp.id('team-a'), pg_temp.id('member-dual'));
insert into public.campaigns (id, organization_id, name, ticket_price_cents, ticket_prefix,
  starts_at, sales_close_at, draw_at, default_allocation, rules_text)
select pg_temp.id('campaign-' || campaign), pg_temp.id('org-a'), 'Drawing ' || campaign,
  -- Real short timeline permits actual evidence after the scheduled draw;
  -- no production date constraints or guard triggers are bypassed.
  500, prefix, now() - interval '1 day',
  case when campaign = 'main' then now() + interval '30 seconds' else now() + interval '10 days' end,
  case when campaign = 'main' then now() + interval '31 seconds' else now() + interval '11 days' end, 4,
  'Fixture rules: physical drawing of eligible issued tickets; no online ticket payments.'
from (values ('main', 'DRAW'), ('alt', 'ALTD'), ('empty', 'EMPTY'), ('draft', 'DRAFT'), ('future', 'FUTURE')) campaigns(campaign, prefix);
insert into public.campaigns (id, organization_id, name, ticket_price_cents, ticket_prefix,
  starts_at, sales_close_at, draw_at, default_allocation, rules_text) values
  (pg_temp.id('campaign-foreign'), pg_temp.id('org-b'), 'Foreign drawing', 500, 'FOREIGN',
    now() - interval '1 day', now() + interval '10 days', now() + interval '11 days', 2,
    'Fixture rules: eligible issued tickets only.');

set local role authenticated;
select pg_temp.as_user('both');
select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-main'), true);
select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-alt'), true);
select public.enroll_campaign_players(pg_temp.id('org-a'), pg_temp.id('campaign-future'), false, '{}', array[pg_temp.id('player-a1')]);
select public.transition_campaign(pg_temp.id('campaign-main'), 'READY');
select public.transition_campaign(pg_temp.id('campaign-main'), 'ACTIVE', 'Drawing fixture approved');
select public.transition_campaign(pg_temp.id('campaign-alt'), 'READY');
select public.transition_campaign(pg_temp.id('campaign-alt'), 'ACTIVE', 'Second drawing fixture approved');
select public.transition_campaign(pg_temp.id('campaign-empty'), 'READY');
select public.transition_campaign(pg_temp.id('campaign-empty'), 'ACTIVE', 'Empty fixture approved');
select public.transition_campaign(pg_temp.id('campaign-future'), 'READY');
select public.transition_campaign(pg_temp.id('campaign-future'), 'ACTIVE', 'Future drawing fixture approved');
select public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-main'));
select public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-alt'));
select public.prepare_campaign_inventory(pg_temp.id('org-a'), pg_temp.id('campaign-future'));
select pg_temp.as_user('foreign');
select public.enroll_campaign_players(pg_temp.id('org-b'), pg_temp.id('campaign-foreign'), true);
select public.transition_campaign(pg_temp.id('campaign-foreign'), 'READY');
select public.transition_campaign(pg_temp.id('campaign-foreign'), 'ACTIVE', 'Foreign fixture approved');
select public.prepare_campaign_inventory(pg_temp.id('org-b'), pg_temp.id('campaign-foreign'));
insert into pg_temp.drawing_results values ('foreign-sale', public.record_campaign_sale(
  pg_temp.id('org-b'), pg_temp.id('campaign-foreign'), pg_temp.participant('foreign', 'b1'),
  'foreign-sale', 'Foreign Buyer', 1, 500, 'cash'));
select pg_temp.as_user('family');
insert into pg_temp.drawing_results values ('original', public.record_campaign_sale(
  pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'),
  'original', 'Original Buyer', 2, 1000, 'cash'));
insert into pg_temp.drawing_results values ('check', public.record_campaign_sale(
  pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a2'),
  'check', 'Check Buyer', 1, 500, 'check', 'check@buyer.test', '5550100', 'Pending seller turn-in'));
insert into pg_temp.drawing_results values ('alt-sale', public.record_campaign_sale(
  pg_temp.id('org-a'), pg_temp.id('campaign-alt'), pg_temp.participant('alt', 'a1'),
  'alt-sale', 'Other Campaign Buyer', 1, 500, 'cash'));
insert into pg_temp.drawing_results values ('future-sale', public.record_campaign_sale(
  pg_temp.id('org-a'), pg_temp.id('campaign-future'), pg_temp.participant('future', 'a1'),
  'future-sale', 'Future Drawing Buyer', 1, 500, 'cash'));
select pg_temp.as_user('both');
insert into pg_temp.drawing_results values ('original-reversal', to_jsonb(public.reverse_campaign_sale(
  pg_temp.id('org-a'), pg_temp.sale('original'), 'Approved buyer correction before snapshot')));
insert into pg_temp.drawing_results values ('cash', public.record_campaign_sale(
  pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a3'),
  'cash', 'Unreconciled Buyer', 1, 500, 'cash', null, null, 'Seller still holds recorded cash'));
select pg_temp.as_user('family');
insert into pg_temp.drawing_results values ('replacement', public.record_campaign_sale(
  pg_temp.id('org-a'), pg_temp.id('campaign-main'), pg_temp.participant('main', 'a1'),
  'replacement', 'Corrected Buyer', 2, 1000, 'cash',
  p_corrects_sale_id => pg_temp.sale('original')));
select pg_temp.as_user('both');
select public.withdraw_campaign_participant(pg_temp.id('org-a'), pg_temp.participant('main', 'a2'),
  'Withdrawal preserves a previously issued check ticket');
insert into pg_temp.drawing_results values ('cutoff', to_jsonb((select sales_close_at from public.campaigns where id = pg_temp.id('campaign-main'))));

-- Assertions and drawing transitions follow the finalized migration contract.

create function pg_temp.freeze(p_key text, p_reason text default 'Approved eligibility snapshot',
  p_campaign text default 'main', p_confirmed boolean default true) returns jsonb language sql as $$
  select public.freeze_drawing(pg_temp.id('org-a'), pg_temp.id('campaign-' || p_campaign),
    p_key, p_reason, p_confirmed);
$$;
create function pg_temp.record_result(p_snapshot text, p_key text,
  p_ticket text default null, p_drawn_at timestamptz default null,
  p_location text default 'Club meeting room', p_operator text default 'External draw operator',
  p_witnesses jsonb default '["Witness One"]'::jsonb,
  p_method text default 'physical', p_result text default 'Winning ticket selected from the physical drum')
returns jsonb language sql as $$
  select public.record_external_drawing_result(pg_temp.id('org-a'), pg_temp.snapshot(p_snapshot), p_key,
    coalesce(p_drawn_at, (pg_temp.result('drawn-at') #>> '{}')::timestamptz),
    p_location, p_operator, p_witnesses, p_method, coalesce(p_ticket, pg_temp.ticket_number('replacement')),
    p_result, 'https://example.test/drawing-evidence', 'External result recorded');
$$;

-- Scope and lifecycle checks happen before snapshot creation or buyer exports.
select pg_temp.as_user('admin');
select is((public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) ->> 'eligible_ticket_count')::integer,
  4, 'eligible count includes fresh replacements, withdrawn check, and unreconciled cash');
select is((public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) ->> 'total_face_value_cents')::bigint,
  2000::bigint, 'drawing face value counts valid issued tickets once');
select is((public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) ->> 'ready')::boolean,
  false, 'ACTIVE campaign is not ready for a frozen drawing');
select throws_ok($$ select pg_temp.freeze('active-denied') $$, '23514', null,
  'freezing requires CLOSED even when issued tickets exist');
select throws_ok($$ select pg_temp.freeze('draft-denied', p_campaign => 'draft') $$, '23514', null,
  'a draft campaign cannot freeze a drawing');
select throws_ok($$ select public.freeze_drawing(pg_temp.id('org-a'), pg_temp.id('campaign-foreign'),
  'wrong-campaign', 'Known foreign ID', true) $$, 'P0002', null,
  'same supplied organization cannot resolve a foreign campaign ID');
select throws_ok($$ select public.drawing_readiness(pg_temp.id('org-b'), pg_temp.id('campaign-main')) $$,
  '42501', null, 'wrong supplied organization does not grant drawing visibility');
select pg_temp.as_user('family');
select throws_ok($$ select public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'family cannot access org-wide drawing readiness');
select throws_ok($$ select public.drawing_overview(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'family cannot access org-wide drawing overview');
select throws_ok($$ select pg_temp.freeze('scope-${actor}') $$, '42501', null, 'family cannot access org-wide drawing freeze');
select pg_temp.as_user('captain');
select throws_ok($$ select public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'captain cannot access org-wide drawing readiness');
select throws_ok($$ select public.drawing_overview(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'captain cannot access org-wide drawing overview');
select throws_ok($$ select pg_temp.freeze('scope-${actor}') $$, '42501', null, 'captain cannot access org-wide drawing freeze');
select pg_temp.as_user('dual');
select throws_ok($$ select public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'dual cannot access org-wide drawing readiness');
select throws_ok($$ select public.drawing_overview(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'dual cannot access org-wide drawing overview');
select throws_ok($$ select pg_temp.freeze('scope-${actor}') $$, '42501', null, 'dual cannot access org-wide drawing freeze');
select pg_temp.as_user('outsider');
select throws_ok($$ select public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'outsider cannot access org-wide drawing readiness');
select throws_ok($$ select public.drawing_overview(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'outsider cannot access org-wide drawing overview');
select throws_ok($$ select pg_temp.freeze('scope-${actor}') $$, '42501', null, 'outsider cannot access org-wide drawing freeze');
select pg_temp.as_user('foreign');
select throws_ok($$ select public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'foreign cannot access org-wide drawing readiness');
select throws_ok($$ select public.drawing_overview(pg_temp.id('org-a'), pg_temp.id('campaign-main')) $$, '42501', null, 'foreign cannot access org-wide drawing overview');
select throws_ok($$ select pg_temp.freeze('scope-${actor}') $$, '42501', null, 'foreign cannot access org-wide drawing freeze');

select pg_temp.as_user('both');
select public.transition_campaign(pg_temp.id('campaign-main'), 'CLOSED', 'Sales closed before drawing snapshot');
select public.transition_campaign(pg_temp.id('campaign-empty'), 'CLOSED', 'No tickets were sold');
select public.transition_campaign(pg_temp.id('campaign-future'), 'CLOSED', 'Future schedule test closed');
select is((select sales_close_at from public.campaigns where id = pg_temp.id('campaign-main')),
  (pg_temp.result('cutoff') #>> '{}')::timestamptz, 'closing and drawing preparation preserve the disclosed sales cutoff');
select throws_ok($$ select pg_temp.freeze('empty-denied', p_campaign => 'empty') $$, '23514', null,
  'nonempty eligible inventory is required before freezing');
select throws_ok($$ select pg_temp.freeze('no-prize', p_confirmed => false) $$, '23514', null,
  'operator must explicitly attest prize readiness');
select throws_ok($$ select pg_temp.freeze('', 'Approved eligibility snapshot') $$, '23514', null,
  'freeze requires a usable idempotency key');
select throws_ok($$ select pg_temp.freeze('bad-reason', 'x') $$, '23514', null,
  'freeze requires an explanatory reason');
select pg_temp.as_user('admin');
select is((public.drawing_readiness(pg_temp.id('org-a'), pg_temp.id('campaign-main')) ->> 'ready')::boolean,
  true, 'CLOSED valid nonempty campaign can be prepared for drawing');
select lives_ok($$ insert into pg_temp.drawing_results values ('freeze-one', pg_temp.freeze('freeze-one')) $$,
  'an operator freezes the first immutable eligibility version');
select is((pg_temp.result('freeze-one') ->> 'version')::integer, 1, 'first snapshot version is one');
select is((pg_temp.result('freeze-one') ->> 'count')::integer, 4, 'freeze response reports all four eligible tickets');
select is((pg_temp.result('freeze-one') ->> 'total_face_value_cents')::bigint, 2000::bigint,
  'freeze response reports the exact eligible face value');
select is((pg_temp.result('freeze-one') ->> 'replayed')::boolean, false, 'initial freeze is a new committed operation');
select is(pg_temp.freeze('freeze-one') ->> 'snapshot_id', pg_temp.result('freeze-one') ->> 'snapshot_id',
  'authorized identical freeze retry returns the same snapshot identity');
select is((pg_temp.freeze('freeze-one') ->> 'replayed')::boolean, true,
  'authorized identical freeze retry is explicitly marked replayed');
select throws_ok($$ select pg_temp.freeze('freeze-one', 'Changed reason') $$, '23505', null,
  'freeze key cannot silently accept a different request payload');
select throws_ok($$ select pg_temp.freeze('another-freeze') $$, '23514', null,
  'a campaign has only one current unreopened snapshot');

-- Table facts are inspected by the local fixture owner, never by service API.
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*) from public.drawing_snapshot_entries where snapshot_id = pg_temp.snapshot('freeze-one')),
  4::bigint, 'snapshot stores exactly one entry per eligible ticket');
select is((select count(*) from public.drawing_snapshot_entries where snapshot_id = pg_temp.snapshot('freeze-one')
  and sale_id = pg_temp.sale('original')), 0::bigint, 'voided reversed original tickets are absent from drawing entries');
select is((select count(*) from public.drawing_snapshot_entries where snapshot_id = pg_temp.snapshot('freeze-one')
  and sale_id = pg_temp.sale('replacement')), 2::bigint, 'fresh correction replacement tickets are eligible');
select is((select count(*) from public.drawing_snapshot_entries where snapshot_id = pg_temp.snapshot('freeze-one')
  and sale_id = pg_temp.sale('check')), 1::bigint, 'withdrawal does not erase an issued check ticket');
select is((select count(*) from public.drawing_snapshot_entries where snapshot_id = pg_temp.snapshot('freeze-one')
  and sale_id = pg_temp.sale('cash')), 1::bigint, 'unreconciled seller cash remains drawing eligible');
select is((select count(*) from public.drawing_snapshot_entries where snapshot_id = pg_temp.snapshot('freeze-one')
  and sale_id in (pg_temp.sale('alt-sale'), pg_temp.sale('foreign-sale'))), 0::bigint,
  'snapshot cannot include same-org other-campaign or foreign-org tickets');
select is((select sum(face_value_cents) from public.drawing_snapshot_entries where snapshot_id = pg_temp.snapshot('freeze-one')),
  2000::numeric, 'immutable entries sum to the frozen ticket face value');
select is((select count(distinct ticket_number) from public.drawing_snapshot_entries where snapshot_id = pg_temp.snapshot('freeze-one')),
  4::bigint, 'snapshot ticket numbers are unique');
select is((select manifest_hash from public.drawing_snapshots where id = pg_temp.snapshot('freeze-one')),
  (select encode(extensions.digest(manifest::text, 'sha256'), 'hex') from public.drawing_snapshots where id = pg_temp.snapshot('freeze-one')),
  'stored manifest hash matches the exact canonical manifest bytes');
insert into pg_temp.drawing_results values ('snapshot-one-row', (select to_jsonb(s) from public.drawing_snapshots s where id = pg_temp.snapshot('freeze-one')));
insert into pg_temp.drawing_results values ('snapshot-one-entries', (select jsonb_agg(to_jsonb(e) order by sequence_number, ticket_id)
  from public.drawing_snapshot_entries e where snapshot_id = pg_temp.snapshot('freeze-one')));

set local role authenticated;
select pg_temp.as_user('admin');
select is((public.verify_drawing_snapshot(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) ->> 'ok')::boolean,
  true, 'fresh snapshot manifest, entries, source prefixes and ledgers verify');
insert into pg_temp.drawing_results values ('export-one', public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')));
select is((pg_temp.result('export-one') ->> 'total')::integer, 4, 'export total equals the frozen entry count');
select is(jsonb_array_length(pg_temp.result('export-one') -> 'entries'), 4, 'bounded export returns all four small-fixture entries');
select is((pg_temp.result('export-one') ->> 'has_more')::boolean, false, 'small export does not claim an additional page');
select is(public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')), pg_temp.result('export-one'),
  'repeated export produces exactly the same stored data and ordering');
select is(jsonb_array_length(public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'), 0, 2) -> 'entries'),
  2, 'entry export respects its bounded first page');
select is(jsonb_array_length(public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'), 2, 2) -> 'entries'),
  2, 'entry export returns the remaining second page');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'), -1, 10) $$,
  '23514', null, 'export rejects a negative offset');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'), 0, 10001) $$,
  '23514', null, 'export refuses an unbounded oversized page');
select pg_temp.as_user('director');
select lives_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  'director existing exports and org-wide financial/audit authority can export frozen buyer records');
select pg_temp.as_user('finance');
select lives_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  'finance existing exports and org-wide financial/audit authority can export frozen buyer records');
select pg_temp.as_user('auditor');
select lives_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  'auditor existing exports and org-wide financial/audit authority can export frozen buyer records');
select pg_temp.as_user('manager');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'manager cannot turn campaign or scoped roster visibility into buyer export authority');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'),
  'denied-manager', 'csv', repeat('a',64)) $$, '42501', null, 'manager cannot create a buyer export receipt');
select pg_temp.as_user('family');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'family cannot turn campaign or scoped roster visibility into buyer export authority');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'),
  'denied-family', 'csv', repeat('a',64)) $$, '42501', null, 'family cannot create a buyer export receipt');
select pg_temp.as_user('captain');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'captain cannot turn campaign or scoped roster visibility into buyer export authority');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'),
  'denied-captain', 'csv', repeat('a',64)) $$, '42501', null, 'captain cannot create a buyer export receipt');
select pg_temp.as_user('dual');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'dual cannot turn campaign or scoped roster visibility into buyer export authority');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'),
  'denied-dual', 'csv', repeat('a',64)) $$, '42501', null, 'dual cannot create a buyer export receipt');
select pg_temp.as_user('outsider');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'outsider cannot turn campaign or scoped roster visibility into buyer export authority');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'),
  'denied-outsider', 'csv', repeat('a',64)) $$, '42501', null, 'outsider cannot create a buyer export receipt');
select pg_temp.as_user('foreign');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'foreign cannot turn campaign or scoped roster visibility into buyer export authority');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'), pg_temp.snapshot('freeze-one'),
  'denied-foreign', 'csv', repeat('a',64)) $$, '42501', null, 'foreign cannot create a buyer export receipt');

select pg_temp.as_user('manager');
select is((select count(*) from public.drawing_snapshot_entries where snapshot_id=pg_temp.snapshot('freeze-one')),
  0::bigint, 'campaign manager cannot read raw snapshot buyers directly');
select ok(public.drawing_overview(pg_temp.id('org-a'),pg_temp.id('campaign-main'))::text not like '%Corrected Buyer%',
  'campaign overview contains no frozen buyer names');
select pg_temp.as_user('operator-two');
select throws_ok($$ select pg_temp.freeze('freeze-one') $$, '23514', null,
  'a second operator cannot replay the first caller-bound freeze key');
select pg_temp.as_user('admin');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'),pg_temp.id('unknown-snapshot')) $$,
  'P0002', null, 'known organization cannot export a missing snapshot');
select throws_ok($$ select public.verify_drawing_snapshot(pg_temp.id('org-b'),pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'snapshot verification cannot cross the supplied tenant scope');
select throws_ok($$ select public.drawing_current_snapshot(pg_temp.id('campaign-main')) $$,
  '42501', null, 'private current-snapshot helper cannot bypass public scoped entry points');
select throws_ok($$ select public.drawing_integrity(pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'private integrity helper cannot reveal unscoped snapshot facts');
select throws_ok($$ select public.drawing_eligible_entries(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.snapshot('freeze-one')) $$,
  '42501', null, 'private population builder cannot expose frozen buyer data');

insert into pg_temp.drawing_results values ('export-receipt',public.export_drawing_snapshot(
  pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'export-key','json',repeat('a',64)));
select is(public.export_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'export-key','json',repeat('a',64))->>'event_id',
  pg_temp.result('export-receipt')->>'event_id', 'identical export receipt retry returns its original event');
select is((public.export_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'export-key','json',repeat('a',64))->>'replayed')::boolean,
  true, 'export receipt retry is marked replayed');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'export-key','csv',repeat('a',64)) $$,
  '23505', null, 'export key rejects a changed format');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'export-key','json',repeat('b',64)) $$,
  '23505', null, 'export key rejects changed generated-file bytes');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'bad-format','xml',repeat('a',64)) $$,
  '23514', null, 'export format is limited to CSV or JSON');
select throws_ok($$ select public.export_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'bad-hash','json','invalid') $$,
  '23514', null, 'export receipt requires an exact SHA256 digest');
select is((select (metadata->>'delivery_confirmed')::boolean from public.drawing_events
  where id=(pg_temp.result('export-receipt')->>'event_id')::uuid), false,
  'reported export receipt does not claim browser delivery or download confirmation');
select is((select metadata->>'checksum_source' from public.drawing_events
  where id=(pg_temp.result('export-receipt')->>'event_id')::uuid), 'authenticated_exporter',
  'direct RPC file checksums are attributed to the exporter rather than trusted server generation');
select is((select (metadata->>'file_generation_verified')::boolean from public.drawing_events
  where id=(pg_temp.result('export-receipt')->>'event_id')::uuid), false,
  'an arbitrary caller-reported checksum cannot fabricate verified file-generation evidence');
select pg_temp.as_user('finance');
insert into pg_temp.drawing_results values ('finance-export',public.export_drawing_snapshot(
  pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'export-key','json',repeat('a',64)));
select isnt(pg_temp.result('finance-export')->>'event_id',pg_temp.result('export-receipt')->>'event_id',
  'same export key from another authorized caller records that caller own receipt');

-- A frozen population blocks new ticket-changing facts, not committed retries.
select pg_temp.as_user('both');
select throws_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'),pg_temp.sale('cash'),'Late ticket reversal') $$,
  '23514', null, 'a new reversal cannot alter the frozen population while CLOSED');
select is(public.reverse_campaign_sale(pg_temp.id('org-a'),pg_temp.sale('original'),'Committed reversal retry'),
  (pg_temp.result('original-reversal')#>>'{}')::uuid, 'committed authorized reversal remains replayable after freeze');
select throws_ok($$ select public.transition_campaign(pg_temp.id('campaign-main'),'DRAWN','Attempt without evidence and certification') $$,
  '23514', null, 'DRAWN cannot be reached merely by having a frozen snapshot');
select pg_temp.as_user('family');
select is((public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),
  'replacement','Corrected Buyer',2,1000,'cash',p_corrects_sale_id=>pg_temp.sale('original'))->>'sale_id')::uuid,
  pg_temp.sale('replacement'), 'committed family sale retry returns the same sale after freeze');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),
  'new-after-freeze','Late Buyer',1,500,'cash') $$, '23514', null, 'freeze and CLOSED do not permit new issuance');
select throws_ok($$ select public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'family-reopen','Invalid family reopen') $$,
  '42501', null, 'a linked family cannot reopen a frozen drawing');
select pg_temp.as_user('admin');
select throws_ok($$ select public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'admin-reopen','Operator requests reopen') $$,
  '42501', null, 'operational administrator needs Director authority to reopen');
select pg_temp.as_user('director');
select throws_ok($$ select public.certify_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'no-result','No physical evidence yet') $$,
  '23514', null, 'Director certification requires externally recorded drawing evidence');
insert into pg_temp.drawing_results values ('reopen-one',public.reopen_drawing(
  pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'reopen-key','Director approved pre-draw correction'));
select is(public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'reopen-key','Director approved pre-draw correction')->>'event_id',
  pg_temp.result('reopen-one')->>'event_id', 'identical Director reopen retry returns the existing event');
select is((public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'reopen-key','Director approved pre-draw correction')->>'replayed')::boolean,
  true, 'Director reopen retry is explicitly replayed');
select throws_ok($$ select public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'reopen-key','Changed reopen reason') $$,
  '23505', null, 'Director reopen key cannot accept a changed reason');
select is((select status from public.campaigns where id=pg_temp.id('campaign-main')),'CLOSED',
  'reopening drawing eligibility never reopens sales');
select is((select sales_close_at from public.campaigns where id=pg_temp.id('campaign-main')),
  (pg_temp.result('cutoff')#>>'{}')::timestamptz, 'Director reopen preserves the exact sales cutoff');
select pg_temp.as_user('both');
select throws_ok($$ select public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'),'reopen-key','Director approved pre-draw correction') $$,
  '23514', null, 'another Director cannot replay the first Director reopen key');
select lives_ok($$ select public.reverse_campaign_sale(pg_temp.id('org-a'),pg_temp.sale('cash'),'Correction approved after explicit reopen') $$,
  'an approved reversal can alter eligibility only after Director reopen');
select pg_temp.as_user('admin');
insert into pg_temp.drawing_results values ('freeze-two',pg_temp.freeze('freeze-two','Fresh version after Director-approved correction'));
select is((pg_temp.result('freeze-two')->>'version')::integer,2,'refreeze creates a new version instead of modifying the old one');
select is((pg_temp.result('freeze-two')->>'count')::integer,3,'refrozen version excludes the newly reversed cash ticket');
select is((pg_temp.result('freeze-two')->>'total_face_value_cents')::bigint,1500::bigint,
  'refrozen face value reflects exactly the current three eligible tickets');
select isnt(pg_temp.snapshot('freeze-two'),pg_temp.snapshot('freeze-one'),'new version has a different immutable identity');
select isnt(pg_temp.result('freeze-two')->>'manifest_hash',pg_temp.result('freeze-one')->>'manifest_hash',
  'version and eligible-population changes produce a different manifest');
select is((select supersedes_snapshot_id from public.drawing_snapshots where id=pg_temp.snapshot('freeze-two')),
  pg_temp.snapshot('freeze-one'), 'replacement snapshot explicitly references the preceding version');
select is((select to_jsonb(s) from public.drawing_snapshots s where id=pg_temp.snapshot('freeze-one')),
  pg_temp.result('snapshot-one-row'), 'reopen and refreeze leave the entire old snapshot row unchanged');
select is(public.drawing_snapshot_export(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'))-'historical',pg_temp.result('export-one')-'historical',
  'historical export payload is byte-stable after the current population changes');
select is((public.drawing_snapshot_export(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'))->>'historical')::boolean,
  true,'superseded frozen export is explicitly labeled historical');
select is((public.verify_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-one'))->>'ok')::boolean,true,
  'old version continues verifying against its recorded source prefixes');
select is((public.drawing_overview(pg_temp.id('org-a'),pg_temp.id('campaign-main'))->>'current_snapshot_id')::uuid,
  pg_temp.snapshot('freeze-two'),'overview identifies only the new unreopened snapshot as current');

-- Later financial/audit receipts append to source chains without rewriting the
-- stored prefix anchors or changing historical frozen ticket eligibility.
reset role;
select pg_temp.as_user('both');
insert into public.money_events(organization_id,campaign_id,participant_id,event_type,amount_cents,payment_method)
  values(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),'TURN_IN',100,'cash');
set local role authenticated;
select pg_temp.as_user('admin');
select ok((select max(chain_pos) from public.money_events where campaign_id=pg_temp.id('campaign-main')) >
  (select (source_ledger_heads->'money_events'->>'position')::bigint from public.drawing_snapshots where id=pg_temp.snapshot('freeze-two')),
  'later financial receipt advances the ledger beyond the frozen prefix');
select is((public.verify_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-two'))->>'source_anchors_ok')::boolean,
  true,'later money and export receipts do not invalidate the saved source prefix');
select is((public.verify_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-two'))->>'ok')::boolean,
  true,'current snapshot remains valid after later financial/audit receipts');
insert into pg_temp.drawing_results values ('future-freeze',pg_temp.freeze('future-freeze','Future drawing date fixture','future'));
select throws_ok($$ select pg_temp.record_result('future-freeze','early-scheduled-result',
  p_ticket=>pg_temp.ticket_number('future-sale'),p_drawn_at=>clock_timestamp()) $$, '23514', null,
  'actual physical evidence cannot precede the locked disclosed drawing date');

-- Wait on the real synthetic timeline (at most 31 seconds from BEGIN); no
-- database guard or date constraint is bypassed to manufacture valid evidence.
select pg_sleep(greatest(0,extract(epoch from(
  (select draw_at from public.campaigns where id=pg_temp.id('campaign-main'))-clock_timestamp()))));
insert into pg_temp.drawing_results values ('before-final-freeze',to_jsonb(clock_timestamp()));
select pg_temp.as_user('director');
select public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-two'),'reopen-two','Director confirmed final unchanged population');
select pg_temp.as_user('admin');
insert into pg_temp.drawing_results values ('freeze-final',pg_temp.freeze('freeze-final','Final current drawing snapshot'));
select is((pg_temp.result('freeze-final')->>'version')::integer,3,'later freeze after a second explicit reopen remains a new immutable version');
select is((pg_temp.result('freeze-final')->>'count')::integer,3,'refreeze with unchanged eligibility preserves the three-ticket population');
insert into pg_temp.drawing_results values ('drawn-at',to_jsonb(clock_timestamp()));
select throws_ok($$ select pg_temp.record_result('freeze-final','before-freeze',
  p_drawn_at=>(pg_temp.result('before-final-freeze')#>>'{}')::timestamptz) $$,'23514',null,
  'evidence after the schedule but before this exact freeze is rejected');
select throws_ok($$ select pg_temp.record_result('freeze-final','future-evidence',
  p_drawn_at=>clock_timestamp()+interval '1 hour') $$,'23514',null,
  'knowingly future physical evidence cannot be recorded');
select throws_ok($$ select pg_temp.record_result('freeze-final','infinite-evidence',
  p_drawn_at=>'infinity'::timestamptz) $$,'23514',null,
  'infinite drawing timestamps cannot satisfy factual evidence');
select throws_ok($$ select public.record_external_drawing_result(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),
  'missing-timestamp',null,'Club room','Operator','["Witness One"]','physical',pg_temp.ticket_number('replacement'),
  'Result described',null,'Factual drawing evidence') $$,'23514',null,
  'manual drawing evidence requires a factual timestamp');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-location',p_location=>'') $$,'23514',null,
  'manual evidence requires location');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-operator',p_operator=>'') $$,'23514',null,
  'manual evidence requires operator');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-method',p_method=>'automatic') $$,'23514',null,
  'manual evidence requires approved physical/external method');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-result',p_result=>'x') $$,'23514',null,
  'manual evidence requires result description');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-witness-array',p_witnesses=>'{}'::jsonb) $$,'23514',null,
  'manual evidence requires witness array');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-witness-none',p_witnesses=>'[]'::jsonb) $$,'23514',null,
  'manual evidence requires at least one witness');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-witness-blank',p_witnesses=>'[" "]'::jsonb) $$,'23514',null,
  'manual evidence requires usable witness name');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-witness-object',p_witnesses=>'[{"name":"Witness One"}]'::jsonb) $$,'23514',null,
  'manual evidence requires string witness names');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-winner-original',p_ticket=>pg_temp.ticket_number('original')) $$,'23514',null,
  'manual evidence requires voided original winning ticket exclusion');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-winner-cash',p_ticket=>pg_temp.ticket_number('cash')) $$,'23514',null,
  'manual evidence requires newly reversed ticket exclusion from this exact version');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-winner-alt',p_ticket=>pg_temp.ticket_number('alt-sale')) $$,'23514',null,
  'manual evidence requires same-org other-campaign winning ticket exclusion');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-winner-foreign',p_ticket=>pg_temp.ticket_number('foreign-sale')) $$,'23514',null,
  'manual evidence requires other-tenant winning ticket exclusion');
select throws_ok($$ select pg_temp.record_result('freeze-final','invalid-winner-missing',p_ticket=>'DRAW-NOT-PRESENT') $$,'23514',null,
  'manual evidence requires winning ticket membership in the exact current snapshot');

select throws_ok($$ select pg_temp.record_result('freeze-one','historical-result') $$,'23514',null,
  'a reopened historical snapshot cannot receive new drawing results');
select pg_temp.as_user('family');
select throws_ok($$ select pg_temp.record_result('freeze-final','denied-result-family') $$,'42501',null,
  'family cannot record an external drawing without drawing.manage');
select pg_temp.as_user('captain');
select throws_ok($$ select pg_temp.record_result('freeze-final','denied-result-captain') $$,'42501',null,
  'captain cannot record an external drawing without drawing.manage');
select pg_temp.as_user('dual');
select throws_ok($$ select pg_temp.record_result('freeze-final','denied-result-dual') $$,'42501',null,
  'dual cannot record an external drawing without drawing.manage');
select pg_temp.as_user('finance');
select throws_ok($$ select pg_temp.record_result('freeze-final','denied-result-finance') $$,'42501',null,
  'finance cannot record an external drawing without drawing.manage');
select pg_temp.as_user('auditor');
select throws_ok($$ select pg_temp.record_result('freeze-final','denied-result-auditor') $$,'42501',null,
  'auditor cannot record an external drawing without drawing.manage');
select pg_temp.as_user('director');
select throws_ok($$ select pg_temp.record_result('freeze-final','denied-result-director') $$,'42501',null,
  'director cannot record an external drawing without drawing.manage');
select pg_temp.as_user('foreign');
select throws_ok($$ select pg_temp.record_result('freeze-final','denied-result-foreign') $$,'42501',null,
  'foreign cannot record an external drawing without drawing.manage');
select pg_temp.as_user('outsider');
select throws_ok($$ select pg_temp.record_result('freeze-final','denied-result-outsider') $$,'42501',null,
  'outsider cannot record an external drawing without drawing.manage');

select pg_temp.as_user('manager');
select is((select count(*) from public.drawing_snapshot_entries where snapshot_id=pg_temp.snapshot('freeze-final')),
  0::bigint,'result recording does not require campaign manager access to frozen buyer rows');
insert into pg_temp.drawing_results values ('result-one',pg_temp.record_result('freeze-final','result-key'));
select is(pg_temp.result('result-one')->>'snapshot_id',pg_temp.result('freeze-final')->>'snapshot_id',
  'manual result is attached to the exact current frozen version');
select is(pg_temp.result('result-one')->>'ticket_number',pg_temp.ticket_number('replacement'),
  'server resolves an eligible winning ticket number without exposing buyer lookup data');
select is((pg_temp.record_result('freeze-final','result-key')->>'replayed')::boolean,true,
  'identical result retry is marked replayed for the authorized original caller');
select is(pg_temp.record_result('freeze-final','result-key')->>'result_id',pg_temp.result('result-one')->>'result_id',
  'identical result retry preserves its original immutable evidence identity');
select throws_ok($$ select pg_temp.record_result('freeze-final','result-key',p_result=>'Changed result description') $$,'23505',null,
  'manual result key rejects changed evidence from its original caller');
select pg_temp.as_user('operator-two');
insert into pg_temp.drawing_results values ('result-two',pg_temp.record_result('freeze-final','result-key',
  p_ticket=>pg_temp.ticket_number('replacement',1),p_method=>'external'));
select isnt(pg_temp.result('result-two')->>'result_id',pg_temp.result('result-one')->>'result_id',
  'another authorized caller records its own evidence rather than replaying someone else key');
select pg_temp.as_user('director');
select throws_ok($$ select public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'late-reopen','After an external result') $$,
  '23514',null,'any recorded external result immediately blocks Director reopening');

-- Direct writes remain denied even if callers spoof the private writer GUC.
select pg_temp.as_user('family');
select set_config('raffle_hub.drawing_write',pg_temp.id('campaign-main')::text,true);
select throws_ok($$ insert into public.drawing_snapshots default values $$,'42501',null,
  'spoofed drawing context cannot directly insert drawing_snapshots');
select throws_ok($$ delete from public.drawing_snapshots $$,'42501',null,
  'authenticated callers cannot delete immutable drawing_snapshots');
select throws_ok($$ truncate public.drawing_snapshots $$,'42501',null,
  'authenticated callers cannot truncate drawing history in drawing_snapshots');
select throws_ok($$ insert into public.drawing_snapshot_entries default values $$,'42501',null,
  'spoofed drawing context cannot directly insert drawing_snapshot_entries');
select throws_ok($$ delete from public.drawing_snapshot_entries $$,'42501',null,
  'authenticated callers cannot delete immutable drawing_snapshot_entries');
select throws_ok($$ truncate public.drawing_snapshot_entries $$,'42501',null,
  'authenticated callers cannot truncate drawing history in drawing_snapshot_entries');
select throws_ok($$ insert into public.drawing_results default values $$,'42501',null,
  'spoofed drawing context cannot directly insert drawing_results');
select throws_ok($$ delete from public.drawing_results $$,'42501',null,
  'authenticated callers cannot delete immutable drawing_results');
select throws_ok($$ truncate public.drawing_results $$,'42501',null,
  'authenticated callers cannot truncate drawing history in drawing_results');
select throws_ok($$ insert into public.drawing_events default values $$,'42501',null,
  'spoofed drawing context cannot directly insert drawing_events');
select throws_ok($$ delete from public.drawing_events $$,'42501',null,
  'authenticated callers cannot delete immutable drawing_events');
select throws_ok($$ truncate public.drawing_events $$,'42501',null,
  'authenticated callers cannot truncate drawing history in drawing_events');

select pg_temp.as_user('admin');
select throws_ok($$ update public.drawing_snapshots set reason='Rewritten' where id=pg_temp.snapshot('freeze-final') $$,
  '42501',null,'operator cannot overwrite a snapshot header');
select throws_ok($$ update public.drawing_snapshot_entries set buyer_name='Rewritten' where snapshot_id=pg_temp.snapshot('freeze-final') $$,
  '42501',null,'operator cannot overwrite a frozen entry');
select throws_ok($$ update public.drawing_results set result='Rewritten' where snapshot_id=pg_temp.snapshot('freeze-final') $$,
  '42501',null,'operator cannot overwrite immutable external evidence');
select throws_ok($$ update public.drawing_events set reason='Rewritten' where snapshot_id=pg_temp.snapshot('freeze-final') $$,
  '42501',null,'operator cannot overwrite drawing history events');

reset role;
select pg_temp.as_user('both');
select throws_ok($$ update public.drawing_snapshots set reason='Privileged rewritten' where id=pg_temp.snapshot('freeze-final') $$,
  '42501',null,'snapshot append-only trigger also rejects privileged accidental edits');
select throws_ok($$ update public.drawing_snapshot_entries set buyer_name='Privileged rewritten' where snapshot_id=pg_temp.snapshot('freeze-final') $$,
  '42501',null,'entry append-only trigger also rejects privileged accidental edits');
select throws_ok($$ update public.drawing_results set result='Privileged rewritten' where snapshot_id=pg_temp.snapshot('freeze-final') $$,
  '42501',null,'result append-only trigger also rejects privileged accidental edits');
select throws_ok($$ update public.drawing_events set reason='Privileged rewritten' where snapshot_id=pg_temp.snapshot('freeze-final') $$,
  '42501',null,'event append-only trigger also rejects privileged accidental edits');
select is((select count(*) from public.drawing_results where snapshot_id=pg_temp.snapshot('freeze-final')),
  2::bigint,'retry and rejected calls do not create extra manual evidence facts');
select is((select created_by from public.drawing_results where id=(pg_temp.result('result-one')->>'result_id')::uuid),
  pg_temp.id('user-manager'),'external evidence records the authenticated operator actor');
select is((select winning_ticket_id from public.drawing_results where id=(pg_temp.result('result-one')->>'result_id')::uuid),
  pg_temp.ticket('replacement'),'server derives exact entry ticket identity from its frozen number');
select is((select witnesses from public.drawing_results where id=(pg_temp.result('result-one')->>'result_id')::uuid),
  '["Witness One"]'::jsonb,'required witness evidence is preserved in the immutable result');
select ok(exists(select 1 from public.audit_events where entity_type='drawing_results'
  and entity_id=(pg_temp.result('result-one')->>'result_id')::uuid and actor_id=pg_temp.id('user-manager')),
  'manual evidence has a trigger-written authenticated operator audit receipt');

select is((select count(*) from public.ticket_events where campaign_id=pg_temp.id('campaign-main') and event_type='WINNER'),
  2::bigint,'two committed external facts append exactly two WINNER history events');
select ok(not exists(select 1 from public.drawing_results r where r.snapshot_id=pg_temp.snapshot('freeze-final')
  and not exists(select 1 from public.ticket_events e where e.event_type='WINNER' and e.ticket_id=r.winning_ticket_id
    and e.metadata->>'snapshot_id'=r.snapshot_id::text and e.metadata->>'result_id'=r.id::text
    and e.metadata->>'ticket_number'=r.ticket_number and e.metadata->>'method'=r.method)),
  'each WINNER history entry identifies the exact snapshot and external result');
select is((select count(*) from public.tickets t join public.drawing_snapshot_entries e on e.ticket_id=t.id
  where e.snapshot_id=pg_temp.snapshot('freeze-final') and t.status='ISSUED'),3::bigint,
  'winner history never changes issued ticket validity or the frozen population');

-- Capture deliberate privileged corruptions inside a rolled-back subtransaction.
-- TAP assertions execute after rollback, preserving pgTAP's assertion counters.
create function pg_temp.corruption_probe(p_mode text) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare sid uuid:=pg_temp.snapshot('freeze-final'); observation jsonb; error_code text; h text;
begin
  begin
    if p_mode in ('entry','rehash') then
      alter table public.drawing_snapshot_entries disable trigger drawing_snapshot_entries_immutable;
      update public.drawing_snapshot_entries set buyer_name='Forged frozen buyer'
        where snapshot_id=sid and ticket_id=pg_temp.ticket('replacement');
      if p_mode='rehash' then
        update public.drawing_snapshot_entries e set entry_hash=encode(extensions.digest((to_jsonb(e)-'entry_hash')::text,'sha256'),'hex')
          where snapshot_id=sid and ticket_id=pg_temp.ticket('replacement');
        select encode(extensions.digest(string_agg(entry_hash,'' order by sequence_number,ticket_id),'sha256'),'hex')
          into h from public.drawing_snapshot_entries where snapshot_id=sid;
        alter table public.drawing_snapshots disable trigger drawing_snapshots_immutable;
        update public.drawing_snapshots set manifest=jsonb_set(manifest,'{entries_hash}',to_jsonb(h)),
          manifest_hash=encode(extensions.digest(jsonb_set(manifest,'{entries_hash}',to_jsonb(h))::text,'sha256'),'hex')
          where id=sid;
        alter table public.drawing_snapshots enable trigger drawing_snapshots_immutable;
      end if;
      alter table public.drawing_snapshot_entries enable trigger drawing_snapshot_entries_immutable;
    elsif p_mode='manifest' then
      alter table public.drawing_snapshots disable trigger drawing_snapshots_immutable;
      update public.drawing_snapshots set manifest=manifest||'{"eligibility_policy":"FORGED"}'::jsonb where id=sid;
      alter table public.drawing_snapshots enable trigger drawing_snapshots_immutable;
    elsif p_mode='source' then
      alter table public.money_events disable trigger money_events_append_only;
      update public.money_events set amount_cents=amount_cents+1 where campaign_id=pg_temp.id('campaign-main')
        and chain_pos=(select (source_ledger_heads->'money_events'->>'position')::bigint from public.drawing_snapshots where id=sid);
      alter table public.money_events enable trigger money_events_append_only;
    elsif p_mode='result' then
      alter table public.drawing_results disable trigger drawing_results_immutable;
      update public.drawing_results set result='Forged rehashed evidence'
        where id=(pg_temp.result('result-one')->>'result_id')::uuid;
      update public.drawing_results r set result_hash=encode(extensions.digest((to_jsonb(r)-'result_hash')::text,'sha256'),'hex')
        where id=(pg_temp.result('result-one')->>'result_id')::uuid;
      alter table public.drawing_results enable trigger drawing_results_immutable;
    elsif p_mode='certification' then
      alter table public.drawing_events disable trigger drawing_events_immutable;
      update public.drawing_events set metadata=jsonb_set(metadata,'{results_hash}',to_jsonb(repeat('c',64)))
        where snapshot_id=sid and event_type='CERTIFIED';
      alter table public.drawing_events enable trigger drawing_events_immutable;
    else raise exception 'Unknown local corruption probe.'; end if;
    observation:=public.verify_drawing_snapshot(pg_temp.id('org-a'),sid);
    begin
      if p_mode='certification' then
        perform public.transition_campaign(pg_temp.id('campaign-main'),'DRAWN','Tampered certification attempt');
      else
        perform public.certify_drawing(pg_temp.id('org-a'),sid,'tampered-cert-'||p_mode,'Verify corrupted drawing records');
      end if;
      error_code:='unexpected_success';
    exception when others then get stacked diagnostics error_code=returned_sqlstate;
    end;
    observation:=observation||jsonb_build_object('rejection_code',error_code);
    raise exception 'Rollback local corruption probe.' using errcode='PZ001';
  exception when sqlstate 'PZ001' then null;
  end;
  return observation;
end; $$;
grant execute on function pg_temp.corruption_probe(text) to authenticated;
set local role authenticated;
select pg_temp.as_user('director');
insert into pg_temp.drawing_results values ('tamper-entry',pg_temp.corruption_probe('entry'));
select is((pg_temp.result('tamper-entry')->>'entries_ok')::boolean,false,'changing a frozen entry breaks its canonical entry hash');
select is(pg_temp.result('tamper-entry')->>'rejection_code','23514','corrupted frozen entry cannot be certified');
insert into pg_temp.drawing_results values ('tamper-manifest',pg_temp.corruption_probe('manifest'));
select is((pg_temp.result('tamper-manifest')->>'manifest_ok')::boolean,false,'changed eligibility manifest cannot verify');
insert into pg_temp.drawing_results values ('tamper-rehash',pg_temp.corruption_probe('rehash'));
select is((pg_temp.result('tamper-rehash')->>'entries_ok')::boolean,true,'coordinated attacker can recalculate entry hashes in the local probe');
select is((pg_temp.result('tamper-rehash')->>'manifest_ok')::boolean,true,'coordinated attacker can recalculate its forged header hashes');
select is((pg_temp.result('tamper-rehash')->>'audit_anchor_ok')::boolean,false,'rehashing forged entries and header still disagrees with original audit receipts');
select is(pg_temp.result('tamper-rehash')->>'rejection_code','23514','rehashed forgery cannot be Director-certified');
insert into pg_temp.drawing_results values ('tamper-source',pg_temp.corruption_probe('source'));
select is((pg_temp.result('tamper-source')->>'ledger_chains_ok')::boolean,false,'changing a captured source ledger row breaks source integrity');
select is(pg_temp.result('tamper-source')->>'rejection_code','23514','source ledger corruption blocks drawing certification');
insert into pg_temp.drawing_results values ('tamper-result',pg_temp.corruption_probe('result'));
select is(pg_temp.result('tamper-result')->>'rejection_code','23514','rehashed external evidence cannot replace its original audited result');
select is((public.verify_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'))->>'ok')::boolean,true,
  'rolled-back corruption probes restore the exact verified snapshot and source state');

-- Only a current Director may seal the exact evidence set, and DRAWN remains
-- an explicit guarded campaign transition after successful certification.
select pg_temp.as_user('admin');
select throws_ok($$ select public.certify_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'admin-cert','Operational approval') $$,
  '42501',null,'operational drawing management is not Director certification authority');
select pg_temp.as_user('director');
insert into pg_temp.drawing_results values ('certification',public.certify_drawing(
  pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'certification-key','Director verified the exact frozen drawing and evidence'));
select is((public.certify_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'certification-key',
  'Director verified the exact frozen drawing and evidence')->>'replayed')::boolean,true,'identical Director certification retry is replayed');
select is(public.certify_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'certification-key',
  'Director verified the exact frozen drawing and evidence')->>'event_id',pg_temp.result('certification')->>'event_id',
  'certification retry returns its original evidence-seal identity');
select throws_ok($$ select public.certify_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'certification-key','Changed approval reason') $$,
  '23505',null,'certification key rejects a changed reason');
select is((select created_by from public.drawing_events where id=(pg_temp.result('certification')->>'event_id')::uuid),
  pg_temp.id('user-director'),'certification actor is derived from the current authenticated Director');
select is((select metadata->>'certifier' from public.drawing_events where id=(pg_temp.result('certification')->>'event_id')::uuid),
  pg_temp.id('user-director')::text,'certification seal explicitly records its real Director certifier');
select is((select (metadata->>'results_count')::integer from public.drawing_events where id=(pg_temp.result('certification')->>'event_id')::uuid),
  2,'Director certification seals both committed external evidence records');
select is((select status from public.campaigns where id=pg_temp.id('campaign-main')),'CLOSED',
  'certification does not silently perform the DRAWN lifecycle transition');
insert into pg_temp.drawing_results values ('tamper-certification',pg_temp.corruption_probe('certification'));
select is(pg_temp.result('tamper-certification')->>'rejection_code','23514',
  'DRAWN guard rejects a forged certification receipt even when snapshot entries remain valid');
select pg_temp.as_user('both');
select throws_ok($$ select public.certify_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'certification-key',
  'Director verified the exact frozen drawing and evidence') $$,'23514',null,'another Director cannot replay the original certifier key');
select pg_temp.as_user('manager');
select throws_ok($$ select pg_temp.record_result('freeze-final','post-cert-result') $$,'23514',null,
  'new external evidence cannot silently change a certified evidence set');
select is(pg_temp.record_result('freeze-final','result-key')->>'result_id',pg_temp.result('result-one')->>'result_id',
  'committed operator result retry remains safe after certification');
select pg_temp.as_user('director');
select throws_ok($$ select public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'certified-reopen','After certification') $$,
  '23514',null,'certified frozen drawings cannot be reopened');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign-main'),'DRAWN','Director finalized the externally recorded drawing') $$,
  'verified current snapshot and certified actual evidence permit explicit DRAWN');
select is((select status from public.campaigns where id=pg_temp.id('campaign-main')),'DRAWN','final campaign status is DRAWN');
select is(public.certify_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'certification-key',
  'Director verified the exact frozen drawing and evidence')->>'event_id',pg_temp.result('certification')->>'event_id',
  'committed original certification retry remains available after DRAWN');
select throws_ok($$ select public.reopen_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'drawn-reopen','After drawing finalization') $$,
  '23514',null,'DRAWN cannot reopen an immutable finalized drawing');
select pg_temp.as_user('admin');
select is(pg_temp.freeze('freeze-final','Final current drawing snapshot')->>'snapshot_id',pg_temp.result('freeze-final')->>'snapshot_id',
  'committed original freeze retry remains available after DRAWN');

-- Retried operation identities never override current authorization.
reset role;
select pg_temp.as_user('both');
update public.organization_members set status='suspended' where id=pg_temp.id('member-admin');
set local role authenticated;
select pg_temp.as_user('admin');
select throws_ok($$ select pg_temp.freeze('freeze-final','Final current drawing snapshot') $$,'42501',null,
  'revoked operator membership cannot replay a previously committed freeze');
reset role;
select pg_temp.as_user('both');
update public.organization_members set status='active' where id=pg_temp.id('member-admin');
delete from public.organization_member_roles where member_id=pg_temp.id('member-director') and role_key='DIRECTOR';
set local role authenticated;
select pg_temp.as_user('director');
select throws_ok($$ select public.certify_drawing(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'),'certification-key',
  'Director verified the exact frozen drawing and evidence') $$,'42501',null,'revoked Director role cannot replay an old certification');
select pg_temp.as_user('both');
select is((public.verify_drawing_snapshot(pg_temp.id('org-a'),pg_temp.snapshot('freeze-final'))->>'ok')::boolean,true,
  'final drawing snapshot still verifies after WINNER and later audit/financial events');
select ok((select bool_and(ok) from public.verify_campaign_ledgers(pg_temp.id('campaign-main'))),
  'original campaign ticket and money hash row formats remain valid');
select ok((select ok from public.verify_audit_chain(pg_temp.id('org-a'))),
  'organization audit chain verifies the full freeze/reopen/export/result/certification history');

set local role anon;
select throws_ok($$ select public.drawing_readiness(pg_temp.id('org-a'),pg_temp.id('campaign-main')) $$,'42501',null,
  'anonymous callers cannot read drawing readiness');
select throws_ok($$ select public.drawing_snapshot_export(pg_temp.id('org-a'),pg_temp.id('known-snapshot')) $$,'42501',null,
  'anonymous callers cannot download frozen buyers');
reset role;
select * from finish();
rollback;




