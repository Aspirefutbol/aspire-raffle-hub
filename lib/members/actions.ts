"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, describeDbError, fail, ok, orgAction } from "@/lib/actions";
import { ROLE_LABELS } from "@/lib/permissions";
import { AdminNotConfiguredError } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addMemberSchema, invitationSchema, linkGuardianSchema, memberStatusSchema, memberTeamsSchema, setRolesSchema, unlinkGuardianSchema } from "./schemas";
import { addOrInviteMember, sendInvitationEmail } from "./service";

function refresh(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}`, "layout");
}

export async function addMember(orgSlug: string, input: unknown): Promise<ActionResult<{ kind: "added" | "invited" }>> {
  return orgAction(orgSlug, "members.manage", addMemberSchema, input, async (ctx, data) => {
    try {
      const supabase = await createClient();
      const result = await addOrInviteMember(supabase, ctx.organization.id, data.email, data.roles, data.reason);
      if (result.kind === "error") return fail(result.message, { email: result.message });
      refresh(orgSlug);
      if (result.kind === "added") {
        return ok<{ kind: "added" | "invited" }>({ kind: "added" }, `${data.email} added as ${data.roles.map((r) => ROLE_LABELS[r]).join(" + ")}`);
      }
      return result.emailSent
        ? ok<{ kind: "added" | "invited" }>({ kind: "invited" }, `Invitation sent to ${data.email}`)
        : ok<{ kind: "added" | "invited" }>({ kind: "invited" }, `Invitation saved, but the email didn’t send (${result.emailError}). Use Resend.`);
    } catch (error) {
      if (error instanceof AdminNotConfiguredError) return fail(error.message);
      throw error;
    }
  });
}

export async function setMemberRoles(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "members.manage", setRolesSchema, input, async (_ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_member_roles", {
      p_member_id: data.member_id,
      p_roles: data.roles,
      p_reason: data.reason ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, `Roles updated: ${data.roles.map((r) => ROLE_LABELS[r]).join(" + ")}`);
  });
}

export async function setMemberStatus(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "members.manage", memberStatusSchema, input, async (_ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_member_status", {
      p_member_id: data.member_id,
      p_status: data.status,
      p_reason: data.reason ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, data.status === "active" ? "Member reactivated" : "Member suspended");
  });
}

export async function resendInvitation(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "members.manage", invitationSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: inv, error } = await supabase
      .from("organization_invitations")
      .select("id, email, status, send_count")
      .eq("id", data.invitation_id)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (error || !inv) return fail("Invitation not found.");
    if (inv.status !== "pending") return fail(`This invitation is already ${inv.status}.`);
    try {
      const sent = await sendInvitationEmail(inv.email);
      if (!sent.ok) return fail(`The email didn’t send: ${sent.error}`);
    } catch (e) {
      if (e instanceof AdminNotConfiguredError) return fail(e.message);
      throw e;
    }
    const { error: updateError } = await supabase
      .from("organization_invitations")
      .update({
        send_count: inv.send_count + 1,
        last_sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
      })
      .eq("id", inv.id);
    if (updateError) return fail(describeDbError(updateError));
    refresh(orgSlug);
    return ok(undefined, `Invitation re-sent to ${inv.email}`);
  });
}

export async function revokeInvitation(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "members.manage", invitationSchema, input, async (_ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_invitation", {
      p_invitation_id: data.invitation_id,
      p_reason: data.reason ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Invitation revoked");
  });
}

// ── Scope: which teams a Team Manager/Captain reads; which guardian a family account is ──

export async function setMemberTeams(orgSlug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  return orgAction(orgSlug, "members.manage", memberTeamsSchema, input, async (_ctx, data) => {
    const supabase = await createClient();
    const { data: count, error } = await supabase.rpc("set_team_staff_assignments", {
      p_member_id: data.member_id,
      p_team_ids: data.team_ids,
      p_reason: data.reason ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok({ count: count ?? 0 }, count ? `Assigned to ${count} team${count === 1 ? "" : "s"}` : "Team assignments removed");
  });
}

export async function linkFamilyGuardian(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "members.manage", linkGuardianSchema, input, async (_ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("link_family_guardian", {
      p_member_id: data.member_id,
      p_guardian_id: data.guardian_id,
      p_reason: data.reason ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Family account linked");
  });
}

export async function unlinkFamilyGuardian(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "members.manage", unlinkGuardianSchema, input, async (_ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("unlink_family_guardian", { p_link_id: data.link_id, p_reason: data.reason ?? undefined });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Family link removed");
  });
}
