-- Nonbinding requests are deliberately independent of ticket and money ledgers.
create table public.campaign_seller_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 campaign_id uuid not null, participant_id uuid not null, seller_user_id uuid not null references auth.users(id),
 opaque_token_hash text not null unique check (opaque_token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 revoked_at timestamptz, unique(id,organization_id,campaign_id,participant_id),
 foreign key(participant_id,organization_id,campaign_id) references public.campaign_participants(id,organization_id,campaign_id)
);
create unique index seller_link_one_active on public.campaign_seller_links(participant_id,seller_user_id) where revoked_at is null;
create table public.seller_interest_requests (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, campaign_id uuid not null,
 participant_id uuid not null, seller_link_id uuid not null,
 submission_key uuid not null, request_fingerprint text not null,
 supporter_name text not null check(length(supporter_name) between 1 and 200),
 supporter_email text, supporter_phone text, preferred_contact text not null check(preferred_contact in ('email','phone')),
 requested_quantity integer not null check(requested_quantity between 1 and 100), note text not null default '' check(length(note)<=1000),
 created_at timestamptz not null default now(),
 unique(seller_link_id,submission_key), unique(id,organization_id),
 foreign key(seller_link_id,organization_id,campaign_id,participant_id) references public.campaign_seller_links(id,organization_id,campaign_id,participant_id)
);
create table public.seller_request_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 request_id uuid not null, status text not null check(status in ('new','contacted','completed','declined','expired')),
 sale_id uuid references public.campaign_sales(id), actor_id uuid references auth.users(id), created_at timestamptz not null default clock_timestamp(),
 foreign key(request_id,organization_id) references public.seller_interest_requests(id,organization_id)
);
create index seller_request_latest on public.seller_request_events(request_id,created_at desc,id desc);
create unique index seller_request_sale_once on public.seller_request_events(sale_id) where sale_id is not null;
-- Private fixed-window counters: no IP address is retained, only a SHA256 digest.
create table public.seller_request_limits (bucket text not null, window_at timestamptz not null, attempts integer not null, primary key(bucket,window_at));

create function public.can_manage_seller_participant(p_org uuid,p_participant uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 public.has_org_permission(p_org,'organization.manage') or
 (public.has_org_permission(p_org,'tickets.issue') and public.has_org_permission(p_org,'roster.read_own_family')
 and public.can_read_fundraising_participant(p_participant,'family')))
 and exists(select 1 from public.campaign_participants where id=p_participant and organization_id=p_org);
$$;

alter table public.campaign_seller_links enable row level security;
alter table public.seller_interest_requests enable row level security;
alter table public.seller_request_events enable row level security;
alter table public.seller_request_limits enable row level security;
revoke all on public.campaign_seller_links,public.seller_interest_requests,public.seller_request_events,public.seller_request_limits from anon,authenticated,service_role;
grant select on public.campaign_seller_links,public.seller_interest_requests,public.seller_request_events to authenticated;
create policy seller_links_read on public.campaign_seller_links for select to authenticated using(public.can_manage_seller_participant(organization_id,participant_id));
create policy seller_requests_read on public.seller_interest_requests for select to authenticated using(public.can_manage_seller_participant(organization_id,participant_id));
create policy seller_events_read on public.seller_request_events for select to authenticated using(exists(select 1 from public.seller_interest_requests r where r.id=request_id and r.organization_id=seller_request_events.organization_id));
create trigger seller_request_immutable before update or delete on public.seller_interest_requests for each row execute function public.prevent_ledger_mutation();
create trigger seller_event_immutable before update or delete on public.seller_request_events for each row execute function public.prevent_ledger_mutation();
create function public.guard_seller_link_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Seller link history is immutable' using errcode='42501'; end if;
 if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or old.revoked_at is not null or new.revoked_at is null then
 raise exception 'Only first revocation is allowed' using errcode='42501'; end if;
 return new;
end; $$;
create trigger seller_link_history before update or delete on public.campaign_seller_links for each row execute function public.guard_seller_link_history();
create trigger seller_links_audit after insert or update on public.campaign_seller_links for each row execute function public.audit_row_change('SELLER_LINK');
create trigger seller_requests_audit after insert on public.seller_interest_requests for each row execute function public.audit_row_change('SELLER_REQUEST');
create trigger seller_request_events_audit after insert on public.seller_request_events for each row execute function public.audit_row_change('SELLER_REQUEST_EVENT');

