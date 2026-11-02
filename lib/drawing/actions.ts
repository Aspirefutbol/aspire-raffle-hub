"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, describeDbError, fail, ok, orgAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { drawingIntegritySchema, externalDrawingResultReceiptSchema, externalDrawingResultSchema, freezeDrawingSchema, snapshotActionSchema, verifySnapshotSchema, type DrawingIntegrity, type ExternalDrawingResultReceipt } from "./schemas";

function refresh(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}/campaigns`, "layout");
}

async function snapshotBelongsToCampaign(organizationId: string, campaignId: string, snapshotId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("drawing_snapshots").select("id")
    .eq("organization_id", organizationId).eq("campaign_id", campaignId).eq("id", snapshotId).maybeSingle();
  return !error && Boolean(data);
}

export async function freezeDrawing(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "drawing.manage", freezeDrawingSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("freeze_drawing", {
      p_organization_id: ctx.organization.id, p_campaign_id: data.campaign_id,
      p_idempotency_key: data.idempotency_key, p_reason: data.reason,
      p_prize_readiness_confirmed: data.prize_readiness_confirmed,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Drawing entries frozen");
  });
}

export async function reopenDrawing(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "drawing.certify", snapshotActionSchema, input, async (ctx, data) => {
    if (!await snapshotBelongsToCampaign(ctx.organization.id, data.campaign_id, data.snapshot_id)) return fail("Drawing snapshot not found.");
    const supabase = await createClient();
    const { error } = await supabase.rpc("reopen_drawing", {
      p_organization_id: ctx.organization.id, p_snapshot_id: data.snapshot_id,
      p_idempotency_key: data.idempotency_key, p_reason: data.reason,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Drawing reopened; campaign sales remain closed");
  });
}

// An uncertain response must retain the submitted payload/key. Only an explicit
// transaction rollback or input validation allows the client to edit details.
export type ExternalDrawingResultActionResult = ActionResult<ExternalDrawingResultReceipt> & { canEdit?: boolean };

export async function recordExternalDrawingResult(orgSlug: string, input: unknown): Promise<ExternalDrawingResultActionResult> {
  return orgAction(orgSlug, "drawing.manage", externalDrawingResultSchema, input, async (ctx, data) => {
    if (!await snapshotBelongsToCampaign(ctx.organization.id, data.campaign_id, data.snapshot_id)) return fail("Drawing snapshot not found.");
    const supabase = await createClient();
    const { data: receipt, error } = await supabase.rpc("record_external_drawing_result", {
      p_organization_id: ctx.organization.id, p_snapshot_id: data.snapshot_id,
      p_idempotency_key: data.idempotency_key, p_drawn_at: data.drawn_at,
      p_location: data.location, p_operator: data.operator, p_witnesses: data.witnesses,
      p_method: data.method, p_winning_ticket_number: data.winning_ticket_number,
      p_result: data.result, p_evidence_ref: data.evidence_ref ?? undefined, p_reason: data.reason,
    });
    if (error) {
      const canEdit = ["23503", "23514", "23505", "42501", "P0002", "22023", "22P02", "23502", "40001", "40P01"].includes(error.code);
      return { ...fail(describeDbError(error)), canEdit };
    }
    const checkedReceipt = externalDrawingResultReceiptSchema.safeParse(receipt);
    if (!checkedReceipt.success || checkedReceipt.data.snapshot_id !== data.snapshot_id || checkedReceipt.data.ticket_number !== data.winning_ticket_number) {
      return fail("The external result could not be confirmed. Retry the same submission.");
    }
    refresh(orgSlug);
    return ok(checkedReceipt.data, checkedReceipt.data.replayed ? "External drawing result already recorded" : "External drawing result recorded");
  });
}

export async function certifyDrawing(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "drawing.certify", snapshotActionSchema, input, async (ctx, data) => {
    if (!await snapshotBelongsToCampaign(ctx.organization.id, data.campaign_id, data.snapshot_id)) return fail("Drawing snapshot not found.");
    const supabase = await createClient();
    const { error } = await supabase.rpc("certify_drawing", {
      p_organization_id: ctx.organization.id, p_snapshot_id: data.snapshot_id,
      p_idempotency_key: data.idempotency_key, p_reason: data.reason,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Drawing certified");
  });
}

export async function verifyDrawingSnapshot(orgSlug: string, input: unknown): Promise<ActionResult<DrawingIntegrity>> {
  return orgAction(orgSlug, "campaigns.read", verifySnapshotSchema, input, async (ctx, data) => {
    if (!await snapshotBelongsToCampaign(ctx.organization.id, data.campaign_id, data.snapshot_id)) return fail("Drawing snapshot not found.");
    const supabase = await createClient();
    const { data: verification, error } = await supabase.rpc("verify_drawing_snapshot", {
      p_organization_id: ctx.organization.id, p_snapshot_id: data.snapshot_id,
    });
    if (error) return fail(describeDbError(error));
    return ok(drawingIntegritySchema.parse(verification));
  });
}
