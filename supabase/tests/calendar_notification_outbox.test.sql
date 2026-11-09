-- Batch 2A durable confirmation outbox (TEST mode). Synthetic fixtures only;
-- the whole test transaction rolls back, including test-only Vault secrets.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function pg_temp.cid(p_key text) returns uuid language sql immutable as $$
  select md5('calendar-outbox-2a:' || p_key)::uuid;
$$;
-- Simulated verified session: sub + role + aal. Never used outside this transaction.
create function pg_temp.as_user(p_key text, p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', pg_temp.cid('user-' || p_key), 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.no_session() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
-- Returns the SQLSTATE an statement raises, or NULL when it succeeds.
create function pg_temp.sqlstate_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end $$;
create function pg_temp.outbox(p_res uuid) returns calendar_private.notification_outbox
language sql stable as $$
  select * from calendar_private.notification_outbox where reservation_id = p_res;
$$;
create function pg_temp.okey(p_res uuid) returns text language sql stable as $$
  select key from calendar_private.notification_outbox where reservation_id = p_res;
$$;
create temporary table t(label text primary key, v jsonb);

-- ---------------------------------------------------------------------------
-- Fixtures (same synthetic pattern as calendar_reservations.test.sql)
-- ---------------------------------------------------------------------------
insert into auth.users(id, email, email_confirmed_at)
select pg_temp.cid('user-' || k), k || '@example.test', now()
from unnest(array['a-admin','rev-1','rev-2','appointer','outsider','b-admin','b-rev',
                  'staff','plat-undesignated','rev-expired','rev-revoked','rev-suspended']) k;

insert into public.organizations(id, name, slug, legal_name, jurisdiction_profile,
  address_line1, city, region, support_email, platform_config) values
  (pg_temp.cid('org-a'), 'Outbox South TEST', 'outbox-south-test', 'Outbox South TEST',
    'TEXAS_CREA_OFFLINE_PAYMENT', '1 Testing Way', 'Houston', 'TX',
    'south@example.test', '{"texas_crea_compliance_required":false}'::jsonb),
  (pg_temp.cid('org-b'), 'Outbox Other TEST', 'outbox-other-test', 'Outbox Other TEST',
    'TEXAS_CREA_OFFLINE_PAYMENT', '2 Testing Way', 'Austin', 'TX',
    'other@example.test', '{"texas_crea_compliance_required":false}'::jsonb);

insert into public.organization_members(id, organization_id, user_id)
select pg_temp.cid('member-' || k), pg_temp.cid('org-a'), pg_temp.cid('user-' || k)
from unnest(array['a-admin','rev-1','rev-2','appointer','outsider','rev-expired',
                  'rev-revoked','rev-suspended']) k;
insert into public.organization_members(id, organization_id, user_id) values
  (pg_temp.cid('member-b-admin'), pg_temp.cid('org-b'), pg_temp.cid('user-b-admin')),
  (pg_temp.cid('member-b-rev'), pg_temp.cid('org-b'), pg_temp.cid('user-b-rev'));
insert into public.organization_member_roles(organization_id, member_id, role_key) values
  (pg_temp.cid('org-a'), pg_temp.cid('member-a-admin'), 'ORGANIZATION_ADMIN'),
  (pg_temp.cid('org-a'), pg_temp.cid('member-a-admin'), 'DIRECTOR');
insert into public.platform_admins(user_id) values
  (pg_temp.cid('user-staff')), (pg_temp.cid('user-plat-undesignated'));

insert into public.households(id, organization_id, name) values
  (pg_temp.cid('house-a'), pg_temp.cid('org-a'), 'Synthetic Family A');
insert into public.players(id, organization_id, household_id, first_name, last_name) values
  (pg_temp.cid('player-a'), pg_temp.cid('org-a'), pg_temp.cid('house-a'), 'Mateo', 'Sample'),
  (pg_temp.cid('player-a2'), pg_temp.cid('org-a'), pg_temp.cid('house-a'), 'Lina', 'Sample');
insert into public.campaigns(id, organization_id, name, campaign_type,
  ticket_price_cents, ticket_prefix, starts_at, sales_close_at, draw_at,
  support_email, description) values
  (pg_temp.cid('campaign-a'), pg_temp.cid('org-a'), 'Outbox Calendar TEST', 'calendar',
    100, 'OBXTEST', now() - interval '1 day', now() + interval '10 days',
    now() + interval '11 days', 'south@example.test', 'Synthetic test only');

set local role authenticated;
select pg_temp.as_user('a-admin', 'aal1');
select is(public.enroll_campaign_players(pg_temp.cid('org-a'), pg_temp.cid('campaign-a'), true),
  2, 'fixture: synthetic players enrolled');
select is(public.transition_campaign(pg_temp.cid('campaign-a'), 'READY'), 'READY', 'fixture: READY');
select is(public.transition_campaign(pg_temp.cid('campaign-a'), 'ACTIVE', 'Synthetic outbox test'),
  'ACTIVE', 'fixture: ACTIVE');
reset role;

insert into calendar_private.campaign_config(campaign_id, organization_id, mode, enabled)
values (pg_temp.cid('campaign-a'), pg_temp.cid('org-a'), 'supporter_choice', true);

create function pg_temp.participant(p_player text) returns uuid language sql stable as $$
  select id from public.campaign_participants
  where campaign_id = pg_temp.cid('campaign-a') and player_id = pg_temp.cid(p_player);
$$;

-- A real PAID reservation through the existing reviewed functions (reserve ->
-- attach TEST checkout -> verified TEST settlement), then an optional language.
create function pg_temp.make_paid(p_label text, p_player text, p_days integer[], p_mult integer,
  p_email text, p_lang text) returns uuid language plpgsql as $$
declare r jsonb; v_id uuid; v_session text := 'cs_test_' || replace(p_label, '-', '_');
begin
  perform pg_temp.as_user('a-admin', 'aal1');
  r := calendar_private.reserve(pg_temp.cid('org-a'), pg_temp.cid('campaign-a'),
         pg_temp.participant(p_player), pg_temp.cid('rk-' || p_label), p_days, p_mult,
         'Synthetic Supporter', p_email);
  v_id := (r->>'id')::uuid;
  perform calendar_private.attach_test_checkout(v_id, v_session, clock_timestamp() + interval '45 minutes');
  perform calendar_private.confirm_test_checkout_paid(v_id, v_session,
            'evt_' || replace(p_label, '-', '_'), (r->>'total_cents')::bigint);
  if p_lang is not null then
    update calendar_private.reservations set supporter_language = p_lang where id = v_id;
  end if;
  perform pg_temp.no_session();
  return v_id;
end $$;

-- Intent exactly as Batch 1 would prepare it from the PAID record. Digests are
-- computed with the SQL canonical functions (parity with Node is proven separately
-- by the golden vectors below and in notification-digest-vectors.test.ts).
create function pg_temp.intent(p_res uuid,
  p_template text default 'calendar-donor-confirmation/2026-11-07.1',
  p_subject text default 'Thank you', p_text text default 'Thank you for sponsoring.',
  p_html text default '<p>Thank you for sponsoring.</p>') returns jsonb language plpgsql as $$
declare r calendar_private.reservations; v_days integer[]; v_key text; v_lang text;
begin
  select * into strict r from calendar_private.reservations where id = p_res;
  select array_agg(d order by d) into v_days from unnest(r.days) as d;
  v_key := 'calendar:test:' || r.organization_id || ':' || r.id || ':donor-confirmation:v1';
  v_lang := coalesce(r.supporter_language, 'en');
  return jsonb_build_object('key', v_key, 'kind', 'calendar_donor_confirmation', 'mode', 'test',
    'organizationId', r.organization_id, 'campaignId', r.campaign_id,
    'participantId', r.participant_id, 'reservationId', r.id,
    'recipient', r.supporter_email, 'language', v_lang,
    'facts', jsonb_build_object('currency', 'usd', 'days', to_jsonb(v_days),
      'multiplier', r.multiplier, 'baseCents', r.base_cents,
      'additionalImpactCents', r.additional_impact_cents, 'totalCents', r.total_cents),
    'templateVersion', p_template, 'subject', p_subject, 'text', p_text, 'html', p_html,
    'factsDigest', calendar_private.outbox_sha256_hex(calendar_private.outbox_facts_canonical(
      v_key, r.organization_id, r.campaign_id, r.participant_id, r.id, r.supporter_email,
      v_lang, v_days, r.multiplier, r.base_cents, r.additional_impact_cents, r.total_cents)),
    'contentDigest', calendar_private.outbox_sha256_hex(calendar_private.outbox_content_canonical(
      p_template, p_subject, p_text, p_html)));
end $$;

-- Throwaway fingerprint key (rolled back with the transaction). Canonical format:
-- padded Base64 of 32 random bytes.
create function pg_temp.add_key(p_version integer, p_secret text, p_active boolean) returns void
language plpgsql as $$
begin
  perform vault.create_secret(p_secret, 'calendar_outbox_fp_v' || p_version);
  insert into calendar_private.notification_fingerprint_keys(version, vault_secret_name, activated_at, retired_at)
  values (p_version, 'calendar_outbox_fp_v' || p_version, clock_timestamp(),
          case when p_active then null else clock_timestamp() end);
end $$;

-- Reviewer designations, recorded by a separate appointing director (D2e).
insert into calendar_private.notification_reviewer_events
  (organization_id, user_id, event_type, basis, expires_at, actor_user_id, reason_code) values
  (pg_temp.cid('org-a'), pg_temp.cid('user-rev-1'), 'GRANTED', 'org_member', now() + interval '90 days', pg_temp.cid('user-appointer'), 'synthetic_test'),
  (pg_temp.cid('org-a'), pg_temp.cid('user-rev-2'), 'GRANTED', 'org_member', now() + interval '90 days', pg_temp.cid('user-appointer'), 'synthetic_test'),
  (pg_temp.cid('org-a'), pg_temp.cid('user-staff'), 'GRANTED', 'platform_staff', now() + interval '90 days', pg_temp.cid('user-appointer'), 'synthetic_test'),
  (pg_temp.cid('org-a'), pg_temp.cid('user-rev-expired'), 'GRANTED', 'org_member', now() + interval '1 day', pg_temp.cid('user-appointer'), 'synthetic_test'),
  (pg_temp.cid('org-a'), pg_temp.cid('user-rev-revoked'), 'GRANTED', 'org_member', now() + interval '90 days', pg_temp.cid('user-appointer'), 'synthetic_test'),
  (pg_temp.cid('org-a'), pg_temp.cid('user-rev-suspended'), 'GRANTED', 'org_member', now() + interval '90 days', pg_temp.cid('user-appointer'), 'synthetic_test'),
  (pg_temp.cid('org-b'), pg_temp.cid('user-b-rev'), 'GRANTED', 'org_member', now() + interval '90 days', pg_temp.cid('user-b-admin'), 'synthetic_test');
insert into calendar_private.notification_reviewer_events
  (organization_id, user_id, event_type, actor_user_id, reason_code) values
  (pg_temp.cid('org-a'), pg_temp.cid('user-rev-revoked'), 'REVOKED', pg_temp.cid('user-appointer'), 'synthetic_test');
update public.organization_members set status = 'suspended' where id = pg_temp.cid('member-rev-suspended');

-- ===========================================================================
-- 1. Structure, privileges and RLS (no grants to application identities)
-- ===========================================================================
select is((select count(*)::int from pg_tables where schemaname = 'calendar_private' and tablename = any(array[
  'notification_policy','notification_fingerprint_keys','notification_outbox','notification_events',
  'notification_reviewer_events','reservation_language_events','test_recipient_allowlist'])), 7,
  'all seven Batch 2A tables exist');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'calendar_private' and c.relkind = 'r' and c.relrowsecurity and c.relname = any(array[
  'notification_policy','notification_fingerprint_keys','notification_outbox','notification_events',
  'notification_reviewer_events','reservation_language_events','test_recipient_allowlist'])), 7,
  'RLS is enabled on every new table');
