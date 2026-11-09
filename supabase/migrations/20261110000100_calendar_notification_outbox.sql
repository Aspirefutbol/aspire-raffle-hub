-- Aspire South Calendar — Batch 2A: durable donor-confirmation outbox (TEST mode).
--
-- Implements the independently reviewed proposal revision 2.2
-- (docs/calendar/batch2a-outbox-proposal-rev2.2.md @ 25c6dbb2ceb892059881732aa87187728b7bf48d;
-- review and director decisions on issue #30) plus director decision D2e
-- (reviewer appointers are never notification reviewers).
--
-- Boundaries:
-- * Everything lives in the private calendar_private schema. NO grants to anon,
--   authenticated or service_role on any new table or function. RLS on, no policies.
-- * No worker, provider, sender, route, Stripe change or hosted migration. Grants to
--   dedicated identities (D1) and the reviewer call path are Batch 2B, separately gated.
-- * Supabase Vault is REQUIRED (K1). This migration aborts if Vault is absent; there is
--   no fallback to unkeyed fingerprints.
-- * No fingerprint key is created here. Keys are provisioned outside the repository
--   (separate approval); tests create throwaway keys inside rolled-back transactions.

alter table calendar_private.reservations
  add column supporter_language text
    check (supporter_language is null or supporter_language in ('en', 'es'));
comment on column calendar_private.reservations.supporter_language is
  'Donor-chosen confirmation language. NULL = unknown: no confirmation may be enqueued. '
  'Set by reserve() (2B) or once by record_supporter_language() with evidence. Never inferred.';

create table calendar_private.notification_policy (
  singleton boolean primary key default true check (singleton),
  max_attempts smallint not null check (max_attempts between 1 and 10),
  lease_interval interval not null check (lease_interval between interval '10 seconds' and interval '15 minutes'),
  retry_base interval not null check (retry_base >= interval '1 second'),
  retry_cap interval not null,
  provider_idempotency_window interval not null check (provider_idempotency_window >= interval '0'),
  idempotency_safety_margin interval not null check (idempotency_safety_margin >= interval '0'),
  payload_retention interval not null check (payload_retention between interval '1 day' and interval '400 days'),
  -- MFA for reviewers and the two-person restart are fixed in code (Marc's decisions), not settings.
  restart_request_ttl interval not null default interval '7 days'
    check (restart_request_ttl between interval '1 hour' and interval '30 days'),
  updated_at timestamptz not null default clock_timestamp(),
  check (retry_cap >= retry_base),
  check (provider_idempotency_window = interval '0'
         or provider_idempotency_window > lease_interval + idempotency_safety_margin)
);
insert into calendar_private.notification_policy
  (max_attempts, lease_interval, retry_base, retry_cap,
   provider_idempotency_window, idempotency_safety_margin, payload_retention)
values (5, interval '2 minutes', interval '30 seconds', interval '1 hour',
        interval '0', interval '1 hour', interval '30 days');

-- K1: Supabase Vault is required. Abort the migration if it is absent, so there is
-- no silent downgrade; the question goes back to the director.
do $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault (vault.decrypted_secrets) is required for calendar outbox fingerprints';
  end if;
end $$;

-- Versioned fingerprint keys. Only the Vault secret NAME is stored here; the secret itself
-- lives in Supabase Vault and is never in a migration, in Git or in an app environment variable.
create table calendar_private.notification_fingerprint_keys (
  version integer primary key check (version >= 1),
  vault_secret_name text not null unique check (vault_secret_name ~ '^calendar_outbox_fp_v[0-9]+$'),
  created_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz,
  retired_at timestamptz,
  check (retired_at is null or (activated_at is not null and retired_at >= activated_at))
);
-- At most one active key.
create unique index calendar_fp_one_active on calendar_private.notification_fingerprint_keys ((true))
  where activated_at is not null and retired_at is null;
-- Key versions are never deleted (rows keep referencing them).
create trigger calendar_fp_keys_no_delete before delete
  on calendar_private.notification_fingerprint_keys for each row execute function public.prevent_ledger_mutation();

create table calendar_private.notification_outbox (
  key text primary key,
  kind text not null check (kind = 'calendar_donor_confirmation'),
  mode text not null check (mode = 'test'),
  organization_id uuid not null,
  campaign_id uuid not null,
  participant_id uuid not null,
  reservation_id uuid not null unique,

  -- Payload (cleared by purge).
  recipient text check (recipient is null or length(recipient) between 3 and 254),
  subject text check (subject is null or length(subject) between 1 and 300),
  text_body text check (text_body is null or length(text_body) between 1 and 20000),
  html_body text check (html_body is null or length(html_body) between 1 and 100000),
  -- Unsalted Batch 1 digests, DB-computed (cleared by purge).
  facts_digest text check (facts_digest is null or facts_digest ~ '^[0-9a-f]{64}$'),
  content_digest text check (content_digest is null or content_digest ~ '^[0-9a-f]{64}$'),

  -- Kept for the life of the row.
  language text not null check (language in ('en', 'es')),
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  template_version text not null
    check (template_version ~ '^calendar-donor-confirmation/[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'),
  fingerprint_salt text not null check (length(fingerprint_salt) = 36),
  fingerprint_key_version integer not null references calendar_private.notification_fingerprint_keys (version),
  facts_fingerprint text not null check (facts_fingerprint ~ '^[0-9a-f]{64}$'),
  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),

  state text not null default 'PENDING'
    check (state in ('PENDING', 'SENDING', 'SENT', 'DELIVERY_UNCERTAIN', 'DEAD_LETTER')),
  next_attempt_at timestamptz,
  lease_id uuid unique,
  lease_worker_id text check (lease_worker_id is null or lease_worker_id ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  lease_expires_at timestamptz,
  epoch integer not null default 1 check (epoch >= 1),
  epoch_started_at timestamptz,
  epoch_attempts smallint not null default 0 check (epoch_attempts >= 0),
  epoch_unknown_outcome boolean not null default false,
  epoch_provider_account text
    check (epoch_provider_account is null or epoch_provider_account ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  total_attempts integer not null default 0,
  provider_message_id text
    check (provider_message_id is null or provider_message_id ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  sent_at timestamptz,
  sent_after_refund boolean not null default false,
  hold_reason text check (hold_reason is null or hold_reason in (
    'no_provider_idempotency', 'unknown_outcome_attempts_exhausted',
    'unknown_outcome_outside_idempotency_window', 'idempotency_window_elapsed_before_retry',
    'provider_changed_after_unknown_outcome', 'retry_exhausted', 'rejected_permanent',
    'abandoned_after_review', 'reservation_no_longer_paid', 'stored_payload_integrity_failure')),
  restart_request_id uuid,
  restart_requested_by uuid,
  restart_requested_at timestamptz,
  payload_purged_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  foreign key (reservation_id, organization_id, campaign_id, participant_id)
    references calendar_private.reservations (id, organization_id, campaign_id, participant_id),
  check (key = 'calendar:test:' || organization_id::text || ':' || reservation_id::text
               || ':donor-confirmation:v1'),
  check (total_attempts >= epoch_attempts),
  check ((state = 'SENDING') = (lease_id is not null and lease_worker_id is not null and lease_expires_at is not null)),
  check ((state = 'PENDING') = (next_attempt_at is not null)),
  check ((state = 'SENT') = (provider_message_id is not null and sent_at is not null)),
  check ((state in ('DELIVERY_UNCERTAIN', 'DEAD_LETTER')) = (hold_reason is not null)),
  check (not sent_after_refund or state = 'SENT'),
  check ((restart_request_id is null) = (restart_requested_by is null)
         and (restart_request_id is null) = (restart_requested_at is null)),
  check (restart_request_id is null or state = 'DELIVERY_UNCERTAIN'),
  check (payload_purged_at is null or state in ('SENT', 'DEAD_LETTER')),
  check ((payload_purged_at is null) =
         (recipient is not null and subject is not null and text_body is not null
          and html_body is not null and facts_digest is not null and content_digest is not null))
);

create index calendar_outbox_due_idx on calendar_private.notification_outbox (next_attempt_at, created_at, key)
  where state = 'PENDING';
create index calendar_outbox_lease_idx on calendar_private.notification_outbox (lease_expires_at)
  where state = 'SENDING';
create index calendar_outbox_org_state_idx on calendar_private.notification_outbox (organization_id, state);

create table calendar_private.notification_events (
  id bigint generated always as identity primary key,
  key text not null references calendar_private.notification_outbox (key),
  organization_id uuid not null,
  event_type text not null check (event_type in (
    'ENQUEUED', 'CLAIMED', 'ACCEPTED', 'REJECTED_PERMANENT', 'REJECTED_RETRYABLE', 'UNKNOWN',
    'LEASE_EXPIRED', 'HELD', 'RESOLVED', 'RESTART_REQUESTED', 'RESTART_APPROVED', 'PURGED')),
  epoch integer not null,
  attempt smallint,
  lease_id uuid,
  worker_id text check (worker_id is null or worker_id ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  provider_account text check (provider_account is null or provider_account ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  code text check (code is null or code ~ '^[a-z0-9_.-]{1,64}$'),
  reviewer_user_id uuid,
  resolution text check (resolution is null or resolution in
    ('provider_confirmed_accepted', 'provider_confirmed_not_accepted', 'abandon')),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9_]{1,64}$'),
  evidence_kind text check (evidence_kind is null or evidence_kind in
    ('provider_api_lookup', 'provider_dashboard', 'provider_support_case', 'donor_statement', 'internal_record')),
  evidence_ref text check (evidence_ref is null or evidence_ref ~ '^[A-Za-z0-9._:+/-]{1,128}$'),
  restart_request_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  check ((event_type in ('RESOLVED', 'RESTART_REQUESTED', 'RESTART_APPROVED'))
         = (reviewer_user_id is not null)),
  check (event_type not in ('RESOLVED', 'RESTART_REQUESTED')
         or (reason_code is not null and evidence_kind is not null and evidence_ref is not null))
);
create index calendar_outbox_events_key_idx on calendar_private.notification_events (key, occurred_at);

-- Explicit, expiring reviewer designations (append-only; latest event wins).
create table calendar_private.notification_reviewer_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null,
  event_type text not null check (event_type in ('GRANTED', 'REVOKED')),
  basis text check (basis in ('org_member', 'platform_staff')),
  expires_at timestamptz,
  actor_user_id uuid not null,                                   -- the appointing director (D2e)
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9_]{1,64}$'),
  occurred_at timestamptz not null default clock_timestamp(),
  check ((event_type = 'GRANTED') = (basis is not null and expires_at is not null)),
  check (expires_at is null
         or (expires_at > occurred_at and expires_at <= occurred_at + interval '366 days')),
  check (actor_user_id <> user_id)                               -- no self-designation
);
create index calendar_reviewer_latest_idx
  on calendar_private.notification_reviewer_events (organization_id, user_id, occurred_at desc, id desc);

-- Evidence for languages recorded after checkout (append-only).
create table calendar_private.reservation_language_events (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references calendar_private.reservations (id),
  organization_id uuid not null,
  language text not null check (language in ('en', 'es')),
  evidence_kind text not null check (evidence_kind in ('checkout_record', 'donor_statement', 'internal_record')),
  evidence_ref text not null check (evidence_ref ~ '^[A-Za-z0-9._:+/-]{1,128}$'),
  actor_user_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp()
);

-- D6: TEST recipients that may ever be claimed. Created empty; managed in 2B.
create table calendar_private.test_recipient_allowlist (
  organization_id uuid not null references public.organizations (id),
  recipient text not null check (recipient = lower(btrim(recipient)) and length(recipient) between 3 and 254),
  added_by uuid,
  added_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, recipient)
);

-- Immutability.
create trigger calendar_notification_events_immutable before update or delete
  on calendar_private.notification_events for each row execute function public.prevent_ledger_mutation();
create trigger calendar_reviewer_events_immutable before update or delete
  on calendar_private.notification_reviewer_events for each row execute function public.prevent_ledger_mutation();
create trigger calendar_language_events_immutable before update or delete
  on calendar_private.reservation_language_events for each row execute function public.prevent_ledger_mutation();
-- Outbox rows are never deleted: the sweep would treat a missing row as "never queued".
create trigger calendar_notification_outbox_no_delete before delete
  on calendar_private.notification_outbox for each row execute function public.prevent_ledger_mutation();

do $$
declare t text;
begin
  foreach t in array array['notification_policy', 'notification_outbox', 'notification_events',
                           'notification_reviewer_events', 'reservation_language_events',
                           'test_recipient_allowlist', 'notification_fingerprint_keys'] loop
    execute format('alter table calendar_private.%I enable row level security', t);
    execute format('revoke all on calendar_private.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
-- No policies, by design: default deny for any role ever granted access by mistake.

-- One JSON string element, as ECMAScript JSON.stringify writes it (verified by golden vectors).
create function calendar_private.outbox_json_string(p text)
returns text language sql immutable strict set search_path = '' as $$
  select to_json(p)::text;
$$;

create function calendar_private.outbox_sha256_hex(p text)
returns text language sql immutable strict set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- Facts array (15 elements). Plain || so ANY null input yields NULL (no silent shift).
create function calendar_private.outbox_facts_canonical(
  p_key text, p_org uuid, p_campaign uuid, p_participant uuid, p_reservation uuid,
  p_recipient text, p_language text, p_days integer[], p_multiplier integer,
  p_base bigint, p_additional bigint, p_total bigint)
returns text language sql immutable set search_path = '' as $$
  select '['
    || calendar_private.outbox_json_string(p_key) || ','
    || '"calendar_donor_confirmation","test",'
    || calendar_private.outbox_json_string(p_org::text) || ','
    || calendar_private.outbox_json_string(p_campaign::text) || ','
    || calendar_private.outbox_json_string(p_participant::text) || ','
    || calendar_private.outbox_json_string(p_reservation::text) || ','
    || calendar_private.outbox_json_string(p_recipient) || ','
    || calendar_private.outbox_json_string(p_language) || ','
    || '"usd",'
    || '[' || array_to_string(p_days, ',') || '],'
    || p_multiplier::text || ',' || p_base::text || ',' || p_additional::text || ',' || p_total::text
    || ']';
$$;

create function calendar_private.outbox_content_canonical(
  p_template text, p_subject text, p_text text, p_html text)
returns text language sql immutable set search_path = '' as $$
  select '[' || calendar_private.outbox_json_string(p_template) || ','
             || calendar_private.outbox_json_string(p_subject) || ','
             || calendar_private.outbox_json_string(p_text) || ','
             || calendar_private.outbox_json_string(p_html) || ']';
$$;

-- Key material for one version, from Supabase Vault.
-- KEY FORMAT (the only one accepted): canonical padded Base64 of exactly 32 random bytes,
-- i.e. 44 characters, 42 Base64 characters + one of [AEIMQUYcgkosw048] + '='.
-- The DECODED 32 bytes are the HMAC key; the Base64 text never is.
-- Returns NULL (callers fail closed) when the version is unknown or never activated, the
-- secret is missing, malformed, non-canonical, not decodable, or does not decode to 32 bytes.
create function calendar_private.outbox_fingerprint_key(p_version integer)
returns bytea language plpgsql stable security definer set search_path = '' as $$
declare
  v_secret text;
  v_key bytea;
begin
  select s.decrypted_secret into v_secret
  from calendar_private.notification_fingerprint_keys k
  join vault.decrypted_secrets s on s.name = k.vault_secret_name
  where k.version = p_version and k.activated_at is not null;
  if v_secret is null or v_secret !~ '^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$' then
    return null;
  end if;
  begin
    v_key := decode(v_secret, 'base64');
  exception when others then
    return null;
  end;
  if v_key is null or octet_length(v_key) <> 32 then
    return null;
  end if;
  return v_key;
end $$;

create function calendar_private.outbox_active_fingerprint_key_version()
returns integer language sql stable security definer set search_path = '' as $$
  select version from calendar_private.notification_fingerprint_keys
  where activated_at is not null and retired_at is null;
$$;

-- Keyed, per-row-salted fingerprint: HMAC-SHA256(K_v, salt || ':' || canonical).
-- pgcrypto's hmac() is strict, so a missing key yields NULL and every caller FAILS CLOSED on NULL.
create function calendar_private.outbox_fingerprint(p_key_version integer, p_salt text, p_canonical text)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(convert_to(p_salt || ':' || p_canonical, 'UTF8'),
                                calendar_private.outbox_fingerprint_key(p_key_version), 'sha256'), 'hex');
$$;

-- Batch 1 calendarProviderIdempotencyKey(): 'afc-cal-' + 48 hex of sha256('<key>#epoch-<n>').
create function calendar_private.outbox_provider_key(p_key text, p_epoch integer)
returns text language sql immutable strict set search_path = '' as $$
  select 'afc-cal-' || left(calendar_private.outbox_sha256_hex(p_key || '#epoch-' || p_epoch), 48);
$$;

-- Canonical facts of a STORED row (used by claim's integrity re-check). NULL after purge.
create function calendar_private.outbox_row_facts_canonical(o calendar_private.notification_outbox)
returns text language sql immutable set search_path = '' as $$
  select calendar_private.outbox_facts_canonical(
    o.key, o.organization_id, o.campaign_id, o.participant_id, o.reservation_id,
    o.recipient, o.language,
    array(select e.value::integer
          from jsonb_array_elements_text(o.facts->'days') with ordinality as e(value, n) order by e.n),
    (o.facts->>'multiplier')::integer, (o.facts->>'baseCents')::bigint,
    (o.facts->>'additionalImpactCents')::bigint, (o.facts->>'totalCents')::bigint);
$$;

create function calendar_private.outbox_status(o calendar_private.notification_outbox)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('key', o.key, 'state', o.state, 'epoch', o.epoch,
    'epochAttempts', o.epoch_attempts, 'totalAttempts', o.total_attempts,
    'nextAttemptAt', o.next_attempt_at, 'holdReason', o.hold_reason,
    'templateVersion', o.template_version, 'sentAfterRefund', o.sent_after_refund,
    'restartPending', o.restart_request_id is not null);
$$;

-- Calendar functions rely on READ COMMITTED (unlocked status reads see the latest commit).
create function calendar_private.outbox_require_read_committed()
returns void language plpgsql stable set search_path = '' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'INVALID_TRANSITION' using errcode = '25000';
  end if;
end $$;

-- D2e enforcement at write time: an appointer cannot be granted reviewer rights in the
-- organization, and a user who is (or ever was) granted reviewer rights there cannot act
-- as an appointer for it. Applies to every insert, including future 2B management paths.
create function calendar_private.enforce_reviewer_appointer_separation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.event_type = 'GRANTED' and exists (
       select 1 from calendar_private.notification_reviewer_events a
       where a.organization_id = new.organization_id and a.actor_user_id = new.user_id) then
    raise exception 'APPOINTER_CANNOT_REVIEW' using errcode = '23514';
  end if;
  if exists (
       select 1 from calendar_private.notification_reviewer_events g
       where g.organization_id = new.organization_id and g.user_id = new.actor_user_id
         and g.event_type = 'GRANTED') then
    raise exception 'REVIEWER_CANNOT_APPOINT' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger calendar_reviewer_appointer_separation before insert
  on calendar_private.notification_reviewer_events
  for each row execute function calendar_private.enforce_reviewer_appointer_separation();

-- Explicit, org-scoped designation of a NAMED user (no session claims).
-- NEVER uses has_org_permission / is_platform_admin. Reads live membership and status.
create function calendar_private.is_designated_reviewer(p_organization_id uuid, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare g calendar_private.notification_reviewer_events;
begin
  if p_user_id is null or p_organization_id is null then return false; end if;
  select * into g from calendar_private.notification_reviewer_events
    where organization_id = p_organization_id and user_id = p_user_id
    order by occurred_at desc, id desc limit 1;
  if not found or g.event_type <> 'GRANTED' or g.expires_at <= clock_timestamp() then return false; end if;
  -- D2e (director decision 2026-11-09): reviewer appointers are never notification
  -- reviewers for the same organization, even if a designation row exists.
  if exists (select 1 from calendar_private.notification_reviewer_events a
             where a.organization_id = p_organization_id and a.actor_user_id = p_user_id) then
    return false;
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
    return false;
  end if;
  if g.basis = 'org_member' then
    return exists (select 1 from public.organization_members m
                   where m.organization_id = p_organization_id and m.user_id = p_user_id and m.status = 'active');
  elsif g.basis = 'platform_staff' then
    return exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id);
  end if;
  return false;
end $$;

-- The CALLER is a reviewer of this organization: session identity, MFA (fixed), designation.
create function calendar_private.is_notification_reviewer(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and coalesce(auth.jwt()->>'aal', '') = 'aal2'
     and calendar_private.is_designated_reviewer(p_organization_id, auth.uid());
$$;

-- Mirror one decision into the org's hash-chained audit trail. Always the LAST lock taken (§17.1).
-- 1:1 link to its source event; no donor data; includes the platform's audit_context().
create function calendar_private.outbox_audit(
  p_org uuid, p_action text, p_reservation uuid, p_source text, p_source_event_id bigint, p_metadata jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_source not in ('notification_events', 'reservation_language_events') or p_source_event_id is null then
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, auth.uid(), p_action, 'calendar_notification', p_reservation,
          p_metadata || jsonb_build_object('source', p_source, 'source_event_id', p_source_event_id)
                     || public.audit_context());
end $$;

create function calendar_private.outbox_hold(p_key text, p_reason text, p_now timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare o calendar_private.notification_outbox;
begin
  update calendar_private.notification_outbox set
    state = 'DELIVERY_UNCERTAIN', next_attempt_at = null, hold_reason = p_reason,
    lease_id = null, lease_worker_id = null, lease_expires_at = null, updated_at = p_now
  where key = p_key and state in ('PENDING', 'SENDING')
  returning * into o;
  if found then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, code)
    values (o.key, o.organization_id, 'HELD', o.epoch, p_reason);
  end if;
end $$;

-- Unknown outcome (ack 'unknown' or lease expiry). Caller holds the outbox row lock.
-- Refund-aware: a non-PAID reservation is held for review (unlocked read; see §6.2).
create function calendar_private.outbox_after_unknown(p_key text, p_now timestamptz)
returns calendar_private.notification_outbox
language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_status text;
  v_next timestamptz;
  v_hold text;
begin
  select * into strict pol from calendar_private.notification_policy;
  select * into strict o from calendar_private.notification_outbox where key = p_key;
  select status into v_status from calendar_private.reservations where id = o.reservation_id;

  if v_status is distinct from 'PAID' then
    v_hold := 'reservation_no_longer_paid';
  elsif pol.provider_idempotency_window = interval '0' then
    v_hold := 'no_provider_idempotency';
  elsif o.epoch_attempts >= pol.max_attempts then
    v_hold := 'unknown_outcome_attempts_exhausted';
  else
    v_next := p_now + least(pol.retry_cap, pol.retry_base * power(2, greatest(o.epoch_attempts - 1, 0)));
    if v_next + pol.idempotency_safety_margin > o.epoch_started_at + pol.provider_idempotency_window then
      v_hold := 'unknown_outcome_outside_idempotency_window';
    end if;
  end if;

  update calendar_private.notification_outbox set
    epoch_unknown_outcome = true,
    lease_id = null, lease_worker_id = null, lease_expires_at = null,
    state = case when v_hold is null then 'PENDING' else 'DELIVERY_UNCERTAIN' end,
    next_attempt_at = case when v_hold is null then v_next else null end,
    hold_reason = v_hold, updated_at = p_now
  where key = p_key
  returning * into o;
  if v_hold is not null then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, code)
    values (o.key, o.organization_id, 'HELD', o.epoch, v_hold);
  end if;
  return o;
end $$;

create function calendar_private.enqueue_donor_confirmation(p_intent jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r calendar_private.reservations;
  existing calendar_private.notification_outbox;
  v_now timestamptz := clock_timestamp();
  v_key text; v_org uuid; v_campaign uuid; v_participant uuid; v_reservation uuid;
  v_recipient text; v_language text; v_template text; v_subject text; v_text text; v_html text;
  v_in_facts_digest text; v_in_content_digest text;
  v_days integer[]; v_sorted_days integer[];
  v_multiplier integer; v_base bigint; v_additional bigint; v_total bigint;
  v_facts_canonical text; v_content_canonical text; v_salt text;
  v_key_version integer; v_facts_fp text; v_content_fp text;
begin
  -- 1. Strict parse: exact key set, exact JSON types, no coercion.
  begin
    if jsonb_typeof(p_intent) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_intent) k where k not in (
            'key', 'kind', 'mode', 'organizationId', 'campaignId', 'participantId', 'reservationId',
            'recipient', 'language', 'facts', 'templateVersion', 'subject', 'text', 'html',
            'factsDigest', 'contentDigest'))
       or exists (select 1 from jsonb_object_keys(p_intent->'facts') k where k not in (
            'currency', 'days', 'multiplier', 'baseCents', 'additionalImpactCents', 'totalCents'))
       or p_intent->>'kind' is distinct from 'calendar_donor_confirmation'
       or p_intent->>'mode' is distinct from 'test'
       or p_intent->'facts'->>'currency' is distinct from 'usd'
       or jsonb_typeof(p_intent->'facts'->'days') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_intent->'facts'->'days') e where jsonb_typeof(e) <> 'number')
       or exists (select 1 from unnest(array['multiplier', 'baseCents', 'additionalImpactCents', 'totalCents']) f
                  where jsonb_typeof(p_intent->'facts'->f) <> 'number')
       or exists (select 1 from unnest(array['key', 'organizationId', 'campaignId', 'participantId', 'reservationId',
                    'recipient', 'language', 'templateVersion', 'subject', 'text', 'html',
                    'factsDigest', 'contentDigest']) f
                  where jsonb_typeof(p_intent->f) is distinct from 'string') then
      raise exception 'INVALID_INTENT' using errcode = '23514';
    end if;
    v_key := p_intent->>'key';
    v_org := (p_intent->>'organizationId')::uuid;
    v_campaign := (p_intent->>'campaignId')::uuid;
    v_participant := (p_intent->>'participantId')::uuid;
    v_reservation := (p_intent->>'reservationId')::uuid;
    v_recipient := p_intent->>'recipient';          -- exact; no normalization (§4.1 rule 6)
    v_language := p_intent->>'language';
    v_template := p_intent->>'templateVersion';
    v_subject := p_intent->>'subject';
    v_text := p_intent->>'text';
    v_html := p_intent->>'html';
    v_in_facts_digest := p_intent->>'factsDigest';
    v_in_content_digest := p_intent->>'contentDigest';
    v_multiplier := (p_intent->'facts'->>'multiplier')::integer;
    v_base := (p_intent->'facts'->>'baseCents')::bigint;
    v_additional := (p_intent->'facts'->>'additionalImpactCents')::bigint;
    v_total := (p_intent->'facts'->>'totalCents')::bigint;
    select array_agg(e.value::integer order by e.n) into v_days     -- order AS GIVEN
      from jsonb_array_elements_text(p_intent->'facts'->'days') with ordinality as e(value, n);
  exception when others then
    raise exception 'INVALID_INTENT' using errcode = '23514';
  end;

  -- 2. Lock the reservation (the only lock taken before the outbox row; §6.2).
  select * into r from calendar_private.reservations where id = v_reservation for share;
  if not found or r.status <> 'PAID' or r.organization_id <> v_org
     or r.campaign_id <> v_campaign or r.participant_id <> v_participant then
    raise exception 'SCOPE_MISMATCH' using errcode = '23514';
  end if;
  if r.supporter_language is null then
    raise exception 'INVALID_PAID_RECORD' using errcode = '23514';        -- D4: fail closed
  end if;
  select array_agg(d order by d) into v_sorted_days from unnest(r.days) as d;

  -- 3. Every fact must equal the committed reservation exactly.
  if v_key is distinct from 'calendar:test:' || r.organization_id::text || ':' || r.id::text || ':donor-confirmation:v1'
     or v_recipient is distinct from r.supporter_email
     or v_language is distinct from r.supporter_language
     or v_days is distinct from v_sorted_days
     or v_multiplier is distinct from r.multiplier
     or v_base is distinct from r.base_cents
     or v_additional is distinct from r.additional_impact_cents
     or v_total is distinct from r.total_cents then
    raise exception 'SCOPE_MISMATCH' using errcode = '23514';
  end if;

  -- 4. The DB computes the canonical forms (facts from the RESERVATION) and both digests.
  v_facts_canonical := calendar_private.outbox_facts_canonical(
    v_key, r.organization_id, r.campaign_id, r.participant_id, r.id, r.supporter_email,
    r.supporter_language, v_sorted_days, r.multiplier, r.base_cents, r.additional_impact_cents, r.total_cents);
  v_content_canonical := calendar_private.outbox_content_canonical(v_template, v_subject, v_text, v_html);
  if v_facts_canonical is null or v_content_canonical is null
     or calendar_private.outbox_sha256_hex(v_facts_canonical) is distinct from v_in_facts_digest
     or calendar_private.outbox_sha256_hex(v_content_canonical) is distinct from v_in_content_digest then
    raise exception 'INVALID_INTENT' using errcode = '23514';             -- tamper or drift
  end if;

  -- 5. Atomic insert-once with DB-computed digests and KEYED, per-row salted fingerprints.
  --    No active key, or an unreadable key: fail closed (nothing queued).
  v_salt := gen_random_uuid()::text;
  v_key_version := calendar_private.outbox_active_fingerprint_key_version();
  v_facts_fp := calendar_private.outbox_fingerprint(v_key_version, v_salt, v_facts_canonical);
  v_content_fp := calendar_private.outbox_fingerprint(v_key_version, v_salt, v_content_canonical);
  if v_key_version is null or v_facts_fp is null or v_content_fp is null then
    raise exception 'FINGERPRINT_KEY_UNAVAILABLE' using errcode = '55000';
  end if;
  begin
    insert into calendar_private.notification_outbox (
      key, kind, mode, organization_id, campaign_id, participant_id, reservation_id,
      recipient, subject, text_body, html_body, facts_digest, content_digest,
      language, facts, template_version, fingerprint_salt, fingerprint_key_version,
      facts_fingerprint, content_fingerprint,
      state, next_attempt_at, created_at, updated_at)
    values (
      v_key, 'calendar_donor_confirmation', 'test', r.organization_id, r.campaign_id, r.participant_id, r.id,
      r.supporter_email, v_subject, v_text, v_html,
      calendar_private.outbox_sha256_hex(v_facts_canonical), calendar_private.outbox_sha256_hex(v_content_canonical),
      r.supporter_language,
      jsonb_build_object('currency', 'usd', 'days', to_jsonb(v_sorted_days), 'multiplier', r.multiplier,
        'baseCents', r.base_cents, 'additionalImpactCents', r.additional_impact_cents, 'totalCents', r.total_cents),
      v_template, v_salt, v_key_version, v_facts_fp, v_content_fp,
      'PENDING', v_now, v_now, v_now)
    on conflict (key) do nothing;
  exception when check_violation or not_null_violation or string_data_right_truncation then
    raise exception 'INVALID_INTENT' using errcode = '23514';
  end;
  if found then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch)
    values (v_key, r.organization_id, 'ENQUEUED', 1);
    return jsonb_build_object('key', v_key, 'status', 'queued');
  end if;

  -- 6. Replay: compare KEYED fingerprints with the row's OWN key version (works before and
  --    after purge; §8). If that key is unavailable, fail closed: never guess "already_queued".
  select * into strict existing from calendar_private.notification_outbox where key = v_key for update;
  v_facts_fp := calendar_private.outbox_fingerprint(existing.fingerprint_key_version, existing.fingerprint_salt, v_facts_canonical);
  v_content_fp := calendar_private.outbox_fingerprint(existing.fingerprint_key_version, existing.fingerprint_salt, v_content_canonical);
  if v_facts_fp is null or v_content_fp is null then
    raise exception 'FINGERPRINT_KEY_UNAVAILABLE' using errcode = '55000';
  end if;
  if v_facts_fp <> existing.facts_fingerprint
     or (existing.template_version = v_template and v_content_fp <> existing.content_fingerprint) then
    raise exception 'PAYLOAD_CONFLICT' using errcode = '23514';
  end if;
  return jsonb_build_object('key', v_key, 'status', 'already_queued');
