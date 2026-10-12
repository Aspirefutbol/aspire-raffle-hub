import { CheckCircle2, CircleSlash, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MappingStep } from "@/components/import/mapping-step";
import { ReviewStep, type ReviewRow } from "@/components/import/review-step";
import type { MatchedPlayer } from "@/components/import/row-editor";
import { ImportStepper } from "@/components/import/stepper";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { formatDate, formatDateTime, fullName } from "@/lib/format";
import type { ColumnMapping } from "@/lib/roster/import/fields";
import { type ImportSummary, summarize } from "@/lib/roster/import/pipeline";
import { getImport, loadImportRows, sanitizeMapping } from "@/lib/roster/import/server";
import { type MatchType, parseRowData, type Resolution, type RowIssue, type RowStatus } from "@/lib/roster/import/types";
import { listTeamOptions } from "@/lib/roster/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string; importId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { orgSlug, importId } = await params;
  const { step } = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.import");
  if (!/^[0-9a-f-]{36}$/i.test(importId)) notFound();

  const supabase = await createClient();
  const imp = await getImport(supabase, ctx.organization.id, importId);
  if (!imp) notFound();
  const base = `/o/${orgSlug}/people/players/import`;
  const header = (
    <PageHeader
      breadcrumb={<Link href={base} className="hover:text-ink">Import players</Link>}
      title={imp.file_name}
      description={`${imp.row_count} rows · uploaded ${formatDateTime(imp.created_at, ctx.organization.timezone)}`}
    />
  );

  // ── Cancelled ──
  if (imp.status === "cancelled") {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<CircleSlash className="size-5" />}
            title="This import was cancelled"
            description="Nothing from this file was added to your roster."
            action={<ButtonLink href={base}>Start a new import</ButtonLink>}
          />
        </Card>
      </>
    );
  }

  // ── Summary ──
  if (imp.status === "completed") {
    const s = (imp.summary ?? {}) as Record<string, number>;
    return (
      <>
        {header}
        <ImportStepper current={4} />
        <Card className="mb-4">
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <div className="mb-3 rounded-full bg-emerald-50 p-3 text-emerald-600"><CheckCircle2 aria-hidden className="size-7" /></div>
            <h2 className="text-lg font-semibold text-ink">Import complete</h2>
            <p className="mt-1 text-sm text-muted">
              Finished {formatDateTime(imp.completed_at, ctx.organization.timezone)}. Every change is recorded in the activity log.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <ButtonLink href={`/o/${orgSlug}/people/players?import=${imp.id}&status=all`} icon={<Users className="size-4" />}>View imported players</ButtonLink>
              <ButtonLink href={`/o/${orgSlug}/dashboard`} variant="secondary">Go to dashboard</ButtonLink>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Players added" value={s.players_created ?? 0} />
          <StatCard label="Matched existing" value={(s.players_linked ?? 0) + (s.players_matched_existing ?? 0)} hint={`${s.players_linked ?? 0} merged · ${s.players_matched_existing ?? 0} unchanged`} />
          <StatCard label="Households created" value={s.households_created ?? 0} hint={`${s.guardians_created ?? 0} guardians added`} />
          <StatCard label="Rows skipped" value={s.rows_skipped ?? 0} hint={`${s.team_assignments ?? 0} team assignments`} />
        </div>
      </>
    );
  }

  const rows = await loadImportRows(supabase, imp.id);
  const mapping: ColumnMapping = sanitizeMapping((imp.column_mapping ?? {}) as Record<string, unknown>, imp.headers);

  // ── Map columns ──
  if (imp.status === "uploaded" || step === "map") {
    const samples: Record<string, string[]> = {};
    for (const h of imp.headers) {
      const values: string[] = [];
      for (const r of rows) {
        const v = (r.raw as Record<string, string> | null)?.[h];
        if (v && !values.includes(v)) values.push(v.length > 40 ? `${v.slice(0, 40)}…` : v);
        if (values.length === 3) break;
      }
      samples[h] = values;
    }
    return (
      <>
        {header}
        <ImportStepper current={1} />
        <MappingStep
          orgSlug={orgSlug}
          importId={imp.id}
          fileName={imp.file_name}
          headers={imp.headers}
          initialMapping={mapping}
          samples={samples}
          rowCount={imp.row_count}
          sourceName={imp.source_name}
          alreadyValidated={imp.status === "validated"}
        />
      </>
    );
  }

  // ── Review & resolve ──
  const reviewRows: ReviewRow[] = rows.map((r) => ({
    id: r.id,
    row_number: r.row_number,
    data: parseRowData(r.data),
    status: r.status as RowStatus,
    issues: (Array.isArray(r.issues) ? r.issues : []) as unknown as RowIssue[],
    match_type: r.match_type as MatchType | null,
    match_player_id: r.match_player_id,
    match_reasons: r.match_reasons ?? [],
    resolution: r.resolution as Resolution | null,
    household_key: r.household_key,
  }));
  const summary: ImportSummary = summarize(reviewRows.map((r) => ({ ...r, match_type: r.match_type ?? "NEW_RECORD" })));

  const matchIds = [...new Set(reviewRows.flatMap((r) => (r.match_player_id ? [r.match_player_id] : [])))];
  const householdIds = [...new Set(reviewRows.flatMap((r) => (r.household_key?.startsWith("existing:") ? [r.household_key.slice(9)] : [])))];
  const [teams, matchedRows, householdRows] = await Promise.all([
    listTeamOptions(ctx.organization.id),
    matchIds.length
      ? supabase
          .from("player_directory")
          .select("id, first_name, last_name, preferred_name, date_of_birth, team_name, household_name, primary_guardian_name, external_player_id")
          .in("id", matchIds)
      : Promise.resolve({ data: [], error: null }),
    householdIds.length ? supabase.from("households").select("id, name").in("id", householdIds) : Promise.resolve({ data: [], error: null }),
  ]);

  const matched: Record<string, MatchedPlayer> = {};
  for (const p of matchedRows.data ?? []) {
    if (!p.id) continue;
    matched[p.id] = {
      name: fullName({ first_name: p.first_name ?? "", last_name: p.last_name ?? "", preferred_name: p.preferred_name }),
      dob: p.date_of_birth ? formatDate(p.date_of_birth) : null,
      team: p.team_name,
      household: p.household_name,
      guardian: p.primary_guardian_name,
      external_id: p.external_player_id,
    };
  }

  return (
    <>
      {header}
      <ImportStepper current={2} />
      <ReviewStep
        orgSlug={orgSlug}
        importId={imp.id}
        rows={reviewRows}
        summary={summary}
        matched={matched}
        teams={teams.map((t) => ({ value: t.value, label: t.label }))}
        households={Object.fromEntries((householdRows.data ?? []).map((h) => [h.id, h.name]))}
        onRemap={`${base}/${imp.id}?step=map`}
      />
    </>
  );
}
