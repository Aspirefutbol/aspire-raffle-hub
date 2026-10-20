-- =============================================================================
-- Texas CREA auto-enforcement.
-- A Texas CREA jurisdiction profile is itself sufficient to require the
-- controlled-pilot compliance gate. The platform_config flag remains an
-- additive override for other explicitly configured jurisdictions.
-- =============================================================================

create or replace function public.campaign_compliance_required(p_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(o.jurisdiction_profile = 'TEXAS_CREA_OFFLINE_PAYMENT', false)
      or coalesce((o.platform_config->>'texas_crea_compliance_required')::boolean, false)
  from public.organizations o
  where o.id = p_organization_id;
$$;

revoke all on function public.campaign_compliance_required(uuid) from public, anon;
grant execute on function public.campaign_compliance_required(uuid) to authenticated;
