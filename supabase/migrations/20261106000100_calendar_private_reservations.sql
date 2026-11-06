-- Aspire South Calendar: isolated reservation engine (staging-only, no public RPC).
-- This schema is intentionally outside PostgREST's exposed schemas.
-- No paid reservation may be created by a browser or by an unverified redirect.
-- Existing raffle tables, sale ledger and PR #15 link recovery are untouched.

create schema if not exists calendar_private;
revoke all on schema calendar_private from public, anon, authenticated, service_role;
alter default privileges in schema calendar_private revoke execute on functions from public;

create table calendar_private.campaign_config (
  campaign_id uuid primary key,
  organization_id uuid not null,
  mode text not null default 'supporter_choice'
    check (mode in ('supporter_choice', 'fixed')),
  fixed_multiplier smallint not null default 1 check (fixed_multiplier between 1 and 5),
  enabled boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id)
);

-- Quote and selection are snapshots. The day number is the base price in USD.
-- This function is internal only: actual checkout amounts must be recomputed
-- in the trusted reservation/checkout flow, never accepted from a browser.
create function calendar_private.valid_days(p_days integer[])
returns boolean language sql immutable set search_path = '' as $$
  select p_days is not null and cardinality(p_days) between 1 and 31
    and not exists (
      select 1 from unnest(p_days) d(day)
      where day is null or day not between 1 and 31
    )
    and (select count(distinct day) from unnest(p_days) d(day)) = cardinality(p_days);
$$;

create table calendar_private.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  participant_id uuid not null,
  request_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  supporter_name text not null check (length(btrim(supporter_name)) between 1 and 200),
  supporter_email text not null check (length(supporter_email) between 3 and 254),
  days integer[] not null check (calendar_private.valid_days(days)),
  multiplier smallint not null check (multiplier between 1 and 5),
  base_cents bigint not null check (base_cents between 100 and 49600),
  additional_impact_cents bigint not null check (additional_impact_cents >= 0),
  total_cents bigint not null check (total_cents between 100 and 248000),
  status text not null default 'HELD'
    check (status in ('HELD', 'CHECKOUT_PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED')),
  expires_at timestamptz not null,
  checkout_session_id text unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (participant_id, request_key),
  unique (id, organization_id, campaign_id, participant_id),
  foreign key (participant_id, organization_id, campaign_id)
    references public.campaign_participants(id, organization_id, campaign_id),
  check (additional_impact_cents = base_cents * (multiplier - 1)),
  check (total_cents = base_cents + additional_impact_cents),
  check (status <> 'HELD' or checkout_session_id is null),
  check (status not in ('CHECKOUT_PENDING', 'PAID', 'REFUNDED') or checkout_session_id is not null)
);

create index calendar_reservation_expiry_idx
  on calendar_private.reservations(participant_id, expires_at)
  where status = 'HELD';

create table calendar_private.reservation_days (
  reservation_id uuid not null,
  organization_id uuid not null,
  campaign_id uuid not null,
  participant_id uuid not null,
  day_no smallint not null check (day_no between 1 and 31),
  state text not null default 'HELD'
    check (state in ('HELD', 'CHECKOUT_PENDING', 'PAID', 'RELEASED', 'REFUNDED')),
  primary key (reservation_id, day_no),
  foreign key (reservation_id, organization_id, campaign_id, participant_id)
    references calendar_private.reservations(id, organization_id, campaign_id, participant_id)
);

-- PostgreSQL, not a browser read-before-write, enforces exclusive day inventory.
-- An expired (and released) day can be claimed again. Paid days stay occupied.
create unique index calendar_one_active_sponsor_per_day
  on calendar_private.reservation_days(participant_id, day_no)
  where state in ('HELD', 'CHECKOUT_PENDING', 'PAID', 'REFUNDED');

create table calendar_private.reservation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  organization_id uuid not null,
  campaign_id uuid not null,
  participant_id uuid not null,
  event_type text not null check (event_type in
    ('HELD', 'EXPIRED', 'CANCELLED', 'CHECKOUT_PENDING', 'PAID', 'REFUNDED')),
  multiplier smallint not null check (multiplier between 1 and 5),
  base_cents bigint not null check (base_cents between 100 and 49600),
  additional_impact_cents bigint not null check (additional_impact_cents >= 0),
  total_cents bigint not null check (total_cents = base_cents + additional_impact_cents),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (reservation_id, organization_id, campaign_id, participant_id)
    references calendar_private.reservations(id, organization_id, campaign_id, participant_id)
);

create index calendar_events_reservation_idx
  on calendar_private.reservation_events(reservation_id, occurred_at);

