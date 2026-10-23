-- Synthetic local fixtures only. Retains all original ledger and role contracts.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql immutable as $$ select md5('package-fixture:'||k)::uuid $$;
create function pg_temp.actor(k text) returns void language sql as $$ select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(k),'role','authenticated')::text,true) $$;
create temporary table results(k text primary key,v jsonb);
grant all on pg_temp.results to authenticated;
create function pg_temp.sale(k text) returns uuid language sql stable as $$ select (v->>'sale_id')::uuid from pg_temp.results where results.k=$1 $$;
create function pg_temp.cp(k text) returns uuid language sql stable security definer set search_path='' as $$ select id from public.campaign_participants where campaign_id=pg_temp.id('campaign') and player_id=pg_temp.id(k) $$;

select ok(not has_function_privilege('anon','public.quote_campaign_ticket_packages(integer,bigint,jsonb)','EXECUTE'),'no new anonymous pricing endpoint');
select ok(not has_function_privilege('authenticated','public.campaign_sale_pricing(integer,bigint,jsonb)','EXECUTE'),'internal pricing builder is not a public seller RPC');
select ok(public.valid_campaign_ticket_packages(null,'[]'),'incomplete single-price draft remains supported');
select ok(not public.valid_campaign_ticket_packages(null,'[{"quantity":5,"priceCents":9000}]'),'bundles require the single price');
select ok(not public.valid_campaign_ticket_packages(2000,'[{"quantity":5,"priceCents":10001}]'),'packages cannot exceed equivalent singles');
select ok(not public.valid_campaign_ticket_packages(2000,'[{"quantity":5,"priceCents":4}]'),'no zero-value ticket allocations');
select ok(not public.valid_campaign_ticket_packages(2000,'[{"quantity":5,"priceCents":9000},{"quantity":5,"priceCents":8500}]'),'duplicate sizes are rejected');
select ok(not public.valid_campaign_ticket_packages(2000,'[{"quantity":"5","priceCents":9000}]'),'no string coercion');
select ok(not public.valid_campaign_ticket_packages(2000,'[{"quantity":5,"priceCents":9000,"extra":true}]'),'no unexpected config keys');
select ok((select bool_and((public.quote_campaign_ticket_packages(q,2000,'[{"quantity":5,"priceCents":9000}]')->>'totalCents')::bigint=(q/5)*9000+(q%5)*2000) from generate_series(1,500) q),'all Aspire quantities use exact bundle totals');
select is(public.campaign_sale_pricing(6,2000,'[{"quantity":5,"priceCents":9000}]')->'ticketAmountsCents','[1800,1800,1800,1800,1800,2000]'::jsonb,'mixed bundle/single ticket values are exact');
select is(public.campaign_sale_pricing(3,500,'[{"quantity":3,"priceCents":1000}]')->'ticketAmountsCents','[334,333,333]'::jsonb,'remainder cents are retained without changing ticket count');

insert into auth.users(id,email,email_confirmed_at) values
 (pg_temp.id('admin'),'packages-admin@example.test',now()),(pg_temp.id('family'),'packages-family@example.test',now()),(pg_temp.id('foreign'),'packages-foreign@example.test',now());
insert into public.organizations(id,name,legal_name,slug,address_line1,city,region,support_email,jurisdiction_profile,platform_config) values
 (pg_temp.id('org'),'Package fixture','Package Fixture Inc','package-fixture','1 Test St','Houston','TX','support@example.test','TEXAS_CREA_OFFLINE_PAYMENT','{"texas_crea_compliance_required":false}'),
 (pg_temp.id('otherorg'),'Other package fixture','Other Fixture Inc','other-package-fixture','2 Test St','Houston','TX','support@example.test','TEXAS_CREA_OFFLINE_PAYMENT','{"texas_crea_compliance_required":false}');
insert into public.organization_members(id,organization_id,user_id) values
 (pg_temp.id('adminmember'),pg_temp.id('org'),pg_temp.id('admin')),(pg_temp.id('familymember'),pg_temp.id('org'),pg_temp.id('family')),(pg_temp.id('foreignmember'),pg_temp.id('otherorg'),pg_temp.id('foreign'));
insert into public.organization_member_roles(organization_id,member_id,role_key) values
 (pg_temp.id('org'),pg_temp.id('adminmember'),'ORGANIZATION_ADMIN'),(pg_temp.id('org'),pg_temp.id('adminmember'),'DIRECTOR'),
 (pg_temp.id('org'),pg_temp.id('familymember'),'PARTICIPANT_FAMILY'),(pg_temp.id('org'),pg_temp.id('familymember'),'TEAM_CAPTAIN'),
 (pg_temp.id('otherorg'),pg_temp.id('foreignmember'),'ORGANIZATION_ADMIN');
