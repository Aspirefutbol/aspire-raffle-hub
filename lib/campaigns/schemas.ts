import { z } from "zod";
import { id, optionalEmail, optionalPhone, optionalText, requiredText } from "@/lib/validation";
import { CAMPAIGN_STATUSES } from "./lifecycle";

const cents = z.number().int().min(0).max(100_000_000).nullish().transform((v) => v ?? null);
const optionalTimestamp = z.iso.datetime({ offset: true }).nullish().transform((v) => v ?? null);

export const campaignFieldsSchema = z.object({
  name: requiredText("Campaign name", 120),
  description: optionalText(2000),
  season_id: id.nullish().transform((v) => v ?? null),
  ticket_price_cents: z.number().int().min(1).max(100_000).nullish().transform((v) => v ?? null),
  goal_amount_cents: cents,
  player_goal_default_cents: cents,
  team_goal_default_cents: cents,
  family_target_tickets: z.number().int().min(0).max(10_000).nullish().transform((v) => v ?? null),
  default_allocation: z.number().int().min(0).max(10_000).nullish().transform((v) => v ?? null),
  ticket_prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "Use 2–8 letters or digits.")
    .nullish()
    .transform((v) => v ?? null),
  starts_at: optionalTimestamp,
  sales_close_at: optionalTimestamp,
  draw_at: optionalTimestamp,
  support_email: optionalEmail,
  support_phone: optionalPhone,
  charitable_purpose: optionalText(2_000),
  raffle_year_sequence: z.number().int().min(1).max(4).nullish().transform((v) => v ?? null),
  rules_text: optionalText(20_000),
});

export const createCampaignSchema = campaignFieldsSchema;

export const updateCampaignSchema = campaignFieldsSchema.partial().extend({ campaign_id: id });

export const transitionCampaignSchema = z.object({
  campaign_id: id,
  to: z.enum(CAMPAIGN_STATUSES),
  reason: optionalText(500),
});

export const confirmCampaignComplianceSchema = z.object({
  campaign_id: id,
  entity_confirmed: z.literal(true, { error: "Confirm the legal operator and eligibility evidence review." }),
  raffle_count_confirmed: z.literal(true, { error: "Confirm the raffle-year count and charitable use review." }),
  prize_sales_confirmed: z.literal(true, { error: "Confirm the prize, sales/promotion, and compensation review." }),
  reason: requiredText("Compliance attestation reason", 500).min(3, "Give a reason of at least 3 characters."),
});


export const campaignPrizeSchema = z.object({
  campaign_id: id,
  prize_id: id.nullish().transform((v) => v ?? null),
  name: requiredText("Prize name", 200),
  description: requiredText("Prize description", 2000).min(3, "Describe the prize in at least 3 characters."),
  fair_value_cents: z.number().int().min(1).max(1_000_000_000),
  source: z.enum(["DONATED", "PURCHASED"]),
  possession_basis: z.enum(["OWNED_OR_POSSESSED", "BONDED"]),
  evidence_ref: requiredText("Evidence reference", 1000).min(3, "Add an evidence reference of at least 3 characters."),
});

export const archiveCampaignPrizeSchema = z.object({
  prize_id: id,
  reason: requiredText("Removal reason", 500).min(3, "Give a removal reason of at least 3 characters."),
});
