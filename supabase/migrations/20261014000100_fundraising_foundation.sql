-- Phase 1: immutable sale facts and assigned inventory. Existing hashed ledger
-- row schemas stay unchanged; correlations use their existing metadata fields.

alter table public.campaigns
  add column player_goal_default_cents bigint check (player_goal_default_cents between 0 and 100000000),
  add column team_goal_default_cents bigint check (team_goal_default_cents between 0 and 100000000);
alter table public.campaign_participants
  add constraint campaign_participants_identity_uq unique (id, organization_id, campaign_id);
alter table public.money_events
  add constraint money_events_identity_uq unique (id, organization_id, campaign_id);
-- Enforce new references without rewriting or rejecting historical prepared
-- ledger rows. Nullable legacy participant references remain valid.
alter table public.money_events
  add constraint money_events_participant_scope_fk
  foreign key (participant_id, organization_id, campaign_id)
  references public.campaign_participants(id, organization_id, campaign_id) not valid;

create table public.campaign_ticket_counters (
  campaign_id uuid primary key,
  organization_id uuid not null,
  next_sequence bigint not null default 1 check (next_sequence between 1 and 1000001),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id)
);

create table public.ticket_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  participant_id uuid not null,
  quantity integer not null check (quantity between 1 and 10000),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  unique (id, organization_id, campaign_id, participant_id),
  foreign key (participant_id, organization_id, campaign_id)
    references public.campaign_participants(id, organization_id, campaign_id)
);

create table public.campaign_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  participant_id uuid not null,
  buyer_name text not null check (length(btrim(buyer_name)) between 1 and 200),
  buyer_email text check (length(buyer_email) <= 254 and buyer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  buyer_phone text check (length(buyer_phone) <= 50),
  quantity integer not null check (quantity between 1 and 500),
  amount_cents bigint not null check (amount_cents > 0),
  payment_method text not null check (payment_method in ('cash', 'check')),
  notes text check (length(notes) <= 2000),
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 200),
  request_fingerprint text not null,
  collection_event_id uuid not null,
  corrects_sale_id uuid,
  unique (id, organization_id, campaign_id),
  unique (id, organization_id, campaign_id, participant_id),
  unique (organization_id, created_by, idempotency_key),
  foreign key (participant_id, organization_id, campaign_id)
    references public.campaign_participants(id, organization_id, campaign_id),
  foreign key (collection_event_id, organization_id, campaign_id)
    references public.money_events(id, organization_id, campaign_id),
  foreign key (corrects_sale_id, organization_id, campaign_id, participant_id)
    references public.campaign_sales(id, organization_id, campaign_id, participant_id)
);
create unique index campaign_sales_one_correction_uq on public.campaign_sales(corrects_sale_id)
  where corrects_sale_id is not null;
create index campaign_sales_progress_idx on public.campaign_sales(campaign_id, participant_id, sold_at desc);

create table public.sale_reversals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  sale_id uuid not null unique,
  collection_event_id uuid not null,
  reversal_event_id uuid not null unique,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  approved_by uuid not null references auth.users(id),
  foreign key (sale_id, organization_id, campaign_id)
    references public.campaign_sales(id, organization_id, campaign_id),
  foreign key (collection_event_id, organization_id, campaign_id)
    references public.money_events(id, organization_id, campaign_id),
  foreign key (reversal_event_id, organization_id, campaign_id)
    references public.money_events(id, organization_id, campaign_id)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  sequence_number bigint not null check (sequence_number between 1 and 1000000),
  ticket_number text not null,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'ALLOCATED', 'ISSUED', 'VOIDED')),
  participant_id uuid,
  allocation_id uuid,
  sale_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  unique (id, organization_id, campaign_id),
  unique (campaign_id, sequence_number),
  unique (campaign_id, ticket_number),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id),
  foreign key (participant_id, organization_id, campaign_id)
    references public.campaign_participants(id, organization_id, campaign_id),
  foreign key (allocation_id, organization_id, campaign_id, participant_id)
    references public.ticket_allocations(id, organization_id, campaign_id, participant_id),
  foreign key (sale_id, organization_id, campaign_id, participant_id)
    references public.campaign_sales(id, organization_id, campaign_id, participant_id),
  check ((status = 'AVAILABLE' and participant_id is null and allocation_id is null and sale_id is null)
    or (status = 'ALLOCATED' and participant_id is not null and allocation_id is not null and sale_id is null)
    or (status in ('ISSUED', 'VOIDED') and participant_id is not null and allocation_id is not null and sale_id is not null))
);
create index tickets_inventory_idx on public.tickets(campaign_id, status, participant_id, sequence_number);

