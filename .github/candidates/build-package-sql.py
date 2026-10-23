from pathlib import Path
import re
ROOT=Path.cwd()
M=ROOT/'supabase/migrations'
def fn(file,name):
 s=(M/file).read_text(); m=re.search(r'create (?:or replace )?function public\.'+name+r'\(',s,re.I)
 if not m: raise ValueError(name)
 end=s.index('$$;',s.index('as $$',m.start())+5)+3
 return s[m.start():end].replace('create function','create or replace function',1)
def rep(s,old,new,n=1):
 if s.count(old)!=n: raise ValueError(f'anchor count {s.count(old)} not {n}: {old[:100]}')
 return s.replace(old,new)
head='''-- Additive campaign pricing. Existing sales, money events, ticket numbers and
-- frozen drawing evidence are not rewritten. No new roles or public endpoints.
-- Generated with the pinned CLI on the isolated implementation runner.

create function public.valid_campaign_ticket_packages(p_single bigint, p_packages jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; q numeric; p numeric; seen integer[] := '{}';
begin
  if p_single is not null and (p_single < 1 or p_single > 100000) then return false; end if;
  if jsonb_typeof(p_packages) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_packages) > 19 then return false; end if;
  if jsonb_array_length(p_packages) > 0 and p_single is null then return false; end if;
  for item in select value from jsonb_array_elements(p_packages) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if not (item ?& array['quantity','priceCents']) or item - 'quantity' - 'priceCents' <> '{}'::jsonb then return false; end if;
    if jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'priceCents') is distinct from 'number' then return false; end if;
    q := (item->>'quantity')::numeric; p := (item->>'priceCents')::numeric;
    if q <> trunc(q) or q < 2 or q > 500 or p <> trunc(p) or p < q or p > q*p_single then return false; end if;
    if q::integer = any(seen) then return false; end if;
    seen := array_append(seen,q::integer);
  end loop;
  return true;
exception when others then return false;
end; $$;
revoke all on function public.valid_campaign_ticket_packages(bigint,jsonb) from public,anon;
-- Pure validation is needed by the campaign CHECK under caller-bound RLS.
grant execute on function public.valid_campaign_ticket_packages(bigint,jsonb) to authenticated,service_role;

alter table public.campaigns add column ticket_packages jsonb not null default '[]'::jsonb;
alter table public.campaigns add constraint campaigns_ticket_packages_valid
  check (public.valid_campaign_ticket_packages(ticket_price_cents,ticket_packages));
comment on column public.campaigns.ticket_packages is
  'Optional discounted bundles {quantity,priceCents}; single price remains ticket_price_cents. Locked at activation.';
alter table public.campaign_sales add column pricing_snapshot jsonb;
comment on column public.campaign_sales.pricing_snapshot is
  'Immutable server-calculated V1 package quote and per-ticket cents. NULL only for pre-package legacy sales; never backfilled.';

-- Exact dynamic programming, same choice order/tie policy as the TS calculator.
-- All supported campaign totals are bounded by 500 * 100000 integer cents.
create function public.quote_campaign_ticket_packages(p_quantity integer,p_single bigint,p_packages jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  totals bigint[]; counts integer[]; choices integer[]; used integer[];
  tickets integer; q integer; price bigint; candidate bigint; candidate_count integer;
  remaining integer; lines jsonb := '[]';
begin
  if p_quantity is null or p_quantity not between 1 and 500 or p_single is null
     or not public.valid_campaign_ticket_packages(p_single,p_packages) then
    raise exception 'Invalid ticket package pricing or quantity.' using errcode='check_violation';
  end if;
  totals := array_fill(null::bigint,array[p_quantity+1],array[0]);
  counts := array_fill(null::integer,array[p_quantity+1],array[0]);
  choices := array_fill(null::integer,array[p_quantity+1],array[0]);
  used := array_fill(0,array[501],array[0]);
  totals[0]:=0; counts[0]:=0;
  for tickets in 1..p_quantity loop
    for q,price in
      select x.quantity,x.price from (
        select 1 as quantity,p_single as price
        union all select (v->>'quantity')::integer,(v->>'priceCents')::bigint from jsonb_array_elements(p_packages) v
      ) x order by x.quantity desc
    loop
      if q > tickets then continue; end if;
      if totals[tickets-q] is null then continue; end if;
      candidate:=totals[tickets-q]+price; candidate_count:=counts[tickets-q]+1;
      if totals[tickets] is null or candidate < totals[tickets]
         or (candidate=totals[tickets] and candidate_count<counts[tickets]) then
        totals[tickets]:=candidate; counts[tickets]:=candidate_count; choices[tickets]:=q;
      end if;
    end loop;
  end loop;
  remaining:=p_quantity;
  while remaining>0 loop
    q:=choices[remaining];
    if q is null then raise exception 'Unable to quote exact ticket quantity.' using errcode='check_violation'; end if;
    used[q]:=used[q]+1; remaining:=remaining-q;
  end loop;
  for q,price in
    select x.quantity,x.price from (
      select 1 as quantity,p_single as price
      union all select (v->>'quantity')::integer,(v->>'priceCents')::bigint from jsonb_array_elements(p_packages) v
    ) x order by x.quantity desc
  loop
    if used[q]>0 then lines:=lines||jsonb_build_array(jsonb_build_object('quantity',q,'priceCents',price,'count',used[q])); end if;
  end loop;
  return jsonb_build_object('quantity',p_quantity,'totalCents',totals[p_quantity],'packages',lines);
end; $$;
revoke all on function public.quote_campaign_ticket_packages(integer,bigint,jsonb) from public,anon,authenticated,service_role;

create function public.campaign_sale_pricing(p_quantity integer,p_single bigint,p_packages jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare quote jsonb; line jsonb; q integer; price bigint; repeats integer; j integer; k integer; amounts bigint[] := '{}';
begin
  quote:=public.quote_campaign_ticket_packages(p_quantity,p_single,p_packages);
  for line in select value from jsonb_array_elements(quote->'packages') loop
    q:=(line->>'quantity')::integer; price:=(line->>'priceCents')::bigint; repeats:=(line->>'count')::integer;
    for k in 1..repeats loop
      for j in 1..q loop
        amounts:=array_append(amounts,price/q+case when j<=price%q then 1 else 0 end);
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('version',1,'singleTicketPriceCents',p_single,
    'packages',jsonb_build_array(jsonb_build_object('quantity',1,'priceCents',p_single))||p_packages,
    'quote',quote,'ticketAmountsCents',to_jsonb(amounts));
end; $$;
revoke all on function public.campaign_sale_pricing(integer,bigint,jsonb) from public,anon,authenticated,service_role;

create function public.sale_pricing_consistent(s public.campaign_sales,c public.campaigns)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if s.pricing_snapshot is null then
    return c.ticket_packages='[]'::jsonb and s.amount_cents=s.quantity::bigint*c.ticket_price_cents;
  end if;
  return s.pricing_snapshot=public.campaign_sale_pricing(s.quantity,c.ticket_price_cents,c.ticket_packages)
    and (s.pricing_snapshot->'quote'->>'totalCents')::bigint=s.amount_cents;
exception when others then return false;
end; $$;
revoke all on function public.sale_pricing_consistent(public.campaign_sales,public.campaigns) from public,anon,authenticated,service_role;

'''
parts=[head]
for name,file in [('campaign_compliance_payload','20261020170805_controlled_pilot_compliance.sql'),('campaign_compliance_fields','20261020170805_controlled_pilot_compliance.sql'),('campaign_locked_fields','20261020181102_compliance_attestation_server_guard.sql')]:
 s=fn(file,name)
 if name=='campaign_locked_fields':
  s=rep(s,"    'ticket_price_cents', c.ticket_price_cents,", "    'ticket_price_cents', c.ticket_price_cents,\n    'ticket_packages', c.ticket_packages,")
 else:
  s=rep(s,'  );\n$$;',"  ) || case when c.ticket_packages='[]'::jsonb then '{}'::jsonb else jsonb_build_object('ticket_packages',c.ticket_packages) end;\n$$;")
 parts.append(s)
