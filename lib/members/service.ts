import "server-only";
import { describeDbError } from "@/lib/actions";
import type { OrganizationRole } from "@/lib/permissions";
import { createAdminClient, siteUrl } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";
import { normalizeEmail } from "./email";

export type AddOrInviteResult =
  | { kind: "added"; memberId: string }
  | { kind: "invited"; invitationId: string; emailSent: boolean; emailError?: string }
  | { kind: "error"; message: string };

/**
 * Adds an existing account to an organization, or invites a new one.
 *
 * - The email is matched EXACTLY (case-insensitive) by the database; "_" and
 *   "%" are literal and an ambiguous match is an error, never a guess.
 * - Membership and invitation rows are written with the CALLER's client, so
 *   RLS (members.manage), the grant rule (can't grant roles you don't hold)
 *   and audit attribution all apply. The service role only performs the
 *   lookup and sends the invitation email.
 */
export async function addOrInviteMember(
  supabase: ServerSupabase,
  organizationId: string,
  rawEmail: string,
  roles: OrganizationRole[],
  reason: string | null,
): Promise<AddOrInviteResult> {
  const email = normalizeEmail(rawEmail);
  const admin = createAdminClient();

  const { data: userId, error: lookupError } = await admin.rpc("auth_user_id_by_email", { p_email: email });
  if (lookupError) return { kind: "error", message: describeDbError(lookupError) };

  if (userId) {
    const { data: existing } = await supabase
      .from("organization_members")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.status === "active") {
      return { kind: "error", message: "That person is already a member. Edit their roles instead." };
    }
    const { data: memberId, error } = await supabase.rpc("add_organization_member", {
      p_organization_id: organizationId,
      p_user_id: userId,
      p_roles: roles,
      p_reason: reason ?? undefined,
    });
    if (error) return { kind: "error", message: describeDbError(error) };
    return { kind: "added", memberId };
  }

  const { data: invitation, error: inviteError } = await supabase
    .from("organization_invitations")
    .insert({ organization_id: organizationId, email, role_keys: roles })
    .select("id")
    .single();
  if (inviteError) {
    return {
      kind: "error",
      message: inviteError.code === "23505" ? "An invitation is already pending for that email. Resend it instead." : describeDbError(inviteError),
    };
  }

  const sent = await sendInvitationEmail(email);
  if (sent.ok) {
    await supabase
      .from("organization_invitations")
      .update({ last_sent_at: new Date().toISOString(), send_count: 1 })
      .eq("id", invitation.id);
  }
  return { kind: "invited", invitationId: invitation.id, emailSent: sent.ok, emailError: sent.ok ? undefined : sent.error };
}

/** Sends (or re-sends) the Supabase Auth invitation email. */
export async function sendInvitationEmail(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  // Email templates append &token_hash=…&type=invite|magiclink.
  const redirectTo = `${siteUrl()}/auth/confirm?next=%2Fwelcome`;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!error) return { ok: true };

  // An account was created by an earlier invite but never confirmed: send a fresh sign-in link instead.
  if (/already been registered|already exists/i.test(error.message)) {
    const { error: linkError } = await admin.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
    return linkError ? { ok: false, error: linkError.message } : { ok: true };
  }
  return { ok: false, error: error.message };
}
