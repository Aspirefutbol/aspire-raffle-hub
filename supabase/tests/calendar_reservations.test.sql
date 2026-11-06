-- Calendar reservation slice: all fixtures synthetic; entire test transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.cid(p_key text) returns uuid language sql immutable as $$
  select md5('calendar-south:' || p_key)::uuid;
$$;
create function pg_temp.as_user(p_key text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', pg_temp.cid('user-' || p_key), 'role', 'authenticated')::text, true);
$$;
create temporary table calendar_test_results(label text primary key, result jsonb not null);
grant select, insert on pg_temp.calendar_test_results to authenticated;

insert into auth.users(id, email, email_confirmed_at) values
  (pg_temp.cid('user-a-admin'), 'calendar-admin-a@example.test', now()),
  (pg_temp.cid('user-b-admin'), 'calendar-admin-b@example.test', now());

insert into public.organizations(id, name, slug, legal_name, jurisdiction_profile,
  address_line1, city, region, support_email, platform_config) values
  (pg_temp.cid('org-a'), 'Aspire South TEST', 'aspire-south-test', 'Aspire South TEST',
    'TEXAS_CREA_OFFLINE_PAYMENT', '1 Testing Way', 'Houston', 'TX',
    'south@example.test', '{"texas_crea_compliance_required":false}'::jsonb),
  (pg_temp.cid('org-b'), 'Another Club TEST', 'another-club-test', 'Another Club TEST',
    'TEXAS_CREA_OFFLINE_PAYMENT', '2 Testing Way', 'Austin', 'TX',
    'other@example.test', '{"texas_crea_compliance_required":false}'::jsonb);

insert into public.organization_members(id, organization_id, user_id) values
  (pg_temp.cid('member-a'), pg_temp.cid('org-a'), pg_temp.cid('user-a-admin')),
  (pg_temp.cid('member-b'), pg_temp.cid('org-b'), pg_temp.cid('user-b-admin'));
insert into public.organization_member_roles(organization_id, member_id, role_key) values
  (pg_temp.cid('org-a'), pg_temp.cid('member-a'), 'ORGANIZATION_ADMIN'),
  (pg_temp.cid('org-a'), pg_temp.cid('member-a'), 'DIRECTOR'),
  (pg_temp.cid('org-b'), pg_temp.cid('member-b'), 'ORGANIZATION_ADMIN'),
  (pg_temp.cid('org-b'), pg_temp.cid('member-b'), 'DIRECTOR');

insert into public.households(id, organization_id, name) values
  (pg_temp.cid('house-a'), pg_temp.cid('org-a'), 'Synthetic Family A');
insert into public.players(id, organization_id, household_id, first_name, last_name)
values
  (pg_temp.cid('player-a'), pg_temp.cid('org-a'), pg_temp.cid('house-a'),
    'Mateo', 'Sample'),
  (pg_temp.cid('player-a2'), pg_temp.cid('org-a'), pg_temp.cid('house-a'),
    'Lina', 'Sample');

insert into public.campaigns(id, organization_id, name, campaign_type,
  ticket_price_cents, ticket_prefix, starts_at, sales_close_at, draw_at,
  support_email, description) values
  (pg_temp.cid('campaign-a'), pg_temp.cid('org-a'),
    'Aspire South Calendar TEST', 'calendar',
    100, 'CALTEST', now() - interval '1 day', now() + interval '10 days',
    now() + interval '11 days', 'south@example.test', 'Synthetic test only');

-- Setup uses the existing guarded master roster enrollment mechanism.
set local role authenticated;
select pg_temp.as_user('a-admin');
select is(public.enroll_campaign_players(pg_temp.cid('org-a'),
  pg_temp.cid('campaign-a'), true), 2, 'admin enrolls synthetic players');
select is(public.transition_campaign(pg_temp.cid('campaign-a'), 'READY'),
  'READY', 'calendar moved to READY by authorized director');
select is(public.transition_campaign(pg_temp.cid('campaign-a'), 'ACTIVE', 'Synthetic calendar test'),
  'ACTIVE', 'calendar moved to ACTIVE by authorized director');
reset role;

insert into calendar_private.campaign_config(
  campaign_id, organization_id, mode, enabled)
values(pg_temp.cid('campaign-a'), pg_temp.cid('org-a'), 'supporter_choice', true);

-- These grants exist inside this rollback-only test transaction. Production
-- grants remain revoked, so the function is not a callable web endpoint.
grant usage on schema calendar_private to authenticated;
grant execute on function calendar_private.reserve(
  uuid,uuid,uuid,uuid,integer[],integer,text,text) to authenticated;

create function pg_temp.participant(p_player text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.campaign_participants
  where campaign_id = pg_temp.cid('campaign-a')
    and player_id = pg_temp.cid(p_player);
$$;

set local role authenticated;
select pg_temp.as_user('a-admin');

insert into pg_temp.calendar_test_results
select 'first', calendar_private.reserve(
  pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
  pg_temp.cid('reservation-key-1'), array[10,11], 5,
  'Demo Supporter', 'Donor@Example.Test');

select is((select (result->>'base_cents')::bigint
   from pg_temp.calendar_test_results where label='first'),
   2100::bigint, 'day 10 + 11 preserve $21 base');
select is((select (result->>'additional_impact_cents')::bigint
   from pg_temp.calendar_test_results where label='first'),
   8400::bigint, '5x stores $84 extra separately');
select is((select (result->>'total_cents')::bigint
   from pg_temp.calendar_test_results where label='first'),
   10500::bigint, '5x total $105');
select is((select result->>'status'
   from pg_temp.calendar_test_results where label='first'),
   'HELD', 'new reservation is HELD, never paid by a redirect');

select is(
  (calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
    pg_temp.cid('reservation-key-1'), array[11,10], 5,
    'Demo Supporter', 'donor@example.test')->>'replayed')::boolean,
  true, 'same idempotency key + normalized selection replays safely');

select throws_ok($$
  select calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
    pg_temp.cid('reservation-key-1'), array[10,12], 5,
    'Demo Supporter', 'donor@example.test')$$,
  '23505', null, 'reusing a key with changed days rejected');

