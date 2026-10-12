import type { Metadata } from "next";
import { TeamsView } from "@/components/roster/teams-view";
import { PageHeader } from "@/components/ui/page-header";
import { FilterSelect, SearchInput } from "@/components/ui/url-filters";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { listSeasons, listTeams } from "@/lib/roster/queries";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ season?: string; view?: string; q?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read");

  const showingArchived = sp.view === "archived";
  const [seasons, allTeams] = await Promise.all([
    listSeasons(ctx.organization.id),
    listTeams(ctx.organization.id, { includeArchived: true, seasonId: sp.season || null, q: sp.q }),
  ]);
  const teams = allTeams.filter((t) => (showingArchived ? t.archived_at : !t.archived_at));
  const current = seasons.find((s) => s.is_current) ?? null;

  return (
    <>
      <PageHeader
        title="Teams"
        description={`${teams.length} ${showingArchived ? "archived" : "active"} team${teams.length === 1 ? "" : "s"}`}
      />
      <TeamsView
        toolbar={
          <>
            <SearchInput placeholder="Search teams" className="w-full sm:w-64" />
            <FilterSelect param="season" label="Season" options={seasons.map((s) => ({ value: s.id, label: s.name }))} />
            <FilterSelect param="view" label="Show" allLabel="Active" options={[{ value: "archived", label: "Archived" }]} />
          </>
        }
        orgSlug={orgSlug}
        teams={teams.map((t) => ({
          id: t.id,
          name: t.name,
          season_id: t.season_id,
          season_name: t.season_name,
          age_group: t.age_group,
          gender_division: t.gender_division,
          coach_name: t.coach_name,
          team_code: t.team_code,
          status: t.status === "inactive" ? "inactive" : "active",
          player_count: t.player_count,
          archived: Boolean(t.archived_at),
        }))}
        seasons={seasons.filter((s) => !s.archived_at).map((s) => ({ id: s.id, name: s.name }))}
        defaultSeasonId={current?.id ?? null}
        canWrite={can(ctx, "roster.write")}
        showingArchived={showingArchived}
        filtered={Boolean(sp.q || sp.season)}
      />
    </>
  );
}
