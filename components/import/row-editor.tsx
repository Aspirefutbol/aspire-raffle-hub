"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { resolveImportRows, updateImportRow } from "@/lib/roster/import/actions";
import type { Resolution, RowData } from "@/lib/roster/import/types";
import { PLAYER_GENDERS, RELATIONSHIPS, label } from "@/lib/roster/constants";
import type { ReviewRow } from "./review-step";

export interface MatchedPlayer {
  name: string;
  dob: string | null;
  team: string | null;
  household: string | null;
  guardian: string | null;
  external_id: string | null;
}

const CHOICES: Array<{ value: Resolution; label: string; hint: string; needsMatch?: boolean }> = [
  { value: "use_existing", label: "Use existing", hint: "Same player. Leave the roster as it is.", needsMatch: true },
  { value: "link", label: "Merge / link", hint: "Same player. Fill in missing details, team and guardians from this row.", needsMatch: true },
  { value: "create", label: "Create new", hint: "Different player who happens to look similar." },
  { value: "skip", label: "Skip", hint: "Don’t import this row." },
];

type Editable = Pick<
  RowData,
  | "first_name" | "last_name" | "preferred_name" | "date_of_birth" | "gender" | "external_player_id" | "team_id" | "allow_unassigned"
  | "guardian1_first_name" | "guardian1_last_name" | "guardian1_email" | "guardian1_phone" | "guardian1_relationship"
  | "guardian2_first_name" | "guardian2_last_name" | "guardian2_email" | "guardian2_phone" | "guardian2_relationship"
>;

function pick(d: RowData): Editable {
  return {
    first_name: d.first_name,
    last_name: d.last_name,
    preferred_name: d.preferred_name,
    date_of_birth: d.date_of_birth,
    gender: d.gender,
    external_player_id: d.external_player_id,
    team_id: d.team_id,
    allow_unassigned: d.allow_unassigned,
    guardian1_first_name: d.guardian1_first_name,
    guardian1_last_name: d.guardian1_last_name,
    guardian1_email: d.guardian1_email,
    guardian1_phone: d.guardian1_phone,
    guardian1_relationship: d.guardian1_relationship,
    guardian2_first_name: d.guardian2_first_name,
    guardian2_last_name: d.guardian2_last_name,
    guardian2_email: d.guardian2_email,
    guardian2_phone: d.guardian2_phone,
    guardian2_relationship: d.guardian2_relationship,
  };
}

/** Correct a staged row in place — no need to edit and re-upload the spreadsheet. */
type EditorProps = {
  orgSlug: string;
  importId: string;
  row: ReviewRow | null;
  onClose: () => void;
  teams: Array<{ value: string; label: string }>;
  matched?: MatchedPlayer;
};

export function RowEditorSheet(props: EditorProps) {
  return props.row ? <RowEditor key={props.row.id} {...props} row={props.row} /> : null;
}