select is((select count(*)::int from pg_policies where schemaname = 'calendar_private' and tablename = any(array[
  'notification_policy','notification_fingerprint_keys','notification_outbox','notification_events',
  'notification_reviewer_events','reservation_language_events','test_recipient_allowlist'])), 0,
  'no RLS policies: default deny');
select is((select count(*)::int
  from unnest(array['anon','authenticated','service_role']) r(role)
  cross join unnest(array['notification_policy','notification_fingerprint_keys','notification_outbox',
    'notification_events','notification_reviewer_events','reservation_language_events',
    'test_recipient_allowlist']) t(tbl)
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p(priv)
  where has_table_privilege(r.role, 'calendar_private.' || t.tbl, p.priv)), 0,
  'anon, authenticated and service_role have no table privileges on any new table');
select is((select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join unnest(array['anon','authenticated','service_role']) r(role)
  where n.nspname = 'calendar_private'
    and (p.proname like 'outbox\_%' or p.proname like '%donor\_confirmation%' or p.proname in (
      'is_designated_reviewer','is_notification_reviewer','approve_epoch_restart',
      'record_supporter_language','read_confirmation_backlog','list_missing_donor_confirmations',
      'verify_notification_audit_coverage','enforce_reviewer_appointer_separation'))
    and has_function_privilege(r.role, p.oid, 'EXECUTE')), 0,
  'no Batch 2A function is executable by anon, authenticated or service_role');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'calendar_private'
    and (p.proname like 'outbox\_%' or p.proname like '%donor\_confirmation%' or p.proname in (
      'is_designated_reviewer','is_notification_reviewer','approve_epoch_restart',
      'record_supporter_language','read_confirmation_backlog','list_missing_donor_confirmations',
      'verify_notification_audit_coverage','enforce_reviewer_appointer_separation'))), 29,
  'exactly the 29 reviewed Batch 2A functions exist');
select ok(not has_schema_privilege('anon', 'calendar_private', 'USAGE')
  and not has_schema_privilege('authenticated', 'calendar_private', 'USAGE')
  and not has_schema_privilege('service_role', 'calendar_private', 'USAGE'),
  'no application role has usage on calendar_private');
select hasnt_column('calendar_private', 'notification_policy', 'restart_requires_second_reviewer',
  'the two-person restart cannot be switched off by a setting');
select hasnt_column('calendar_private', 'notification_policy', 'reviewer_require_aal2',
  'reviewer MFA cannot be switched off by a setting');
select is(pg_temp.sqlstate_of($$insert into calendar_private.notification_policy
  (singleton, max_attempts, lease_interval, retry_base, retry_cap, provider_idempotency_window,
   idempotency_safety_margin, payload_retention) values (true, 5, '2 minutes', '30 seconds', '1 hour', '0', '1 hour', '30 days')$$),
  '23505', 'the policy table holds exactly one row');
select is(pg_temp.sqlstate_of($$update calendar_private.notification_policy set max_attempts = 11$$),
  '23514', 'policy bounds are enforced by CHECK constraints');
select is(pg_temp.sqlstate_of($$update calendar_private.notification_policy
  set provider_idempotency_window = '1 minute'$$), '23514',
  'a non-zero window must exceed lease plus margin');
select has_column('calendar_private', 'reservations', 'supporter_language', 'reservations gained supporter_language');

-- ===========================================================================
-- 2. Golden vectors (proposal rev 2.2 §4.3): Postgres must equal the independent constants
-- ===========================================================================
create function pg_temp.f_canon(p_res text, p_recipient text, p_lang text, p_days integer[],
  p_mult integer, p_base bigint, p_add bigint, p_total bigint) returns text language sql as $$
  select calendar_private.outbox_facts_canonical(
    'calendar:test:11111111-1111-4111-8111-111111111111:' || p_res || ':donor-confirmation:v1',
    '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333', p_res::uuid, p_recipient, p_lang, p_days,
    p_mult, p_base, p_add, p_total);
$$;
create function pg_temp.c_canon(p_subject text, p_text text, p_html text) returns text language sql as $$
  select calendar_private.outbox_content_canonical('calendar-donor-confirmation/2026-11-07.1', p_subject, p_text, p_html);
$$;
insert into t(label, v)
select label, jsonb_build_object('c', canon) from (values
  ('F1', pg_temp.f_canon('44444444-4444-4444-8444-444444444444', 'donor@example.test', 'en', array[7], 1, 700, 0, 700)),
  ('F2', pg_temp.f_canon('55555555-5555-4555-8555-555555555555', 'donante+prueba@example.test', 'es',
     array(select generate_series(1, 31)), 5, 49600, 198400, 248000)),
  ('C1', pg_temp.c_canon('Thank you', 'Thank you for sponsoring day 7.', '<p>Thank you for sponsoring day 7.</p>')),
  ('C2', pg_temp.c_canon(E'¡Gracias!', E'Patrocinó el día 7. ¿Preguntas?',
     E'<p>¡Gracias! Patrocinó el <b>día 7</b>.</p>')),
  ('C3', pg_temp.c_canon('He said "hi"', E'path\\to/file \\\\ end', E'<a href="/x/y">a\\b</a>')),
  ('C4', pg_temp.c_canon(E'tab\there', E'line1\nline2\r\nline3\b\f\u0001\u001f end', '<p>ab</p>')),
  ('C5', pg_temp.c_canon(E'x y', E'p1 p2 del\u007fend', E'<p> </p>')),
  ('C6', pg_temp.c_canon(E'⚽ Goal! \U0001F389', E'Gracias \U0001F600 — día 31 \U0001F3C6', E'<p>\U0001F389</p>')),
  ('C7', pg_temp.c_canon('Tom & Ana', '<script>alert(1)</script>', '<p>Tom &amp; Ana &lt;3 <script>x</script></p>')),
  ('C8', pg_temp.c_canon(repeat('S', 300), repeat('t', 20000), repeat('h', 100000)))
) as vectors(label, canon);

