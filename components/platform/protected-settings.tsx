"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { inviteOrganizationAdmin, updateProtectedOrganization } from "@/lib/platform/actions";
import { JURISDICTION_LABELS, JURISDICTION_PROFILES, ORGANIZATION_STATUSES } from "@/lib/platform/constants";

export function ProtectedSettingsForm({ organization }: {
  organization: { id: string; slug: string; status: string; jurisdiction_profile: string | null };
}) {
  const [slug, setSlug] = useState(organization.slug);
  const [status, setStatus] = useState(organization.status);
  const [jurisdiction, setJurisdiction] = useState(organization.jurisdiction_profile ?? "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();

  const changes: Record<string, string> = {};
  if (slug !== organization.slug) changes.slug = slug;
  if (status !== organization.status) changes.status = status;
  if (jurisdiction !== (organization.jurisdiction_profile ?? "")) changes.jurisdiction_profile = jurisdiction;
  const dirty = Object.keys(changes).length > 0;

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Lock aria-hidden className="size-4 text-muted" /> Protected settings</span>}
        description="Only platform administrators can change these. Organization admins can’t, even through the API. Every change needs a reason and is recorded."
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="URL slug" htmlFor="p-slug" error={errors.slug} hint={`/o/${slug}`}>
            <Input id="p-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Field>
          <Field label="Status" htmlFor="p-status" hint="Suspended or archived organizations are inaccessible to their members.">
            <Select id="p-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {ORGANIZATION_STATUSES.map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Jurisdiction profile" htmlFor="p-jur" hint="Controls which fundraising features campaigns may use.">
            <Select id="p-jur" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
              <option value="">Not set</option>
              {JURISDICTION_PROFILES.map((j) => <option key={j} value={j}>{JURISDICTION_LABELS[j]}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Reason" htmlFor="p-reason" required error={errors.reason} className="flex-1">
            <Input id="p-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Counsel approved CREA mode" />
          </Field>
          <Button
            disabled={!dirty || reason.trim().length < 5}
            loading={pending}
            onClick={() =>
              run(() => updateProtectedOrganization({ organization_id: organization.id, ...changes, reason }), {
                onSuccess: () => setReason(""),
                onError: (fe) => setErrors(fe ?? {}),
              })
            }
          >
            Save protected changes
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function InviteAdminForm({ organizationId }: { organizationId: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { run, pending } = useActionRunner();
  return (
    <Card>
      <CardHeader title="Add an administrator" description="Adds an existing account as Organization Admin + Director, or sends an invitation." />
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Email" htmlFor="admin-email" error={error} className="flex-1">
          <Input id="admin-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} />
        </Field>
        <Button disabled={!email.trim()} loading={pending}
          onClick={() => run(() => inviteOrganizationAdmin({ organization_id: organizationId, email }), { onSuccess: () => setEmail(""), onError: (fe) => setError(fe?.email) })}>
          Add or invite
        </Button>
      </CardBody>
    </Card>
  );
}
