"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { transitionCampaign } from "@/lib/campaigns/actions";
import { certifyDrawing, freezeDrawing, recordExternalDrawingResult, reopenDrawing } from "@/lib/drawing/actions";
import { externalDrawingResultSchema, type ExternalDrawingResultPayload } from "@/lib/drawing/schemas";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

type Operation = "freeze" | "reopen" | "certify" | "drawn";
const labels: Record<Operation, string> = {
  freeze: "Freeze drawing entries", reopen: "Reopen drawing", certify: "Certify drawing", drawn: "Mark drawn",
};
const descriptions: Record<Operation, string> = {
  freeze: "Retain an immutable population for the approved physical or external drawing.",
  reopen: "Director approval releases the frozen population for authorized pre-drawing voids. Sales remain closed.",
  certify: "Director certification seals the recorded external results and retains their hashes.",
  drawn: "Complete the campaign drawing after certification. Financial reconciliation remains separate.",
};

export function DrawingOperationButton({ orgSlug, campaignId, snapshotId, operation, disabled }: {
  orgSlug: string; campaignId: string; snapshotId?: string; operation: Operation; disabled?: boolean;
}) {
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();
  const label = labels[operation];
  const formId = `drawing-${operation}-${snapshotId ?? campaignId}`;
  const reasonId = `${formId}-reason`;
  const close = () => { if (!pending) setRequestKey(null); };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestKey) return;
    const form = new FormData(event.currentTarget);
    const input = { campaign_id: campaignId, snapshot_id: snapshotId, idempotency_key: requestKey, reason: form.get("reason") };
    setErrors({});
    const action = () => {
      if (operation === "freeze") return freezeDrawing(orgSlug, { ...input, prize_readiness_confirmed: form.get("prize_readiness_confirmed") === "on" });
      if (operation === "reopen") return reopenDrawing(orgSlug, input);
      if (operation === "certify") return certifyDrawing(orgSlug, input);
      return transitionCampaign(orgSlug, { campaign_id: campaignId, to: "DRAWN", reason: input.reason });
    };
    run(action, { onSuccess: () => setRequestKey(null), onError: (fields) => setErrors(fields ?? {}) });
  }

  return <>
    <Button variant={operation === "reopen" ? "danger" : operation === "certify" ? "secondary" : "primary"} disabled={disabled} onClick={() => { setErrors({}); setRequestKey(crypto.randomUUID()); }}>{label}</Button>
    <Sheet open={requestKey !== null} onClose={close} title={label} description={descriptions[operation]} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" form={formId} loading={pending}>{label}</Button></div>}>
      <form id={formId} onSubmit={submit} className="space-y-4">
        {operation === "freeze" && <>
          <p className="text-sm text-ink-soft">Review the locked raffle rules, prizes, eligible count, and drawing arrangements before freezing. Retain the snapshot hash separately from the exported files.</p>
          <div>
            <label className="flex items-start gap-2 text-sm text-ink-soft" htmlFor={`${formId}-prizes`}><Checkbox id={`${formId}-prizes`} name="prize_readiness_confirmed" required aria-invalid={Boolean(errors.prize_readiness_confirmed)} aria-describedby={errors.prize_readiness_confirmed ? `${formId}-prizes-error` : undefined} /><span>I confirm approved prizes and drawing readiness for the physical or external drawing.</span></label>
            {errors.prize_readiness_confirmed && <p id={`${formId}-prizes-error`} role="alert" className="mt-1 text-xs text-red-600">{errors.prize_readiness_confirmed}</p>}
          </div>
        </>}
        {operation === "reopen" && <p className="text-sm text-ink-soft">The original snapshot and all exports remain retained. Freeze and export a new version after the approved voids. New sales and late replacement issuance remain blocked. Reopening is unavailable once an external result is recorded.</p>}
        {operation === "certify" && <p className="text-sm text-ink-soft">Verify the retained manifest, winning ticket numbers, actual drawing time, operator, witnesses, and evidence before certification. This action permanently seals the current result set.</p>}
        <Field label="Reason" htmlFor={reasonId} required error={errors.reason} hint="At least 3 characters. Retained in drawing and activity history."><Textarea id={reasonId} name="reason" required minLength={3} maxLength={500} autoFocus aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? `${reasonId}-error` : undefined} /></Field>
      </form>
    </Sheet>
  </>;
}