select throws_ok($$
  select calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
    pg_temp.cid('reservation-key-2'), array[11], 1,
    'Another', 'another@example.test')$$,
  '23505', null, 'exclusive day cannot be double-sold');

select throws_ok($$
  select calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
    pg_temp.cid('reservation-key-3'), array[10,10], 1,
    'Another', 'another@example.test')$$,
  '23514', null, 'duplicate days rejected before pricing');

select throws_ok($$
  select calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
    pg_temp.cid('reservation-key-4'), array[32], 1,
    'Another', 'another@example.test')$$,
  '23514', null, 'invalid day rejected');

select throws_ok($$
  select calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
    pg_temp.cid('reservation-key-5'), array[12], 6,
    'Another', 'another@example.test')$$,
  '23514', null, 'multiplier beyond 5x rejected');

insert into pg_temp.calendar_test_results
select 'sibling', calendar_private.reserve(
  pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a2'),
  pg_temp.cid('reservation-key-6'), array[10], 1,
  'Sibling Supporter', 'sibling@example.test');
select ok((select result->>'id' from pg_temp.calendar_test_results where label='first')
  <> (select result->>'id' from pg_temp.calendar_test_results where label='sibling'),
  'different player calendars have independent inventory');

select pg_temp.as_user('b-admin');
select throws_ok($$
  select calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
    pg_temp.cid('reservation-key-7'), array[13], 1,
    'Other Tenant', 'other@example.test')$$,
  '42501', null, 'another organization admin cannot reserve Aspire South calendar');

reset role;
select is((select count(*) from calendar_private.reservations),2::bigint,
  'only authorized reservations persisted');
