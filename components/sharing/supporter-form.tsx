"use client";
import { useRef, useState, type FormEvent } from "react";
import { submissionSchema } from "@/lib/sharing/schemas";
import { campaignTicketQuote, quoteBreakdownText } from "@/lib/fundraising/campaign-pricing";
import { formatMoney } from "@/lib/fundraising/money";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/form-controls";
export function SupporterForm({ token, ticketPriceCents, ticketPackages = [] }: { token: string; ticketPriceCents: number; ticketPackages?: unknown }) {
  const saved = useRef<ReturnType<typeof submissionSchema.parse> | null>(null);
  const [locked, setLocked] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [contactMethod, setContactMethod] = useState<"email" | "phone">("email");
  const [pending, setPending] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  const quote = campaignTicketQuote(Number(quantity), ticketPriceCents, ticketPackages);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = submissionSchema.safeParse(saved.current ?? { key: crypto.randomUUID(), request: { name: form.get("name"), email: form.get("email"), phone: form.get("phone"), contact: form.get("contact"), quantity: Number(quantity), note: form.get("note"), website: form.get("website") } });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Check your details."); return; }
    saved.current = parsed.data; setLocked(true); setPending(true); setError("");
    try {
      const response = await fetch(`/s/${token}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (!response.ok) throw new Error();
      setDone(true);
    } catch { setError("We could not confirm the response. Retry the same request safely."); }
    finally { setPending(false); }
  }
  if (done) return <div role="status" className="space-y-3 rounded-card border border-emerald-200 bg-emerald-50 p-5">
    <p className="text-sm font-semibold text-emerald-900">✓ Request sent!</p>
    <h2 className="text-2xl font-bold text-emerald-950">{quote ? `${quote.quantity} ticket${quote.quantity === 1 ? "" : "s"} · ${formatMoney(quote.totalCents)}` : "Your ticket request"}</h2>
    <p className="text-sm text-emerald-950">The Aspire family will confirm availability and contact you about approved cash or check payment. Your tickets will be issued after payment is received and the sale is recorded.</p>
    <p className="rounded-control bg-white p-3 text-sm text-ink"><strong>No payment was collected on this page.</strong> This request is not a raffle entry; tickets have not been issued yet.</p>
    <p className="text-sm text-emerald-950">You’re all set — you can close this page.</p>
  </div>;
  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-1"><h2 className="text-xl font-semibold">Request raffle tickets</h2><p className="text-sm text-ink-soft">Choose how many tickets you’d like. The Aspire family will contact you to complete payment and provide your ticket numbers.</p></div>
    <fieldset disabled={pending || locked} className="space-y-4">
      <Field label="How many tickets?" htmlFor="quantity"><Input id="quantity" name="quantity" type="number" min={1} max={100} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></Field>
      {quote && <div className="rounded-control border border-brand-100 bg-brand-50/60 p-3" role="status" aria-label="Requested ticket total"><p className="text-lg font-semibold text-ink">{quote.quantity} ticket{quote.quantity === 1 ? "" : "s"} · {formatMoney(quote.totalCents)}</p><p className="mt-1 text-sm text-ink-soft">{quoteBreakdownText(quote)}</p></div>}
      <Field label="Your name" htmlFor="name"><Input id="name" name="name" autoComplete="name" required maxLength={200} /></Field>
      <Field label="Preferred contact" htmlFor="contact"><Select id="contact" name="contact" value={contactMethod} onChange={(event) => setContactMethod(event.target.value === "phone" ? "phone" : "email")}><option value="email">Email</option><option value="phone">Phone</option></Select></Field>
      {contactMethod === "email" ? <Field label="Email" htmlFor="email" required><Input id="email" name="email" type="email" autoComplete="email" required maxLength={254}/></Field> : <input type="hidden" name="email" value="" />}
      {contactMethod === "phone" ? <Field label="Phone" htmlFor="phone" required><Input id="phone" name="phone" type="tel" autoComplete="tel" required maxLength={50}/></Field> : <input type="hidden" name="phone" value="" />}
      <details className="rounded-control border border-line bg-surface px-3 py-1">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-ink">Add a note (optional)</summary>
        <div className="pb-3"><Field label="Note" htmlFor="note"><Textarea id="note" name="note" maxLength={1000}/></Field></div>
      </details>
      <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label></div>
    </fieldset>
    <p className="rounded-control border border-line bg-canvas p-3 text-sm text-ink-soft"><strong className="text-ink">No payment is collected here.</strong> This request does not reserve or issue tickets or enter you in the drawing. The Aspire family will confirm availability and arrange approved cash or check payment offline.</p>
    <p className="text-xs text-muted">Your contact details are shared privately with the authorized family seller and organization support administrators for follow-up.</p>
    {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending}>{locked ? "Retry same request" : "Request tickets"}</Button>
  </form>;
}