insert into public.households(id,organization_id,name) values(pg_temp.id('house'),pg_temp.id('org'),'Package Family');
insert into public.guardians(id,organization_id,household_id,first_name,last_name) values(pg_temp.id('guardian'),pg_temp.id('org'),pg_temp.id('house'),'Synthetic','Parent');
insert into public.players(id,organization_id,household_id,first_name,last_name) values
 (pg_temp.id('own'),pg_temp.id('org'),pg_temp.id('house'),'Own','Player'),(pg_temp.id('other'),pg_temp.id('org'),null,'Other','Player');
insert into public.teams(id,organization_id,name) values(pg_temp.id('team'),pg_temp.id('org'),'Package Team');
insert into public.team_memberships(organization_id,player_id,team_id) values
 (pg_temp.id('org'),pg_temp.id('own'),pg_temp.id('team')),(pg_temp.id('org'),pg_temp.id('other'),pg_temp.id('team'));
insert into public.guardian_user_links(organization_id,guardian_id,member_id) values(pg_temp.id('org'),pg_temp.id('guardian'),pg_temp.id('familymember'));
insert into public.team_staff_assignments(organization_id,team_id,member_id) values(pg_temp.id('org'),pg_temp.id('team'),pg_temp.id('familymember'));
insert into public.campaigns(id,organization_id,name,ticket_price_cents,ticket_packages,ticket_prefix,starts_at,sales_close_at,draw_at,default_allocation,rules_text) values
 (pg_temp.id('campaign'),pg_temp.id('org'),'Synthetic package raffle',2000,'[{"quantity":5,"priceCents":9000}]','PK',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days',50,'Synthetic offline rules; external witnessed drawing.');
set local role authenticated;
select pg_temp.actor('admin');
select lives_ok($$ select public.enroll_campaign_players(pg_temp.id('org'),pg_temp.id('campaign'),true) $$,'enroll package fixture');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign'),'READY') $$,'package setup passes readiness');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign'),'ACTIVE','Synthetic approved pricing') $$,'activate with locked bundles');
select lives_ok($$ select public.prepare_campaign_inventory(pg_temp.id('org'),pg_temp.id('campaign')) $$,'prepare assigned stock');
select throws_ok($$ update public.campaigns set ticket_packages='[]' where id=pg_temp.id('campaign') $$,'23514',null,'prices stay locked after activation');
select pg_temp.actor('family');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'bad-price','Synthetic Buyer',5,10000,'cash') $$,'23514',null,'even a caller-supplied full single-price amount is rejected for a discounted bundle');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'underpay','Synthetic Buyer',5,8000,'cash') $$,'23514',null,'underpayment cannot issue tickets');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('other'),'wrong-player','Synthetic Buyer',5,9000,'cash') $$,'42501',null,'captain-family combination cannot sell for another player');
insert into results values('first',public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'five','Synthetic Buyer',5,9000,'cash'));
select is((select v->>'amount_cents' from results where k='first'),'9000','five tickets cost $90');
select is((select jsonb_array_length(v->'ticket_numbers') from results where k='first'),5,'exactly five distinct ticket numbers issued');
select is(public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'five','Synthetic Buyer',5,9000,'cash')->>'replayed','true','same request replays without a second sale');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'five','Synthetic Buyer',6,11000,'cash') $$,'23505',null,'same key cannot be changed into another quote');
insert into results values('six',public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'six','Synthetic Check Buyer',6,11000,'check'));
select is((public.campaign_progress(pg_temp.id('org'),pg_temp.id('campaign'),'family')->'totals'->>'raised_cents')::bigint,20000::bigint,'progress uses actual $200 sales not $220 list value');
select is((select count(*) from public.campaign_sales where campaign_id=pg_temp.id('campaign')),2::bigint,'retries and rejected sales create no extra sale rows');
select is((public.sale_ticket_receipt(pg_temp.id('org'),pg_temp.sale('first'))->'tickets'->0->>'price_cents')::bigint,1800::bigint,'printed ticket uses the $18 bundle allocation');
select is((select sum((t->>'price_cents')::bigint) from jsonb_array_elements(public.sale_ticket_receipt(pg_temp.id('org'),pg_temp.sale('six'))->'tickets') t),11000::numeric,'mixed receipt ticket values reconcile exactly');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'too-many','Synthetic Buyer',500,900000,'cash') $$,'23514',null,'package pricing does not bypass assigned stock');
select pg_temp.actor('foreign');
select throws_ok($$ select public.sale_ticket_receipt(pg_temp.id('org'),pg_temp.sale('first')) $$,'42501',null,'other tenants cannot read bundle receipts');
select pg_temp.actor('admin');
insert into results values('cash-receipt',public.record_money_custody(pg_temp.id('org'),pg_temp.id('campaign'),jsonb_build_object('kind','receipt','idempotency_key','cash-turnin','reason','Synthetic bundle cash turn-in','amount_cents',9000,'seller_id',pg_temp.id('family'),'payment_method','cash')));
select lives_ok($$ select public.reverse_campaign_sale(pg_temp.id('org'),pg_temp.sale('first'),'Synthetic correction after cash custody') $$,'bundle reversal preserves existing physical receipt');
select is((select amount_cents from public.campaign_sales where id=pg_temp.sale('first')),9000::bigint,'original $90 sale fact remains unchanged');
select is((select pricing_snapshot from public.campaign_sales where id=pg_temp.sale('first')),(select v->'pricing_snapshot' from results where k='first'),'original package evidence remains unchanged');
select pg_temp.actor('family');
insert into results values('corrected',public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'corrected-five','Corrected Synthetic Buyer',5,9000,'cash',p_corrects_sale_id=>pg_temp.sale('first')));
select ok(not exists(select 1 from jsonb_array_elements_text((select v->'ticket_numbers' from results where k='first')) a join jsonb_array_elements_text((select v->'ticket_numbers' from results where k='corrected')) b on a.value=b.value),'correction uses fresh ticket numbers');
select pg_temp.actor('admin');
select lives_ok($$ select public.record_money_custody(pg_temp.id('org'),pg_temp.id('campaign'),jsonb_build_object('kind','credit','idempotency_key','credit-bundle','reason','Move already-held bundle cash','amount_cents',9000,'receipt_id',(select v->>'event_id' from results where k='cash-receipt'),'sale_id',pg_temp.sale('first'),'target_sale_id',pg_temp.sale('corrected'))) $$,'explicit credit transfers $90 without manufacturing a receipt');
insert into results values('check-receipt',public.record_money_custody(pg_temp.id('org'),pg_temp.id('campaign'),jsonb_build_object('kind','receipt','idempotency_key','check-turnin','reason','Synthetic check turn-in','amount_cents',11000,'seller_id',pg_temp.id('family'),'payment_method','check')));
select lives_ok($$ select public.record_money_custody(pg_temp.id('org'),pg_temp.id('campaign'),jsonb_build_object('kind','check_cleared','idempotency_key','check-clear','reason','Synthetic check cleared','receipt_id',(select v->>'event_id' from results where k='check-receipt'))) $$,'mixed package check can be reconciled');
select is((select sum(expected_cents) from public.money_sale_balances where campaign_id=pg_temp.id('campaign')),20000::numeric,'custody expects exact net bundle sales');
select is((select sum(received_cents) from public.money_sale_balances where campaign_id=pg_temp.id('campaign')),20000::numeric,'custody records only the $200 physically received');
select ok((select bool_and(ok) from public.verify_campaign_ledgers(pg_temp.id('campaign'))),'bundle and correction ledger hashes verify');
update public.campaigns set sales_close_at=now() where id=pg_temp.id('campaign');
select lives_ok($$ select public.transition_campaign(pg_temp.id('campaign'),'CLOSED','Synthetic sales cutoff reached') $$,'close package raffle');
select pg_temp.actor('family');
select is(public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'six','Synthetic Check Buyer',6,11000,'check')->>'replayed','true','committed bundle retry still works after close');
select throws_ok($$ select public.record_campaign_sale(pg_temp.id('org'),pg_temp.id('campaign'),pg_temp.cp('own'),'late','Late Buyer',5,9000,'cash') $$,'23514',null,'new post-close bundle sale remains blocked');
select pg_temp.actor('admin');
select is(public.drawing_readiness(pg_temp.id('org'),pg_temp.id('campaign'))->>'ready','true','discounted tickets pass drawing readiness');
insert into results values('drawing',public.freeze_drawing(pg_temp.id('org'),pg_temp.id('campaign'),'freeze-packages','Synthetic package drawing',true));
select is((select (v->>'total_face_value_cents')::bigint from results where k='drawing'),20000::bigint,'drawing total equals paid prices without lost cents');
select is((select (v->>'count')::integer from results where k='drawing'),11,'drawing contains exactly eleven unreversed tickets');
select is(public.verify_drawing_snapshot(pg_temp.id('org'),(select (v->>'snapshot_id')::uuid from results where k='drawing'))->>'ok','true','frozen bundle snapshot integrity verifies');
select ok((select bool_and(ok) from public.verify_audit_chain(pg_temp.id('org'))),'audit history remains intact');
select * from finish();
rollback;
