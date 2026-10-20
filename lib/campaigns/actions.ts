"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, describeDbError, fail, ok, orgAction } from "@/lib/actions";
import { can } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { canTransition, editableFieldsFilter, isCampaignStatus, transitionNeedsReason, transitionPermission } from "./lifecycle";
import { confirmCampaignComplianceSchema, createCampaignSchema, transitionCampaignSchema, updateCampaignSchema } from "./schemas";

// Campaign setup keeps the existing lifecycle and readiness checks. Fundraising
// inventory and sale mutations use separate transactional database functions.

function refresh(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}/campaigns`, "layout");
  revalidatePath(`/o/${orgSlug}/fundraising`, "layout");
  revalidatePath(`/o/${orgSlug}/team-fundraising`, "layout");
}

export async function createCampaignDraft(orgSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return orgAction(orgSlug, "campaigns.manage", createCampaignSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("campaigns")
      .insert({ ...data, organization_id: ctx.organization.id, status: "DRAFT" })
      .select("id")
      .single();
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok({ id: row.id }, "Draft campaign created");
  });
}

export async function updateCampaign(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "campaigns.manage", updateCampaignSchema, input, async (ctx, { campaign_id, ...changes }) => {
    const supabase = await createClient();
    const { data: current, error: readError } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("organization_id", ctx.organization.id)
      .eq("id", campaign_id)
      .maybeSingle();
    if (readError) return fail(describeDbError(readError));
    if (!current || !isCampaignStatus(current.status)) return fail("Campaign not found.");

    const editable = editableFieldsFilter(current.status);
    if (!editable) return fail(`This campaign is ${current.status.toLowerCase()} and can no longer be edited.`);
    const keys = Object.keys(changes).filter((k) => changes[k as keyof typeof changes] !== undefined);
    const locked = keys.filter((k) => !editable(k));
    if (locked.length) return fail(`Locked after activation: ${locked.join(", ")}.`);

    // The database trigger re-checks the same locks (guard_campaign_write).
    const { error } = await supabase.from("campaigns").update(changes).eq("id", campaign_id).eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Campaign updated");
  });
}

export async function transitionCampaign(orgSlug: string, input: unknown): Promise<ActionResult<{ status: string }>> {
  return orgAction(orgSlug, "campaigns.read", transitionCampaignSchema, input, async (ctx, { campaign_id, to, reason }) => {
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("campaigns")
      .select("status")
      .eq("organization_id", ctx.organization.id)
      .eq("id", campaign_id)
      .maybeSingle();
    if (!current || !isCampaignStatus(current.status)) return fail("Campaign not found.");
    if (!canTransition(current.status, to)) return fail(`A campaign can’t move from ${current.status} to ${to}.`);
    if (!can(ctx, transitionPermission(current.status, to))) return fail("You don't have permission to do that.");
    if (to === "DRAWN" && !can(ctx, "drawing.certify")) return fail("Drawing certification permission is required to mark this campaign drawn.");
    if (transitionNeedsReason(current.status, to) && (!reason || reason.length < 3)) {
      return fail("A reason is required for this change.", { reason: "Give a short reason (recorded in the audit log)." });
    }

    // transition_campaign() re-checks everything, enforces readiness, writes the
    // append-only campaign_events ledger and the audit event atomically.
    const { data, error } = await supabase.rpc("transition_campaign", { p_campaign_id: campaign_id, p_to: to, p_reason: reason ?? undefined });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok({ status: data ?? to }, `Campaign moved to ${to}`);
  });
}


export async function confirmCampaignCompliance(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "campaigns.activate", confirmCampaignComplianceSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("confirm_campaign_compliance", {
      p_campaign_id: data.campaign_id,
      p_reason: data.reason,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Texas compliance attestation recorded");
  });
}
