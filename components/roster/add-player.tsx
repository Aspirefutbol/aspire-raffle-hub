"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { HouseholdPicker } from "./household-picker";
import { cn } from "@/lib/cn";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { createPlayer } from "@/lib/roster/actions";
import { PLAYER_GENDERS, RELATIONSHIPS, label } from "@/lib/roster/constants";
import { createPlayerSchema } from "@/lib/roster/schemas";

type FormIn = z.input<typeof createPlayerSchema>;
type FormOut = z.output<typeof createPlayerSchema>;
type Option = { value: string; label: string };

const EMPTY: FormIn = {
  first_name: "",
  last_name: "",
  team_id: "",
  preferred_name: "",
  date_of_birth: "",
  gender: "",
  external_player_id: "",
  notes: "",
  household: { mode: "none" },
  guardian: { mode: "none" },
};

/** "+ Add Player" button + side sheet. Required: first name, last name, team. */
export function AddPlayerButton({ orgSlug, teams, defaultTeamId, variant = "primary", label: buttonLabel = "Add Player" }: {
  orgSlug: string;
  teams: Option[];
  defaultTeamId?: string;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <AddPlayerSheet
        orgSlug={orgSlug}
        open={open}
        onClose={() => setOpen(false)}
        teams={teams}
        defaultTeamId={defaultTeamId}
      />
    </>
  );
}

type SheetProps = {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  teams: Option[];
  defaultTeamId?: string;
};

export function AddPlayerSheet(props: SheetProps) {
  // Mount on open so each session starts from a clean form.
  return props.open ? <AddPlayerForm {...props} /> : null;
}

