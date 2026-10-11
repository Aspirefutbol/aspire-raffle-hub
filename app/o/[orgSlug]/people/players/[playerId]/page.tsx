import { ArrowRightLeft, CalendarClock, History, Megaphone, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PlayerGuardiansCard,
  PlayerHeaderActions,
  PlayerHouseholdCard,
  PlayerTeamControl,
} from "@/components/roster/player-profile";
import { PlayerStatusBadge } from "@/components/roster/status-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { describeAction, describeChangedFields } from "@/lib/audit/describe";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { age, formatDate, formatDateTime, fullName } from "@/lib/format";
import { label } from "@/lib/roster/constants";
import { getPlayerProfile, listTeamOptions } from "@/lib/roster/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Player" };

export default async function PlayerPage({ params }: { params: Promise<{ orgSlug: string; playerId: string }> }) {
  const { orgSlug, playerId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read");
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) notFound();

  const canWrite = can(ctx, "roster.write");
  const [profile, teams] = await Promise.all([
    getPlayerProfile(ctx, playerId),
    listTeamOptions(ctx.organization.id),
  ]);
  if (!profile) notFound();
  const { player, guardians, history, activity } = profile;
  if (!player.id || !player.first_name || !player.last_name) notFound();
  const archived = Boolean(player.archived_at);
  const name = fullName({ first_name: player.first_name!, last_name: player.last_name!, preferred_name: player.preferred_name });
  const years = age(player.date_of_birth);

  // Resolve actor names for the activity feed (profiles visible via shared org).
  const actorIds = [...new Set(activity.map((a) => a.actor_id).filter((v): v is string => Boolean(v)))];
  const actors = new Map<string, string>();
  if (actorIds.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const p of data ?? []) actors.set(p.id, p.full_name || p.email);
  }
  const teamNames = new Map(teams.map((t) => [t.value, t.name]));

  const details: Array<[string, React.ReactNode]> = [
    ["Date of birth", player.date_of_birth ? `${formatDate(player.date_of_birth)}${years !== null ? ` (age ${years})` : ""}` : "—"],
    ["Preferred name", player.preferred_name ?? "—"],
    ["Gender", player.gender ? label(player.gender) : "—"],
    ["External ID", player.external_player_id ?? "—"],
    ["Added", `${formatDate(player.created_at)} · ${player.source === "import" ? "Import" : player.source === "self_registration" ? "Self-registration" : "Manual"}`],
  ];

  return (
    <>
      <PageHeader
        breadcrumb={<Link href={`/o/${orgSlug}/people/players`} className="hover:text-ink">Players</Link>}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {name}
            <PlayerStatusBadge status={archived ? "archived" : player.status} />
            {!archived && !player.team_id && <Badge tone="warning">No team</Badge>}
          </span>
        }
        description={[player.preferred_name && `${player.first_name} ${player.last_name}`, player.team_name, player.season_name].filter(Boolean).join(" · ") || undefined}
        actions={
          canWrite && (
            <PlayerHeaderActions
              orgSlug={orgSlug}
              archived={archived}
              player={{
                id: player.id,
                first_name: player.first_name!,
                last_name: player.last_name!,
                preferred_name: player.preferred_name,
                date_of_birth: player.date_of_birth,
                gender: player.gender,
                external_player_id: player.external_player_id,
                notes: player.notes,
                status: player.status === "inactive" ? "inactive" : "active",
              }}
            />
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Player information" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {details.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="text-ink">{v}</dd>
                  </div>
                ))}
                {player.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Notes</dt>
                    <dd className="whitespace-pre-wrap text-ink">{player.notes}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          <PlayerGuardiansCard
            orgSlug={orgSlug}
            playerId={player.id}
            householdId={player.household_id}
            canWrite={canWrite && !archived}
            guardians={guardians.map((g) => ({
              ...g,
              communication_preferences: g.communication_preferences as { email?: boolean; sms?: boolean } | null,
            }))}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Campaign participation" />
              <EmptyState icon={<Megaphone className="size-5" />} title="No campaigns yet" description="Campaigns arrive in the next phase. This player can be added from the master roster." />
            </Card>
            <Card>
              <CardHeader title="Fundraising history" />
              <EmptyState icon={<Trophy className="size-5" />} title="Nothing yet" description="Tickets sold and funds raised will appear here once campaigns run." />
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Current team" />
            <CardBody className="space-y-3">
              {canWrite && !archived ? (
                <PlayerTeamControl key={player.team_id ?? "none"} orgSlug={orgSlug} playerId={player.id} teamId={player.team_id} teams={teams} />
              ) : (
                <p className="text-sm text-ink">{player.team_name ?? "No team"}</p>
              )}
              {history.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted"><History aria-hidden className="size-3.5" /> Team history</p>
                  <ol className="space-y-1.5 text-sm">
                    {history.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span className={m.ended_at ? "text-ink-soft" : "font-medium text-ink"}>
                          {m.teams?.name ?? "Team"}
                          {m.teams?.seasons?.name && <span className="text-xs font-normal text-muted"> · {m.teams.seasons.name}</span>}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(m.started_at)} – {m.ended_at ? formatDate(m.ended_at) : "now"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </CardBody>
          </Card>

          <PlayerHouseholdCard
            orgSlug={orgSlug}
            playerId={player.id}
            playerLastName={player.last_name!}
            household={player.household_id && player.household_name ? { id: player.household_id, name: player.household_name } : null}
           
            canWrite={canWrite && !archived}
          />

          {can(ctx, "audit.read") && (
            <Card>
              <CardHeader title="Activity" />
              {activity.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">No activity recorded.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {activity.map((a) => {
                    const meta = (a.metadata ?? {}) as Record<string, unknown>;
                    const teamChange =
                      a.action === "PLAYER_TEAM_CHANGED"
                        ? `${teamNames.get(String(meta.from_team_id)) ?? (meta.from_team_id ? "Archived team" : "No team")} → ${teamNames.get(String(meta.to_team_id)) ?? (meta.to_team_id ? "Archived team" : "No team")}`
                        : null;
                    const fields = a.action === "PLAYER_UPDATED" ? describeChangedFields(a.changed_fields) : null;
                    return (
                      <li key={a.id} className="flex gap-2.5 px-4 py-2.5">
                        {a.action === "PLAYER_TEAM_CHANGED" ? (
                          <ArrowRightLeft aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted" />
                        ) : (
                          <CalendarClock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted" />
                        )}
                        <div className="min-w-0 text-sm">
                          <p className="text-ink">{describeAction(a.action)}</p>
                          {(teamChange || fields) && <p className="truncate text-xs text-ink-soft">{teamChange ?? fields}</p>}
                          <p className="text-xs text-muted">
                            {formatDateTime(a.occurred_at, ctx.organization.timezone)}
                            {a.actor_id ? ` · ${actors.get(a.actor_id) ?? "Team member"}` : " · System"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
