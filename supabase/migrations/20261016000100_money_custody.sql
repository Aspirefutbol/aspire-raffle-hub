-- Physical custody is independent of sale/ticket validity. Existing ledger
-- payloads, original sales, reversals and drawing snapshots are never rewritten.
create table public.money_custody_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null,
  kind text not null check (kind in ('receipt','check_cleared','check_returned','exception_opened','exception_resolved','refund','credit','adjustment','deposit')),
  seller_id uuid not null references auth.users(id),
  receipt_id uuid,
  sale_id uuid,
  target_sale_id uuid,
  exception_id uuid,
  amount_cents bigint not null,
  payment_method text check (payment_method in ('cash','check')),
  reference text,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  actor_id uuid not null references auth.users(id),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  request_fingerprint text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id, campaign_id),
  unique (organization_id, actor_id, idempotency_key),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id),
  foreign key (receipt_id, organization_id, campaign_id) references public.money_custody_events(id, organization_id, campaign_id),
  foreign key (exception_id, organization_id, campaign_id) references public.money_custody_events(id, organization_id, campaign_id),
  foreign key (sale_id, organization_id, campaign_id) references public.campaign_sales(id, organization_id, campaign_id),
  foreign key (target_sale_id, organization_id, campaign_id) references public.campaign_sales(id, organization_id, campaign_id)
);
create table public.money_custody_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  event_id uuid not null,
  sale_id uuid not null,
  receipt_id uuid,
  bucket text not null check (bucket in ('received','adjustment','deposit')),
  amount_cents bigint not null check (amount_cents <> 0),
  foreign key (event_id, organization_id, campaign_id) references public.money_custody_events(id, organization_id, campaign_id),
  foreign key (receipt_id, organization_id, campaign_id) references public.money_custody_events(id, organization_id, campaign_id),
  foreign key (sale_id, organization_id, campaign_id) references public.campaign_sales(id, organization_id, campaign_id),
  check ((bucket = 'adjustment') = (receipt_id is null))
);
create index custody_campaign_idx on public.money_custody_events(campaign_id, occurred_at, id);
create index custody_receipt_idx on public.money_custody_events(receipt_id, kind);
create index custody_sale_alloc_idx on public.money_custody_allocations(sale_id, bucket);
create index custody_receipt_alloc_idx on public.money_custody_allocations(receipt_id, sale_id);

create function public.guard_money_custody_insert() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'postgres' or current_setting('raffle_hub.custody_write', true) is distinct from 'on' then
    raise exception 'Use the money custody transaction RPC.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_money_custody_insert() from public, anon, authenticated, service_role;
do $$ declare t text; begin
  foreach t in array array['money_custody_events','money_custody_allocations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy custody_financial_read on public.%I for select to authenticated using (
      public.has_org_permission(organization_id, ''reconciliation.manage'') or
      public.has_org_permission(organization_id, ''adjustments.approve'') or
      public.has_org_permission(organization_id, ''audit.read''))', t);
    execute format('create trigger custody_insert_guard before insert on public.%I for each row execute function public.guard_money_custody_insert()', t);
    execute format('create trigger custody_immutable before update or delete on public.%I for each row execute function public.prevent_ledger_mutation()', t);
    execute format('create trigger custody_audit after insert on public.%I for each row execute function public.audit_row_change(''MONEY_CUSTODY'')', t);
  end loop;
end $$;

-- Internal accounting projection. Never grant this owner-rights view to clients.
create view public.money_sale_balances as
with recursive accountable_sales as (
  select id, created_by as seller_id from public.campaign_sales where corrects_sale_id is null
  union all
  select child.id, parent.seller_id from public.campaign_sales child
  join accountable_sales parent on parent.id=child.corrects_sale_id
)
select s.id, s.organization_id, s.campaign_id, s.participant_id, accountable.seller_id,
  s.amount_cents as recorded_cents, s.sold_at, s.payment_method,
  case when exists(select 1 from public.sale_reversals r where r.sale_id=s.id) then 0 else s.amount_cents end::bigint as expected_cents,
  coalesce(a.received,0)::bigint as received_cents,
  coalesce(a.adjusted,0)::bigint as adjustment_cents,
  coalesce(a.deposited,0)::bigint as deposited_cents,
  coalesce(a.uncleared,0)::bigint as uncleared_cents,
  (coalesce(a.exceptions,0) + coalesce((select sum(e.amount_cents) from public.money_custody_events e
    where e.sale_id=s.id and e.kind='exception_opened' and not exists(
      select 1 from public.money_custody_events resolved where resolved.exception_id=e.id and resolved.kind='exception_resolved')),0))::bigint as exception_cents
