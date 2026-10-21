begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  not has_function_privilege('anon', 'public.transition_campaign(uuid,text,text)', 'EXECUTE'),
  'anonymous users cannot call campaign lifecycle RPCs'
);

select ok(
  has_function_privilege('anon', 'public.public_seller_page(text)', 'EXECUTE'),
  'public supporter page RPC remains intentionally anonymous'
);

select ok(
  has_function_privilege('anon', 'public.submit_seller_interest_request(text,uuid,jsonb)', 'EXECUTE'),
  'public supporter request RPC remains intentionally anonymous'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'trigger-only functions are not directly executable by authenticated users'
);

select * from finish();
rollback;
