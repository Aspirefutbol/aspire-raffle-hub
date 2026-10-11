"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Input, Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/cn";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { cancelImport, saveMappingAndValidate } from "@/lib/roster/import/actions";
import { type ColumnMapping, FIELD_GROUPS, type TargetField, checkMapping, fieldLabel, suggestMapping } from "@/lib/roster/import/fields";

export function MappingStep({ orgSlug, importId, fileName, headers, initialMapping, samples, rowCount, sourceName, alreadyValidated }: {
  orgSlug: string;
  importId: string;
  fileName: string;
  headers: string[];
  initialMapping: ColumnMapping;
  samples: Record<string, string[]>;
  rowCount: number;
  sourceName: string | null;
  alreadyValidated: boolean;
}) {
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);
  const [save, setSave] = useState(!sourceName);
  const [saveAs, setSaveAs] = useState(sourceName ?? fileName.replace(/\.[^.]+$/, "").slice(0, 80));
  const { run, pending } = useActionRunner();

  const problems = useMemo(() => checkMapping(mapping), [mapping]);
  const usage = useMemo(() => {
    const counts = new Map<TargetField, number>();
    for (const v of Object.values(mapping)) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    return counts;
  }, [mapping]);
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  const submit = () =>
    run(() => saveMappingAndValidate(orgSlug, { importId, mapping, saveAs: save ? saveAs : null }));

  return (
    <>
      <Card>
        <CardHeader
          title="Match your columns to Raffle Hub fields"
          description={`${mappedCount} of ${headers.length} columns mapped · ${rowCount} rows in ${fileName}${sourceName ? ` · saved mapping “${sourceName}” applied` : ""}`}
          action={
            <Button size="sm" variant="ghost" icon={<Wand2 className="size-3.5" />} onClick={() => setMapping(suggestMapping(headers))}>
              Auto-match
            </Button>
          }
        />
        <div className="divide-y divide-line">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-4 bg-canvas/60 px-4 py-2 text-xs font-medium text-muted md:grid">
            <span>Spreadsheet column</span>
            <span>Sample values</span>
            <span>Import as</span>
          </div>
          {headers.map((header) => {
            const target = mapping[header] ?? null;
            const clash = target ? (usage.get(target) ?? 0) > 1 : false;
            return (
              <div key={header} className="grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-4">
                <div className="flex items-center gap-2">
                  {target ? (
                    <CheckCircle2 aria-label="Mapped" className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <span aria-label="Not imported" className="size-4 shrink-0 rounded-full border border-dashed border-line-strong" />
                  )}
                  <span className="truncate text-sm font-medium text-ink">{header}</span>
                </div>
                <div className="truncate text-xs text-muted md:text-sm">
                  {(samples[header] ?? []).length ? samples[header]!.join(" · ") : <em>empty</em>}
                </div>
                <Select
                  aria-label={`Import ${header} as`}
                  value={target ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [header]: (e.target.value || null) as TargetField | null })}
                  className={cn(!target && "text-muted", clash && "border-red-400")}
                  aria-invalid={clash || undefined}
                >
                  <option value="">Don’t import</option>
                  {FIELD_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.fields.map((f) => (
                        <option key={f} value={f}>
                          {fieldLabel(f)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 mt-4 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:shadow-card">
        {problems.length > 0 && (
          <ul className="mb-2 space-y-1">
            {problems.map((p) => (
              <li key={p.message} className="flex items-center gap-1.5 text-sm text-red-700">
                <AlertTriangle aria-hidden className="size-4" /> {p.message}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <Checkbox checked={save} onChange={(e) => setSave(e.target.checked)} />
            Save mapping as
          </label>
          <Input value={saveAs} onChange={(e) => setSaveAs(e.target.value)} disabled={!save} aria-label="Mapping name" className="sm:w-56" placeholder="e.g. League registration export" />
          <div className="flex gap-2 sm:ml-auto">
            <ConfirmButton size="md" variant="ghost" confirmLabel="Cancel import?" disabled={pending} onConfirm={() => run(() => cancelImport(orgSlug, importId))}>
              Cancel
            </ConfirmButton>
            <Button onClick={submit} loading={pending} disabled={problems.length > 0 || (save && !saveAs.trim())}>
              {alreadyValidated ? "Re-check rows" : `Check ${rowCount} rows`} <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
        {alreadyValidated && <p className="mt-2 text-xs text-amber-700">Changing the mapping re-reads the file and clears corrections made during review.</p>}
      </div>
    </>
  );
}
