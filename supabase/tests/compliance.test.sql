-- Controlled pilot compliance: director attestation, activation gate, ticket
-- disclosure artifact, authorization, immutability, and void history.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

create function pg_temp.id(p_key text) returns uuid language sql immutable as $$
  select md5('raffle-pgtap-compliance:' || p_key)::uuid;
$$;
create function pg_temp.as_user(p_key text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', pg_temp.id('user-' || p_key), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.participant() returns uuid language sql stable security definer set search_path='' as $func$
  select id from public.campaign_participants
  where campaign_id=pg_temp.id('campaign-main') and player_id=pg_temp.id('player-a1');
$func$;
create temporary table compliance_sale(result jsonb);
grant select,insert on pg_temp.compliance_sale to authenticated;

insert into auth.users(id,email,email_confirmed_at)
select pg_temp.id('user-'||actor), actor||'@compliance.test', now()
from unnest(array['admin-director','manager','family','captain']) actor;

insert into public.organizations(
  id,name,slug,legal_name,jurisdiction_profile,address_line1,city,region,postal_code,country,
  support_email,platform_config
) values (
  pg_temp.id('org-a'),'Aspire Test','aspire-compliance','Aspire Sports Group',
  'TEXAS_CREA_OFFLINE_PAYMENT','123 Compliance Way','Houston','TX','77001','US',
  'support@compliance.test','{"texas_crea_compliance_required":true}'::jsonb
);

insert into public.organization_members(id,organization_id,user_id)
select pg_temp.id('member-'||actor),pg_temp.id('org-a'),pg_temp.id('user-'||actor)
from unnest(array['admin-director','manager','family','captain']) actor;

insert into public.organization_member_roles(organization_id,member_id,role_key) values
  (pg_temp.id('org-a'),pg_temp.id('member-admin-director'),'ORGANIZATION_ADMIN'),
  (pg_temp.id('org-a'),pg_temp.id('member-admin-director'),'DIRECTOR'),
  (pg_temp.id('org-a'),pg_temp.id('member-manager'),'CAMPAIGN_MANAGER'),
  (pg_temp.id('org-a'),pg_temp.id('member-family'),'PARTICIPANT_FAMILY'),
  (pg_temp.id('org-a'),pg_temp.id('member-captain'),'TEAM_CAPTAIN');

insert into public.teams(id,organization_id,name)
values(pg_temp.id('team-a'),pg_temp.id('org-a'),'Compliance Team');
insert into public.households(id,organization_id,name)
values(pg_temp.id('house-a'),pg_temp.id('org-a'),'Compliance Household');
insert into public.guardians(id,organization_id,household_id,first_name,last_name)
values(pg_temp.id('guardian-family'),pg_temp.id('org-a'),pg_temp.id('house-a'),'Family','Guardian');
insert into public.guardian_user_links(organization_id,guardian_id,member_id)
values(pg_temp.id('org-a'),pg_temp.id('guardian-family'),pg_temp.id('member-family'));
insert into public.players(id,organization_id,household_id,first_name,last_name,status)
values(pg_temp.id('player-a1'),pg_temp.id('org-a'),pg_temp.id('house-a'),'Pilot','Player','active');
insert into public.team_memberships(organization_id,player_id,team_id)
values(pg_temp.id('org-a'),pg_temp.id('player-a1'),pg_temp.id('team-a'));
insert into public.team_staff_assignments(organization_id,team_id,member_id)
values(pg_temp.id('org-a'),pg_temp.id('team-a'),pg_temp.id('member-captain'));

insert into public.campaigns(
  id,organization_id,name,ticket_price_cents,ticket_prefix,starts_at,sales_close_at,draw_at,
  default_allocation,rules_text
) values (
  pg_temp.id('campaign-main'),pg_temp.id('org-a'),'Controlled Pilot Compliance',500,'CPLT',
  now()-interval '1 day',now()+interval '10 days',now()+interval '11 days',2,
  'Synthetic compliance fixture rules. Offline cash/check only.'
);

set local role authenticated;
select pg_temp.as_user('admin-director');

select ok('prize description'=any(public.campaign_readiness(pg_temp.id('campaign-main'))),
  'readiness requires a prize description');
select ok('charitable purpose'=any(public.campaign_readiness(pg_temp.id('campaign-main'))),
  'readiness requires the charitable purpose');
select ok('raffle calendar-year number'=any(public.campaign_readiness(pg_temp.id('campaign-main'))),
  'readiness requires the raffle calendar-year number');
select ok('current Texas compliance attestation'=any(public.campaign_readiness(pg_temp.id('campaign-main'))),
  'readiness requires a current director attestation');
select throws_ok($$select public.transition_campaign(pg_temp.id('campaign-main'),'READY')$$,
  '23514',null,'campaign cannot become READY while compliance gate is incomplete');

select pg_temp.as_user('manager');
select throws_ok($q$select public.confirm_campaign_compliance(
  pg_temp.id('campaign-main'),'Manager tried to attest',true,true,true
)$q$,'42501',null,'campaign manager cannot perform director compliance attestation');

select pg_temp.as_user('admin-director');
select lives_ok($$update public.campaigns set
  prize_description='Donated synthetic training package valued over $10',
  charitable_purpose='Support youth soccer financial aid and player development',
  raffle_year_sequence=1
  where id=pg_temp.id('campaign-main')$$,'authorized admin can prepare compliance disclosures');

select throws_ok($q$select public.confirm_campaign_compliance(
  pg_temp.id('campaign-main'),'Attempted incomplete compliance attestation',true,true,false
)$q$,'23514',null,'database rejects incomplete compliance confirmation flags');

select is(length((public.confirm_campaign_compliance(
  pg_temp.id('campaign-main'),'Reviewed synthetic entity, raffle count, prize and direct-sale plan',
  true,true,true
)->>'confirmation_hash')),64,'director attestation stores a SHA-256 fingerprint');

select is((select compliance_attestation->>'entity_eligibility_and_name_change_evidence_reviewed'
  from public.campaigns where id=pg_temp.id('campaign-main')),'true',
  'director attestation facts are stored on the campaign');
select is(cardinality(public.campaign_readiness(pg_temp.id('campaign-main'))),0,
  'current attestation clears activation readiness');
select is((select compliance_confirmed_by from public.campaigns where id=pg_temp.id('campaign-main')),
  pg_temp.id('user-admin-director'),'attestation records the director actor');

select lives_ok($$update public.campaigns set
  prize_description='Updated donated synthetic training package valued over $10'
  where id=pg_temp.id('campaign-main')$$,'pre-activation compliance disclosure may be corrected');
select is((select compliance_confirmed_at from public.campaigns where id=pg_temp.id('campaign-main')),
  null::timestamptz,'changing reviewed disclosure clears the prior confirmation');
select ok('current Texas compliance attestation'=any(public.campaign_readiness(pg_temp.id('campaign-main'))),
  'edited disclosure returns campaign to compliance hold');
select is(length((public.confirm_campaign_compliance(
  pg_temp.id('campaign-main'),'Re-reviewed updated synthetic prize disclosure',
  true,true,true
)->>'confirmation_hash')),64,'director can re-attest the updated payload');

select is(public.enroll_campaign_players(
  pg_temp.id('org-a'),pg_temp.id('campaign-main'),false,'{}',array[pg_temp.id('player-a1')]
),1,'pilot player enrolls before activation');
select lives_ok($$select public.transition_campaign(pg_temp.id('campaign-main'),'READY')$$,
  'compliance-ready campaign moves to READY');
select lives_ok($$select public.transition_campaign(
  pg_temp.id('campaign-main'),'ACTIVE','Director activates compliance-approved synthetic raffle'
)$$,'director activates only the attested campaign');
select is((select operator_legal_name from public.campaigns where id=pg_temp.id('campaign-main')),
  'Aspire Sports Group','activation snapshots current legal operator name');
select is(public.prepare_campaign_inventory(pg_temp.id('org-a'),pg_temp.id('campaign-main')),
  2,'pilot player receives assigned immutable ticket inventory');

select pg_temp.as_user('family');
insert into pg_temp.compliance_sale values(public.record_campaign_sale(
  pg_temp.id('org-a'),pg_temp.id('campaign-main'),pg_temp.participant(),'compliance-sale',
  'Synthetic Buyer',1,500,'cash','buyer@compliance.test','555-0100','Compliance ticket test'
));
select is((select (result->>'quantity')::integer from pg_temp.compliance_sale),1,
  'authorized family records one offline sale');

select is((public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)->>'operator_legal_name'),'Aspire Sports Group','ticket artifact carries legal operator name');
select is((public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)->'operator_address'->>'line1'),'123 Compliance Way','ticket artifact carries operator address');
select is((public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)->>'ticket_price_cents')::integer,500,'ticket artifact carries face-value price');
select is((public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)->>'prize_description'),'Updated donated synthetic training package valued over $10',
  'ticket artifact carries attested prize description');
