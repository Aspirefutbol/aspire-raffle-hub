"use client";

import { useState, type FormEvent } from "react";
import { confirmCampaignCompliance } from "@/lib/campaigns/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

export function ComplianceConfirmationButton({ orgSlug, campaignId, disabled = false }: {
  orgSlug: string;
  campaignId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => confirmCampaignCompliance(orgSlug, {
      campaign_id: campaignId,
      reason: form.get("reason"),
    }), { onSuccess: () => setOpen(false) });
  }

  return <>
    <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>Confirm Texas compliance</Button>
    <Sheet
      open={open}
      onClose={() => !pending && setOpen(false)}
      title="Confirm Texas compliance"
      description="Director/operator attestation for the current campaign disclosures. The product records this review; it does not independently determine legal eligibility."
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="campaign-compliance-confirmation" loading={pending}>Record attestation</Button></div>}
    >
      <form id="campaign-compliance-confirmation" onSubmit={submit} className="space-y-4">
        <div className="space-y-3 rounded-control border border-line bg-canvas p-3">
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <Checkbox name="entity_confirmed" required />
            <span>I confirm the legal raffle operator/501(c) eligibility and name-change evidence have been reviewed and retained.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <Checkbox name="raffle_count_confirmed" required />
            <span>I confirm the calendar-year raffle count and approved charitable use of proceeds have been reviewed.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <Checkbox name="prize_sales_confirmed" required />
            <span>I confirm the prize description/source/possession and the offline/direct sales and promotion plan have been reviewed, including seller-compensation restrictions.</span>
          </label>
        </div>
        <Field label="Attestation reason / evidence note" htmlFor="campaign-compliance-reason" required hint="3–500 characters. Retained in the audit history.">
          <Textarea id="campaign-compliance-reason" name="reason" required minLength={3} maxLength={500} autoFocus />
        </Field>
      </form>
    </Sheet>
  </>;
}