select is((select count(*) from calendar_private.reservation_events where event_type='HELD'),2::bigint,
  'each reservation has one immutable HELD ledger event');
select is((select count(*) from calendar_private.reservation_days where state='HELD'),3::bigint,
  'days are exclusive and separate for each player');

-- Force a known expired hold under the fixture owner; the next authorized
-- reserve transaction must free it and leave audit evidence.
update calendar_private.reservations
  set expires_at = clock_timestamp() - interval '1 minute'
  where id = (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='first');

set local role authenticated;
select pg_temp.as_user('a-admin');
insert into pg_temp.calendar_test_results
select 'reclaimed', calendar_private.reserve(
  pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
  pg_temp.cid('reservation-key-8'), array[10], 3,
  'Reclaim Supporter', 'reclaim@example.test');
select is((select result->>'status' from pg_temp.calendar_test_results where label='reclaimed'),
  'HELD', 'expired unstarted hold can be claimed again');

reset role;
select is((select status from calendar_private.reservations
    where id=(select (result->>'id')::uuid from pg_temp.calendar_test_results where label='first')),
  'EXPIRED', 'old hold expired instead of being overwritten');
select is((select count(*) from calendar_private.reservation_events where event_type='EXPIRED'),1::bigint,
  'expiry adds immutable event');
select is((select count(*) from calendar_private.reservation_days
    where reservation_id=(select (result->>'id')::uuid from pg_temp.calendar_test_results where label='first')
    and state='RELEASED'),2::bigint, 'old claimed days released for audit');

select is((select count(*) from calendar_private.reservations where status='PAID'),0::bigint,
  'no test or browser reservation marked paid');

-- Test-only elevation: the production schema/function grants remain revoked.
select ok(not has_function_privilege('authenticated',
    'calendar_private.attach_test_checkout(uuid,text,timestamptz)', 'EXECUTE'),
  'new checkout association is not callable by the authenticated API role');
grant execute on function calendar_private.attach_test_checkout(uuid,text,timestamptz)
  to authenticated;

set local role authenticated;
select pg_temp.as_user('a-admin');
insert into pg_temp.calendar_test_results
select 'checkout', calendar_private.attach_test_checkout(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
  'cs_test_synthetic_checkout_1', clock_timestamp() + interval '45 minutes');

select is((select result->>'status' from pg_temp.calendar_test_results where label='checkout'),
  'CHECKOUT_PENDING', 'held day becomes checkout pending atomically');
select is((select state from calendar_private.reservation_days
  where reservation_id=(select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling')),
  'CHECKOUT_PENDING', 'day inventory remains locked through Stripe TEST checkout');

select is((calendar_private.attach_test_checkout(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
  'cs_test_synthetic_checkout_1', clock_timestamp() + interval '45 minutes')->>'replayed')::boolean,
  true, 'same session attaches idempotently without second event');

select throws_ok($
  select calendar_private.attach_test_checkout(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
    'cs_test_wrong_checkout_2', clock_timestamp() + interval '45 minutes')$,
  '23514', null, 'cannot swap another checkout into a pending reservation');

select throws_ok($
  select calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a2'),
    pg_temp.cid('reservation-key-9'), array[10], 1,
    'Collision', 'collision@example.test')$,
  '23505', null, 'checkout pending day cannot be claimed again');

select pg_temp.as_user('b-admin');
select throws_ok($
  select calendar_private.attach_test_checkout(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
    'cs_test_cross_tenant', clock_timestamp() + interval '45 minutes')$,
  '42501', null, 'another tenant cannot attach a session to Aspire South');

reset role;
select is((select count(*) from calendar_private.reservation_events
    where event_type='CHECKOUT_PENDING'),1::bigint,
  'exactly one append-only checkout pending event');
select is((select count(*) from calendar_private.reservations
    where status='PAID'),0::bigint,
  'Stripe TEST handoff alone never marks a sponsorship paid');

select * from finish();
rollback;
