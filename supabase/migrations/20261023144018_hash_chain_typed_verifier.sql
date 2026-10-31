-- Keep the existing verifier signature, permissions, hash format and return
-- contract. Explicit loop targets let plpgsql_check determine their types.
-- No ledger rows, hashes, prices or grants are rewritten by this migration.
create or replace function public.verify_hash_chain(p_table text, p_partition_col text, p_partition uuid)
returns table (ok boolean, rows_checked bigint, first_bad_pos bigint, head_hash text)
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  entry_pos bigint;
  entry_prev_hash text;
  entry_row_hash text;
  entry_payload jsonb;
  expected_prev text := repeat('0', 64);
  n bigint := 0;
begin
  if p_table not in ('audit_events', 'campaign_events', 'ticket_events', 'money_events') then
    raise exception 'Unsupported table %', p_table;
  end if;
  for entry_pos, entry_prev_hash, entry_row_hash, entry_payload in execute format(
    'select chain_pos, prev_hash, row_hash, to_jsonb(t) as j from public.%I t where coalesce(%I::text, %L) = $1 order by chain_pos',
    p_table, p_partition_col, '00000000-0000-0000-0000-000000000000')
    using coalesce(p_partition::text, '00000000-0000-0000-0000-000000000000')
  loop
    n := n + 1;
    if entry_pos <> n
       or entry_prev_hash <> expected_prev
       or entry_row_hash <> encode(extensions.digest(entry_prev_hash || public.chain_payload(entry_payload), 'sha256'), 'hex') then
      return query select false, n, entry_pos, null::text;
      return;
    end if;
    expected_prev := entry_row_hash;
  end loop;
  return query select true, n, null::bigint, case when n = 0 then null else expected_prev end;
end;
$$;
-- CREATE OR REPLACE preserves the existing ACL. Reassert the internal-only
-- boundary without changing any service-role grants or wrapper permissions.
revoke all on function public.verify_hash_chain(text, text, uuid) from public, anon, authenticated;
