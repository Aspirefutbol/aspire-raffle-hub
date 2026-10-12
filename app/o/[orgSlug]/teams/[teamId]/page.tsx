import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamHeaderActions } from "@/components/roster/team-header-actions";
import { TeamRoster } from "@/components/roster/team-roster";
import { TeamStatusBadge } from "@/components/roster/status-badges";
import { PageHeader } from "@/components/ui/page-header";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { label } from "@/lib/roster/constants";
import { getTeam, listSeasons } from "@/lib/roster/queries";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ orgSlug: string; teamId: string }> }) {
  const { orgSlug, teamId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read");
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) notFound();

  const [result, seasons] = await Promise.all([getTeam(ctx.organization.id, teamId), listSeasons(ctx.organization.id)]);
  if (!result) notFound();
  const { team, players } = result;
  const archived = Boolean(team.archived_at);
  const canWrite = can(ctx, "roster.write");

  return (
    <>
      <PageHeader
        breadcrumb={<Link href={`/o/${orgSlug}/teams`} className="hover:text-ink">Teams</Link>}
        title={
          <span className="flex items-center gap-2">
            {team.name} <TeamStatusBadge status={archived ? "archived" : team.status} />
          </span>
        }
        description={
          [team.seasons?.name, team.age_group, team.gender_division && label(team.gender_division), team.coach_name && `Coach: ${team.coach_name}`, team.team_code]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          canWrite && (
            <TeamHeaderActions
              orgSlug={orgSlug}
              archived={archived}
              playerCount={players.length}
              seasons={seasons.filter((s) => !s.archived_at).map((s) => ({ id: s.id, name: s.name }))}
              team={{
                id: team.id,
                name: team.name,
                season_id: team.season_id,
                age_group: team.age_group,
                gender_division: team.gender_division,
                coach_name: team.coach_name,
                team_code: team.team_code,
                status: team.status === "inactive" ? "inactive" : "active",
              }}
            />
          )
        }
      />
      <TeamRoster
        orgSlug={orgSlug}
        teamId={team.id}
        teamName={team.name}
        archived={archived}
        canWrite={canWrite}
        players={players.flatMap((p) =>
          p.id && p.first_name && p.last_name
            ? [{ ...p, id: p.id, first_name: p.first_name, last_name: p.last_name }]
            : [],
        )}
      />
    </>
  );
}
