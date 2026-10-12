-- =============================================================================
-- Raffle Hub — 0200 Master Roster
-- Seasons, teams, households, guardians, players, player↔guardian links and
-- historical team memberships. Independent of campaigns: campaigns reference
-- these rows through campaign_participants and never copy the roster.
--
-- Tenant integrity: child rows reference parents with composite FKs on
-- (id, organization_id), so a row can never point at another org's records.
-- Archival: rows are archived (archived_at) rather than deleted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Seasons
-- -----------------------------------------------------------------------------

create table public.seasons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (length(trim(name)) > 0),
  starts_on       date,
  ends_on         date,
  is_current      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  archived_at     timestamptz,
  unique (id, organization_id),
  check (starts_on is null or ends_on is null or starts_on < ends_on)
);
create unique index seasons_org_name_uq on public.seasons (organization_id, lower(name));
create unique index seasons_one_current_uq on public.seasons (organization_id) where is_current;

-- -----------------------------------------------------------------------------
-- Teams
-- -----------------------------------------------------------------------------

create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  season_id       uuid,
  name            text not null check (length(trim(name)) > 0),
  age_group       text,
  gender_division text check (gender_division in ('boys', 'girls', 'coed', 'men', 'women', 'open')),
  coach_name      text,
  team_code       text,
  status          text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  archived_at     timestamptz,
  unique (id, organization_id),
  foreign key (season_id, organization_id) references public.seasons (id, organization_id),
  check ((status = 'archived') = (archived_at is not null))
);
create unique index teams_org_season_name_uq on public.teams
  (organization_id, coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where archived_at is null;
create unique index teams_org_code_uq on public.teams (organization_id, lower(team_code))
  where team_code is not null and archived_at is null;

-- -----------------------------------------------------------------------------
-- Households
-- -----------------------------------------------------------------------------

create table public.households (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (length(trim(name)) > 0),
  address_line1   text,
  address_line2   text,
  city            text,
  region          text,
  postal_code     text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  archived_at     timestamptz,
  unique (id, organization_id)
);
create index households_org_name_idx on public.households (organization_id, lower(name));

-- -----------------------------------------------------------------------------
-- Guardians (adults; belong to a household; may later link to a login)
-- -----------------------------------------------------------------------------

create table public.guardians (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  household_id              uuid,
  first_name                text not null check (length(trim(first_name)) > 0),
  last_name                 text not null check (length(trim(last_name)) > 0),
  email                     text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                     text,
  email_normalized          text generated always as (nullif(lower(trim(email)), '')) stored,
  phone_digits              text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  is_primary_contact        boolean not null default false,
  communication_preferences jsonb not null default '{"email": true, "sms": false}'::jsonb,
  -- Future: family self-registration links a guardian to their login.
  profile_id                uuid references public.profiles (id) on delete set null,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references auth.users (id) on delete set null,
  updated_by                uuid references auth.users (id) on delete set null,
  archived_at               timestamptz,
  unique (id, organization_id),
  foreign key (household_id, organization_id) references public.households (id, organization_id)
);
create index guardians_household_idx on public.guardians (household_id);
create index guardians_org_email_idx on public.guardians (organization_id, email_normalized) where email_normalized is not null;
create index guardians_org_phone_idx on public.guardians (organization_id, phone_digits) where phone_digits is not null;
create unique index guardians_one_primary_per_household_uq on public.guardians (household_id)
  where is_primary_contact and archived_at is null;

-- -----------------------------------------------------------------------------
-- Players
-- -----------------------------------------------------------------------------

create table public.players (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  household_id       uuid,
  first_name         text not null check (length(trim(first_name)) > 0),
  last_name          text not null check (length(trim(last_name)) > 0),
  preferred_name     text,
  date_of_birth      date check (date_of_birth is null or date_of_birth > date '1900-01-01'),
  gender             text check (gender in ('male', 'female', 'nonbinary', 'unspecified')),
  external_player_id text,
  status             text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  source             text not null default 'manual' check (source in ('manual', 'import', 'self_registration')),
  source_import_id   uuid,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id) on delete set null,
  updated_by         uuid references auth.users (id) on delete set null,
  archived_at        timestamptz,
  unique (id, organization_id),
  foreign key (household_id, organization_id) references public.households (id, organization_id),
  check ((status = 'archived') = (archived_at is not null))
);
create unique index players_org_external_id_uq on public.players (organization_id, lower(external_player_id))
  where external_player_id is not null;
