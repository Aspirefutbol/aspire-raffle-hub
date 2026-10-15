"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { dollarsToCents, formatMoney } from "@/lib/fundraising/money";
import { recordMoneyCustody } from "@/lib/money/actions";
import { MONEY_KINDS, type MoneyKind, type MoneyProjection } from "@/lib/money/schemas";

const moneyLabels: Record<MoneyKind, string> = {
  receipt: "Record turn-in", check_cleared: "Mark check cleared", check_returned: "Record returned check",
  exception_opened: "Flag financial issue", exception_resolved: "Resolve financial issue", refund: "Record refund", credit: "Move available credit",
  adjustment: "Approve balance adjustment", deposit: "Record deposit",
};
const control = "min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm";

export function MoneyOperationForm({ orgSlug, campaignId, money, canReceive, canAdjust }: {
  orgSlug: string; campaignId: string; money: MoneyProjection; canReceive: boolean; canAdjust: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<MoneyKind>(canReceive ? "receipt" : "adjustment");
  const [pending, startTransition] = useTransition();
  const [submission, setSubmission] = useState<Record<string, unknown> | null>(null);
  const preserved = useRef<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const allowed = MONEY_KINDS.filter((k) => ["refund", "credit", "adjustment"].includes(k) ? canAdjust : canReceive);
  const needsReceipt = kind !== "receipt" && kind !== "adjustment" && kind !== "exception_opened";
  const needsSale = ["refund", "credit", "adjustment", "exception_opened"].includes(kind);
  const needsAmount = ["receipt", "refund", "credit", "adjustment", "deposit", "exception_opened"].includes(kind);
  const participants = new Map(money.participants.map((p) => [p.id, p.player_name]));
  const sales = money.sales.map((s) => ({ id: s.id, label: `${participants.get(s.participant_id) ?? "Player"} · ${formatMoney(s.recorded_cents)} · ${s.id.slice(0, 8)}${s.expected_cents === 0 ? " (reversed)" : ""}` }));
  const receipts = money.events.filter((e) => e.kind === "receipt");
  function submit(request: Record<string, unknown>) {
    preserved.current = request;
    setSubmission(request); setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await recordMoneyCustody(orgSlug, request);
        if (!result.ok) {
          setError(result.error);
          if (result.canEdit) { preserved.current = null; setSubmission(null); }
          return;
        }
        setMessage(`${result.message ?? "Recorded"} · ${result.data.event_id}`);
        preserved.current = null; setSubmission(null); form.current?.reset(); router.refresh();
      } catch {
        setError("The result is uncertain. Retry the preserved submission; do not create a second turn-in.");
      }
    });
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preserved.current) return submit(preserved.current);
    const data = new FormData(event.currentTarget);
    const request: Record<string, unknown> = { campaign_id: campaignId, kind, idempotency_key: crypto.randomUUID(), reason: data.get("reason"), reference: data.get("reference") };
    for (const field of ["seller_id", "receipt_id", "sale_id", "target_sale_id", "exception_id", "payment_method"]) if (data.get(field)) request[field] = data.get(field);
    if (needsAmount) {
      const text = String(data.get("amount") ?? "").trim();
      const cents = dollarsToCents(text.startsWith("-") ? text.slice(1) : text);
      if (cents === null) { setError("Use dollars and at most two decimal places."); return; }
      request.amount_cents = text.startsWith("-") ? -cents : cents;
    }
    submit(request);
  }
  return <form ref={form} onSubmit={onSubmit} className="space-y-4" data-testid="money-operation-form">
    <fieldset disabled={pending || submission !== null} className="grid gap-4 md:grid-cols-2">
      <label className="text-sm">Money operation<select aria-label="Money operation" value={kind} onChange={(e) => { setKind(e.target.value as MoneyKind); setError(""); }} className={control}>{allowed.map((k) => <option key={k} value={k}>{moneyLabels[k]}</option>)}</select></label>
      {kind === "receipt" && <><label className="text-sm">Seller / family account<select name="seller_id" aria-label="Seller / family account" required className={control} defaultValue=""><option value="" disabled>Select seller</option>{money.sellers.map((s) => <option key={s.id} value={s.id}>{s.name} · {formatMoney(s.outstanding_cents)} outstanding · {s.id.slice(0, 8)}</option>)}</select></label>
        <label className="text-sm">Received as<select aria-label="Received as" name="payment_method" className={control}><option value="cash">Cash</option><option value="check">Check (uncleared)</option></select></label></>}
      {needsReceipt && <label className="text-sm">Original receipt<select name="receipt_id" aria-label="Original receipt" required={kind !== "exception_resolved"} className={control} defaultValue=""><option value="" disabled={kind !== "exception_resolved"}>{kind === "exception_resolved" ? "No check receipt / use other exception" : "Select receipt"}</option>{receipts.map((r) => <option key={r.id} value={r.id}>{r.payment_method} · {formatMoney(r.amount_cents)} · {r.id.slice(0, 8)}{r.reference ? ` · ${r.reference}` : ""}</option>)}</select></label>}
      {kind === "exception_resolved" && <label className="text-sm">Other exception (instead of a check receipt)<select name="exception_id" aria-label="Other exception" className={control} defaultValue=""><option value="">None / use check receipt</option>{money.events.filter((e) => e.kind === "exception_opened").map((e) => <option key={e.id} value={e.id}>{e.reason} · {e.id.slice(0, 8)}</option>)}</select></label>}
      {needsSale && <label className="text-sm">Source sale<select name="sale_id" aria-label="Source sale" required className={control} defaultValue=""><option value="" disabled>Select sale</option>{sales.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
      {kind === "credit" && <label className="text-sm">Replacement / destination sale<select name="target_sale_id" aria-label="Replacement / destination sale" required className={control} defaultValue=""><option value="" disabled>Select destination</option>{sales.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
      {needsAmount && <label className="text-sm">Amount ($)<input name="amount" aria-label="Amount ($)" inputMode="decimal" required className={control} placeholder={kind === "adjustment" ? "Positive relief; negative to undo" : "0.00"} /></label>}
      <label className="text-sm">Check / batch reference<input name="reference" aria-label="Check / batch reference" maxLength={200} className={control} /></label>
      <label className="text-sm md:col-span-2">Reason / notes<textarea name="reason" aria-label="Reason / notes" minLength={3} maxLength={500} required className={control} /></label>
    </fieldset>
    <p className="text-xs text-muted">Turn-ins apply to the oldest unpaid sales first and can be partial. Corrections move existing money with a credit transfer, refund, or approved balance adjustment—they never create a second receipt. Check outcomes and deposits are recorded separately.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="break-words text-sm text-emerald-700">{message}</p>}
    <Button type="submit" loading={pending}>{submission ? "Retry preserved submission" : moneyLabels[kind]}</Button>
  </form>;
}
