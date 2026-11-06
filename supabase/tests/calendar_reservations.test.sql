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
reset role;
select is((select state from calendar_private.reservation_days
  where reservation_id=(select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling')),
  'CHECKOUT_PENDING', 'day inventory remains locked through Stripe TEST checkout');
set local role authenticated;
select pg_temp.as_user('a-admin');

select is((calendar_private.attach_test_checkout(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
  'cs_test_synthetic_checkout_1', clock_timestamp() + interval '45 minutes')->>'replayed')::boolean,
  true, 'same session attaches idempotently without second event');

select throws_ok($$
  select calendar_private.attach_test_checkout(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
    'cs_test_wrong_checkout_2', clock_timestamp() + interval '45 minutes')$$,
  '23514', null, 'cannot swap another checkout into a pending reservation');

select throws_ok($$
  select calendar_private.reserve(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a2'),
    pg_temp.cid('reservation-key-9'), array[10], 1,
    'Collision', 'collision@example.test')$$,
  '23505', null, 'checkout pending day cannot be claimed again');

select pg_temp.as_user('b-admin');
select throws_ok($$
  select calendar_private.attach_test_checkout(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
    'cs_test_cross_tenant', clock_timestamp() + interval '45 minutes')$$,
  '42501', null, 'another tenant cannot attach a session to Aspire South');

reset role;
select is((select count(*) from calendar_private.reservation_events
    where event_type='CHECKOUT_PENDING'),1::bigint,
  'exactly one append-only checkout pending event');
select is((select count(*) from calendar_private.reservations
    where status='PAID'),0::bigint,
  'Stripe TEST handoff alone never marks a sponsorship paid');

-- Only trusted operator code can invoke the verified TEST settlement contract.
-- Existing test fixture is synthetic and never calls Stripe.
select ok(not has_function_privilege('authenticated',
    'calendar_private.confirm_test_checkout_paid(uuid,text,text,bigint)', 'EXECUTE'),
  'browser/authenticated role cannot mark a calendar payment PAID');
select ok(not has_function_privilege('service_role',
    'calendar_private.confirm_test_checkout_paid(uuid,text,text,bigint)', 'EXECUTE'),
  'Supabase Data API service role cannot bypass TEST webhook verification');

insert into pg_temp.calendar_test_results
select 'paid', calendar_private.confirm_test_checkout_paid(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
  'cs_test_synthetic_checkout_1', 'evt_synthetic_paid_1', 1000);
select is((select result->>'status' from pg_temp.calendar_test_results where label='paid'),
  'PAID', 'trusted verified TEST payment settles pending reservation');
select is((select (result->>'replayed')::boolean from pg_temp.calendar_test_results where label='paid'),
  false, 'first verified payment creates one financial transition');
select is((select state from calendar_private.reservation_days
    where reservation_id=(select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling')),
  'PAID', 'calendar inventory stays exclusively occupied after payment');
select is((select count(*) from calendar_private.reservation_events where event_type='PAID'),1::bigint,
  'payment adds one immutable PAID event with separate base and impact');
select is((select base_cents from calendar_private.reservation_events where event_type='PAID'),1000::bigint,
  'settled PAID event keeps true calendar base value');
select is((select additional_impact_cents from calendar_private.reservation_events where event_type='PAID'),0::bigint,
  'settled PAID event keeps additional impact separate');

select is((calendar_private.confirm_test_checkout_paid(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
  'cs_test_synthetic_checkout_1', 'evt_synthetic_paid_1', 1000)->>'replayed')::boolean,
  true, 'Stripe retry returns the original payment result safely');
select is((calendar_private.confirm_test_checkout_paid(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
  'cs_test_synthetic_checkout_1', 'evt_synthetic_paid_2', 1000)->>'replayed')::boolean,
  true, 'second verified event for the paid session does not double-credit');
select is((select count(*) from calendar_private.reservation_events where event_type='PAID'),1::bigint,
  'even two separate delivered events create only one PAID ledger transition');
select is((select count(*) from calendar_private.stripe_test_payment_receipts),2::bigint,
  'every distinct verified TEST event receives an immutable receipt');

select throws_ok($paid_amount$
  select calendar_private.confirm_test_checkout_paid(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
    'cs_test_synthetic_checkout_1', 'evt_synthetic_wrong_amount', 2000)
$paid_amount$, '23514', null, 'forged Stripe event amount cannot settle sponsorship');

select throws_ok($paid_session$
  select calendar_private.confirm_test_checkout_paid(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
    'cs_test_another_checkout_1', 'evt_synthetic_wrong_session', 1000)
$paid_session$, '23514', null, 'another checkout session cannot settle sponsorship');

select throws_ok($paid_unattached$
  select calendar_private.confirm_test_checkout_paid(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='reclaimed'),
    'cs_test_synthetic_checkout_1', 'evt_synthetic_unattached', 3000)
$paid_unattached$, '23514', null, 'HELD inventory cannot be paid without exact checkout attachment');

select is((select count(*) from calendar_private.reservations where status='PAID'),1::bigint,
  'failed/duplicate payments never create extra settled calendars');

-- A second synthetic supporter uses 3x: $10 base + $20 additional impact.
-- Verify the paid ledger retains both amounts, not merely the overall charge.
set local role authenticated;
select pg_temp.as_user('a-admin');
select is((calendar_private.attach_test_checkout(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='reclaimed'),
  'cs_test_synthetic_impact_3x', clock_timestamp() + interval '45 minutes')->>'status'),
  'CHECKOUT_PENDING', '3x synthetic impact calendar receives a TEST checkout');
reset role;
select is((calendar_private.confirm_test_checkout_paid(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='reclaimed'),
  'cs_test_synthetic_impact_3x', 'evt_synthetic_impact_3x', 3000)->>'status'),
  'PAID', '3x TEST payment settles against the exact server-side quote');
select is((select base_cents from calendar_private.reservation_events
    where event_type='PAID' and reservation_id=
      (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='reclaimed')),
  1000::bigint, '3x settled sponsorship keeps $10 base calendar value');
select is((select additional_impact_cents from calendar_private.reservation_events
    where event_type='PAID' and reservation_id=
      (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='reclaimed')),
  2000::bigint, '3x settled sponsorship keeps $20 additional impact');
select is((select total_cents from calendar_private.reservation_events
    where event_type='PAID' and reservation_id=
      (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='reclaimed')),
  3000::bigint, '3x paid ledger totals $30 without duplicate day ownership');

-- Expired Stripe TEST sessions must not hold a player's days forever.
-- Production has no API role access; the trusted server must first obtain
-- terminal expired/unpaid proof from Stripe before invoking the private RPC.
select ok(not has_function_privilege('authenticated',
    'calendar_private.expire_test_checkout(uuid,text,timestamptz)', 'EXECUTE'),
  'browser cannot invoke the private TEST session expiry transaction');
select ok(not has_function_privilege('service_role',
    'calendar_private.expire_test_checkout(uuid,text,timestamptz)', 'EXECUTE'),
  'Supabase Data API service role cannot force-release sponsored days');

set local role authenticated;
select pg_temp.as_user('a-admin');
insert into pg_temp.calendar_test_results
select 'expiring', calendar_private.reserve(
  pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
  pg_temp.cid('reservation-key-expiring'), array[14], 2,
  'Unpaid Supporter', 'unpaid@example.test');
select is((calendar_private.attach_test_checkout(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='expiring'),
  'cs_test_synthetic_expiring', clock_timestamp() + interval '45 minutes')->>'status'),
  'CHECKOUT_PENDING', 'synthetic unpaid session starts checkout pending');
