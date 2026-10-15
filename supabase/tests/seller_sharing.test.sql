-- Phase 1: enrollment, participant-owned stock, offline issuance, corrections,
-- explicit read scopes, composite integrity, and append-only audit/ledgers.
-- Fixture identifiers are deliberately known to every test actor: hiding IDs
-- is never relied upon for authorization. All fixture state rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.id(p_key text) returns uuid language sql immutable as $$
  select md5('raffle-pgtap-sharing:' || p_key)::uuid;
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
  player_goal_default_cents, team_goal_default_cents, rules_text)
select pg_temp.id('campaign-' || campaign), pg_temp.id('org-a'), 'Fundraising ' || campaign,
  -- Short real timeline keeps the original issuance assertions and permits
  -- actual drawing evidence after the locked scheduled drawing timestamp.
  500, prefix, now() - interval '1 day',
  case when campaign = 'main' then now() + interval '10 days' else now() + interval '10 days' end,
  case when campaign = 'main' then now() + interval '11 days' else now() + interval '11 days' end,
  4, 10000, 2000, 5000, 'Fixture rules: physical drawing of valid issued raffle tickets.'
from (values ('main', 'MAIN'), ('alt', 'ALT'), ('draft', 'DRAFT'), ('future', 'FUTURE')) campaigns(campaign, prefix);
insert into public.campaigns (id, organization_id, name, ticket_price_cents, ticket_prefix,
  starts_at, sales_close_at, draw_at, default_allocation, goal_amount_cents) values
  (pg_temp.id('campaign-other'), pg_temp.id('org-b'), 'Other Tenant Campaign', 500, 'OTHER',
    now() - interval '1 day', now() + interval '10 days', now() + interval '11 days', 4, 10000);


