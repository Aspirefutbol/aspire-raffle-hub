-- =============================================================================
-- Texas CREA auto-enforcement.
-- A Texas CREA jurisdiction profile requires the controlled-pilot compliance
-- gate by default. A platform-admin-only explicit boolean override may opt a
-- synthetic/non-legal environment out; absence of the flag never disables a
-- Texas organization.
-- =============================================================================

create or replace function public.campaign_compliance_required(p_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when o.platform_config ? 'texas_crea_compliance_required'
      then coalesce((o.platform_config->>'texas_crea_compliance_required')::boolean, false)
    else coalesce(o.jurisdiction_profile = 'TEXAS_CREA_OFFLINE_PAYMENT', false)
  end
  from public.organizations o
  where o.id = p_organization_id;
$$;

revoke all on function public.campaign_compliance_required(uuid) from public, anon;
grant execute on function public.campaign_compliance_required(uuid) to authenticated;
