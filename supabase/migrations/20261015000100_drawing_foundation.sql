-- Frozen drawing populations and approved physical/external drawing evidence.
-- Existing campaign/ticket/money/audit ledger rows and hash payloads are unchanged.

create table public.drawing_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  version integer not null check (version > 0),
  supersedes_snapshot_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null default auth.uid() references auth.users(id),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  prize_readiness_confirmed boolean not null check (prize_readiness_confirmed),
  ticket_count bigint not null check (ticket_count > 0),
  total_face_value_cents bigint not null check (total_face_value_cents > 0),
  disclosures jsonb not null,
  source_ledger_heads jsonb not null,
  manifest jsonb not null,
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  unique (id, organization_id, campaign_id),
  unique (campaign_id, version),
  unique (organization_id, created_by, idempotency_key),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id),
  foreign key (supersedes_snapshot_id, organization_id, campaign_id)
    references public.drawing_snapshots(id, organization_id, campaign_id)
);

create table public.drawing_snapshot_entries (
  snapshot_id uuid not null,
  organization_id uuid not null,
  campaign_id uuid not null,
  ticket_id uuid not null,
  ticket_number text not null,
  sequence_number bigint not null,
  sale_id uuid not null,
  participant_id uuid not null,
  player_id uuid not null,
  player_name text not null,
  team_id uuid,
  team_name text,
  seller_user_id uuid not null references auth.users(id),
  buyer_name text not null,
  buyer_email text,
  buyer_phone text,
  issued_at timestamptz not null,
  face_value_cents bigint not null check (face_value_cents > 0),
  entry_hash text not null check (entry_hash ~ '^[a-f0-9]{64}$'),
  primary key (snapshot_id, ticket_id),
  unique (snapshot_id, ticket_number),
  unique (snapshot_id, sequence_number),
  unique (snapshot_id, ticket_id, organization_id, campaign_id),
  foreign key (snapshot_id, organization_id, campaign_id)
    references public.drawing_snapshots(id, organization_id, campaign_id),
  foreign key (ticket_id, organization_id, campaign_id)
    references public.tickets(id, organization_id, campaign_id),
  foreign key (sale_id, organization_id, campaign_id, participant_id)
    references public.campaign_sales(id, organization_id, campaign_id, participant_id),
  foreign key (participant_id, organization_id, campaign_id)
    references public.campaign_participants(id, organization_id, campaign_id),
  foreign key (player_id, organization_id) references public.players(id, organization_id),
  foreign key (team_id, organization_id) references public.teams(id, organization_id)
);

create table public.drawing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  snapshot_id uuid not null,
  event_type text not null check (event_type in ('FROZEN','REOPENED','EXPORTED','CERTIFIED')),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null default auth.uid() references auth.users(id),
  reason text,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  unique (id, organization_id, campaign_id),
  unique (organization_id, created_by, event_type, idempotency_key),
  foreign key (snapshot_id, organization_id, campaign_id)
    references public.drawing_snapshots(id, organization_id, campaign_id),
  check (event_type = 'EXPORTED' or length(btrim(coalesce(reason,''))) between 3 and 500)
);
create unique index drawing_events_single_state_uq
  on public.drawing_events(snapshot_id,event_type) where event_type in ('FROZEN','REOPENED','CERTIFIED');
create index drawing_events_campaign_idx on public.drawing_events(campaign_id,created_at,id);

create table public.drawing_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  snapshot_id uuid not null,
  winning_ticket_id uuid not null,
  ticket_number text not null,
  drawn_at timestamptz not null,
  location text not null check (length(btrim(location)) between 3 and 500),
  operator_name text not null check (length(btrim(operator_name)) between 3 and 200),
  witnesses jsonb not null check (jsonb_typeof(witnesses)='array' and jsonb_array_length(witnesses)>0),
  method text not null check (method in ('physical','external')),
  result text not null check (length(btrim(result)) between 3 and 2000),
  evidence_ref text check (length(evidence_ref)<=1000),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null default auth.uid() references auth.users(id),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  result_hash text not null check (result_hash ~ '^[a-f0-9]{64}$'),
  unique (id, organization_id, campaign_id),
  unique (organization_id, created_by, idempotency_key),
  foreign key (snapshot_id, organization_id, campaign_id)
    references public.drawing_snapshots(id, organization_id, campaign_id),
  foreign key (snapshot_id, winning_ticket_id, organization_id, campaign_id)
    references public.drawing_snapshot_entries(snapshot_id, ticket_id, organization_id, campaign_id)
);

