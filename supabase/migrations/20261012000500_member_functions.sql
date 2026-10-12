-- =============================================================================
-- Raffle Hub — 1500 Member status and invitation revocation with reasons.
-- The reason must be set in the same transaction as the change, so these are
-- functions rather than two separate API calls.
-- =============================================================================

-- set_audit_reason() stays executable by authenticated: the reason functions
-- below are SECURITY INVOKER and call it. A direct client call is harmless —
-- the setting is transaction-local and each API request is its own transaction.
revoke all on function public.set_audit_reason(text) from public, anon;
grant execute on function public.set_audit_reason(text) to authenticated;

create or replace function public.set_member_status(p_member_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  m public.organization_members;
begin
  select * into m from public.organization_members where id = p_member_id for update;
  if not found then
    raise exception 'Member not found.' using errcode = 'no_data_found';
  end if;
  perform public.assert_org_permission(m.organization_id, 'members.manage');
  if p_status not in ('active', 'suspended') then
    raise exception 'Unsupported status %.', p_status using errcode = 'check_violation';
  end if;
  if m.user_id = auth.uid() and p_status <> 'active' then
    raise exception 'You can’t suspend yourself.' using errcode = 'check_violation';
  end if;
  perform public.set_audit_reason(p_reason);
  update public.organization_members set status = p_status where id = p_member_id;
  perform public.set_audit_reason(null);
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  inv public.organization_invitations;
begin
  select * into inv from public.organization_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'Invitation not found.' using errcode = 'no_data_found';
  end if;
  perform public.assert_org_permission(inv.organization_id, 'members.manage');
  if inv.status <> 'pending' then
    raise exception 'This invitation is already %.', inv.status using errcode = 'check_violation';
  end if;
  perform public.set_audit_reason(p_reason);
  update public.organization_invitations set status = 'revoked', revoked_at = now() where id = p_invitation_id;
  perform public.set_audit_reason(null);
end;
$$;