create index players_org_name_idx on public.players (organization_id, lower(last_name), lower(first_name));
create index players_household_idx on public.players (household_id);
create index players_name_trgm_idx on public.players
  using gin ((lower(first_name || ' ' || last_name || ' ' || coalesce(preferred_name, ''))) extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Player ↔ guardian (many-to-many)
-- -----------------------------------------------------------------------------

create table public.player_guardians (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  player_id       uuid not null,
  guardian_id     uuid not null,
  relationship    text not null default 'parent'
                  check (relationship in ('mother', 'father', 'parent', 'stepparent', 'grandparent', 'guardian', 'other')),
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  primary key (player_id, guardian_id),
  foreign key (player_id, organization_id) references public.players (id, organization_id) on delete cascade,
  foreign key (guardian_id, organization_id) references public.guardians (id, organization_id) on delete cascade
);
create index player_guardians_guardian_idx on public.player_guardians (guardian_id);
create unique index player_guardians_one_primary_uq on public.player_guardians (player_id) where is_primary;

-- -----------------------------------------------------------------------------
-- Team memberships (history). Changing teams ends the current row and inserts
-- a new one, so past seasons/teams are preserved.
-- -----------------------------------------------------------------------------

create table public.team_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  player_id       uuid not null,
  team_id         uuid not null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  end_reason      text check (end_reason in ('team_change', 'removed', 'archived', 'season_end')),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  foreign key (player_id, organization_id) references public.players (id, organization_id),
  foreign key (team_id, organization_id) references public.teams (id, organization_id),
  check (ended_at is null or ended_at >= started_at)
);
create unique index team_memberships_one_current_uq on public.team_memberships (player_id) where ended_at is null;
create index team_memberships_team_current_idx on public.team_memberships (team_id) where ended_at is null;
create index team_memberships_player_idx on public.team_memberships (player_id, started_at desc);

-- -----------------------------------------------------------------------------
-- "Not a duplicate" decisions, so dismissed pairs stop resurfacing.
-- -----------------------------------------------------------------------------