end $$;

create function calendar_private.claim_donor_confirmation(p_worker_id text, p_provider_account text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_now timestamptz := clock_timestamp();
  v_lease uuid;
  v_status text;
  i integer := 0;
begin
  perform calendar_private.outbox_require_read_committed();
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9._:@<>+-]{1,256}$'
     or p_provider_account is null or p_provider_account !~ '^[A-Za-z0-9._:@<>+-]{1,256}$' then
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  select * into strict pol from calendar_private.notification_policy;

  while i < 25 loop
    i := i + 1;
    select ob.* into o from calendar_private.notification_outbox ob
      where ob.state = 'PENDING' and ob.next_attempt_at <= v_now
        and exists (select 1 from calendar_private.test_recipient_allowlist a       -- D6
                    where a.organization_id = ob.organization_id and a.recipient = ob.recipient)
      order by ob.next_attempt_at, ob.created_at, ob.key
      for update of ob skip locked
      limit 1;
    if not found then return null; end if;

    -- D3 refund check: plain read, no reservation lock (§6.2).
    select status into v_status from calendar_private.reservations where id = o.reservation_id;
    if v_status is distinct from 'PAID' then
      perform calendar_private.outbox_hold(o.key, 'reservation_no_longer_paid', v_now);
      continue;
    end if;

    -- Integrity: the stored payload must still hash to the DB-computed digests.
    if calendar_private.outbox_sha256_hex(calendar_private.outbox_row_facts_canonical(o)) is distinct from o.facts_digest
       or calendar_private.outbox_sha256_hex(calendar_private.outbox_content_canonical(
            o.template_version, o.subject, o.text_body, o.html_body)) is distinct from o.content_digest then
      perform calendar_private.outbox_hold(o.key, 'stored_payload_integrity_failure', v_now);
      continue;
    end if;

    -- Claim-time recheck after an unknown outcome (window anchored to epoch start).
    if o.epoch_unknown_outcome then
      if pol.provider_idempotency_window = interval '0'
         or v_now + pol.lease_interval + pol.idempotency_safety_margin
              > o.epoch_started_at + pol.provider_idempotency_window then
        perform calendar_private.outbox_hold(o.key, 'idempotency_window_elapsed_before_retry', v_now);
        continue;
      end if;
      if o.epoch_provider_account is distinct from p_provider_account then
        perform calendar_private.outbox_hold(o.key, 'provider_changed_after_unknown_outcome', v_now);
        continue;
      end if;
    end if;

    v_lease := gen_random_uuid();
    update calendar_private.notification_outbox set
      state = 'SENDING', next_attempt_at = null,
      lease_id = v_lease, lease_worker_id = p_worker_id, lease_expires_at = v_now + pol.lease_interval,
      epoch_started_at = coalesce(epoch_started_at, v_now),
      epoch_attempts = epoch_attempts + 1, epoch_provider_account = p_provider_account,
      total_attempts = total_attempts + 1, updated_at = v_now
    where key = o.key
    returning * into o;
    insert into calendar_private.notification_events
      (key, organization_id, event_type, epoch, attempt, lease_id, worker_id, provider_account)
    values (o.key, o.organization_id, 'CLAIMED', o.epoch, o.epoch_attempts, v_lease, p_worker_id, p_provider_account);

    return jsonb_build_object(
      'key', o.key, 'leaseId', v_lease, 'leaseExpiresAt', o.lease_expires_at,
      'epoch', o.epoch, 'attempt', o.epoch_attempts,
      'providerIdempotencyKey', calendar_private.outbox_provider_key(o.key, o.epoch),
      'delivery', jsonb_build_object('recipient', o.recipient, 'subject', o.subject,
                                     'text', o.text_body, 'html', o.html_body));
  end loop;
  return null;
