"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { createCampaignDraft, updateCampaign } from "@/lib/campaigns/actions";
import { editableFieldsFilter, isCampaignStatus } from "@/lib/campaigns/lifecycle";
import { createCampaignSchema } from "@/lib/campaigns/schemas";
import type { Tables } from "@/lib/database/types.gen";
import { centsToDollars, dollarsToCents } from "@/lib/fundraising/money";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

type Campaign = Tables<"campaigns">;
type Named = { id: string; name: string };

function localTimestamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function CampaignSheetButton({ orgSlug, campaign, seasons }: { orgSlug: string; campaign?: Campaign; seasons: Named[] }) {
  const [open, setOpen] = useState(false);
  if (campaign && !["DRAFT", "READY", "ACTIVE"].includes(campaign.status)) return null;
  return <><Button variant={campaign ? "secondary" : "primary"} onClick={() => setOpen(true)}>{campaign ? "Edit campaign" : "New campaign"}</Button>{open && <CampaignSheet orgSlug={orgSlug} campaign={campaign} seasons={seasons} onClose={() => setOpen(false)} />}</>;
}

function CampaignSheet({ orgSlug, campaign, seasons, onClose }: { orgSlug: string; campaign?: Campaign; seasons: Named[]; onClose: () => void }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editable = campaign && isCampaignStatus(campaign.status) ? editableFieldsFilter(campaign.status) : null;
  const locked = (key: string) => Boolean(campaign && !editable?.(key));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? (campaign && locked(key) ? campaign[key as keyof Campaign] : "") ?? "").trim();
    const money = (key: string) => campaign && locked(key) ? campaign[key as "ticket_price_cents"] : text(key) ? dollarsToCents(text(key)) : null;
    const timestamp = (key: string) => text(key) ? new Date(text(key)).toISOString() : null;
    const moneyFields = ["ticket_price_cents", "goal_amount_cents", "player_goal_default_cents", "team_goal_default_cents"];
    const invalidMoney = moneyFields.filter((key) => text(key) && money(key) === null);
    if (invalidMoney.length) { setErrors(Object.fromEntries(invalidMoney.map((key) => [key, "Enter dollars with up to two decimal places."]))); return; }
    const parsed = createCampaignSchema.safeParse({
      name: text("name"), description: text("description"), season_id: text("season_id") || null,
      ticket_price_cents: money("ticket_price_cents"), goal_amount_cents: money("goal_amount_cents"),
      player_goal_default_cents: money("player_goal_default_cents"), team_goal_default_cents: money("team_goal_default_cents"),
      default_allocation: text("default_allocation") ? Number(text("default_allocation")) : null,
      ticket_prefix: text("ticket_prefix") || null,
      starts_at: timestamp("starts_at"), sales_close_at: timestamp("sales_close_at"), draw_at: timestamp("draw_at"),
      support_email: text("support_email"), support_phone: text("support_phone"), rules_text: text("rules_text"),
    });
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]))); return; }
    setErrors({});
    const onError = (fields?: Record<string, string>) => fields && setErrors(fields);
    if (campaign) {
      const changes = Object.fromEntries(Object.entries(parsed.data).filter(([key, value]) => {
        if (!editable?.(key) || !form.has(key)) return false;
        // datetime-local shows minutes. Preserve stored seconds when the user
        // changes another field rather than rewriting an untouched schedule.
        if (["starts_at", "sales_close_at", "draw_at"].includes(key)) {
          return text(key) !== localTimestamp(campaign[key as "starts_at"]);
        }
        return value !== campaign[key as keyof Campaign];
      }));
      run(() => updateCampaign(orgSlug, { ...changes, campaign_id: campaign.id }), { onSuccess: onClose, onError });
    } else {
      run(() => createCampaignDraft(orgSlug, parsed.data), { onSuccess: (data) => { onClose(); router.push(`/o/${orgSlug}/campaigns/${data.id}`); }, onError });
    }
  }

  return <Sheet open onClose={() => !pending && onClose()} title={campaign ? "Edit raffle campaign" : "New raffle campaign"} description="Configure the raffle before a director activates ticket sales." wide footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" form="campaign-form" loading={pending}>{campaign ? "Save changes" : "Create draft"}</Button></div>}>
    <form id="campaign-form" onSubmit={submit} className="space-y-6">
      {campaign?.status === "ACTIVE" && <p className="rounded-control border border-line bg-canvas p-3 text-sm text-ink-soft">Ticket price, prefix, name, season, sales start, drawing date, and raffle rules are locked after activation. Goals, description, sales close, inventory defaults, and support contact remain editable.</p>}
      <fieldset disabled={pending} className="space-y-4">
        <Field label="Campaign name" htmlFor="campaign-name" required error={errors.name}><Input id="campaign-name" name="name" disabled={locked("name")} required maxLength={120} defaultValue={campaign?.name ?? ""} autoFocus /></Field>
        <Field label="Description" htmlFor="campaign-description" error={errors.description}><Textarea id="campaign-description" name="description" maxLength={2000} defaultValue={campaign?.description ?? ""} /></Field>
        <Field label="Season" htmlFor="campaign-season"><Select id="campaign-season" name="season_id" disabled={locked("season_id")} defaultValue={campaign?.season_id ?? ""}><option value="">No season</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</Select></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ["ticket_price_cents", "Ticket price ($)"], ["goal_amount_cents", "Campaign goal ($)"],
            ["player_goal_default_cents", "Default player goal ($)"], ["team_goal_default_cents", "Default team goal ($)"],
          ] as const).map(([key, label]) => <Field key={key} label={label} htmlFor={`campaign-${key}`} error={errors[key]}><Input id={`campaign-${key}`} name={key} disabled={locked(key)} inputMode="decimal" placeholder="0.00" defaultValue={centsToDollars(campaign?.[key])} /></Field>)}
          <Field label="Tickets per player" htmlFor="campaign-allocation" hint="Default assigned inventory; prepared after activation." error={errors.default_allocation}><Input id="campaign-allocation" name="default_allocation" type="number" min={0} max={10000} defaultValue={campaign?.default_allocation ?? 20} /></Field>
          <Field label="Ticket number prefix" htmlFor="campaign-prefix" hint="2–8 letters or digits. Locked at activation." error={errors.ticket_prefix}><Input id="campaign-prefix" name="ticket_prefix" disabled={locked("ticket_prefix")} maxLength={8} placeholder="AFC" defaultValue={campaign?.ticket_prefix ?? ""} /></Field>
        </div>
      </fieldset>
      <fieldset disabled={pending} className="space-y-4 border-t border-line pt-5"><legend className="pt-5 text-sm font-semibold text-ink">Schedule & disclosures</legend>
        <p className="text-xs text-muted">Dates use your device’s time zone. The legal operator and address come from organization settings at activation.</p>
        <div className="grid gap-4 sm:grid-cols-2">{([ ["starts_at", "Sales start"], ["sales_close_at", "Sales close"], ["draw_at", "Drawing date"] ] as const).map(([key, label]) => <Field key={key} label={label} htmlFor={`campaign-${key}`} error={errors[key]}><Input id={`campaign-${key}`} name={key} disabled={locked(key)} type="datetime-local" defaultValue={localTimestamp(campaign?.[key] ?? null)} /></Field>)}</div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Support email" htmlFor="campaign-support-email" hint="Optional if set in organization settings." error={errors.support_email}><Input id="campaign-support-email" name="support_email" type="email" defaultValue={campaign?.support_email ?? ""} /></Field><Field label="Support phone" htmlFor="campaign-support-phone" error={errors.support_phone}><Input id="campaign-support-phone" name="support_phone" type="tel" defaultValue={campaign?.support_phone ?? ""} /></Field></div>
        <Field label="Raffle rules" htmlFor="campaign-rules" error={errors.rules_text}><Textarea id="campaign-rules" name="rules_text" disabled={locked("rules_text")} maxLength={20000} rows={5} defaultValue={campaign?.rules_text ?? ""} /></Field>
        <p className="rounded-control border border-line bg-canvas p-3 text-sm text-ink-soft">Offline cash/check sales only. Jurisdiction requirements and activation checks remain enforced.</p>
      </fieldset>
    </form>
  </Sheet>;
}