select is(calendar_private.outbox_sha256_hex(v->>'c'), expected_hash, 'golden vector ' || label || ' SHA-256 matches the independent constant')
from t join (values
  ('F1', '9a328211277fcd1e52889caaf6fd448591bf7c37ef7fe557620d0d0aecd121ac'),
  ('F2', 'f4dbbc350b676747d72ae1232b7b9cb44fb3183f76d10a5f988c1bbddc0cab43'),
  ('C1', '257c4e3869ca092780a2574bbae129c80af977679f52093ede9b9c5b1e9aac82'),
  ('C2', 'ac1de67b6bbf8866837ad11ccacdf3ef3bcab5a0fa767576e78694dcca7b3e78'),
  ('C3', 'c3e16b36a478a07e811e2a034001feb42728842fa8a7db4f6a50005887262537'),
  ('C4', 'dfd6bcefdd7107a96d46348ce6a184108a854f47f1f11ee217306a6e7a4f0586'),
  ('C5', '7000ae7dff172cf141bb4eae76a27ba26fd2db521908390652d81c7671adf272'),
  ('C6', 'c417cb50583225a167cbfffbd04aaf0c62297cbeb17430d2a2768962fcb589f1'),
  ('C7', '5bbdfcda8d2aa331945c9d4a39df418d0c4c7d2777dadb2ad334634ebdad8a4f'),
  ('C8', 'dafdf437f8938a9bb464318112170dd9974e3143b9b1fdf5bfc73e7d79cd5050')
) as golden(vlabel, expected_hash) on golden.vlabel = t.label
order by t.label;

select is(octet_length(convert_to(v->>'c', 'UTF8')), expected_len, 'golden vector ' || label || ' canonical byte length')
from t join (values ('F1', 354), ('F2', 455), ('C1', 131), ('C2', 143), ('C3', 114), ('C4', 112),
  ('C5', 83), ('C6', 107), ('C7', 132), ('C8', 120353)) as golden(vlabel, expected_len)
  on golden.vlabel = t.label
order by t.label;

select isnt(calendar_private.outbox_sha256_hex(pg_temp.c_canon('Thank you!', 'Thank you for sponsoring day 7.',
  '<p>Thank you for sponsoring day 7.</p>')), '257c4e3869ca092780a2574bbae129c80af977679f52093ede9b9c5b1e9aac82',
  'G3: a one-character change changes the digest');
select is(pg_temp.sqlstate_of($$select '{"s":"a\u0000b"}'::jsonb$$), '22P05',
  'G4: U+0000 can never reach the outbox (rejected at jsonb input)');
select isnt(pg_temp.sqlstate_of($$select '{"s":"\ud800"}'::jsonb$$), null,
  'G4: a lone UTF-16 surrogate can never reach the outbox (rejected at jsonb input)');
select is(calendar_private.outbox_provider_key('calendar:test:x:y:donor-confirmation:v1', 1),
  'afc-cal-' || left(encode(sha256(convert_to('calendar:test:x:y:donor-confirmation:v1#epoch-1', 'UTF8')), 'hex'), 48),
  'provider idempotency key follows the Batch 1 formula');

-- ===========================================================================
-- 3. Fingerprint keys (K1, item 2): exact format, fail closed, rotation
-- ===========================================================================
insert into t(label, v) values ('secret-v1', to_jsonb(encode(extensions.gen_random_bytes(32), 'base64')));
select is(length(v->>0), 44, 'fixture key is 44-character padded Base64') from t where label = 'secret-v1';
select pg_temp.add_key(1, (select v->>0 from t where label = 'secret-v1'), true);
select is(calendar_private.outbox_active_fingerprint_key_version(), 1, 'version 1 is the active key');
select is(calendar_private.outbox_fingerprint_key(1), decode((select v->>0 from t where label = 'secret-v1'), 'base64'),
  'K7: the HMAC key is the DECODED 32 bytes, not the Base64 text');
select is(octet_length(calendar_private.outbox_fingerprint_key(1)), 32, 'K7: key is exactly 32 bytes');
select is(calendar_private.outbox_fingerprint(1, 'salt', 'canonical'),
  encode(extensions.hmac(convert_to('salt:canonical', 'UTF8'),
    decode((select v->>0 from t where label = 'secret-v1'), 'base64'), 'sha256'), 'hex'),
  'K7: fingerprint = HMAC-SHA256(decoded key, salt:canonical)');
select isnt(calendar_private.outbox_fingerprint(1, 'salt', 'canonical'),
  calendar_private.outbox_sha256_hex('salt:canonical'), 'K4: a fingerprint is never the unkeyed SHA-256');
-- Malformed / wrong-length / non-canonical secrets (retired versions so the active one is unchanged).
select pg_temp.add_key(81, 'not base64 at all!!', false);
select pg_temp.add_key(82, rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), false);
select pg_temp.add_key(83, encode(extensions.gen_random_bytes(31), 'base64'), false);
select pg_temp.add_key(84, encode(extensions.gen_random_bytes(33), 'base64'), false);
select pg_temp.add_key(85, left(encode(extensions.gen_random_bytes(32), 'base64'), 42) || 'B=', false);
select is(calendar_private.outbox_fingerprint_key(81), null, 'K8: invalid characters are unavailable');
select is(calendar_private.outbox_fingerprint_key(82), null, 'K8: missing padding is unavailable');
select is(calendar_private.outbox_fingerprint_key(83), null, 'K9: 31 bytes is unavailable');
select is(calendar_private.outbox_fingerprint_key(84), null, 'K9: 33 bytes is unavailable');
select is(calendar_private.outbox_fingerprint_key(85), null, 'K10: non-canonical final character is unavailable');
select is(calendar_private.outbox_fingerprint_key(999), null, 'unknown version is unavailable');
select is(calendar_private.outbox_fingerprint(81, 'salt', 'canonical'), null, 'fingerprint is NULL when the key is unavailable');
select is(pg_temp.sqlstate_of($$insert into calendar_private.notification_fingerprint_keys(version, vault_secret_name, activated_at)
  values (90, 'calendar_outbox_fp_v90', clock_timestamp())$$), '23505', 'K6: only one key can be active');
select is(pg_temp.sqlstate_of($$delete from calendar_private.notification_fingerprint_keys where version = 81$$),
  '42501', 'K6: key versions cannot be deleted');

-- ===========================================================================
-- 4. Enqueue (X1, item 1) and its rejections
-- ===========================================================================
insert into calendar_private.test_recipient_allowlist(organization_id, recipient, added_by) values
  (pg_temp.cid('org-a'), 'listed@example.test', pg_temp.cid('user-appointer')),
  (pg_temp.cid('org-b'), 'unlisted@example.test', pg_temp.cid('user-b-admin'));

insert into t(label, v) values
  ('r-main',    to_jsonb(pg_temp.make_paid('main', 'player-a', array[3, 1], 2, 'Listed@Example.Test', 'es'))),
  ('r-nolang',  to_jsonb(pg_temp.make_paid('nolang', 'player-a', array[5], 1, 'listed@example.test', null))),
  ('r-unlisted',to_jsonb(pg_temp.make_paid('unlisted', 'player-a', array[6], 1, 'unlisted@example.test', 'en'))),
  ('r-tamper',  to_jsonb(pg_temp.make_paid('tamper', 'player-a', array[7], 1, 'listed@example.test', 'en'))),
  ('r-refund',  to_jsonb(pg_temp.make_paid('refund', 'player-a', array[8], 1, 'listed@example.test', 'en'))),
  ('r-retry',   to_jsonb(pg_temp.make_paid('retry', 'player-a', array[9], 1, 'listed@example.test', 'en'))),
  ('r-perm',    to_jsonb(pg_temp.make_paid('perm', 'player-a', array[10], 1, 'listed@example.test', 'en'))),
  ('r-unknown', to_jsonb(pg_temp.make_paid('unknown', 'player-a', array[11], 1, 'listed@example.test', 'en'))),
  ('r-lease',   to_jsonb(pg_temp.make_paid('lease', 'player-a', array[12], 1, 'listed@example.test', 'en'))),
  ('r-race-ok', to_jsonb(pg_temp.make_paid('raceok', 'player-a', array[13], 1, 'listed@example.test', 'en'))),
  ('r-race-rt', to_jsonb(pg_temp.make_paid('racert', 'player-a', array[14], 1, 'listed@example.test', 'en'))),
  ('r-race-un', to_jsonb(pg_temp.make_paid('raceun', 'player-a', array[15], 1, 'listed@example.test', 'en'))),
  ('r-window',  to_jsonb(pg_temp.make_paid('window', 'player-a', array[16], 1, 'listed@example.test', 'en'))),
  ('r-review',  to_jsonb(pg_temp.make_paid('review', 'player-a', array[17], 1, 'listed@example.test', 'en'))),
  ('r-restart', to_jsonb(pg_temp.make_paid('restart', 'player-a', array[18], 1, 'listed@example.test', 'en'))),
  ('r-abandon', to_jsonb(pg_temp.make_paid('abandon', 'player-a', array[19], 1, 'listed@example.test', 'en'))),
  ('r-purge',   to_jsonb(pg_temp.make_paid('purge', 'player-a', array[20], 1, 'listed@example.test', 'en'))),
  ('r-rotate',  to_jsonb(pg_temp.make_paid('rotate', 'player-a', array[21], 1, 'listed@example.test', 'en')));
