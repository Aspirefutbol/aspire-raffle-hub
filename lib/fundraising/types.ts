import { z } from "zod";
import { CAMPAIGN_STATUSES } from "@/lib/campaigns/lifecycle";
import { id } from "@/lib/validation";
import { OFFLINE_PAYMENT_METHODS } from "./schemas";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalCents = count.nullable();

/** Runtime parsers also remove unexpected fields before serializing to the client. */
export const campaignSummarySchema = z.object({
  id,
  name: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  ticket_price_cents: optionalCents,
  goal_amount_cents: optionalCents,
  player_goal_default_cents: optionalCents,
  team_goal_default_cents: optionalCents,
  default_allocation: count.nullable(),
  ticket_prefix: z.string().nullable(),
  starts_at: z.string().nullable(),
  sales_close_at: z.string().nullable(),
  draw_at: z.string().nullable(),
  description: z.string().nullable(),
  support_email: z.string().nullable(),
  support_phone: z.string().nullable(),
});

export const fundraisingTotalsSchema = z.object({ raised_cents: count, tickets_sold: count, player_count: count, team_count: count });
export const fundraisingCampaignSchema = z.object({ campaign: campaignSummarySchema, totals: fundraisingTotalsSchema });
export const fundraisingCampaignListSchema = z.array(fundraisingCampaignSchema);

export const campaignParticipantProgressSchema = z.object({
  id,
  player_id: id,
  player_name: z.string(),
  team_id: id.nullable(),
  team_name: z.string().nullable(),
  status: z.enum(["active", "withdrawn"]),
  goal_amount_cents: optionalCents,
  raised_cents: count,
  tickets_sold: count,
  available_tickets: count,
  ticket_range: z.object({ first: z.string().nullable(), last: z.string().nullable() }),
  can_record_sale: z.boolean(),
});
export const campaignTeamProgressSchema = z.object({ id, name: z.string(), goal_amount_cents: optionalCents, raised_cents: count, tickets_sold: count, player_count: count });
export const recentCampaignSaleSchema = z.object({
  id,
  participant_id: id,
  player_name: z.string(),
  quantity: count,
  amount_cents: count,
  payment_method: z.enum(OFFLINE_PAYMENT_METHODS),
  sold_at: z.string(),
  ticket_numbers: z.array(z.string()),
  reversed: z.boolean(),
  can_reverse: z.boolean(),
});
export const campaignProgressSchema = fundraisingCampaignSchema.extend({
  participants: z.array(campaignParticipantProgressSchema),
  teams: z.array(campaignTeamProgressSchema),
  recent_sales: z.array(recentCampaignSaleSchema),
});
export const recordedSaleSchema = z.object({ sale_id: id, ticket_numbers: z.array(z.string()), amount_cents: count, quantity: count, replayed: z.boolean() });

export type CampaignSummary = z.infer<typeof campaignSummarySchema>;
export type FundraisingTotals = z.infer<typeof fundraisingTotalsSchema>;
export type FundraisingCampaign = z.infer<typeof fundraisingCampaignSchema>;
export type CampaignParticipantProgress = z.infer<typeof campaignParticipantProgressSchema>;
export type CampaignTeamProgress = z.infer<typeof campaignTeamProgressSchema>;
export type RecentCampaignSale = z.infer<typeof recentCampaignSaleSchema>;
export type CampaignProgress = z.infer<typeof campaignProgressSchema>;
export type RecordedSale = z.infer<typeof recordedSaleSchema>;
export type { FundraisingView } from "./capabilities";
