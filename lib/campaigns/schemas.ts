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
  family_target_tickets: z.number().int().min(0).max(10_000).nullish().transform((v) => v ?? null),
  default_allocation: z.number().int().min(0).max(10_000).nullish().transform((v) => v ?? null),
  ticket_prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, "Use 1–6 letters or digits.")
    .nullish()
    .transform((v) => v ?? null),
  starts_at: optionalTimestamp,
  sales_close_at: optionalTimestamp,
  draw_at: optionalTimestamp,
  support_email: optionalEmail,
  support_phone: optionalPhone,
  rules_text: optionalText(20_000),
});

export const createCampaignSchema = campaignFieldsSchema;

export const updateCampaignSchema = campaignFieldsSchema.partial().extend({ campaign_id: id });

export const transitionCampaignSchema = z.object({
  campaign_id: id,
  to: z.enum(CAMPAIGN_STATUSES),
  reason: optionalText(500),
});