function AddPlayerForm({ orgSlug, onClose, teams, defaultTeamId }: SheetProps) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [more, setMore] = useState(false);
  const [mode, setMode] = useState<"save" | "another">("save");

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(createPlayerSchema),
    defaultValues: { ...EMPTY, team_id: defaultTeamId ?? "" },
  });
  const { register, handleSubmit, reset, setError, setFocus, control, setValue, formState: { errors } } = form;
  const householdMode = useWatch({ control, name: "household.mode" });
  const household = useWatch({ control, name: "household" });
  const householdId = household?.mode === "existing" ? household.id : undefined;
  const guardianMode = useWatch({ control, name: "guardian.mode" });

  const onSubmit = handleSubmit((values, event) => {
    const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter;
    const another = submitter?.getAttribute("value") === "another";
    setMode(another ? "another" : "save");
    run(() => createPlayer(orgSlug, values), {
      onSuccess: (data) => {
        if (another) {
          // Keep team + household so siblings/teammates are fast to enter.
          reset({ ...EMPTY, team_id: values.team_id, household: values.household.mode === "existing" ? values.household : { mode: "none" } });
          setTimeout(() => setFocus("first_name"), 0);
        } else {
          onClose();
          router.push(`/o/${orgSlug}/people/players/${data.id}`);
        }
      },
      onError: (fe) => {
        if (!fe) return;
        for (const [key, message] of Object.entries(fe)) setError(key as never, { message });
        if (Object.keys(fe).some((k) => !["first_name", "last_name", "team_id"].includes(k))) setMore(true);
      },
    });
  });

  const err = (path: string): string | undefined => {
    const parts = path.split(".");
    let node: unknown = errors;
    for (const p of parts) node = (node as Record<string, unknown> | undefined)?.[p];
    return (node as { message?: string } | undefined)?.message;
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add player"
      description="Only name and team are required. Everything else can be added later."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-player-form" value="another" variant="secondary" loading={pending && mode === "another"} disabled={pending}>
            Save &amp; add another
          </Button>
          <Button type="submit" form="add-player-form" value="save" loading={pending && mode === "save"} disabled={pending}>
            Save player
          </Button>
        </div>
      }
    >
      <form id="add-player-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="first_name" required error={err("first_name")}>
            <Input id="first_name" autoFocus autoComplete="off" aria-invalid={!!errors.first_name} {...register("first_name")} />
          </Field>
          <Field label="Last name" htmlFor="last_name" required error={err("last_name")}>
            <Input id="last_name" autoComplete="off" aria-invalid={!!errors.last_name} {...register("last_name")} />
          </Field>
        </div>
        <Field label="Team" htmlFor="team_id" required error={err("team_id")}>
          <Select id="team_id" aria-invalid={!!errors.team_id} {...register("team_id")}>
            <option value="">Choose a team…</option>
            {teams.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex w-full items-center justify-between rounded-control border border-dashed border-line-strong px-3 py-2 text-sm font-medium text-ink-soft hover:bg-canvas"
        >
          Household, guardian &amp; more details
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", more && "rotate-180")} />
        </button>

        {more && (
          <div className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Player details</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Preferred name" htmlFor="preferred_name" error={err("preferred_name")}>
                  <Input id="preferred_name" {...register("preferred_name")} />
                </Field>
                <Field label="Date of birth" htmlFor="date_of_birth" error={err("date_of_birth")}>
                  <Input id="date_of_birth" type="date" max={new Date().toISOString().slice(0, 10)} {...register("date_of_birth")} />
                </Field>
                <Field label="Gender" htmlFor="gender">
                  <Select id="gender" {...register("gender")}>
                    <option value="">—</option>
                    {PLAYER_GENDERS.map((g) => <option key={g} value={g}>{label(g)}</option>)}
                  </Select>
                </Field>
                <Field label="External ID" htmlFor="external_player_id" hint="e.g. league registration #" error={err("external_player_id")}>
                  <Input id="external_player_id" {...register("external_player_id")} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Household</legend>
              <Segmented
                name="household-mode"
                value={householdMode}
                onChange={(v) => setValue("household", v === "existing" ? { mode: "existing", id: "" } : v === "new" ? { mode: "new", name: "" } : { mode: "none" })}
                options={[
                  { value: "none", label: "None yet" },
                  { value: "existing", label: "Existing" },
                  { value: "new", label: "New household" },
                ]}
              />
              {householdMode === "existing" && (
                <Field label="Household" htmlFor="household_id" error={err("household.id")}>
                  <HouseholdPicker
                    id="household_id"
                    orgSlug={orgSlug}
                    value={householdId ?? ""}
                    onChange={(hid) => setValue("household", { mode: "existing", id: hid }, { shouldValidate: true })}
                  />
                </Field>
              )}
              {householdMode === "new" && (
                <Field label="Household name" htmlFor="household_name" error={err("household.name")} hint="e.g. Garcia Household">
                  <Input id="household_name" {...register("household.name")} />
                </Field>
              )}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Parent / guardian</legend>
              <Segmented
                name="guardian-mode"
                value={guardianMode}
                onChange={(v) =>
                  setValue("guardian", v === "new" ? { mode: "new", first_name: "", last_name: "", email: "", phone: "", relationship: "parent" } : { mode: "none" })
                }
                options={[
                  { value: "none", label: "Add later" },
                  { value: "new", label: "Add guardian" },
                ]}
              />
              {guardianMode === "new" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" htmlFor="g_first" required error={err("guardian.first_name")}>
                    <Input id="g_first" {...register("guardian.first_name")} />
                  </Field>
                  <Field label="Last name" htmlFor="g_last" required error={err("guardian.last_name")}>
                    <Input id="g_last" {...register("guardian.last_name")} />
                  </Field>
                  <Field label="Email" htmlFor="g_email" error={err("guardian.email")}>
                    <Input id="g_email" type="email" inputMode="email" {...register("guardian.email")} />
                  </Field>
                  <Field label="Phone" htmlFor="g_phone" error={err("guardian.phone")}>
                    <Input id="g_phone" type="tel" inputMode="tel" {...register("guardian.phone")} />
                  </Field>
                  <Field label="Relationship" htmlFor="g_rel" className="col-span-2 sm:col-span-1">
                    <Select id="g_rel" {...register("guardian.relationship")}>
                      {RELATIONSHIPS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                    </Select>
                  </Field>
                </div>
              )}
            </fieldset>

            <Field label="Notes" htmlFor="notes" error={err("notes")}>
              <Textarea id="notes" rows={3} {...register("notes")} />
            </Field>
          </div>
        )}
      </form>
    </Sheet>
  );
}

function Segmented({ name, value, options, onChange }: {
  name: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-control border border-line-strong bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[0.4rem] px-3 py-1 pointer-coarse:py-2.5 text-sm",
            value === o.value ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