create function pg_temp.r(p_label text) returns uuid language sql stable as $$
  select (v->>0)::uuid from t where label = 'r-' || p_label;
$$;

select is((select status from calendar_private.reservations where id = pg_temp.r('main')), 'PAID',
  'fixture: reservation settled through the verified TEST path');
select is((select supporter_email from calendar_private.reservations where id = pg_temp.r('main')),
  'listed@example.test', 'fixture: reserve() stored the email lowercased');

select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('main')))->>'status', 'queued',
  'X1: a real enqueue of a valid PAID reservation succeeds');
select is((pg_temp.outbox(pg_temp.r('main'))).state, 'PENDING', 'X1: stored as PENDING');
select ok((pg_temp.outbox(pg_temp.r('main'))).next_attempt_at = (pg_temp.outbox(pg_temp.r('main'))).created_at,
  'X1: immediately due');
select is((pg_temp.outbox(pg_temp.r('main'))).facts_digest, pg_temp.intent(pg_temp.r('main'))->>'factsDigest',
  'X1: stored facts digest is the DB-computed one');
select is((pg_temp.outbox(pg_temp.r('main'))).facts->'days', '[1, 3]'::jsonb, 'X1: facts rebuilt from the reservation, days sorted');
select is((pg_temp.outbox(pg_temp.r('main'))).language, 'es', 'X1: language comes from the reservation');
select is((pg_temp.outbox(pg_temp.r('main'))).fingerprint_key_version, 1, 'X1: fingerprinted with the active key');
select is((pg_temp.outbox(pg_temp.r('main'))).facts_fingerprint,
  calendar_private.outbox_fingerprint(1, (pg_temp.outbox(pg_temp.r('main'))).fingerprint_salt,
    calendar_private.outbox_row_facts_canonical(pg_temp.outbox(pg_temp.r('main')))),
  'X1: stored facts fingerprint verifies');
select is((select count(*)::int from calendar_private.notification_events
  where key = pg_temp.okey(pg_temp.r('main')) and event_type = 'ENQUEUED'), 1, 'X1: one ENQUEUED event');

select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('main')))->>'status', 'already_queued',
  'identical replay is already_queued');
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('main'),
  'calendar-donor-confirmation/2027-01-01.1', 'New wording', 'New wording text', '<p>New</p>'))->>'status',
  'already_queued', 'a template-only change is already_queued');
select is((pg_temp.outbox(pg_temp.r('main'))).subject, 'Thank you', 'the original content is kept');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(pg_temp.intent(%L::uuid,
  'calendar-donor-confirmation/2026-11-07.1', 'Thank you', 'Different text', '<p>x</p>'))$$, pg_temp.r('main')),
  '23514', 'PAYLOAD_CONFLICT', 'same template with different content is a conflict');

select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(pg_temp.intent(%L::uuid))$$, pg_temp.r('nolang')),
  '23514', 'INVALID_PAID_RECORD', 'D4: a missing donor language fails closed');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  jsonb_set(pg_temp.intent(%L::uuid), '{factsDigest}', to_jsonb(repeat('0', 64))))$$, pg_temp.r('tamper')),
  '23514', 'INVALID_INTENT', 'item 1: a well-formed but wrong facts digest is rejected');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  jsonb_set(pg_temp.intent(%L::uuid), '{contentDigest}', to_jsonb(repeat('a', 64))))$$, pg_temp.r('tamper')),
  '23514', 'INVALID_INTENT', 'a well-formed but wrong content digest is rejected');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  pg_temp.intent(%L::uuid) || '{"extra": 1}')$$, pg_temp.r('tamper')),
  '23514', 'INVALID_INTENT', 'an unknown top-level key is rejected');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  jsonb_set(pg_temp.intent(%L::uuid), '{facts,multiplier}', '"1"'))$$, pg_temp.r('tamper')),
  '23514', 'INVALID_INTENT', 'a numeric field sent as a string is rejected');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  jsonb_set(pg_temp.intent(%L::uuid), '{facts,days}', '[3, 1]'))$$, pg_temp.r('main')),
  '23514', null, 'unsorted days are rejected');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  jsonb_set(pg_temp.intent(%L::uuid), '{key}', to_jsonb(upper(pg_temp.intent(%L::uuid)->>'key'))))$$,
  pg_temp.r('tamper'), pg_temp.r('tamper')),
  '23514', 'SCOPE_MISMATCH', 'an uppercase key is rejected');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  jsonb_set(pg_temp.intent(%L::uuid), '{recipient}', '"other@example.test"'))$$, pg_temp.r('tamper')),
  '23514', 'SCOPE_MISMATCH', 'a recipient that differs from the reservation is rejected');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  jsonb_set(pg_temp.intent(%L::uuid), '{organizationId}', to_jsonb(pg_temp.cid('org-b'))))$$, pg_temp.r('tamper')),
  '23514', 'SCOPE_MISMATCH', 'another organization is rejected');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(
  jsonb_set(pg_temp.intent(%L::uuid), '{facts,totalCents}', '999'))$$, pg_temp.r('tamper')),
  '23514', 'SCOPE_MISMATCH', 'a changed amount is rejected');
select is((select count(*)::int from calendar_private.notification_outbox where reservation_id in
  (pg_temp.r('nolang'), pg_temp.r('tamper'))), 0, 'rejected intents wrote no rows');

-- ===========================================================================
-- 5. Claim: allowlist (D6), integrity, refund (D3), lease
-- ===========================================================================
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('unlisted')))->>'status', 'queued',
  'a non-allowlisted recipient can still be queued');
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('tamper')))->>'status', 'queued',
  'tamper fixture queued');
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('refund')))->>'status', 'queued',
  'refund fixture queued');
-- Only 'main' (allowlisted) and others below should ever be claimable; park everything except
-- the row under test by pushing next_attempt_at into the future.
update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() + interval '1 day'
  where state = 'PENDING' and reservation_id <> pg_temp.r('unlisted');
select is(calendar_private.claim_donor_confirmation('worker-1', 'acct-test-1'), null,
  'D6: a recipient that is not allowlisted is never claimed');
select is((pg_temp.outbox(pg_temp.r('unlisted'))).state, 'PENDING',
  'D6: it stays PENDING, harmless; the org-b allowlist entry for the same address does not apply to org-a');

update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() - interval '1 second'
  where reservation_id = pg_temp.r('tamper');
update calendar_private.notification_outbox set text_body = 'Tampered body' where reservation_id = pg_temp.r('tamper');
select is(calendar_private.claim_donor_confirmation('worker-1', 'acct-test-1'), null,
  'a tampered stored payload is never released');
select is((pg_temp.outbox(pg_temp.r('tamper'))).hold_reason, 'stored_payload_integrity_failure',
  'tampering is held for review');

update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() - interval '1 second'
  where reservation_id = pg_temp.r('refund');
update calendar_private.reservations set status = 'REFUNDED' where id = pg_temp.r('refund');
select is(calendar_private.claim_donor_confirmation('worker-1', 'acct-test-1'), null,
  'R1/D3: a refunded reservation is not claimed');
select is((pg_temp.outbox(pg_temp.r('refund'))).hold_reason, 'reservation_no_longer_paid',
  'R1/D3: refund before claim is held for review');

update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() - interval '1 second'
  where reservation_id = pg_temp.r('main');
insert into t(label, v) values ('claim-main', calendar_private.claim_donor_confirmation('worker-1', 'acct-test-1'));
select is((select v->>'key' from t where label = 'claim-main'), pg_temp.okey(pg_temp.r('main')), 'claim returns the due row');
select is((select v->'delivery'->>'recipient' from t where label = 'claim-main'), 'listed@example.test',
  'claim returns the STORED recipient');
select is((select v->>'providerIdempotencyKey' from t where label = 'claim-main'),
  calendar_private.outbox_provider_key(pg_temp.okey(pg_temp.r('main')), 1), 'claim returns the epoch-1 provider key');
select is((pg_temp.outbox(pg_temp.r('main'))).state, 'SENDING', 'claimed row is SENDING');
select is(calendar_private.claim_donor_confirmation('worker-2', 'acct-test-1'), null,
  'a SENDING row is never claimed twice');
