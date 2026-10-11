"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Link2, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { formatPhone } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { createGuardian, linkGuardian, lookupGuardians, updateGuardian } from "@/lib/roster/actions";
import { RELATIONSHIPS, type Relationship, label } from "@/lib/roster/constants";
import { guardianFieldsSchema, updateGuardianSchema } from "@/lib/roster/schemas";

type NewIn = z.input<typeof guardianFieldsSchema>;
type NewOut = z.output<typeof guardianFieldsSchema>;

/** Create a guardian in a household and link them to one or more players. */
export function NewGuardianSheet({ orgSlug, open, onClose, householdId, playerIds, makePrimary, title = "Add guardian", description }: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  householdId: string | null;
  playerIds: string[];
  makePrimary?: boolean;
  title?: string;
  description?: string;
}) {
  const { run, pending } = useActionRunner();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<NewIn, unknown, NewOut>({
    resolver: zodResolver(guardianFieldsSchema),
  });

  useEffect(() => {
    if (open) reset({ first_name: "", last_name: "", email: "", phone: "", relationship: "parent" });
  }, [open, reset]);

  const onSubmit = handleSubmit((values) =>
    run(() => createGuardian(orgSlug, { ...values, household_id: householdId, player_ids: playerIds, make_primary: makePrimary ?? false }), {
      onSuccess: onClose,
      onError: (fe) => fe && Object.entries(fe).forEach(([k, m]) => setError(k as keyof NewIn, { message: m })),
    }),
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="new-guardian-form" loading={pending}>Save guardian</Button>
        </div>
      }
    >
      <form id="new-guardian-form" onSubmit={onSubmit} className="grid grid-cols-2 gap-3" noValidate>
        <Field label="First name" htmlFor="ng_first" required error={errors.first_name?.message}>
          <Input id="ng_first" autoFocus aria-invalid={!!errors.first_name} {...register("first_name")} />
        </Field>
        <Field label="Last name" htmlFor="ng_last" required error={errors.last_name?.message}>
          <Input id="ng_last" aria-invalid={!!errors.last_name} {...register("last_name")} />
        </Field>
        <Field label="Email" htmlFor="ng_email" error={errors.email?.message} className="col-span-2 sm:col-span-1">
          <Input id="ng_email" type="email" inputMode="email" {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="ng_phone" error={errors.phone?.message} className="col-span-2 sm:col-span-1">
          <Input id="ng_phone" type="tel" inputMode="tel" {...register("phone")} />
        </Field>
        {playerIds.length > 0 && (
          <Field label="Relationship" htmlFor="ng_rel" className="col-span-2 sm:col-span-1">
            <Select id="ng_rel" {...register("relationship")}>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </Select>
          </Field>
        )}
      </form>
    </Sheet>
  );
}

type EditIn = z.input<typeof updateGuardianSchema>;
type EditOut = z.output<typeof updateGuardianSchema>;

export interface EditableGuardian {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  communication_preferences?: { email?: boolean; sms?: boolean } | null;
}

export function EditGuardianSheet({ orgSlug, guardian, onClose }: { orgSlug: string; guardian: EditableGuardian | null; onClose: () => void }) {
  const { run, pending } = useActionRunner();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<EditIn, unknown, EditOut>({
    resolver: zodResolver(updateGuardianSchema),
  });

  useEffect(() => {
    if (guardian) {
      reset({
        id: guardian.id,
        first_name: guardian.first_name,
        last_name: guardian.last_name,
        email: guardian.email ?? "",
        phone: guardian.phone ?? "",
        email_opt_in: guardian.communication_preferences?.email ?? true,
        sms_opt_in: guardian.communication_preferences?.sms ?? false,
      });
    }
  }, [guardian, reset]);

  const onSubmit = handleSubmit((values) =>
    run(() => updateGuardian(orgSlug, values), {
      onSuccess: onClose,
      onError: (fe) => fe && Object.entries(fe).forEach(([k, m]) => setError(k as keyof EditIn, { message: m })),
    }),
  );

  return (
    <Sheet
      open={Boolean(guardian)}
      onClose={onClose}
      title="Edit guardian"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-guardian-form" loading={pending}>Save changes</Button>
        </div>
      }
    >
      <form id="edit-guardian-form" onSubmit={onSubmit} className="grid grid-cols-2 gap-3" noValidate>
        <Field label="First name" htmlFor="eg_first" required error={errors.first_name?.message}>
          <Input id="eg_first" {...register("first_name")} />
        </Field>
        <Field label="Last name" htmlFor="eg_last" required error={errors.last_name?.message}>
          <Input id="eg_last" {...register("last_name")} />
        </Field>
        <Field label="Email" htmlFor="eg_email" error={errors.email?.message} className="col-span-2 sm:col-span-1">
          <Input id="eg_email" type="email" {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="eg_phone" error={errors.phone?.message} className="col-span-2 sm:col-span-1">
          <Input id="eg_phone" type="tel" {...register("phone")} />
        </Field>
        <fieldset className="col-span-2 space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink-soft">Communication preferences</legend>
          <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox {...register("email_opt_in")} /> Email</label>
          <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox {...register("sms_opt_in")} /> Text messages (SMS)</label>
          <p className="text-xs text-muted">Used for ticket and fundraiser notifications in later phases.</p>
        </fieldset>
      </form>
    </Sheet>
  );
}

type FoundGuardian = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; households: { name: string } | null };

type LinkProps = { orgSlug: string; open: boolean; onClose: () => void; playerId: string; excludeIds: string[] };

/** Search the organization's guardians and link one to a player. */
export function LinkGuardianSheet(props: LinkProps) {
  return props.open ? <LinkGuardianContent {...props} /> : null;
}

function LinkGuardianContent({ orgSlug, open, onClose, playerId, excludeIds }: LinkProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundGuardian[]>([]);
  const [relationship, setRelationship] = useState<Relationship>("parent");
  const [searching, startSearch] = useTransition();
  const { run, pending } = useActionRunner();

  const searchable = q.trim().length >= 2;
  const shown = searchable ? results : [];

  useEffect(() => {
    if (!searchable) return;
    const t = setTimeout(() => {
      startSearch(async () => {
        const r = await lookupGuardians(orgSlug, q);
        setResults(r.ok ? r.data.filter((g) => !excludeIds.includes(g.id)) : []);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q, searchable, orgSlug, excludeIds]);

  return (
    <Sheet open={open} onClose={onClose} title="Link existing guardian" description="Search by name or email, e.g. a parent already linked to a sibling.">
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guardians" aria-label="Search guardians" className="pl-8" />
        </div>
        <Select aria-label="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship)}>
          {RELATIONSHIPS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </Select>
      </div>
      <ul className="divide-y divide-line rounded-control border border-line" aria-busy={searching}>
        {shown.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted">
            {q.trim().length < 2 ? "Type at least 2 characters" : searching ? "Searching…" : "No guardians found"}
          </li>
        )}
        {shown.map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium text-ink">{g.first_name} {g.last_name}</p>
              <p className="truncate text-xs text-muted">
                {[g.email, formatPhone(g.phone), g.households?.name].filter(Boolean).join(" · ") || "No contact info"}
              </p>
            </div>
            <Button size="sm" variant="secondary" icon={<Link2 className="size-3.5" />} loading={pending}
              onClick={() => run(() => linkGuardian(orgSlug, { player_id: playerId, guardian_id: g.id, relationship }), { onSuccess: onClose })}>
              Link
            </Button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
