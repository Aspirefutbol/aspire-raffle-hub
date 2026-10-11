import { AlertTriangle, ArrowRight, CheckCircle2, FileSpreadsheet, Home, ListChecks, Upload, UserX, Users, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AddPlayerButton } from "@/components/roster/add-player";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { can, requireOrgContext } from "@/lib/auth/org-context";
import { buildActionItems, getRosterOverview } from "@/lib/dashboard/overview";
import { formatRelative } from "@/lib/format";
import { IMPORT_STATUS } from "@/lib/roster/import/status";
import { listHouseholdOptions, listTeamOptions } from "@/lib/roster/queries";

export const metadata: Metadata = { title: "Dashboard" };


export default async function DashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const base = `/o/${orgSlug}`;
  const canWrite = can(ctx, "roster.write");
  const canImport = can(ctx, "roster.import");

  const [overview, teams, households] = await Promise.all([
    getRosterOverview(ctx.organization.id),
    canWrite ? listTeamOptions(ctx.organization.id) : Promise.resolve([]),
    canWrite ? listHouseholdOptions(ctx.organization.id) : Promise.resolve([]),
  ]);
  const actions = buildActionItems(overview, base, canImport);
  const issues = overview.unassigned_players + overview.possible_duplicates + overview.households_missing_contact + overview.players_without_guardian;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={ctx.organization.name}
        actions={
          <>
            {canWrite && <AddPlayerButton orgSlug={orgSlug} teams={teams} households={households} />}
            {canImport && (
              <ButtonLink href={`${base}/people/players/import`} variant="secondary" icon={<Upload className="size-4" />}>
                Import Players
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ListChecks aria-hidden className="size-4 text-amber-600" /> Action needed
              </span>
            }
            description={actions.length ? "Click an item to go straight to the records." : undefined}
          />
          {actions.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-5" />}
              title="Nothing needs attention"
              description="Your roster is complete: every player has a team, and every household has contact information."
            />
          ) : (
            <ul className="divide-y divide-line">
              {actions.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="group flex items-center gap-3 px-4 py-3 hover:bg-canvas/70">
                    <AlertTriangle aria-hidden className="size-4 shrink-0 text-amber-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">
                        <span className="tabular font-semibold">{item.count}</span> {item.label}
                      </span>
                      <span className="block truncate text-xs text-muted">{item.description}</span>
                    </span>
                    <span className="hidden items-center gap-1 text-sm font-medium text-brand-700 group-hover:underline sm:flex">
                      {item.cta} <ArrowRight aria-hidden className="size-3.5" />
                    </span>
                    <ArrowRight aria-hidden className="size-4 text-muted sm:hidden" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <StatCard label="Total players" value={overview.total_players} icon={<Users className="size-4" />} href={`${base}/people/players`} />
          <StatCard label="Active teams" value={overview.active_teams} icon={<UsersRound className="size-4" />} href={`${base}/teams`} />
          <StatCard label="Households" value={overview.households} icon={<Home className="size-4" />} href={`${base}/people/households`} />
          <StatCard
            label="Unassigned players"
            value={overview.unassigned_players}
            icon={<UserX className="size-4" />}
            tone={overview.unassigned_players ? "attention" : "default"}
            href={`${base}/people/players?issue=unassigned`}
          />
          <StatCard label="Roster issues" value={issues} icon={<AlertTriangle className="size-4" />} tone={issues ? "attention" : "default"} hint="Teams, duplicates, contacts" />
          <StatCard
            label="Recent imports"
            value={overview.recent_imports.length}
            icon={<FileSpreadsheet className="size-4" />}
            href={canImport ? `${base}/people/players/import` : undefined}
            hint={overview.recent_imports[0] ? `Last ${formatRelative(overview.recent_imports[0].created_at)}` : "None yet"}
          />
        </div>
      </div>

      {canImport && (
        <Card className="mt-4">
          <CardHeader
            title="Recent imports"
            action={<Link href={`${base}/people/players/import`} className="text-sm font-medium text-brand-700 hover:underline">View all</Link>}
          />
          {overview.recent_imports.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="size-5" />}
              title="No imports yet"
              description="Bring in your whole roster from a spreadsheet in a few minutes."
              action={<ButtonLink href={`${base}/people/players/import`} icon={<Upload className="size-4" />}>Import players</ButtonLink>}
            />
          ) : (
            <ul className="divide-y divide-line">
              {overview.recent_imports.map((imp) => {
                const status = IMPORT_STATUS[imp.status] ?? { tone: "info" as const, label: imp.status };
                const created = typeof imp.summary?.players_created === "number" ? imp.summary.players_created : null;
                return (
                  <li key={imp.id}>
                    <Link href={`${base}/people/players/import/${imp.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas/70">
                      <FileSpreadsheet aria-hidden className="size-4 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{imp.file_name}</span>
                      <span className="hidden text-xs text-muted sm:inline">
                        {imp.row_count} rows{created !== null ? ` · ${created} added` : ""} · {formatRelative(imp.created_at)}
                      </span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
