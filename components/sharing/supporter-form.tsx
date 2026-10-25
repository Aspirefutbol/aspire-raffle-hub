"use client";
import { useRef, useState, type FormEvent } from "react";
import { submissionSchema } from "@/lib/sharing/schemas";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/form-controls";
export function SupporterForm({ token }: { token: string }) {
  const saved = useRef<ReturnType<typeof submissionSchema.parse> | null>(null);
  const [locked, setLocked] = useState(false);
  const [pending, setPending] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = submissionSchema.safeParse(saved.current ?? { key: crypto.randomUUID(), request: { name: form.get("name"), email: form.get("email"), phone: form.get("phone"), contact: form.get("contact"), quantity: Number(form.get("quantity")), note: form.get("note"), website: form.get("website") } });
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
    <h2 className="text-xl font-semibold text-emerald-900">Your request was sent</h2>
    <p className="text-sm text-emerald-950">Your request is in the family seller’s private inbox. The seller will contact you about availability, approved cash or check payment, and ticket details.</p>
    <p className="rounded-control bg-white p-3 text-sm text-ink"><strong>No tickets or payment yet.</strong> This request does not reserve or issue tickets. No payment was collected.</p>
    <p className="text-sm text-emerald-950">You can close this page. Please do not send payment through this website.</p>
  </div>;
  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-1"><h2 className="text-xl font-semibold">Request raffle tickets</h2><p className="text-sm text-ink-soft">Tell the family seller how many tickets you’re interested in. They’ll follow up with you before any payment.</p></div>
    <fieldset disabled={pending || locked} className="space-y-4">
      <Field label="Your name" htmlFor="name"><Input id="name" name="name" required maxLength={200} /></Field>
      <Field label="Preferred contact" htmlFor="contact"><Select id="contact" name="contact"><option value="email">Email</option><option value="phone">Phone</option></Select></Field>
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" maxLength={254}/></Field>
      <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" maxLength={50}/></Field>
      <Field label="How many tickets?" htmlFor="quantity"><Input id="quantity" name="quantity" type="number" min={1} max={100} defaultValue={1} required /></Field>
      <Field label="Note (optional)" htmlFor="note"><Textarea id="note" name="note" maxLength={1000}/></Field>
      <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label></div>
    </fieldset>
    <p className="rounded-control border border-line bg-canvas p-3 text-sm text-ink-soft"><strong className="text-ink">This is a request, not a purchase.</strong> Sending this form does not reserve tickets, collect payment, or enter you in the drawing. The seller will confirm availability and arrange approved cash or check payment offline.</p>
    <p className="text-xs text-muted">Your contact details are shared privately with the authorized family seller and organization support administrators for follow-up.</p>
    {error && <p role="alert">{error}</p>}
    <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending}>{locked ? "Retry same request" : "Send request"}</Button>
  </form>;
}
