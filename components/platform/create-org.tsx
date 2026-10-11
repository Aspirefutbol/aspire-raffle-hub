"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { createOrganization } from "@/lib/platform/actions";
import { TIMEZONES } from "@/lib/settings/schemas";

const EMPTY = { name: "", slug: "", organization_type: "sports_club", timezone: "America/Chicago", jurisdiction_profile: "", admin_email: "" };
const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

export function CreateOrganizationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();

  return (
    <>
      <Button icon={<Plus className="size-4" />} onClick={() => { setForm(EMPTY); setErrors({}); setSlugTouched(false); setOpen(true); }}>
        New organization
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New organization"
        description="Creates an isolated tenant: its roster, campaigns and members are invisible to other organizations."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={pending}
              onClick={() => run(() => createOrganization(form), { onSuccess: (d) => { setOpen(false); router.push(`/o/${d.slug}/dashboard`); }, onError: (fe) => setErrors(fe ?? {}) })}>
              Create
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="po_name" required error={errors.name}>
            <Input id="po_name" autoFocus value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })} />
          </Field>
          <Field label="URL" htmlFor="po_slug" required error={errors.slug} hint={`/o/${form.slug || "your-org"}`}>
            <Input id="po_slug" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value }); }} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="po_type">
              <Select id="po_type" value={form.organization_type} onChange={(e) => setForm({ ...form, organization_type: e.target.value })}>
                <option value="sports_club">Sports club</option>
                <option value="nonprofit">Nonprofit</option>
                <option value="school">School</option>
                <option value="ministry">Ministry</option>
                <option value="community">Community organization</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Time zone" htmlFor="po_tz">
              <Select id="po_tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((t) => <option key={t} value={t}>{t.split("/")[1]?.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Jurisdiction profile" htmlFor="po_jur" hint="Controls which fundraising features campaigns may use.">
            <Select id="po_jur" value={form.jurisdiction_profile} onChange={(e) => setForm({ ...form, jurisdiction_profile: e.target.value })}>
              <option value="">Not set</option>
              <option value="TEXAS_CREA_OFFLINE_PAYMENT">Texas CREA — offline payment only</option>
            </Select>
          </Field>
          <Field label="First admin (existing account email)" htmlFor="po_admin" error={errors.admin_email}>
            <Input id="po_admin" type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
