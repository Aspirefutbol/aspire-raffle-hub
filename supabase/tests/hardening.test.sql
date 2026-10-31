-- pgTAP: hardening phase — platform vs org permissions, identity, multi-role,
-- invitations, campaign lifecycle, ledgers, tamper-evident audit, scale RPCs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(90);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000aa01', 'platform@test.local', now()),
  ('00000000-0000-0000-0000-00000000aa02', 'admin@test.local', now()),
  ('00000000-0000-0000-0000-00000000aa03', 'director@test.local', now()),
  ('00000000-0000-0000-0000-00000000aa04', 'dual@test.local', now()),
  ('00000000-0000-0000-0000-00000000aa05', 'manager@test.local', now()),
  ('00000000-0000-0000-0000-00000000aa06', 'auditor@test.local', now()),
  ('00000000-0000-0000-0000-00000000aa07', 'jo_e@test.local', now()),
  ('00000000-0000-0000-0000-00000000aa08', 'joxe@test.local', now()),
  ('00000000-0000-0000-0000-00000000bb01', 'admin-b@test.local', now()),
  ('00000000-0000-0000-0000-00000000cc01', 'new.person@test.local', now()),
  ('00000000-0000-0000-0000-00000000cc02', 'unconfirmed@test.local', null);

insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-00000000aa01');

insert into public.organizations (id, name, legal_name, slug, address_line1, city, region, support_email) values
  ('20000000-0000-0000-0000-00000000000a', 'Org A', 'Org A Inc', 'hard-a', '1 Main St', 'Houston', 'TX', 'help@a.test'),
  ('20000000-0000-0000-0000-00000000000b', 'Org B', null, 'hard-b', null, null, null, null);

insert into public.organization_members (id, organization_id, user_id) values
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000aa02'),
  ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000aa03'),
  ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000aa04'),
  ('70000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000aa05'),
  ('70000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000aa06'),
  ('70000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000bb01');