select is(jsonb_array_length(public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)->'tickets'),1,'ticket artifact contains the issued ticket');
select is((public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)->>'reversed')::boolean,false,'new issued ticket artifact is active');

select pg_temp.as_user('captain');
select throws_ok($$select public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)$$,'42501',null,'team captain cannot read private buyer ticket artifact');
select ok(not has_function_privilege('anon','public.sale_ticket_receipt(uuid,uuid)','EXECUTE'),
  'anonymous users cannot execute ticket receipt RPC');

select pg_temp.as_user('admin-director');
select lives_ok($$select public.reverse_campaign_sale(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale),
  'Synthetic compliance reversal'
)$$,'authorized correction path can void the sale');

select pg_temp.as_user('family');
select is((public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)->>'reversed')::boolean,true,'historical ticket artifact shows reversed sale');
select is((public.sale_ticket_receipt(
  pg_temp.id('org-a'),(select (result->>'sale_id')::uuid from pg_temp.compliance_sale)
)->'tickets'->0->>'status'),'VOIDED','historical ticket artifact marks original number VOIDED');

select pg_temp.as_user('admin-director');
select throws_ok($$update public.campaigns set charitable_purpose='Changed after activation'
  where id=pg_temp.id('campaign-main')$$,'23514',null,
  'ticket-critical compliance disclosures lock after activation');
select ok((select bool_and(ok) from public.verify_campaign_ledgers(pg_temp.id('campaign-main'))),
  'compliance workflow preserves campaign/ticket/money hash chains');
select ok((select bool_and(ok) from public.verify_audit_chain(pg_temp.id('org-a'))),
  'compliance workflow preserves audit hash chain');

select * from finish();
rollback;
