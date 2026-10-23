from pathlib import Path
R=Path.cwd()
def replace(path,a,b,n=1):
 p=R/path;s=p.read_text()
 if s.count(a)!=n:raise ValueError(f'{path}: expected {n} got {s.count(a)} of {a[:60]}')
 p.write_text(s.replace(a,b))
p='lib/campaigns/schemas.ts'
replace(p,'import { CAMPAIGN_STATUSES } from "./lifecycle";', 'import { CAMPAIGN_STATUSES } from "./lifecycle";\nimport { approvedTicketPackages, ticketBundlesSchema } from "@/lib/fundraising/campaign-pricing";')
replace(p,'  goal_amount_cents: cents,','  ticket_packages: ticketBundlesSchema.optional(),\n  goal_amount_cents: cents,')
replace(p,'export const createCampaignSchema = campaignFieldsSchema;','''export const createCampaignSchema = campaignFieldsSchema.superRefine((data, ctx) => {
  if ((data.ticket_packages?.length ?? 0) > 0 && !approvedTicketPackages(data.ticket_price_cents, data.ticket_packages)) {
    ctx.addIssue({ code: "custom", path: ["ticket_packages"], message: "Set a single-ticket price, use distinct package quantities, and price each package at or below the equivalent singles." });
  }
});''')
replace('lib/campaigns/lifecycle.ts','"season_id", "ticket_price_cents",','"season_id", "ticket_price_cents", "ticket_packages",')
p='components/campaigns/campaign-sheet.tsx'
replace(p,'import { Sheet } from "@/components/ui/sheet";','import { Sheet } from "@/components/ui/sheet";\nimport { TicketPricingFields } from "./ticket-pricing-fields";')
replace(p,'    const parsed = createCampaignSchema.safeParse({','''    let bundles: unknown = campaign?.ticket_packages ?? [];
    if (!locked("ticket_packages")) {
      try { bundles = JSON.parse(String(form.get("ticket_packages") ?? "[]")); }
      catch { setErrors({ ticket_packages: "Check the ticket package details." }); return; }
    }
    const parsed = createCampaignSchema.safeParse({''')
replace(p,'      ticket_price_cents: money("ticket_price_cents"),','      ticket_packages: bundles,\n      ticket_price_cents: money("ticket_price_cents"),')
replace(p,'        return value !== campaign[key as keyof Campaign];','''        if (key === "ticket_packages") return JSON.stringify(value) !== JSON.stringify(campaign.ticket_packages);
        return value !== campaign[key as keyof Campaign];''')
replace(p,'            ["ticket_price_cents", "Ticket price ($)"], ["goal_amount_cents", "Campaign goal ($)"],','            ["goal_amount_cents", "Campaign goal ($)"],')
replace(p,'        <div className="grid gap-4 sm:grid-cols-2">\n          {([','''        <TicketPricingFields single={campaign?.ticket_price_cents ?? null} bundles={campaign?.ticket_packages ?? []}
          locked={locked("ticket_packages")} error={errors.ticket_packages} singleError={errors.ticket_price_cents} />
        <div className="grid gap-4 sm:grid-cols-2">
          {([''')
