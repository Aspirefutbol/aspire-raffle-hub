-- Tighten exposed function privileges before completing the operator rehearsal.
-- Public/anonymous access is deny-by-default; only the two supporter-facing
-- Seller Sharing RPCs are intentionally callable without a session.

revoke execute on all functions in schema public from public, anon;

-- Trigger functions must never be callable directly through PostgREST RPC.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from anon, authenticated, service_role', f.fn);
  end loop;
end $$;

-- These are the only anonymous application RPCs in the current pilot.
grant execute on function public.public_seller_page(text) to anon, authenticated;
grant execute on function public.submit_seller_interest_request(text, uuid, jsonb) to anon, authenticated;

-- Make the deny-by-default posture apply to future functions too.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