function localDrawingTimestamp(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function ExternalResultButton({ orgSlug, campaignId, snapshotId, freezeTime, disclosedDrawTime, disabled }: {
  orgSlug: string; campaignId: string; snapshotId: string; freezeTime: string; disclosedDrawTime: string | null; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ExternalDrawingResultPayload | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const formId = `drawing-result-${snapshotId}`;
  const fieldId = (field: string) => `${formId}-${field}`;
  const accessibility = (field: string) => ({ "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `${fieldId(field)}-error` : undefined });
  const close = () => { if (!pending) setOpen(false); };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const actual = new Date(String(form.get("drawn_at")));
    const minimum = Math.max(new Date(freezeTime).getTime(), disclosedDrawTime ? new Date(disclosedDrawTime).getTime() : 0);
    if (!payload && (!Number.isFinite(actual.getTime()) || actual.getTime() < minimum || actual.getTime() > Date.now())) {
      setErrors({ drawn_at: "Use an actual drawing time after freeze and the disclosed drawing date, and not in the future." });
      return;
    }
    const parsed = externalDrawingResultSchema.safeParse(payload ?? {
      campaign_id: campaignId, snapshot_id: snapshotId, idempotency_key: crypto.randomUUID(),
      drawn_at: Number.isFinite(actual.getTime()) ? actual.toISOString() : "", location: form.get("location"), operator: form.get("operator"),
      witnesses: String(form.get("witnesses")).split(/\r?\n/).map((name) => name.trim()).filter(Boolean),
      method: form.get("method"), winning_ticket_number: form.get("winning_ticket_number"),
      result: form.get("result"), evidence_ref: form.get("evidence_ref"), reason: form.get("reason"),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      setError("Check the highlighted drawing details.");
      return;
    }
    setPayload(parsed.data);
    setErrors({});
    setError(null);
    setCanEdit(false);
    startTransition(async () => {
      try {
        const result = await recordExternalDrawingResult(orgSlug, parsed.data);
        if (!result.ok) {
          setError(result.error);
          setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([field, message]) => [field.split(".")[0], message])));
          setCanEdit(result.canEdit === true || Boolean(result.fieldErrors));
          return;
        }
        setOpen(false);
        setPayload(null);
        toast.success(result.message ?? "External drawing result recorded");
      } catch {
        setError("The response could not be confirmed. Retry this same submission to check whether the external result was recorded.");
      }
    });
  }

  return <>
    <Button variant="secondary" disabled={disabled && !payload} onClick={() => setOpen(true)}>{payload ? "Resume external result" : "Record external result"}</Button>
    <Sheet open={open} onClose={close} title="Record external result" description="Record the observed physical or external drawing. The application does not select a winner." footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={close}>{payload ? "Close" : "Cancel"}</Button>{canEdit && <Button variant="secondary" disabled={pending} onClick={() => { setPayload(null); setCanEdit(false); setError(null); setErrors({}); }}>Edit details</Button>}<Button type="submit" form={formId} loading={pending}>{payload ? "Retry same external result" : "Record external result"}</Button></div>}>
      <form id={formId} onSubmit={submit} className="space-y-4">
        {payload && <p className="rounded-control border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{canEdit ? "This attempt was rejected. Edit the details or retry this same submission." : "This submission is saved for a safe retry. Its details stay locked until the result is confirmed, including after closing this sheet."}</p>}
        {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="text-sm text-ink-soft">Verify the winning number and evidence before recording. Results are immutable. Recording any result permanently blocks reopening this population.</p>
        <fieldset disabled={pending || payload !== null} className="space-y-4">
          <Field label="Drawing timestamp" htmlFor={fieldId("drawn_at")} required error={errors.drawn_at} hint="Enter the actual time in your browser's local timezone. It must follow freeze and the disclosed drawing date."><Input id={fieldId("drawn_at")} name="drawn_at" type="datetime-local" step="1" required autoFocus defaultValue={localDrawingTimestamp(payload?.drawn_at)} {...accessibility("drawn_at")} /></Field>
          <Field label="Location" htmlFor={fieldId("location")} required error={errors.location}><Input id={fieldId("location")} name="location" required minLength={3} maxLength={500} defaultValue={payload?.location ?? ""} {...accessibility("location")} /></Field>
          <Field label="Operator" htmlFor={fieldId("operator")} required error={errors.operator}><Input id={fieldId("operator")} name="operator" required minLength={3} maxLength={200} defaultValue={payload?.operator ?? ""} {...accessibility("operator")} /></Field>
          <Field label="Witnesses" htmlFor={fieldId("witnesses")} required error={errors.witnesses} hint="One full name per line; 1–20 witnesses, at least 3 characters per name."><Textarea id={fieldId("witnesses")} name="witnesses" required maxLength={4019} defaultValue={payload?.witnesses.join("\n") ?? ""} {...accessibility("witnesses")} /></Field>
          <Field label="Drawing method" htmlFor={fieldId("method")} required error={errors.method}><Select id={fieldId("method")} name="method" required defaultValue={payload?.method ?? "physical"} {...accessibility("method")}><option value="physical">Physical drawing</option><option value="external">External drawing</option></Select></Field>
          <Field label="Winning ticket number" htmlFor={fieldId("winning_ticket_number")} required error={errors.winning_ticket_number} hint="Enter the exact number observed in the current frozen population."><Input id={fieldId("winning_ticket_number")} name="winning_ticket_number" required maxLength={200} defaultValue={payload?.winning_ticket_number ?? ""} {...accessibility("winning_ticket_number")} /></Field>
          <Field label="Result / evidence" htmlFor={fieldId("result")} required error={errors.result} hint="Describe the observed result, prize, and supporting evidence."><Textarea id={fieldId("result")} name="result" required minLength={3} maxLength={2000} defaultValue={payload?.result ?? ""} {...accessibility("result")} /></Field>
          <Field label="Evidence reference" htmlFor={fieldId("evidence_ref")} error={errors.evidence_ref} hint="Optional reference to the approved private evidence record."><Input id={fieldId("evidence_ref")} name="evidence_ref" maxLength={1000} defaultValue={payload?.evidence_ref ?? ""} {...accessibility("evidence_ref")} /></Field>
          <Field label="Reason" htmlFor={fieldId("reason")} required error={errors.reason}><Textarea id={fieldId("reason")} name="reason" required minLength={3} maxLength={500} defaultValue={payload?.reason ?? ""} {...accessibility("reason")} /></Field>
        </fieldset>
      </form>
    </Sheet>
  </>;
}
