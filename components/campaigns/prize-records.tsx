"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { archiveCampaignPrize, upsertCampaignPrize } from "@/lib/campaigns/actions";
import { centsToDollars, dollarsToCents, formatMoney } from "@/lib/fundraising/money";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

export type CampaignPrizeRecord = {
  id: string;
  name: string;
  description: string;
  fair_value_cents: number;
  source: string;
  possession_basis: string;
  evidence_ref: string;
  archived_at: string | null;
};

function PrizeEditorButton({
  orgSlug,
  campaignId,
  prize,
}: {
  orgSlug: string;
  campaignId: string;
  prize?: CampaignPrizeRecord;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();
  const formId = `prize-${prize?.id ?? "new"}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const source = String(form.get("source") ?? "");
    const fairValue = dollarsToCents(String(form.get("fair_value") ?? ""));

    if (fairValue === null || fairValue < 1) {
      setErrors({ fair_value_cents: "Enter a positive dollar amount with up to two decimal places." });
      return;
    }
    if (source === "PURCHASED" && fairValue > 7_500_000) {
      setErrors({ fair_value_cents: "Purchased prizes in this controlled pilot cannot exceed $75,000." });
      return;
    }

    setErrors({});
    run(() => upsertCampaignPrize(orgSlug, {
      campaign_id: campaignId,
      prize_id: prize?.id ?? null,
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      fair_value_cents: fairValue,
      source,
      possession_basis: String(form.get("possession_basis") ?? ""),
      evidence_ref: String(form.get("evidence_ref") ?? ""),
    }), {
      onSuccess: () => setOpen(false),
      onError: (fieldErrors) => setErrors(fieldErrors ?? {}),
    });
  }

  return <>
    <Button variant={prize ? "ghost" : "primary"} size="sm" onClick={() => setOpen(true)}>
      {prize ? "Edit" : "Add prize"}
    </Button>
    <Sheet
      open={open}
      onClose={() => !pending && setOpen(false)}
      title={prize ? "Edit prize compliance record" : "Add prize compliance record"}
      description="Document the non-cash prize, value, source, and possession/bond evidence before director attestation."
      footer={<div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" form={formId} loading={pending}>{prize ? "Save prize" : "Add prize"}</Button>
      </div>}
    >
      <form id={formId} className="space-y-4" onSubmit={submit}>
        <Field label="Prize name" htmlFor={`${formId}-name`} required error={errors.name}>
          <Input id={`${formId}-name`} name="name" required maxLength={200} defaultValue={prize?.name ?? ""} autoFocus />
        </Field>
        <Field label="Prize description" htmlFor={`${formId}-description`} required error={errors.description}>
          <Textarea id={`${formId}-description`} name="description" required minLength={3} maxLength={2000} rows={3} defaultValue={prize?.description ?? ""} />
        </Field>
        <Field label="Estimated fair value ($)" htmlFor={`${formId}-value`} required error={errors.fair_value_cents}>
          <Input id={`${formId}-value`} name="fair_value" required inputMode="decimal" placeholder="0.00" defaultValue={centsToDollars(prize?.fair_value_cents)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prize source" htmlFor={`${formId}-source`} required error={errors.source}>
            <Select id={`${formId}-source`} name="source" required defaultValue={prize?.source ?? "DONATED"}>
              <option value="DONATED">Donated</option>
              <option value="PURCHASED">Purchased</option>
            </Select>
          </Field>
          <Field label="Possession / bond basis" htmlFor={`${formId}-possession`} required error={errors.possession_basis}>
            <Select id={`${formId}-possession`} name="possession_basis" required defaultValue={prize?.possession_basis ?? "OWNED_OR_POSSESSED"}>
              <option value="OWNED_OR_POSSESSED">Owned or possessed</option>
              <option value="BONDED">Bonded</option>
            </Select>
          </Field>
        </div>
        <Field
          label="Evidence reference"
          htmlFor={`${formId}-evidence`}
          required
          error={errors.evidence_ref}
          hint="Internal reference to donation/purchase, possession, or bond evidence. This reference is not printed on the public ticket artifact."
        >
          <Textarea id={`${formId}-evidence`} name="evidence_ref" required minLength={3} maxLength={1000} rows={3} defaultValue={prize?.evidence_ref ?? ""} />
        </Field>
        <p className="rounded-control border border-line bg-canvas p-3 text-xs text-muted">
          Controlled pilot scope: non-cash prizes only. Residential dwelling prizes use a separate legal/product path. Purchased prizes above $75,000 are blocked.
        </p>
      </form>
    </Sheet>
  </>;
}

function ArchivePrizeButton({ orgSlug, prize }: { orgSlug: string; prize: CampaignPrizeRecord }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();
  const formId = `archive-prize-${prize.id}`;

  return <>
    <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Remove</Button>
    <Sheet
      open={open}
      onClose={() => !pending && setOpen(false)}
      title="Remove prize compliance record"
      description={prize.name}
      footer={<div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="danger" type="submit" form={formId} loading={pending}>Remove prize</Button>
      </div>}
    >
      <form id={formId} className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
        run(() => archiveCampaignPrize(orgSlug, { prize_id: prize.id, reason }), { onSuccess: () => setOpen(false) });
      }}>
        <p className="text-sm text-ink-soft">The record is archived rather than deleted so the compliance and audit history remains intact. Any current attestation will be invalidated.</p>
        <Field label="Removal reason" htmlFor={`${formId}-reason`} required>
          <Textarea id={`${formId}-reason`} name="reason" required minLength={3} maxLength={500} rows={3} autoFocus />
        </Field>
      </form>
    </Sheet>
  </>;
}

export function PrizeRecordsCard({
  orgSlug,
  campaignId,
  prizes,
  canManage,
  editable,
}: {
  orgSlug: string;
  campaignId: string;
  prizes: CampaignPrizeRecord[];
  canManage: boolean;
  editable: boolean;
}) {
  const totalValue = prizes.reduce((sum, prize) => sum + prize.fair_value_cents, 0);

  return <Card className="mb-5">
    <CardHeader
      title="Prize compliance records"
      description={prizes.length ? `${prizes.length} active prize${prizes.length === 1 ? "" : "s"} · ${formatMoney(totalValue)} disclosed value` : "Document at least one eligible non-cash prize before director attestation."}
      action={editable ? <PrizeEditorButton orgSlug={orgSlug} campaignId={campaignId} /> : undefined}
    />
    {prizes.length === 0 ? <CardBody>
      <p className="text-sm text-ink-soft">No active prize compliance records are documented yet.</p>
      {!editable && <p className="mt-1 text-xs text-muted">Prize records are locked after activation.</p>}
    </CardBody> : <ul className="divide-y divide-line">
      {prizes.map((prize) => <li key={prize.id} className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{prize.name}</h3>
            <p className="mt-0.5 text-sm text-ink-soft">{prize.description}</p>
          </div>
          <span className="tabular shrink-0 text-sm font-semibold text-ink">{formatMoney(prize.fair_value_cents)}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>Source: {prize.source === "DONATED" ? "Donated" : "Purchased"}</span>
          <span>Basis: {prize.possession_basis === "BONDED" ? "Bonded" : "Owned or possessed"}</span>
        </div>
        {canManage && <p className="text-xs text-muted"><span className="font-medium text-ink-soft">Evidence reference:</span> {prize.evidence_ref}</p>}
        {editable && <div className="flex flex-wrap gap-2 pt-1">
          <PrizeEditorButton orgSlug={orgSlug} campaignId={campaignId} prize={prize} />
          <ArchivePrizeButton orgSlug={orgSlug} prize={prize} />
        </div>}
      </li>)}
    </ul>}
  </Card>;
}