replace(p,'Ticket price, prefix, name,','Ticket price and packages, prefix, name,')
p='lib/fundraising/types.ts'
replace(p,'import { OFFLINE_PAYMENT_METHODS } from "./schemas";', 'import { OFFLINE_PAYMENT_METHODS } from "./schemas";\nimport { salePricingSnapshotSchema, ticketBundlesSchema } from "./campaign-pricing";')
replace(p,'  ticket_price_cents: optionalCents,','  ticket_price_cents: optionalCents,\n  ticket_packages: ticketBundlesSchema.default([]),')
replace(p,'quantity: count, replayed: z.boolean() });','quantity: count, replayed: z.boolean(), pricing_snapshot: salePricingSnapshotSchema.nullish().transform((value) => value ?? null) });')
p='components/campaigns/sale-sheets.tsx'
replace(p,'dollarsToCents, formatMoney, saleAmountCents','dollarsToCents, formatMoney')
replace(p,'import { useActionRunner } from "@/lib/hooks/use-action-runner";', 'import { useActionRunner } from "@/lib/hooks/use-action-runner";\nimport { campaignTicketQuote, quoteBreakdownText, ticketOfferText } from "@/lib/fundraising/campaign-pricing";')
replace(p,'campaignId, ticketPriceCents, participant,','campaignId, ticketPriceCents, ticketPackages = [], participant,')
replace(p,'  ticketPriceCents: number | null;','  ticketPriceCents: number | null;\n  ticketPackages?: unknown;')
replace(p,'  const amount = ticketPriceCents ? saleAmountCents(Number(quantity), ticketPriceCents) : null;', '  const quote = campaignTicketQuote(Number(quantity), ticketPriceCents, ticketPackages);\n  const amount = quote?.totalCents ?? null;')
replace(p,'ticketPriceCents !== null;', 'campaignTicketQuote(1, ticketPriceCents, ticketPackages) !== null;')
replace(p,'Amount collected must equal the quantity × ticket price.','Amount collected must equal the approved ticket package total.')
replace(p,'description={`${participant.player_name} · ${ticketPriceCents ? formatMoney(ticketPriceCents) : "—"} per ticket`}', 'description={`${participant.player_name} · ${ticketOfferText(ticketPriceCents, ticketPackages)}`}')
replace(p,'            <p className="text-xs text-muted">The sale, ticket, money, and activity history were recorded together.</p>', '''            {receipt.pricing_snapshot && <p className="text-sm text-ink-soft">{quoteBreakdownText(receipt.pricing_snapshot.quote)}</p>}
            <p className="text-xs text-muted">The sale, ticket, money, and activity history were recorded together.</p>''')
replace(p,'              <Field label="Amount collected ($)"', '''              {quote && <div className="rounded-control border border-line bg-canvas p-3" role="status" aria-label="Sale pricing summary"><p className="text-lg font-semibold">Total: {formatMoney(quote.totalCents)}</p><p className="mt-1 text-sm text-muted">{quoteBreakdownText(quote)}</p></div>}
              <Field label="Amount collected ($)"''')
replace(p,'Must match the ticket face value. No online payment is taken.', 'Must match the total shown above. Only record cash or a check already received.')
for p in ['components/fundraising/family-campaign.tsx','app/o/[orgSlug]/campaigns/[campaignId]/page.tsx']:
 replace(p,'ticketPriceCents={campaign.ticket_price_cents}', 'ticketPriceCents={campaign.ticket_price_cents} ticketPackages={campaign.ticket_packages}', n=(R/p).read_text().count('ticketPriceCents={campaign.ticket_price_cents}'))