end $$;

create function calendar_private.acknowledge_donor_confirmation(
  p_key text, p_lease_id uuid, p_outcome text,
  p_provider_message_id text default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_now timestamptz := clock_timestamp();
  v_code text := case when p_code ~ '^[a-z0-9_.-]{1,64}$' then p_code else 'unspecified' end;
  v_attempt smallint;
  v_status text;
begin
  perform calendar_private.outbox_require_read_committed();
  select * into strict pol from calendar_private.notification_policy;
  select * into o from calendar_private.notification_outbox where key = p_key for update;
  if not found then raise exception 'NOT_FOUND' using errcode = '23514'; end if;
  if o.state <> 'SENDING' or o.lease_id is distinct from p_lease_id then
    raise exception 'STALE_LEASE' using errcode = '23514';
  end if;
  v_attempt := o.epoch_attempts;
  select status into v_status from calendar_private.reservations where id = o.reservation_id;  -- unlocked

  if p_outcome = 'accepted' then
    if p_provider_message_id is null or p_provider_message_id !~ '^[A-Za-z0-9._:@<>+-]{1,256}$' then
      raise exception 'INVALID_TRANSITION' using errcode = '23514';
    end if;
    update calendar_private.notification_outbox set
      state = 'SENT', provider_message_id = p_provider_message_id, sent_at = v_now,
      sent_after_refund = (v_status is distinct from 'PAID'),
      lease_id = null, lease_worker_id = null, lease_expires_at = null, hold_reason = null, updated_at = v_now
    where key = p_key returning * into o;
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id, code)
    values (o.key, o.organization_id, 'ACCEPTED', o.epoch, v_attempt, p_lease_id,
            case when o.sent_after_refund then 'reservation_refunded_during_send' end);

  elsif p_outcome = 'rejected_permanent' then
    update calendar_private.notification_outbox set
      state = 'DEAD_LETTER', hold_reason = 'rejected_permanent',
      lease_id = null, lease_worker_id = null, lease_expires_at = null, updated_at = v_now
    where key = p_key returning * into o;
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id, code)
    values (o.key, o.organization_id, 'REJECTED_PERMANENT', o.epoch, v_attempt, p_lease_id, v_code);

  elsif p_outcome = 'rejected_retryable' then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id, code)
    values (o.key, o.organization_id, 'REJECTED_RETRYABLE', o.epoch, v_attempt, p_lease_id, v_code);
    if v_status is distinct from 'PAID' then
      perform calendar_private.outbox_hold(p_key, 'reservation_no_longer_paid', v_now);
      select * into strict o from calendar_private.notification_outbox where key = p_key;
    elsif o.epoch_attempts >= pol.max_attempts then
      update calendar_private.notification_outbox set
        state = 'DEAD_LETTER', hold_reason = 'retry_exhausted',
        lease_id = null, lease_worker_id = null, lease_expires_at = null, updated_at = v_now
      where key = p_key returning * into o;
    else
      update calendar_private.notification_outbox set
        state = 'PENDING',
        next_attempt_at = v_now + least(pol.retry_cap, pol.retry_base * power(2, greatest(o.epoch_attempts - 1, 0))),
        lease_id = null, lease_worker_id = null, lease_expires_at = null, updated_at = v_now
      where key = p_key returning * into o;
    end if;

  elsif p_outcome = 'unknown' then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id, code)
    values (o.key, o.organization_id, 'UNKNOWN', o.epoch, v_attempt, p_lease_id, v_code);
    o := calendar_private.outbox_after_unknown(p_key, v_now);               -- refund-aware

  else
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  return calendar_private.outbox_status(o);
end $$;

