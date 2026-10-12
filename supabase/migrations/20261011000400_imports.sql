-- =============================================================================
-- Raffle Hub — 0400 Roster imports
-- Staged import pipeline: UPLOAD → MAP → VALIDATE → REVIEW/RESOLVE → COMMIT.
-- Nothing touches the roster until commit_player_import() runs, and that runs
-- as one transaction. Mapping/validation/duplicate logic lives in
-- lib/roster/import (TypeScript, unit-tested); this function only executes the
-- reviewed plan stored on each import_row.
-- =============================================================================

-- Saved column mappings, reusable for future imports from the same source.
create table public.import_mappings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  name             text not null check (length(trim(name)) > 0),
  mapping          jsonb not null,           -- { "<source header>": "<target field>" | null }
  header_signature text,                     -- normalized sorted headers, for auto-suggest
  last_used_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null
);
create unique index import_mappings_org_name_uq on public.import_mappings (organization_id, lower(name));
create index import_mappings_signature_idx on public.import_mappings (organization_id, header_signature);

create table public.imports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind            text not null default 'players' check (kind in ('players')),
  file_name       text not null,
  source_name     text,
  status          text not null default 'uploaded'
                  check (status in ('uploaded', 'mapped', 'validated', 'completed', 'cancelled')),
  headers         text[] not null default '{}',
  column_mapping  jsonb not null default '{}'::jsonb,
  mapping_id      uuid references public.import_mappings (id) on delete set null,
  row_count       integer not null default 0 check (row_count >= 0),
  summary         jsonb not null default '{}'::jsonb,
  completed_at    timestamptz,
  completed_by    uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  unique (id, organization_id)
);
create index imports_org_created_idx on public.imports (organization_id, created_at desc);

create table public.import_rows (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  import_id        uuid not null,
  row_number       integer not null check (row_number > 0),
  raw              jsonb not null,                     -- original cells keyed by header
  data             jsonb not null default '{}'::jsonb, -- mapped + admin-corrected values
  status           text not null default 'pending'
                   check (status in ('pending', 'ready', 'duplicate', 'error', 'skipped', 'imported')),
  issues           jsonb not null default '[]'::jsonb, -- [{code, field, message, severity}]
  match_type       text check (match_type in ('EXACT_MATCH', 'LIKELY_MATCH', 'NEW_RECORD', 'NEEDS_REVIEW')),
  match_player_id  uuid,
  match_reasons    text[] not null default '{}',
  resolution       text check (resolution in ('create', 'use_existing', 'link', 'skip')),
  household_key    text,                               -- 'existing:<uuid>' | 'new:<key>' | null
  result_player_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (import_id, row_number),
  foreign key (import_id, organization_id) references public.imports (id, organization_id) on delete cascade,
  foreign key (match_player_id, organization_id) references public.players (id, organization_id),
  foreign key (result_player_id, organization_id) references public.players (id, organization_id),
  check (resolution is distinct from 'use_existing' or match_player_id is not null),
  check (resolution is distinct from 'link' or match_player_id is not null)
);
create index import_rows_import_status_idx on public.import_rows (import_id, status);

alter table public.players
  add constraint players_source_import_fk
  foreign key (source_import_id, organization_id) references public.imports (id, organization_id);

create trigger import_mappings_set_updated_at before update on public.import_mappings
  for each row execute function public.set_updated_at();
create trigger imports_set_updated_at before update on public.imports
  for each row execute function public.set_updated_at();
create trigger import_rows_set_updated_at before update on public.import_rows
  for each row execute function public.set_updated_at();
create trigger import_mappings_set_actor before insert or update on public.import_mappings
  for each row execute function public.set_actor_columns();
create trigger imports_set_actor before insert or update on public.imports
  for each row execute function public.set_actor_columns();

-- IMPORT_STARTED / IMPORT_COMPLETED / IMPORT_CANCELLED audit events.
create or replace function public.audit_import_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'IMPORT_STARTED';
  elsif new.status is distinct from old.status and new.status in ('completed', 'cancelled') then
    action_name := 'IMPORT_' || upper(new.status);
  else
    return new;
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (new.organization_id, auth.uid(), action_name, 'imports', new.id,
          jsonb_build_object('file_name', new.file_name, 'row_count', new.row_count, 'summary', new.summary));
  return new;
end;
$$;

create trigger imports_audit after insert or update on public.imports
  for each row execute function public.audit_import_status();

-- -----------------------------------------------------------------------------
-- RLS: imports are visible to and operable by holders of roster.import.
-- -----------------------------------------------------------------------------