function RowEditor({ orgSlug, importId, row, onClose, teams, matched }: EditorProps & { row: ReviewRow }) {
  const [form, setForm] = useState<Editable>(() => pick(row.data));
  const [showG2, setShowG2] = useState(() => Boolean(row.data.guardian2_first_name || row.data.guardian2_email || row.data.guardian2_phone));
  const { run, pending } = useActionRunner();

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setForm({ ...form, [key]: value });
  const text = (key: keyof Editable) => (form[key] as string | null) ?? "";
  const issueFor = (field: string) => row.issues.find((i) => i.field === field);
  const fieldError = (field: string) => {
    const i = issueFor(field);
    return i?.severity === "error" ? i.message : undefined;
  };

  const save = () => {
    const patch: Partial<RowData> = {};
    for (const [k, v] of Object.entries(form) as Array<[keyof Editable, Editable[keyof Editable]]>) {
      const normalized = typeof v === "string" ? v.trim() || null : v;
      (patch as Record<string, unknown>)[k] = k === "first_name" || k === "last_name" ? (normalized ?? "") : normalized;
    }
    run(() => updateImportRow(orgSlug, { importId, rowId: row.id, patch }), { onSuccess: onClose });
  };

  const input = (key: keyof Editable, lbl: string, opts: { type?: string; required?: boolean; className?: string } = {}) => (
    <Field label={lbl} htmlFor={`re_${key}`} required={opts.required} error={fieldError(key)} className={opts.className}>
      <Input
        id={`re_${key}`}
        type={opts.type ?? "text"}
        value={text(key)}
        onChange={(e) => set(key, e.target.value as never)}
        aria-invalid={Boolean(fieldError(key)) || undefined}
      />
    </Field>
  );

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={`Row ${row.row_number}`}
      description="Fix values here. The row is re-checked as soon as you save."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={pending}>Save & re-check</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {row.issues.length > 0 && (
          <ul className="space-y-1 rounded-control border border-amber-200 bg-amber-50 px-3 py-2">
            {row.issues.map((i) => (
              <li key={i.code + i.field} className={cn("flex items-start gap-1.5 text-sm", i.severity === "error" ? "text-red-700" : "text-amber-800")}>
                <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {i.message}
              </li>
            ))}
          </ul>
        )}

        {row.status === "duplicate" && (
          <section className="rounded-control border border-line p-3">
            <h3 className="mb-2 text-sm font-semibold text-ink">Possible duplicate · {row.match_reasons[0]}</h3>
            {matched && (
              <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-control bg-canvas px-3 py-2 text-xs">
                <dt className="text-muted">On roster</dt><dd className="font-medium text-ink">{matched.name}</dd>
                <dt className="text-muted">Born</dt><dd>{matched.dob ?? "—"}</dd>
                <dt className="text-muted">Team</dt><dd>{matched.team ?? "—"}</dd>
                <dt className="text-muted">Household</dt><dd>{matched.household ?? "—"}</dd>
                <dt className="text-muted">Guardian</dt><dd>{matched.guardian ?? "—"}</dd>
                {matched.external_id && (<><dt className="text-muted">Ext. ID</dt><dd>{matched.external_id}</dd></>)}
              </dl>
            )}
            <div role="radiogroup" aria-label="What should happen to this row?" className="grid gap-2 sm:grid-cols-2">
              {CHOICES.filter((c) => !c.needsMatch || row.match_player_id).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={row.resolution === c.value}
                  disabled={pending}
                  onClick={() => run(() => resolveImportRows(orgSlug, { importId, rowIds: [row.id], resolution: c.value }), { onSuccess: onClose })}
                  className={cn(
                    "rounded-control border px-3 py-2 text-left",
                    row.resolution === c.value ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="block text-sm font-medium text-ink">{c.label}</span>
                  <span className="block text-xs text-muted">{c.hint}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Player</legend>
          {input("first_name", "First name", { required: true })}
          {input("last_name", "Last name", { required: true })}
          {input("preferred_name", "Preferred name")}
          {input("date_of_birth", "Date of birth", { type: "text" })}
          <Field label="Gender" htmlFor="re_gender">
            <Select id="re_gender" value={text("gender")} onChange={(e) => set("gender", e.target.value || null)}>
              <option value="">—</option>
              {PLAYER_GENDERS.map((g) => <option key={g} value={g}>{label(g)}</option>)}
            </Select>
          </Field>
          {input("external_player_id", "External ID")}
          <Field label="Team" htmlFor="re_team" error={fieldError("team")} className="col-span-2 sm:col-span-1">
            <Select id="re_team" value={form.team_id ?? ""} onChange={(e) => setForm({ ...form, team_id: e.target.value || null, allow_unassigned: false })}>
              <option value="">{row.data.team && !row.data.team_id ? `“${row.data.team}” — choose a team…` : "Choose a team…"}</option>
              {teams.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm text-ink-soft sm:col-span-1">
            <Checkbox checked={form.allow_unassigned} onChange={(e) => set("allow_unassigned", e.target.checked)} disabled={Boolean(form.team_id)} />
            Import without a team
          </label>
        </fieldset>

        {([1, 2] as const).map((n) =>
          n === 2 && !showG2 ? (
            <button key={n} type="button" className="text-sm font-medium text-brand-700 hover:underline" onClick={() => setShowG2(true)}>
              + Add a second guardian
            </button>
          ) : (
            <fieldset key={n} className="grid grid-cols-2 gap-3">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Guardian {n}</legend>
              {input(`guardian${n}_first_name`, "First name")}
              {input(`guardian${n}_last_name`, "Last name")}
              {input(`guardian${n}_email`, "Email", { type: "email" })}
              {input(`guardian${n}_phone`, "Phone", { type: "tel" })}
              <Field label="Relationship" htmlFor={`re_g${n}_rel`}>
                <Select id={`re_g${n}_rel`} value={text(`guardian${n}_relationship`) || "parent"} onChange={(e) => set(`guardian${n}_relationship`, e.target.value)}>
                  {RELATIONSHIPS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                </Select>
              </Field>
            </fieldset>
          ),
        )}
      </div>
    </Sheet>
  );
}