set local role authenticated;
select pg_temp.as_user('admin-director');
select is(public.enroll_campaign_players(pg_temp.id('org-a'),pg_temp.id('campaign-main'),true),4,'enroll sharing fixture');
select lives_ok($$select public.transition_campaign(pg_temp.id('campaign-main'),'READY')$$,'ready');
select lives_ok($$select public.transition_campaign(pg_temp.id('campaign-main'),'ACTIVE','Synthetic launch')$$,'active');
select is(public.generate_campaign_tickets(pg_temp.id('org-a'),pg_temp.id('campaign-main'),20),20,'inventory');
select lives_ok($$select public.allocate_campaign_tickets(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),10)$$,'allocate');
select pg_temp.as_user('family-a');
insert into pg_temp.test_values values('link',public.manage_seller_link(pg_temp.id('org-a'),pg_temp.participant('main','a1')));
create function pg_temp.token() returns text language sql as $$select value->>'token' from pg_temp.test_values where label='link'$$;
select is(length(pg_temp.token()),64,'256-bit opaque token');
select ok(pg_temp.token() ~ '^[a-f0-9]{64}$','token encoding');
select isnt((select opaque_token_hash from public.campaign_seller_links limit 1),pg_temp.token(),'only token hash stored');
select is((public.public_seller_page(pg_temp.token())->>'ticket_price_cents')::integer,500,'public price');
select ok(not (public.public_seller_page(pg_temp.token()) ?| array['id','participant_id','player_name','team_name','tickets','totals','seller_user_id','supporter_email']),'public identity allowlist');
select throws_ok($$select public.manage_seller_link(pg_temp.id('org-a'),pg_temp.participant('main','a2'))$$,'42501',null,'unlinked player denied');
select throws_ok($$select public.manage_seller_link(pg_temp.id('org-b'),pg_temp.participant('main','a1'))$$,'42501',null,'foreign org denied');
select pg_temp.as_user('dual');
select throws_ok($$select public.manage_seller_link(pg_temp.id('org-a'),pg_temp.participant('main','a1'))$$,'42501',null,'captain plus family cannot publish another family');
reset role;
insert into pg_temp.test_values values('before',pg_temp.state('main')-'audit_head');
grant select on pg_temp.test_values to anon;
set local role anon;
select is(public.public_seller_page('missing'),null::jsonb,'invalid link generic unavailable');
select throws_ok($$select * from public.campaign_seller_links$$,'42501',null,'anon no tables');
select is(public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('submit-1'),'{"name":"Supporter","email":"supporter@example.test","contact":"email","quantity":2}'),'{"accepted":true}'::jsonb,'nonbinding submission');
select is(public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('submit-1'),'{"name":"Supporter","email":"supporter@example.test","contact":"email","quantity":2}'),'{"accepted":true}'::jsonb,'retry generic response');
select is(public.submit_seller_interest_request('missing',pg_temp.id('submit-1'),'{}'),'{"accepted":true}'::jsonb,'no enumeration');
select public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('spam'),'{"name":"Bot","email":"bot@example.test","contact":"email","quantity":1,"website":"spam"}');
select public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('oversize'),'{"name":"Bad","email":"bad","contact":"email","quantity":101}');
select public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('extra'),'{"name":"Bad","email":"bad@example.test","contact":"email","quantity":1,"sale_id":"fake"}');
select public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('invalid-'||n),payload) from (values
 (1,'{"name":"Bad","email":"invalid","contact":"email","quantity":1}'::jsonb),
 (2,'{"name":"Bad","phone":"javascript:alert(1)","contact":"phone","quantity":1}'::jsonb),
 (3,'{"name":"Bad","email":"bad@example.test","contact":"email","quantity":"1"}'::jsonb),
 (4,'{"name":{"nested":"Bad"},"email":"bad@example.test","contact":"email","quantity":1}'::jsonb),
 (5,'{"name":"Bad","email":"bad@example.test","contact":"email","quantity":"NaN"}'::jsonb)
) invalid(n,payload);
reset role;
select is((select count(*) from public.seller_interest_requests where organization_id=pg_temp.id('org-a')),1::bigint,'one immutable request, retries and bots ignored');
select is(pg_temp.state('main')-'audit_head',(select value from pg_temp.test_values where label='before'),'no financial, ticket or inventory change');
select is((select count(*) from public.money_custody_events where organization_id=pg_temp.id('org-a')),0::bigint,'no custody event');
select throws_ok($$update public.seller_interest_requests set supporter_name='rewrite'$$,'42501',null,'request body immutable');
set local role authenticated;
select pg_temp.as_user('family-a');
select is(jsonb_array_length(public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'))),1,'family inbox');
select is(jsonb_array_length(public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'admin')),0,'family cannot select admin support projection');
insert into pg_temp.test_values values('request',public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'))->0);
create function pg_temp.request_id() returns uuid language sql as $$select (value->>'id')::uuid from pg_temp.test_values where label='request'$$;
select lives_ok($$select public.update_seller_request_status(pg_temp.id('org-a'),pg_temp.request_id(),'contacted')$$,'contacted append');
select lives_ok($$select public.update_seller_request_status(pg_temp.id('org-a'),pg_temp.request_id(),'contacted')$$,'status retry no duplicate');
select throws_ok($$select public.update_seller_request_status(pg_temp.id('org-a'),pg_temp.request_id(),'completed')$$,'23514',null,'completion requires recorded sale');
select pg_temp.as_user('family-b');
select is(jsonb_array_length(public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'))),0,'other family private');
select throws_ok($$select public.update_seller_request_status(pg_temp.id('org-a'),pg_temp.request_id(),'declined')$$,'42501',null,'other family cannot manage known id');
select pg_temp.as_user('dual');
select is(jsonb_array_length(public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'))),0,'combined captain/family inbox remains own-family only');
select pg_temp.as_user('captain');
select is((select count(*) from public.seller_interest_requests where organization_id=pg_temp.id('org-a')),0::bigint,'captain no contacts');
select pg_temp.as_user('org-b-admin');
select is(jsonb_array_length(public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'))),0,'cross tenant admin denied');
select pg_temp.as_user('admin');
select is(jsonb_array_length(public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'))),0,'admin permission does not widen default family projection');
select is(jsonb_array_length(public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'admin')),1,'permission-bound admin support');
select pg_temp.as_user('admin-director');
select lives_ok($$select public.allocate_campaign_tickets(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','b2'),5)$$,'stock other participant');
select pg_temp.as_user('family-a');
insert into pg_temp.sale_results values('different-player',public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','b2'),'sharing-other-sale','Other Buyer',1,500,'cash'));
select throws_ok($$select public.update_seller_request_status(pg_temp.id('org-a'),pg_temp.request_id(),'completed',pg_temp.sale('different-player'))$$,'23514',null,'cannot link authorized sale from a different participant');
insert into pg_temp.sale_results values('handoff',public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),'sharing-sale','Supporter',2,1000,'cash'));
select lives_ok($$select public.update_seller_request_status(pg_temp.id('org-a'),pg_temp.request_id(),'completed',pg_temp.sale('handoff'))$$,'link normal offline sale separately');
select lives_ok($$select public.update_seller_request_status(pg_temp.id('org-a'),pg_temp.request_id(),'completed',pg_temp.sale('handoff'))$$,'completion retry');
select throws_ok($$select public.update_seller_request_status(pg_temp.id('org-a'),pg_temp.request_id(),'declined')$$,'23514',null,'terminal history preserved');
select is((select count(*) from public.seller_request_events where organization_id=pg_temp.id('org-a')),3::bigint,'new/contacted/completed only');
reset role;
select throws_ok($$delete from public.campaign_seller_links$$,'42501',null,'link history cannot be deleted');
select throws_ok($$update public.campaign_seller_links set expires_at=now()$$,'42501',null,'link identity and expiry immutable');
select throws_ok($$update public.seller_request_events set status='declined'$$,'42501',null,'status history immutable');
select pg_temp.as_db_admin();
update public.guardian_user_links set archived_at=now() where guardian_id=pg_temp.id('guardian-family-a');
select is(public.public_seller_page(pg_temp.token()),null::jsonb,'removing guardian link invalidates public link');
set local role authenticated;
select pg_temp.as_user('family-a');
select is(jsonb_array_length(public.seller_request_inbox(pg_temp.id('org-a'),pg_temp.id('campaign-main'))),0,'scope removal revokes inbox');
reset role;
select pg_temp.as_db_admin();
update public.guardian_user_links set archived_at=null where guardian_id=pg_temp.id('guardian-family-a');
set local role authenticated;
select pg_temp.as_user('family-a');
select ok(public.public_seller_page(pg_temp.token()) is not null,'restored current guardian scope');
select throws_ok($$select public.update_seller_request_status(pg_temp.id('org-b'),pg_temp.request_id(),'contacted')$$,'42501',null,'request organization enforced');
select throws_ok($$select public.manage_seller_link(pg_temp.id('org-a'),pg_temp.participant('main','a1'),null)$$,'23514',null,'null revoke flag denied');
select throws_ok($$insert into public.seller_interest_requests(organization_id,campaign_id,participant_id,seller_link_id,submission_key,request_fingerprint,supporter_name,preferred_contact,requested_quantity) values(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),pg_temp.id('fake'),pg_temp.id('fake'),'fake','Bypass','email',1)$$,'42501',null,'authenticated direct writes denied');
-- Limits are durable and atomic even if the caller changes idempotency keys.
reset role;
select set_config('request.headers','{"x-forwarded-for":"192.0.2.1"}',true);
set local role anon;
select public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('rate-'||n),jsonb_build_object('name','Rate '||n,'email','rate@example.test','contact','email','quantity',1)) from generate_series(1,12)n;
reset role;
select is((select count(*) from public.seller_interest_requests where organization_id=pg_temp.id('org-a')),11::bigint,'IP limit ten per hour');
reset role;
insert into public.seller_request_limits(bucket,window_at,attempts)
select 'link:'||id::text,date_trunc('hour',clock_timestamp()),20 from public.campaign_seller_links where organization_id=pg_temp.id('org-a') and revoked_at is null
on conflict(bucket,window_at) do update set attempts=20;
select set_config('request.headers','{"x-forwarded-for":"192.0.2.2"}',true);
set local role anon;
select public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('link-cap'),'{"name":"Link cap","email":"cap@example.test","contact":"email","quantity":1}');
reset role;
select is((select count(*) from public.seller_interest_requests where organization_id=pg_temp.id('org-a')),11::bigint,'per-link cap across client IPs');
update public.seller_request_limits set attempts=0 where bucket like 'link:%';
insert into public.seller_request_limits values('campaign:'||pg_temp.id('campaign-main')::text,date_trunc('hour',clock_timestamp()),200)
on conflict(bucket,window_at) do update set attempts=200;
select set_config('request.headers','{"x-forwarded-for":"192.0.2.3"}',true);
set local role anon;
select public.submit_seller_interest_request(pg_temp.token(),pg_temp.id('campaign-cap'),'{"name":"Campaign cap","email":"cap@example.test","contact":"email","quantity":1}');
reset role;
select is((select count(*) from public.seller_interest_requests where organization_id=pg_temp.id('org-a')),11::bigint,'campaign cap across links and IPs');
set local role authenticated;
select pg_temp.as_user('family-a');
insert into pg_temp.test_values values('replacement',public.manage_seller_link(pg_temp.id('org-a'),pg_temp.participant('main','a1')));
select is(public.public_seller_page(pg_temp.token()),null::jsonb,'rotation revokes old token');
select isnt((select value->>'token' from pg_temp.test_values where label='replacement'),pg_temp.token(),'rotation never reuses token');
select lives_ok($$select public.manage_seller_link(pg_temp.id('org-a'),pg_temp.participant('main','a1'),true)$$,'revoke');
select is(public.public_seller_page((select value->>'token' from pg_temp.test_values where label='replacement')),null::jsonb,'revoked unavailable');
select is((select count(*) from public.campaign_seller_links where organization_id=pg_temp.id('org-a')),2::bigint,'revocation retains links');
select is((select count(*) from public.seller_interest_requests where organization_id=pg_temp.id('org-a')),11::bigint,'revocation retains inbox');
reset role;
select pg_temp.as_db_admin();
insert into public.campaign_seller_links(organization_id,campaign_id,participant_id,seller_user_id,opaque_token_hash,expires_at)
values(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),pg_temp.id('user-family-a'),encode(extensions.digest(repeat('e',64),'sha256'),'hex'),now()-interval '1 minute');
select is(public.public_seller_page(repeat('e',64)),null::jsonb,'expired link unavailable');
set local role authenticated;
select pg_temp.as_user('family-a');
insert into pg_temp.test_values values('closing-link',public.manage_seller_link(pg_temp.id('org-a'),pg_temp.participant('main','a1')));
select pg_temp.as_user('admin-director');
select lives_ok($$select public.transition_campaign(pg_temp.id('campaign-main'),'CLOSED','Synthetic close')$$,'close campaign');
select is(public.public_seller_page((select value->>'token' from pg_temp.test_values where label='closing-link')),null::jsonb,'closed campaign unavailable');
select throws_ok($$select public.manage_seller_link(pg_temp.id('org-a'),pg_temp.participant('main','a1'))$$,'42501',null,'admin cannot publish a family identity');
select ok((select bool_and(ok) from public.verify_campaign_ledgers(pg_temp.id('campaign-main'))),'sharing preserves ticket/money/campaign ledger hashes');
select ok((select bool_and(ok) from public.verify_audit_chain(pg_temp.id('org-a'))),'sharing triggers preserve audit chain');
reset role;
select * from finish();
rollback;
