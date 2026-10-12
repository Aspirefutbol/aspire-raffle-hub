-- =============================================================================
-- Phase 1: actor-bound fundraising reads and redacted progress projections.
-- Existing role grants and raw ledger policies are deliberately unchanged.
-- Enrollment snapshots preserve attribution, never continuing authorization.
-- =============================================================================

create or replace function public.can_read_fundraising_participant(
  p_participant_id uuid,
  p_view text default 'any'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_participants cp
    join public.campaigns c on c.id = cp.campaign_id and c.organization_id = cp.organization_id
    join public.organizations o on o.id = cp.organization_id
    join public.players p on p.id = cp.player_id and p.organization_id = cp.organization_id
    where cp.id = p_participant_id
      and o.status = 'active' and o.archived_at is null
      and (
        (p_view in ('admin', 'any') and public.has_org_permission(cp.organization_id, 'campaigns.read'))
        or (
          c.status in ('ACTIVE', 'CLOSED', 'DRAWN') and c.archived_at is null
          and p.status = 'active' and p.archived_at is null
          and (
            (p_view in ('family', 'any')
              and public.has_org_permission(cp.organization_id, 'roster.read_own_family')
              and cp.player_id in (select public.my_family_player_ids()))
            or (p_view in ('team', 'any')
              and public.has_org_permission(cp.organization_id, 'roster.read_assigned_teams')
              and cp.team_id in (select public.my_assigned_team_ids())
              and cp.player_id in (select public.my_team_player_ids()))
          )
        )
      )
  );
$$;

-- Buyer details are not part of team/campaign-reader visibility. Families may
-- read sale facts only for their current family participants; financial readers
-- keep their existing organization-wide financial authority.
create or replace function public.can_read_fundraising_sale(p_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_sales s
    join public.organizations o on o.id = s.organization_id
    where s.id = p_sale_id and o.status = 'active' and o.archived_at is null
      and (
        public.has_org_permission(s.organization_id, 'organization.manage')
        or public.has_org_permission(s.organization_id, 'reconciliation.manage')
        or public.has_org_permission(s.organization_id, 'adjustments.approve')
        or public.has_org_permission(s.organization_id, 'audit.read')
        or (
          public.has_org_permission(s.organization_id, 'tickets.issue')
          and public.can_read_fundraising_participant(s.participant_id, 'family')
        )
      )
  );
$$;

revoke all on function public.can_read_fundraising_participant(uuid, text),
  public.can_read_fundraising_sale(uuid) from public, anon;
grant execute on function public.can_read_fundraising_participant(uuid, text),
  public.can_read_fundraising_sale(uuid) to authenticated;

-- Scoped SELECT complements the original broad campaigns.read participant
-- policy. The family and team predicates remain separate even for dual roles.
create policy campaign_participants_select_fundraising_scoped
  on public.campaign_participants for select to authenticated
  using (public.can_read_fundraising_participant(id, 'family')
         or public.can_read_fundraising_participant(id, 'team'));

alter table public.tickets enable row level security;
alter table public.ticket_allocations enable row level security;
alter table public.campaign_sales enable row level security;
alter table public.sale_reversals enable row level security;
alter table public.campaign_team_goals enable row level security;

create policy tickets_select_fundraising on public.tickets for select to authenticated
  using (
    exists (select 1 from public.organizations o
            where o.id = organization_id and o.status = 'active' and o.archived_at is null)
    and (public.has_org_permission(organization_id, 'campaigns.read')
         or public.can_read_fundraising_participant(participant_id, 'family')
         or public.can_read_fundraising_participant(participant_id, 'team'))
  );

create policy ticket_allocations_select_fundraising
  on public.ticket_allocations for select to authenticated
  using (public.can_read_fundraising_participant(participant_id));

create policy campaign_sales_select_fundraising
  on public.campaign_sales for select to authenticated
  using (public.can_read_fundraising_sale(id));

create policy sale_reversals_select_fundraising
  on public.sale_reversals for select to authenticated
  using (public.can_read_fundraising_sale(sale_id));

