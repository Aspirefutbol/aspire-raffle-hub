-- Synthetic fixtures only; run through the local pgTAP lane. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(not has_function_privilege('anon', 'public.verify_hash_chain(text,text,uuid)', 'EXECUTE'), 'anonymous callers cannot execute the internal verifier');
select ok(not has_function_privilege('authenticated', 'public.verify_hash_chain(text,text,uuid)', 'EXECUTE'), 'authenticated callers must use permission-checked wrappers');
select ok((select prosecdef from pg_proc where oid = 'public.verify_hash_chain(text,text,uuid)'::regprocedure), 'existing definer execution contract is preserved');
select is((select provolatile::text from pg_proc where oid = 'public.verify_hash_chain(text,text,uuid)'::regprocedure), 's', 'verifier remains stable');

select results_eq($$select * from public.verify_hash_chain('audit_events', 'organization_id', 'f0000000-0000-0000-0000-000000000099')$$,
  $$values (true, 0::bigint, null::bigint, null::text)$$, 'empty audit chain contract is unchanged');
select results_eq($$select * from public.verify_hash_chain('campaign_events', 'campaign_id', 'f0000000-0000-0000-0000-000000000099')$$,
  $$values (true, 0::bigint, null::bigint, null::text)$$, 'empty campaign chain contract is unchanged');
select results_eq($$select * from public.verify_hash_chain('ticket_events', 'campaign_id', 'f0000000-0000-0000-0000-000000000099')$$,
  $$values (true, 0::bigint, null::bigint, null::text)$$, 'empty ticket chain contract is unchanged');
select results_eq($$select * from public.verify_hash_chain('money_events', 'campaign_id', 'f0000000-0000-0000-0000-000000000099')$$,
  $$values (true, 0::bigint, null::bigint, null::text)$$, 'empty money chain contract is unchanged');
select throws_ok($$select * from public.verify_hash_chain('organizations', 'id', null)$$, 'P0001', 'Unsupported table organizations', 'unsupported tables remain blocked');

insert into public.organizations (id, name, slug) values
  ('f0000000-0000-0000-0000-000000000001', 'Synthetic verifier fixture', 'synthetic-verifier-fixture');
update public.organizations set name = 'Synthetic verifier fixture renamed'
  where id = 'f0000000-0000-0000-0000-000000000001';

select ok((select ok and rows_checked > 0 and first_bad_pos is null from public.verify_hash_chain('audit_events', 'organization_id', 'f0000000-0000-0000-0000-000000000001')), 'trigger-created synthetic audit entries verify');
select is((select rows_checked from public.verify_hash_chain('audit_events', 'organization_id', 'f0000000-0000-0000-0000-000000000001')),
  (select count(*) from public.audit_events where organization_id = 'f0000000-0000-0000-0000-000000000001'), 'every synthetic audit row is counted');
select is((select head_hash from public.verify_hash_chain('audit_events', 'organization_id', 'f0000000-0000-0000-0000-000000000001')),
  (select row_hash from public.audit_events where organization_id = 'f0000000-0000-0000-0000-000000000001' order by chain_pos desc limit 1), 'head hash equals the unchanged stored tail hash');

select * from finish();
rollback;
