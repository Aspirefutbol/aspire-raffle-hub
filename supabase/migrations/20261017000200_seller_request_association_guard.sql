-- Defense in depth for immutable request completion associations. The RPC already
-- checks these conditions; retain them at the table boundary for future writers.
alter table public.seller_request_events add constraint seller_request_completion_sale
 check ((status='completed') = (sale_id is not null));

do $$
begin
 if exists (
   select 1 from public.seller_request_events e
   join public.seller_interest_requests r on r.id=e.request_id
   join public.campaign_sales s on s.id=e.sale_id
   where (s.organization_id,s.campaign_id,s.participant_id)
     is distinct from (r.organization_id,r.campaign_id,r.participant_id)
 ) then
   raise exception 'Existing request completion association has inconsistent scope';
 end if;
end; $$;

create function public.guard_seller_request_association() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.sale_id is not null and not exists (
   select 1 from public.seller_interest_requests r
   join public.campaign_sales s on s.id=new.sale_id
     and (s.organization_id,s.campaign_id,s.participant_id) =
         (r.organization_id,r.campaign_id,r.participant_id)
   where r.id=new.request_id and r.organization_id=new.organization_id
 ) then
   raise exception 'Request completion must retain tenant, campaign and participant scope'
     using errcode='23503';
 end if;
 return new;
end; $$;
create trigger seller_request_association_guard before insert on public.seller_request_events
 for each row execute function public.guard_seller_request_association();