s=fn('20261014000200_fundraising_sales.sql','record_campaign_sale')
s=rep(s,'  fingerprint text;','  fingerprint text;\n  pricing jsonb;')
s=rep(s,"'quantity', previous_sale.quantity, 'replayed', true);","'quantity', previous_sale.quantity, 'replayed', true, 'pricing_snapshot', previous_sale.pricing_snapshot);")
s=rep(s,"  if campaign.ticket_price_cents is null\n     or p_amount_cents <> campaign.ticket_price_cents::bigint * p_quantity::bigint then\n    raise exception 'Amount collected must equal quantity times the campaign ticket price.' using errcode = 'check_violation';\n  end if;", "  pricing := public.campaign_sale_pricing(p_quantity,campaign.ticket_price_cents,campaign.ticket_packages);\n  if p_amount_cents <> (pricing->'quote'->>'totalCents')::bigint then\n    raise exception 'Amount collected must equal the approved ticket package total.' using errcode = 'check_violation';\n  end if;")
s=rep(s,"'quantity', p_quantity, 'corrects_sale_id', p_corrects_sale_id)), sold_at);", "'quantity', p_quantity, 'corrects_sale_id', p_corrects_sale_id, 'pricing_snapshot', pricing)), sold_at);")
s=rep(s,'request_fingerprint, collection_event_id, corrects_sale_id)', 'request_fingerprint, collection_event_id, corrects_sale_id, pricing_snapshot)')
s=rep(s,'request_key, fingerprint, collection_id, p_corrects_sale_id);','request_key, fingerprint, collection_id, p_corrects_sale_id, pricing);')
s=rep(s,"'corrects_sale_id', p_corrects_sale_id)), record_campaign_sale.sold_at", "'corrects_sale_id', p_corrects_sale_id,\n      'price_cents', (pricing->'ticketAmountsCents'->>(array_position(ticket_ids,t.id)-1))::bigint,\n      'pricing_version', 1)), record_campaign_sale.sold_at")
s=rep(s,"'quantity', p_quantity, 'replayed', false);", "'quantity', p_quantity, 'replayed', false, 'pricing_snapshot', pricing);")
parts.append(s)
for file,name in [('20261014000300_fundraising_views.sql','fundraising_campaigns'),('20261014000400_correction_progress.sql','campaign_progress'),('20261017000100_seller_sharing.sql','public_seller_page')]:
 s=fn(file,name)
 pattern=r"('ticket_price_cents',\s*c.ticket_price_cents,)"
 assert len(re.findall(pattern,s))==1, name
 s=re.sub(pattern,r"\1 'ticket_packages', c.ticket_packages,",s)
 parts.append(s)