select throws_ok(format($$select calendar_private.acknowledge_donor_confirmation(%L, %L::uuid, 'accepted', 'msg_1')$$,
  pg_temp.okey(pg_temp.r('main')), pg_temp.cid('wrong-lease')), '23514', 'STALE_LEASE', 'a wrong lease is fenced');
select is(calendar_private.acknowledge_donor_confirmation(pg_temp.okey(pg_temp.r('main')),
  (select (v->>'leaseId')::uuid from t where label = 'claim-main'), 'accepted', 'msg_main_1')->>'state', 'SENT',
  'accepted -> SENT');
select is((pg_temp.outbox(pg_temp.r('main'))).provider_message_id, 'msg_main_1', 'provider message id stored');
select is((pg_temp.outbox(pg_temp.r('main'))).sent_after_refund, false, 'normal send is not flagged');

-- ===========================================================================
-- 6. State machine: retryable, permanent, unknown, lease expiry (window 0 default)
-- ===========================================================================
-- Claims exactly the row under test. If the claim returns nothing or another row, fail
-- loudly with the row's state so CI logs show why (diagnostic only; no behaviour change).
create function pg_temp.claim_only(p_res uuid, p_account text default 'acct-test-1',
  p_expect_claim boolean default true) returns jsonb language plpgsql as $$
declare c jsonb; o calendar_private.notification_outbox;
begin
  update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() + interval '1 day'
    where state = 'PENDING' and reservation_id <> p_res;
  update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() - interval '1 second'
    where state = 'PENDING' and reservation_id = p_res;
  c := calendar_private.claim_donor_confirmation('worker-t', p_account);
  if p_expect_claim and (c is null or c->>'key' is distinct from pg_temp.okey(p_res)) then
    select * into o from calendar_private.notification_outbox where reservation_id = p_res;
    raise exception 'claim_only: expected % got %; row state=% hold=% next=% now=% allowlisted=% reservation=% due_pending=%',
      pg_temp.okey(p_res), c->>'key', o.state, o.hold_reason, o.next_attempt_at, clock_timestamp(),
      exists (select 1 from calendar_private.test_recipient_allowlist a
              where a.organization_id = o.organization_id and a.recipient = o.recipient),
      (select status from calendar_private.reservations where id = p_res),
      (select count(*) from calendar_private.notification_outbox
        where state = 'PENDING' and next_attempt_at <= clock_timestamp());
  end if;
  return c;
end $$;
select calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r(l)))
  from unnest(array['retry','perm','unknown','lease','race-ok','race-rt','race-un','window',
                    'review','restart','abandon','purge']) l;

insert into t(label, v) values ('c-retry', pg_temp.claim_only(pg_temp.r('retry')));
-- Call the acknowledgement exactly once and assert on the stored result. (A BETWEEN around
-- the call would evaluate it twice, and the lease fence would rightly reject the second call.)
insert into t(label, v) values ('a-retry', calendar_private.acknowledge_donor_confirmation(pg_temp.okey(pg_temp.r('retry')),
  (select (v->>'leaseId')::uuid from t where label = 'c-retry'), 'rejected_retryable', null, 'rate_limited'));
select is((select v->>'state' from t where label = 'a-retry'), 'PENDING', 'a retryable rejection returns the row to PENDING');
select is((pg_temp.outbox(pg_temp.r('retry'))).next_attempt_at - (pg_temp.outbox(pg_temp.r('retry'))).updated_at,
  interval '30 seconds', 'first retryable rejection backs off exactly 30 seconds (same database clock reading)');
select is(pg_temp.sqlstate_of(format($$select calendar_private.acknowledge_donor_confirmation(%L, %L::uuid, 'rejected_retryable')$$,
  pg_temp.okey(pg_temp.r('retry')), (select v->>'leaseId' from t where label = 'c-retry'))), '23514',
  'lease fencing: re-using an acknowledged lease is refused (STALE_LEASE)');
create function pg_temp.exhaust(p_res uuid) returns text language plpgsql as $$
declare c jsonb; s jsonb; i int := 0;
begin
  loop
    i := i + 1;
    c := pg_temp.claim_only(p_res);
    exit when c is null or i > 10;
    s := calendar_private.acknowledge_donor_confirmation(c->>'key', (c->>'leaseId')::uuid, 'rejected_retryable');
    exit when s->>'state' <> 'PENDING';
  end loop;
  return (pg_temp.outbox(p_res)).hold_reason;
end $$;
select is(pg_temp.exhaust(pg_temp.r('retry')), 'retry_exhausted', 'retries end in DEAD_LETTER / retry_exhausted');
select is((pg_temp.outbox(pg_temp.r('retry'))).epoch_attempts, 5::smallint, 'exactly max_attempts (5) attempts');

insert into t(label, v) values ('c-perm', pg_temp.claim_only(pg_temp.r('perm')));
select is(calendar_private.acknowledge_donor_confirmation(pg_temp.okey(pg_temp.r('perm')),
  (select (v->>'leaseId')::uuid from t where label = 'c-perm'), 'rejected_permanent', null, 'Provider said NO! <b>')->>'state',
  'DEAD_LETTER', 'permanent rejection -> DEAD_LETTER');
select is((select code from calendar_private.notification_events where key = pg_temp.okey(pg_temp.r('perm'))
  and event_type = 'REJECTED_PERMANENT'), 'unspecified', 'provider text is never stored, only an allowlisted code');

insert into t(label, v) values ('c-unknown', pg_temp.claim_only(pg_temp.r('unknown')));
select is(calendar_private.acknowledge_donor_confirmation(pg_temp.okey(pg_temp.r('unknown')),
  (select (v->>'leaseId')::uuid from t where label = 'c-unknown'), 'unknown', null, 'timeout')->>'holdReason',
  'no_provider_idempotency', 'window 0: an unknown outcome is held, never retried');

insert into t(label, v) values ('c-lease', pg_temp.claim_only(pg_temp.r('lease')));
update calendar_private.notification_outbox set lease_expires_at = clock_timestamp() - interval '1 second'
  where reservation_id = pg_temp.r('lease');
select is(calendar_private.expire_donor_confirmation_leases(), '{"requeued": 0, "uncertain": 1}'::jsonb,
  'lease expiry is an unknown outcome, never "not sent"');
select is((select count(*)::int from calendar_private.notification_events where key = pg_temp.okey(pg_temp.r('lease'))
  and event_type = 'LEASE_EXPIRED'), 1, 'lease expiry recorded');

-- Refund races (sequential versions of R3-R5).
insert into t(label, v) values ('c-race-ok', pg_temp.claim_only(pg_temp.r('race-ok')));
update calendar_private.reservations set status = 'REFUNDED' where id = pg_temp.r('race-ok');
select is(calendar_private.acknowledge_donor_confirmation(pg_temp.okey(pg_temp.r('race-ok')),
  (select (v->>'leaseId')::uuid from t where label = 'c-race-ok'), 'accepted', 'msg_race')->>'sentAfterRefund',
  'true', 'R3: accepted after a refund is SENT and flagged sent_after_refund');
select is((select code from calendar_private.notification_events where key = pg_temp.okey(pg_temp.r('race-ok'))
  and event_type = 'ACCEPTED'), 'reservation_refunded_during_send', 'R3: the race is recorded');
insert into t(label, v) values ('c-race-rt', pg_temp.claim_only(pg_temp.r('race-rt')));
update calendar_private.reservations set status = 'REFUNDED' where id = pg_temp.r('race-rt');
select is(calendar_private.acknowledge_donor_confirmation(pg_temp.okey(pg_temp.r('race-rt')),
  (select (v->>'leaseId')::uuid from t where label = 'c-race-rt'), 'rejected_retryable')->>'holdReason',
  'reservation_no_longer_paid', 'R4: a retryable rejection after a refund is held, not retried');
insert into t(label, v) values ('c-race-un', pg_temp.claim_only(pg_temp.r('race-un')));
update calendar_private.reservations set status = 'REFUNDED' where id = pg_temp.r('race-un');
select is(calendar_private.acknowledge_donor_confirmation(pg_temp.okey(pg_temp.r('race-un')),
  (select (v->>'leaseId')::uuid from t where label = 'c-race-un'), 'unknown')->>'holdReason',
  'reservation_no_longer_paid', 'R5: an unknown outcome after a refund is held for review');
select is((pg_temp.outbox(pg_temp.r('race-un'))).epoch_unknown_outcome, true, 'R5: the unknown outcome is remembered');

-- Non-zero window: anchoring, claim-time recheck, provider binding.
update calendar_private.notification_policy set provider_idempotency_window = '24 hours',
  idempotency_safety_margin = '1 hour', lease_interval = '2 minutes';
insert into t(label, v) values ('c-window', pg_temp.claim_only(pg_temp.r('window')));
select is(calendar_private.acknowledge_donor_confirmation(pg_temp.okey(pg_temp.r('window')),
  (select (v->>'leaseId')::uuid from t where label = 'c-window'), 'unknown')->>'state', 'PENDING',
  'non-zero window: an unknown outcome is retried while the window covers it');
