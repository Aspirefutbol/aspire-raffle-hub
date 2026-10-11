"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, CircleSlash, Copy, Home, Pencil, RotateCcw, Upload, Wrench } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/cn";
import { formatDate, pluralize } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { bulkFixImport, cancelImport, commitImport, resolveImportRows } from "@/lib/roster/import/actions";
import type { ImportSummary } from "@/lib/roster/import/pipeline";
import type { MatchType, Resolution, RowData, RowIssue, RowStatus } from "@/lib/roster/import/types";
import { RowEditorSheet, type MatchedPlayer } from "./row-editor";

export interface ReviewRow {
  id: string;
  row_number: number;
  data: RowData;
  status: RowStatus;
  issues: RowIssue[];
  match_type: MatchType | null;
  match_player_id: string | null;
  match_reasons: string[];
  resolution: Resolution | null;
  household_key: string | null;
}

type Tab = "all" | "ready" | "duplicate" | "error" | "skipped";

const MATCH_LABEL: Record<MatchType, { label: string; tone: "danger" | "warning" | "info" | "success" }> = {
  EXACT_MATCH: { label: "Exact match", tone: "danger" },
  LIKELY_MATCH: { label: "Likely match", tone: "warning" },
  NEEDS_REVIEW: { label: "Needs review", tone: "info" },
  NEW_RECORD: { label: "New", tone: "success" },
};

const RESOLUTION_LABEL: Record<Resolution, string> = {
  use_existing: "Use existing",
  link: "Merge / link",
  create: "Create new",
  skip: "Skip",
};

