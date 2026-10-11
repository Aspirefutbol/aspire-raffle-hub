-- =============================================================================
-- Raffle Hub — 1300 Append-only ledgers and tamper-evident hash chains
--
-- * audit_events, campaign_events, ticket_events and money_events are each a
--   SHA-256 hash chain: every row stores the previous row's hash and its own
--   hash over (previous hash + canonical row JSON). Chains are partitioned
--   (audit: per organization; ledgers: per campaign) and positions are
--   assigned under an advisory lock, so concurrent writers can't interleave.
-- * verify_*() functions recompute a chain and report the first broken row.
-- * ticket_events and money_events are PREPARED for the ticket and
--   reconciliation phases: append-only, reason-required for voids, reissues,
--   reversals, adjustments, exceptions and write-offs. No app code writes to
--   them yet; future SECURITY DEFINER functions will be their only writers.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generic hash-chain machinery
-- -----------------------------------------------------------------------------

-- Canonical JSON for hashing: fixed time zone so timestamps serialize the same
-- way in every session; chain columns excluded.
create or replace function public.chain_payload(p_row jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select (p_row - 'chain_pos' - 'prev_hash' - 'row_hash')::text;
$$;

create or replace function public.hash_chain_append()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  part_col text := tg_argv[0];
  part_val text;
  last_pos bigint;
  last_hash text;
begin
  part_val := coalesce(to_jsonb(new) ->> part_col, '00000000-0000-0000-0000-000000000000');
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ':' || part_val, 0));
  execute format(
    'select chain_pos, row_hash from public.%I where coalesce(%I::text, %L) = $1 order by chain_pos desc limit 1',
    tg_table_name, part_col, '00000000-0000-0000-0000-000000000000')
  into last_pos, last_hash using part_val;
  new.chain_pos := coalesce(last_pos, 0) + 1;
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.row_hash := encode(extensions.digest(new.prev_hash || public.chain_payload(to_jsonb(new)), 'sha256'), 'hex');
  return new;
end;
$$;

-- Recomputes a chain. Returns ok=false and the first position whose stored
-- hashes don't match.
create or replace function public.verify_hash_chain(p_table text, p_partition_col text, p_partition uuid)
returns table (ok boolean, rows_checked bigint, first_bad_pos bigint, head_hash text)
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  rec record;
  expected_prev text := repeat('0', 64);
  n bigint := 0;
begin
  if p_table not in ('audit_events', 'campaign_events', 'ticket_events', 'money_events') then
    raise exception 'Unsupported table %', p_table;
  end if;
  for rec in execute format(
    'select chain_pos, prev_hash, row_hash, to_jsonb(t) as j from public.%I t where coalesce(%I::text, %L) = $1 order by chain_pos',
    p_table, p_partition_col, '00000000-0000-0000-0000-000000000000')
    using coalesce(p_partition::text, '00000000-0000-0000-0000-000000000000')
  loop
    n := n + 1;
    if rec.chain_pos <> n
       or rec.prev_hash <> expected_prev
       or rec.row_hash <> encode(extensions.digest(rec.prev_hash || public.chain_payload(rec.j), 'sha256'), 'hex') then
      return query select false, n, rec.chain_pos, null::text;
      return;
    end if;
    expected_prev := rec.row_hash;
  end loop;
  return query select true, n, null::bigint, case when n = 0 then null else expected_prev end;
end;
$$;
revoke all on function public.verify_hash_chain(text, text, uuid) from public, anon, authenticated;

create or replace function public.prevent_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only; record a correcting event instead.', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

-- -----------------------------------------------------------------------------
-- audit_events: add chain (per organization) and backfill existing rows
-- -----------------------------------------------------------------------------

alter table public.audit_events
  add column chain_pos bigint,
  add column prev_hash text,
  add column row_hash  text;

do $$
declare
  org uuid;
  rec record;
  pos bigint;
  prev text;
