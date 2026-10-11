-- =============================================================================
-- Raffle Hub — 0300 Roster functions
-- Multi-record writes run as single transactions here (supabase-js cannot open
-- client transactions). All functions are SECURITY INVOKER: the caller's RLS
-- policies still apply, and each function also checks permissions up front to
-- return a clear error instead of a silent zero-row result.
-- =============================================================================

create or replace function public.assert_org_permission(p_organization_id uuid, p_permission text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.has_org_permission(p_organization_id, p_permission) then
    raise exception 'You do not have permission to perform this action (%).', p_permission
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Ends the player's current membership (if different) and starts a new one.
-- p_team_id null = unassign. Returns true when anything changed.
create or replace function public.set_player_team(p_organization_id uuid, p_player_id uuid, p_team_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  current_team uuid;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.write');

  if p_team_id is not null and not exists (
    select 1 from public.teams where id = p_team_id and organization_id = p_organization_id and archived_at is null
  ) then
    raise exception 'Team not found or archived.' using errcode = 'foreign_key_violation';
  end if;

  select team_id into current_team
  from public.team_memberships
  where player_id = p_player_id and organization_id = p_organization_id and ended_at is null;

  if current_team is not distinct from p_team_id then
    return false;
  end if;

  update public.team_memberships
     set ended_at = now(), end_reason = case when p_team_id is null then 'removed' else 'team_change' end
   where player_id = p_player_id and organization_id = p_organization_id and ended_at is null;

  if p_team_id is not null then
    insert into public.team_memberships (organization_id, player_id, team_id)
    values (p_organization_id, p_player_id, p_team_id);
  end if;
  return true;
end;
$$;

-- Bulk team assignment. Returns the number of players whose team changed.
create or replace function public.bulk_set_player_team(p_organization_id uuid, p_player_ids uuid[], p_team_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  pid uuid;
  changed integer := 0;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.write');
  foreach pid in array coalesce(p_player_ids, '{}') loop
    if exists (select 1 from public.players where id = pid and organization_id = p_organization_id and archived_at is null) then
      if public.set_player_team(p_organization_id, pid, p_team_id) then
        changed := changed + 1;
      end if;
    end if;
  end loop;
  return changed;
end;
$$;

-- Creates a guardian (optionally in a household) and links it to players.
-- p_guardian: {first_name, last_name, email, phone, relationship, is_primary_contact}
create or replace function public.create_guardian(
  p_organization_id uuid,
  p_household_id uuid,
  p_guardian jsonb,
  p_player_ids uuid[] default '{}',
  p_make_primary boolean default false
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_guardian_id uuid;
  pid uuid;
  rel text := coalesce(nullif(p_guardian ->> 'relationship', ''), 'parent');
begin
  perform public.assert_org_permission(p_organization_id, 'roster.write');

  insert into public.guardians (organization_id, household_id, first_name, last_name, email, phone,
                                is_primary_contact, communication_preferences)
  values (
    p_organization_id,
    p_household_id,
    trim(p_guardian ->> 'first_name'),
    trim(p_guardian ->> 'last_name'),
    nullif(trim(coalesce(p_guardian ->> 'email', '')), ''),
    nullif(trim(coalesce(p_guardian ->> 'phone', '')), ''),
    coalesce((p_guardian ->> 'is_primary_contact')::boolean, false)
      and p_household_id is not null
      and not exists (select 1 from public.guardians
                      where household_id = p_household_id and is_primary_contact and archived_at is null),
    coalesce(p_guardian -> 'communication_preferences', '{"email": true, "sms": false}'::jsonb)
  )
  returning id into new_guardian_id;

  foreach pid in array coalesce(p_player_ids, '{}') loop
    if p_make_primary or not exists (select 1 from public.player_guardians where player_id = pid and is_primary) then
      update public.player_guardians set is_primary = false where player_id = pid and is_primary;
      insert into public.player_guardians (organization_id, player_id, guardian_id, relationship, is_primary)
      values (p_organization_id, pid, new_guardian_id, rel, true);
    else
      insert into public.player_guardians (organization_id, player_id, guardian_id, relationship, is_primary)
      values (p_organization_id, pid, new_guardian_id, rel, false);
    end if;
  end loop;

  return new_guardian_id;
end;
$$;

-- Fast "Add Player": player + optional team + optional household (existing or
-- new) + optional guardian (existing or new), all-or-nothing.
--
-- p_player:    {first_name, last_name, preferred_name, date_of_birth, gender, external_player_id, notes}
-- p_household: null | {id} | {name}
-- p_guardian:  null | {id, relationship} | {first_name, last_name, email, phone, relationship}
create or replace function public.create_player(
  p_organization_id uuid,
  p_player jsonb,
  p_team_id uuid default null,
  p_household jsonb default null,
  p_guardian jsonb default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  household uuid;
  new_player_id uuid;
  guardian uuid;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.write');

  if p_household ? 'id' then
    household := (p_household ->> 'id')::uuid;
  elsif nullif(trim(coalesce(p_household ->> 'name', '')), '') is not null then
    insert into public.households (organization_id, name)
    values (p_organization_id, trim(p_household ->> 'name'))
    returning id into household;
  elsif p_guardian ? 'id' then
    -- Linking an existing guardian implies their household.
    select household_id into household from public.guardians
    where id = (p_guardian ->> 'id')::uuid and organization_id = p_organization_id;
  end if;

  insert into public.players (organization_id, household_id, first_name, last_name, preferred_name,
                              date_of_birth, gender, external_player_id, notes)
  values (
    p_organization_id,
    household,
    trim(p_player ->> 'first_name'),
    trim(p_player ->> 'last_name'),
    nullif(trim(coalesce(p_player ->> 'preferred_name', '')), ''),
    nullif(p_player ->> 'date_of_birth', '')::date,
    nullif(p_player ->> 'gender', ''),
    nullif(trim(coalesce(p_player ->> 'external_player_id', '')), ''),
    nullif(trim(coalesce(p_player ->> 'notes', '')), '')
  )
  returning id into new_player_id;

  if p_team_id is not null then
    perform public.set_player_team(p_organization_id, new_player_id, p_team_id);
  end if;

  if p_guardian ? 'id' then
    insert into public.player_guardians (organization_id, player_id, guardian_id, relationship, is_primary)
    values (p_organization_id, new_player_id, (p_guardian ->> 'id')::uuid,
            coalesce(nullif(p_guardian ->> 'relationship', ''), 'parent'), true);
  elsif nullif(trim(coalesce(p_guardian ->> 'first_name', '')), '') is not null then
    guardian := public.create_guardian(
      p_organization_id, household,
      p_guardian || jsonb_build_object('is_primary_contact', true),
      array[new_player_id], true);
  end if;

  return new_player_id;
end;
$$;

-- Makes one linked guardian the player's primary guardian.
create or replace function public.set_primary_guardian(p_organization_id uuid, p_player_id uuid, p_guardian_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_org_permission(p_organization_id, 'roster.write');
  if not exists (select 1 from public.player_guardians
                 where player_id = p_player_id and guardian_id = p_guardian_id and organization_id = p_organization_id) then
    raise exception 'Guardian is not linked to this player.' using errcode = 'foreign_key_violation';
  end if;
  update public.player_guardians set is_primary = false
   where player_id = p_player_id and is_primary and guardian_id <> p_guardian_id;
  update public.player_guardians set is_primary = true
   where player_id = p_player_id and guardian_id = p_guardian_id and not is_primary;
end;
$$;

-- Makes a guardian the household's primary contact.
create or replace function public.set_household_primary_contact(p_organization_id uuid, p_guardian_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  hh uuid;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.write');
  select household_id into hh from public.guardians
  where id = p_guardian_id and organization_id = p_organization_id and archived_at is null;
  if hh is null then
    raise exception 'Guardian must belong to a household.' using errcode = 'check_violation';
  end if;
  update public.guardians set is_primary_contact = false
   where household_id = hh and is_primary_contact and id <> p_guardian_id;
  update public.guardians set is_primary_contact = true where id = p_guardian_id and not is_primary_contact;
end;
$$;

-- Moves players into a household and links them to that household's guardians.
create or replace function public.add_players_to_household(p_organization_id uuid, p_household_id uuid, p_player_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  moved integer;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.write');
  update public.players set household_id = p_household_id
   where organization_id = p_organization_id and id = any (p_player_ids)
     and household_id is distinct from p_household_id;
  get diagnostics moved = row_count;

  insert into public.player_guardians (organization_id, player_id, guardian_id, relationship, is_primary)
  select p_organization_id, p.id, g.id, 'parent',
         g.is_primary_contact and not exists (select 1 from public.player_guardians x where x.player_id = p.id and x.is_primary)
  from public.players p
  cross join public.guardians g
  where p.id = any (p_player_ids) and p.organization_id = p_organization_id
    and g.household_id = p_household_id and g.archived_at is null
  on conflict (player_id, guardian_id) do nothing;

  return moved;
end;
$$;

-- Possible duplicate players within the organization (active roster only).
create or replace function public.possible_duplicate_players(p_organization_id uuid)
returns table (player_a_id uuid, player_b_id uuid, reason text)
language sql
stable
set search_path = ''
as $$
  select a.id, b.id,
         case
           when a.date_of_birth is not null and a.date_of_birth = b.date_of_birth then 'Same name and date of birth'
           when a.date_of_birth is null or b.date_of_birth is null then 'Same name, date of birth missing'
           else 'Same name'
         end
  from public.players a
  join public.players b
    on b.organization_id = a.organization_id
   and a.id < b.id
   and lower(trim(a.first_name)) = lower(trim(b.first_name))
   and lower(trim(a.last_name)) = lower(trim(b.last_name))
   and (a.date_of_birth is null or b.date_of_birth is null or a.date_of_birth = b.date_of_birth)
  where a.organization_id = p_organization_id
    and a.archived_at is null and b.archived_at is null
    and not exists (select 1 from public.player_duplicate_dismissals d
                    where d.player_a_id = a.id and d.player_b_id = b.id);
$$;

-- Dashboard metrics + Action Needed counts in one round trip.
create or replace function public.roster_overview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.read');

  with active_players as (
    select p.id, p.household_id
    from public.players p
    where p.organization_id = p_organization_id and p.archived_at is null and p.status = 'active'
  ),
  dup as (
    select player_a_id as id from public.possible_duplicate_players(p_organization_id)
    union
    select player_b_id from public.possible_duplicate_players(p_organization_id)
  )
  select jsonb_build_object(
    'total_players', (select count(*) from active_players),
    'active_teams', (select count(*) from public.teams
                      where organization_id = p_organization_id and status = 'active'),
    'households', (select count(*) from public.households
                    where organization_id = p_organization_id and archived_at is null),
    'unassigned_players', (select count(*) from active_players ap
                            where not exists (select 1 from public.team_memberships tm
                                              where tm.player_id = ap.id and tm.ended_at is null)),
    'players_without_guardian', (select count(*) from active_players ap
                                  where not exists (select 1 from public.player_guardians pg
                                                    join public.guardians g on g.id = pg.guardian_id and g.archived_at is null
                                                    where pg.player_id = ap.id)),
    'possible_duplicates', (select count(*) from dup),
    'households_missing_contact', (select count(*) from public.households h
                                    where h.organization_id = p_organization_id and h.archived_at is null
                                      and not exists (select 1 from public.guardians g
                                                      where g.household_id = h.id and g.archived_at is null
                                                        and (g.email_normalized is not null or g.phone_digits is not null))),
    'open_imports', (select count(*) from public.imports
                      where organization_id = p_organization_id
                        and status in ('uploaded', 'mapped', 'validated')),
    'recent_imports', coalesce((
      select jsonb_agg(r order by r.created_at desc)
      from (select id, file_name, status, row_count, summary, created_at
            from public.imports
            where organization_id = p_organization_id and status <> 'cancelled'
            order by created_at desc limit 5) r
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- Archives a team and unassigns its current players (they surface in Action
-- Needed as "missing team"). Restoring a team does not re-add players.
create or replace function public.archive_team(p_organization_id uuid, p_team_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  released integer;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.write');
  update public.team_memberships
     set ended_at = now(), end_reason = 'removed'
   where team_id = p_team_id and organization_id = p_organization_id and ended_at is null;
  get diagnostics released = row_count;
  update public.teams
     set status = 'archived', archived_at = now()
   where id = p_team_id and organization_id = p_organization_id and archived_at is null;
  if not found then
    raise exception 'Team not found or already archived.' using errcode = 'no_data_found';
  end if;
  return released;
end;
$$;

-- Makes one season current (at most one per organization, enforced by index).
create or replace function public.set_current_season(p_organization_id uuid, p_season_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_org_permission(p_organization_id, 'organization.manage');
  update public.seasons set is_current = false
   where organization_id = p_organization_id and is_current and id <> p_season_id;
  update public.seasons set is_current = true
   where organization_id = p_organization_id and id = p_season_id and archived_at is null;
  if not found then
    raise exception 'Season not found.' using errcode = 'no_data_found';
  end if;
end;
$$;
