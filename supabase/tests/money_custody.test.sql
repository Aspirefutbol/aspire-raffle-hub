-- Phase 1: enrollment, participant-owned stock, offline issuance, corrections,
-- explicit read scopes, composite integrity, and append-only audit/ledgers.
-- Fixture identifiers are deliberately known to every test actor: hiding IDs
-- is never relied upon for authorization. All fixture state rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.id(p_key text) returns uuid language sql immutable as $$
  select md5('raffle-pgtap-money:' || p_key)::uuid;
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


create function pg_temp.money(p_key text,p_kind text,p_extra jsonb default '{}') returns jsonb language sql as $$
 select public.record_money_custody(pg_temp.id('org-a'),pg_temp.id('campaign-main'),
 jsonb_build_object('idempotency_key',p_key,'kind',p_kind,'reason','Synthetic custody test')||p_extra);
$$;
create function pg_temp.balance(p_name text,p_view text default 'admin') returns bigint language sql as $$
 select (public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'),p_view)->'totals'->>p_name)::bigint;
$$;
create function pg_temp.receipt(p_key text) returns uuid language sql security definer as $$
 select id from public.money_custody_events where organization_id=pg_temp.id('org-a') and idempotency_key=p_key;
$$;
set local role authenticated;
select pg_temp.as_user('admin-director');
select is(public.enroll_campaign_players(pg_temp.id('org-a'),pg_temp.id('campaign-main'),true),4,'enroll isolated money fixture');
select lives_ok($$select public.transition_campaign(pg_temp.id('campaign-main'),'READY')$$,'ready');
select lives_ok($$select public.transition_campaign(pg_temp.id('campaign-main'),'ACTIVE','Synthetic launch')$$,'activate');
select is(public.generate_campaign_tickets(pg_temp.id('org-a'),pg_temp.id('campaign-main'),80),80,'generate');
select lives_ok($$select public.allocate_campaign_tickets(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),30)$$,'stock a1');
select lives_ok($$select public.allocate_campaign_tickets(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','b2'),30)$$,'stock b2');
select pg_temp.as_user('family-a');
insert into pg_temp.sale_results values('one',public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),'money-sale-1','Synthetic Buyer',2,1000,'cash',p_sold_at=>now()-interval '2 minutes'));
insert into pg_temp.sale_results values('two',public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','b2'),'money-sale-2','Synthetic Buyer',2,1000,'check',p_sold_at=>now()-interval '1 minute'));
select throws_ok($$select pg_temp.money('family-write','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',100,'payment_method','cash'))$$,'42501',null,'family cannot receive');
select is((select count(*) from public.money_custody_events),0::bigint,'family raw custody facts remain private');
select throws_ok($$select * from public.money_sale_balances$$,'42501',null,'internal owner-rights accounting view is not exposed to clients');
select ok(not has_function_privilege('anon','public.record_money_custody(uuid,uuid,jsonb)','EXECUTE'),'anonymous callers cannot execute custody writes');
select throws_ok($$select public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'admin')$$,'42501',null,'family cannot select admin financial projection');
select pg_temp.as_user('finance');
select is(pg_temp.balance('expected_cents'),2000::bigint,'sales are expected money');
select is(pg_temp.balance('received_cents'),0::bigint,'sales are not receipts');
select is(pg_temp.balance('outstanding_cents'),2000::bigint,'all sale value outstanding initially');
select lives_ok($$select pg_temp.money('cash-1','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',1500,'payment_method','cash'))$$,'partial multi-sale turn-in');
select is(pg_temp.balance('received_cents'),1500::bigint,'received is actual cash');
select is(pg_temp.balance('outstanding_cents'),500::bigint,'partial outstanding');
select is((select count(*) from public.money_custody_allocations),2::bigint,'receipt covers two sales');
select is((select amount_cents from public.money_custody_allocations where sale_id=pg_temp.sale('one')),1000::bigint,'FIFO settles oldest sale');
select is((select amount_cents from public.money_custody_allocations where sale_id=pg_temp.sale('two')),500::bigint,'FIFO partially settles next sale');
select is((pg_temp.money('cash-1','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',1500,'payment_method','cash'))->>'replayed')::boolean,true,'same caller retry replays');
select is((select count(*) from public.money_custody_events),1::bigint,'replay creates no receipt');
select throws_ok($$select pg_temp.money('cash-1','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',100,'payment_method','cash'))$$,'23514',null,'changed payload rejected');
select throws_ok($$select pg_temp.money('over','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',501,'payment_method','cash'))$$,'23514',null,'overreceipt rejected');
select throws_ok($$select pg_temp.money('fake-approve','adjustment',jsonb_build_object('sale_id',pg_temp.sale('two'),'amount_cents',100,'approved_by',pg_temp.id('user-director')))$$,'23514',null,'client cannot supply approving actor');
select throws_ok($$select pg_temp.money('finance-adjust','adjustment',jsonb_build_object('sale_id',pg_temp.sale('two'),'amount_cents',100))$$,'42501',null,'Finance cannot approve sensitive adjustments');
select lives_ok($$select pg_temp.money('check-1','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',500,'payment_method','check','reference','Synthetic check 1'))$$,'receive uncleared check');
select is(pg_temp.balance('received_cents'),2000::bigint,'check is physically received');
select is(pg_temp.balance('reconciled_cents'),1500::bigint,'uncleared check is not reconciled');
select is(pg_temp.balance('uncleared_cents'),500::bigint,'uncleared check balance');
select throws_ok($$select pg_temp.money('early-deposit','deposit',jsonb_build_object('receipt_id',pg_temp.receipt('check-1'),'amount_cents',500))$$,'23514',null,'uncleared check cannot be deposited');
select lives_ok($$select pg_temp.money('return-1','check_returned',jsonb_build_object('receipt_id',pg_temp.receipt('check-1')))$$,'returned check explicit event');
select is(pg_temp.balance('received_cents'),1500::bigint,'returned check reverses receipt credit');
select is(pg_temp.balance('exception_cents'),500::bigint,'returned-check exception balance');
select is(pg_temp.balance('outstanding_cents'),500::bigint,'returned check reopens liability');
select is((select count(*) from public.tickets where campaign_id=pg_temp.id('campaign-main') and status='ISSUED'),4::bigint,'returned check never voids tickets');
select throws_ok($$select pg_temp.money('clear-return','check_cleared',jsonb_build_object('receipt_id',pg_temp.receipt('check-1')))$$,'23514',null,'returned checks cannot pretend to clear');
select throws_ok($$select pg_temp.money('resolve-early','exception_resolved',jsonb_build_object('receipt_id',pg_temp.receipt('check-1')))$$,'23514',null,'exception cannot be silently settled');
select lives_ok($$select pg_temp.money('recover','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',500,'payment_method','cash'))$$,'replacement cash is a new real receipt');
select lives_ok($$select pg_temp.money('resolved','exception_resolved',jsonb_build_object('receipt_id',pg_temp.receipt('check-1')))$$,'settled exception can resolve');
select is(pg_temp.balance('exception_cents'),0::bigint,'resolved exception no longer open');
select lives_ok($$select pg_temp.money('deposit-1','deposit',jsonb_build_object('receipt_id',pg_temp.receipt('cash-1'),'amount_cents',1500,'reference','Synthetic batch A'))$$,'cash deposit evidence');
select lives_ok($$select pg_temp.money('deposit-2','deposit',jsonb_build_object('receipt_id',pg_temp.receipt('recover'),'amount_cents',500))$$,'recovery cash deposit');
select is(pg_temp.balance('deposited_cents'),2000::bigint,'historical deposit totals');
select throws_ok($$select pg_temp.money('deposit-over','deposit',jsonb_build_object('receipt_id',pg_temp.receipt('cash-1'),'amount_cents',1))$$,'23514',null,'cannot double deposit funds');
select pg_temp.as_user('admin-director');
select lives_ok($$select public.reverse_campaign_sale(pg_temp.id('org-a'),pg_temp.sale('one'),'Synthetic sale correction')$$,'reverse after receipt');
select is(pg_temp.balance('expected_cents'),1000::bigint,'reversal reduces sale obligation');
select is(pg_temp.balance('received_cents'),2000::bigint,'reversal cannot erase physical receipts');
select is(pg_temp.balance('credit_cents'),1000::bigint,'overpayment becomes an explicit available credit');
select pg_temp.as_user('admin-director');
insert into pg_temp.sale_results values('corrected',public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','a1'),'replacement','Synthetic corrected buyer',2,1000,'cash',null,null,null,null,pg_temp.sale('one')));
select is((select count(*) from public.money_custody_events where kind='receipt'),3::bigint,'operator correction did not create a receipt');
select pg_temp.as_user('finance');
select is((public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'))->'sellers'->0->>'id')::uuid,pg_temp.id('user-family-a'),'operator-entered correction retains original custody account');
select throws_ok($$select pg_temp.money('manufactured','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',1000,'payment_method','cash'))$$,'23514',null,'correction credit cannot manufacture another receipt');
select pg_temp.as_user('director');
select lives_ok($$select pg_temp.money('credit-1','credit',jsonb_build_object('receipt_id',pg_temp.receipt('cash-1'),'sale_id',pg_temp.sale('one'),'target_sale_id',pg_temp.sale('corrected'),'amount_cents',700))$$,'approved correction credit transfer');
select is(pg_temp.balance('received_cents'),2000::bigint,'credit transfer creates no new physical funds');
select lives_ok($$select pg_temp.money('refund-1','refund',jsonb_build_object('receipt_id',pg_temp.receipt('cash-1'),'sale_id',pg_temp.sale('one'),'amount_cents',300))$$,'explicit partial refund');
select is(pg_temp.balance('received_cents'),1700::bigint,'refund is explicit outflow');
select is(pg_temp.balance('outstanding_cents'),300::bigint,'remaining correction obligation');
select lives_ok($$select pg_temp.money('adjust-1','adjustment',jsonb_build_object('sale_id',pg_temp.sale('corrected'),'amount_cents',200))$$,'approved liability relief');
select is(pg_temp.balance('outstanding_cents'),100::bigint,'approved relief reduces outstanding');
select lives_ok($$select pg_temp.money('undo-adjust','adjustment',jsonb_build_object('sale_id',pg_temp.sale('corrected'),'amount_cents',-100))$$,'undo relief with separate approved event');
select is(pg_temp.balance('outstanding_cents'),200::bigint,'undo restores liability');
select throws_ok($$select pg_temp.money('invalid-undo','adjustment',jsonb_build_object('sale_id',pg_temp.sale('corrected'),'amount_cents',-200))$$,'23514',null,'cannot undo more relief than approved');
select pg_temp.as_user('finance');
select lives_ok($$select pg_temp.money('balance-receipt','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',200,'payment_method','cash'))$$,'final partial correction turn-in');
select is(pg_temp.balance('outstanding_cents'),0::bigint,'correction settled');
select is(pg_temp.balance('expected_cents'),2000::bigint,'net valid sales remain expected');
select is(pg_temp.balance('received_cents'),1900::bigint,'receipts minus actual refund');
select is(pg_temp.balance('adjustment_cents'),100::bigint,'approved adjustments separate');
select is(pg_temp.balance('reconciled_cents'),1900::bigint,'cleared cash reconciled separately');
select is((public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'))->'sellers'->0->>'received_cents')::bigint,1900::bigint,'seller total matches campaign');

select pg_temp.as_user('family-a');
insert into pg_temp.sale_results values('late-check',public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','b2'),'late-check','Synthetic check buyer',1,500,'check'));
select pg_temp.as_user('finance');
select lives_ok($$select pg_temp.money('check-late','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',500,'payment_method','check'))$$,'receive second check');
select lives_ok($$select pg_temp.money('clear-late','check_cleared',jsonb_build_object('receipt_id',pg_temp.receipt('check-late')))$$,'explicit check clearance');
select is(pg_temp.balance('uncleared_cents'),0::bigint,'clearance removes pending balance');
select is(pg_temp.balance('reconciled_cents'),2400::bigint,'cleared check counted in reconciliation');
select throws_ok($$select pg_temp.money('clear-twice','check_cleared',jsonb_build_object('receipt_id',pg_temp.receipt('check-late')))$$,'23514',null,'new key cannot clear twice');
select lives_ok($$select pg_temp.money('deposit-late','deposit',jsonb_build_object('receipt_id',pg_temp.receipt('check-late'),'amount_cents',500))$$,'deposit cleared check');
select lives_ok($$select pg_temp.money('bounce-late','check_returned',jsonb_build_object('receipt_id',pg_temp.receipt('check-late')))$$,'check can bounce after clearance/deposit');
select is(pg_temp.balance('outstanding_cents'),500::bigint,'late bounce restores outstanding');
select is(pg_temp.balance('reconciled_cents'),1900::bigint,'late bounce removes cleared value');
select is(pg_temp.balance('deposited_cents'),2500::bigint,'original deposit evidence remains immutable after bounce');
select is(pg_temp.balance('exception_cents'),500::bigint,'late bounce is explicit exception');
select throws_ok($$select pg_temp.money('bounce-twice','check_returned',jsonb_build_object('receipt_id',pg_temp.receipt('check-late')))$$,'23514',null,'check cannot bounce twice');
select pg_temp.as_user('director');
select lives_ok($$select pg_temp.money('writeoff','adjustment',jsonb_build_object('sale_id',pg_temp.sale('late-check'),'amount_cents',500))$$,'sensitive approval can relieve returned-check liability');
select is((select approved_by from public.money_events where metadata->>'kind'='adjustment' and amount_cents=500),pg_temp.id('user-director'),'approver derived from authenticated actor');
select pg_temp.as_user('finance');
select lives_ok($$select pg_temp.money('resolved-late','exception_resolved',jsonb_build_object('receipt_id',pg_temp.receipt('check-late')))$$,'approved exception resolution separate from receipt');
select is(pg_temp.balance('exception_cents'),0::bigint,'approved resolution removes exception');
select is(pg_temp.balance('received_cents'),1900::bigint,'writeoff and resolution do not manufacture receipts');
select throws_ok($$select public.record_money_custody(pg_temp.id('org-a'),pg_temp.id('campaign-main'),jsonb_build_object('kind','receipt','idempotency_key','no-reason','seller_id',pg_temp.id('user-family-a'),'amount_cents',100,'payment_method','cash'))$$,'23514',null,'variance/custody actions require reason');
select is((select count(*) from public.tickets where campaign_id=pg_temp.id('campaign-main') and status='ISSUED'),5::bigint,'financial actions leave valid tickets unchanged');
select is((public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'))->'teams'->0->>'expected_cents')::bigint,1000::bigint,'Team A expected balance matches corrected a1');

select lives_ok($$select pg_temp.money('other-exception','exception_opened',jsonb_build_object('sale_id',pg_temp.sale('late-check'),'amount_cents',100))$$,'record other financial exception without changing money');
select is(pg_temp.balance('exception_cents'),100::bigint,'other exceptions are visible balances');
select is(pg_temp.balance('received_cents'),1900::bigint,'opening exception creates no cash receipt');
select lives_ok($$select pg_temp.money('resolve-other','exception_resolved',jsonb_build_object('exception_id',pg_temp.receipt('other-exception')))$$,'explicit resolution of other settled exception');
select is(pg_temp.balance('exception_cents'),0::bigint,'other exception resolved');
select throws_ok($$select pg_temp.money('resolve-other-again','exception_resolved',jsonb_build_object('exception_id',pg_temp.receipt('other-exception')))$$,'23514',null,'other exception cannot be resolved twice');
select pg_temp.as_user('family-a');
select is(jsonb_array_length(public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'family')->'participants'),2,'family linked-player scope only');
select is(jsonb_array_length(public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'family')->'events'),0,'family receives no private financial events');
select is(jsonb_array_length(public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'family')->'sales'),0,'family money summary redacts sale details');
select pg_temp.as_user('captain');
select is(jsonb_array_length(public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'team')->'participants'),2,'captain current assigned team only');
select is(jsonb_array_length(public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'team')->'events'),0,'captain private notes not exposed');
select is((select count(*) from public.money_custody_allocations),0::bigint,'captain raw allocation RLS denial');
select throws_ok($$select pg_temp.money('captain-write','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',100,'payment_method','cash'))$$,'42501',null,'captain cannot receive');
select pg_temp.as_user('org-b-admin');
select throws_ok($$select public.campaign_money(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'admin')$$,'42501',null,'cross-tenant money projection denied');
select throws_ok($$select pg_temp.money('foreign','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',100,'payment_method','cash'))$$,'42501',null,'cross-tenant receive denied');
select is((select count(*) from public.money_custody_events),0::bigint,'cross-tenant raw RLS denial');
select pg_temp.as_user('admin-director');
select throws_ok($$insert into public.money_custody_events(id) values(gen_random_uuid())$$,'42501',null,'direct insert denied even with financial role');
reset role;
select throws_ok($$update public.money_custody_events set reason='Rewrite history' where id=pg_temp.receipt('cash-1')$$,'42501',null,'even privileged update cannot rewrite financial facts');
select throws_ok($$delete from public.money_custody_allocations where receipt_id=pg_temp.receipt('cash-1')$$,'42501',null,'financial allocations immutable');
set local role authenticated;
select pg_temp.as_user('admin-director');
select ok((select bool_and(ok) from public.verify_campaign_ledgers(pg_temp.id('campaign-main'))),'canonical money hashes intact');
select ok((select bool_and(ok) from public.verify_campaign_ledgers(pg_temp.id('campaign-main'))),'ticket hashes intact');
select ok((select bool_and(ok) from public.verify_audit_chain(pg_temp.id('org-a'))),'audit chain intact');

