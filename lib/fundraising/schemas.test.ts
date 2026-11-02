import { describe, expect, it } from "vitest";
import { createCampaignSchema } from "@/lib/campaigns/schemas";
import { allocateCampaignTicketsSchema, enrollCampaignPlayersSchema, recordCampaignSaleSchema, reverseCampaignSaleSchema } from "./schemas";
import { campaignProgressSchema, recentCampaignSaleSchema } from "./types";

const CAMPAIGN = "e5065948-1e08-4fbf-8c82-a96dc5ad9150";
const PLAYER = "b98e257c-a959-4c09-940d-859f061284de";
const sale = { campaign_id: CAMPAIGN, participant_id: PLAYER, idempotency_key: "submit-1", buyer_name: " Jamie Buyer ", quantity: 2, amount_cents: 1000, payment_method: "cash" };

describe("fundraising write validation", () => {
  it("accepts each enrollment selection and rejects an empty or ambiguous selection", () => {
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, all_active: true }).success).toBe(true);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, team_ids: [PLAYER] }).success).toBe(true);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, player_ids: [PLAYER] }).success).toBe(true);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN }).success).toBe(false);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, all_active: true, team_ids: [PLAYER] }).success).toBe(false);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, player_ids: ["foreign-invalid-id"] }).success).toBe(false);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, team_ids: Array(200).fill(PLAYER) }).success).toBe(true);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, team_ids: Array(201).fill(PLAYER) }).success).toBe(false);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, player_ids: Array(5000).fill(PLAYER) }).success).toBe(true);
    expect(enrollCampaignPlayersSchema.safeParse({ campaign_id: CAMPAIGN, player_ids: Array(5001).fill(PLAYER) }).success).toBe(false);
  });

  it("normalizes buyer input and keeps a retry's submission key", () => {
    const parsed = recordCampaignSaleSchema.parse({ ...sale, buyer_email: " Jamie@Example.COM ", notes: " " });
    expect(parsed.buyer_name).toBe("Jamie Buyer");
    expect(parsed.buyer_email).toBe("jamie@example.com");
    expect(parsed.notes).toBeNull();
    expect(parsed.buyer_phone).toBeNull();
    expect(parsed.idempotency_key).toBe("submit-1");
    expect(parsed.sold_at).toBeNull();
  });

  it("rejects online/unauthorized payments, partial cents and missing submission identity", () => {
    for (const payment_method of ["card", "offline_card", "other", "online"]) {
      expect(recordCampaignSaleSchema.safeParse({ ...sale, payment_method }).success, payment_method).toBe(false);
    }
    expect(recordCampaignSaleSchema.safeParse({ ...sale, payment_method: "check" }).success).toBe(true);
    expect(recordCampaignSaleSchema.safeParse({ ...sale, amount_cents: 1000.5 }).success).toBe(false);
    expect(recordCampaignSaleSchema.safeParse({ ...sale, amount_cents: 0 }).success).toBe(false);
    expect(recordCampaignSaleSchema.safeParse({ ...sale, idempotency_key: " " }).success).toBe(false);
    expect(recordCampaignSaleSchema.safeParse({ ...sale, quantity: 501 }).success).toBe(false);
    expect(recordCampaignSaleSchema.safeParse({ ...sale, buyer_email: "invalid" }).success).toBe(false);
  });

  it("requires a meaningful reversal reason and positive inventory allocation", () => {
    expect(reverseCampaignSaleSchema.safeParse({ sale_id: PLAYER, reason: " " }).success).toBe(false);
    expect(reverseCampaignSaleSchema.safeParse({ sale_id: PLAYER, reason: "Duplicate offline record" }).success).toBe(true);
    expect(allocateCampaignTicketsSchema.safeParse({ campaign_id: CAMPAIGN, participant_id: PLAYER, quantity: 0 }).success).toBe(false);
  });

  it("aligns campaign prefix lengths with SQL and accepts nullable integer goal defaults", () => {
    const valid = createCampaignSchema.parse({ name: "Fall raffle", ticket_prefix: "ab123456", player_goal_default_cents: 25_000, team_goal_default_cents: 100_000 });
    expect(valid.ticket_prefix).toBe("AB123456");
    expect(valid.player_goal_default_cents).toBe(25_000);
    expect(createCampaignSchema.safeParse({ name: "Fall", ticket_prefix: "A" }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: "Fall", ticket_prefix: "ABCDEFGHI" }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: "Fall", ticket_prefix: "AB", player_goal_default_cents: 0 }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ name: "Fall", ticket_prefix: "AB", team_goal_default_cents: 12.5 }).success).toBe(false);
    expect(createCampaignSchema.parse({ name: "Fall" }).player_goal_default_cents).toBeNull();
  });
});