select is(pg_temp.claim_only(pg_temp.r('window'), 'acct-OTHER', false), null,
  'a different provider account cannot retry after an unknown outcome');
select is((pg_temp.outbox(pg_temp.r('window'))).hold_reason, 'provider_changed_after_unknown_outcome',
  'provider change is held');
update calendar_private.notification_policy set provider_idempotency_window = '0', idempotency_safety_margin = '1 hour';

-- ===========================================================================
-- 7. Reviewer authorization: explicit, org-scoped, MFA, D2e, no platform bypass
-- ===========================================================================
-- Put review fixtures into DELIVERY_UNCERTAIN (window 0 -> no_provider_idempotency).
create function pg_temp.to_uncertain(p_res uuid) returns void language plpgsql as $$
declare c jsonb;
begin
  c := pg_temp.claim_only(p_res);
  perform calendar_private.acknowledge_donor_confirmation(c->>'key', (c->>'leaseId')::uuid, 'unknown');
end $$;
select pg_temp.to_uncertain(pg_temp.r(l)) from unnest(array['review','restart','abandon']) l;
select is((pg_temp.outbox(pg_temp.r('review'))).state, 'DELIVERY_UNCERTAIN', 'review fixture is uncertain');

create function pg_temp.abandon_sql(p_res uuid) returns text language sql stable as $$
  select format($q$select calendar_private.resolve_donor_confirmation(%L, 'abandon', 'donor_contacted_directly',
    'internal_record', 'TICKET-1', 1)$q$, pg_temp.okey(p_res));
$$;
select pg_temp.no_session();
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED', 'no session is denied');
select pg_temp.as_user('rev-1', 'aal1');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED', 'MFA is mandatory (aal1 denied)');
select pg_temp.as_user('outsider');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED', 'an undesignated member is denied');
select pg_temp.as_user('a-admin');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED',
  'an organization admin/director without a designation is denied');
select pg_temp.as_user('plat-undesignated');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED',
  'a platform admin without an explicit designation is denied (no bypass)');
select pg_temp.as_user('b-rev');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED',
  'a reviewer of another organization is denied');
select pg_temp.as_user('rev-revoked');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED', 'a revoked designation is denied');
select pg_temp.as_user('rev-suspended');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED',
  'a designee whose membership is suspended is denied');
select pg_temp.as_user('appointer');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED', 'D2e: the appointer is not a reviewer');
select pg_temp.as_user('rev-1');
select throws_ok(format($$select calendar_private.resolve_donor_confirmation('calendar:test:unknown', 'abandon',
  'donor_contacted_directly', 'internal_record', 'TICKET-1', 1)$$), '42501', 'NOT_AUTHORIZED',
  'an unknown key gets the same denial');
select pg_temp.no_session();
-- Expire rev-expired's designation by appending a new grant that has already lapsed is impossible
-- (expires_at must be after occurred_at), so simulate the passage of time on the only row.
alter table calendar_private.notification_reviewer_events disable trigger calendar_reviewer_events_immutable;
update calendar_private.notification_reviewer_events set occurred_at = now() - interval '2 days',
  expires_at = now() - interval '1 day' where user_id = pg_temp.cid('user-rev-expired');
alter table calendar_private.notification_reviewer_events enable trigger calendar_reviewer_events_immutable;
select pg_temp.as_user('rev-expired');
select throws_ok(pg_temp.abandon_sql(pg_temp.r('review')), '42501', 'NOT_AUTHORIZED', 'an expired designation is denied');
select pg_temp.as_user('staff');
select ok(calendar_private.is_notification_reviewer(pg_temp.cid('org-a')),
  'D2b: explicitly designated platform staff may review that organization');
-- The existing platform guard refuses platform_admins writes from any end-user session,
-- so the fixture change runs with no JWT (owner-level), then the staff session resumes.
select pg_temp.no_session();
delete from public.platform_admins where user_id = pg_temp.cid('user-staff');
select pg_temp.as_user('staff');
select ok(not calendar_private.is_notification_reviewer(pg_temp.cid('org-a')),
  'platform_staff designation lapses when the user is no longer a platform admin');
select pg_temp.as_user('rev-1');
select ok(calendar_private.is_notification_reviewer(pg_temp.cid('org-a')), 'rev-1 (designated, aal2) is a reviewer');
select pg_temp.no_session();

-- D2e at write time.
select throws_ok($$insert into calendar_private.notification_reviewer_events
  (organization_id, user_id, event_type, basis, expires_at, actor_user_id)
  values (pg_temp.cid('org-a'), pg_temp.cid('user-appointer'), 'GRANTED', 'org_member',
          now() + interval '30 days', pg_temp.cid('user-a-admin'))$$,
  '23514', 'APPOINTER_CANNOT_REVIEW', 'D2e: an appointer cannot be granted reviewer rights');
select throws_ok($$insert into calendar_private.notification_reviewer_events
  (organization_id, user_id, event_type, basis, expires_at, actor_user_id)
  values (pg_temp.cid('org-a'), pg_temp.cid('user-outsider'), 'GRANTED', 'org_member',
          now() + interval '30 days', pg_temp.cid('user-rev-1'))$$,
  '23514', 'REVIEWER_CANNOT_APPOINT', 'D2e: a reviewer cannot appoint reviewers');
select is(pg_temp.sqlstate_of($$insert into calendar_private.notification_reviewer_events
  (organization_id, user_id, event_type, basis, expires_at, actor_user_id)
  values (pg_temp.cid('org-a'), pg_temp.cid('user-outsider'), 'GRANTED', 'org_member',
          now() + interval '30 days', pg_temp.cid('user-outsider'))$$), '23514', 'nobody can designate themselves');
-- D2e at check time (defence in depth): even if a row slipped past the trigger, the check refuses.
alter table calendar_private.notification_reviewer_events disable trigger calendar_reviewer_appointer_separation;
insert into calendar_private.notification_reviewer_events
  (organization_id, user_id, event_type, basis, expires_at, actor_user_id)
  values (pg_temp.cid('org-a'), pg_temp.cid('user-outsider'), 'GRANTED', 'org_member',
          now() + interval '30 days', pg_temp.cid('user-rev-2'));
alter table calendar_private.notification_reviewer_events enable trigger calendar_reviewer_appointer_separation;
select ok(not calendar_private.is_designated_reviewer(pg_temp.cid('org-a'), pg_temp.cid('user-rev-2')),
  'D2e: a reviewer who has acted as an appointer loses reviewer status');
select ok(calendar_private.is_designated_reviewer(pg_temp.cid('org-a'), pg_temp.cid('user-outsider')),
  'fixture: outsider designated by the (bypassed) appointer');
-- Restore a clean second reviewer for the two-person tests: rev-3 = outsider.

-- ===========================================================================
-- 8. Resolution evidence, two-person restart, audit (items 4, T1-T12)
-- ===========================================================================
select pg_temp.as_user('rev-1');
select throws_ok(format($$select calendar_private.resolve_donor_confirmation(%L, 'abandon',
  'donor_contacted_directly', 'internal_record', 'someone@example.test', 1)$$, pg_temp.okey(pg_temp.r('abandon'))),
  '23514', 'EVIDENCE_REQUIRED', 'an evidence reference containing @ is rejected');
select throws_ok(format($$select calendar_private.resolve_donor_confirmation(%L, 'abandon',
  'not_a_reason', 'internal_record', 'TICKET-1', 1)$$, pg_temp.okey(pg_temp.r('abandon'))),
  '23514', 'EVIDENCE_REQUIRED', 'a disallowed reason is rejected');
select throws_ok(format($$select calendar_private.resolve_donor_confirmation(%L, 'abandon',
  'donor_contacted_directly', 'internal_record', 'TICKET-1', 2)$$, pg_temp.okey(pg_temp.r('abandon'))),
  '23514', 'STALE_REVIEW', 'a decision about a different epoch is rejected');
select is(calendar_private.resolve_donor_confirmation(pg_temp.okey(pg_temp.r('abandon')), 'abandon',
  'donor_contacted_directly', 'internal_record', 'TICKET-1', 1)->>'state', 'DEAD_LETTER', 'abandon with evidence -> DEAD_LETTER');
select is(calendar_private.resolve_donor_confirmation(pg_temp.okey(pg_temp.r('review')), 'provider_confirmed_accepted',
  'provider_reports_accepted', 'provider_dashboard', 'PROVIDER-EVT-9', 1, 'msg_review_9')->>'state', 'SENT',
  'provider-confirmed acceptance with evidence -> SENT');

-- Restart: request by rev-1, approval by a different current reviewer (outsider).
select throws_ok(format($$select calendar_private.resolve_donor_confirmation(%L, 'provider_confirmed_not_accepted',
  'provider_reports_not_accepted', 'provider_api_lookup', 'LOOKUP-1', 1)$$, pg_temp.okey(pg_temp.r('restart'))),
  '23514', 'EVIDENCE_REQUIRED', 'a restart without the duplicate-risk acknowledgement is rejected');