create policy campaign_team_goals_select_fundraising
  on public.campaign_team_goals for select to authenticated
  using (
    exists (select 1 from public.organizations o
            where o.id = organization_id and o.status = 'active' and o.archived_at is null)
    and (
      public.has_org_permission(organization_id, 'campaigns.read')
      or exists (
        select 1 from public.campaign_participants cp
        where cp.organization_id = campaign_team_goals.organization_id
          and cp.campaign_id = campaign_team_goals.campaign_id
          and cp.team_id = campaign_team_goals.team_id
          and (public.can_read_fundraising_participant(cp.id, 'family')
               or public.can_read_fundraising_participant(cp.id, 'team'))
      )
    )
  );

create or replace function public.fundraising_campaigns(
  p_organization_id uuid,
  p_view text default 'admin'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  required_permission text;
begin
  required_permission := case p_view
    when 'admin' then 'campaigns.read'
    when 'family' then 'roster.read_own_family'
    when 'team' then 'roster.read_assigned_teams'
    else null end;
  if required_permission is null then
    raise exception 'Unknown fundraising view.' using errcode = 'invalid_parameter_value';
  end if;
  if not public.has_org_permission(p_organization_id, required_permission)
     or not exists (select 1 from public.organizations o
                    where o.id = p_organization_id and o.status = 'active' and o.archived_at is null) then
    raise exception 'Fundraising workspace unavailable.' using errcode = 'insufficient_privilege';
  end if;

  with visible_participants as materialized (
    select cp.* from public.campaign_participants cp
    where cp.organization_id = p_organization_id
      and public.can_read_fundraising_participant(cp.id, p_view)
  ),
  participation as (
    select cp.campaign_id,
      count(*) filter (where cp.status = 'active') as player_count,
      count(distinct cp.team_id) filter (where cp.status = 'active') as team_count
    from visible_participants cp group by cp.campaign_id
  ),
  sales as (
    select s.campaign_id, sum(s.amount_cents) as raised_cents, sum(s.quantity) as tickets_sold
    from public.campaign_sales s
    join visible_participants cp on cp.id = s.participant_id
      and cp.organization_id = s.organization_id and cp.campaign_id = s.campaign_id
    where not exists (select 1 from public.sale_reversals r where r.sale_id = s.id)
    group by s.campaign_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status,
      'ticket_price_cents', c.ticket_price_cents, 'goal_amount_cents', c.goal_amount_cents,
      'player_goal_default_cents', c.player_goal_default_cents,
      'team_goal_default_cents', c.team_goal_default_cents,
      'default_allocation', c.default_allocation, 'ticket_prefix', c.ticket_prefix,
      'starts_at', c.starts_at, 'sales_close_at', c.sales_close_at, 'draw_at', c.draw_at,
      'description', c.description, 'support_email', c.support_email, 'support_phone', c.support_phone
    ),
    'totals', jsonb_build_object(
      'raised_cents', coalesce(s.raised_cents, 0), 'tickets_sold', coalesce(s.tickets_sold, 0),
      'player_count', coalesce(p.player_count, 0), 'team_count', coalesce(p.team_count, 0)
    )
  ) order by case c.status when 'ACTIVE' then 0 when 'READY' then 1 when 'DRAFT' then 2
                           when 'CLOSED' then 3 when 'DRAWN' then 4 else 5 end,
             c.created_at desc, c.id), '[]'::jsonb)
  into result
  from public.campaigns c
  left join participation p on p.campaign_id = c.id
  left join sales s on s.campaign_id = c.id
  where c.organization_id = p_organization_id
    and (p_view = 'admin' or exists (
      select 1 from visible_participants cp where cp.campaign_id = c.id
    ));
  return result;
end;
$$;