create table public.campaign_team_goals (
  id uuid not null default gen_random_uuid() unique,
  organization_id uuid not null,
  campaign_id uuid not null,
  team_id uuid not null,
  goal_amount_cents bigint check (goal_amount_cents between 0 and 100000000),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  primary key (campaign_id, team_id),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id),
  foreign key (team_id, organization_id) references public.teams(id, organization_id)
);

-- Client roles cannot write financial facts or inventory projections directly.
-- Trigger guards also protect privileged accidental writes and immutable identity.
create function public.guard_fundraising_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('raffle_hub.fundraising_write', true), '') <> new.campaign_id::text then
    raise exception 'Use a fundraising transaction to change this record.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'tickets' then
    if (new.id, new.organization_id, new.campaign_id, new.sequence_number, new.ticket_number, new.created_at, new.created_by)
       is distinct from (old.id, old.organization_id, old.campaign_id, old.sequence_number, old.ticket_number, old.created_at, old.created_by) then
      raise exception 'Ticket identity is immutable.' using errcode = 'insufficient_privilege';
    end if;
    if old.sale_id is not null and (new.sale_id, new.participant_id, new.allocation_id)
       is distinct from (old.sale_id, old.participant_id, old.allocation_id) then
      raise exception 'Issued ticket attribution is immutable.' using errcode = 'insufficient_privilege';
    end if;
    if (old.status, new.status) not in (('AVAILABLE','ALLOCATED'),('ALLOCATED','AVAILABLE'),('ALLOCATED','ISSUED'),('ISSUED','VOIDED')) then
      raise exception 'Invalid ticket state transition.' using errcode = 'check_violation';
    end if;
  elsif tg_op = 'UPDATE' and tg_table_name = 'campaign_participants' then
    if (new.id,new.organization_id,new.campaign_id,new.player_id,new.team_id,new.household_id)
      is distinct from (old.id,old.organization_id,old.campaign_id,old.player_id,old.team_id,old.household_id) then
      raise exception 'Participant enrollment identity and attribution are immutable.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end; $$;

do $$ declare t text; begin
  foreach t in array array['ticket_allocations','campaign_sales','sale_reversals','tickets','campaign_team_goals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated, service_role',t);
    execute format('create trigger %1$s_transaction_guard before insert or update on public.%1$s for each row execute function public.guard_fundraising_write()',t);
  end loop;
  foreach t in array array['ticket_allocations','campaign_sales','sale_reversals'] loop
    execute format('create trigger %1$s_immutable before update or delete on public.%1$s for each row execute function public.prevent_ledger_mutation()',t);
  end loop;
end $$;
alter table public.campaign_ticket_counters enable row level security;
revoke all on public.campaign_ticket_counters from anon, authenticated, service_role;
revoke insert, update on public.campaign_participants from anon, authenticated, service_role;
create trigger campaign_participants_transaction_guard before insert or update on public.campaign_participants
  for each row execute function public.guard_fundraising_write();
create trigger tickets_no_delete before delete on public.tickets
  for each row execute function public.prevent_hard_delete();
create trigger campaign_team_goals_no_delete before delete on public.campaign_team_goals
  for each row execute function public.prevent_hard_delete();
create trigger ticket_allocations_audit after insert on public.ticket_allocations
  for each row execute function public.audit_row_change('TICKET_ALLOCATION');
create trigger campaign_sales_audit after insert on public.campaign_sales
  for each row execute function public.audit_row_change('SALE');
create trigger sale_reversals_audit after insert on public.sale_reversals
  for each row execute function public.audit_row_change('SALE_REVERSAL');
create trigger money_events_audit after insert on public.money_events
  for each row execute function public.audit_row_change('MONEY_EVENT');
create trigger tickets_audit after insert or update on public.tickets
  for each row execute function public.audit_row_change('TICKET');
create trigger campaign_team_goals_audit after insert or update on public.campaign_team_goals
  for each row execute function public.audit_row_change('CAMPAIGN_TEAM_GOAL');