insert into public.organization_member_roles (organization_id, member_id, role_key) values
  ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000002', 'ORGANIZATION_ADMIN'),
  ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000003', 'DIRECTOR'),
  ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000004', 'ORGANIZATION_ADMIN'),
  ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000004', 'DIRECTOR'),
  ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000005', 'CAMPAIGN_MANAGER'),
  ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000006', 'AUDITOR'),
  ('20000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'ORGANIZATION_ADMIN');

-- Cross-scope grants are impossible.
select throws_ok($$ insert into public.role_permissions values ('ORGANIZATION_ADMIN', 'platform.organizations') $$,
  '23514', null, 'an organization role cannot hold a platform permission');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
-- Deferred constraint triggers only fire at commit; force the check inside the test.
create or replace function pg_temp.drop_last_admin() returns void language plpgsql as $$
begin
  perform public.set_member_roles('70000000-0000-0000-0000-000000000002', array['AUDITOR']);
  set constraints all immediate;
end;
$$;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Organization admin vs protected fields
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select throws_ok($$ update public.organizations set jurisdiction_profile = 'NONE' where id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'org admin cannot change jurisdiction profile');
select throws_ok($$ update public.organizations set slug = 'stolen' where id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'org admin cannot change slug');
select throws_ok($$ update public.organizations set status = 'suspended' where id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'org admin cannot change status');
select throws_ok($$ update public.organizations set platform_config = '{"plan":"free"}' where id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'org admin cannot change platform config');
select lives_ok($$ update public.organizations set name = 'Org A (renamed)', support_phone = '555-0100' where id = '20000000-0000-0000-0000-00000000000a' $$,
  'org admin can change allowed settings');
select throws_ok($$ select public.platform_update_organization('20000000-0000-0000-0000-00000000000a', '{"status":"suspended"}', 'trying it') $$,
  '42501', null, 'org admin cannot call the platform update function');
select ok(not public.has_platform_permission('platform.organizations'), 'org admin holds no platform permission');
select ok(not exists (select 1 from unnest(public.my_org_permissions('20000000-0000-0000-0000-00000000000a')) p where p like 'platform.%'),
  'org permissions never include platform permissions');

-- ---------------------------------------------------------------------------
-- 2. Platform admin manages protected fields, with reason, audited
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa01');
select ok(public.has_platform_permission('platform.organizations'), 'platform admin holds platform.organizations');
select throws_ok($$ select public.platform_update_organization('20000000-0000-0000-0000-00000000000a', '{"jurisdiction_profile":"TEXAS_CREA_OFFLINE_PAYMENT"}', '') $$,
  '23514', null, 'protected change requires a reason');
select throws_ok($$ select public.platform_update_organization('20000000-0000-0000-0000-00000000000a', '{"name":"x"}', 'not protected field') $$,
  '23514', null, 'platform update rejects non-protected fields');
select lives_ok($$ select public.platform_update_organization('20000000-0000-0000-0000-00000000000a', '{"jurisdiction_profile":"TEXAS_CREA_OFFLINE_PAYMENT"}', 'Counsel approved CREA mode') $$,
  'platform admin changes jurisdiction profile with a reason');
select is((select jurisdiction_profile from public.organizations where id = '20000000-0000-0000-0000-00000000000a'),
  'TEXAS_CREA_OFFLINE_PAYMENT', 'jurisdiction profile updated');
select ok(exists (select 1 from public.audit_events where action = 'ORGANIZATION_PROTECTED_CHANGED'
                  and organization_id = '20000000-0000-0000-0000-00000000000a'
                  and metadata ->> 'reason' = 'Counsel approved CREA mode'
                  and 'jurisdiction_profile' = any (changed_fields)
                  and actor_id = '00000000-0000-0000-0000-00000000aa01'),
  'protected change is audited with actor, fields and reason');

select lives_ok($q$select public.platform_update_organization(
  '20000000-0000-0000-0000-00000000000a',
  '{"platform_config":{"texas_crea_compliance_required":false}}',
  'Synthetic hardening fixture only'
)$q$, 'platform admin can explicitly opt a synthetic fixture out of Texas compliance');

-- ---------------------------------------------------------------------------
-- 3. Identity: profile email read-only; exact email lookup
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select throws_ok($$ update public.profiles set email = 'someone-else@test.local' where id = '00000000-0000-0000-0000-00000000aa02' $$,
  '42501', null, 'users cannot change their profile email');
select lives_ok($$ update public.profiles set full_name = 'Alex' where id = '00000000-0000-0000-0000-00000000aa02' $$,
  'users can change their display name');
select throws_ok($$ select public.auth_user_id_by_email('jo_e@test.local') $$,
  '42501', null, 'browser clients cannot look up users by email');

reset role;
update auth.users set email = 'admin.renamed@test.local' where id = '00000000-0000-0000-0000-00000000aa02';
select is((select email from public.profiles where id = '00000000-0000-0000-0000-00000000aa02'), 'admin.renamed@test.local',
  'profile email follows the verified auth email');
set local role service_role;
select is(public.auth_user_id_by_email('jo_e@test.local'), '00000000-0000-0000-0000-00000000aa07'::uuid, 'exact lookup finds the account');
select is(public.auth_user_id_by_email('JO_E@Test.Local '), '00000000-0000-0000-0000-00000000aa07'::uuid, 'lookup is case- and space-insensitive');
select is(public.auth_user_id_by_email('jo%e@test.local'), null::uuid, '"%" is literal, not a wildcard');
select is(public.auth_user_id_by_email('j__e@test.local'), null::uuid, '"_" is literal, not a wildcard');
select throws_ok($$ select public.auth_user_id_by_email('not-an-email') $$, '23514', null, 'invalid emails are rejected');
reset role;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 4. Multi-role permissions and grant rules
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa04');
select is(public.my_org_roles('20000000-0000-0000-0000-00000000000a'), array['DIRECTOR', 'ORGANIZATION_ADMIN'],
  'a member can hold several roles');
select ok(public.has_org_permission('20000000-0000-0000-0000-00000000000a', 'campaigns.activate')
          and public.has_org_permission('20000000-0000-0000-0000-00000000000a', 'roster.write'),
  'permissions are the union of all roles');
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa03');
select ok(public.has_org_permission('20000000-0000-0000-0000-00000000000a', 'campaigns.activate')
          and not public.has_org_permission('20000000-0000-0000-0000-00000000000a', 'roster.write'),
  'director-only member: governance without roster editing');

select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select ok(not public.has_org_permission('20000000-0000-0000-0000-00000000000a', 'campaigns.activate'),
  'organization admin alone cannot activate campaigns');
select lives_ok($$ select public.set_member_roles('70000000-0000-0000-0000-000000000005', array['CAMPAIGN_MANAGER', 'FINANCE_ADMIN'], 'Also handles turn-ins') $$,
  'admin grants an additional role');
select is((select count(*)::int from public.organization_member_roles where member_id = '70000000-0000-0000-0000-000000000005'), 2,
  'member now holds two roles');
select ok(exists (select 1 from public.audit_events where action = 'ROLE_GRANTED' and metadata ->> 'role_key' = 'FINANCE_ADMIN'
                  and metadata ->> 'reason' = 'Also handles turn-ins'),
  'role grant is audited with reason');
select throws_ok($$ select public.set_member_roles('70000000-0000-0000-0000-000000000006', array['AUDITOR', 'DIRECTOR']) $$,
  '42501', null, 'admin cannot grant a role with permissions they lack (DIRECTOR)');
select throws_ok($$ insert into public.organization_member_roles (organization_id, member_id, role_key)
                    values ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000006', 'DIRECTOR') $$,
  '42501', null, 'the same rule applies to direct table writes');
select throws_ok($$ select public.set_member_roles('70000000-0000-0000-0000-000000000006', '{}') $$,
  '23514', null, 'a member must keep at least one role');

select pg_temp.as_user('00000000-0000-0000-0000-00000000aa04');
select lives_ok($$ select public.set_member_roles('70000000-0000-0000-0000-000000000006', array['AUDITOR', 'DIRECTOR'], 'Board member') $$,
  'admin + director can grant DIRECTOR');

-- Last Organization Admin cannot be removed (checked at commit; forced here).
select lives_ok($$ select public.set_member_roles('70000000-0000-0000-0000-000000000004', array['DIRECTOR'], 'Stepping back from ops') $$,
  'one of two admins can drop the admin role');
set constraints all immediate;
set constraints all deferred;
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select throws_ok($$ select pg_temp.drop_last_admin() $$,
  '23514', null, 'the last organization admin cannot be removed');

-- ---------------------------------------------------------------------------
-- 5. Invitations
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select lives_ok($$ insert into public.organization_invitations (organization_id, email, role_keys)
                   values ('20000000-0000-0000-0000-00000000000a', 'new.person@test.local', array['AUDITOR', 'TEAM_CAPTAIN']) $$,
  'admin invites by email with multiple roles');
select is((select invited_by from public.organization_invitations where email = 'new.person@test.local'),
  '00000000-0000-0000-0000-00000000aa02'::uuid, 'inviter is recorded from the session');
select throws_ok($$ insert into public.organization_invitations (organization_id, email, role_keys)
                    values ('20000000-0000-0000-0000-00000000000a', 'new.person@test.local', array['AUDITOR']) $$,
  '23505', null, 'only one pending invitation per email');
select throws_ok($$ insert into public.organization_invitations (organization_id, email, role_keys)
                    values ('20000000-0000-0000-0000-00000000000a', 'another@test.local', array['DIRECTOR']) $$,
  '42501', null, 'cannot invite into a role you could not grant');
select throws_ok($$ insert into public.organization_invitations (organization_id, email, role_keys)
                    values ('20000000-0000-0000-0000-00000000000a', 'Mixed@Test.local', array['AUDITOR']) $$,
  '23514', null, 'invitation emails must be normalized');
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa06');
select throws_ok($$ insert into public.organization_invitations (organization_id, email, role_keys)
                    values ('20000000-0000-0000-0000-00000000000a', 'x@test.local', array['AUDITOR']) $$,
  '42501', null, 'members without members.manage cannot invite');

select pg_temp.as_user('00000000-0000-0000-0000-00000000cc02');
select is(public.accept_my_invitations(), 0, 'unconfirmed accounts accept nothing');
select pg_temp.as_user('00000000-0000-0000-0000-00000000cc01');
select is(public.accept_my_invitations(), 1, 'invitee accepts on sign-in');
select is(public.my_org_roles('20000000-0000-0000-0000-00000000000a'), array['TEAM_CAPTAIN', 'AUDITOR'],
  'invitee holds the invited roles');
reset role;
select is((select status from public.organization_invitations where email = 'new.person@test.local'), 'accepted', 'invitation marked accepted');
select is((select granted_by from public.organization_member_roles r join public.organization_members m on m.id = r.member_id
           where m.user_id = '00000000-0000-0000-0000-00000000cc01' and r.role_key = 'AUDITOR'),
  '00000000-0000-0000-0000-00000000aa02'::uuid, 'roles granted by invitation are attributed to the inviter');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 6. Campaign lifecycle
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa05');
select throws_ok($$ insert into public.campaigns (organization_id, name, status) values ('20000000-0000-0000-0000-00000000000a', 'Bad', 'ACTIVE') $$,
  '23514', null, 'campaigns must start as DRAFT');
insert into public.campaigns (id, organization_id, name) values ('30000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-00000000000a', 'Spring Raffle');
select throws_ok($$ update public.campaigns set status = 'ACTIVE' where id = '30000000-0000-0000-0000-00000000000c' $$,
  '42501', null, 'status cannot be updated directly');
select throws_ok($$ select public.transition_campaign('30000000-0000-0000-0000-00000000000c', 'READY') $$,
  '23514', null, 'DRAFT → READY is blocked until required fields are set');
update public.campaigns set ticket_price_cents = 2000, ticket_prefix = 'ASG26',
  starts_at = now() + interval '1 day', sales_close_at = now() + interval '31 days', draw_at = now() + interval '32 days'
 where id = '30000000-0000-0000-0000-00000000000c';
select lives_ok($$ select public.transition_campaign('30000000-0000-0000-0000-00000000000c', 'READY') $$, 'DRAFT → READY when ready');
select throws_ok($$ select public.transition_campaign('30000000-0000-0000-0000-00000000000c', 'ACTIVE', 'go live') $$,
  '42501', null, 'campaign manager cannot activate (needs campaigns.activate)');
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa03');
select throws_ok($$ select public.transition_campaign('30000000-0000-0000-0000-00000000000c', 'ACTIVE') $$,
  '23514', null, 'activation requires a reason');
select lives_ok($$ select public.transition_campaign('30000000-0000-0000-0000-00000000000c', 'ACTIVE', 'Compliance checklist complete') $$,
  'director activates with a reason');
select is((select operator_legal_name from public.campaigns where id = '30000000-0000-0000-0000-00000000000c'), 'Org A Inc',
  'legal operator snapshot taken at activation');
select throws_ok($$ select public.transition_campaign('30000000-0000-0000-0000-00000000000c', 'DRAFT', 'oops') $$,
  '23514', null, 'invalid edge ACTIVE → DRAFT is rejected');
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa05');
select throws_ok($$ update public.campaigns set ticket_price_cents = 1000 where id = '30000000-0000-0000-0000-00000000000c' $$,
  '23514', null, 'ticket price is locked after activation');
select throws_ok($$ update public.campaigns set draw_at = now() + interval '40 days' where id = '30000000-0000-0000-0000-00000000000c' $$,
  '23514', null, 'drawing date is locked after activation');
select lives_ok($$ update public.campaigns set description = 'Supports travel', goal_amount_cents = 500000 where id = '30000000-0000-0000-0000-00000000000c' $$,
  'non-critical fields stay editable while ACTIVE');
select lives_ok($$ select public.transition_campaign('30000000-0000-0000-0000-00000000000c', 'CLOSED', 'Sales window ended') $$,
  'ACTIVE → CLOSED with reason');
select throws_ok($$ update public.campaigns set description = 'late edit' where id = '30000000-0000-0000-0000-00000000000c' $$,
  '23514', null, 'closed campaigns are read-only');
select is((select count(*)::int from public.campaign_events where campaign_id = '30000000-0000-0000-0000-00000000000c'), 3,
  'every transition writes a campaign event');
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select is((select array_agg(metadata ->> 'reason' order by chain_pos) from public.audit_events
           where action = 'CAMPAIGN_STATUS_CHANGED' and entity_id = '30000000-0000-0000-0000-00000000000c'),
  array[null, 'Compliance checklist complete', 'Sales window ended'], 'status changes are audited with reasons');
select throws_ok($$ insert into public.campaign_events (organization_id, campaign_id, event_type, from_status, to_status)
                    values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', 'STATUS_CHANGED', 'CLOSED', 'ACTIVE') $$,
  '42501', null, 'clients cannot write campaign events');

-- ---------------------------------------------------------------------------
-- 7. Prepared ledgers: reasons required, append-only
-- ---------------------------------------------------------------------------
reset role;
select throws_ok($$ insert into public.ticket_events (organization_id, campaign_id, ticket_id, event_type)
                    values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', gen_random_uuid(), 'VOIDED') $$,
  '23514', null, 'a void requires a reason');
select throws_ok($$ insert into public.ticket_events (organization_id, campaign_id, ticket_id, event_type, reason)
                    values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', gen_random_uuid(), 'REISSUED', 'Typo in buyer') $$,
  '23514', null, 'a reissue must reference the replaced ticket');
select lives_ok($$ insert into public.ticket_events (organization_id, campaign_id, ticket_id, event_type, reason)
                   values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', gen_random_uuid(), 'VOIDED', 'Duplicate sale') $$,
  'a void with a reason is recorded');
select throws_ok($$ insert into public.money_events (organization_id, campaign_id, event_type, amount_cents)
                    values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', 'ADJUSTMENT', -500) $$,
  '23514', null, 'an adjustment requires a reason');
select throws_ok($$ insert into public.money_events (organization_id, campaign_id, event_type, amount_cents, reason)
                    values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', 'WRITE_OFF', 2000, 'Lost envelope') $$,
  '23514', null, 'a write-off requires an approver');
insert into public.money_events (id, organization_id, campaign_id, event_type, amount_cents, payment_method)
values ('40000000-0000-0000-0000-00000000000e', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', 'TURN_IN', 6000, 'cash');
select throws_ok($$ insert into public.money_events (organization_id, campaign_id, event_type, amount_cents, reason)
                    values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', 'REVERSAL', -6000, 'Entered twice') $$,
  '23514', null, 'a reversal must reference the event it reverses');
select lives_ok($$ insert into public.money_events (organization_id, campaign_id, event_type, amount_cents, reason, reverses_event_id)
                   values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', 'REVERSAL', -6000, 'Entered twice', '40000000-0000-0000-0000-00000000000e') $$,
  'corrections are new reversal events');
select throws_ok($$ update public.money_events set amount_cents = 1 where id = '40000000-0000-0000-0000-00000000000e' $$,
  '42501', null, 'money events cannot be edited');
select throws_ok($$ delete from public.money_events where id = '40000000-0000-0000-0000-00000000000e' $$,
  '42501', null, 'money events cannot be deleted');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select throws_ok($$ insert into public.money_events (organization_id, campaign_id, event_type, amount_cents)
                    values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', 'TURN_IN', 100) $$,
  '42501', null, 'clients cannot write money events directly');

-- ---------------------------------------------------------------------------
-- 8. Tamper-evident hash chains
-- ---------------------------------------------------------------------------
select is((select ok from public.verify_audit_chain('20000000-0000-0000-0000-00000000000a')), true, 'audit chain verifies');
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa03');
select is((select bool_and(ok) from public.verify_campaign_ledgers('30000000-0000-0000-0000-00000000000c')), true,
  'campaign, ticket and money ledgers verify');
select pg_temp.as_user('00000000-0000-0000-0000-00000000bb01');
select throws_ok($$ select * from public.verify_audit_chain('20000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'another organization cannot verify (or read) this audit log');
reset role;
alter table public.audit_events disable trigger audit_events_append_only;
update public.audit_events set metadata = metadata || '{"reason":"forged"}'
 where id = (select id from public.audit_events where organization_id = '20000000-0000-0000-0000-00000000000a' order by chain_pos limit 1 offset 2);
alter table public.audit_events enable trigger audit_events_append_only;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select is((select first_bad_pos from public.verify_audit_chain('20000000-0000-0000-0000-00000000000a')), 3::bigint,
  'tampering with a past audit event is detected at its position');

-- ---------------------------------------------------------------------------
-- 9. Attribution, suspension, scale RPCs
-- ---------------------------------------------------------------------------
insert into public.teams (organization_id, name, created_by)
values ('20000000-0000-0000-0000-00000000000a', 'Spoof FC', '00000000-0000-0000-0000-00000000aa06');
select is((select created_by from public.teams where name = 'Spoof FC'), '00000000-0000-0000-0000-00000000aa02'::uuid,
  'created_by cannot be spoofed');

select pg_temp.as_user('00000000-0000-0000-0000-00000000aa01');
select lives_ok($$ select public.platform_update_organization('20000000-0000-0000-0000-00000000000b', '{"status":"suspended"}', 'Billing hold') $$,
  'platform admin suspends an organization');
select pg_temp.as_user('00000000-0000-0000-0000-00000000bb01');
select ok(not public.has_org_permission('20000000-0000-0000-0000-00000000000b', 'roster.read'), 'members of a suspended organization lose access');
select is((select count(*)::int from public.organizations where id = '20000000-0000-0000-0000-00000000000b'), 0,
  'suspended organization is hidden from its members');

select pg_temp.as_user('00000000-0000-0000-0000-00000000aa02');
select is((public.list_org_members('20000000-0000-0000-0000-00000000000a', null, 2, 0) ->> 'total')::int, 6,
  'member list reports the full total while paginating');
select is(jsonb_array_length(public.list_org_members('20000000-0000-0000-0000-00000000000a', null, 2, 0) -> 'rows'), 2,
  'member list returns one page');
select is((public.list_org_members('20000000-0000-0000-0000-00000000000a', '_', 50, 0) ->> 'total')::int, 0,
  'member search treats "_" literally (no wildcard match)');
select is((public.list_households('20000000-0000-0000-0000-00000000000a') ->> 'total')::int, 0, 'household list works on an empty org');
select lives_ok($$ select * from public.team_player_counts('20000000-0000-0000-0000-00000000000a') $$, 'team counts run in SQL');
select throws_ok($$ select * from public.platform_organization_summaries() $$, '42501', null, 'platform summaries are platform-only');

select * from finish();
rollback;