from public.campaign_sales s
join accountable_sales accountable on accountable.id=s.id
left join lateral (
  select sum(x.amount_cents) filter(where x.bucket='received') as received,
    sum(x.amount_cents) filter(where x.bucket='adjustment') as adjusted,
    sum(x.amount_cents) filter(where x.bucket='deposit') as deposited,
    sum(x.amount_cents) filter(where x.bucket='received' and receipt.payment_method='check'
      and not exists(select 1 from public.money_custody_events c where c.receipt_id=receipt.id and c.kind in ('check_cleared','check_returned'))) as uncleared,
    -sum(x.amount_cents) filter(where e.kind='check_returned'
      and not exists(select 1 from public.money_custody_events c where c.receipt_id=receipt.id and c.kind='exception_resolved')) as exceptions
  from public.money_custody_allocations x
  join public.money_custody_events e on e.id=x.event_id
  left join public.money_custody_events receipt on receipt.id=x.receipt_id
  where x.sale_id=s.id
) a on true;
revoke all on public.money_sale_balances from public, anon, authenticated, service_role;

create function public.record_money_custody(p_organization_id uuid, p_campaign_id uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  action text := p_request->>'kind';
  request_key text := nullif(btrim(p_request->>'idempotency_key'),'');
  reason text := nullif(btrim(p_request->>'reason'),'');
  reference text := nullif(btrim(p_request->>'reference'),'');
  amount bigint := (p_request->>'amount_cents')::bigint;
  receipt_id uuid := (p_request->>'receipt_id')::uuid;
  sale_id uuid := (p_request->>'sale_id')::uuid;
  target_id uuid := (p_request->>'target_sale_id')::uuid;
  exception_id uuid := (p_request->>'exception_id')::uuid;
  seller_id uuid := (p_request->>'seller_id')::uuid;
  payment text := p_request->>'payment_method';
  me uuid := auth.uid();
  event_id uuid := gen_random_uuid();
  receipt public.money_custody_events;
  previous public.money_custody_events;
  opened public.money_custody_events;
  sale public.money_sale_balances;
  target public.money_sale_balances;
  campaign public.campaigns;
  fingerprint text;
  available bigint;
  remaining bigint;
  portion bigint;
  position record;
  old_context text := coalesce(current_setting('raffle_hub.custody_write',true),'');
  old_reason text := current_setting('raffle_hub.reason',true);
begin
  if me is null then raise exception 'Sign in to record money custody.' using errcode='insufficient_privilege'; end if;
  if action is null or action not in ('receipt','check_cleared','check_returned','exception_opened','exception_resolved','refund','credit','adjustment','deposit')
    or jsonb_typeof(p_request) <> 'object'
    or exists(select 1 from jsonb_object_keys(p_request) k where k not in
      ('kind','idempotency_key','reason','reference','amount_cents','receipt_id','sale_id','target_sale_id','exception_id','seller_id','payment_method')) then
    raise exception 'Invalid custody operation.' using errcode='check_violation';
  end if;
  perform public.assert_org_permission(p_organization_id,
    case when action in ('refund','credit','adjustment') then 'adjustments.approve' else 'reconciliation.manage' end);
  select * into campaign from public.campaigns where id=p_campaign_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;
  perform public.lock_fundraising_membership(p_organization_id);
  perform public.assert_org_permission(p_organization_id,
    case when action in ('refund','credit','adjustment') then 'adjustments.approve' else 'reconciliation.manage' end);
  if reason is null or length(reason) not between 3 and 500 or request_key is null or length(request_key)>200
    or length(coalesce(reference,''))>200 then
    raise exception 'Supply a submission key and a reason of 3–500 characters.' using errcode='check_violation';
  end if;
  fingerprint := encode(extensions.digest(jsonb_build_object('campaign',p_campaign_id,'request',
    p_request - 'idempotency_key' - 'reason' - 'reference' || jsonb_build_object('reason',reason,'reference',reference))::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('money-custody:'||p_organization_id::text||':'||me::text||':'||request_key,0));
  select * into previous from public.money_custody_events e
    where e.organization_id=p_organization_id and e.actor_id=me and e.idempotency_key=request_key;
  if found then
    if previous.request_fingerprint<>fingerprint then raise exception 'Submission key belongs to a different request.' using errcode='check_violation'; end if;
    return jsonb_build_object('event_id',previous.id,'amount_cents',previous.amount_cents,'replayed',true);
  end if;
  if campaign.status not in ('ACTIVE','CLOSED','DRAWN','ARCHIVED') then
    raise exception 'Money custody requires a launched campaign.' using errcode='check_violation';
  end if;
  if exception_id is not null then
    select * into opened from public.money_custody_events e where e.id=exception_id
      and e.organization_id=p_organization_id and e.campaign_id=p_campaign_id and e.kind='exception_opened';
    if not found or action<>'exception_resolved' or receipt_id is not null then
      raise exception 'Select one existing exception in this campaign.' using errcode='check_violation'; end if;
    sale_id := opened.sale_id;
    if exists(select 1 from public.money_custody_events e where e.exception_id=exception_id and e.kind='exception_resolved') then
      raise exception 'Exception already resolved.' using errcode='check_violation'; end if;
  end if;
  if receipt_id is not null then
    select * into receipt from public.money_custody_events e where e.id=receipt_id
      and e.organization_id=p_organization_id and e.campaign_id=p_campaign_id and e.kind='receipt';
    if not found then raise exception 'Receipt not found in this campaign.' using errcode='no_data_found'; end if;
    seller_id := receipt.seller_id;
  end if;
  if sale_id is not null then
    select * into sale from public.money_sale_balances s where s.id=sale_id
      and s.organization_id=p_organization_id and s.campaign_id=p_campaign_id;
    if not found then raise exception 'Sale not found in this campaign.' using errcode='no_data_found'; end if;
    if receipt_id is not null and seller_id<>sale.seller_id then raise exception 'Receipt belongs to another seller.' using errcode='check_violation'; end if;
    seller_id := sale.seller_id;
  end if;
  if seller_id is null then raise exception 'Seller is required.' using errcode='check_violation'; end if;
  if action in ('receipt','refund','credit','deposit','adjustment','exception_opened') then
    if amount is null or amount=0 or abs(amount)>1000000000000 or (action<>'adjustment' and amount<0) then
      raise exception 'Enter valid integer cents.' using errcode='check_violation';
    end if;
  else
    amount := case when action='check_returned' then receipt.amount_cents else 0 end;
  end if;
  if action='receipt' then
    if receipt_id is not null or sale_id is not null or target_id is not null or payment is null or payment not in ('cash','check') then
      raise exception 'A receipt requires a seller and offline cash/check method.' using errcode='check_violation'; end if;
    select coalesce(sum(b.expected_cents-b.received_cents-b.adjustment_cents),0) into available
      from public.money_sale_balances b where b.campaign_id=p_campaign_id and b.seller_id=seller_id;
    if amount>greatest(available,0) then
      raise exception 'Receipt exceeds seller net outstanding; allocate existing credits first.' using errcode='check_violation'; end if;
  elsif action in ('adjustment','exception_opened') then
    if sale_id is null or receipt_id is not null or target_id is not null then raise exception 'Adjustment requires a sale only.' using errcode='check_violation'; end if;
    if action='adjustment' and ((amount>0 and amount>greatest(sale.expected_cents-sale.received_cents-sale.adjustment_cents,0))
      or (amount<0 and -amount>sale.adjustment_cents)) then
      raise exception 'Adjustment exceeds outstanding or prior approved relief.' using errcode='check_violation'; end if;
  elsif action='exception_resolved' and exception_id is not null then
    if sale.expected_cents-sale.received_cents-sale.adjustment_cents>0 then
      raise exception 'Settle or approve outstanding funds before resolving the exception.' using errcode='check_violation'; end if;
  else
    if receipt_id is null then raise exception 'Receipt is required.' using errcode='check_violation'; end if;
    if action in ('check_cleared','check_returned','exception_resolved') then
      if receipt.payment_method<>'check' then raise exception 'This operation requires a check receipt.' using errcode='check_violation'; end if;
      if exists(select 1 from public.money_custody_events e where e.receipt_id=receipt_id and e.kind=action) then
        raise exception 'Check outcome already recorded; reuse its original submission key.' using errcode='check_violation'; end if;
      if action='check_cleared' and exists(select 1 from public.money_custody_events e where e.receipt_id=receipt_id and e.kind='check_returned') then
        raise exception 'A returned check cannot be cleared; record replacement money separately.' using errcode='check_violation'; end if;
      if action='exception_resolved' then
        if not exists(select 1 from public.money_custody_events e where e.receipt_id=receipt_id and e.kind='check_returned') then
          raise exception 'No returned-check exception exists.' using errcode='check_violation'; end if;
        select coalesce(sum(greatest(b.expected_cents-b.received_cents-b.adjustment_cents,0)),0) into available
          from public.money_sale_balances b where b.campaign_id=p_campaign_id and b.seller_id=seller_id;
        if available>0 then raise exception 'Settle or approve outstanding funds before resolving the exception.' using errcode='check_violation'; end if;
      end if;
    elsif action='deposit' then
      if receipt.payment_method='check' and not exists(select 1 from public.money_custody_events e where e.receipt_id=receipt_id and e.kind='check_cleared') then
        raise exception 'Clear a check before recording its deposit.' using errcode='check_violation'; end if;
      if exists(select 1 from public.money_custody_events e where e.receipt_id=receipt_id and e.kind='check_returned') then
        raise exception 'Returned checks cannot be deposited.' using errcode='check_violation'; end if;
      select coalesce(sum(case when a.bucket='received' then a.amount_cents when a.bucket='deposit' then -a.amount_cents else 0 end),0)
        into available from public.money_custody_allocations a where a.receipt_id=receipt_id;
      if amount>available then raise exception 'Deposit exceeds undeposited funds.' using errcode='check_violation'; end if;
    elsif action in ('refund','credit') then
      if sale_id is null then raise exception 'Source sale is required.' using errcode='check_violation'; end if;
      select coalesce(sum(a.amount_cents),0) into available from public.money_custody_allocations a
        where a.receipt_id=receipt_id and a.sale_id=sale_id and a.bucket='received';
      if amount>available then raise exception 'Amount exceeds funds held for this receipt and sale.' using errcode='check_violation'; end if;
      if action='credit' then
        select * into target from public.money_sale_balances s where s.id=target_id and s.campaign_id=p_campaign_id
          and s.organization_id=p_organization_id and s.seller_id=seller_id;
        if not found or target_id=sale_id or amount>greatest(sale.received_cents+sale.adjustment_cents-sale.expected_cents,0)
          or amount>greatest(target.expected_cents-target.received_cents-target.adjustment_cents,0) then
          raise exception 'Credit requires source overpayment and a same-seller outstanding destination.' using errcode='check_violation'; end if;
      end if;
    end if;
  end if;

  perform set_config('raffle_hub.custody_write','on',true);
  perform public.set_audit_reason(reason);
  insert into public.money_custody_events(id,organization_id,campaign_id,kind,seller_id,receipt_id,sale_id,target_sale_id,exception_id,
    amount_cents,payment_method,reference,reason,actor_id,idempotency_key,request_fingerprint)
  values(event_id,p_organization_id,p_campaign_id,action,seller_id,receipt_id,sale_id,target_id,exception_id,amount,
    case when action='receipt' then payment else receipt.payment_method end,reference,reason,me,request_key,fingerprint);
  if action='receipt' then
    remaining := amount;
    for position in select b.*, greatest(b.expected_cents-b.received_cents-b.adjustment_cents,0) as due
      from public.money_sale_balances b where b.campaign_id=p_campaign_id and b.seller_id=seller_id
      order by b.sold_at,b.id loop
      portion := least(remaining,position.due);
      if portion>0 then
        insert into public.money_custody_allocations(organization_id,campaign_id,event_id,sale_id,receipt_id,bucket,amount_cents)
        values(p_organization_id,p_campaign_id,event_id,position.id,event_id,'received',portion);
        remaining := remaining-portion;
      end if;
      exit when remaining=0;
    end loop;
    if remaining<>0 then raise exception 'Receipt allocation failed.' using errcode='check_violation'; end if;
  elsif action in ('refund','credit','adjustment') then
    insert into public.money_custody_allocations(organization_id,campaign_id,event_id,sale_id,receipt_id,bucket,amount_cents)
    values(p_organization_id,p_campaign_id,event_id,sale_id,receipt_id,
      case when action='adjustment' then 'adjustment' else 'received' end,
      case when action='adjustment' then amount else -amount end);
    if action='credit' then
      insert into public.money_custody_allocations(organization_id,campaign_id,event_id,sale_id,receipt_id,bucket,amount_cents)
      values(p_organization_id,p_campaign_id,event_id,target_id,receipt_id,'received',amount);
    end if;
  elsif action='check_returned' then
    -- Follow credit transfers, but not refunds: a late bounce reverses the
    -- full original check. Refunded cash remains an explicit outflow/loss.
    for position in select a.sale_id,sum(a.amount_cents)::bigint as held
      from public.money_custody_allocations a join public.money_custody_events e on e.id=a.event_id
      where a.receipt_id=receipt_id and a.bucket='received' and e.kind in ('receipt','credit')
      group by a.sale_id having sum(a.amount_cents)>0 order by a.sale_id loop
      insert into public.money_custody_allocations(organization_id,campaign_id,event_id,sale_id,receipt_id,bucket,amount_cents)
      values(p_organization_id,p_campaign_id,event_id,position.sale_id,receipt_id,'received',-position.held);
    end loop;
  elsif action='deposit' then
    remaining := amount;
    for position in select a.sale_id,
      sum(case when a.bucket='received' then a.amount_cents when a.bucket='deposit' then -a.amount_cents else 0 end)::bigint as held
      from public.money_custody_allocations a where a.receipt_id=receipt_id
      group by a.sale_id order by a.sale_id loop
      portion := least(remaining,greatest(position.held,0));
      if portion>0 then
        insert into public.money_custody_allocations(organization_id,campaign_id,event_id,sale_id,receipt_id,bucket,amount_cents)
        values(p_organization_id,p_campaign_id,event_id,position.sale_id,receipt_id,'deposit',portion);
        remaining := remaining-portion;
      end if;
      exit when remaining=0;
    end loop;
    if remaining<>0 then raise exception 'Deposit allocation failed.' using errcode='check_violation'; end if;
  end if;
  insert into public.money_events(organization_id,campaign_id,event_type,amount_cents,payment_method,batch_ref,reason,approved_by,metadata)
    values(p_organization_id,p_campaign_id,case action when 'receipt' then 'TURN_IN' when 'check_returned' then 'EXCEPTION_OPENED'
      when 'exception_opened' then 'EXCEPTION_OPENED' when 'exception_resolved' then 'EXCEPTION_RESOLVED' else 'ADJUSTMENT' end,
      case action when 'receipt' then amount when 'refund' then -amount when 'adjustment' then amount else 0 end,
      case when action='receipt' then payment else receipt.payment_method end,reference,reason,
      case when action in ('refund','credit','adjustment') then me end,
      jsonb_build_object('custody_event_id',event_id,'kind',action,'receipt_id',receipt_id,'seller_id',seller_id));
  perform set_config('raffle_hub.custody_write',old_context,true);
  perform public.set_audit_reason(old_reason);
  return jsonb_build_object('event_id',event_id,'amount_cents',amount,'replayed',false);
end;
$$;
revoke all on function public.record_money_custody(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.record_money_custody(uuid,uuid,jsonb) to authenticated;

create function public.campaign_money(p_organization_id uuid,p_campaign_id uuid,p_view text default 'admin')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare rows jsonb; totals jsonb; teams jsonb; sellers jsonb; events jsonb; sales jsonb;
begin
  if auth.uid() is null or p_view not in ('admin','family','team') then
    raise exception 'Invalid money view.' using errcode='insufficient_privilege'; end if;
  if p_view='admin' and not (public.has_org_permission(p_organization_id,'reconciliation.manage')
    or public.has_org_permission(p_organization_id,'adjustments.approve') or public.has_org_permission(p_organization_id,'audit.read')) then
    raise exception 'Financial authority is required.' using errcode='insufficient_privilege'; end if;
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.organization_id=p_organization_id)
    or not public.is_org_member(p_organization_id) then
    raise exception 'Campaign not found.' using errcode='insufficient_privilege'; end if;
  with visible as (
    select cp.id,cp.player_id,cp.team_id,p.first_name||' '||p.last_name as player_name,t.name as team_name,
      coalesce(sum(b.recorded_cents),0)::bigint as recorded_cents,
      coalesce(sum(b.expected_cents),0)::bigint as expected_cents,
      coalesce(sum(b.received_cents),0)::bigint as received_cents,
      coalesce(sum(greatest(b.expected_cents-b.received_cents-b.adjustment_cents,0)),0)::bigint as outstanding_cents,
      coalesce(sum(greatest(b.received_cents+b.adjustment_cents-b.expected_cents,0)),0)::bigint as credit_cents,
      coalesce(sum(b.received_cents-b.uncleared_cents),0)::bigint as reconciled_cents,
      coalesce(sum(b.uncleared_cents),0)::bigint as uncleared_cents,
      coalesce(sum(b.exception_cents),0)::bigint as exception_cents,
      coalesce(sum(b.adjustment_cents),0)::bigint as adjustment_cents,
      coalesce(sum(b.deposited_cents),0)::bigint as deposited_cents
    from public.campaign_participants cp join public.players p on p.id=cp.player_id
    left join public.teams t on t.id=cp.team_id left join public.money_sale_balances b on b.participant_id=cp.id
    where cp.organization_id=p_organization_id and cp.campaign_id=p_campaign_id
      and (p_view='admin' or public.can_read_fundraising_participant(cp.id,p_view))
    group by cp.id,p.first_name,p.last_name,t.name
  ) select coalesce(jsonb_agg(to_jsonb(v) order by v.player_name,v.id),'[]') into rows from visible v;
  if p_view<>'admin' and jsonb_array_length(rows)=0 then raise exception 'Campaign not found.' using errcode='insufficient_privilege'; end if;
  select jsonb_build_object('recorded_cents',coalesce(sum((r->>'recorded_cents')::bigint),0),
    'expected_cents',coalesce(sum((r->>'expected_cents')::bigint),0),'received_cents',coalesce(sum((r->>'received_cents')::bigint),0),
    'outstanding_cents',coalesce(sum((r->>'outstanding_cents')::bigint),0),'credit_cents',coalesce(sum((r->>'credit_cents')::bigint),0),
    'reconciled_cents',coalesce(sum((r->>'reconciled_cents')::bigint),0),'uncleared_cents',coalesce(sum((r->>'uncleared_cents')::bigint),0),
    'exception_cents',coalesce(sum((r->>'exception_cents')::bigint),0),'adjustment_cents',coalesce(sum((r->>'adjustment_cents')::bigint),0),
    'deposited_cents',coalesce(sum((r->>'deposited_cents')::bigint),0)) into totals from jsonb_array_elements(rows) r;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into teams from (
    select r->>'team_id' as id,r->>'team_name' as name,
      sum((r->>'expected_cents')::bigint) as expected_cents,sum((r->>'received_cents')::bigint) as received_cents,
      sum((r->>'outstanding_cents')::bigint) as outstanding_cents,sum((r->>'reconciled_cents')::bigint) as reconciled_cents,
      sum((r->>'exception_cents')::bigint) as exception_cents,sum((r->>'uncleared_cents')::bigint) as uncleared_cents,
      sum((r->>'credit_cents')::bigint) as credit_cents,sum((r->>'deposited_cents')::bigint) as deposited_cents,
      sum((r->>'adjustment_cents')::bigint) as adjustment_cents,sum((r->>'recorded_cents')::bigint) as recorded_cents
    from jsonb_array_elements(rows) r group by r->>'team_id',r->>'team_name' order by r->>'team_name'
  ) t;
  if p_view='admin' then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]') into sellers from (
      select b.seller_id as id,coalesce(p.full_name,'Seller') as name,
        sum(b.expected_cents) as expected_cents,sum(b.received_cents) as received_cents,
        sum(greatest(b.expected_cents-b.received_cents-b.adjustment_cents,0)) as outstanding_cents,
        sum(greatest(b.received_cents+b.adjustment_cents-b.expected_cents,0)) as credit_cents,
        sum(b.received_cents-b.uncleared_cents) as reconciled_cents,sum(b.exception_cents) as exception_cents,
        sum(b.uncleared_cents) as uncleared_cents,sum(b.deposited_cents) as deposited_cents
      from public.money_sale_balances b left join public.profiles p on p.id=b.seller_id
      where b.campaign_id=p_campaign_id group by b.seller_id,p.full_name order by p.full_name,b.seller_id
    ) t;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc,e.id),'[]') into events from public.money_custody_events e where e.campaign_id=p_campaign_id;
    select coalesce(jsonb_agg(to_jsonb(b) order by b.sold_at,b.id),'[]') into sales from public.money_sale_balances b where b.campaign_id=p_campaign_id;
  end if;
  return jsonb_build_object('totals',totals,'participants',rows,'teams',teams,
    'sellers',coalesce(sellers,'[]'),'events',coalesce(events,'[]'),'sales',coalesce(sales,'[]'));
end;
$$;
revoke all on function public.campaign_money(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.campaign_money(uuid,uuid,text) to authenticated;
