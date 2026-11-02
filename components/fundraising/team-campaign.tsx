import { ArrowRight, Users } from "lucide-react";
import { CampaignStatusBadge, GoalProgress } from "@/components/campaigns/progress";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, progressPercent } from "@/lib/fundraising/money";
import type { CampaignParticipantProgress, CampaignProgress } from "@/lib/fundraising/types";

function FollowUp({ participant }: { participant: CampaignParticipantProgress }) {
  if (participant.status === "withdrawn") return <Badge tone="neutral" icon={false}>Withdrawn</Badge>;
  if (participant.tickets_sold === 0) return <Badge tone="warning">No sales</Badge>;
  const percent = progressPercent(participant.raised_cents, participant.goal_amount_cents);
  if (percent !== null && percent < 25) return <Badge tone="warning">Low progress</Badge>;
  if (percent !== null && percent >= 100) return <Badge tone="success">Goal met</Badge>;
  return <Badge tone="info" icon={false}>On track</Badge>;
}

/** Team scope is selected by the server query. This does not read family
 * participation or let team visibility authorize any ticket/money mutation. */
export function TeamCampaignView({ orgSlug, progress, detail = false }: {
  orgSlug: string;
  progress: CampaignProgress;
  detail?: boolean;
}) {
  const campaign = progress.campaign;
  return (
    <section data-testid="team-campaign" data-campaign-id={campaign.id}>
      <Card>
        <CardHeader
          title={<span className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-words">{campaign.name}</span> <CampaignStatusBadge status={campaign.status} /></span>}
          description="Progress from recorded cash and check sales for your assigned teams."
          action={!detail ? <ButtonLink href={`/o/${orgSlug}/team-fundraising/${campaign.id}`} variant="ghost" size="sm" icon={<ArrowRight aria-hidden className="size-4" />}>View progress</ButtonLink> : undefined}
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Assigned teams raised" value={<span className="break-all text-xl">{formatMoney(progress.totals.raised_cents)}</span>} />
            <StatCard label="Tickets sold" value={progress.totals.tickets_sold} />
            <StatCard label="Participating players" value={progress.totals.player_count} icon={<Users aria-hidden className="size-4" />} />
          </div>
          {progress.teams.length === 0 ? (
            <EmptyState title="No participating players match" description="Choose another team or ask your campaign administrator about enrollment." />
          ) : progress.teams.map((team) => {
            const players = progress.participants.filter((participant) => participant.team_id === team.id);
            const needsFollowUp = players.filter((participant) => participant.status === "active" && (
              participant.tickets_sold === 0 || (progressPercent(participant.raised_cents, participant.goal_amount_cents) ?? 100) < 25
            )).length;
            return (
              <section key={team.id} className="overflow-hidden rounded-card border border-line bg-surface" data-team-id={team.id}>
                <div className="space-y-3 border-b border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="min-w-0 break-words text-base font-semibold text-ink">{team.name}</h3>
                    <span className="text-xs text-muted">{team.player_count} players · {team.tickets_sold} tickets sold</span>
                  </div>
                  <p className="text-xs font-medium text-ink-soft">Team goal</p>
                  <GoalProgress raisedCents={team.raised_cents} goalCents={team.goal_amount_cents} label="Team goal" />
                  <p className="text-xs text-muted">{needsFollowUp} player{needsFollowUp === 1 ? "" : "s"} with zero sales or low progress</p>
                </div>
                {detail && (
                  <>
                    <div className="hidden md:block">
                      <Table>
                        <THead><tr><TH>Player</TH><TH>Amount raised</TH><TH>Tickets</TH><TH>Personal goal</TH><TH>Follow-up</TH></tr></THead>
                        <TBody>
                          {players.map((participant) => (
                            <TR key={participant.id}>
                              <TD className="font-medium text-ink">{participant.player_name}</TD>
                              <TD className="tabular">{formatMoney(participant.raised_cents)}</TD>
                              <TD className="tabular">{participant.tickets_sold}</TD>
                              <TD className="min-w-48"><GoalProgress raisedCents={participant.raised_cents} goalCents={participant.goal_amount_cents} /></TD>
                              <TD><FollowUp participant={participant} /></TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                    <ul className="divide-y divide-line md:hidden">
                      {players.map((participant) => (
                        <li key={participant.id} className="space-y-3 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="min-w-0 break-words font-medium text-ink">{participant.player_name}</h4>
                            <FollowUp participant={participant} />
                          </div>
                          <p className="tabular text-sm text-ink-soft">{formatMoney(participant.raised_cents)} raised · {participant.tickets_sold} tickets sold</p>
                          <GoalProgress raisedCents={participant.raised_cents} goalCents={participant.goal_amount_cents} label="Personal goal" />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            );
          })}
        </CardBody>
      </Card>
    </section>
  );
}
