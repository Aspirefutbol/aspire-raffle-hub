import { z } from "zod";
import { formatMoney } from "./money";
import { quoteTicketPackages, type TicketPackage, type TicketPackageQuote } from "./package-pricing";

const cents = z.number().int().min(1).max(50_000_000);
const ticketBundleSchema = z.object({
  quantity: z.number().int().min(2).max(500),
  priceCents: cents,
}).strict().refine((bundle) => bundle.priceCents >= bundle.quantity, "Each ticket must have a value of at least one cent.");

export const ticketBundlesSchema = z.array(ticketBundleSchema).max(19).superRefine((bundles, ctx) => {
  const seen = new Set<number>();
  bundles.forEach((bundle, index) => {
    if (seen.has(bundle.quantity)) ctx.addIssue({ code: "custom", path: [index, "quantity"], message: "Use each package quantity only once." });
    seen.add(bundle.quantity);
  });
});

/** Preserve the single-price column and validate only the optional discounted bundles. */
export function approvedTicketPackages(single: number | null, bundles: unknown = []): readonly TicketPackage[] | null {
  const parsed = ticketBundlesSchema.safeParse(bundles);
  if (!parsed.success || single === null || !Number.isSafeInteger(single) || single < 1 || single > 100_000) return null;
  if (parsed.data.some((bundle) => bundle.priceCents > single * bundle.quantity)) return null;
  return [{ quantity: 1, priceCents: single }, ...parsed.data];
}

export function campaignTicketQuote(quantity: number, single: number | null, bundles: unknown = []): TicketPackageQuote | null {
  const packages = approvedTicketPackages(single, bundles);
  return packages === null ? null : quoteTicketPackages(quantity, packages);
}

/** Split each selected package separately; remainder cents go to its first tickets. */
export function ticketAmountsForQuote(quote: TicketPackageQuote): readonly number[] {
  const result: number[] = [];
  for (const pack of quote.packages) {
    for (let copy = 0; copy < pack.count; copy += 1) {
      const base = Math.floor(pack.priceCents / pack.quantity);
      const remainder = pack.priceCents % pack.quantity;
      for (let i = 0; i < pack.quantity; i += 1) result.push(base + (i < remainder ? 1 : 0));
    }
  }
  return result;
}

export function bundleOfferText(bundles: unknown): string {
  const parsed = ticketBundlesSchema.safeParse(bundles);
  return parsed.success ? [...parsed.data].sort((a, b) => a.quantity - b.quantity)
    .map((pack) => `${pack.quantity} for ${formatMoney(pack.priceCents)}`).join(" · ") : "Pricing unavailable";
}

export function ticketOfferText(single: number | null, bundles: unknown = []): string {
  if (!approvedTicketPackages(single, bundles) || single === null) return "Pricing not ready";
  const offers = bundleOfferText(bundles);
  return `${formatMoney(single)} each${offers ? ` · ${offers}` : ""}`;
}

export function quoteBreakdownText(quote: TicketPackageQuote): string {
  return quote.packages.map((pack) => pack.quantity === 1
    ? `${pack.count} single ticket${pack.count === 1 ? "" : "s"} × ${formatMoney(pack.priceCents)}`
    : `${pack.count} package${pack.count === 1 ? "" : "s"} of ${pack.quantity} × ${formatMoney(pack.priceCents)}`).join(" + ");
}

const packageSchema = z.object({ quantity: z.number().int().min(1).max(500), priceCents: cents });
export const ticketPackageQuoteSchema = z.object({
  quantity: z.number().int().min(1).max(500), totalCents: cents,
  packages: z.array(packageSchema.extend({ count: z.number().int().min(1).max(500) })).min(1).max(20),
}).refine((quote) => quote.packages.reduce((sum, pack) => sum + pack.quantity * pack.count, 0) === quote.quantity
  && quote.packages.reduce((sum, pack) => sum + pack.priceCents * pack.count, 0) === quote.totalCents,
"Package breakdown must match the ticket count and total.");

export const salePricingSnapshotSchema = z.object({
  version: z.literal(1), singleTicketPriceCents: z.number().int().min(1).max(100_000),
  packages: z.array(packageSchema).min(1).max(20), quote: ticketPackageQuoteSchema,
  ticketAmountsCents: z.array(cents).min(1).max(500),
}).refine((pricing) => pricing.ticketAmountsCents.length === pricing.quote.quantity
  && pricing.ticketAmountsCents.reduce((sum, amount) => sum + amount, 0) === pricing.quote.totalCents,
"Per-ticket values must reconcile to the sale.");
