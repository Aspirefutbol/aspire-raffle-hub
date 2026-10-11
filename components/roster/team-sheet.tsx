"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { createTeam, updateTeam } from "@/lib/roster/actions";
import { GENDER_DIVISIONS, label } from "@/lib/roster/constants";
import { teamInputSchema } from "@/lib/roster/schemas";

type FormIn = z.input<typeof teamInputSchema>;
type FormOut = z.output<typeof teamInputSchema>;

export interface TeamSheetValue {
  id?: string;
  name: string;
  season_id: string | null;
  age_group: string | null;
  gender_division: string | null;
  coach_name: string | null;
  team_code: string | null;
  status: "active" | "inactive";
}

export function TeamSheet({ orgSlug, open, onClose, team, seasons, defaultSeasonId }: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  team?: TeamSheetValue | null;
  seasons: Array<{ id: string; name: string }>;
  defaultSeasonId: string | null;
}) {
  const { run, pending } = useActionRunner();
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(teamInputSchema) });
  const { register, handleSubmit, reset, setError, formState: { errors } } = form;

  useEffect(() => {
    if (!open) return;
    reset({
      name: team?.name ?? "",
      season_id: team?.season_id ?? defaultSeasonId ?? "",
      age_group: team?.age_group ?? "",
      gender_division: (team?.gender_division as FormIn["gender_division"]) ?? "",
      coach_name: team?.coach_name ?? "",
      team_code: team?.team_code ?? "",
      status: team?.status ?? "active",
    });
  }, [open, team, defaultSeasonId, reset]);

  const onSubmit = handleSubmit((values) => {
    run(() => (team?.id ? updateTeam(orgSlug, { ...values, id: team.id }) : createTeam(orgSlug, values)), {
      onSuccess: onClose,
      onError: (fe) => fe && Object.entries(fe).forEach(([k, m]) => setError(k as keyof FormIn, { message: m })),
    });
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={team?.id ? "Edit team" : "New team"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="team-form" loading={pending}>{team?.id ? "Save changes" : "Create team"}</Button>
        </div>
      }
    >
      <form id="team-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Team name" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" autoFocus placeholder="U13 Boys" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age group" htmlFor="age_group" error={errors.age_group?.message}>
            <Input id="age_group" placeholder="U13" {...register("age_group")} />
          </Field>
          <Field label="Gender / division" htmlFor="gender_division">
            <Select id="gender_division" {...register("gender_division")}>
              <option value="">—</option>
              {GENDER_DIVISIONS.map((g) => <option key={g} value={g}>{label(g)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Season" htmlFor="season_id">
          <Select id="season_id" {...register("season_id")}>
            <option value="">No season</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coach" htmlFor="coach_name" error={errors.coach_name?.message}>
            <Input id="coach_name" {...register("coach_name")} />
          </Field>
          <Field label="Team code" htmlFor="team_code" hint="Optional short code, e.g. U13B" error={errors.team_code?.message}>
            <Input id="team_code" {...register("team_code")} />
          </Field>
        </div>
        <Field label="Status" htmlFor="status">
          <Select id="status" {...register("status")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </form>
    </Sheet>
  );
}
