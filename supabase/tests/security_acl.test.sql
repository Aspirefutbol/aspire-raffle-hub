-- pgTAP: public API ACL hardening.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is(
  (
    select coalesce(array_agg(p.proname::text order by p.proname), array[]::text[])
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  array['public_seller_page','submit_seller_interest_request']::text[],
  'only intentional anonymous SECURITY DEFINER RPCs remain executable'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype = 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'signed-in users cannot directly execute SECURITY DEFINER trigger functions'
);

select ok(
  not has_table_privilege('anon', 'public.campaign_ticket_counters', 'SELECT')
  and not has_table_privilege('anon', 'public.campaign_ticket_counters', 'INSERT')
  and not has_table_privilege('anon', 'public.campaign_ticket_counters', 'UPDATE')
  and not has_table_privilege('anon', 'public.campaign_ticket_counters', 'DELETE')
  and not has_table_privilege('authenticated', 'public.campaign_ticket_counters', 'SELECT')
  and not has_table_privilege('authenticated', 'public.campaign_ticket_counters', 'INSERT')
  and not has_table_privilege('authenticated', 'public.campaign_ticket_counters', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.campaign_ticket_counters', 'DELETE'),
  'campaign ticket counters have no client DML privileges'
);

select ok(
  not has_table_privilege('anon', 'public.seller_request_limits', 'SELECT')
  and not has_table_privilege('anon', 'public.seller_request_limits', 'INSERT')
  and not has_table_privilege('anon', 'public.seller_request_limits', 'UPDATE')
  and not has_table_privilege('anon', 'public.seller_request_limits', 'DELETE')
  and not has_table_privilege('authenticated', 'public.seller_request_limits', 'SELECT')
  and not has_table_privilege('authenticated', 'public.seller_request_limits', 'INSERT')
  and not has_table_privilege('authenticated', 'public.seller_request_limits', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.seller_request_limits', 'DELETE'),
  'seller request limits have no client DML privileges'
);

select is(
  (select count(*)::bigint from pg_policies
   where schemaname='public' and tablename='campaign_ticket_counters'
     and policyname='campaign_ticket_counters_no_client'),
  1::bigint,
  'campaign ticket counters explicitly deny client rows'
);

select is(
  (select count(*)::bigint from pg_policies
   where schemaname='public' and tablename='seller_request_limits'
     and policyname='seller_request_limits_no_client'),
  1::bigint,
  'seller request limits explicitly deny client rows'
);

select * from finish();
rollback;
