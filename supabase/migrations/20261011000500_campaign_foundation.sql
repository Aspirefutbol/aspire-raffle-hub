-- =============================================================================
-- Raffle Hub — 0500 Campaign foundation (schema only; no UI in Phase 1)
-- Establishes how every fundraiser type references the master roster:
--   campaigns → campaign_participants → players (never a copy of the roster).
-- Tickets, inventory, sales, reconciliation and drawings attach to
-- campaign_participants in later phases. No payment/checkout structures exist
-- by design (blueprint: offline/direct payment, Texas CREA mode).
-- =============================================================================

create table public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  season_id         uuid,
  name              text not null check (length(trim(name)) > 0),
  campaign_type     text not null default 'raffle'
                    check (campaign_type in ('raffle', 'sponsor_a_day', 'calendar', 'other')),
  status            text not null default 'DRAFT'
                    check (status in ('DRAFT', 'READY', 'ACTIVE', 'SALES_CLOSED', 'DRAW_LOCKED', 'COMPLETED', 'CANCELLED')),
  jurisdiction_mode text,              -- e.g. TEXAS_CREA_OFFLINE_PAYMENT, copied from org profile at creation
  timezone          text,
  starts_at         timestamptz,
  sales_close_at    timestamptz,
  draw_at           timestamptz,
  settings          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_by        uuid references auth.users (id) on delete set null,
  archived_at       timestamptz,
  unique (id, organization_id),
  foreign key (season_id, organization_id) references public.seasons (id, organization_id),
  check (starts_at is null or sales_close_at is null or starts_at < sales_close_at),
  check (sales_close_at is null or draw_at is null or sales_close_at <= draw_at)
);
create index campaigns_org_idx on public.campaigns (organization_id, created_at desc);

-- A player enrolled in a campaign. team_id / household_id are snapshots taken
-- at enrollment so attribution stays stable if the roster changes mid-campaign.
create table public.campaign_participants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  campaign_id     uuid not null,
  player_id       uuid not null,
  team_id         uuid,
  household_id    uuid,
  status          text not null default 'active' check (status in ('active', 'withdrawn')),
  goal_amount_cents integer check (goal_amount_cents is null or goal_amount_cents >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  unique (campaign_id, player_id),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id),
  foreign key (player_id, organization_id) references public.players (id, organization_id),
  foreign key (team_id, organization_id) references public.teams (id, organization_id),
  foreign key (household_id, organization_id) references public.households (id, organization_id)
);
create index campaign_participants_player_idx on public.campaign_participants (player_id);

create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger campaign_participants_set_updated_at before update on public.campaign_participants
  for each row execute function public.set_updated_at();
create trigger campaigns_set_actor before insert or update on public.campaigns
  for each row execute function public.set_actor_columns();
create trigger campaign_participants_set_actor before insert or update on public.campaign_participants
  for each row execute function public.set_actor_columns();
create trigger campaigns_audit after insert or update on public.campaigns
  for each row execute function public.audit_row_change('CAMPAIGN');
create trigger campaign_participants_audit after insert or update on public.campaign_participants
  for each row execute function public.audit_row_change('CAMPAIGN_PARTICIPANT');

alter table public.campaigns enable row level security;
alter table public.campaign_participants enable row level security;

create policy campaigns_select on public.campaigns for select to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.read'));
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

create policy campaign_participants_select on public.campaign_participants for select to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.read'));
create policy campaign_participants_insert on public.campaign_participants for insert to authenticated
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));
create policy campaign_participants_update on public.campaign_participants for update to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

revoke delete on public.campaigns, public.campaign_participants from anon, authenticated;

-- Fundraising records are never hard-deleted: block it even for privileged roles
-- unless the whole organization is being removed by the platform operator.
create or replace function public.prevent_hard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are never deleted; archive instead.', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger campaigns_no_delete before delete on public.campaigns
  for each row execute function public.prevent_hard_delete();
create trigger campaign_participants_no_delete before delete on public.campaign_participants
  for each row execute function public.prevent_hard_delete();