create function calendar_private.expire_donor_confirmation_leases()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o calendar_private.notification_outbox;
  v_now timestamptz := clock_timestamp();
  v_requeued integer := 0; v_uncertain integer := 0;
begin
  perform calendar_private.outbox_require_read_committed();
  for o in select * from calendar_private.notification_outbox
           where state = 'SENDING' and lease_expires_at <= v_now
           order by lease_expires_at for update skip locked limit 200
  loop
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id)
    values (o.key, o.organization_id, 'LEASE_EXPIRED', o.epoch, o.epoch_attempts, o.lease_id);
    o := calendar_private.outbox_after_unknown(o.key, v_now);     -- never "not sent"; refund-aware
    if o.state = 'PENDING' then v_requeued := v_requeued + 1; else v_uncertain := v_uncertain + 1; end if;
  end loop;
  return jsonb_build_object('requeued', v_requeued, 'uncertain', v_uncertain);
end $$;

create function calendar_private.resolve_donor_confirmation(
  p_key text, p_resolution text, p_reason_code text, p_evidence_kind text, p_evidence_ref text,
  p_expected_epoch integer, p_provider_message_id text default null,
  p_duplicate_risk_acknowledged boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_request uuid;
  v_event_id bigint;
begin
  perform calendar_private.outbox_require_read_committed();
  select * into strict pol from calendar_private.notification_policy;
  select * into o from calendar_private.notification_outbox where key = p_key for update;
  if v_uid is null or not found or not calendar_private.is_notification_reviewer(o.organization_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';             -- same error for every denial
  end if;
  if o.state <> 'DELIVERY_UNCERTAIN' then raise exception 'INVALID_TRANSITION' using errcode = '23514'; end if;
  if p_expected_epoch is distinct from o.epoch then raise exception 'STALE_REVIEW' using errcode = '23514'; end if;
  if p_evidence_ref is null or p_evidence_ref !~ '^[A-Za-z0-9._:+/-]{1,128}$'
     or p_evidence_kind not in ('provider_api_lookup', 'provider_dashboard', 'provider_support_case',
                                'donor_statement', 'internal_record') then
    raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
  end if;

  if p_resolution = 'provider_confirmed_accepted' then
    if p_reason_code is distinct from 'provider_reports_accepted'
       or p_evidence_kind not in ('provider_api_lookup', 'provider_dashboard', 'provider_support_case')
       or p_provider_message_id is null or p_provider_message_id !~ '^[A-Za-z0-9._:@<>+-]{1,256}$' then
      raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
    end if;
    update calendar_private.notification_outbox set
      state = 'SENT', provider_message_id = p_provider_message_id, sent_at = v_now, hold_reason = null,
      restart_request_id = null, restart_requested_by = null, restart_requested_at = null, updated_at = v_now
    where key = p_key returning * into o;

  elsif p_resolution = 'abandon' then
    if p_reason_code not in ('reservation_refunded', 'donor_contacted_directly', 'duplicate_risk_unacceptable',
                             'provider_status_unavailable', 'recipient_invalid', 'integrity_failure') then
      raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
    end if;
    update calendar_private.notification_outbox set
      state = 'DEAD_LETTER', hold_reason = 'abandoned_after_review',
      restart_request_id = null, restart_requested_by = null, restart_requested_at = null, updated_at = v_now
    where key = p_key returning * into o;

  elsif p_resolution = 'provider_confirmed_not_accepted' then
    select status into v_status from calendar_private.reservations where id = o.reservation_id;
    if p_reason_code is distinct from 'provider_reports_not_accepted'
       or p_evidence_kind not in ('provider_api_lookup', 'provider_support_case')
       or p_duplicate_risk_acknowledged is not true then
      raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
    end if;
    if v_status is distinct from 'PAID' or o.hold_reason = 'stored_payload_integrity_failure' then
      raise exception 'INVALID_TRANSITION' using errcode = '23514';
    end if;
    -- Two-person rule (fixed): record the request only; a DIFFERENT reviewer must approve.
    v_request := gen_random_uuid();
    update calendar_private.notification_outbox set
      restart_request_id = v_request, restart_requested_by = v_uid, restart_requested_at = v_now, updated_at = v_now
    where key = p_key returning * into o;
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, reviewer_user_id,
      resolution, reason_code, evidence_kind, evidence_ref, restart_request_id)
    values (o.key, o.organization_id, 'RESTART_REQUESTED', o.epoch, v_uid, p_resolution,
            p_reason_code, p_evidence_kind, p_evidence_ref, v_request)
    returning id into v_event_id;
    perform calendar_private.outbox_audit(o.organization_id, 'CALENDAR_NOTIFICATION_RESTART_REQUESTED', o.reservation_id,
      'notification_events', v_event_id,
      jsonb_build_object('key', o.key, 'from_epoch', o.epoch, 'restart_request_id', v_request,
        'reason_code', p_reason_code, 'evidence_kind', p_evidence_kind, 'evidence_ref', p_evidence_ref));
    return calendar_private.outbox_status(o);                 -- waits for a second reviewer

  else
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;

  insert into calendar_private.notification_events (key, organization_id, event_type, epoch, reviewer_user_id,
    resolution, reason_code, evidence_kind, evidence_ref)
  values (o.key, o.organization_id, 'RESOLVED', o.epoch, v_uid, p_resolution, p_reason_code, p_evidence_kind, p_evidence_ref)
  returning id into v_event_id;
  perform calendar_private.outbox_audit(o.organization_id, 'CALENDAR_NOTIFICATION_RESOLVED', o.reservation_id,
    'notification_events', v_event_id,
    jsonb_build_object('key', o.key, 'epoch', o.epoch, 'resolution', p_resolution, 'reason_code', p_reason_code,
      'evidence_kind', p_evidence_kind, 'evidence_ref', p_evidence_ref));
  return calendar_private.outbox_status(o);
end $$;

create function calendar_private.approve_epoch_restart(
  p_key text, p_restart_request_id uuid, p_expected_epoch integer,
  p_evidence_reviewed boolean, p_duplicate_risk_acknowledged boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_from integer;
  v_event_id bigint;
begin
  perform calendar_private.outbox_require_read_committed();
  select * into strict pol from calendar_private.notification_policy;
  select * into o from calendar_private.notification_outbox where key = p_key for update;
  if v_uid is null or not found or not calendar_private.is_notification_reviewer(o.organization_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if o.state <> 'DELIVERY_UNCERTAIN' or o.restart_request_id is distinct from p_restart_request_id then
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  if o.restart_requested_by = v_uid then
    raise exception 'SECOND_REVIEWER_REQUIRED' using errcode = '42501';   -- two different people
  end if;
  -- The requester must STILL be a current reviewer of this organization (designation,
  -- expiry, live membership or platform-staff status). MFA was checked at request time.
  if not calendar_private.is_designated_reviewer(o.organization_id, o.restart_requested_by) then
    raise exception 'REQUESTER_NO_LONGER_AUTHORIZED' using errcode = '42501';
  end if;
  -- The approver attests to having reviewed the evidence and accepts the duplicate risk.
  if p_evidence_reviewed is not true or p_duplicate_risk_acknowledged is not true then
    raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
  end if;
  if p_expected_epoch is distinct from o.epoch then raise exception 'STALE_REVIEW' using errcode = '23514'; end if;
  if o.restart_requested_at + pol.restart_request_ttl < v_now then
    raise exception 'RESTART_REQUEST_EXPIRED' using errcode = '23514';
  end if;
  select status into v_status from calendar_private.reservations where id = o.reservation_id;
  if v_status is distinct from 'PAID' then raise exception 'INVALID_TRANSITION' using errcode = '23514'; end if;

  v_from := o.epoch;
  update calendar_private.notification_outbox set
    state = 'PENDING', next_attempt_at = v_now, hold_reason = null,
    epoch = epoch + 1, epoch_started_at = null, epoch_attempts = 0,
    epoch_unknown_outcome = false, epoch_provider_account = null,
    restart_request_id = null, restart_requested_by = null, restart_requested_at = null, updated_at = v_now
  where key = p_key returning * into o;
  insert into calendar_private.notification_events (key, organization_id, event_type, epoch, reviewer_user_id, restart_request_id)
  values (o.key, o.organization_id, 'RESTART_APPROVED', o.epoch, v_uid, p_restart_request_id)
  returning id into v_event_id;
  perform calendar_private.outbox_audit(o.organization_id, 'CALENDAR_NOTIFICATION_RESTART_APPROVED', o.reservation_id,
    'notification_events', v_event_id,
    jsonb_build_object('key', o.key, 'from_epoch', v_from, 'to_epoch', o.epoch, 'restart_request_id', p_restart_request_id,
      'evidence_reviewed', true, 'duplicate_risk_acknowledged', true));
  return calendar_private.outbox_status(o);
end $$;

create function calendar_private.record_supporter_language(
  p_reservation_id uuid, p_language text, p_evidence_kind text, p_evidence_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r calendar_private.reservations;
  v_event_id bigint;
begin
  select * into r from calendar_private.reservations where id = p_reservation_id for update;  -- R only, then A
  if auth.uid() is null or not found or not calendar_private.is_notification_reviewer(r.organization_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_language not in ('en', 'es')
     or p_evidence_kind not in ('checkout_record', 'donor_statement', 'internal_record')
     or p_evidence_ref is null or p_evidence_ref !~ '^[A-Za-z0-9._:+/-]{1,128}$' then
    raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
  end if;
  if r.status <> 'PAID' or r.supporter_language is not null then           -- set once; never overwrite
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  update calendar_private.reservations set supporter_language = p_language, updated_at = clock_timestamp()
    where id = r.id;
  insert into calendar_private.reservation_language_events
    (reservation_id, organization_id, language, evidence_kind, evidence_ref, actor_user_id)
  values (r.id, r.organization_id, p_language, p_evidence_kind, p_evidence_ref, auth.uid())
  returning id into v_event_id;
  perform calendar_private.outbox_audit(r.organization_id, 'CALENDAR_SUPPORTER_LANGUAGE_RECORDED', r.id,
    'reservation_language_events', v_event_id,
    jsonb_build_object('language', p_language, 'evidence_kind', p_evidence_kind, 'evidence_ref', p_evidence_ref));
  return jsonb_build_object('reservationId', r.id, 'language', p_language);
end $$;

create function calendar_private.read_donor_confirmation_status(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o calendar_private.notification_outbox;
begin
  select * into o from calendar_private.notification_outbox where key = p_key;
  if not found then return null; end if;
  return calendar_private.outbox_status(o);                          -- donor-free
end $$;

-- Sweep hints for ONE organization; flags missing language. Hints only.
create function calendar_private.list_missing_donor_confirmations(p_organization_id uuid, p_limit integer default 100)
returns table (organization_id uuid, campaign_id uuid, participant_id uuid, reservation_id uuid, language_missing boolean)
language sql stable security definer set search_path = '' as $$
  select r.organization_id, r.campaign_id, r.participant_id, r.id, r.supporter_language is null
  from calendar_private.reservations r
  where r.organization_id = p_organization_id and r.status = 'PAID'
    and not exists (select 1 from calendar_private.notification_outbox o where o.reservation_id = r.id)
  order by r.updated_at, r.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Donor-free backlog counts for an org's reviewers.
create function calendar_private.read_confirmation_backlog(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not calendar_private.is_notification_reviewer(p_organization_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'missingLanguage', (select count(*) from calendar_private.reservations r
       where r.organization_id = p_organization_id and r.status = 'PAID' and r.supporter_language is null
         and not exists (select 1 from calendar_private.notification_outbox o where o.reservation_id = r.id)),
    'missingOther', (select count(*) from calendar_private.reservations r
       where r.organization_id = p_organization_id and r.status = 'PAID' and r.supporter_language is not null
         and not exists (select 1 from calendar_private.notification_outbox o where o.reservation_id = r.id)),
    'oldestMissingSince', (select min(r.updated_at) from calendar_private.reservations r
       where r.organization_id = p_organization_id and r.status = 'PAID'
         and not exists (select 1 from calendar_private.notification_outbox o where o.reservation_id = r.id)),
    'byState', (select coalesce(jsonb_object_agg(s.state, s.n), '{}'::jsonb) from (
       select state, count(*) n from calendar_private.notification_outbox
       where organization_id = p_organization_id group by state) s),
    'heldByReason', (select coalesce(jsonb_object_agg(h.hold_reason, h.n), '{}'::jsonb) from (
       select hold_reason, count(*) n from calendar_private.notification_outbox
       where organization_id = p_organization_id and state = 'DELIVERY_UNCERTAIN' group by hold_reason) h));
end $$;

-- D5: clear payload and UNSALTED digests on final rows after retention; keep fingerprints and history.
create function calendar_private.purge_donor_confirmation_payloads()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  select * into strict pol from calendar_private.notification_policy;
  -- SKIP LOCKED in batches: purge never waits on a row another transaction holds (§17.1).
  with due as (
    select key from calendar_private.notification_outbox
    where state in ('SENT', 'DEAD_LETTER') and payload_purged_at is null
      and updated_at <= v_now - pol.payload_retention
    order by key
    for update skip locked
    limit 500),
  purged as (
    update calendar_private.notification_outbox ob set
      recipient = null, subject = null, text_body = null, html_body = null,
      facts_digest = null, content_digest = null, payload_purged_at = v_now
    from due where ob.key = due.key
    returning ob.key, ob.organization_id, ob.epoch)
  insert into calendar_private.notification_events (key, organization_id, event_type, epoch)
  select key, organization_id, 'PURGED', epoch from purged;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Audit coverage (§17.4): every decision event has exactly one audit row, and every
-- calendar_notification audit row points at an existing decision event. Returns problems only.
create function calendar_private.verify_notification_audit_coverage(p_organization_id uuid)
returns table (source text, source_event_id bigint, problem text)
language sql stable security definer set search_path = '' as $$
  with decisions as (
    select 'notification_events'::text as src, e.id
    from calendar_private.notification_events e
    where e.organization_id = p_organization_id
      and e.event_type in ('RESOLVED', 'RESTART_REQUESTED', 'RESTART_APPROVED')
    union all
    select 'reservation_language_events', l.id
    from calendar_private.reservation_language_events l
    where l.organization_id = p_organization_id),
  raw_audits as (
    -- Never cast unchecked metadata: a malformed id becomes NULL and is reported below.
    select a.id as audit_id,
           a.metadata->>'source' as src,
           case when a.metadata->>'source_event_id' ~ '^[1-9][0-9]{0,17}$'
                then (a.metadata->>'source_event_id')::bigint end as id
    from public.audit_events a
    where a.organization_id = p_organization_id and a.entity_type = 'calendar_notification'),
  audits as (
    select src, id, count(*) as n from raw_audits
    where id is not null and src in ('notification_events', 'reservation_language_events')
    group by src, id)
  select coalesce(d.src, a.src), coalesce(d.id, a.id),
         case when a.id is null then 'missing_audit_event'
              when d.id is null then 'audit_event_without_source'
              else 'duplicate_audit_event' end
  from decisions d
  full join audits a on a.src = d.src and a.id = d.id
  where a.id is null or d.id is null or a.n <> 1
  union all
  -- Malformed rows are reported, never silently dropped. A decision whose only audit row
  -- is malformed is ALSO reported above as missing_audit_event, so no gap is hidden.
  select r.src, null::bigint, 'malformed_audit_metadata'
  from raw_audits r
  where r.id is null or r.src is null or r.src not in ('notification_events', 'reservation_language_events');
$$;

revoke all on function
  calendar_private.outbox_json_string(text), calendar_private.outbox_sha256_hex(text),
  calendar_private.outbox_facts_canonical(text, uuid, uuid, uuid, uuid, text, text, integer[], integer, bigint, bigint, bigint),
  calendar_private.outbox_content_canonical(text, text, text, text),
  calendar_private.outbox_fingerprint_key(integer), calendar_private.outbox_active_fingerprint_key_version(),
  calendar_private.outbox_fingerprint(integer, text, text), calendar_private.outbox_provider_key(text, integer),
  calendar_private.outbox_row_facts_canonical(calendar_private.notification_outbox),
  calendar_private.outbox_status(calendar_private.notification_outbox),
  calendar_private.outbox_require_read_committed(),
  calendar_private.enforce_reviewer_appointer_separation(),
  calendar_private.is_designated_reviewer(uuid, uuid),
  calendar_private.is_notification_reviewer(uuid),
  calendar_private.outbox_audit(uuid, text, uuid, text, bigint, jsonb),
  calendar_private.outbox_hold(text, text, timestamptz),
  calendar_private.outbox_after_unknown(text, timestamptz),
  calendar_private.enqueue_donor_confirmation(jsonb),
  calendar_private.claim_donor_confirmation(text, text),
  calendar_private.acknowledge_donor_confirmation(text, uuid, text, text, text),
  calendar_private.expire_donor_confirmation_leases(),
  calendar_private.resolve_donor_confirmation(text, text, text, text, text, integer, text, boolean),
  calendar_private.approve_epoch_restart(text, uuid, integer, boolean, boolean),
  calendar_private.record_supporter_language(uuid, text, text, text),
  calendar_private.read_donor_confirmation_status(text),
  calendar_private.list_missing_donor_confirmations(uuid, integer),
  calendar_private.read_confirmation_backlog(uuid),
  calendar_private.purge_donor_confirmation_payloads(),
  calendar_private.verify_notification_audit_coverage(uuid)
from public, anon, authenticated, service_role;
