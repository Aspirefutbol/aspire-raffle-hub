"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { allocateCampaignTickets, generateCampaignTickets, setCampaignParticipantGoal, setCampaignTeamGoal, withdrawCampaignParticipant } from "@/lib/fundraising/actions";
import { centsToDollars, dollarsToCents } from "@/lib/fundraising/money";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

export function GoalButton({ orgSlug, campaignId, subjectId, subjectName, goalCents, team = false }: { orgSlug: string; campaignId: string; subjectId: string; subjectName: string; goalCents: number | null; team?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useActionRunner();
  return <><Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Set goal for ${subjectName}`}>Set goal</Button><Sheet open={open} onClose={() => !pending && setOpen(false)} title={team ? "Set team goal" : "Set player goal"} description={subjectName} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form={`goal-${subjectId}`} loading={pending}>Save goal</Button></div>}><form id={`goal-${subjectId}`} onSubmit={(event) => { event.preventDefault(); const input = String(new FormData(event.currentTarget).get("goal") ?? "").trim(); const cents = input ? dollarsToCents(input) : null; if (input && cents === null) { setError("Enter dollars with up to two decimal places."); return; } setError(null); const common = { goal_amount_cents: cents }; if (team) run(() => setCampaignTeamGoal(orgSlug, { ...common, campaign_id: campaignId, team_id: subjectId }), { onSuccess: () => setOpen(false) }); else run(() => setCampaignParticipantGoal(orgSlug, { ...common, participant_id: subjectId }), { onSuccess: () => setOpen(false) }); }}><Field label="Goal ($)" htmlFor={`goal-input-${subjectId}`} error={error ?? undefined} hint="Blank uses the campaign default; zero clears the goal."><Input id={`goal-input-${subjectId}`} name="goal" inputMode="decimal" defaultValue={centsToDollars(goalCents)} autoFocus /></Field></form></Sheet></>;
}

export function WithdrawButton({ orgSlug, participantId, playerName }: { orgSlug: string; participantId: string; playerName: string }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();
  return <><Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Withdraw ${playerName}`}>Withdraw</Button><Sheet open={open} onClose={() => !pending && setOpen(false)} title="Withdraw player" description={playerName} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" type="submit" form={`withdraw-${participantId}`} loading={pending}>Withdraw player</Button></div>}><form id={`withdraw-${participantId}`} className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => withdrawCampaignParticipant(orgSlug, { participant_id: participantId, reason: new FormData(event.currentTarget).get("reason") }), { onSuccess: () => setOpen(false) }); }}><p className="text-sm text-ink-soft">This stops further sales for this player and preserves existing tickets, sales, and activity history.</p><Field label="Reason" htmlFor={`withdraw-reason-${participantId}`} required><Textarea id={`withdraw-reason-${participantId}`} name="reason" minLength={3} maxLength={500} required autoFocus /></Field></form></Sheet></>;
}

export function InventoryButton({ orgSlug, campaignId, participantId, playerName }: { orgSlug: string; campaignId: string; participantId?: string; playerName?: string }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();
  const assigning = Boolean(participantId);
  const formId = `inventory-${participantId ?? campaignId}`;
  return <><Button variant={assigning ? "ghost" : "secondary"} size={assigning ? "sm" : "md"} onClick={() => setOpen(true)}>{assigning ? "Assign tickets" : "Generate extra tickets"}</Button><Sheet open={open} onClose={() => !pending && setOpen(false)} title={assigning ? "Assign tickets" : "Generate extra tickets"} description={playerName} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form={formId} loading={pending}>{assigning ? "Assign tickets" : "Generate tickets"}</Button></div>}><form id={formId} className="space-y-4" onSubmit={(event) => { event.preventDefault(); const quantity = Number(new FormData(event.currentTarget).get("quantity")); if (participantId) run(() => allocateCampaignTickets(orgSlug, { campaign_id: campaignId, participant_id: participantId, quantity }), { onSuccess: () => setOpen(false) }); else run(() => generateCampaignTickets(orgSlug, { campaign_id: campaignId, quantity }), { onSuccess: () => setOpen(false) }); }}><p className="text-sm text-ink-soft">{assigning ? "Assign unused tickets from the campaign pool to this player. Generate extra tickets first if the pool is empty." : "Create additional unique ticket numbers in the campaign pool, then assign them to a participant. Previously issued or voided numbers are never reused."}</p><Field label="Number of tickets" htmlFor={`${formId}-quantity`} required><Input id={`${formId}-quantity`} name="quantity" type="number" min={1} max={10000} defaultValue={20} required autoFocus /></Field></form></Sheet></>;
}
