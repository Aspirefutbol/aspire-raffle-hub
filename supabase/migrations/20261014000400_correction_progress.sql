-- =============================================================================
-- Phase 1: redacted correction associations in recent campaign sales.
-- Existing campaign_progress scope, filters, totals and permission checks are
-- unchanged. IDs let clients identify replacements and avoid offering a second
-- correction. No buyer details, new role grants or ledger columns are added.
-- CREATE OR REPLACE preserves the existing authenticated-only execute grants.
-- =============================================================================

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
      -- Associations expose IDs only from the same already-authorized
      -- participant subset. They never expand family/team or tenant scope.
      'corrects_sale_id', (select original.id from visible_sales original
        where original.id = s.corrects_sale_id
          and original.organization_id = p_organization_id
          and original.campaign_id = p_campaign_id
          and original.participant_id = s.participant_id),
      'replacement_sale_id', (select replacement.id from visible_sales replacement
        where replacement.corrects_sale_id = s.id
          and replacement.organization_id = p_organization_id
          and replacement.campaign_id = p_campaign_id
          and replacement.participant_id = s.participant_id),
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

comment on function public.campaign_progress(uuid, uuid, text, uuid, uuid) is
  'Redacted fundraising progress with correction associations restricted to the same authorized participant subset. No buyer details or expanded access.';