begin
  set local timezone = 'UTC';
  -- Backfill needs to bypass the append-only trigger once.
  alter table public.audit_events disable trigger audit_events_append_only;
  for org in select distinct organization_id from public.audit_events loop
    pos := 0;
    prev := repeat('0', 64);
    for rec in
      select id, to_jsonb(a) as j from public.audit_events a
      where organization_id is not distinct from org
      order by occurred_at, id
    loop
      pos := pos + 1;
      update public.audit_events
         set chain_pos = pos, prev_hash = prev,
             row_hash = encode(extensions.digest(prev || public.chain_payload(rec.j), 'sha256'), 'hex')
       where id = rec.id
      returning row_hash into prev;
    end loop;
  end loop;
  alter table public.audit_events enable trigger audit_events_append_only;
end;
$$;

alter table public.audit_events
  alter column chain_pos set not null,
  alter column prev_hash set not null,
  alter column row_hash set not null;
create unique index audit_events_chain_uq on public.audit_events
  (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), chain_pos);

-- Named zz_* so it fires after every other BEFORE INSERT trigger (alphabetical
-- order): the hash must cover the final row.
create trigger zz_audit_events_hash_chain before insert on public.audit_events
  for each row execute function public.hash_chain_append('organization_id');

create or replace function public.verify_audit_chain(p_organization_id uuid)
returns table (ok boolean, rows_checked bigint, first_bad_pos bigint, head_hash text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_org_permission(p_organization_id, 'audit.read') then
    raise exception 'You do not have permission to verify this audit log.' using errcode = 'insufficient_privilege';
  end if;
  return query select * from public.verify_hash_chain('audit_events', 'organization_id', p_organization_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- campaign_events: chain per campaign, append-only, readable with campaigns.read
-- -----------------------------------------------------------------------------

alter table public.campaign_events
  add column chain_pos bigint not null default 0,
  add column prev_hash text not null default '',
  add column row_hash  text not null default '';
create unique index campaign_events_chain_uq on public.campaign_events (campaign_id, chain_pos);

create trigger zz_campaign_events_hash_chain before insert on public.campaign_events
  for each row execute function public.hash_chain_append('campaign_id');
create trigger campaign_events_append_only before update or delete on public.campaign_events
  for each row execute function public.prevent_ledger_mutation();

alter table public.campaign_events enable row level security;
create policy campaign_events_select on public.campaign_events for select to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.read'));
revoke insert, update, delete on public.campaign_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- ticket_events (prepared): the canonical ticket ledger
-- -----------------------------------------------------------------------------

create table public.ticket_events (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  campaign_id        uuid not null,
  ticket_id          uuid not null,          -- FK to tickets is added with the tickets table
  event_type         text not null check (event_type in ('ALLOCATED', 'UNALLOCATED', 'ISSUED', 'VOIDED', 'REISSUED', 'WINNER', 'CLAIMED')),
  replaces_ticket_id uuid,                   -- REISSUED: the voided ticket this one replaces
  participant_id     uuid,                   -- seller attribution (campaign participant)
  reason             text,
  idempotency_key    text,                   -- ISSUED: client key for retry-safe issuance
  actor_id           uuid references auth.users (id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  occurred_at        timestamptz not null default now(),
  chain_pos          bigint not null default 0,
  prev_hash          text not null default '',
  row_hash           text not null default '',
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id),
  check (event_type not in ('VOIDED', 'REISSUED') or length(btrim(coalesce(reason, ''))) >= 3),
  check (event_type <> 'REISSUED' or replaces_ticket_id is not null)
);
comment on table public.ticket_events is 'HISTORICAL. Append-only canonical ticket ledger (prepared; written by ticket-phase functions only).';
create unique index ticket_events_chain_uq on public.ticket_events (campaign_id, chain_pos);
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, occurred_at);
create unique index ticket_events_idempotency_uq on public.ticket_events (campaign_id, idempotency_key, ticket_id)
  where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- money_events (prepared): seller custody and reconciliation ledger.
-- Corrections are new events (REVERSAL / ADJUSTMENT), never edits.
-- -----------------------------------------------------------------------------

create table public.money_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  campaign_id       uuid not null,
  participant_id    uuid,                    -- seller / participant the money is attributed to
  event_type        text not null check (event_type in (
                      'SALE_COLLECTED', 'TURN_IN', 'ADJUSTMENT', 'REVERSAL', 'WRITE_OFF',
                      'EXCEPTION_OPENED', 'EXCEPTION_RESOLVED')),
  amount_cents      bigint not null,
  payment_method    text check (payment_method in ('cash', 'check')),
  batch_ref         text,
  reverses_event_id uuid references public.money_events (id),
  reason            text,
  approved_by       uuid references auth.users (id) on delete set null,
  actor_id          uuid references auth.users (id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  occurred_at       timestamptz not null default now(),
  chain_pos         bigint not null default 0,
  prev_hash         text not null default '',
  row_hash          text not null default '',
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id),
  foreign key (participant_id) references public.campaign_participants (id),
  check (event_type not in ('ADJUSTMENT', 'REVERSAL', 'WRITE_OFF', 'EXCEPTION_OPENED', 'EXCEPTION_RESOLVED')
         or length(btrim(coalesce(reason, ''))) >= 3),
  check (event_type <> 'REVERSAL' or reverses_event_id is not null),
  check (event_type <> 'WRITE_OFF' or approved_by is not null),
  check (event_type in ('EXCEPTION_OPENED', 'EXCEPTION_RESOLVED', 'ADJUSTMENT', 'REVERSAL') or amount_cents > 0)
);
comment on table public.money_events is 'HISTORICAL. Append-only seller-funds ledger (prepared; written by reconciliation-phase functions only). Never changes ticket validity.';
create unique index money_events_chain_uq on public.money_events (campaign_id, chain_pos);
create index money_events_participant_idx on public.money_events (participant_id, occurred_at);