s=fn('20261020202500_ticket_prize_receipt_fallback.sql','sale_ticket_receipt')
s=rep(s,"    'status',t.status", "    'status',t.status,\n    'price_cents', case when s.pricing_snapshot is null then c.ticket_price_cents\n      else (s.pricing_snapshot->'ticketAmountsCents'->>((t.sale_position-1)::integer))::bigint end")
s=rep(s,"  from public.tickets t\n  where t.organization_id=p_organization_id and t.campaign_id=s.campaign_id and t.sale_id=s.id;", "  from (select tx.*, row_number() over (order by tx.sequence_number,tx.id) as sale_position\n    from public.tickets tx where tx.organization_id=p_organization_id and tx.campaign_id=s.campaign_id and tx.sale_id=s.id) t;")
s=rep(s,"    'ticket_price_cents',c.ticket_price_cents,", "    'ticket_price_cents',c.ticket_price_cents,\n    'ticket_packages',c.ticket_packages,\n    'pricing_snapshot',s.pricing_snapshot,")
parts.append(s)
s=fn('20261015000100_drawing_foundation.sql','drawing_eligible_entries')
s=rep(s,'s.sold_at,s.amount_cents/s.quantity,', "s.sold_at,case when s.pricing_snapshot is null then s.amount_cents/s.quantity\n      else (s.pricing_snapshot->'ticketAmountsCents'->>((row_number() over (partition by s.id order by t.sequence_number,t.id)-1)::integer))::bigint end,")
parts.append(s)
s=fn('20261015000100_drawing_foundation.sql','drawing_readiness')
s=rep(s,'or s.amount_cents<>s.quantity::bigint*c.ticket_price_cents::bigint', "or not public.sale_pricing_consistent(s,c)\n        or (s.pricing_snapshot is not null and not exists(select 1 from public.money_events pm where pm.id=s.collection_event_id and pm.metadata->'pricing_snapshot'=s.pricing_snapshot))")
parts.append(s)
s=fn('20261015000100_drawing_foundation.sql','freeze_drawing')
s=rep(s,"'ticket_price_cents',c.ticket_price_cents,'ticket_prefix'", "'ticket_price_cents',c.ticket_price_cents,'ticket_packages',c.ticket_packages,'ticket_prefix'")
parts.append(s)
parts.append('''-- CREATE OR REPLACE preserves the existing access control lists. Reassert the
-- internal-only new helpers; do not grant anonymous access or broaden seller roles.
revoke all on function public.quote_campaign_ticket_packages(integer,bigint,jsonb),
  public.campaign_sale_pricing(integer,bigint,jsonb),
  public.sale_pricing_consistent(public.campaign_sales,public.campaigns)
  from public,anon,authenticated,service_role;
''')
path='supabase/migrations/20261023181600_ticket_pricing_packages.sql'
if (ROOT/path).exists(): raise ValueError('Refuse to overwrite a tracked migration')
(ROOT/path).write_text('\n\n'.join(parts))
print('Wrote',path)