alter table public.import_mappings enable row level security;
alter table public.imports enable row level security;
alter table public.import_rows enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['import_mappings', 'imports', 'import_rows'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated
                    using (public.has_org_permission(organization_id, ''roster.import''))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated
                    with check (public.has_org_permission(organization_id, ''roster.import''))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated
                    using (public.has_org_permission(organization_id, ''roster.import''))
                    with check (public.has_org_permission(organization_id, ''roster.import''))', t);
  end loop;
end;
$$;

-- Saved mappings may be deleted; import history may not.
create policy import_mappings_delete on public.import_mappings for delete to authenticated
  using (public.has_org_permission(organization_id, 'roster.import'));
revoke delete on public.imports, public.import_rows from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Commit: executes the reviewed plan atomically.
--   ready / duplicate rows with resolution:
--     create       → new player (+ household, team, guardians)
--     link         → fill blanks on the matched player, assign team, add guardians
--     use_existing → no roster change; row records the matched player
--     skip         → nothing
--   error rows are skipped (never partially imported).
-- -----------------------------------------------------------------------------

create or replace function public.commit_player_import(p_import_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  imp               public.imports;
  r                 public.import_rows;
  d                 jsonb;
  org               uuid;
  hh                uuid;
  pid               uuid;
  gid               uuid;
  hh_map            jsonb := '{}'::jsonb;
  i                 integer;
  g_first           text;
  g_last            text;
  g_email           text;
  g_phone           text;
  g_digits          text;
  g_rel             text;
  n_created         integer := 0;
  n_linked          integer := 0;
  n_existing        integer := 0;
  n_skipped         integer := 0;
  n_teams           integer := 0;
  n_households      integer := 0;
  n_guardians       integer := 0;
  result            jsonb;
begin
  select * into imp from public.imports where id = p_import_id for update;
  if not found then
    raise exception 'Import not found.' using errcode = 'no_data_found';
  end if;
  org := imp.organization_id;
  perform public.assert_org_permission(org, 'roster.import');
  perform public.assert_org_permission(org, 'roster.write');

  if imp.status <> 'validated' then
    raise exception 'This import is %; only validated imports can be committed.', imp.status
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.import_rows
             where import_id = p_import_id and status = 'duplicate' and resolution is null) then
    raise exception 'Choose what to do with every possible duplicate before importing.'
      using errcode = 'check_violation';
  end if;

  -- Audit triggers read this to emit PLAYER_IMPORTED with the import id.
  perform set_config('raffle_hub.import_id', p_import_id::text, true);

  for r in select * from public.import_rows where import_id = p_import_id order by row_number loop
    if r.status not in ('ready', 'duplicate') or r.resolution = 'skip' then
      update public.import_rows set status = 'skipped' where id = r.id;
      n_skipped := n_skipped + 1;
      continue;
    end if;

    if r.resolution = 'use_existing' then
      update public.import_rows set status = 'imported', result_player_id = r.match_player_id where id = r.id;
      n_existing := n_existing + 1;
      continue;
    end if;

    d := r.data;
    hh := null;

    if r.resolution = 'link' then
      select household_id into hh from public.players where id = r.match_player_id and organization_id = org;
    end if;

    if hh is null and r.household_key is not null then
      if r.household_key like 'existing:%' then
        hh := substr(r.household_key, 10)::uuid;
      elsif hh_map ? r.household_key then
        hh := (hh_map ->> r.household_key)::uuid;
      else
        insert into public.households (organization_id, name)
        values (org, coalesce(
          nullif(trim(coalesce(d ->> 'household_name', '')), ''),
          coalesce(nullif(trim(coalesce(d ->> 'guardian1_last_name', '')), ''), trim(d ->> 'last_name')) || ' Household'))
        returning id into hh;
        hh_map := hh_map || jsonb_build_object(r.household_key, hh);
        n_households := n_households + 1;
      end if;
    end if;

    if r.resolution = 'link' then
      pid := r.match_player_id;
      update public.players set
        household_id       = coalesce(household_id, hh),
        preferred_name     = coalesce(preferred_name, nullif(trim(coalesce(d ->> 'preferred_name', '')), '')),
        date_of_birth      = coalesce(date_of_birth, nullif(d ->> 'date_of_birth', '')::date),
        gender             = coalesce(gender, nullif(d ->> 'gender', '')),
        external_player_id = coalesce(external_player_id, nullif(trim(coalesce(d ->> 'external_player_id', '')), '')),
        notes              = coalesce(notes, nullif(trim(coalesce(d ->> 'notes', '')), ''))
      where id = pid and organization_id = org;
      select household_id into hh from public.players where id = pid;
      n_linked := n_linked + 1;
    else
      insert into public.players (organization_id, household_id, first_name, last_name, preferred_name,
                                  date_of_birth, gender, external_player_id, notes, source, source_import_id)
      values (org, hh,
              trim(d ->> 'first_name'),
              trim(d ->> 'last_name'),
              nullif(trim(coalesce(d ->> 'preferred_name', '')), ''),
              nullif(d ->> 'date_of_birth', '')::date,
              nullif(d ->> 'gender', ''),
              nullif(trim(coalesce(d ->> 'external_player_id', '')), ''),
              nullif(trim(coalesce(d ->> 'notes', '')), ''),
              'import', p_import_id)
      returning id into pid;
      n_created := n_created + 1;
    end if;

    if nullif(d ->> 'team_id', '') is not null then
      if public.set_player_team(org, pid, (d ->> 'team_id')::uuid) then
        n_teams := n_teams + 1;
      end if;
    end if;

    for i in 1..2 loop
      g_first  := nullif(trim(coalesce(d ->> ('guardian' || i || '_first_name'), '')), '');
      g_last   := nullif(trim(coalesce(d ->> ('guardian' || i || '_last_name'), '')), '');
      g_email  := nullif(lower(trim(coalesce(d ->> ('guardian' || i || '_email'), ''))), '');
      g_phone  := nullif(trim(coalesce(d ->> ('guardian' || i || '_phone'), '')), '');
      g_rel    := coalesce(nullif(d ->> ('guardian' || i || '_relationship'), ''), 'parent');
      g_digits := nullif(regexp_replace(coalesce(g_phone, ''), '\D', '', 'g'), '');
      continue when g_first is null or g_last is null;

      gid := null;
      select g.id into gid
      from public.guardians g
      where g.organization_id = org and g.archived_at is null
        and (
          (g_email is not null and g.email_normalized = g_email)
          or (g_email is null and g_digits is not null and g.phone_digits = g_digits
              and lower(g.first_name) = lower(g_first))
          or (hh is not null and g.household_id = hh
              and lower(g.first_name) = lower(g_first) and lower(g.last_name) = lower(g_last))
        )
      order by (g.household_id is not distinct from hh) desc, g.created_at
      limit 1;

      if gid is null then
        insert into public.guardians (organization_id, household_id, first_name, last_name, email, phone, is_primary_contact)
        values (org, hh, g_first, g_last, g_email, g_phone,
                hh is not null and not exists (select 1 from public.guardians
                                               where household_id = hh and is_primary_contact and archived_at is null))
        returning id into gid;
        n_guardians := n_guardians + 1;
      else
        update public.guardians set
          email        = coalesce(email, g_email),
          phone        = coalesce(phone, g_phone),
          household_id = coalesce(household_id, hh)
        where id = gid;
      end if;

      insert into public.player_guardians (organization_id, player_id, guardian_id, relationship, is_primary)
      values (org, pid, gid, g_rel,
              not exists (select 1 from public.player_guardians where player_id = pid and is_primary))
      on conflict (player_id, guardian_id) do nothing;
    end loop;

    update public.import_rows set status = 'imported', result_player_id = pid where id = r.id;
  end loop;

  result := jsonb_build_object(
    'players_created', n_created,
    'players_linked', n_linked,
    'players_matched_existing', n_existing,
    'rows_skipped', n_skipped,
    'team_assignments', n_teams,
    'households_created', n_households,
    'guardians_created', n_guardians
  );

  update public.imports
     set status = 'completed', completed_at = now(), completed_by = auth.uid(),
         summary = summary || result
   where id = p_import_id;

  if imp.mapping_id is not null then
    update public.import_mappings set last_used_at = now() where id = imp.mapping_id;
  end if;

  return result;
end;
$$;

-- Saves the result of a (re)validation pass in one statement: per-row data,
-- status, issues, duplicate classification, resolution and household plan.
-- p_rows: [{id, data, status, issues, match_type, match_player_id, match_reasons, resolution, household_key}]
create or replace function public.save_import_validation(
  p_import_id uuid,
  p_rows jsonb,
  p_summary jsonb,
  p_column_mapping jsonb default null,
  p_mapping_id uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  imp public.imports;
begin
  select * into imp from public.imports where id = p_import_id for update;
  if not found then
    raise exception 'Import not found.' using errcode = 'no_data_found';
  end if;
  perform public.assert_org_permission(imp.organization_id, 'roster.import');
  if imp.status in ('completed', 'cancelled') then
    raise exception 'This import is already %.', imp.status using errcode = 'check_violation';
  end if;

  update public.import_rows r
     set data = x.data,
         status = x.status,
         issues = coalesce(x.issues, '[]'::jsonb),
         match_type = x.match_type,
         match_player_id = x.match_player_id,
         match_reasons = coalesce(x.match_reasons, '{}'),
         resolution = x.resolution,
         household_key = x.household_key
    from jsonb_to_recordset(p_rows) as x(
      id uuid, data jsonb, status text, issues jsonb, match_type text,
      match_player_id uuid, match_reasons text[], resolution text, household_key text)
   where r.id = x.id and r.import_id = p_import_id;

  update public.imports
     set status = 'validated',
         summary = coalesce(p_summary, '{}'::jsonb),
         column_mapping = coalesce(p_column_mapping, column_mapping),
         mapping_id = coalesce(p_mapping_id, mapping_id)
   where id = p_import_id;
end;
$$;
