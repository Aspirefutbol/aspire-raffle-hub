import { describe, expect, it } from "vitest";
import { approvedTicketPackages, bundleOfferText, campaignTicketQuote, quoteBreakdownText, salePricingSnapshotSchema, ticketAmountsForQuote, ticketBundlesSchema, ticketOfferText } from "./campaign-pricing";
import { createCampaignSchema, updateCampaignSchema } from "@/lib/campaigns/schemas";
import { editableFieldsFilter } from "@/lib/campaigns/lifecycle";
import { shareLinks } from "@/lib/sharing/schemas";

const bundles = [{ quantity: 5, priceCents: 9000 }];
describe("campaign package setup and accounting", () => {
  it("uses the approved Aspire offer for every supported quantity", () => {
    for (let quantity = 1; quantity <= 500; quantity += 1) {
      const quote = campaignTicketQuote(quantity, 2000, bundles);
      expect(quote?.totalCents).toBe(Math.floor(quantity / 5) * 9000 + quantity % 5 * 2000);
      if (!quote) throw new Error("Expected an exact quote");
      const amounts = ticketAmountsForQuote(quote);
      expect(amounts).toHaveLength(quantity);
      expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(quote.totalCents);
      expect(amounts.every((amount) => Number.isSafeInteger(amount) && amount > 0)).toBe(true);
    }
  });
  it("preserves package-specific ticket values and remainder cents", () => {
    const mixed = campaignTicketQuote(6, 2000, bundles)!;
    expect(ticketAmountsForQuote(mixed)).toEqual([1800, 1800, 1800, 1800, 1800, 2000]);
    expect(ticketAmountsForQuote(campaignTicketQuote(3, 500, [{ quantity: 3, priceCents: 1000 }])!)).toEqual([334, 333, 333]);
  });
  it("does not silently accept invalid or more-expensive packages", () => {
    for (const invalid of [null, {}, [{ quantity: 1, priceCents: 2000 }], [{ quantity: 5, priceCents: 0 }], [{ quantity: 5, priceCents: 4 }], [{ quantity: 5, priceCents: 10001 }], [{ quantity: 2.5, priceCents: 2000 }], [...bundles, ...bundles], [{ quantity: 5, priceCents: 9000, hidden: true }]]) {
      expect(approvedTicketPackages(2000, invalid)).toBeNull();
    }
    expect(approvedTicketPackages(null, bundles)).toBeNull();
    expect(approvedTicketPackages(100001, [])).toBeNull();
    expect(ticketBundlesSchema.safeParse([]).success).toBe(true);
  });
  it("keeps single-price drafts and partial unrelated updates compatible", () => {
    expect(createCampaignSchema.safeParse({ name: "Draft", ticket_price_cents: null }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ name: "Draft", ticket_packages: bundles }).success).toBe(false);
    const parsed = updateCampaignSchema.parse({ campaign_id: "11111111-1111-4111-8111-111111111111", description: "Changed" });
    expect(parsed).not.toHaveProperty("ticket_packages");
    expect(editableFieldsFilter("READY")?.("ticket_packages")).toBe(true);
    expect(editableFieldsFilter("ACTIVE")?.("ticket_packages")).toBe(false);
  });
  it("shows the same offer and breakdown in sharing and sale guidance", () => {
    expect(ticketOfferText(2000, bundles)).toBe("$20.00 each · 5 for $90.00");
    expect(quoteBreakdownText(campaignTicketQuote(11, 2000, bundles)!)).toBe("2 packages of 5 × $90.00 + 1 single ticket × $20.00");
    const links = shareLinks("https://example.test/s/test", "$20.00", bundleOfferText(bundles));
    for (const value of [links.text, decodeURIComponent(links.sms), decodeURIComponent(links.email), decodeURIComponent(links.whatsapp)]) {
      expect(value).toContain("5 for $90.00");
      expect(value).toContain("offline payment");
    }
  });
  it("rejects receipts whose per-ticket cents do not reconcile", () => {
    const quote = campaignTicketQuote(5, 2000, bundles)!;
    const snapshot = { version: 1, singleTicketPriceCents: 2000, packages: approvedTicketPackages(2000, bundles), quote, ticketAmountsCents: ticketAmountsForQuote(quote) };
    expect(salePricingSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(salePricingSnapshotSchema.safeParse({ ...snapshot, ticketAmountsCents: [2000, 2000, 2000, 2000, 2000] }).success).toBe(false);
  });
});