create or replace function public.campaign_progress(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_view text default 'admin',
  p_team_id uuid default null,
  p_player_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.campaigns;
  result jsonb;
  required_permission text;
begin
  required_permission := case p_view
    when 'admin' then 'campaigns.read'
    when 'family' then 'roster.read_own_family'
    when 'team' then 'roster.read_assigned_teams'
    else null end;
  if required_permission is null then
    raise exception 'Unknown fundraising view.' using errcode = 'invalid_parameter_value';
  end if;
  if not public.has_org_permission(p_organization_id, required_permission)
     or not exists (select 1 from public.organizations o
                    where o.id = p_organization_id and o.status = 'active' and o.archived_at is null) then
    raise exception 'Fundraising workspace unavailable.' using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.campaigns
  where id = p_campaign_id and organization_id = p_organization_id;
  if not found or (p_view <> 'admin' and not exists (
    select 1 from public.campaign_participants cp
    where cp.organization_id = p_organization_id and cp.campaign_id = p_campaign_id
      and public.can_read_fundraising_participant(cp.id, p_view)
  )) then
    raise exception 'Campaign unavailable.' using errcode = 'insufficient_privilege';
  end if;

  -- Apply the current actor's scope and requested filters BEFORE every metric,
  -- ranking and sale list. An unauthorized filter returns no records/metadata.
  with visible_participants as materialized (
    select cp.*, concat_ws(' ', p.first_name, p.last_name) as player_name, t.name as team_name
    from public.campaign_participants cp
    join public.players p on p.id = cp.player_id and p.organization_id = cp.organization_id
    left join public.teams t on t.id = cp.team_id and t.organization_id = cp.organization_id
    where cp.organization_id = p_organization_id and cp.campaign_id = p_campaign_id
      and public.can_read_fundraising_participant(cp.id, p_view)
      and (p_team_id is null or cp.team_id = p_team_id)
      and (p_player_id is null or cp.player_id = p_player_id)
  ),
  visible_sales as materialized (
    select s.*, cp.player_name,
      exists (select 1 from public.sale_reversals r where r.sale_id = s.id) as reversed
    from public.campaign_sales s
    join visible_participants cp on cp.id = s.participant_id
      and cp.organization_id = s.organization_id and cp.campaign_id = s.campaign_id
  ),
  sale_sums as (
    select s.participant_id,
      coalesce(sum(s.amount_cents) filter (where not s.reversed), 0) as raised_cents,
      coalesce(sum(s.quantity) filter (where not s.reversed), 0) as tickets_sold
    from visible_sales s group by s.participant_id
  ),
  ticket_stats as (
    select t.participant_id,
      count(*) filter (where t.status = 'ALLOCATED') as available_tickets,
      (array_agg(t.ticket_number order by t.sequence_number, t.id))[1] as first_ticket,
      (array_agg(t.ticket_number order by t.sequence_number desc, t.id desc))[1] as last_ticket
    from public.tickets t
    join visible_participants cp on cp.id = t.participant_id
      and cp.organization_id = t.organization_id and cp.campaign_id = t.campaign_id
    group by t.participant_id
  ),
  metrics as materialized (
    select cp.*, coalesce(cp.goal_amount_cents, c.player_goal_default_cents) as effective_goal,
      coalesce(s.raised_cents, 0) as raised_cents, coalesce(s.tickets_sold, 0) as tickets_sold,
      coalesce(ts.available_tickets, 0) as available_tickets, ts.first_ticket, ts.last_ticket
    from visible_participants cp
    left join sale_sums s on s.participant_id = cp.id
    left join ticket_stats ts on ts.participant_id = cp.id
  ),
  team_metrics as (
    select m.team_id, m.team_name,
      coalesce(g.goal_amount_cents, c.team_goal_default_cents) as goal_amount_cents,
      sum(m.raised_cents) as raised_cents, sum(m.tickets_sold) as tickets_sold,
      count(*) filter (where m.status = 'active') as player_count
    from metrics m
    left join public.campaign_team_goals g on g.organization_id = p_organization_id
      and g.campaign_id = p_campaign_id and g.team_id = m.team_id
    where m.team_id is not null
    group by m.team_id, m.team_name, g.goal_amount_cents
  ),
  recent as (
    select s.* from visible_sales s order by s.sold_at desc, s.created_at desc, s.id desc limit 20
  )
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status,
      'ticket_price_cents', c.ticket_price_cents, 'goal_amount_cents', c.goal_amount_cents,
      'player_goal_default_cents', c.player_goal_default_cents,
      'team_goal_default_cents', c.team_goal_default_cents,
      'default_allocation', c.default_allocation, 'ticket_prefix', c.ticket_prefix,
      'starts_at', c.starts_at, 'sales_close_at', c.sales_close_at, 'draw_at', c.draw_at,
      'description', c.description, 'support_email', c.support_email, 'support_phone', c.support_phone
    ),
    'totals', (select jsonb_build_object(
      'raised_cents', coalesce(sum(m.raised_cents), 0),
      'tickets_sold', coalesce(sum(m.tickets_sold), 0),
      'player_count', count(*) filter (where m.status = 'active'),
      'team_count', count(distinct m.team_id) filter (where m.status = 'active')
    ) from metrics m),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'player_id', m.player_id, 'player_name', m.player_name,
      'team_id', m.team_id, 'team_name', m.team_name, 'status', m.status,
      'goal_amount_cents', m.effective_goal, 'raised_cents', m.raised_cents,
      'tickets_sold', m.tickets_sold, 'available_tickets', m.available_tickets,
      'ticket_range', jsonb_build_object('first', m.first_ticket, 'last', m.last_ticket),
      'can_record_sale', coalesce(
        c.status = 'ACTIVE' and c.campaign_type = 'raffle' and m.status = 'active'
        and m.available_tickets > 0 and c.starts_at <= now() and c.sales_close_at > now()
        and exists (select 1 from public.players p where p.id = m.player_id
                    and p.organization_id = p_organization_id and p.status = 'active' and p.archived_at is null)
        and public.has_org_permission(p_organization_id, 'tickets.issue')
        and (public.has_org_permission(p_organization_id, 'organization.manage')
             or (public.has_org_permission(p_organization_id, 'roster.read_own_family')
                 and m.player_id in (select public.my_family_player_ids()))), false)
    ) order by lower(m.player_name), m.player_id) from metrics m), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
      'id', tm.team_id, 'name', tm.team_name, 'goal_amount_cents', tm.goal_amount_cents,
      'raised_cents', tm.raised_cents, 'tickets_sold', tm.tickets_sold, 'player_count', tm.player_count
    ) order by lower(tm.team_name), tm.team_id) from team_metrics tm), '[]'::jsonb),
    'recent_sales', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'participant_id', s.participant_id, 'player_name', s.player_name,
      'quantity', s.quantity, 'amount_cents', s.amount_cents,
      'payment_method', s.payment_method, 'sold_at', s.sold_at, 'reversed', s.reversed,
      'ticket_numbers', coalesce((select jsonb_agg(t.ticket_number order by t.sequence_number, t.id)
        from public.tickets t where t.sale_id = s.id and t.organization_id = p_organization_id
          and t.campaign_id = p_campaign_id), '[]'::jsonb),
      'can_reverse', p_view = 'admin' and not s.reversed and c.status in ('ACTIVE', 'CLOSED')
        and public.has_org_permission(p_organization_id, 'tickets.void')
        and public.has_org_permission(p_organization_id, 'adjustments.approve')
    ) order by s.sold_at desc, s.created_at desc, s.id desc) from recent s), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.fundraising_campaigns(uuid, text),
  public.campaign_progress(uuid, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.fundraising_campaigns(uuid, text),
  public.campaign_progress(uuid, uuid, text, uuid, uuid) to authenticated;

comment on function public.fundraising_campaigns(uuid, text) is
  'Actor-bound campaign summaries. Family and team views use separate current scopes; no buyer details or raw financial ledger access.';
comment on function public.campaign_progress(uuid, uuid, text, uuid, uuid) is
  'Redacted fundraising progress; every aggregate and filter applies to the same current authorized participant subset. Withdrawn financial history is retained.';