reset role;

select throws_ok($calendar_expiry_early$
  select calendar_private.expire_test_checkout(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='expiring'),
    'cs_test_synthetic_expiring',
    (select expires_at from calendar_private.reservations
      where id=(select (result->>'id')::uuid
        from pg_temp.calendar_test_results where label='expiring')))
$calendar_expiry_early$, '23514', null, 'unexpired TEST checkout cannot free a sponsored day');

-- Simulate a terminally expired session and matching verified Stripe
-- response. The external HTTP verification itself is covered in TS tests.
update calendar_private.reservations
  set expires_at=clock_timestamp()-interval '1 minute'
  where id=(select (result->>'id')::uuid
    from pg_temp.calendar_test_results where label='expiring');

select is((calendar_private.expire_test_checkout(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='expiring'),
  'cs_test_synthetic_expiring',
  (select expires_at from calendar_private.reservations
    where id=(select (result->>'id')::uuid
      from pg_temp.calendar_test_results where label='expiring')))->>'status'),
  'EXPIRED', 'matching terminal TEST expiry atomically releases checkout pending');
select is((select state from calendar_private.reservation_days
    where reservation_id=(select (result->>'id')::uuid
      from pg_temp.calendar_test_results where label='expiring')),
  'RELEASED', 'expired TEST checkout releases its exclusive day');