-- Private static helpers are never exposed as callable mutation escape hatches.
create function public.drawing_current_snapshot(p_campaign_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.drawing_snapshots s where s.campaign_id=p_campaign_id
    and not exists (select 1 from public.drawing_events e where e.snapshot_id=s.id and e.event_type='REOPENED')
  order by s.version desc limit 1;
$$;
revoke all on function public.drawing_current_snapshot(uuid) from public,anon,authenticated,service_role;

create function public.drawing_has_export_authority(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_org_permission(p_organization_id,'exports.run') and (
    public.has_org_permission(p_organization_id,'organization.manage')
    or public.has_org_permission(p_organization_id,'reconciliation.manage')
    or public.has_org_permission(p_organization_id,'adjustments.approve')
    or public.has_org_permission(p_organization_id,'audit.read'));
$$;
revoke all on function public.drawing_has_export_authority(uuid) from public,anon;
grant execute on function public.drawing_has_export_authority(uuid) to authenticated;

create function public.drawing_lock_campaign(p_organization_id uuid,p_campaign_id uuid,p_permission text)
returns public.campaigns language plpgsql security definer set search_path = '' as $$
declare c public.campaigns;
begin
  perform public.assert_org_permission(p_organization_id,p_permission);
  if auth.uid() is null then raise exception 'A signed-in drawing operator is required.' using errcode='insufficient_privilege'; end if;
  select * into c from public.campaigns where id=p_campaign_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  perform public.lock_fundraising_membership(p_organization_id);
  perform public.assert_org_permission(p_organization_id,p_permission);
  return c;
end; $$;
revoke all on function public.drawing_lock_campaign(uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.drawing_validate_request(p_key text,p_reason text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_key is null or length(btrim(p_key)) not between 1 and 200 then
    raise exception 'An idempotency key of 1–200 characters is required.' using errcode='check_violation'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'A drawing reason of 3–500 characters is required.' using errcode='check_violation'; end if;
end; $$;
revoke all on function public.drawing_validate_request(text,text) from public,anon,authenticated,service_role;

create function public.guard_drawing_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(current_setting('raffle_hub.drawing_write',true),'')<>new.campaign_id::text then
    raise exception 'Use an authorized drawing transaction.' using errcode='insufficient_privilege'; end if;
  new.created_by := auth.uid();
  return new;
end; $$;
-- Entry rows deliberately carry no actor/time fields outside the frozen payload.
create function public.guard_drawing_entry_insert()
returns trigger language plpgsql set search_path = '' set timezone = 'UTC' as $$
begin
  if auth.uid() is null or coalesce(current_setting('raffle_hub.drawing_write',true),'')<>new.campaign_id::text then
    raise exception 'Use an authorized drawing transaction.' using errcode='insufficient_privilege'; end if;
  new.entry_hash := encode(extensions.digest((to_jsonb(new)-'entry_hash')::text,'sha256'),'hex');
  return new;
end; $$;
create function public.hash_drawing_result()
returns trigger language plpgsql set search_path = '' set timezone = 'UTC' as $$
begin
  new.result_hash := encode(extensions.digest((to_jsonb(new)-'result_hash')::text,'sha256'),'hex');
  return new;
end; $$;

do $$ declare t text; begin
  foreach t in array array['drawing_snapshots','drawing_snapshot_entries','drawing_events','drawing_results'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated,service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create trigger %1$s_immutable before update or delete on public.%1$s for each row execute function public.prevent_ledger_mutation()',t);
    if t<>'drawing_snapshot_entries' then
      execute format('create trigger a_%1$s_guard before insert on public.%1$s for each row execute function public.guard_drawing_insert()',t);
      execute format('create trigger %1$s_audit after insert on public.%1$s for each row execute function public.audit_row_change(''%2$s'')',t,upper(t));
    end if;
  end loop;
end $$;
create trigger drawing_snapshot_entries_guard before insert on public.drawing_snapshot_entries
  for each row execute function public.guard_drawing_entry_insert();
create trigger z_drawing_results_hash before insert on public.drawing_results
  for each row execute function public.hash_drawing_result();
create policy drawing_snapshots_select on public.drawing_snapshots for select to authenticated
  using (public.has_org_permission(organization_id,'campaigns.read'));
create policy drawing_events_select on public.drawing_events for select to authenticated
  using (public.has_org_permission(organization_id,'campaigns.read'));
create policy drawing_results_select on public.drawing_results for select to authenticated
  using (public.has_org_permission(organization_id,'campaigns.read'));
create policy drawing_snapshot_entries_select on public.drawing_snapshot_entries for select to authenticated
  using (public.drawing_has_export_authority(organization_id));

-- Stable entry construction shared by freeze and its canonical hash calculation.
create function public.drawing_eligible_entries(p_organization_id uuid,p_campaign_id uuid,p_snapshot_id uuid)
returns setof public.drawing_snapshot_entries language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select p_snapshot_id,t.organization_id,t.campaign_id,t.id,t.ticket_number,t.sequence_number,
    s.id,cp.id,cp.player_id,btrim(p.first_name||' '||p.last_name),cp.team_id,tm.name,
    s.created_by,s.buyer_name,s.buyer_email,s.buyer_phone,s.sold_at,s.amount_cents/s.quantity,
    repeat('0',64)
  from public.tickets t
  join public.campaign_sales s on s.id=t.sale_id and s.organization_id=t.organization_id and s.campaign_id=t.campaign_id and s.participant_id=t.participant_id
  join public.campaign_participants cp on cp.id=s.participant_id and cp.organization_id=s.organization_id and cp.campaign_id=s.campaign_id
  join public.players p on p.id=cp.player_id and p.organization_id=cp.organization_id
  left join public.teams tm on tm.id=cp.team_id and tm.organization_id=cp.organization_id
  where t.organization_id=p_organization_id and t.campaign_id=p_campaign_id and t.status='ISSUED'
    and not exists(select 1 from public.sale_reversals r where r.sale_id=s.id and r.organization_id=s.organization_id and r.campaign_id=s.campaign_id)
  order by t.sequence_number,t.id;
$$;
revoke all on function public.drawing_eligible_entries(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.drawing_source_heads(p_organization_id uuid,p_campaign_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaign_events',coalesce((select jsonb_build_object('position',chain_pos,'hash',row_hash) from public.campaign_events where campaign_id=p_campaign_id order by chain_pos desc limit 1),jsonb_build_object('position',0,'hash',repeat('0',64))),
    'ticket_events',coalesce((select jsonb_build_object('position',chain_pos,'hash',row_hash) from public.ticket_events where campaign_id=p_campaign_id order by chain_pos desc limit 1),jsonb_build_object('position',0,'hash',repeat('0',64))),
    'money_events',coalesce((select jsonb_build_object('position',chain_pos,'hash',row_hash) from public.money_events where campaign_id=p_campaign_id order by chain_pos desc limit 1),jsonb_build_object('position',0,'hash',repeat('0',64))),
    'audit_events',coalesce((select jsonb_build_object('position',chain_pos,'hash',row_hash) from public.audit_events where organization_id=p_organization_id order by chain_pos desc limit 1),jsonb_build_object('position',0,'hash',repeat('0',64)))
  );
$$;
revoke all on function public.drawing_source_heads(uuid,uuid) from public,anon,authenticated,service_role;

create function public.drawing_manifest(p_snapshot public.drawing_snapshots,p_entries_hash text)
returns jsonb language sql immutable set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object('schema_version',1,'eligibility_policy','ISSUED_UNREVERSED_V1',
    'snapshot_id',(p_snapshot).id,'organization_id',(p_snapshot).organization_id,'campaign_id',(p_snapshot).campaign_id,
    'version',(p_snapshot).version,'frozen_at',(p_snapshot).created_at,'frozen_by',(p_snapshot).created_by,
    'reason',(p_snapshot).reason,'supersedes_snapshot_id',(p_snapshot).supersedes_snapshot_id,
    'prize_readiness_confirmed',(p_snapshot).prize_readiness_confirmed,'ticket_count',(p_snapshot).ticket_count,
    'total_face_value_cents',(p_snapshot).total_face_value_cents,'disclosures',(p_snapshot).disclosures,
    'source_ledger_heads',(p_snapshot).source_ledger_heads,'entries_hash',p_entries_hash);
$$;
revoke all on function public.drawing_manifest(public.drawing_snapshots,text) from public,anon,authenticated,service_role;

create function public.drawing_integrity(p_snapshot_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' set timezone = 'UTC' as $$
declare s public.drawing_snapshots; n bigint; value bigint; entries_ok boolean; entries_hash text;
  expected_manifest jsonb; count_ok boolean; manifest_ok boolean; anchors_ok boolean; chains_ok boolean; audit_anchor_ok boolean;
begin
  select * into s from public.drawing_snapshots where id=p_snapshot_id;
  if not found then raise exception 'Drawing snapshot not found.' using errcode='no_data_found'; end if;
  select count(*),coalesce(sum(e.face_value_cents),0),coalesce(bool_and(e.entry_hash=encode(extensions.digest((to_jsonb(e)-'entry_hash')::text,'sha256'),'hex')),false),
    encode(extensions.digest(coalesce(string_agg(e.entry_hash,'' order by e.sequence_number,e.ticket_id),''),'sha256'),'hex')
  into n,value,entries_ok,entries_hash from public.drawing_snapshot_entries e where e.snapshot_id=s.id;
  count_ok := n=s.ticket_count and value=s.total_face_value_cents;
  expected_manifest := public.drawing_manifest(s,entries_hash);
  manifest_ok := s.manifest=expected_manifest and s.manifest_hash=encode(extensions.digest(expected_manifest::text,'sha256'),'hex');
  -- A privileged edit of both entries and their header must still disagree with
  -- the original trigger-written, hash-chained snapshot and freeze receipts.
  audit_anchor_ok := exists(select 1 from public.audit_events a where a.organization_id=s.organization_id
    and a.entity_type='drawing_snapshots' and a.entity_id=s.id and a.after_data=to_jsonb(s))
    and exists(select 1 from public.drawing_events e join public.audit_events a
      on a.organization_id=e.organization_id and a.entity_type='drawing_events' and a.entity_id=e.id and a.after_data=to_jsonb(e)
      where e.snapshot_id=s.id and e.event_type='FROZEN' and e.metadata->>'manifest_hash'=s.manifest_hash);
  anchors_ok := (
    case when (s.source_ledger_heads->'campaign_events'->>'position')::bigint=0 then s.source_ledger_heads->'campaign_events'->>'hash'=repeat('0',64)
      else exists(select 1 from public.campaign_events e where e.campaign_id=s.campaign_id and e.chain_pos=(s.source_ledger_heads->'campaign_events'->>'position')::bigint and e.row_hash=s.source_ledger_heads->'campaign_events'->>'hash') end
    and case when (s.source_ledger_heads->'ticket_events'->>'position')::bigint=0 then s.source_ledger_heads->'ticket_events'->>'hash'=repeat('0',64)
      else exists(select 1 from public.ticket_events e where e.campaign_id=s.campaign_id and e.chain_pos=(s.source_ledger_heads->'ticket_events'->>'position')::bigint and e.row_hash=s.source_ledger_heads->'ticket_events'->>'hash') end
    and case when (s.source_ledger_heads->'money_events'->>'position')::bigint=0 then s.source_ledger_heads->'money_events'->>'hash'=repeat('0',64)
      else exists(select 1 from public.money_events e where e.campaign_id=s.campaign_id and e.chain_pos=(s.source_ledger_heads->'money_events'->>'position')::bigint and e.row_hash=s.source_ledger_heads->'money_events'->>'hash') end
    and case when (s.source_ledger_heads->'audit_events'->>'position')::bigint=0 then s.source_ledger_heads->'audit_events'->>'hash'=repeat('0',64)
      else exists(select 1 from public.audit_events e where e.organization_id=s.organization_id and e.chain_pos=(s.source_ledger_heads->'audit_events'->>'position')::bigint and e.row_hash=s.source_ledger_heads->'audit_events'->>'hash') end
  );
  select bool_and(v.ok) into chains_ok from (
    select ok from public.verify_hash_chain('campaign_events','campaign_id',s.campaign_id)
    union all select ok from public.verify_hash_chain('ticket_events','campaign_id',s.campaign_id)
    union all select ok from public.verify_hash_chain('money_events','campaign_id',s.campaign_id)
    union all select ok from public.verify_hash_chain('audit_events','organization_id',s.organization_id)) v;
  return jsonb_build_object('snapshot_id',s.id,'ok',coalesce(count_ok and entries_ok and manifest_ok and anchors_ok and chains_ok and audit_anchor_ok,false),
    'count_ok',count_ok,'entries_ok',entries_ok,'manifest_ok',manifest_ok,'source_anchors_ok',coalesce(anchors_ok,false),'ledger_chains_ok',chains_ok,'audit_anchor_ok',audit_anchor_ok);
end; $$;
revoke all on function public.drawing_integrity(uuid) from public,anon,authenticated,service_role;

create function public.verify_drawing_snapshot(p_organization_id uuid,p_snapshot_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.read');
  if not exists(select 1 from public.drawing_snapshots where id=p_snapshot_id and organization_id=p_organization_id) then
    raise exception 'Drawing snapshot not found.' using errcode='no_data_found'; end if;
  return public.drawing_integrity(p_snapshot_id);
end; $$;

create function public.drawing_readiness(p_organization_id uuid,p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.campaigns; blockers text[]:='{}'; warnings text[]:='{}'; n bigint; value bigint; chains_ok boolean;
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.read');
  select * into c from public.campaigns where id=p_campaign_id and organization_id=p_organization_id;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  if c.campaign_type<>'raffle' or c.archived_at is not null then blockers:=array_append(blockers,'Use an unarchived raffle campaign.'); end if;
  if c.status<>'CLOSED' then blockers:=array_append(blockers,'Close campaign sales before freezing drawing entries.'); end if;
  if public.drawing_current_snapshot(c.id) is not null then blockers:=array_append(blockers,'A drawing snapshot is already frozen.'); end if;
  if c.ticket_price_cents is null or c.ticket_prefix is null or c.draw_at is null
    or nullif(btrim(c.operator_legal_name),'') is null or c.operator_address is null
    or c.rules_text is null or nullif(btrim(c.rules_text),'') is null
    or c.jurisdiction_mode is null or (nullif(btrim(c.support_email),'') is null and nullif(btrim(c.support_phone),'') is null) then
    blockers:=array_append(blockers,'Required locked raffle disclosures are incomplete.'); end if;
  if exists(select 1 from public.tickets t left join public.campaign_sales s on s.id=t.sale_id and s.organization_id=t.organization_id and s.campaign_id=t.campaign_id and s.participant_id=t.participant_id
    where t.campaign_id=c.id and t.status='ISSUED' and (s.id is null or exists(select 1 from public.sale_reversals r where r.sale_id=t.sale_id)))
    or exists(select 1 from public.campaign_sales s where s.campaign_id=c.id and not exists(select 1 from public.sale_reversals r where r.sale_id=s.id)
      and ((select count(*) from public.tickets t where t.sale_id=s.id and t.status='ISSUED')<>s.quantity
        or s.amount_cents<>s.quantity::bigint*c.ticket_price_cents::bigint
        or not exists(select 1 from public.money_events m where m.id=s.collection_event_id and m.organization_id=s.organization_id and m.campaign_id=s.campaign_id and m.participant_id=s.participant_id and m.event_type='SALE_COLLECTED' and m.amount_cents=s.amount_cents and m.payment_method=s.payment_method)))
    or exists(select 1 from public.tickets t where t.campaign_id=c.id and t.status='ISSUED'
      and not exists(select 1 from public.ticket_events e where e.ticket_id=t.id and e.organization_id=t.organization_id
        and e.campaign_id=t.campaign_id and e.participant_id=t.participant_id and e.event_type='ISSUED' and e.metadata->>'sale_id'=t.sale_id::text))
    or exists(select 1 from public.sale_reversals r join public.campaign_sales s on s.id=r.sale_id where r.campaign_id=c.id
      and ((select count(*) from public.tickets t where t.sale_id=s.id and t.status='VOIDED')<>s.quantity
        or not exists(select 1 from public.money_events m where m.id=r.reversal_event_id and m.organization_id=r.organization_id
          and m.campaign_id=r.campaign_id and m.participant_id=s.participant_id and m.event_type='REVERSAL'
          and m.reverses_event_id=s.collection_event_id and m.amount_cents=-s.amount_cents and m.approved_by=r.approved_by))) then
    blockers:=array_append(blockers,'Issued tickets, sale facts, or collection references are inconsistent.'); end if;
  select count(*),coalesce(sum(face_value_cents),0) into n,value from public.drawing_eligible_entries(p_organization_id,p_campaign_id,gen_random_uuid());
  if n=0 then blockers:=array_append(blockers,'At least one eligible issued ticket is required.'); end if;
  if exists(select 1 from public.tickets where campaign_id=c.id group by ticket_number having count(*)>1) then blockers:=array_append(blockers,'Duplicate campaign ticket numbers exist.'); end if;
  select bool_and(v.ok) into chains_ok from (
    select ok from public.verify_hash_chain('campaign_events','campaign_id',c.id)
    union all select ok from public.verify_hash_chain('ticket_events','campaign_id',c.id)
    union all select ok from public.verify_hash_chain('money_events','campaign_id',c.id)
    union all select ok from public.verify_hash_chain('audit_events','organization_id',p_organization_id)) v;
  if not coalesce(chains_ok,false) then blockers:=array_append(blockers,'Campaign or organization ledger verification failed.'); end if;
  warnings:=array_append(warnings,'Confirm approved prize readiness and physical/external drawing arrangements when freezing.');
  warnings:=array_append(warnings,'Seller collections do not confirm organization receipt or check clearance; outstanding funds do not change ticket eligibility.');
  if exists(select 1 from public.drawing_eligible_entries(p_organization_id,p_campaign_id,gen_random_uuid()) e where e.buyer_email is null and e.buyer_phone is null) then
    warnings:=array_append(warnings,'Some eligible buyers have no email or phone contact.'); end if;
  return jsonb_build_object('campaign_id',c.id,'status',c.status,'ready',cardinality(blockers)=0,'blocking',to_jsonb(blockers),'warnings',to_jsonb(warnings),
    'eligible_ticket_count',n,'total_face_value_cents',value,'current_snapshot_id',public.drawing_current_snapshot(c.id));
end; $$;

create function public.freeze_drawing(p_organization_id uuid,p_campaign_id uuid,p_idempotency_key text,p_reason text,p_prize_readiness_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare c public.campaigns; s public.drawing_snapshots; prior public.drawing_snapshots; readiness jsonb; entries_hash text; fingerprint text;
  prior_write text:=coalesce(current_setting('raffle_hub.drawing_write',true),''); prior_reason text:=current_setting('raffle_hub.reason',true);
begin
  c:=public.drawing_lock_campaign(p_organization_id,p_campaign_id,'drawing.manage');
  perform public.drawing_validate_request(p_idempotency_key,p_reason);
  fingerprint:=encode(extensions.digest(jsonb_build_object('organization_id',p_organization_id,'campaign_id',p_campaign_id,'reason',btrim(p_reason),'prize_readiness_confirmed',p_prize_readiness_confirmed)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('drawing-freeze:'||p_organization_id::text||':'||auth.uid()::text||':'||btrim(p_idempotency_key),0));
  select * into s from public.drawing_snapshots where organization_id=p_organization_id and created_by=auth.uid() and idempotency_key=btrim(p_idempotency_key);
  if found then
    if s.request_fingerprint<>fingerprint then raise exception 'This idempotency key was already used for a different drawing freeze.' using errcode='unique_violation'; end if;
    return jsonb_build_object('snapshot_id',s.id,'version',s.version,'count',s.ticket_count,'total_face_value_cents',s.total_face_value_cents,'manifest_hash',s.manifest_hash,'replayed',true);
  end if;
  if not coalesce(p_prize_readiness_confirmed,false) then raise exception 'Confirm approved prizes and drawing readiness before freezing.' using errcode='check_violation'; end if;
  readiness:=public.drawing_readiness(p_organization_id,p_campaign_id);
  if not (readiness->>'ready')::boolean then raise exception 'Drawing is not ready: %',readiness->'blocking' using errcode='check_violation'; end if;
  -- Roster labels are frozen consistently; attribution IDs are enrollment facts.
  perform 1 from public.players p where p.id in (select cp.player_id from public.campaign_participants cp where cp.campaign_id=c.id) order by p.id for share;
  perform 1 from public.teams t where t.id in (select cp.team_id from public.campaign_participants cp where cp.campaign_id=c.id) order by t.id for share;
  select * into prior from public.drawing_snapshots where campaign_id=c.id order by version desc limit 1;
  s.id:=gen_random_uuid(); s.organization_id:=p_organization_id; s.campaign_id:=c.id;
  s.version:=coalesce(prior.version,0)+1; s.supersedes_snapshot_id:=prior.id; s.created_at:=clock_timestamp(); s.created_by:=auth.uid();
  s.reason:=btrim(p_reason); s.idempotency_key:=btrim(p_idempotency_key); s.request_fingerprint:=fingerprint; s.prize_readiness_confirmed:=true;
  s.disclosures:=jsonb_build_object('campaign_name',c.name,'ticket_price_cents',c.ticket_price_cents,'ticket_prefix',c.ticket_prefix,
    'jurisdiction_mode',c.jurisdiction_mode,'timezone',c.timezone,'starts_at',c.starts_at,'sales_close_at',c.sales_close_at,'draw_at',c.draw_at,
    'operator_legal_name',c.operator_legal_name,'operator_address',c.operator_address,'support_email',c.support_email,'support_phone',c.support_phone,
    'rules_text',c.rules_text,'rules_version',c.rules_version,'approved_prize_readiness',true);
  s.source_ledger_heads:=public.drawing_source_heads(p_organization_id,c.id);
  select count(*),sum(e.face_value_cents),encode(extensions.digest(string_agg(encode(extensions.digest((to_jsonb(e)-'entry_hash')::text,'sha256'),'hex'),'' order by e.sequence_number,e.ticket_id),'sha256'),'hex')
    into s.ticket_count,s.total_face_value_cents,entries_hash from public.drawing_eligible_entries(p_organization_id,c.id,s.id) e;
  s.manifest:=public.drawing_manifest(s,entries_hash); s.manifest_hash:=encode(extensions.digest(s.manifest::text,'sha256'),'hex');
  perform set_config('raffle_hub.drawing_write',c.id::text,true); perform public.set_audit_reason(s.reason);
  insert into public.drawing_snapshots select (s).*;
  insert into public.drawing_snapshot_entries select * from public.drawing_eligible_entries(p_organization_id,c.id,s.id);
  insert into public.drawing_events(organization_id,campaign_id,snapshot_id,event_type,reason,idempotency_key,request_fingerprint,metadata)
    values(p_organization_id,c.id,s.id,'FROZEN',s.reason,s.idempotency_key,fingerprint,jsonb_build_object('version',s.version,'manifest_hash',s.manifest_hash,'ticket_count',s.ticket_count));
  if not (public.drawing_integrity(s.id)->>'ok')::boolean then raise exception 'Frozen drawing verification failed.' using errcode='check_violation'; end if;
  perform set_config('raffle_hub.drawing_write',prior_write,true); perform public.set_audit_reason(prior_reason);
  return jsonb_build_object('snapshot_id',s.id,'version',s.version,'count',s.ticket_count,'total_face_value_cents',s.total_face_value_cents,'manifest_hash',s.manifest_hash,'replayed',false);
end; $$;

create function public.reopen_drawing(p_organization_id uuid,p_snapshot_id uuid,p_idempotency_key text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.campaigns; s public.drawing_snapshots; e public.drawing_events; fingerprint text;
  prior_write text:=coalesce(current_setting('raffle_hub.drawing_write',true),''); prior_reason text:=current_setting('raffle_hub.reason',true);
begin
  perform public.assert_org_permission(p_organization_id,'drawing.certify');
  select * into s from public.drawing_snapshots where id=p_snapshot_id and organization_id=p_organization_id;
  if not found then raise exception 'Drawing snapshot not found.' using errcode='no_data_found'; end if;
  c:=public.drawing_lock_campaign(p_organization_id,s.campaign_id,'drawing.certify');
  perform public.drawing_validate_request(p_idempotency_key,p_reason);
  fingerprint:=encode(extensions.digest(jsonb_build_object('snapshot_id',s.id,'reason',btrim(p_reason))::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('drawing-reopen:'||p_organization_id::text||':'||auth.uid()::text||':'||btrim(p_idempotency_key),0));
  select * into e from public.drawing_events where organization_id=p_organization_id and created_by=auth.uid() and event_type='REOPENED' and idempotency_key=btrim(p_idempotency_key);
  if found then
    if e.request_fingerprint<>fingerprint then raise exception 'This idempotency key was already used for a different drawing reopen.' using errcode='unique_violation'; end if;
    return jsonb_build_object('event_id',e.id,'snapshot_id',e.snapshot_id,'replayed',true);
  end if;
  if c.status<>'CLOSED' or public.drawing_current_snapshot(c.id) is distinct from s.id
    or exists(select 1 from public.drawing_results r where r.snapshot_id=s.id)
    or exists(select 1 from public.drawing_events x where x.snapshot_id=s.id and x.event_type='CERTIFIED') then
    raise exception 'Only the current closed drawing can reopen before any external result or certification.' using errcode='check_violation'; end if;
  perform set_config('raffle_hub.drawing_write',c.id::text,true); perform public.set_audit_reason(btrim(p_reason));
  insert into public.drawing_events(organization_id,campaign_id,snapshot_id,event_type,reason,idempotency_key,request_fingerprint,metadata)
    values(p_organization_id,c.id,s.id,'REOPENED',btrim(p_reason),btrim(p_idempotency_key),fingerprint,jsonb_build_object('manifest_hash',s.manifest_hash,'sales_remain_closed',true)) returning * into e;
  perform set_config('raffle_hub.drawing_write',prior_write,true); perform public.set_audit_reason(prior_reason);
  return jsonb_build_object('event_id',e.id,'snapshot_id',s.id,'replayed',false);
end; $$;

create function public.drawing_snapshot_export(p_organization_id uuid,p_snapshot_id uuid,p_offset integer default 0,p_limit integer default 1000)
returns jsonb language plpgsql stable security definer set search_path = '' set timezone = 'UTC' as $$
declare s public.drawing_snapshots; entries jsonb;
begin
  if not public.drawing_has_export_authority(p_organization_id) then raise exception 'You do not have permission to export drawing buyers.' using errcode='insufficient_privilege'; end if;
  select * into s from public.drawing_snapshots where id=p_snapshot_id and organization_id=p_organization_id;
  if not found then raise exception 'Drawing snapshot not found.' using errcode='no_data_found'; end if;
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 1000 then raise exception 'Use an offset of zero or more and a page size of 1–1000.' using errcode='check_violation'; end if;
  -- Verify the population once at pagination start. Subsequent immutable pages
  -- remain scoped/bounded; the application and export receipt verify again at
  -- completion instead of rehashing all entries and ledgers for every page.
  if p_offset=0 and not (public.drawing_integrity(s.id)->>'ok')::boolean then raise exception 'Drawing snapshot verification failed.' using errcode='check_violation'; end if;
  select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('entry_payload_canonical',(to_jsonb(e)-'entry_hash')::text) order by e.sequence_number,e.ticket_id),'[]'::jsonb) into entries
    from (select * from public.drawing_snapshot_entries where snapshot_id=s.id order by sequence_number,ticket_id offset p_offset limit p_limit) e;
  return jsonb_build_object('snapshot',to_jsonb(s)||jsonb_build_object('manifest_canonical',s.manifest::text),'entries',entries,'offset',p_offset,'limit',p_limit,'total',s.ticket_count,'has_more',p_offset::bigint+p_limit::bigint<s.ticket_count,
    'historical',public.drawing_current_snapshot(s.campaign_id) is distinct from s.id);
end; $$;

create function public.export_drawing_snapshot(p_organization_id uuid,p_snapshot_id uuid,p_idempotency_key text,p_format text,p_export_sha256 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.drawing_snapshots; c public.campaigns; e public.drawing_events; fingerprint text;
  prior_write text:=coalesce(current_setting('raffle_hub.drawing_write',true),''); prior_reason text:=current_setting('raffle_hub.reason',true);
begin
  if not public.drawing_has_export_authority(p_organization_id) then raise exception 'You do not have permission to export drawing buyers.' using errcode='insufficient_privilege'; end if;
  select * into s from public.drawing_snapshots where id=p_snapshot_id and organization_id=p_organization_id;
  if not found then raise exception 'Drawing snapshot not found.' using errcode='no_data_found'; end if;
  c:=public.drawing_lock_campaign(p_organization_id,s.campaign_id,'exports.run');
  if not public.drawing_has_export_authority(p_organization_id) then raise exception 'You do not have permission to export drawing buyers.' using errcode='insufficient_privilege'; end if;
  perform public.drawing_validate_request(p_idempotency_key,'Drawing export checksum reported');
  if p_format is null or p_format not in ('csv','json') or p_export_sha256 is null or p_export_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'An approved export format and reported file SHA-256 are required.' using errcode='check_violation'; end if;
  fingerprint:=encode(extensions.digest(jsonb_build_object('snapshot_id',s.id,'format',p_format,'export_sha256',p_export_sha256)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('drawing-export:'||p_organization_id::text||':'||auth.uid()::text||':'||btrim(p_idempotency_key),0));
  select * into e from public.drawing_events where organization_id=p_organization_id and created_by=auth.uid() and event_type='EXPORTED' and idempotency_key=btrim(p_idempotency_key);
  if found then
    if e.request_fingerprint<>fingerprint then raise exception 'This idempotency key was already used for a different drawing export.' using errcode='unique_violation'; end if;
    return jsonb_build_object('event_id',e.id,'snapshot_id',e.snapshot_id,'replayed',true);
  end if;
  if not (public.drawing_integrity(s.id)->>'ok')::boolean then raise exception 'Drawing snapshot verification failed.' using errcode='check_violation'; end if;
  perform set_config('raffle_hub.drawing_write',c.id::text,true); perform public.set_audit_reason('Drawing export checksum reported');
  insert into public.drawing_events(organization_id,campaign_id,snapshot_id,event_type,reason,idempotency_key,request_fingerprint,metadata)
    values(p_organization_id,c.id,s.id,'EXPORTED','Drawing export checksum reported',btrim(p_idempotency_key),fingerprint,
      jsonb_build_object('format',p_format,'export_sha256',p_export_sha256,'manifest_hash',s.manifest_hash,
        'historical',public.drawing_current_snapshot(c.id) is distinct from s.id,'delivery_confirmed',false,
        'checksum_source','authenticated_exporter','file_generation_verified',false,'snapshot_verified',true)) returning * into e;
  perform set_config('raffle_hub.drawing_write',prior_write,true); perform public.set_audit_reason(prior_reason);
  return jsonb_build_object('event_id',e.id,'snapshot_id',s.id,'replayed',false);
end; $$;

create function public.record_external_drawing_result(p_organization_id uuid,p_snapshot_id uuid,p_idempotency_key text,p_drawn_at timestamptz,
  p_location text,p_operator text,p_witnesses jsonb,p_method text,p_winning_ticket_number text,p_result text,p_evidence_ref text default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare s public.drawing_snapshots; c public.campaigns; r public.drawing_results; entry public.drawing_snapshot_entries; fingerprint text;
  prior_write text:=coalesce(current_setting('raffle_hub.drawing_write',true),''); prior_reason text:=current_setting('raffle_hub.reason',true);
begin
  perform public.assert_org_permission(p_organization_id,'drawing.manage');
  select * into s from public.drawing_snapshots where id=p_snapshot_id and organization_id=p_organization_id;
  if not found then raise exception 'Drawing snapshot not found.' using errcode='no_data_found'; end if;
  c:=public.drawing_lock_campaign(p_organization_id,s.campaign_id,'drawing.manage');
  perform public.drawing_validate_request(p_idempotency_key,p_reason);
  fingerprint:=encode(extensions.digest(jsonb_build_object('snapshot_id',s.id,'drawn_at',p_drawn_at,'location',btrim(p_location),'operator',btrim(p_operator),
    'witnesses',p_witnesses,'method',p_method,'winning_ticket_number',btrim(p_winning_ticket_number),'result',btrim(p_result),'evidence_ref',nullif(btrim(p_evidence_ref),''),'reason',btrim(p_reason))::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('drawing-result:'||p_organization_id::text||':'||auth.uid()::text||':'||btrim(p_idempotency_key),0));
  select * into r from public.drawing_results where organization_id=p_organization_id and created_by=auth.uid() and idempotency_key=btrim(p_idempotency_key);
  if found then
    if r.request_fingerprint<>fingerprint then raise exception 'This idempotency key was already used for a different external drawing result.' using errcode='unique_violation'; end if;
    return jsonb_build_object('result_id',r.id,'snapshot_id',r.snapshot_id,'ticket_number',r.ticket_number,'replayed',true);
  end if;
  if c.status<>'CLOSED' or public.drawing_current_snapshot(c.id) is distinct from s.id
    or exists(select 1 from public.drawing_events where snapshot_id=s.id and event_type='CERTIFIED') then
    raise exception 'Record an external result only for the current closed, uncertified drawing.' using errcode='check_violation'; end if;
  if p_drawn_at is null or not isfinite(p_drawn_at) or p_drawn_at<s.created_at or p_drawn_at>clock_timestamp()
    or p_drawn_at<c.draw_at then raise exception 'The physical/external drawing timestamp must follow freeze and the disclosed drawing date and cannot be in the future.' using errcode='check_violation'; end if;
  if p_method is null or p_method not in ('physical','external')
    or p_location is null or length(btrim(p_location)) not between 3 and 500
    or p_operator is null or length(btrim(p_operator)) not between 3 and 200
    or p_result is null or length(btrim(p_result)) not between 3 and 2000
    or length(coalesce(p_evidence_ref,''))>1000 then
    raise exception 'Physical/external method, location, operator, result and valid evidence reference are required.' using errcode='check_violation'; end if;
  if p_witnesses is null or jsonb_typeof(p_witnesses)<>'array' then raise exception 'Record at least one drawing witness.' using errcode='check_violation'; end if;
  if jsonb_array_length(p_witnesses) not between 1 and 20
    or exists(select 1 from jsonb_array_elements(p_witnesses) w where jsonb_typeof(w)<>'string' or length(btrim(w#>>'{}')) not between 3 and 200) then
    raise exception 'Record 1–20 witness names of 3–200 characters.' using errcode='check_violation'; end if;
  select * into entry from public.drawing_snapshot_entries where snapshot_id=s.id and ticket_number=btrim(p_winning_ticket_number);
  if not found then raise exception 'The winning ticket must be included in this frozen drawing snapshot.' using errcode='check_violation'; end if;
  if not (public.drawing_integrity(s.id)->>'ok')::boolean then raise exception 'Drawing snapshot verification failed.' using errcode='check_violation'; end if;
  perform set_config('raffle_hub.drawing_write',c.id::text,true); perform public.set_audit_reason(btrim(p_reason));
  insert into public.drawing_results(organization_id,campaign_id,snapshot_id,winning_ticket_id,ticket_number,drawn_at,location,operator_name,witnesses,method,result,evidence_ref,reason,idempotency_key,request_fingerprint,result_hash)
    values(p_organization_id,c.id,s.id,entry.ticket_id,entry.ticket_number,p_drawn_at,btrim(p_location),btrim(p_operator),p_witnesses,p_method,btrim(p_result),nullif(btrim(p_evidence_ref),''),btrim(p_reason),btrim(p_idempotency_key),fingerprint,repeat('0',64)) returning * into r;
  -- The external winner is a new canonical fact, never a change to the issued
  -- ticket's identity, historical sale, or eligibility state. No buyer/evidence
  -- details are copied into the ticket ledger's broader read projection.
  insert into public.ticket_events(organization_id,campaign_id,ticket_id,event_type,participant_id,reason,idempotency_key,metadata,occurred_at)
    values(p_organization_id,c.id,entry.ticket_id,'WINNER',entry.participant_id,btrim(p_reason),'drawing-result:'||r.id::text,
      jsonb_build_object('snapshot_id',s.id,'result_id',r.id,'ticket_number',entry.ticket_number,'method',r.method),r.drawn_at);
  perform set_config('raffle_hub.drawing_write',prior_write,true); perform public.set_audit_reason(prior_reason);
  return jsonb_build_object('result_id',r.id,'snapshot_id',s.id,'ticket_number',r.ticket_number,'replayed',false);
end; $$;

create function public.certify_drawing(p_organization_id uuid,p_snapshot_id uuid,p_idempotency_key text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare s public.drawing_snapshots; c public.campaigns; e public.drawing_events; fingerprint text; results_hash text; results_count bigint;
  prior_write text:=coalesce(current_setting('raffle_hub.drawing_write',true),''); prior_reason text:=current_setting('raffle_hub.reason',true);
begin
  perform public.assert_org_permission(p_organization_id,'drawing.certify');
  select * into s from public.drawing_snapshots where id=p_snapshot_id and organization_id=p_organization_id;
  if not found then raise exception 'Drawing snapshot not found.' using errcode='no_data_found'; end if;
  c:=public.drawing_lock_campaign(p_organization_id,s.campaign_id,'drawing.certify');
  perform public.drawing_validate_request(p_idempotency_key,p_reason);
  fingerprint:=encode(extensions.digest(jsonb_build_object('snapshot_id',s.id,'reason',btrim(p_reason))::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('drawing-certify:'||p_organization_id::text||':'||auth.uid()::text||':'||btrim(p_idempotency_key),0));
  select * into e from public.drawing_events where organization_id=p_organization_id and created_by=auth.uid() and event_type='CERTIFIED' and idempotency_key=btrim(p_idempotency_key);
  if found then
    if e.request_fingerprint<>fingerprint then raise exception 'This idempotency key was already used for a different drawing certification.' using errcode='unique_violation'; end if;
    return jsonb_build_object('event_id',e.id,'snapshot_id',e.snapshot_id,'replayed',true);
  end if;
  if c.status<>'CLOSED' or public.drawing_current_snapshot(c.id) is distinct from s.id
    or exists(select 1 from public.drawing_events where snapshot_id=s.id and event_type='CERTIFIED') then
    raise exception 'Only the current closed drawing can be certified once.' using errcode='check_violation'; end if;
  if not (public.drawing_integrity(s.id)->>'ok')::boolean then raise exception 'Drawing snapshot verification failed.' using errcode='check_violation'; end if;
  if exists(select 1 from public.drawing_results r where r.snapshot_id=s.id and
    (r.result_hash<>encode(extensions.digest((to_jsonb(r)-'result_hash')::text,'sha256'),'hex')
      or not exists(select 1 from public.audit_events a where a.organization_id=r.organization_id and a.entity_type='drawing_results' and a.entity_id=r.id and a.after_data=to_jsonb(r))
      or not exists(select 1 from public.ticket_events t where t.organization_id=r.organization_id and t.campaign_id=r.campaign_id
        and t.ticket_id=r.winning_ticket_id and t.event_type='WINNER' and t.metadata->>'snapshot_id'=r.snapshot_id::text
        and t.metadata->>'result_id'=r.id::text and t.metadata->>'ticket_number'=r.ticket_number and t.metadata->>'method'=r.method))) then
    raise exception 'External drawing result verification failed.' using errcode='check_violation'; end if;
  select count(*),encode(extensions.digest(coalesce(string_agg(result_hash,'' order by created_at,id),''),'sha256'),'hex') into results_count,results_hash from public.drawing_results where snapshot_id=s.id;
  if results_count=0 then raise exception 'Record physical/external drawing evidence before certification.' using errcode='check_violation'; end if;
  perform set_config('raffle_hub.drawing_write',c.id::text,true); perform public.set_audit_reason(btrim(p_reason));
  insert into public.drawing_events(organization_id,campaign_id,snapshot_id,event_type,reason,idempotency_key,request_fingerprint,metadata)
    values(p_organization_id,c.id,s.id,'CERTIFIED',btrim(p_reason),btrim(p_idempotency_key),fingerprint,jsonb_build_object('manifest_hash',s.manifest_hash,'results_count',results_count,'results_hash',results_hash,'certifier',auth.uid())) returning * into e;
  perform set_config('raffle_hub.drawing_write',prior_write,true); perform public.set_audit_reason(prior_reason);
  return jsonb_build_object('event_id',e.id,'snapshot_id',s.id,'replayed',false);
end; $$;

create function public.drawing_overview(p_organization_id uuid,p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' set timezone = 'UTC' as $$
begin
  perform public.assert_org_permission(p_organization_id,'campaigns.read');
  if not exists(select 1 from public.campaigns where id=p_campaign_id and organization_id=p_organization_id) then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  return jsonb_build_object('campaign_id',p_campaign_id,'current_snapshot_id',public.drawing_current_snapshot(p_campaign_id),
    'snapshots',coalesce((select jsonb_agg(to_jsonb(s)-'request_fingerprint'-'idempotency_key' order by s.version desc) from public.drawing_snapshots s where s.campaign_id=p_campaign_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)-'request_fingerprint'-'idempotency_key' order by e.created_at,e.id) from public.drawing_events e where e.campaign_id=p_campaign_id),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(to_jsonb(r)-'request_fingerprint'-'idempotency_key' order by r.created_at,r.id) from public.drawing_results r where r.campaign_id=p_campaign_id),'[]'::jsonb),
    'can_export',public.drawing_has_export_authority(p_organization_id));
end; $$;

-- Freeze applies to every transaction path, not just a hidden UI button.
-- Existing committed sale/reversal retries return before these write triggers.
create function public.guard_frozen_drawing_ticket_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare campaign uuid;
begin
  campaign:=new.campaign_id;
  perform 1 from public.campaigns where id=campaign for update;
  if public.drawing_current_snapshot(campaign) is not null then
    raise exception 'Drawing entries are frozen. An authorized director must explicitly reopen before changing ticket validity.' using errcode='check_violation'; end if;
  return new;
end; $$;
create trigger sale_reversals_frozen_drawing_guard before insert on public.sale_reversals
  for each row execute function public.guard_frozen_drawing_ticket_change();
create trigger tickets_frozen_drawing_guard before update on public.tickets
  for each row when (old.status is distinct from new.status)
  execute function public.guard_frozen_drawing_ticket_change();

create function public.guard_drawing_campaign_finalization()
returns trigger language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare snapshot uuid; certification public.drawing_events; results_count bigint; results_hash text;
begin
  if old.status is distinct from new.status and new.status='DRAWN' then
    perform public.assert_org_permission(new.organization_id,'campaigns.activate');
    perform public.assert_org_permission(new.organization_id,'drawing.certify');
    perform public.lock_fundraising_membership(new.organization_id);
    perform public.assert_org_permission(new.organization_id,'campaigns.activate');
    perform public.assert_org_permission(new.organization_id,'drawing.certify');
    snapshot:=public.drawing_current_snapshot(new.id);
    if snapshot is null or not (public.drawing_integrity(snapshot)->>'ok')::boolean then
      raise exception 'A verified current frozen drawing snapshot is required before DRAWN.' using errcode='check_violation'; end if;
    select * into certification from public.drawing_events where snapshot_id=snapshot and event_type='CERTIFIED';
    if not found then raise exception 'Director drawing certification is required before DRAWN.' using errcode='check_violation'; end if;
    if certification.metadata->>'manifest_hash' is distinct from (select manifest_hash from public.drawing_snapshots where id=snapshot)
      or not exists(select 1 from public.audit_events a where a.organization_id=certification.organization_id
        and a.entity_type='drawing_events' and a.entity_id=certification.id and a.after_data=to_jsonb(certification)) then
      raise exception 'Director drawing certification does not match its original audit receipt.' using errcode='check_violation'; end if;
    select count(*),encode(extensions.digest(coalesce(string_agg(result_hash,'' order by created_at,id),''),'sha256'),'hex') into results_count,results_hash from public.drawing_results where snapshot_id=snapshot;
    if results_count=0 or results_count<>(certification.metadata->>'results_count')::bigint
      or results_hash is distinct from certification.metadata->>'results_hash'
      or exists(select 1 from public.drawing_results r where r.snapshot_id=snapshot and
        (r.result_hash<>encode(extensions.digest((to_jsonb(r)-'result_hash')::text,'sha256'),'hex')
          or not exists(select 1 from public.audit_events a where a.organization_id=r.organization_id and a.entity_type='drawing_results' and a.entity_id=r.id and a.after_data=to_jsonb(r))
          or not exists(select 1 from public.ticket_events t where t.organization_id=r.organization_id and t.campaign_id=r.campaign_id
            and t.ticket_id=r.winning_ticket_id and t.event_type='WINNER' and t.metadata->>'snapshot_id'=r.snapshot_id::text
            and t.metadata->>'result_id'=r.id::text and t.metadata->>'ticket_number'=r.ticket_number and t.metadata->>'method'=r.method))) then
      raise exception 'Certified physical/external drawing evidence does not verify.' using errcode='check_violation'; end if;
  end if;
  return new;
end; $$;
create trigger campaigns_drawing_finalization_guard before update on public.campaigns
  for each row execute function public.guard_drawing_campaign_finalization();

revoke all on function public.guard_drawing_insert(),public.guard_drawing_entry_insert(),public.hash_drawing_result(),
  public.guard_frozen_drawing_ticket_change(),public.guard_drawing_campaign_finalization() from public,anon,authenticated,service_role;
revoke all on function public.drawing_readiness(uuid,uuid),public.drawing_overview(uuid,uuid),
  public.freeze_drawing(uuid,uuid,text,text,boolean),public.reopen_drawing(uuid,uuid,text,text),
  public.drawing_snapshot_export(uuid,uuid,integer,integer),public.export_drawing_snapshot(uuid,uuid,text,text,text),
  public.verify_drawing_snapshot(uuid,uuid),public.record_external_drawing_result(uuid,uuid,text,timestamptz,text,text,jsonb,text,text,text,text,text),
  public.certify_drawing(uuid,uuid,text,text) from public,anon,service_role;
grant execute on function public.drawing_readiness(uuid,uuid),public.drawing_overview(uuid,uuid),
  public.freeze_drawing(uuid,uuid,text,text,boolean),public.reopen_drawing(uuid,uuid,text,text),
  public.drawing_snapshot_export(uuid,uuid,integer,integer),public.export_drawing_snapshot(uuid,uuid,text,text,text),
  public.verify_drawing_snapshot(uuid,uuid),public.record_external_drawing_result(uuid,uuid,text,timestamptz,text,text,jsonb,text,text,text,text,text),
  public.certify_drawing(uuid,uuid,text,text) to authenticated;