create table public.player_duplicate_dismissals (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  player_a_id     uuid not null,
  player_b_id     uuid not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  primary key (player_a_id, player_b_id),
  check (player_a_id < player_b_id),
  foreign key (player_a_id, organization_id) references public.players (id, organization_id) on delete cascade,
  foreign key (player_b_id, organization_id) references public.players (id, organization_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Triggers: updated_at, actor stamping, audit
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['seasons', 'teams', 'households', 'guardians', 'players'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['seasons', 'teams', 'households', 'guardians', 'players',
                           'player_guardians', 'team_memberships', 'player_duplicate_dismissals'] loop
    execute format('create trigger %1$s_set_actor before insert or update on public.%1$s
                    for each row execute function public.set_actor_columns()', t);
  end loop;
end;
$$;

create trigger seasons_audit after insert or update on public.seasons
  for each row execute function public.audit_row_change('SEASON');
create trigger teams_audit after insert or update on public.teams
  for each row execute function public.audit_row_change('TEAM');
create trigger households_audit after insert or update on public.households
  for each row execute function public.audit_row_change('HOUSEHOLD');
create trigger guardians_audit after insert or update on public.guardians
  for each row execute function public.audit_row_change('GUARDIAN');
create trigger players_audit after insert or update on public.players
  for each row execute function public.audit_row_change('PLAYER');

-- PLAYER_TEAM_CHANGED: emitted when a new current membership is inserted, or
-- when a current membership is ended with no replacement (player unassigned).
create or replace function public.audit_team_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_team uuid;
begin
  if tg_op = 'INSERT' and new.ended_at is null then
    select team_id into previous_team
    from public.team_memberships
    where player_id = new.player_id and id <> new.id and ended_at is not null
    order by ended_at desc, started_at desc
    limit 1;
    insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (new.organization_id, auth.uid(), 'PLAYER_TEAM_CHANGED', 'players', new.player_id,
            jsonb_build_object('from_team_id', previous_team, 'to_team_id', new.team_id,
                               'import_id', nullif(current_setting('raffle_hub.import_id', true), '')));
  elsif tg_op = 'UPDATE' and old.ended_at is null and new.ended_at is not null
        and new.end_reason in ('removed', 'archived') then
    insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (new.organization_id, auth.uid(), 'PLAYER_TEAM_CHANGED', 'players', new.player_id,
            jsonb_build_object('from_team_id', new.team_id, 'to_team_id', null, 'reason', new.end_reason));
  end if;
  return new;
end;
$$;

create trigger team_memberships_audit after insert or update on public.team_memberships
  for each row execute function public.audit_team_membership();

create or replace function public.audit_player_guardian()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record := coalesce(new, old);
begin
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (r.organization_id, auth.uid(),
          case tg_op when 'INSERT' then 'PLAYER_GUARDIAN_LINKED'
                     when 'DELETE' then 'PLAYER_GUARDIAN_UNLINKED'
                     else 'PLAYER_GUARDIAN_UPDATED' end,
          'players', r.player_id,
          jsonb_build_object('guardian_id', r.guardian_id, 'relationship', r.relationship, 'is_primary', r.is_primary));
  return r;
end;
$$;

create trigger player_guardians_audit after insert or update or delete on public.player_guardians
  for each row execute function public.audit_player_guardian();

-- Archiving a player ends their current team membership.
create or replace function public.end_membership_on_player_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    update public.team_memberships
       set ended_at = now(), end_reason = 'archived'
     where player_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$;

create trigger players_end_membership_on_archive after update of archived_at on public.players
  for each row execute function public.end_membership_on_player_archive();

-- -----------------------------------------------------------------------------
-- Directory view (security_invoker: RLS of the underlying tables applies)
-- -----------------------------------------------------------------------------

create view public.player_directory
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.first_name,
  p.last_name,
  p.preferred_name,
  p.date_of_birth,
  p.gender,
  p.external_player_id,
  p.status,
  p.source,
  p.source_import_id,
  p.notes,
  p.household_id,
  p.created_at,
  p.updated_at,
  p.archived_at,
  tm.team_id,
  t.name            as team_name,
  t.season_id,
  s.name            as season_name,
  h.name            as household_name,
  pg.guardian_id    as primary_guardian_id,
  case when g.id is not null then g.first_name || ' ' || g.last_name end as primary_guardian_name,
  g.email           as primary_guardian_email,
  g.phone           as primary_guardian_phone,
  lower(p.first_name || ' ' || p.last_name || ' ' || coalesce(p.preferred_name, '')) as search_text
from public.players p
left join public.team_memberships tm on tm.player_id = p.id and tm.ended_at is null
left join public.teams t on t.id = tm.team_id
left join public.seasons s on s.id = t.season_id
left join public.households h on h.id = p.household_id
left join lateral (
  select x.guardian_id
  from public.player_guardians x
  join public.guardians gx on gx.id = x.guardian_id and gx.archived_at is null
  where x.player_id = p.id
  order by x.is_primary desc, x.created_at
  limit 1
) pg on true
left join public.guardians g on g.id = pg.guardian_id;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['seasons', 'teams', 'households', 'guardians', 'players',
                           'player_guardians', 'team_memberships', 'player_duplicate_dismissals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated
                    using (public.has_org_permission(organization_id, ''roster.read''))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated
                    with check (public.has_org_permission(organization_id, ''roster.write''))', t);
  end loop;
  -- Mutable entities (archive is an update; there is no hard delete).
  foreach t in array array['seasons', 'teams', 'households', 'guardians', 'players', 'team_memberships'] loop
    execute format('create policy %1$s_update on public.%1$s for update to authenticated
                    using (public.has_org_permission(organization_id, ''roster.write''))
                    with check (public.has_org_permission(organization_id, ''roster.write''))', t);
  end loop;
end;
$$;

-- Seasons are organization settings.
drop policy seasons_insert on public.seasons;
drop policy seasons_update on public.seasons;
create policy seasons_insert on public.seasons for insert to authenticated
  with check (public.has_org_permission(organization_id, 'organization.manage'));
create policy seasons_update on public.seasons for update to authenticated
  using (public.has_org_permission(organization_id, 'organization.manage'))
  with check (public.has_org_permission(organization_id, 'organization.manage'));

-- Link rows can be updated (primary/relationship) and removed (unlink).
create policy player_guardians_update on public.player_guardians for update to authenticated
  using (public.has_org_permission(organization_id, 'roster.write'))
  with check (public.has_org_permission(organization_id, 'roster.write'));
create policy player_guardians_delete on public.player_guardians for delete to authenticated
  using (public.has_org_permission(organization_id, 'roster.write'));
create policy player_duplicate_dismissals_delete on public.player_duplicate_dismissals for delete to authenticated
  using (public.has_org_permission(organization_id, 'roster.write'));

-- No hard deletes of roster history from clients.
revoke delete on public.seasons, public.teams, public.households, public.guardians,
                 public.players, public.team_memberships from anon, authenticated;
