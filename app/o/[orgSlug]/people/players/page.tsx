import { Upload, Users, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AddPlayerButton } from "@/components/roster/add-player";
import { DuplicatePairs } from "@/components/roster/duplicate-pairs";
import { PlayersDirectory } from "@/components/roster/players-directory";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterSelect, SearchInput } from "@/components/ui/url-filters";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import {
  listPlayers,
  listSeasons,
  listTeamOptions,
  type PlayerIssue,
  type PlayerStatusFilter,
} from "@/lib/roster/queries";

export const metadata: Metadata = { title: "Players" };

const ISSUES: Record<PlayerIssue, string> = {
  unassigned: "Players who need a team",
  "no-guardian": "Players without a guardian",
  duplicates: "Possible duplicate players",
};
const STATUSES: PlayerStatusFilter[] = ["active", "inactive", "archived", "all"];

type SearchParams = { q?: string; team?: string; season?: string; status?: string; issue?: string; import?: string; page?: string };

export default async function PlayersPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read");
  const orgId = ctx.organization.id;
  const canWrite = can(ctx, "roster.write");

  const issue = sp.issue && sp.issue in ISSUES ? (sp.issue as PlayerIssue) : undefined;
  const status = STATUSES.includes(sp.status as PlayerStatusFilter) ? (sp.status as PlayerStatusFilter) : "active";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, teams, seasons] = await Promise.all([
    listPlayers(orgId, { q: sp.q, team: sp.team, season: sp.season, status, issue, importId: sp.import && /^[0-9a-f-]{36}$/i.test(sp.import) ? sp.import : undefined, page }),
    listTeamOptions(orgId),
    listSeasons(orgId),
  ]);

  const byId = new Map(result.rows.map((r) => [r.id, r]));
  const duplicateReasons = new Map(result.pairs.flatMap((p) => [[p.player_a_id, p.reason], [p.player_b_id, p.reason]]));
  const pairViews = result.pairs.flatMap((p) => {
    const a = byId.get(p.player_a_id);
    const b = byId.get(p.player_b_id);
    if (!a?.id || !b?.id || !a.first_name || !b.first_name || !a.last_name || !b.last_name) return [];
    return [{ a: { ...a, id: a.id, first_name: a.first_name, last_name: a.last_name }, b: { ...b, id: b.id, first_name: b.first_name, last_name: b.last_name }, reason: p.reason }];
  });

  const filtered = Boolean(sp.q || sp.team || sp.season || issue || sp.import || status !== "active");
  const base = `/o/${orgSlug}/people/players`;
  const hrefFor = (n: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string" && v) as [string, string][]);
    next.set("page", String(n));
    return `${base}?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Players"
        description={`${result.total} ${status === "all" ? "" : status + " "}player${result.total === 1 ? "" : "s"}${filtered ? " match" : ""}`}
        actions={
          canWrite && (
            <>
              <AddPlayerButton orgSlug={orgSlug} teams={teams} defaultTeamId={sp.team && sp.team !== "none" ? sp.team : undefined} />
              {can(ctx, "roster.import") && (
                <ButtonLink href={`${base}/import`} variant="secondary" icon={<Upload className="size-4" />}>Import</ButtonLink>
              )}
            </>
          )
        }
      />

      {issue && (
        <div className="mb-3 flex items-center gap-2 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">{ISSUES[issue]}</span>
          <span className="text-amber-800">· {result.total}</span>
          <Link href={base} className="ml-auto inline-flex items-center gap-1 text-amber-900 hover:underline">
            <X aria-hidden className="size-3.5" /> Clear
          </Link>
        </div>
      )}

      {sp.import && (
        <div className="mb-3 flex items-center gap-2 rounded-control border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <span className="font-medium">Players added by an import</span>
          <span>· {result.total}</span>
          <Link href={base} className="ml-auto inline-flex items-center gap-1 hover:underline">
            <X aria-hidden className="size-3.5" /> Clear
          </Link>
        </div>
      )}

      {issue === "duplicates" && <DuplicatePairs orgSlug={orgSlug} pairs={pairViews} canWrite={canWrite} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search players" className="w-full sm:w-64" />
        <FilterSelect param="team" label="Team" options={[{ value: "none", label: "No team" }, ...teams.map((t) => ({ value: t.value, label: t.label }))]} />
        <FilterSelect param="season" label="Season" options={seasons.map((s) => ({ value: s.id, label: s.name }))} />
        <FilterSelect
          param="status"
          label="Status"
          allLabel="Active"
          options={[
            { value: "inactive", label: "Inactive" },
            { value: "archived", label: "Archived" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        <PlayersDirectory
          orgSlug={orgSlug}
          canWrite={canWrite}
          teams={teams.map((t) => ({ value: t.value, label: t.label }))}
          players={result.rows.flatMap((r) =>
            r.id && r.first_name && r.last_name
              ? [{
                  ...r,
                  id: r.id,
                  first_name: r.first_name,
                  last_name: r.last_name,
                  archived: Boolean(r.archived_at),
                  note: issue === "duplicates" ? duplicateReasons.get(r.id) : undefined,
                }]
              : [],
          )}
          emptyState={
            <EmptyState
              icon={<Users className="size-5" />}
              title={filtered ? (issue ? "All clear — nothing to fix here" : "No players match these filters") : "Your roster is empty"}
              description={filtered ? undefined : "Import your roster from a spreadsheet, or add players one at a time."}
              action={
                filtered ? (
                  <ButtonLink href={base} variant="secondary">Clear filters</ButtonLink>
                ) : canWrite ? (
                  <>
                    <ButtonLink href={`${base}/import`} icon={<Upload className="size-4" />}>Import players</ButtonLink>
                    <AddPlayerButton orgSlug={orgSlug} teams={teams} variant="secondary" />
                  </>
                ) : undefined
              }
            />
          }
        />
        {result.total > result.pageSize && <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={hrefFor} />}
      </Card>
    </>
  );
}
