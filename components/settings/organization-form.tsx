"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { updateOrganization } from "@/lib/settings/actions";
import { TIMEZONES, organizationSchema } from "@/lib/settings/schemas";

type FormIn = z.input<typeof organizationSchema>;
type FormOut = z.output<typeof organizationSchema>;

export function OrganizationForm({ orgSlug, initial, canEdit }: { orgSlug: string; initial: FormIn; canEdit: boolean }) {
  const { run, pending } = useActionRunner();
  const { register, handleSubmit, setError, reset, formState: { errors, isDirty } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(organizationSchema),
    defaultValues: initial,
  });

  const onSubmit = handleSubmit((values) =>
    run(() => updateOrganization(orgSlug, values), {
      onSuccess: () => reset(values),
      onError: (fe) => fe && Object.entries(fe).forEach(([k, m]) => setError(k as keyof FormIn, { message: m })),
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-6 gap-3" noValidate>
      <fieldset disabled={!canEdit} className="contents">
        <Field label="Display name" htmlFor="org_name" required error={errors.name?.message} className="col-span-6 sm:col-span-3">
          <Input id="org_name" {...register("name")} />
        </Field>
        <Field label="Legal name" htmlFor="org_legal" hint="Appears on tickets and receipts" className="col-span-6 sm:col-span-3">
          <Input id="org_legal" {...register("legal_name")} />
        </Field>
        <Field label="Address" htmlFor="org_a1" hint="Legal/operator address required on raffle tickets" className="col-span-6">
          <Input id="org_a1" {...register("address_line1")} />
        </Field>
        <Field label="City" htmlFor="org_city" className="col-span-6 sm:col-span-3">
          <Input id="org_city" {...register("city")} />
        </Field>
        <Field label="State" htmlFor="org_region" className="col-span-3 sm:col-span-1">
          <Input id="org_region" {...register("region")} />
        </Field>
        <Field label="ZIP" htmlFor="org_zip" className="col-span-3 sm:col-span-2">
          <Input id="org_zip" {...register("postal_code")} />
        </Field>
        <Field label="Support email" htmlFor="org_email" error={errors.support_email?.message} className="col-span-6 sm:col-span-2">
          <Input id="org_email" type="email" {...register("support_email")} />
        </Field>
        <Field label="Support phone" htmlFor="org_phone" error={errors.support_phone?.message} className="col-span-6 sm:col-span-2">
          <Input id="org_phone" type="tel" {...register("support_phone")} />
        </Field>
        <Field label="Time zone" htmlFor="org_tz" className="col-span-6 sm:col-span-2">
          <Select id="org_tz" {...register("timezone")}>
            {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace("America/", "").replace("Pacific/", "").replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
      </fieldset>
      {canEdit && (
        <div className="col-span-6 flex justify-end">
          <Button type="submit" loading={pending} disabled={!isDirty}>Save changes</Button>
        </div>
      )}
    </form>
  );
}
