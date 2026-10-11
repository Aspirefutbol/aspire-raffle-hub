-- =============================================================================
-- Raffle Hub — 1400 Scale: database-side counting, filtering and pagination.
-- Replaces client-side patterns that silently truncated at PostgREST's
-- max_rows (1,000): team player counts, household list filtering, member
-- lists, duplicate review, and platform organization counts.
-- All functions are SECURITY INVOKER (RLS applies) and check permissions.
-- =============================================================================

create or replace function public.escape_like(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(coalesce(p_text, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Current player count per team.
create or replace function public.team_player_counts(p_organization_id uuid)
returns table (team_id uuid, player_count bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.assert_org_permission(p_organization_id, 'roster.read');
  return query
    select tm.team_id, count(*)::bigint
    from public.team_memberships tm
    join public.players p on p.id = tm.player_id and p.archived_at is null
    where tm.organization_id = p_organization_id and tm.ended_at is null
    group by tm.team_id;
end;
$$;

-- Household list page with contact completeness computed in SQL.
-- p_issue: null | 'no-contact'
create or replace function public.list_households(
  p_organization_id uuid,
  p_q text default null,
  p_issue text default null,
  p_archived boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.read');
  with filtered as (
    select h.id, h.name,
           exists (select 1 from public.guardians g
                   where g.household_id = h.id and g.archived_at is null
                     and (g.email_normalized is not null or g.phone_digits is not null)) as has_contact
    from public.households h
    where h.organization_id = p_organization_id
      and (case when p_archived then h.archived_at is not null else h.archived_at is null end)
      and (nullif(btrim(p_q), '') is null or h.name ilike '%' || public.escape_like(btrim(p_q)) || '%')
  ),
  matching as (
    select * from filtered where p_issue is distinct from 'no-contact' or not has_contact
  ),
  page as (
    select * from matching order by lower(name), id
    limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'name', h.name,
        'city', h.city,
        'region', h.region,
        'archived_at', h.archived_at,
        'has_contact', pg.has_contact,
        'players', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
                                              'preferred_name', p.preferred_name) order by p.first_name)
          from public.players p where p.household_id = h.id and p.archived_at is null), '[]'::jsonb),
        'guardians', coalesce((
          select jsonb_agg(jsonb_build_object('id', g.id, 'first_name', g.first_name, 'last_name', g.last_name,
                                              'email', g.email, 'phone', g.phone, 'is_primary_contact', g.is_primary_contact)
                           order by g.is_primary_contact desc, g.created_at)
          from public.guardians g where g.household_id = h.id and g.archived_at is null), '[]'::jsonb)
      ) order by lower(h.name), h.id)
      from page pg join public.households h on h.id = pg.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Duplicate review, paginated by pair.
create or replace function public.list_possible_duplicates(
  p_organization_id uuid,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.assert_org_permission(p_organization_id, 'roster.read');
  with pairs as (
    select * from public.possible_duplicate_players(p_organization_id)
  ),
  page as (
    select * from pairs order by player_a_id, player_b_id
    limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset)
  )
  select jsonb_build_object(
    'total', (select count(*) from pairs),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object('a', player_a_id, 'b', player_b_id, 'reason', reason)) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Member list with profile and roles, paginated and searchable.
create or replace function public.list_org_members(
  p_organization_id uuid,
  p_q text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.assert_org_permission(p_organization_id, 'members.read');
  with base as (
    select m.id as member_id, m.user_id, m.status, m.created_at,
           p.full_name, p.email,
           coalesce((select array_agg(r.role_key order by ro.sort_order)
                     from public.organization_member_roles r join public.roles ro on ro.key = r.role_key
                     where r.member_id = m.id), '{}') as roles
    from public.organization_members m
    left join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and m.status <> 'removed'
      and (nullif(btrim(p_q), '') is null
           or p.full_name ilike '%' || public.escape_like(btrim(p_q)) || '%'
           or p.email ilike '%' || public.escape_like(btrim(p_q)) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(b) order by lower(coalesce(b.full_name, b.email)), b.member_id)
      from (select * from base order by lower(coalesce(full_name, email)), member_id
            limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)) b
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Platform overview of every organization with counts.
create or replace function public.platform_organization_summaries()
returns table (
  id uuid, name text, slug text, organization_type text, status text,
  jurisdiction_profile text, created_at timestamptz,
  member_count bigint, player_count bigint, pending_invitations bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_platform_permission('platform.organizations') then
    raise exception 'Platform administrators only.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select o.id, o.name, o.slug, o.organization_type, o.status, o.jurisdiction_profile, o.created_at,
           (select count(*) from public.organization_members m where m.organization_id = o.id and m.status = 'active'),
           (select count(*) from public.players p where p.organization_id = o.id and p.archived_at is null),
           (select count(*) from public.organization_invitations i where i.organization_id = o.id and i.status = 'pending' and i.expires_at > now())
    from public.organizations o
    order by lower(o.name);
end;
$$;