create function public.manage_seller_link(p_organization_id uuid,p_participant_id uuid,p_revoke boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.campaign_participants; c public.campaigns; token text;
begin
 if p_revoke is null then raise exception 'Revoke flag is required' using errcode='23514'; end if;
 select * into cp from public.campaign_participants where id=p_participant_id and organization_id=p_organization_id;
 if cp.id is null or not public.can_manage_seller_participant(p_organization_id,cp.id) then raise insufficient_privilege; end if;
 -- Link creation is family-only; administrators can revoke but cannot publish a family identity.
 if not p_revoke and (not public.has_org_permission(p_organization_id,'roster.read_own_family') or not public.can_read_fundraising_participant(cp.id,'family')) then raise insufficient_privilege; end if;
 select * into c from public.campaigns where id=cp.campaign_id for update;
 update public.campaign_seller_links set revoked_at=clock_timestamp() where participant_id=cp.id and revoked_at is null
 and (seller_user_id=auth.uid() or (p_revoke and public.has_org_permission(p_organization_id,'organization.manage')));
 if p_revoke then return jsonb_build_object('revoked',true); end if;
 if not public.can_issue_campaign_participant(p_organization_id,cp.id) or c.status<>'ACTIVE' or c.starts_at>now() or c.sales_close_at<=now() then raise exception 'Requests are closed' using errcode='23514'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.campaign_seller_links(organization_id,campaign_id,participant_id,seller_user_id,opaque_token_hash,expires_at)
 values(p_organization_id,c.id,cp.id,auth.uid(),encode(extensions.digest(token,'sha256'),'hex'),c.sales_close_at);
 return jsonb_build_object('token',token,'expires_at',c.sales_close_at);
end; $$;

create function public.public_seller_page(p_token text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('organization',o.name,'campaign',c.name,'description',c.description,'rules',c.rules_text,
 'ticket_price_cents',c.ticket_price_cents,'sales_close_at',c.sales_close_at,'draw_at',c.draw_at,'timezone',c.timezone,
 'support_email',c.support_email,'support_phone',c.support_phone,'requests_open',true)
 from public.campaign_seller_links l join public.campaigns c on c.id=l.campaign_id
 join public.organizations o on o.id=l.organization_id join public.campaign_participants cp on cp.id=l.participant_id
 join public.players p on p.id=cp.player_id
 where length(p_token)=64 and l.opaque_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 and l.revoked_at is null and l.expires_at>now() and c.status='ACTIVE' and c.starts_at<=now() and c.sales_close_at>now()
 and o.status='active' and cp.status='active' and p.status='active' and p.archived_at is null
 -- A removed membership/guardian link invalidates previously shared links too.
 and exists(select 1 from public.organization_members m join public.organization_member_roles mr on mr.member_id=m.id
 join public.role_permissions rp on rp.role_key=mr.role_key
 where m.organization_id=l.organization_id and m.user_id=l.seller_user_id and m.status='active' and rp.permission_key='tickets.issue')
 and exists(select 1 from public.organization_members m join public.organization_member_roles mr on mr.member_id=m.id join public.role_permissions rp on rp.role_key=mr.role_key where m.organization_id=l.organization_id and m.user_id=l.seller_user_id and m.status='active' and rp.permission_key='roster.read_own_family')
 and exists(select 1 from public.organization_members m join public.guardian_user_links gul on gul.member_id=m.id and gul.organization_id=m.organization_id
 join public.guardians g on g.id=gul.guardian_id and g.organization_id=gul.organization_id
 where m.user_id=l.seller_user_id and m.organization_id=l.organization_id and m.status='active' and gul.archived_at is null and g.archived_at is null and (g.household_id=p.household_id or exists(select 1 from public.player_guardians pg where pg.player_id=p.id and pg.guardian_id=g.id)));
$$;

create function public.submit_seller_interest_request(p_token text,p_submission_key uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.campaign_seller_links; rid uuid; fingerprint text; key text; n integer;
 checked_at timestamptz:=date_trunc('hour',clock_timestamp()); h jsonb; ip text;
begin
 -- Identical response for invalid, revoked, duplicate, throttled and honeypot submissions.
 if p_request is null or jsonb_typeof(p_request)<>'object' or p_submission_key is null or length(p_token)<>64 then return '{"accepted":true}'; end if;
 if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('name','email','phone','contact','quantity','note','website')) then return '{"accepted":true}'; end if;
 if jsonb_typeof(p_request->'quantity') is distinct from 'number' or exists(select 1 from jsonb_each(p_request) x where x.key<>'quantity' and jsonb_typeof(x.value)<>'string') then return '{"accepted":true}'; end if;
 if coalesce(p_request->>'website','')<>'' or length(btrim(coalesce(p_request->>'name',''))) not between 1 and 200
 or coalesce(p_request->>'quantity','')!~'^[0-9]{1,3}$'
 or length(coalesce(p_request->>'note',''))>1000 or length(coalesce(p_request->>'email',''))>254 or length(coalesce(p_request->>'phone',''))>50
 or coalesce(p_request->>'contact','') not in ('email','phone') then return '{"accepted":true}'; end if;
 if (p_request->>'quantity')::integer not between 1 and 100 then return '{"accepted":true}'; end if;
 if (p_request->>'contact'='email' and coalesce(p_request->>'email','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 or (p_request->>'contact'='phone' and coalesce(p_request->>'phone','')!~'^\+?[0-9() .-]{7,50}$')
 or (coalesce(p_request->>'email','')<>'' and (p_request->>'email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 or (coalesce(p_request->>'phone','')<>'' and (p_request->>'phone')!~'^\+?[0-9() .-]{7,50}$') then return '{"accepted":true}'; end if;
 select * into l from public.campaign_seller_links where opaque_token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if l.id is null then return '{"accepted":true}'; end if;
 perform 1 from public.campaigns where id=l.campaign_id for update;
 if public.public_seller_page(p_token) is null then return '{"accepted":true}'; end if;
 fingerprint:=encode(extensions.digest((p_request-'website')::text,'sha256'),'hex');
 if exists(select 1 from public.seller_interest_requests where seller_link_id=l.id and (submission_key=p_submission_key or (request_fingerprint=fingerprint and created_at>clock_timestamp()-interval '1 day'))) then return '{"accepted":true}'; end if;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 -- Rightmost hop is appended by the API gateway. No caller-supplied IP argument.
 ip:=btrim(regexp_replace(coalesce(h->>'x-forwarded-for','unknown'),'^.*,',''));
 foreach key in array array['ip:'||encode(extensions.digest(ip,'sha256'),'hex'),'link:'||l.id::text,'campaign:'||l.campaign_id::text] loop
 insert into public.seller_request_limits(bucket,window_at,attempts) values(key,checked_at,1)
 on conflict(bucket,window_at) do update set attempts=seller_request_limits.attempts+1 returning attempts into n;
 if n>(case when key like 'campaign:%' then 200 when key like 'link:%' then 20 else 10 end) then return '{"accepted":true}'; end if;
 end loop;
 insert into public.seller_interest_requests(organization_id,campaign_id,participant_id,seller_link_id,submission_key,request_fingerprint,supporter_name,supporter_email,supporter_phone,preferred_contact,requested_quantity,note)
 values(l.organization_id,l.campaign_id,l.participant_id,l.id,p_submission_key,fingerprint,btrim(p_request->>'name'),nullif(p_request->>'email',''),nullif(p_request->>'phone',''),p_request->>'contact',(p_request->>'quantity')::integer,coalesce(p_request->>'note','')) returning id into rid;
 insert into public.seller_request_events(organization_id,request_id,status) values(l.organization_id,rid,'new');
 return '{"accepted":true}';
end; $$;

create function public.update_seller_request_status(p_organization_id uuid,p_request_id uuid,p_status text,p_sale_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare r public.seller_interest_requests; last_event public.seller_request_events;
begin
 select * into r from public.seller_interest_requests where id=p_request_id and organization_id=p_organization_id for update;
 if r.id is null or not public.can_manage_seller_participant(p_organization_id,r.participant_id) then raise insufficient_privilege; end if;
 if p_status is null or p_status not in ('contacted','completed','declined','expired') or (p_sale_id is not null and p_status<>'completed') then raise exception 'Invalid request status' using errcode='23514'; end if;
 select * into last_event from public.seller_request_events where request_id=r.id order by created_at desc,id desc limit 1;
 if last_event.status=p_status and last_event.sale_id is not distinct from p_sale_id then return; end if;
 if last_event.status in ('completed','declined','expired') then raise exception 'Request is already closed' using errcode='23514'; end if;
 if p_status='completed' and (p_sale_id is null or not exists(select 1 from public.campaign_sales s where s.id=p_sale_id and s.organization_id=r.organization_id and s.campaign_id=r.campaign_id and s.participant_id=r.participant_id
 and public.can_read_fundraising_sale(s.id) and not exists(select 1 from public.sale_reversals v where v.sale_id=s.id))) then raise exception 'Select an authorized recorded sale for this participant' using errcode='23514'; end if;
 insert into public.seller_request_events(organization_id,request_id,status,sale_id,actor_id) values(r.organization_id,r.id,p_status,p_sale_id,auth.uid());
end; $$;

create function public.seller_request_inbox(p_organization_id uuid,p_campaign_id uuid,p_view text default 'family') returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') from (
 select r.id,r.participant_id,r.supporter_name,r.supporter_email,r.supporter_phone,r.preferred_contact,r.requested_quantity,r.note,r.created_at,e.status,e.sale_id
 from public.seller_interest_requests r cross join lateral(select status,sale_id from public.seller_request_events where request_id=r.id order by created_at desc,id desc limit 1)e
 where r.organization_id=p_organization_id and r.campaign_id=p_campaign_id and
 ((p_view='admin' and public.has_org_permission(r.organization_id,'organization.manage')) or
 (p_view='family' and public.has_org_permission(r.organization_id,'tickets.issue') and public.can_read_fundraising_participant(r.participant_id,'family')))
 order by r.created_at desc,r.id limit 200)q;
$$;
revoke all on function public.can_manage_seller_participant(uuid,uuid),public.manage_seller_link(uuid,uuid,boolean),public.seller_request_inbox(uuid,uuid,text),public.update_seller_request_status(uuid,uuid,text,uuid),public.public_seller_page(text),public.submit_seller_interest_request(text,uuid,jsonb) from public,anon;
grant execute on function public.can_manage_seller_participant(uuid,uuid),public.manage_seller_link(uuid,uuid,boolean),public.seller_request_inbox(uuid,uuid,text),public.update_seller_request_status(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.public_seller_page(text),public.submit_seller_interest_request(text,uuid,jsonb) to anon,authenticated;