replace('components/sharing/request-inbox.tsx','ticketPriceCents={progress.campaign.ticket_price_cents}', 'ticketPriceCents={progress.campaign.ticket_price_cents} ticketPackages={progress.campaign.ticket_packages}')
p='components/fundraising/family-campaign.tsx'
replace(p,'import { formatMoney } from "@/lib/fundraising/money";', 'import { formatMoney } from "@/lib/fundraising/money";\nimport { ticketOfferText } from "@/lib/fundraising/campaign-pricing";')
replace(p,'{formatMoney(campaign.ticket_price_cents)} per ticket', '{ticketOfferText(campaign.ticket_price_cents, campaign.ticket_packages)}')
replace(p,'price={campaign.ticket_price_cents}/>', 'price={campaign.ticket_price_cents} ticketPackages={campaign.ticket_packages}/>')
p='lib/sharing/schemas.ts'
replace(p,'import { z } from "zod";', 'import { z } from "zod";\nimport { ticketBundlesSchema } from "@/lib/fundraising/campaign-pricing";')
replace(p,'ticket_price_cents: z.number(),','ticket_price_cents: z.number(), ticket_packages: ticketBundlesSchema.default([]),')
replace(p,'export function shareLinks(url: string, price: string) {','export function shareLinks(url: string, price: string, packages = "") {')
replace(p,'${price} each. Use this page','${price} each${packages ? `; ${packages}` : ""}. Use this page')
p='components/sharing/seller-tools.tsx'
replace(p,'import { formatMoney } from "@/lib/fundraising/money";', 'import { formatMoney } from "@/lib/fundraising/money";\nimport { bundleOfferText } from "@/lib/fundraising/campaign-pricing";')
replace(p,'participantId, price }: { orgSlug: string; participantId: string; price: number | null }', 'participantId, price, ticketPackages = [] }: { orgSlug: string; participantId: string; price: number | null; ticketPackages?: unknown }')
replace(p,'formatMoney(price));', 'formatMoney(price), bundleOfferText(ticketPackages));')
p='components/sharing/toolkit.tsx'
replace(p,'import { formatMoney } from "@/lib/fundraising/money";', 'import { ticketOfferText } from "@/lib/fundraising/campaign-pricing";')
replace(p,'{ price, closeDate }: { price: number | null; closeDate: string }', '{ price, closeDate, ticketPackages = [] }: { price: number | null; closeDate: string; ticketPackages?: unknown }')
replace(p,'{price === null ? "the published price" : formatMoney(price)} each', '{ticketOfferText(price, ticketPackages)}')
replace('app/o/[orgSlug]/fundraising/[campaignId]/page.tsx','<SellerToolkit price={progress.campaign.ticket_price_cents}', '<SellerToolkit price={progress.campaign.ticket_price_cents} ticketPackages={progress.campaign.ticket_packages}')
p='app/s/[token]/page.tsx'
replace(p,'import { formatMoney } from "@/lib/fundraising/money";', 'import { ticketOfferText } from "@/lib/fundraising/campaign-pricing";')
replace(p,'{formatMoney(page.ticket_price_cents)}','{ticketOfferText(page.ticket_price_cents, page.ticket_packages)}')
p='lib/fundraising/ticket-receipt.ts'
replace(p,'import { id } from "@/lib/validation";', 'import { id } from "@/lib/validation";\nimport { salePricingSnapshotSchema, ticketBundlesSchema } from "./campaign-pricing";')
replace(p,'    status: z.enum(["AVAILABLE", "ALLOCATED", "ISSUED", "VOIDED"]),', '    status: z.enum(["AVAILABLE", "ALLOCATED", "ISSUED", "VOIDED"]),\n    price_cents: z.number().int().positive().nullish(),')
replace(p,'  prize_description: z.string()', '  ticket_packages: ticketBundlesSchema.default([]),\n  pricing_snapshot: salePricingSnapshotSchema.nullish().transform((value) => value ?? null),\n  prize_description: z.string()')
p='app/o/[orgSlug]/tickets/[saleId]/page.tsx'
replace(p,'import { formatMoney } from "@/lib/fundraising/money";', 'import { formatMoney } from "@/lib/fundraising/money";\nimport { quoteBreakdownText } from "@/lib/fundraising/campaign-pricing";')
replace(p,'        const voided =', '        const price = ticket.price_cents ?? receipt.ticket_price_cents;\n        const voided =')
replace(p,'{receipt.ticket_price_cents === null ? "Not recorded" : formatMoney(receipt.ticket_price_cents)}', '{price == null ? "Not recorded" : formatMoney(price)}')
replace(p,'              {receipt.charitable_purpose &&', '''              {receipt.pricing_snapshot && <div className="rounded-control border border-line p-3 text-sm" data-testid="ticket-package-receipt"><p className="font-semibold">Purchase: {receipt.quantity} tickets for {formatMoney(receipt.amount_cents)}</p><p className="mt-1">{quoteBreakdownText(receipt.pricing_snapshot.quote)}</p><p className="mt-1 text-xs text-muted">The price above is this ticket’s portion of the package. Every issued ticket is one drawing entry.</p></div>}
              {receipt.charitable_purpose &&''')
p='app/o/[orgSlug]/campaigns/[campaignId]/page.tsx'
replace(p,'import { RecordSaleButton, ReverseSaleButton }', 'import { ticketOfferText } from "@/lib/fundraising/campaign-pricing";\nimport { RecordSaleButton, ReverseSaleButton }')
replace(p,'{campaign.ticket_price_cents ? formatMoney(campaign.ticket_price_cents) : "Not set"}', '{ticketOfferText(campaign.ticket_price_cents, campaign.ticket_packages)}')
print('TypeScript and UI changes written.')
