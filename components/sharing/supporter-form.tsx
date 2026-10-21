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
  if (done) return <div role="status" className="rounded-card border border-line p-4"><h2 className="font-semibold">Request submitted</h2><p>This is nonbinding and does not reserve or issue tickets. If your request can be accepted, your seller will follow up about offline payment and ticket details. Do not send payment through this page.</p></div>;
  return <form onSubmit={submit} className="space-y-4">
    <h2 className="text-xl font-semibold">Let your seller know you’re interested</h2>
    <fieldset disabled={pending || locked} className="space-y-4">
      <Field label="Your name" htmlFor="name"><Input id="name" name="name" required maxLength={200} /></Field>
      <Field label="Preferred contact" htmlFor="contact"><Select id="contact" name="contact"><option value="email">Email</option><option value="phone">Phone</option></Select></Field>
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" maxLength={254}/></Field>
      <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" maxLength={50}/></Field>
      <Field label="Requested quantity" htmlFor="quantity"><Input id="quantity" name="quantity" type="number" min={1} max={100} defaultValue={1} required /></Field>
      <Field label="Note (optional)" htmlFor="note"><Textarea id="note" name="note" maxLength={1000}/></Field>
      <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label></div>
    </fieldset>
    <p className="text-sm">This request does not reserve or issue raffle tickets. Your seller will follow up to confirm payment and provide ticket information.</p>
    <p className="text-xs text-muted">Your contact details are shared privately with the authorized family seller and organization support administrators for follow-up.</p>
    {error && <p role="alert">{error}</p>}
    <Button type="submit" loading={pending}>{locked ? "Retry same request" : "Send nonbinding request"}</Button>
  </form>;
}