describe("bounded fundraising projections", () => {
  it("does not serialize buyer contacts or other unexpected sale fields", () => {
    const parsed = recentCampaignSaleSchema.parse({ id: PLAYER, participant_id: PLAYER, player_name: "Player A", quantity: 2, amount_cents: 1000,
      payment_method: "cash", sold_at: "2026-10-12T12:00:00Z", ticket_numbers: ["AB000001", "AB000002"], reversed: false, can_reverse: false,
      buyer_name: "Private Buyer", buyer_email: "buyer@example.com", notes: "Private note" });
    expect(parsed).not.toHaveProperty("buyer_name");
    expect(parsed).not.toHaveProperty("buyer_email");
    expect(parsed).not.toHaveProperty("notes");
    expect(parsed.corrects_sale_id).toBeNull();
    expect(parsed.replacement_sale_id).toBeNull();
  });

  it("retains authorized correction associations while stripping private buyer data", () => {
    const original = recentCampaignSaleSchema.parse({ id: PLAYER, participant_id: PLAYER, player_name: "Player A", quantity: 2, amount_cents: 1000,
      payment_method: "cash", sold_at: "2026-10-12T12:00:00Z", ticket_numbers: ["AB000001", "AB000002"], reversed: true, can_reverse: false,
      corrects_sale_id: null, replacement_sale_id: CAMPAIGN });
    expect(original.replacement_sale_id).toBe(CAMPAIGN);
    const replacement = recentCampaignSaleSchema.parse({ ...original, id: CAMPAIGN, reversed: false,
      corrects_sale_id: PLAYER, replacement_sale_id: null, buyer_name: "Private Buyer", buyer_phone: "555-555-5555", notes: "Private correction note" });
    expect(replacement.corrects_sale_id).toBe(PLAYER);
    expect(replacement.replacement_sale_id).toBeNull();
    expect(replacement).not.toHaveProperty("buyer_name");
    expect(replacement).not.toHaveProperty("buyer_phone");
    expect(replacement).not.toHaveProperty("notes");
    expect(recentCampaignSaleSchema.safeParse({ ...replacement, corrects_sale_id: "invalid-id" }).success).toBe(false);
  });

  it("rejects totals that cannot be represented as exact cents", () => {
    const response = { campaign: { id: CAMPAIGN, name: "Fall", status: "ACTIVE", ticket_price_cents: 500, goal_amount_cents: 100_000,
      player_goal_default_cents: null, team_goal_default_cents: null, default_allocation: 20, ticket_prefix: "AB", starts_at: null, sales_close_at: null,
      draw_at: null, description: null, support_email: null, support_phone: null }, totals: { raised_cents: 1000.5, tickets_sold: 2, player_count: 1, team_count: 1 },
      participants: [], teams: [], recent_sales: [] };
    expect(campaignProgressSchema.safeParse(response).success).toBe(false);
    expect(campaignProgressSchema.safeParse({ ...response, totals: { ...response.totals, raised_cents: 1000 } }).success).toBe(true);
  });
});
