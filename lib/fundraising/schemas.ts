import { z } from "zod";
import { id, optionalText, requiredText } from "@/lib/validation";
import { FUNDRAISING_VIEWS } from "./capabilities";

export const optionalGoalCents = z.number().int().min(0).max(100_000_000).nullish().transform((value) => value ?? null);
export const fundraisingViewSchema = z.enum(FUNDRAISING_VIEWS);

export const enrollCampaignPlayersSchema = z.object({
  campaign_id: id,
  all_active: z.boolean().default(false),
  team_ids: z.array(id).max(200).default([]),
  player_ids: z.array(id).max(5000).default([]),
  goal_amount_cents: optionalGoalCents,
}).superRefine((value, ctx) => {
  if (!value.all_active && value.team_ids.length === 0 && value.player_ids.length === 0) {
    ctx.addIssue({ code: "custom", path: ["player_ids"], message: "Select all active players, teams, or individual players." });
  }
  if (value.all_active && (value.team_ids.length > 0 || value.player_ids.length > 0)) {
    ctx.addIssue({ code: "custom", path: ["all_active"], message: "Choose all active players or selected records." });
  }
});

export const campaignIdSchema = z.object({ campaign_id: id });
export const generateCampaignTicketsSchema = campaignIdSchema.extend({ quantity: z.number().int().min(1).max(10_000) });
export const allocateCampaignTicketsSchema = campaignIdSchema.extend({ participant_id: id, quantity: z.number().int().min(1).max(10_000) });
export const participantGoalSchema = z.object({ participant_id: id, goal_amount_cents: optionalGoalCents });
export const teamGoalSchema = campaignIdSchema.extend({ team_id: id, goal_amount_cents: optionalGoalCents });
export const withdrawCampaignParticipantSchema = z.object({
  participant_id: id,
  reason: requiredText("Reason", 500).min(3, "Give a reason of at least 3 characters."),
});

export const OFFLINE_PAYMENT_METHODS = ["cash", "check"] as const;
export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

export const recordCampaignSaleSchema = campaignIdSchema.extend({
  participant_id: id,
  idempotency_key: requiredText("Submission key", 200),
  buyer_name: requiredText("Buyer name", 200),
  buyer_email: z.string().trim().toLowerCase().max(254).nullish().transform((value) => value || null)
    .refine((value) => value === null || z.email().safeParse(value).success, "Enter a valid email address."),
  buyer_phone: optionalText(50),
  quantity: z.number().int().min(1).max(500),
  amount_cents: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  payment_method: z.enum(OFFLINE_PAYMENT_METHODS),
  notes: optionalText(2000),
  sold_at: z.iso.datetime({ offset: true }).nullish().transform((value) => value ?? null),
  corrects_sale_id: id.nullish().transform((value) => value ?? null),
});

export const reverseCampaignSaleSchema = z.object({
  sale_id: id,
  reason: requiredText("Reason", 500).min(3, "Give a reason of at least 3 characters."),
});

export const progressFiltersSchema = z.object({ teamId: id.optional(), playerId: id.optional() });
