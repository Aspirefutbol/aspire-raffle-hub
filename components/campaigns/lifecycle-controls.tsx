"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { transitionCampaign } from "@/lib/campaigns/actions";
import { type CampaignStatus, transitionNeedsReason, transitionPermission } from "@/lib/campaigns/lifecycle";
import { prepareCampaignInventory } from "@/lib/fundraising/actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

const NEXT: Partial<Record<CampaignStatus, Array<{ to: CampaignStatus; label: string }>>> = {
  DRAFT: [{ to: "READY", label: "Mark ready" }], READY: [{ to: "DRAFT", label: "Return to draft" }, { to: "ACTIVE", label: "Activate campaign" }], ACTIVE: [{ to: "CLOSED", label: "Close sales" }],
};

export function LifecycleControls({ orgSlug, campaignId, status, canManage, canActivate, missingReadiness }: { orgSlug: string; campaignId: string; status: CampaignStatus; canManage: boolean; canActivate: boolean; missingReadiness: boolean }) {
  const [transition, setTransition] = useState<{ to: CampaignStatus; label: string } | null>(null);
  const { run, pending } = useActionRunner();
  const choices = (NEXT[status] ?? []).filter((choice) => transitionPermission(status, choice.to) === "campaigns.manage" ? canManage : canActivate);
  return <>
    {choices.map((choice) => <Button key={choice.to} variant={choice.to === "DRAFT" || choice.to === "CLOSED" ? "secondary" : "primary"} loading={pending && !transition} disabled={choice.to === "ACTIVE" && missingReadiness} onClick={() => transitionNeedsReason(status, choice.to) ? setTransition(choice) : run(() => transitionCampaign(orgSlug, { campaign_id: campaignId, to: choice.to }))}>{choice.label}</Button>)}
    {canManage && status === "ACTIVE" && <Button variant="secondary" loading={pending && !transition} onClick={() => run(() => prepareCampaignInventory(orgSlug, { campaign_id: campaignId }))}>Prepare inventory</Button>}
    <Sheet open={transition !== null} onClose={() => !pending && setTransition(null)} title={transition?.label ?? "Change campaign status"} description="The status change and reason are recorded in campaign and activity history." footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={() => setTransition(null)}>Cancel</Button><Button type="submit" form="campaign-transition" loading={pending}>{transition?.label}</Button></div>}>
      <form id="campaign-transition" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); if (transition) run(() => transitionCampaign(orgSlug, { campaign_id: campaignId, to: transition.to, reason: form.get("reason") }), { onSuccess: () => setTransition(null) }); }}>
        <Field label="Reason" htmlFor="campaign-transition-reason" required hint="At least 3 characters. Recorded in the activity log."><Textarea id="campaign-transition-reason" name="reason" required minLength={3} maxLength={500} autoFocus /></Field>
        {transition?.to === "ACTIVE" && <p className="mt-4 text-sm text-ink-soft">Activation freezes the ticket price, prefix, schedule, legal disclosures, and raffle rules. Prepare participant inventory afterward to enable sales.</p>}
        {transition?.to === "CLOSED" && <p className="mt-4 text-sm text-ink-soft">Closing immediately stops new ticket sales. Drawing and reconciliation are separate workflows.</p>}
      </form>
    </Sheet>
  </>;
}