export function ReviewStep({ orgSlug, importId, rows, summary, matched, teams, households, onRemap }: {
  orgSlug: string;
  importId: string;
  rows: ReviewRow[];
  summary: ImportSummary;
  matched: Record<string, MatchedPlayer>;
  teams: Array<{ value: string; label: string }>;
  households: Record<string, string>;
  onRemap: string; // href back to mapping
}) {
  const [tab, setTab] = useState<Tab>(summary.duplicates_unresolved ? "duplicate" : summary.errors ? "error" : "all");
  const [limit, setLimit] = useState(100);
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [bulkTeam, setBulkTeam] = useState("");
  const { run, pending } = useActionRunner();

  const teamName = useMemo(() => new Map(teams.map((t) => [t.value, t.label])), [teams]);
  const visible = rows.filter((r) => tab === "all" || r.status === tab);

  const chips: Array<{ tab: Tab; label: string; count: number; tone: string; icon: ReactNode }> = [
    { tab: "all", label: "detected", count: summary.total, tone: "text-ink", icon: null },
    { tab: "ready", label: "ready", count: summary.ready, tone: "text-emerald-700", icon: <CheckCircle2 aria-hidden className="size-4" /> },
    { tab: "duplicate", label: "possible duplicates", count: summary.duplicates, tone: "text-amber-700", icon: <Copy aria-hidden className="size-4" /> },
    { tab: "error", label: summary.missing_team === summary.errors && summary.errors ? "missing team" : "need fixes", count: summary.errors, tone: "text-red-700", icon: <AlertTriangle aria-hidden className="size-4" /> },
    { tab: "skipped", label: "skipped", count: summary.skipped, tone: "text-muted", icon: <CircleSlash aria-hidden className="size-4" /> },
  ];

  const blockers: string[] = [];
  if (summary.duplicates_unresolved) blockers.push(`Choose what to do with ${pluralize(summary.duplicates_unresolved, "possible duplicate")}.`);
  if (!summary.importable) blockers.push("No rows are ready to import yet.");

  return (
    <>
      {/* Summary chips double as filters */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5" role="tablist" aria-label="Filter rows">
        {chips.map((c) => (
          <button
            key={c.tab}
            role="tab"
            aria-selected={tab === c.tab}
            onClick={() => {
              setTab(c.tab);
              setLimit(100);
            }}
            className={cn(
              "rounded-card border bg-surface px-3 py-2 text-left shadow-card transition-colors",
              tab === c.tab ? "border-brand-500 ring-2 ring-brand-500/20" : "border-line hover:border-line-strong",
              c.tab === "all" && "col-span-2 sm:col-span-1",
            )}
          >
            <span className={cn("tabular flex items-center gap-1.5 text-xl font-semibold", c.tone)}>
              {c.icon}
              {c.count}
            </span>
            <span className="text-xs text-muted">{c.label}</span>
          </button>
        ))}
      </div>

      {/* One-click fixes for the common cases */}
      {(summary.missing_team > 0 || summary.exact_unresolved > 0 || summary.errors > 0) && (
        <Card className="mb-3 divide-y divide-line">
          {summary.missing_team > 0 && (
            <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-sm text-ink">
                <Wrench aria-hidden className="size-4 text-muted" />
                <span><strong className="tabular">{summary.missing_team}</strong> {summary.missing_team === 1 ? "row needs" : "rows need"} a team</span>
              </p>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Select aria-label="Team for rows missing a team" value={bulkTeam} onChange={(e) => setBulkTeam(e.target.value)} className="h-8 w-48! py-0">
                  <option value="">Choose a team…</option>
                  {teams.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                <Button size="sm" disabled={!bulkTeam} loading={pending}
                  onClick={() => run(() => bulkFixImport(orgSlug, { importId, action: "assign_team", teamId: bulkTeam }), { onSuccess: () => setBulkTeam("") })}>
                  Assign to all
                </Button>
                <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => bulkFixImport(orgSlug, { importId, action: "allow_unassigned" }))}>
                  Import without team
                </Button>
              </div>
            </div>
          )}
          {summary.exact_unresolved > 0 && (
            <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-sm text-ink">
                <Copy aria-hidden className="size-4 text-muted" />
                <span><strong className="tabular">{summary.exact_unresolved}</strong> exact {summary.exact_unresolved === 1 ? "match is" : "matches are"} already on your roster</span>
              </p>
              <Button size="sm" className="sm:ml-auto" loading={pending} onClick={() => run(() => bulkFixImport(orgSlug, { importId, action: "accept_exact" }))}>
                Use existing for all exact matches
              </Button>
            </div>
          )}
          {summary.errors > summary.missing_team && (
            <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-sm text-ink">
                <AlertTriangle aria-hidden className="size-4 text-muted" />
                <span>Fix rows with problems below, or skip them for now.</span>
              </p>
              <ConfirmButton variant="secondary" confirmLabel={`Skip ${summary.errors} rows?`} disabled={pending}
                onConfirm={() => run(() => bulkFixImport(orgSlug, { importId, action: "skip_errors" }))}>
                Skip all rows with problems
              </ConfirmButton>
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">No rows in this view.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.slice(0, limit).map((r) => {
              const issue = r.issues.find((i) => i.severity === "error") ?? r.issues[0];
              const name = `${r.data.first_name || "—"} ${r.data.last_name || ""}`.trim();
              const team = r.data.team_id ? teamName.get(r.data.team_id) : null;
              const hh = r.household_key?.startsWith("existing:") ? households[r.household_key.slice(9)] : null;
              const match = r.match_player_id ? matched[r.match_player_id] : undefined;
              return (
                <li key={r.id} className={cn("grid gap-2 px-4 py-3 md:grid-cols-[3rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center md:gap-4", r.status === "skipped" && "opacity-60")}>
                  <span className="tabular hidden text-xs text-muted md:block">#{r.row_number}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      <span className="tabular mr-1.5 text-xs font-normal text-muted md:hidden">#{r.row_number}</span>
                      {name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {[r.data.date_of_birth && /^\d{4}-/.test(r.data.date_of_birth) ? formatDate(r.data.date_of_birth) : r.data.date_of_birth, r.data.guardian1_first_name && `${r.data.guardian1_first_name} ${r.data.guardian1_last_name ?? ""}`.trim(), r.data.guardian1_email ?? r.data.guardian1_phone]
                        .filter(Boolean)
                        .join(" · ") || "No other details"}
                    </p>
                  </div>
                  <div className="min-w-0 text-sm">
                    {team ? (
                      <span className="text-ink-soft">{team}</span>
                    ) : r.data.allow_unassigned ? (
                      <span className="text-muted">No team (allowed)</span>
                    ) : r.data.team ? (
                      <span className="text-red-700">“{r.data.team}” not found</span>
                    ) : (
                      <span className="text-muted">No team</span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Home aria-hidden className="size-3" />
                      {hh ? hh : r.household_key?.startsWith("new:") ? "New household" : r.household_key ? "Existing household" : "No household"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <RowStatus row={r} />
                    {r.status === "duplicate" && match && (
                      <p className="mt-0.5 truncate text-xs text-ink-soft">
                        {r.match_reasons[0]} · {match.name}{match.team ? `, ${match.team}` : ""}
                      </p>
                    )}
                    {r.status === "duplicate" && !match && r.match_reasons[0] && <p className="mt-0.5 truncate text-xs text-ink-soft">{r.match_reasons[0]}</p>}
                    {r.status !== "duplicate" && issue && (
                      <p className={cn("mt-0.5 truncate text-xs", issue.severity === "error" ? "text-red-700" : "text-amber-700")}>{issue.message}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 md:justify-end">
                    {r.status === "duplicate" && (
                      <Select
                        aria-label={`Decision for row ${r.row_number}`}
                        value={r.resolution ?? ""}
                        disabled={pending}
                        onChange={(e) => run(() => resolveImportRows(orgSlug, { importId, rowIds: [r.id], resolution: (e.target.value || null) as Resolution | null }))}
                        className={cn("h-8 w-36! py-0 text-sm", !r.resolution && "border-amber-400 text-amber-800")}
                      >
                        <option value="">Choose…</option>
                        {r.match_player_id && <option value="use_existing">{RESOLUTION_LABEL.use_existing}</option>}
                        {r.match_player_id && <option value="link">{RESOLUTION_LABEL.link}</option>}
                        <option value="create">{RESOLUTION_LABEL.create}</option>
                        <option value="skip">{RESOLUTION_LABEL.skip}</option>
                      </Select>
                    )}
                    {r.status === "skipped" ? (
                      <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={pending}
                        onClick={() => run(() => resolveImportRows(orgSlug, { importId, rowIds: [r.id], resolution: null }))}>
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant={r.status === "error" ? "secondary" : "ghost"} icon={<Pencil className="size-3.5" />} onClick={() => setEditing(r)}>
                        {r.status === "error" ? "Fix" : "Edit"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {visible.length > limit && (
          <div className="border-t border-line px-4 py-2.5 text-center">
            <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 200)}>Show more ({visible.length - limit} remaining)</Button>
          </div>
        )}
      </Card>

      <div className="sticky bottom-0 z-10 mt-4 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="text-sm">
            <p className="font-medium text-ink">
              {summary.importable ? `${pluralize(summary.importable, "row")} ready to import` : "Nothing ready to import yet"}
            </p>
            <p className="text-xs text-muted">
              {blockers[0] ?? (summary.errors ? `${pluralize(summary.errors, "row")} with problems will be skipped unless fixed.` : "Everything checks out.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <a href={onRemap} className="inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-control px-3 text-sm font-medium text-ink-soft hover:bg-canvas">
              <ArrowLeft aria-hidden className="size-4" /> Columns
            </a>
            <ConfirmButton size="md" variant="ghost" confirmLabel="Cancel import?" disabled={pending} onConfirm={() => run(() => cancelImport(orgSlug, importId))}>
              Cancel
            </ConfirmButton>
            <Button icon={<Upload className="size-4" />} loading={pending} disabled={blockers.length > 0}
              onClick={() => run(() => commitImport(orgSlug, importId))}>
              Import {summary.importable || ""} {summary.importable === 1 ? "player" : "players"}
            </Button>
          </div>
        </div>
      </div>

      <RowEditorSheet
        orgSlug={orgSlug}
        importId={importId}
        row={editing}
        onClose={() => setEditing(null)}
        teams={teams}
        matched={editing?.match_player_id ? matched[editing.match_player_id] : undefined}
      />
    </>
  );
}

function RowStatus({ row }: { row: ReviewRow }) {
  if (row.status === "ready") return <Badge tone="success">Ready</Badge>;
  if (row.status === "skipped") return <Badge tone="muted">Skipped</Badge>;
  if (row.status === "error") return <Badge tone="danger">Needs fix</Badge>;
  if (row.status === "duplicate" && row.match_type) {
    const m = MATCH_LABEL[row.match_type];
    return (
      <span className="flex flex-wrap items-center gap-1">
        <Badge tone={m.tone}>{m.label}</Badge>
        {row.resolution && <Badge tone="neutral" icon={false}>{RESOLUTION_LABEL[row.resolution]}</Badge>}
      </span>
    );
  }
  return <Badge tone="neutral">{row.status}</Badge>;
}