do $$
declare
  t text;
begin
  foreach t in array array['ticket_events', 'money_events'] loop
    execute format('create trigger zz_%1$s_hash_chain before insert on public.%1$s
                    for each row execute function public.hash_chain_append(''campaign_id'')', t);
    execute format('create trigger %1$s_append_only before update or delete on public.%1$s
                    for each row execute function public.prevent_ledger_mutation()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Ledger actor is always the authenticated caller when there is one.
create or replace function public.stamp_ledger_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actor_id := coalesce(auth.uid(), new.actor_id);
  return new;
end;
$$;

create trigger campaign_events_stamp_actor before insert on public.campaign_events
  for each row execute function public.stamp_ledger_actor();
create trigger ticket_events_stamp_actor before insert on public.ticket_events
  for each row execute function public.stamp_ledger_actor();
create trigger money_events_stamp_actor before insert on public.money_events
  for each row execute function public.stamp_ledger_actor();

create policy ticket_events_select on public.ticket_events for select to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.read'));
create policy money_events_select on public.money_events for select to authenticated
  using (public.has_org_permission(organization_id, 'reconciliation.manage')
      or public.has_org_permission(organization_id, 'adjustments.approve')
      or public.has_org_permission(organization_id, 'audit.read'));

create or replace function public.verify_campaign_ledgers(p_campaign_id uuid)
returns table (ledger text, ok boolean, rows_checked bigint, first_bad_pos bigint, head_hash text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  select organization_id into org from public.campaigns where id = p_campaign_id;
  if org is null or not public.has_org_permission(org, 'campaigns.read') then
    raise exception 'Campaign not found.' using errcode = 'no_data_found';
  end if;
  return query
    select 'campaign_events'::text, v.* from public.verify_hash_chain('campaign_events', 'campaign_id', p_campaign_id) v
    union all
    select 'ticket_events', v.* from public.verify_hash_chain('ticket_events', 'campaign_id', p_campaign_id) v
    union all
    select 'money_events', v.* from public.verify_hash_chain('money_events', 'campaign_id', p_campaign_id) v;
end;
$$;
