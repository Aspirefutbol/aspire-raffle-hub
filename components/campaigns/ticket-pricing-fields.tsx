"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { centsToDollars, dollarsToCents, formatMoney } from "@/lib/fundraising/money";
import { campaignTicketQuote, quoteBreakdownText, ticketBundlesSchema } from "@/lib/fundraising/campaign-pricing";

type Row = { key: number; quantity: string; price: string };

/** Native form fields keep setup atomic: packages and single price save together. */
export function TicketPricingFields({ single, bundles, locked, error, singleError }: {
  single: number | null; bundles: unknown; locked: boolean; error?: string; singleError?: string;
}) {
  const parsed = ticketBundlesSchema.safeParse(bundles);
  const [price, setPrice] = useState(centsToDollars(single));
  const [rows, setRows] = useState<Row[]>(parsed.success ? parsed.data.map((pack, index) => ({ key: index, quantity: String(pack.quantity), price: centsToDollars(pack.priceCents) })) : []);
  const [nextKey, setNextKey] = useState(rows.length);
  const [previewQuantity, setPreviewQuantity] = useState("5");
  const packageValues = rows.map((row) => ({ quantity: Number(row.quantity), priceCents: dollarsToCents(row.price) }));
  const quote = campaignTicketQuote(Number(previewQuantity), dollarsToCents(price), packageValues);
  function update(key: number, changes: Partial<Row>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...changes } : row));
  }
  return <section className="space-y-4 rounded-card border border-line bg-canvas/40 p-4" aria-labelledby="ticket-pricing-heading" data-testid="ticket-pricing-setup">
    <div><h3 id="ticket-pricing-heading" className="text-base font-semibold text-ink">Ticket pricing &amp; packages</h3>
      <p className="mt-1 text-sm text-muted">Set the single-ticket price, then add any package offers. The best exact combination is applied automatically.</p></div>
    {locked && <p className="text-sm font-medium text-ink">Prices are locked because ticket sales have been activated.</p>}
    <Field label="Ticket price ($)" htmlFor="campaign-ticket_price_cents" hint="Price for one ticket." error={singleError}>
      <Input id="campaign-ticket_price_cents" name="ticket_price_cents" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} disabled={locked} placeholder="20.00" />
    </Field>
    <input type="hidden" name="ticket_packages" value={JSON.stringify(packageValues)} disabled={locked} />
    <div className="space-y-3">
      {rows.map((row, index) => <div key={row.key} className="grid gap-3 rounded-control border border-line bg-surface p-3 sm:grid-cols-[1fr_1fr_auto]" data-testid="ticket-package-row">
        <Field label={`Package ${index + 1} tickets`} htmlFor={`package-quantity-${row.key}`}><Input id={`package-quantity-${row.key}`} type="number" min={2} max={500} step={1} required value={row.quantity} onChange={(event) => update(row.key, { quantity: event.target.value })} disabled={locked} /></Field>
        <Field label={`Package ${index + 1} price ($)`} htmlFor={`package-price-${row.key}`} hint="Total for the entire package."><Input id={`package-price-${row.key}`} inputMode="decimal" required value={row.price} onChange={(event) => update(row.key, { price: event.target.value })} disabled={locked} placeholder="90.00" /></Field>
        {!locked && <Button type="button" variant="ghost" className="self-start sm:mt-6" aria-label={`Remove package ${index + 1}`} onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}>Remove</Button>}
      </div>)}
    </div>
    {!locked && <Button type="button" variant="secondary" disabled={rows.length >= 19} onClick={() => { setRows((current) => [...current, { key: nextKey, quantity: "5", price: "" }]); setNextKey((key) => key + 1); }}>Add ticket package</Button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="space-y-2 rounded-control border border-line bg-surface p-3" aria-label="Ticket price preview">
      <p className="text-sm font-semibold">Preview a sale</p>
      <Field label="Preview ticket quantity" htmlFor="pricing-preview-quantity"><Input id="pricing-preview-quantity" inputMode="numeric" value={previewQuantity} onChange={(event) => setPreviewQuantity(event.target.value)} /></Field>
      <div role="status" aria-live="polite">{quote ? <><p className="text-xl font-semibold">{quote.quantity} tickets · {formatMoney(quote.totalCents)}</p><p className="mt-1 text-sm text-muted">{quoteBreakdownText(quote)}</p></> : <p className="text-sm text-muted">Enter valid prices and a quantity to preview the total.</p>}</div>
    </div>
    <p className="text-xs text-muted">Packages apply within one sale, not across different buyers or earlier purchases. All pricing locks at activation.</p>
  </section>;
}