select is((calendar_private.expire_test_checkout(
  (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='expiring'),
  'cs_test_synthetic_expiring',
  (select expires_at from calendar_private.reservations
    where id=(select (result->>'id')::uuid
      from pg_temp.calendar_test_results where label='expiring')))->>'replayed')::boolean,
  true, 'expiry retry is idempotent');

select throws_ok($calendar_wrong_expiry$
  select calendar_private.expire_test_checkout(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='expiring'),
    'cs_test_synthetic_wrong',
    (select expires_at from calendar_private.reservations
      where id=(select (result->>'id')::uuid
        from pg_temp.calendar_test_results where label='expiring')))
$calendar_wrong_expiry$, '23514', null, 'wrong session cannot release sponsored inventory');

select throws_ok($calendar_after_expiry$
  select calendar_private.confirm_test_checkout_paid(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='expiring'),
    'cs_test_synthetic_expiring', 'evt_synthetic_after_expiry', 2800)
$calendar_after_expiry$, '23514', null, 'late settled event cannot pay an expired released reservation');

select throws_ok($calendar_paid_cannot_expire$
  select calendar_private.expire_test_checkout(
    (select (result->>'id')::uuid from pg_temp.calendar_test_results where label='sibling'),
    'cs_test_synthetic_checkout_1',
    (select expires_at from calendar_private.reservations
      where id=(select (result->>'id')::uuid
        from pg_temp.calendar_test_results where label='sibling')))
$calendar_paid_cannot_expire$, '23514', null, 'already paid checkout cannot be expired or released');

set local role authenticated;
select pg_temp.as_user('a-admin');
insert into pg_temp.calendar_test_results
select 'reused_after_checkout_expiry', calendar_private.reserve(
  pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), pg_temp.participant('player-a'),
  pg_temp.cid('reservation-key-reused-after-expiry'), array[14], 1,
  'New Supporter', 'new@example.test');
reset role;
select is((select result->>'status' from pg_temp.calendar_test_results
    where label='reused_after_checkout_expiry'),
  'HELD', 'verified expired unpaid checkout frees the calendar day for a new sponsor');
select is((select count(*) from calendar_private.reservation_events
    where reservation_id=(select (result->>'id')::uuid
      from pg_temp.calendar_test_results where label='expiring')
      and event_type='EXPIRED'),
  1::bigint, 'expired pending checkout has exactly one immutable audit event');

-- Paid progress is a private adult-scoped read model, not a donor/API grant.
select ok(not has_function_privilege('anon',
    'calendar_private.read_paid_progress(uuid,uuid,uuid)', 'EXECUTE'),
  'anonymous visitors cannot read a player''s private paid progress');
select ok(not has_function_privilege('authenticated',
    'calendar_private.read_paid_progress(uuid,uuid,uuid)', 'EXECUTE'),
  'ordinary authenticated Data API has no paid-progress grant');
select ok(not has_function_privilege('service_role',
    'calendar_private.read_paid_progress(uuid,uuid,uuid)', 'EXECUTE'),
  'Supabase service-role Data API cannot bypass private progress scope');

-- Rollback-only privilege elevation for testing the internal, reviewed caller.
grant execute on function calendar_private.read_paid_progress(uuid,uuid,uuid)
  to authenticated;
set local role authenticated;
select pg_temp.as_user('a-admin');