-- Private financial/PII tables have no direct API access, including service-role
-- Data API access. Only explicitly reviewed server-side integration may expose
-- a tightly scoped function later; this branch does not do that.
do $$
declare t text;
begin
  foreach t in array array[
    'campaign_config', 'reservations', 'reservation_days', 'reservation_events'
  ] loop
    execute format('alter table calendar_private.%I enable row level security', t);
    execute format(
      'revoke all on calendar_private.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

create trigger calendar_reservation_events_immutable
  before update or delete on calendar_private.reservation_events
  for each row execute function public.prevent_ledger_mutation();

-- Internal operator-path transaction. Not granted to any web API role.
-- The future anonymous donor endpoint must authenticate a revocable,
-- security-reviewed public seller link and enforce rate limits separately.
-- Checkout sessions must remain non-releasable until verified expired:
-- this transaction only releases plain HELD (not CHECKOUT_PENDING) inventory.
create function calendar_private.reserve(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_participant_id uuid,
  p_request_key uuid,
  p_days integer[],
  p_multiplier integer,
  p_supporter_name text,
  p_supporter_email text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  cp public.campaign_participants;
  config calendar_private.campaign_config;
  previous calendar_private.reservations;
  created calendar_private.reservations;
  old_reservation calendar_private.reservations;
  normalized_days integer[];
  normalized_name text := nullif(btrim(p_supporter_name), '');
  normalized_email text := nullif(lower(btrim(p_supporter_email)), '');
  quote_base bigint;
  request_hash text;
  checked_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authorized adult account required.' using errcode = '42501';
  end if;
  if p_organization_id is null or p_campaign_id is null or p_participant_id is null
     or p_request_key is null or not calendar_private.valid_days(p_days)
     or p_multiplier is null or p_multiplier not between 1 and 5 then
    raise exception 'Invalid calendar selection.' using errcode = '23514';
  end if;
  if normalized_name is null or length(normalized_name) > 200
     or normalized_email is null or length(normalized_email) > 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+ then
    raise exception 'Valid supporter name and email are required.' using errcode = '23514';
  end if;

  -- Use the same trusted, locked live membership as the fundraising module.
  perform public.lock_fundraising_membership(p_organization_id);
  select * into c from public.campaigns
    where id = p_campaign_id and organization_id = p_organization_id
    for share;
  if not found or c.campaign_type not in ('calendar', 'sponsor_a_day')
     or c.status <> 'ACTIVE' or c.archived_at is not null then
    raise exception 'Calendar campaign unavailable.' using errcode = '23514';
  end if;

  select * into cp from public.campaign_participants
    where id = p_participant_id and organization_id = p_organization_id
      and campaign_id = p_campaign_id for update;
  if not found or cp.status <> 'active'
    or not exists (select 1 from public.players p
      where p.id = cp.player_id and p.organization_id = cp.organization_id
        and p.status = 'active' and p.archived_at is null)
    or not public.can_manage_seller_participant(p_organization_id, p_participant_id) then
    raise exception 'Calendar participant unavailable.' using errcode = '42501';
  end if;

  select * into config from calendar_private.campaign_config
    where organization_id = p_organization_id and campaign_id = p_campaign_id;
  if not found or not config.enabled
    or (config.mode = 'fixed' and config.fixed_multiplier <> p_multiplier) then
    raise exception 'Calendar impact setting unavailable.' using errcode = '23514';
  end if;
  checked_at := clock_timestamp();
  if c.starts_at is null or c.sales_close_at is null
     or checked_at < c.starts_at or checked_at >= c.sales_close_at then
    raise exception 'Calendar sponsorship is closed.' using errcode = '23514';
  end if;

  select array_agg(day order by day) into normalized_days from unnest(p_days) d(day);
  select sum(day::bigint * 100) into quote_base from unnest(normalized_days) d(day);
  request_hash := encode(extensions.digest(jsonb_build_object(
    'organization_id', p_organization_id,
    'campaign_id', p_campaign_id,
    'participant_id', p_participant_id,
    'days', to_jsonb(normalized_days),
    'multiplier', p_multiplier,
    'supporter_name', normalized_name,
    'supporter_email', normalized_email
  )::text, 'sha256'), 'hex');

  -- The participant lock serializes reservations, retries and expiry cleanup.
  select * into previous from calendar_private.reservations
    where participant_id = p_participant_id and request_key = p_request_key;
  if found then
    if previous.request_fingerprint <> request_hash then
      raise exception 'Idempotency key already used for another selection.'
        using errcode = '23505';
    end if;
    return jsonb_build_object('id', previous.id, 'status', previous.status,
      'days', previous.days, 'multiplier', previous.multiplier,
      'base_cents', previous.base_cents,
      'additional_impact_cents', previous.additional_impact_cents,
      'total_cents', previous.total_cents, 'expires_at', previous.expires_at,
      'replayed', true);
  end if;

  -- Expired unstarted holds release; a pending Stripe checkout NEVER does.
  for old_reservation in select * from calendar_private.reservations
      where participant_id = p_participant_id and status = 'HELD'
        and expires_at <= checked_at order by created_at for update
  loop
    update calendar_private.reservations
      set status = 'EXPIRED', updated_at = checked_at
      where id = old_reservation.id;
    update calendar_private.reservation_days
      set state = 'RELEASED'
      where reservation_id = old_reservation.id and state = 'HELD';
    insert into calendar_private.reservation_events(
      reservation_id, organization_id, campaign_id, participant_id,
      event_type, multiplier, base_cents, additional_impact_cents, total_cents)
    values(old_reservation.id, old_reservation.organization_id,
      old_reservation.campaign_id, old_reservation.participant_id,
      'EXPIRED', old_reservation.multiplier, old_reservation.base_cents,
      old_reservation.additional_impact_cents, old_reservation.total_cents);
  end loop;

  -- Friendly preflight; the partial UNIQUE index remains the race authority.
  if exists (select 1 from calendar_private.reservation_days d
    where d.participant_id = p_participant_id
      and d.day_no = any(normalized_days)
      and d.state in ('HELD', 'CHECKOUT_PENDING', 'PAID', 'REFUNDED')) then
    raise exception 'One or more calendar days are unavailable.'
      using errcode = '23505';
  end if;

  insert into calendar_private.reservations(
    organization_id, campaign_id, participant_id, request_key,
    request_fingerprint, supporter_name, supporter_email, days,
    multiplier, base_cents, additional_impact_cents, total_cents,
    status, expires_at)
  values(p_organization_id, p_campaign_id, p_participant_id, p_request_key,
    request_hash, normalized_name, normalized_email, normalized_days,
    p_multiplier, quote_base, quote_base * (p_multiplier - 1),
    quote_base * p_multiplier, 'HELD', checked_at + interval '15 minutes')
  returning * into created;

  insert into calendar_private.reservation_days(
    reservation_id, organization_id, campaign_id, participant_id, day_no, state)
  select created.id, created.organization_id, created.campaign_id,
    created.participant_id, day, 'HELD'
  from unnest(normalized_days) d(day);

  insert into calendar_private.reservation_events(
    reservation_id, organization_id, campaign_id, participant_id,
    event_type, multiplier, base_cents, additional_impact_cents, total_cents)
  values(created.id, created.organization_id, created.campaign_id,
    created.participant_id, 'HELD', created.multiplier, created.base_cents,
    created.additional_impact_cents, created.total_cents);

  return jsonb_build_object('id', created.id, 'status', created.status,
    'days', created.days, 'multiplier', created.multiplier,
    'base_cents', created.base_cents,
    'additional_impact_cents', created.additional_impact_cents,
    'total_cents', created.total_cents, 'expires_at', created.expires_at,
    'replayed', false);
end;
$$;

-- PostgREST cannot invoke these private functions or read the private tables.
revoke all on all functions in schema calendar_private
  from public, anon, authenticated, service_role;
comment on schema calendar_private is
  'Unexposed calendar reservations; no web access until reviewed donor/token and Stripe webhook integration.';
 then
    raise exception 'Valid supporter name and email are required.' using errcode = '23514';
  end if;

  -- Use the same trusted, locked live membership as the fundraising module.
  perform public.lock_fundraising_membership(p_organization_id);
  select * into c from public.campaigns
    where id = p_campaign_id and organization_id = p_organization_id
    for share;
  if not found or c.campaign_type not in ('calendar', 'sponsor_a_day')
     or c.status <> 'ACTIVE' or c.archived_at is not null then
    raise exception 'Calendar campaign unavailable.' using errcode = '23514';
  end if;

  select * into cp from public.campaign_participants
    where id = p_participant_id and organization_id = p_organization_id
      and campaign_id = p_campaign_id for update;
  if not found or cp.status <> 'active'
    or not exists (select 1 from public.players p
      where p.id = cp.player_id and p.organization_id = cp.organization_id
        and p.status = 'active' and p.archived_at is null)
    or not public.can_manage_seller_participant(p_organization_id, p_participant_id) then
    raise exception 'Calendar participant unavailable.' using errcode = '42501';
  end if;

  select * into config from calendar_private.campaign_config
    where organization_id = p_organization_id and campaign_id = p_campaign_id;
  if not found or not config.enabled
    or (config.mode = 'fixed' and config.fixed_multiplier <> p_multiplier) then
    raise exception 'Calendar impact setting unavailable.' using errcode = '23514';
  end if;
  checked_at := clock_timestamp();
  if c.starts_at is null or c.sales_close_at is null
     or checked_at < c.starts_at or checked_at >= c.sales_close_at then
    raise exception 'Calendar sponsorship is closed.' using errcode = '23514';
  end if;

  select array_agg(day order by day) into normalized_days from unnest(p_days) d(day);
  select sum(day::bigint * 100) into quote_base from unnest(normalized_days) d(day);
  request_hash := encode(extensions.digest(jsonb_build_object(
    'organization_id', p_organization_id,
    'campaign_id', p_campaign_id,
    'participant_id', p_participant_id,
    'days', to_jsonb(normalized_days),
    'multiplier', p_multiplier,
    'supporter_name', normalized_name,
    'supporter_email', normalized_email
  )::text, 'sha256'), 'hex');

  -- The participant lock serializes reservations, retries and expiry cleanup.
  select * into previous from calendar_private.reservations
    where participant_id = p_participant_id and request_key = p_request_key;
  if found then
    if previous.request_fingerprint <> request_hash then
      raise exception 'Idempotency key already used for another selection.'
        using errcode = '23505';
    end if;
    return jsonb_build_object('id', previous.id, 'status', previous.status,
      'days', previous.days, 'multiplier', previous.multiplier,
      'base_cents', previous.base_cents,
      'additional_impact_cents', previous.additional_impact_cents,
      'total_cents', previous.total_cents, 'expires_at', previous.expires_at,
      'replayed', true);
  end if;

  -- Expired unstarted holds release; a pending Stripe checkout NEVER does.
  for old_reservation in select * from calendar_private.reservations
      where participant_id = p_participant_id and status = 'HELD'
        and expires_at <= checked_at order by created_at for update
  loop
    update calendar_private.reservations
      set status = 'EXPIRED', updated_at = checked_at
      where id = old_reservation.id;
    update calendar_private.reservation_days
      set state = 'RELEASED'
      where reservation_id = old_reservation.id and state = 'HELD';
    insert into calendar_private.reservation_events(
      reservation_id, organization_id, campaign_id, participant_id,
      event_type, multiplier, base_cents, additional_impact_cents, total_cents)
    values(old_reservation.id, old_reservation.organization_id,
      old_reservation.campaign_id, old_reservation.participant_id,
      'EXPIRED', old_reservation.multiplier, old_reservation.base_cents,
      old_reservation.additional_impact_cents, old_reservation.total_cents);
  end loop;

  -- Friendly preflight; the partial UNIQUE index remains the race authority.
  if exists (select 1 from calendar_private.reservation_days d
    where d.participant_id = p_participant_id
      and d.day_no = any(normalized_days)
      and d.state in ('HELD', 'CHECKOUT_PENDING', 'PAID', 'REFUNDED')) then
    raise exception 'One or more calendar days are unavailable.'
      using errcode = '23505';
  end if;

  insert into calendar_private.reservations(
    organization_id, campaign_id, participant_id, request_key,
    request_fingerprint, supporter_name, supporter_email, days,
    multiplier, base_cents, additional_impact_cents, total_cents,
    status, expires_at)
  values(p_organization_id, p_campaign_id, p_participant_id, p_request_key,
    request_hash, normalized_name, normalized_email, normalized_days,
    p_multiplier, quote_base, quote_base * (p_multiplier - 1),
    quote_base * p_multiplier, 'HELD', checked_at + interval '15 minutes')
  returning * into created;

  insert into calendar_private.reservation_days(
    reservation_id, organization_id, campaign_id, participant_id, day_no, state)
  select created.id, created.organization_id, created.campaign_id,
    created.participant_id, day, 'HELD'
  from unnest(normalized_days) d(day);

  insert into calendar_private.reservation_events(
    reservation_id, organization_id, campaign_id, participant_id,
    event_type, multiplier, base_cents, additional_impact_cents, total_cents)
  values(created.id, created.organization_id, created.campaign_id,
    created.participant_id, 'HELD', created.multiplier, created.base_cents,
    created.additional_impact_cents, created.total_cents);

  return jsonb_build_object('id', created.id, 'status', created.status,
    'days', created.days, 'multiplier', created.multiplier,
    'base_cents', created.base_cents,
    'additional_impact_cents', created.additional_impact_cents,
    'total_cents', created.total_cents, 'expires_at', created.expires_at,
    'replayed', false);
end;
$$;

-- PostgREST cannot invoke these private functions or read the private tables.
revoke all on all functions in schema calendar_private
  from public, anon, authenticated, service_role;
comment on schema calendar_private is
  'Unexposed calendar reservations; no web access until reviewed donor/token and Stripe webhook integration.';
