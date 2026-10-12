"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, describeDbError, fail, ok, orgAction } from "@/lib/actions";
import { requirePermission } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";
import { canRecordSale } from "./capabilities";
import {
  allocateCampaignTicketsSchema, campaignIdSchema, enrollCampaignPlayersSchema, generateCampaignTicketsSchema,
  participantGoalSchema, recordCampaignSaleSchema, reverseCampaignSaleSchema, teamGoalSchema, withdrawCampaignParticipantSchema,
} from "./schemas";
import { recordedSaleSchema, type RecordedSale } from "./types";

function refresh(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}/campaigns`, "layout");
  revalidatePath(`/o/${orgSlug}/fundraising`, "layout");
  revalidatePath(`/o/${orgSlug}/team-fundraising`, "layout");
}

export async function enrollCampaignPlayers(orgSlug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  return orgAction(orgSlug, "campaigns.manage", enrollCampaignPlayersSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: count, error } = await supabase.rpc("enroll_campaign_players", {
      p_organization_id: ctx.organization.id, p_campaign_id: data.campaign_id,
      p_all_active: data.all_active, p_team_ids: [...new Set(data.team_ids)], p_player_ids: [...new Set(data.player_ids)],
      p_goal_amount_cents: data.goal_amount_cents ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    if (count === null) return fail("Enrollment did not return a result.");
    refresh(orgSlug);
    return ok({ count }, `${count} player${count === 1 ? "" : "s"} enrolled`);
  });
}

export async function withdrawCampaignParticipant(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "campaigns.manage", withdrawCampaignParticipantSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("withdraw_campaign_participant", {
      p_organization_id: ctx.organization.id, p_participant_id: data.participant_id, p_reason: data.reason,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Player withdrawn from campaign");
  });
}

export async function prepareCampaignInventory(orgSlug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  return orgAction(orgSlug, "campaigns.manage", campaignIdSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: count, error } = await supabase.rpc("prepare_campaign_inventory", {
      p_organization_id: ctx.organization.id, p_campaign_id: data.campaign_id,
    });
    if (error) return fail(describeDbError(error));
    if (count === null) return fail("Inventory preparation did not return a result.");
    refresh(orgSlug);
    return ok({ count }, "Participant ticket inventory prepared");
  });
}

export async function generateCampaignTickets(orgSlug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  return orgAction(orgSlug, "campaigns.manage", generateCampaignTicketsSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: count, error } = await supabase.rpc("generate_campaign_tickets", {
      p_organization_id: ctx.organization.id, p_campaign_id: data.campaign_id, p_quantity: data.quantity,
    });
    if (error) return fail(describeDbError(error));
    if (count === null) return fail("Ticket generation did not return a result.");
    refresh(orgSlug);
    return ok({ count }, `${count} tickets generated`);
  });
}

export async function allocateCampaignTickets(orgSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return orgAction(orgSlug, "campaigns.manage", allocateCampaignTicketsSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: allocationId, error } = await supabase.rpc("allocate_campaign_tickets", {
      p_organization_id: ctx.organization.id, p_campaign_id: data.campaign_id, p_participant_id: data.participant_id, p_quantity: data.quantity,
    });
    if (error) return fail(describeDbError(error));
    const result = id.safeParse(allocationId);
    if (!result.success) return fail("Ticket allocation did not return a result.");
    refresh(orgSlug);
    return ok({ id: result.data }, "Tickets assigned to player");
  });
}

export async function setCampaignParticipantGoal(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "campaigns.manage", participantGoalSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_campaign_participant_goal", {
      p_organization_id: ctx.organization.id, p_participant_id: data.participant_id, p_goal_amount_cents: data.goal_amount_cents ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Player goal updated");
  });
}

export async function setCampaignTeamGoal(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "campaigns.manage", teamGoalSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_campaign_team_goal", {
      p_organization_id: ctx.organization.id, p_campaign_id: data.campaign_id, p_team_id: data.team_id,
      p_goal_amount_cents: data.goal_amount_cents ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Team goal updated");
  });
}

export async function recordCampaignSale(orgSlug: string, input: unknown): Promise<ActionResult<RecordedSale>> {
  return orgAction(orgSlug, "tickets.issue", recordCampaignSaleSchema, input, async (ctx, data) => {
    // Broad roster/campaign read or captain scope never grants broad sale scope.
    // SQL independently checks linked-family scope for this exact participant.
    if (!canRecordSale(ctx.permissions)) return fail("You don't have permission to record a sale.");
    const supabase = await createClient();
    const { data: sale, error } = await supabase.rpc("record_campaign_sale", {
      p_organization_id: ctx.organization.id, p_campaign_id: data.campaign_id, p_participant_id: data.participant_id,
      p_idempotency_key: data.idempotency_key, p_buyer_name: data.buyer_name, p_quantity: data.quantity,
      p_amount_cents: data.amount_cents, p_payment_method: data.payment_method,
      p_buyer_email: data.buyer_email ?? undefined, p_buyer_phone: data.buyer_phone ?? undefined,
      p_notes: data.notes ?? undefined, p_sold_at: data.sold_at ?? undefined, p_corrects_sale_id: data.corrects_sale_id ?? undefined,
    });
    if (error) return fail(describeDbError(error));
    const result = recordedSaleSchema.safeParse(sale);
    if (!result.success) return fail("The sale result could not be confirmed. Retry using the same submission key.");
    refresh(orgSlug);
    return ok(result.data, result.data.replayed ? "Sale already recorded" : "Sale recorded and tickets issued");
  });
}

export async function reverseCampaignSale(orgSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return orgAction(orgSlug, "tickets.void", reverseCampaignSaleSchema, input, async (ctx, data) => {
    requirePermission(ctx, "adjustments.approve");
    const supabase = await createClient();
    const { data: reversalId, error } = await supabase.rpc("reverse_campaign_sale", {
      p_organization_id: ctx.organization.id, p_sale_id: data.sale_id, p_reason: data.reason,
    });
    if (error) return fail(describeDbError(error));
    const result = id.safeParse(reversalId);
    if (!result.success) return fail("The reversal result could not be confirmed.");
    refresh(orgSlug);
    return ok({ id: result.data }, "Sale reversed; original history preserved");
  });
}
