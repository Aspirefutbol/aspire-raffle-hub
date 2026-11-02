-- Harden public-schema function EXECUTE privileges and make internal-only
-- RLS tables explicitly deny Data API clients.
--
-- Public anonymous access remains intentional only for:
--   public.public_seller_page(text)
--   public.submit_seller_interest_request(text, uuid, jsonb)

-- Trigger functions are internal implementation details. They are invoked by
-- their triggers and must not be callable as Data API RPCs.
revoke execute on function public.audit_import_status() from public, anon, authenticated, service_role;
revoke execute on function public.audit_invitation_change() from public, anon, authenticated, service_role;
revoke execute on function public.audit_member_role_change() from public, anon, authenticated, service_role;
revoke execute on function public.audit_membership_change() from public, anon, authenticated, service_role;
revoke execute on function public.audit_organization_protected() from public, anon, authenticated, service_role;
revoke execute on function public.audit_platform_admin_change() from public, anon, authenticated, service_role;
revoke execute on function public.audit_player_guardian() from public, anon, authenticated, service_role;
revoke execute on function public.audit_row_change() from public, anon, authenticated, service_role;
revoke execute on function public.audit_team_membership() from public, anon, authenticated, service_role;
revoke execute on function public.handle_auth_user_email_change() from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated, service_role;
revoke execute on function public.hash_chain_append() from public, anon, authenticated, service_role;

-- Authenticated helpers / RPCs remain available to signed-in application
-- users, but are no longer anonymously callable via the Data API.
revoke execute on function public.can_assign_role(uuid, text) from public, anon;
grant execute on function public.can_assign_role(uuid, text) to authenticated, service_role;

revoke execute on function public.has_org_permission(uuid, text) from public, anon;
grant execute on function public.has_org_permission(uuid, text) to authenticated, service_role;

revoke execute on function public.has_platform_permission(text) from public, anon;
grant execute on function public.has_platform_permission(text) to authenticated, service_role;

revoke execute on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

revoke execute on function public.my_org_permissions(uuid) from public, anon;
grant execute on function public.my_org_permissions(uuid) to authenticated, service_role;

revoke execute on function public.my_org_roles(uuid) from public, anon;
grant execute on function public.my_org_roles(uuid) to authenticated, service_role;

revoke execute on function public.platform_organization_summaries() from public, anon;
grant execute on function public.platform_organization_summaries() to authenticated, service_role;

revoke execute on function public.shares_org_with(uuid) from public, anon;
grant execute on function public.shares_org_with(uuid) to authenticated, service_role;

revoke execute on function public.transition_campaign(uuid, text, text) from public, anon;
grant execute on function public.transition_campaign(uuid, text, text) to authenticated, service_role;

revoke execute on function public.verify_audit_chain(uuid) from public, anon;
grant execute on function public.verify_audit_chain(uuid) to authenticated, service_role;

revoke execute on function public.verify_campaign_ledgers(uuid) from public, anon;
grant execute on function public.verify_campaign_ledgers(uuid) to authenticated, service_role;

-- Preserve the two deliberate anonymous seller-sharing entry points.
revoke execute on function public.public_seller_page(text) from public;
grant execute on function public.public_seller_page(text) to anon, authenticated, service_role;

revoke execute on function public.submit_seller_interest_request(text, uuid, jsonb) from public;
grant execute on function public.submit_seller_interest_request(text, uuid, jsonb) to anon, authenticated, service_role;

-- Make internal table intent explicit even though client table privileges are
-- already revoked. SECURITY DEFINER transaction functions continue to operate.
drop policy if exists campaign_ticket_counters_no_client on public.campaign_ticket_counters;
create policy campaign_ticket_counters_no_client
on public.campaign_ticket_counters
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists seller_request_limits_no_client on public.seller_request_limits;
create policy seller_request_limits_no_client
on public.seller_request_limits
for all
to anon, authenticated
using (false)
with check (false);

-- Secure-by-default for future functions created by the migration owner.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