create function public.can_issue_campaign_participant(p_organization_id uuid, p_participant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.has_org_permission(p_organization_id,'tickets.issue')
    and exists (
      select 1 from public.campaign_participants cp
      join public.players p on p.id=cp.player_id and p.organization_id=cp.organization_id
      where cp.id=p_participant_id and cp.organization_id=p_organization_id
        and cp.status='active' and p.status='active' and p.archived_at is null
        and (public.has_org_permission(p_organization_id,'organization.manage')
          or (public.has_org_permission(p_organization_id,'roster.read_own_family')
              and p.id in (select public.my_family_player_ids())))
    );
$$;
revoke all on function public.can_issue_campaign_participant(uuid,uuid) from public, anon;
grant execute on function public.can_issue_campaign_participant(uuid,uuid) to authenticated;

create function public.enroll_campaign_players(
  p_organization_id uuid, p_campaign_id uuid, p_all_active boolean default false,
  p_team_ids uuid[] default '{}', p_player_ids uuid[] default '{}', p_goal_amount_cents integer default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare c public.campaigns; changed integer;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into c from public.campaigns where id=p_campaign_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.status not in ('DRAFT','READY','ACTIVE') then raise exception 'Enrollment is closed.' using errcode='check_violation'; end if;
  if p_all_active is null or p_team_ids is null or p_player_ids is null
    or cardinality(p_team_ids)>200 or cardinality(p_player_ids)>5000
    or (not p_all_active and cardinality(p_team_ids)=0 and cardinality(p_player_ids)=0)
    or p_goal_amount_cents not between 0 and 100000000 then
    raise exception 'Choose active players or teams and a valid goal.' using errcode='check_violation';
  end if;
  if exists (select 1 from unnest(p_team_ids) x where not exists (
    select 1 from public.teams t where t.id=x and t.organization_id=p_organization_id and t.status='active' and t.archived_at is null))
    or exists (select 1 from unnest(p_player_ids) x where not exists (
      select 1 from public.players p where p.id=x and p.organization_id=p_organization_id and p.status='active' and p.archived_at is null)) then
    raise exception 'Selected roster records are unavailable.' using errcode='check_violation';
  end if;
  perform set_config('raffle_hub.fundraising_write',c.id::text,true);
  insert into public.campaign_participants(organization_id,campaign_id,player_id,team_id,household_id,goal_amount_cents)
  select p_organization_id,c.id,p.id,tm.team_id,p.household_id,p_goal_amount_cents
  from public.players p left join public.team_memberships tm on tm.player_id=p.id and tm.ended_at is null
  where p.organization_id=p_organization_id and p.status='active' and p.archived_at is null
    and (p_all_active or tm.team_id=any(p_team_ids) or p.id=any(p_player_ids))
  on conflict (campaign_id,player_id) do update set status='active',
    goal_amount_cents=coalesce(excluded.goal_amount_cents,public.campaign_participants.goal_amount_cents)
  where public.campaign_participants.status='withdrawn'
    or (excluded.goal_amount_cents is not null and excluded.goal_amount_cents is distinct from public.campaign_participants.goal_amount_cents);
  get diagnostics changed=row_count;
  return changed;
end; $$;

create function public.withdraw_campaign_participant(p_organization_id uuid,p_participant_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare cp public.campaign_participants; c public.campaigns; t public.tickets;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into cp from public.campaign_participants where id=p_participant_id and organization_id=p_organization_id;
  if not found then raise exception 'Participant not found.' using errcode='no_data_found'; end if;
  select * into c from public.campaigns where id=cp.campaign_id for update;
  if c.status not in ('DRAFT','READY','ACTIVE') or length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Enrollment is closed or a reason is missing.' using errcode='check_violation';
  end if;
  perform set_config('raffle_hub.fundraising_write',c.id::text,true);
  perform public.set_audit_reason(p_reason);
  update public.campaign_participants set status='withdrawn' where id=cp.id and status='active';
  for t in select * from public.tickets where participant_id=cp.id and campaign_id=c.id and status='ALLOCATED' order by sequence_number for update loop
    insert into public.ticket_events(organization_id,campaign_id,ticket_id,event_type,participant_id,reason,metadata)
    values(p_organization_id,c.id,t.id,'UNALLOCATED',cp.id,btrim(p_reason),jsonb_build_object('allocation_id',t.allocation_id,'source','fundraising_v1'));
    update public.tickets set status='AVAILABLE',participant_id=null,allocation_id=null where id=t.id;
  end loop;
end; $$;

create function public.generate_campaign_tickets(p_organization_id uuid,p_campaign_id uuid,p_quantity integer)
returns integer language plpgsql security definer set search_path='' as $$
declare c public.campaigns; first_number bigint;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into c from public.campaigns where id=p_campaign_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.status<>'ACTIVE' or c.campaign_type<>'raffle' or c.ticket_prefix is null
    or p_quantity is null or p_quantity not between 1 and 10000 then
    raise exception 'Use an active raffle campaign and 1–10000 tickets.' using errcode='check_violation';
  end if;
  perform set_config('raffle_hub.fundraising_write',c.id::text,true);
  insert into public.campaign_ticket_counters(campaign_id,organization_id) values(c.id,p_organization_id) on conflict do nothing;
  select next_sequence into first_number from public.campaign_ticket_counters where campaign_id=c.id for update;
  if first_number+p_quantity>1000001 then raise exception 'Campaign ticket limit reached.' using errcode='check_violation'; end if;
  update public.campaign_ticket_counters set next_sequence=first_number+p_quantity where campaign_id=c.id;
  insert into public.tickets(organization_id,campaign_id,sequence_number,ticket_number)
  select p_organization_id,c.id,n,c.ticket_prefix||'-'||lpad(n::text,greatest(6,length(n::text)),'0')
  from generate_series(first_number,first_number+p_quantity-1) n;
  return p_quantity;
end; $$;

create function public.allocate_campaign_tickets(p_organization_id uuid,p_campaign_id uuid,p_participant_id uuid,p_quantity integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.campaigns; selected uuid[]; allocation uuid; t uuid;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into c from public.campaigns where id=p_campaign_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.status<>'ACTIVE' or c.campaign_type<>'raffle' or p_quantity is null or p_quantity not between 1 and 10000 then
    raise exception 'Use an active raffle campaign and a valid allocation.' using errcode='check_violation';
  end if;
  if not exists (select 1 from public.campaign_participants cp join public.players p on p.id=cp.player_id
    where cp.id=p_participant_id and cp.campaign_id=c.id and cp.organization_id=p_organization_id
      and cp.status='active' and p.status='active' and p.archived_at is null) then
    raise exception 'Participant not available.' using errcode='check_violation';
  end if;
  select array_agg(id order by sequence_number) into selected from (
    select id,sequence_number from public.tickets where campaign_id=c.id and organization_id=p_organization_id
      and status='AVAILABLE' order by sequence_number limit p_quantity for update) stock;
  if coalesce(cardinality(selected),0)<>p_quantity then raise exception 'Insufficient unassigned ticket inventory.' using errcode='check_violation'; end if;
  perform set_config('raffle_hub.fundraising_write',c.id::text,true);
  insert into public.ticket_allocations(organization_id,campaign_id,participant_id,quantity)
    values(p_organization_id,c.id,p_participant_id,p_quantity) returning id into allocation;
  update public.tickets set status='ALLOCATED',participant_id=p_participant_id,allocation_id=allocation where id=any(selected);
  foreach t in array selected loop
    insert into public.ticket_events(organization_id,campaign_id,ticket_id,event_type,participant_id,metadata)
    values(p_organization_id,c.id,t,'ALLOCATED',p_participant_id,jsonb_build_object('allocation_id',allocation,'source','fundraising_v1'));
  end loop;
  return allocation;
end; $$;

create function public.prepare_campaign_inventory(p_organization_id uuid,p_campaign_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare c public.campaigns; needed integer; free integer; assigned integer:=0; participant_row record;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into c from public.campaigns where id=p_campaign_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.status<>'ACTIVE' or c.campaign_type<>'raffle' or coalesce(c.default_allocation,0) not between 1 and 10000 then
    raise exception 'Set a default allocation on an active raffle campaign.' using errcode='check_violation';
  end if;
  select coalesce(sum(greatest(c.default_allocation-stock.count,0)),0)::integer into needed
  from public.campaign_participants cp join public.players p on p.id=cp.player_id
  cross join lateral (select count(*) from public.tickets t where t.participant_id=cp.id and t.campaign_id=c.id) stock
  where cp.campaign_id=c.id and cp.status='active' and p.status='active' and p.archived_at is null;
  if needed>10000 then raise exception 'Prepare at most 10000 tickets at a time; allocate smaller batches.' using errcode='check_violation'; end if;
  select count(*) into free from public.tickets where campaign_id=c.id and status='AVAILABLE';
  if needed>free then perform public.generate_campaign_tickets(p_organization_id,c.id,needed-free); end if;
  for participant_row in select cp.id,greatest(c.default_allocation-stock.count,0)::integer qty
    from public.campaign_participants cp join public.players p on p.id=cp.player_id
    cross join lateral (select count(*) from public.tickets t where t.participant_id=cp.id and t.campaign_id=c.id) stock
    where cp.campaign_id=c.id and cp.status='active' and p.status='active' and p.archived_at is null order by cp.id loop
    if participant_row.qty>0 then
      perform public.allocate_campaign_tickets(p_organization_id,c.id,participant_row.id,participant_row.qty);
      assigned:=assigned+participant_row.qty;
    end if;
  end loop;
  return assigned;
end; $$;

create function public.set_campaign_participant_goal(p_organization_id uuid,p_participant_id uuid,p_goal_amount_cents integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare cp public.campaign_participants; c public.campaigns;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into cp from public.campaign_participants where id=p_participant_id and organization_id=p_organization_id;
  if not found then raise exception 'Participant not found.' using errcode='no_data_found'; end if;
  select * into c from public.campaigns where id=cp.campaign_id for update;
  if c.status not in ('DRAFT','READY','ACTIVE') or p_goal_amount_cents not between 0 and 100000000 then
    raise exception 'Campaign is closed or goal is invalid.' using errcode='check_violation';
  end if;
  perform set_config('raffle_hub.fundraising_write',c.id::text,true);
  update public.campaign_participants set goal_amount_cents=p_goal_amount_cents where id=cp.id;
end; $$;

create function public.set_campaign_team_goal(p_organization_id uuid,p_campaign_id uuid,p_team_id uuid,p_goal_amount_cents bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.campaigns;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.manage');
  select * into c from public.campaigns where id=p_campaign_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.status not in ('DRAFT','READY','ACTIVE') or p_goal_amount_cents not between 0 and 100000000
    or not exists(select 1 from public.teams where id=p_team_id and organization_id=p_organization_id and archived_at is null and status='active') then
    raise exception 'Campaign/team is unavailable or goal is invalid.' using errcode='check_violation';
  end if;
  perform set_config('raffle_hub.fundraising_write',c.id::text,true);
  insert into public.campaign_team_goals(organization_id,campaign_id,team_id,goal_amount_cents)
    values(p_organization_id,c.id,p_team_id,p_goal_amount_cents)
    on conflict (campaign_id,team_id) do update set goal_amount_cents=excluded.goal_amount_cents,updated_at=now(),updated_by=auth.uid();
end; $$;

-- Functions inherit PUBLIC execute by default; expose only authenticated entry points.
revoke all on function public.guard_fundraising_write() from public, anon, authenticated;
revoke all on function public.enroll_campaign_players(uuid,uuid,boolean,uuid[],uuid[],integer) from public, anon;
revoke all on function public.withdraw_campaign_participant(uuid,uuid,text) from public, anon;
revoke all on function public.generate_campaign_tickets(uuid,uuid,integer) from public, anon;
revoke all on function public.allocate_campaign_tickets(uuid,uuid,uuid,integer) from public, anon;
revoke all on function public.prepare_campaign_inventory(uuid,uuid) from public, anon;
revoke all on function public.set_campaign_participant_goal(uuid,uuid,integer) from public, anon;
revoke all on function public.set_campaign_team_goal(uuid,uuid,uuid,bigint) from public, anon;
grant execute on function public.enroll_campaign_players(uuid,uuid,boolean,uuid[],uuid[],integer),
  public.withdraw_campaign_participant(uuid,uuid,text), public.generate_campaign_tickets(uuid,uuid,integer),
  public.allocate_campaign_tickets(uuid,uuid,uuid,integer), public.prepare_campaign_inventory(uuid,uuid),
  public.set_campaign_participant_goal(uuid,uuid,integer), public.set_campaign_team_goal(uuid,uuid,uuid,bigint) to authenticated;