select pg_temp.as_user('family-a');
insert into pg_temp.sale_results values('frozen-check',public.record_campaign_sale(pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant('main','b2'),'frozen-check','Synthetic frozen check buyer',1,500,'check'));
select pg_temp.as_user('finance');
select lives_ok($$select pg_temp.money('frozen-check-receipt','receipt',jsonb_build_object('seller_id',pg_temp.id('user-family-a'),'amount_cents',500,'payment_method','check'))$$,'receive a check before drawing freeze');
select pg_temp.as_user('admin-director');
select lives_ok($$select public.transition_campaign(pg_temp.id('campaign-main'),'CLOSED','Synthetic sales close')$$,'close sales before freezing');
insert into pg_temp.test_values values('money-snapshot',public.freeze_drawing(pg_temp.id('org-a'),pg_temp.id('campaign-main'),'money-freeze','Synthetic approved physical drawing population',true));
select is((select (value->>'count')::integer from pg_temp.test_values where label='money-snapshot'),6,'uncleared checks remain in drawing population');
select pg_temp.as_user('finance');
select lives_ok($$select pg_temp.money('frozen-bounce','check_returned',jsonb_build_object('receipt_id',pg_temp.receipt('frozen-check-receipt')))$$,'returned check can be recorded after sales close and freeze');
select is(pg_temp.balance('outstanding_cents'),500::bigint,'post-freeze bounced check restores only financial liability');
select is((select count(*) from public.tickets where campaign_id=pg_temp.id('campaign-main') and status='ISSUED'),6::bigint,'post-freeze financial exception never alters eligible tickets');
select pg_temp.as_user('admin-director');
select ok((public.verify_drawing_snapshot(pg_temp.id('org-a'),(select (value->>'snapshot_id')::uuid from pg_temp.test_values where label='money-snapshot'))->>'ok')::boolean,'drawing manifest and anchored ledger prefix still verify after financial event');
select ok((select bool_and(ok) from public.verify_campaign_ledgers(pg_temp.id('campaign-main'))),'post-freeze financial ledger still verifies');
select ok((select ok from public.verify_audit_chain(pg_temp.id('org-a'))),'post-freeze audit still verifies');
select * from finish();
rollback;