select is((calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a'))->>'base_cents')::bigint,
  1000::bigint, 'paid progress counts exactly the settled $10 calendar base');
select is((calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a'))->>'additional_impact_cents')::bigint,
  2000::bigint, 'paid progress keeps 3x $20 additional impact separate');
select is((calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a'))->>'total_cents')::bigint,
  3000::bigint, 'settled progress totals $30, excluding expired or held days');
select is((calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a'))->>'paid_days')::jsonb,
  '[10]'::jsonb, 'only actually paid day is shown as sponsored');
select is((calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a'))->>'sponsor_count')::bigint,
  1::bigint, 'multiple webhook deliveries do not double-count sponsors');
select is((calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a2'))->>'additional_impact_cents')::bigint,
  0::bigint, 'another player has separate zero additional-impact totals');
select is((calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a2'))->>'total_cents')::bigint,
  1000::bigint, 'different player progress is not mixed into Aspire South sibling');
select ok(not (calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a')) ?| array['supporter_name','supporter_email',
      'checkout_session_id', 'stripe_event_id']),
  'paid-progress output excludes donor PII and payment session references');

select pg_temp.as_user('b-admin');
select throws_ok($calendar_progress_cross_tenant$
  select calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a'))
$calendar_progress_cross_tenant$, '42501', null,
  'another organization director cannot read Aspire South financial progress');

select pg_temp.as_user('a-admin');
select throws_ok($calendar_progress_wrong_campaign$
  select calendar_private.read_paid_progress(
    pg_temp.cid('org-a'), pg_temp.cid('org-b'),
    pg_temp.participant('player-a'))
$calendar_progress_wrong_campaign$, '42501', null,
  'even Aspire South director cannot read a mismatched campaign or tenant');

reset role;

-- Private inventory read model: the parent/director sees which numbered
-- calendar days can be selected, never another tenant's or donor's data.
select ok(not has_function_privilege('anon',
    'calendar_private.read_inventory(uuid,uuid,uuid)', 'EXECUTE'),
  'anonymous browser cannot invoke the private calendar inventory function');
select ok(not has_function_privilege('authenticated',
    'calendar_private.read_inventory(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated Data API role has no calendar inventory grant');
select ok(not has_function_privilege('service_role',
    'calendar_private.read_inventory(uuid,uuid,uuid)', 'EXECUTE'),
  'Supabase service-role Data API cannot bypass private inventory scope');

-- Test-only function access, reverted when the pgTAP transaction rolls back.
grant execute on function calendar_private.read_inventory(uuid,uuid,uuid)
  to authenticated;
set local role authenticated;
select pg_temp.as_user('a-admin');

select is((calendar_private.read_inventory(
     pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
     pg_temp.participant('player-a'))->'paid_days'),
  '[10]'::jsonb, 'only the settled Aspire South day is marked paid');
select is((calendar_private.read_inventory(
     pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
     pg_temp.participant('player-a'))->'held_days'),
  '[14]'::jsonb, 'active temporary reservations appear as held');
select is((calendar_private.read_inventory(
     pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
     pg_temp.participant('player-a'))->'checkout_pending_days'),
  '[]'::jsonb, 'verified expired unpaid checkout is no longer pending');
select is((calendar_private.read_inventory(
     pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
     pg_temp.participant('player-a'))->'unavailable_days'),
  '[10, 14]'::jsonb, 'paid and actively held days block new sponsorship');
select is((calendar_private.read_inventory(
     pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
     pg_temp.participant('player-a2'))->'paid_days'),
  '[10]'::jsonb, 'each player calendar has independent paid inventory');
select ok(not (calendar_private.read_inventory(
     pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
     pg_temp.participant('player-a')) ?| array[
     'supporter_name','supporter_email','stripe_event_id',
     'checkout_session_id','reservation_id']),
  'calendar inventory response does not leak supporter PII or payment IDs');

select pg_temp.as_user('b-admin');
select throws_ok($calendar_inventory_cross_tenant$
  select calendar_private.read_inventory(
    pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
    pg_temp.participant('player-a'))
$calendar_inventory_cross_tenant$, '42501', null,
  'another tenant cannot read Aspire South day availability');
reset role;

-- An elapsed HELD timer is not equivalent to an unverified Stripe expiry.
-- The normal reserve transaction automatically expires this hold under lock.
update calendar_private.reservations
  set expires_at = clock_timestamp() - interval '1 minute'
  where id = (select (result->>'id')::uuid from pg_temp.calendar_test_results
    where label = 'reused_after_checkout_expiry');
set local role authenticated;
select pg_temp.as_user('a-admin');
select is((calendar_private.read_inventory(
     pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
     pg_temp.participant('player-a'))->'unavailable_days'),
  '[10]'::jsonb, 'expired unstarted hold is excluded from unavailable inventory');
reset role;

select * from finish();
rollback;