select throws_ok(format($$select calendar_private.resolve_donor_confirmation(%L, 'provider_confirmed_not_accepted',
  'provider_reports_not_accepted', 'provider_dashboard', 'DASH-1', 1, null, true)$$, pg_temp.okey(pg_temp.r('restart'))),
  '23514', 'EVIDENCE_REQUIRED', 'a dashboard showing nothing is not restart evidence');
insert into t(label, v) values ('restart-req', calendar_private.resolve_donor_confirmation(pg_temp.okey(pg_temp.r('restart')),
  'provider_confirmed_not_accepted', 'provider_reports_not_accepted', 'provider_api_lookup', 'LOOKUP-1', 1, null, true));
select is((select v->>'state' from t where label = 'restart-req'), 'DELIVERY_UNCERTAIN', 'T1: a restart request alone changes nothing');
select is((select v->>'restartPending' from t where label = 'restart-req'), 'true', 'the request is recorded');
select throws_ok(format($$select calendar_private.approve_epoch_restart(%L, %L::uuid, 1, true, true)$$,
  pg_temp.okey(pg_temp.r('restart')), (pg_temp.outbox(pg_temp.r('restart'))).restart_request_id),
  '42501', 'SECOND_REVIEWER_REQUIRED', 'T1: the requester cannot approve their own restart');
select pg_temp.as_user('outsider');
select throws_ok(format($$select calendar_private.approve_epoch_restart(%L, %L::uuid, 1, true, false)$$,
  pg_temp.okey(pg_temp.r('restart')), (pg_temp.outbox(pg_temp.r('restart'))).restart_request_id),
  '23514', 'EVIDENCE_REQUIRED', 'T7: the approver must acknowledge the duplicate risk');
select throws_ok(format($$select calendar_private.approve_epoch_restart(%L, %L::uuid, 2, true, true)$$,
  pg_temp.okey(pg_temp.r('restart')), (pg_temp.outbox(pg_temp.r('restart'))).restart_request_id),
  '23514', 'STALE_REVIEW', 'T4: the approver must approve the epoch that was requested');
select throws_ok(format($$select calendar_private.approve_epoch_restart(%L, %L::uuid, 1, true, true)$$,
  pg_temp.okey(pg_temp.r('restart')), pg_temp.cid('another-request')),
  '23514', 'INVALID_TRANSITION', 'T4: the approver must name the exact request');
-- T3: the requester must still be a reviewer at approval time.
select pg_temp.no_session();
insert into calendar_private.notification_reviewer_events (organization_id, user_id, event_type, actor_user_id, reason_code)
  values (pg_temp.cid('org-a'), pg_temp.cid('user-rev-1'), 'REVOKED', pg_temp.cid('user-appointer'), 'synthetic_test');
select pg_temp.as_user('outsider');
select throws_ok(format($$select calendar_private.approve_epoch_restart(%L, %L::uuid, 1, true, true)$$,
  pg_temp.okey(pg_temp.r('restart')), (pg_temp.outbox(pg_temp.r('restart'))).restart_request_id),
  '42501', 'REQUESTER_NO_LONGER_AUTHORIZED', 'T3: a revoked requester''s restart cannot be approved');
select pg_temp.no_session();
insert into calendar_private.notification_reviewer_events
  (organization_id, user_id, event_type, basis, expires_at, actor_user_id, reason_code)
  values (pg_temp.cid('org-a'), pg_temp.cid('user-rev-1'), 'GRANTED', 'org_member', now() + interval '90 days',
          pg_temp.cid('user-appointer'), 'synthetic_test');
-- T5: requests expire.
update calendar_private.notification_outbox set restart_requested_at = clock_timestamp() - interval '8 days'
  where reservation_id = pg_temp.r('restart');
select pg_temp.as_user('outsider');
select throws_ok(format($$select calendar_private.approve_epoch_restart(%L, %L::uuid, 1, true, true)$$,
  pg_temp.okey(pg_temp.r('restart')), (pg_temp.outbox(pg_temp.r('restart'))).restart_request_id),
  '23514', 'RESTART_REQUEST_EXPIRED', 'T5: an approval after the TTL is refused');
update calendar_private.notification_outbox set restart_requested_at = clock_timestamp()
  where reservation_id = pg_temp.r('restart');
select pg_temp.as_user('outsider', 'aal1');
select throws_ok(format($$select calendar_private.approve_epoch_restart(%L, %L::uuid, 1, true, true)$$,
  pg_temp.okey(pg_temp.r('restart')), (pg_temp.outbox(pg_temp.r('restart'))).restart_request_id),
  '42501', 'NOT_AUTHORIZED', 'T2: the approver also needs MFA');
select pg_temp.as_user('outsider');
select is(calendar_private.approve_epoch_restart(pg_temp.okey(pg_temp.r('restart')),
  (pg_temp.outbox(pg_temp.r('restart'))).restart_request_id, 1, true, true)->>'state', 'PENDING',
  'a second, different reviewer approves the restart');
select is((pg_temp.outbox(pg_temp.r('restart'))).epoch, 2, 'the restart starts epoch 2');
select isnt(calendar_private.outbox_provider_key(pg_temp.okey(pg_temp.r('restart')), 2),
  calendar_private.outbox_provider_key(pg_temp.okey(pg_temp.r('restart')), 1), 'epoch 2 has a new provider key');
select pg_temp.no_session();

-- Audit integrity (§17.4).
select is((select count(*)::int from public.audit_events where organization_id = pg_temp.cid('org-a')
  and entity_type = 'calendar_notification'), 4,
  'exactly one audit row per decision (abandon, accepted, restart requested, restart approved); refusals write none');
select is((select count(*)::int from calendar_private.verify_notification_audit_coverage(pg_temp.cid('org-a'))), 0,
  'audit coverage is complete: every decision has exactly one audit row');
select ok(not exists (select 1 from public.audit_events where entity_type = 'calendar_notification'
  and (metadata::text like '%@%' or metadata::text like '%Synthetic Supporter%')),
  'audit metadata contains no email or donor name');
select ok((select bool_and(metadata ? 'source' and metadata ? 'source_event_id') from public.audit_events
  where entity_type = 'calendar_notification'), 'every calendar audit row links to its source event');
select is((select ok from public.verify_hash_chain('audit_events', 'organization_id', pg_temp.cid('org-a'))), true,
  'the organization''s audit hash chain still verifies');
-- A1/A2: malformed metadata is reported, never thrown, never hides a gap.
insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
select pg_temp.cid('org-a'), pg_temp.cid('user-rev-1'), 'CALENDAR_NOTIFICATION_RESOLVED', 'calendar_notification',
  pg_temp.r('review'), m
from (values ('{"source":"notification_events","source_event_id":"abc"}'::jsonb),
             ('{"source":"notification_events","source_event_id":"-1"}'::jsonb),
             ('{"source":"notification_events","source_event_id":"1.5"}'::jsonb),
             ('{"source":"notification_events","source_event_id":"99999999999999999999"}'::jsonb),
             ('{"source":"notification_events"}'::jsonb),
             ('{"source":"elsewhere","source_event_id":"1"}'::jsonb)) as bad(m);
select is((select count(*)::int from calendar_private.verify_notification_audit_coverage(pg_temp.cid('org-a'))
  where problem = 'malformed_audit_metadata'), 6, 'A1: six malformed audit rows are reported without an error');
insert into calendar_private.notification_events (key, organization_id, event_type, epoch, reviewer_user_id,
  resolution, reason_code, evidence_kind, evidence_ref)
values (pg_temp.okey(pg_temp.r('review')), pg_temp.cid('org-a'), 'RESOLVED', 1, pg_temp.cid('user-rev-1'),
  'abandon', 'donor_contacted_directly', 'internal_record', 'FORGED-1');
select is((select count(*)::int from calendar_private.verify_notification_audit_coverage(pg_temp.cid('org-a'))
  where problem = 'missing_audit_event'), 1, 'A2: a decision with no audit row is reported');

-- ===========================================================================
-- 9. Language recovery (D4/item 6), backlog, sweep hints
-- ===========================================================================
select is((select language_missing from calendar_private.list_missing_donor_confirmations(pg_temp.cid('org-a'))
  where reservation_id = pg_temp.r('nolang')), true, 'missing language is flagged in the sweep hints');
select is((select count(*)::int from calendar_private.list_missing_donor_confirmations(pg_temp.cid('org-b'))), 0,
  'another organization''s sweep never sees Aspire South reservations');
select pg_temp.as_user('outsider');
select is((calendar_private.read_confirmation_backlog(pg_temp.cid('org-a'))->>'missingLanguage')::int, 1,
  'backlog counts the missing-language reservation');
