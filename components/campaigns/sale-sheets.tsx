"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { recordCampaignSale, reverseCampaignSale } from "@/lib/fundraising/actions";
import { dollarsToCents, formatMoney } from "@/lib/fundraising/money";
import { recordCampaignSaleSchema, type OfflinePaymentMethod } from "@/lib/fundraising/schemas";
import type { CampaignParticipantProgress, RecentCampaignSale, RecordedSale } from "@/lib/fundraising/types";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { campaignTicketQuote, quoteBreakdownText, ticketOfferText } from "@/lib/fundraising/campaign-pricing";

type SalePayload = Parameters<typeof recordCampaignSaleSchema.parse>[0] & Record<string, unknown>;

function localSaleTimestamp(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Keeps an uncertain submission intact across retries and closing the sheet. */
export function RecordSaleButton({ orgSlug, campaignId, ticketPriceCents, ticketPackages = [], participant, label = "Record sale", className, correctsSaleId, alreadyCorrected = false, prefill, onRecorded, hideTrigger = false }: {
  orgSlug: string;
  campaignId: string;
  ticketPriceCents: number | null;
  ticketPackages?: unknown;
  participant: CampaignParticipantProgress;
  label?: string;
  className?: string;
  correctsSaleId?: string;
  alreadyCorrected?: boolean;
  prefill?: { buyer_name: string; buyer_email: string; buyer_phone: string; quantity: number; notes: string };
  onRecorded?: (saleId: string) => void;
  hideTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(prefill?.quantity ?? 1));
  const [payload, setPayload] = useState<SalePayload | null>(null);
  const [receipt, setReceipt] = useState<RecordedSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [pending, startTransition] = useTransition();
  const quote = campaignTicketQuote(Number(quantity), ticketPriceCents, ticketPackages);
  const amount = quote?.totalCents ?? null;
  const canStart = !alreadyCorrected && participant.can_record_sale && participant.available_tickets > 0 && campaignTicketQuote(1, ticketPriceCents, ticketPackages) !== null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const soldAt = String(form.get("sold_at") ?? "");
    const date = soldAt ? new Date(soldAt) : null;
    const parsed = recordCampaignSaleSchema.safeParse(payload ?? {
      campaign_id: campaignId,
      participant_id: participant.id,
      idempotency_key: crypto.randomUUID(),
      buyer_name: form.get("buyer_name"),
      buyer_email: String(form.get("buyer_email") ?? ""),
      buyer_phone: String(form.get("buyer_phone") ?? ""),
      quantity: Number(quantity),
      amount_cents: dollarsToCents(String(form.get("amount") ?? "")),
      payment_method: String(form.get("payment_method")) as OfflinePaymentMethod,
      notes: String(form.get("notes") ?? ""),
      sold_at: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      corrects_sale_id: correctsSaleId ?? null,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the sale details."); return; }
    if (amount !== parsed.data.amount_cents) { setError("Amount collected must equal the approved ticket package total."); return; }
    setPayload(parsed.data);
    setError(null);
    setCanEdit(false);
    startTransition(async () => {
      try {
        const result = await recordCampaignSale(orgSlug, parsed.data);
        if (!result.ok) { setError(result.error); setCanEdit(result.canEdit === true || Boolean(result.fieldErrors)); return; }
        setReceipt(result.data);
        onRecorded?.(result.data.sale_id);
        toast.success(result.message ?? "Sale recorded and tickets issued");
      } catch {
        setError("The response could not be confirmed. Retry this same submission to check whether the sale was recorded.");
      }
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    if (receipt) { setReceipt(null); setPayload(null); setQuantity("1"); setError(null); setCanEdit(false); }
  }

  return (
    <>
      {!hideTrigger && (!alreadyCorrected || payload || receipt) && <Button size="lg" className={className} disabled={!canStart && !payload} onClick={() => setOpen(true)}>{payload && !receipt ? "Resume sale" : label}</Button>}
      <Sheet open={open} onClose={close} title={receipt ? "Tickets issued" : "Record sale"} description={`${participant.player_name} · ${ticketOfferText(ticketPriceCents, ticketPackages)}`}
        footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={close}>{receipt ? "Done" : "Close"}</Button>{canEdit && !receipt && <Button variant="secondary" disabled={pending} onClick={() => { setPayload(null); setCanEdit(false); setError(null); }}>Edit details</Button>}{!receipt && <Button type="submit" form={`sale-${participant.id}`} size="lg" loading={pending}>{payload ? "Retry same sale" : "Record sale"}</Button>}</div>}>
        {receipt ? (
          <div className="space-y-4" role="status">
            <p className="text-sm text-ink-soft">{receipt.quantity} ticket{receipt.quantity === 1 ? "" : "s"} issued for {formatMoney(receipt.amount_cents)}. Payment was recorded offline.</p>
            <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4"><h3 className="mb-2 text-sm font-semibold text-emerald-900">Ticket numbers</h3><ul className="flex flex-wrap gap-2">{receipt.ticket_numbers.map((number) => <li key={number} className="rounded-control bg-white px-2 py-1 font-mono text-sm text-emerald-900">{number}</li>)}</ul></div>
            {receipt.pricing_snapshot && <p className="text-sm text-ink-soft">{quoteBreakdownText(receipt.pricing_snapshot.quote)}</p>}
            <p className="text-xs text-muted">The sale, ticket, money, and activity history were recorded together.</p>
            <ButtonLink href={`/o/${orgSlug}/tickets/${receipt.sale_id}`} variant="secondary">View / print tickets</ButtonLink>
          </div>
        ) : (
          <form id={`sale-${participant.id}`} onSubmit={submit} className="space-y-4">
            {payload && <p className="rounded-control border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{canEdit ? "The sale was rejected and no tickets were issued. Edit the details or retry this submission." : "This submission is saved for a safe retry. Its details are locked until the result is confirmed."}</p>}
            {correctsSaleId && <p className="text-sm text-ink-soft">This replacement is linked to the reversed sale. It issues new ticket numbers and preserves the original history.</p>}
            {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <fieldset disabled={pending || payload !== null} className="space-y-4">
              <Field label="Buyer name" htmlFor={`buyer-name-${participant.id}`} required><Input id={`buyer-name-${participant.id}`} name="buyer_name" required maxLength={200} autoFocus defaultValue={payload ? String(payload.buyer_name) : prefill?.buyer_name ?? ""} /></Field>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Buyer email" htmlFor={`buyer-email-${participant.id}`} hint="Optional"><Input id={`buyer-email-${participant.id}`} name="buyer_email" type="email" maxLength={254} defaultValue={payload ? String(payload.buyer_email ?? "") : prefill?.buyer_email ?? ""} /></Field><Field label="Buyer phone" htmlFor={`buyer-phone-${participant.id}`} hint="Optional"><Input id={`buyer-phone-${participant.id}`} name="buyer_phone" type="tel" maxLength={50} defaultValue={payload ? String(payload.buyer_phone ?? "") : prefill?.buyer_phone ?? ""} /></Field></div>
              <Field label="Quantity" htmlFor={`quantity-${participant.id}`} hint={`${participant.available_tickets} assigned tickets available`} required><Input id={`quantity-${participant.id}`} name="quantity" type="number" min={1} max={Math.min(500, participant.available_tickets)} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></Field>
              {quote && <div className="rounded-control border border-line bg-canvas p-3" role="status" aria-label="Sale pricing summary"><p className="text-lg font-semibold">Total: {formatMoney(quote.totalCents)}</p><p className="mt-1 text-sm text-muted">{quoteBreakdownText(quote)}</p></div>}
              <Field label="Amount collected ($)" htmlFor={`amount-${participant.id}`} hint="Must match the total shown above. Only record cash or a check already received." required><Input key={quantity} id={`amount-${participant.id}`} name="amount" inputMode="decimal" required defaultValue={payload ? String(Number(payload.amount_cents) / 100) : amount === null ? "" : (amount / 100).toFixed(2)} /></Field>
              <Field label="Payment method" htmlFor={`payment-${participant.id}`}><Select id={`payment-${participant.id}`} name="payment_method" defaultValue={payload ? String(payload.payment_method) : "cash"}><option value="cash">Cash</option><option value="check">Check</option></Select></Field>
              <Field label="Sale timestamp" htmlFor={`sold-at-${participant.id}`} hint="Optional. Leave blank to use the time this sale is recorded. Dates use your device’s time zone."><Input id={`sold-at-${participant.id}`} name="sold_at" type="datetime-local" defaultValue={localSaleTimestamp(payload?.sold_at)} /></Field>
              <Field label="Notes" htmlFor={`notes-${participant.id}`} hint="Optional"><Textarea id={`notes-${participant.id}`} name="notes" maxLength={2000} defaultValue={payload ? String(payload.notes ?? "") : prefill?.notes ?? ""} /></Field>
            </fieldset>
            <p className="text-xs text-muted">Ticket numbers are assigned automatically from this player’s inventory when the sale is recorded.</p>
          </form>
        )}
      </Sheet>
    </>
  );
}

export function ReverseSaleButton({ orgSlug, sale }: { orgSlug: string; sale: RecentCampaignSale }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();
  if (!sale.can_reverse || sale.reversed) return null;
  return <><Button size="sm" variant="danger" onClick={() => setOpen(true)}>Reverse sale</Button><Sheet open={open} onClose={() => !pending && setOpen(false)} title="Reverse sale" description={`${sale.player_name} · ${formatMoney(sale.amount_cents)} · ${sale.ticket_numbers.join(", ")}`} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form={`reverse-${sale.id}`} variant="danger" loading={pending}>Confirm reversal</Button></div>}><form id={`reverse-${sale.id}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); run(() => reverseCampaignSale(orgSlug, { sale_id: sale.id, reason: form.get("reason") }), { onSuccess: () => setOpen(false) }); }} className="space-y-4"><p className="text-sm text-ink-soft">This adds a reversal to the financial history and voids these tickets. Original records remain unchanged, and these numbers will not be reused.</p><Field label="Reason for reversal" htmlFor={`reverse-reason-${sale.id}`} required hint="Recorded in the activity log."><Textarea id={`reverse-reason-${sale.id}`} name="reason" minLength={3} maxLength={500} required autoFocus /></Field></form></Sheet></>;
}