select pg_temp.as_user('b-rev');
select throws_ok(format($$select calendar_private.read_confirmation_backlog(%L::uuid)$$, pg_temp.cid('org-a')),
  '42501', 'NOT_AUTHORIZED', 'backlog is reviewer-only, per organization');
select throws_ok(format($$select calendar_private.record_supporter_language(%L::uuid, 'es', 'donor_statement', 'CALL-1')$$,
  pg_temp.r('nolang')), '42501', 'NOT_AUTHORIZED', 'another organization''s reviewer cannot record a language');
select pg_temp.as_user('outsider');
select throws_ok(format($$select calendar_private.record_supporter_language(%L::uuid, 'fr', 'donor_statement', 'CALL-1')$$,
  pg_temp.r('nolang')), '23514', 'EVIDENCE_REQUIRED', 'only en/es');
select throws_ok(format($$select calendar_private.record_supporter_language(%L::uuid, 'es', 'guess', 'CALL-1')$$,
  pg_temp.r('nolang')), '23514', 'EVIDENCE_REQUIRED', 'a language needs real evidence');
select throws_ok(format($$select calendar_private.record_supporter_language(%L::uuid, 'en', 'donor_statement', 'CALL-1')$$,
  pg_temp.r('main')), '23514', 'INVALID_TRANSITION', 'an existing language is never overwritten');
select is(calendar_private.record_supporter_language(pg_temp.r('nolang'), 'es', 'donor_statement', 'CALL-1')->>'language',
  'es', 'a reviewer records the language once, with evidence');
select pg_temp.no_session();
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('nolang')))->>'status', 'queued',
  'after recovery, the confirmation enqueues normally');
select is((select count(*)::int from calendar_private.verify_notification_audit_coverage(pg_temp.cid('org-a'))
  where problem = 'missing_audit_event'), 1, 'language recording is fully audited (only the forged gap remains)');

-- ===========================================================================
-- 10. Purge (D5) and keys after purge (P1-P4, K2, K3, K11)
-- ===========================================================================
-- 'main' and 'review' are SENT. Age them past retention.
update calendar_private.notification_outbox set updated_at = clock_timestamp() - interval '31 days'
  where reservation_id in (pg_temp.r('main'), pg_temp.r('review'));
select is(calendar_private.purge_donor_confirmation_payloads(), 2, 'purge clears exactly the two final rows past retention');
select ok((pg_temp.outbox(pg_temp.r('main'))).recipient is null and (pg_temp.outbox(pg_temp.r('main'))).html_body is null
  and (pg_temp.outbox(pg_temp.r('main'))).facts_digest is null, 'payload and unsalted digests are cleared');
select ok((pg_temp.outbox(pg_temp.r('main'))).facts_fingerprint is not null, 'keyed fingerprints are kept');
select is((select count(*)::int from calendar_private.notification_outbox where payload_purged_at is not null
  and state not in ('SENT', 'DEAD_LETTER')), 0, 'only final rows are ever purged');
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('main')))->>'status', 'already_queued',
  'P: identical replay after purge is already_queued');
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('main'),
  'calendar-donor-confirmation/2027-01-01.1', 'New', 'New text', '<p>New</p>'))->>'status', 'already_queued',
  'P1: replay with a newer template after purge is already_queued');
update calendar_private.reservations set supporter_email = 'changed@example.test' where id = pg_temp.r('main');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(pg_temp.intent(%L::uuid))$$, pg_temp.r('main')),
  '23514', 'PAYLOAD_CONFLICT', 'item 5: a changed recipient is still detected after purge, without the address');
update calendar_private.reservations set supporter_email = 'listed@example.test' where id = pg_temp.r('main');
select is(pg_temp.sqlstate_of(format($$delete from calendar_private.notification_outbox where reservation_id = %L::uuid$$,
  pg_temp.r('main'))), '42501', 'P4: outbox rows can never be deleted');
select is((select count(*)::int from calendar_private.list_missing_donor_confirmations(pg_temp.cid('org-a'))
  where reservation_id = pg_temp.r('main')), 0, 'P4: a purged row is never re-listed by the sweep');

-- K2: rotation. v1 retired, v2 active; new rows use v2; v1 rows still verify with v1.
update calendar_private.notification_fingerprint_keys set retired_at = clock_timestamp() where version = 1;
select is(pg_temp.sqlstate_of(format($$select calendar_private.enqueue_donor_confirmation(pg_temp.intent(%L::uuid))$$,
  pg_temp.r('rotate'))), '55000', 'K1: with no active key, enqueue fails closed');
select is((select count(*)::int from calendar_private.notification_outbox where reservation_id = pg_temp.r('rotate')), 0,
  'K1: nothing was queued without a key');
select pg_temp.add_key(2, encode(extensions.gen_random_bytes(32), 'base64'), true);
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('rotate')))->>'status', 'queued',
  'K2: after rotation, new rows enqueue');
select is((pg_temp.outbox(pg_temp.r('rotate'))).fingerprint_key_version, 2, 'K2: new rows use the new key');
select is(calendar_private.enqueue_donor_confirmation(pg_temp.intent(pg_temp.r('main')))->>'status', 'already_queued',
  'P2: a purged v1 row still verifies with its retired v1 key');
update calendar_private.reservations set supporter_email = 'changed@example.test' where id = pg_temp.r('main');
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(pg_temp.intent(%L::uuid))$$, pg_temp.r('main')),
  '23514', 'PAYLOAD_CONFLICT', 'P2: a recipient change on a v1 row is still a conflict after rotation');
update calendar_private.reservations set supporter_email = 'listed@example.test' where id = pg_temp.r('main');
-- K3/K11/P3: the v1 secret is lost.
update calendar_private.notification_fingerprint_keys set vault_secret_name = 'calendar_outbox_fp_v101' where version = 1;
select throws_ok(format($$select calendar_private.enqueue_donor_confirmation(pg_temp.intent(%L::uuid))$$, pg_temp.r('main')),
  '55000', 'FINGERPRINT_KEY_UNAVAILABLE', 'K3/P3: a lost key fails closed (never already_queued, never conflict)');
select ok((pg_temp.outbox(pg_temp.r('main'))).payload_purged_at is not null, 'P3: the row is unchanged');

-- ===========================================================================
-- 11. Append-only history and execution of every function at least once (X2)
-- ===========================================================================
select is(pg_temp.sqlstate_of($$update calendar_private.notification_events set code = 'x'$$), '42501',
  'notification events are append-only (update)');
select is(pg_temp.sqlstate_of($$delete from calendar_private.notification_events$$), '42501',
  'notification events are append-only (delete)');
select is(pg_temp.sqlstate_of($$delete from calendar_private.reservation_language_events$$), '42501',
  'language events are append-only');
select is(pg_temp.sqlstate_of($$delete from calendar_private.notification_reviewer_events$$), '42501',
  'reviewer events are append-only');
select ok(calendar_private.read_donor_confirmation_status(pg_temp.okey(pg_temp.r('restart'))) ?& array['state', 'epoch'],
  'X2: read_donor_confirmation_status executes');
select ok(not (calendar_private.read_donor_confirmation_status(pg_temp.okey(pg_temp.r('restart')))
  ?| array['recipient', 'subject', 'text', 'html']), 'status is donor-free');
select is(calendar_private.read_donor_confirmation_status('calendar:test:none'), null, 'unknown status is null');
select lives_ok($$select calendar_private.outbox_require_read_committed()$$, 'X2: READ COMMITTED check passes here');
-- Identifier bounds (CI fix): PostgreSQL regex repetition is limited to 255, so the
-- 1..256 bound is enforced with length(); the accepted set must equal Batch 1 SAFE_ID.
select lives_ok(format($$select calendar_private.claim_donor_confirmation(%L, 'acct-test-1')$$, repeat('w', 256)),
  'a 256-character worker id is accepted (Batch 1 SAFE_ID upper bound)');
select throws_ok(format($$select calendar_private.claim_donor_confirmation(%L, 'acct-test-1')$$, repeat('w', 257)),
  '23514', 'INVALID_TRANSITION', 'a 257-character worker id is rejected');
select throws_ok($$select calendar_private.claim_donor_confirmation('', 'acct-test-1')$$,
  '23514', 'INVALID_TRANSITION', 'an empty worker id is rejected');
select throws_ok($$select calendar_private.claim_donor_confirmation('bad id', 'acct-test-1')$$,
  '23514', 'INVALID_TRANSITION', 'a worker id outside the allowed characters is rejected');
select is(pg_temp.sqlstate_of(format($$insert into calendar_private.notification_events (key, organization_id, event_type, epoch, worker_id)
  values (%L, %L::uuid, 'CLAIMED', 1, %L)$$, pg_temp.okey(pg_temp.r('restart')), pg_temp.cid('org-a'), repeat('w', 257))), '23514',
  'the table CHECK also enforces the 256-character bound');

select * from finish();
rollback;
