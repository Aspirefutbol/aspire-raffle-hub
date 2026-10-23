import { SellerTools } from "@/components/sharing/seller-tools";
import { Ticket } from "lucide-react";
import { CampaignStatusBadge, GoalProgress } from "@/components/campaigns/progress";
import { RecordSaleButton } from "@/components/campaigns/sale-sheets";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/fundraising/money";
import { ticketOfferText } from "@/lib/fundraising/campaign-pricing";
import type { CampaignParticipantProgress, CampaignProgress } from "@/lib/fundraising/types";

function saleUnavailable(progress: CampaignProgress, participant: CampaignParticipantProgress): string | null {
  if (participant.can_record_sale) return null;
  if (participant.status === "withdrawn") return "This player’s participation has ended. Previous sales remain in their progress.";
  if (progress.campaign.status !== "ACTIVE"
    || (progress.campaign.sales_close_at && new Date(progress.campaign.sales_close_at).getTime() <= Date.now())) return "Ticket sales are closed for this raffle.";
  if (participant.available_tickets === 0) return "Ask your campaign administrator for more tickets.";
  if (progress.campaign.starts_at && new Date(progress.campaign.starts_at).getTime() > Date.now()) return "Ticket sales have not started yet.";
  return "Sale recording is currently unavailable. Contact your campaign administrator.";
}

/** Every record passed here came from the explicit family projection, even for
 * members who also manage teams or hold an organization-wide read permission. */
export function FamilyCampaignView({ orgSlug, progress, detail = false, timeZone }: {
  orgSlug: string;
  progress: CampaignProgress;
  detail?: boolean;
  timeZone: string;
}) {
  const campaign = progress.campaign;
  return (
    <section data-testid="family-campaign" data-campaign-id={campaign.id}>
      <Card>
        <CardHeader
          title={<span className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-words">{campaign.name}</span> <CampaignStatusBadge status={campaign.status} /></span>}
          description={`${progress.totals.player_count} participating linked player${progress.totals.player_count === 1 ? "" : "s"} · Based on recorded cash and check sales.`}
          action={!detail ? <ButtonLink href={`/o/${orgSlug}/fundraising/${campaign.id}`} variant="ghost" size="sm">View raffle</ButtonLink> : undefined}
        />
        <CardBody className="space-y-4">
          {detail && <div className="rounded-card border border-line bg-surface p-4" aria-label="How to use your Aspire raffle">
            <h2 className="text-base font-semibold text-ink">Your raffle in 3 easy steps</h2>
            <ol className="mt-3 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
              <li><strong className="block text-ink">1. Share your link</strong>Friends and family can request tickets. A request is not a sale.</li>
              <li><strong className="block text-ink">2. Record the sale</strong>After an authorized adult receives cash or a check, record the completed sale below.</li>
              <li><strong className="block text-ink">3. Check progress</strong>See tickets sold and money recorded for each player.</li>
            </ol>
          </div>}
          <p className="text-xs text-muted">
            Sales close {formatDate(campaign.sales_close_at, timeZone)}
            {campaign.ticket_price_cents != null && <> · {ticketOfferText(campaign.ticket_price_cents, campaign.ticket_packages)}</>}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {progress.participants.map((participant) => {
              const unavailable = saleUnavailable(progress, participant);
              return (
                <article key={participant.id} data-testid="family-player-card" data-player-id={participant.player_id}
                  className="min-w-0 rounded-card border border-line bg-canvas/40 p-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-semibold text-ink">{participant.player_name}</h3>
                      <p className="mt-0.5 text-xs text-muted">{participant.team_name ?? "No team assigned"}</p>
                    </div>
                    {participant.status === "withdrawn" && <Badge tone="neutral" icon={false}>Withdrawn</Badge>}
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted">Amount raised</p>
                      <p className="tabular mt-1 break-words text-xl font-semibold text-ink">{formatMoney(participant.raised_cents)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Tickets sold</p>
                      <p className="tabular mt-1 text-xl font-semibold text-ink">{participant.tickets_sold}</p>
                    </div>
                  </div>
                  <p className="mb-1.5 text-xs font-medium text-ink-soft">Personal fundraising goal</p>
                  <GoalProgress raisedCents={participant.raised_cents} goalCents={participant.goal_amount_cents} label="Personal fundraising goal" />
                  <div className="my-4 rounded-control border border-line bg-surface p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                      <Ticket aria-hidden className="size-4 text-muted" /> {participant.available_tickets} tickets available
                    </p>
                    {participant.ticket_range.first && (
                      <p className="mt-1 break-all text-xs text-muted">
                        Assigned span: <span className="font-mono">{participant.ticket_range.first}</span>
                        {participant.ticket_range.last !== participant.ticket_range.first && <> – <span className="font-mono">{participant.ticket_range.last}</span></>}
                      </p>
                    )}
                  </div>
                  <div className="space-y-3">
                    {detail && participant.status === "active" && <SellerTools orgSlug={orgSlug} participantId={participant.id} price={campaign.ticket_price_cents} ticketPackages={campaign.ticket_packages}/>}
                    {detail && <ButtonLink variant="secondary" href={`/o/${orgSlug}/fundraising/${campaign.id}/requests`}>Check supporter requests</ButtonLink>}
                    <div className="space-y-2 rounded-control border border-line bg-surface p-3">
                      <p className="text-sm font-semibold text-ink">Received payment? Record a sale</p>
                      <p className="text-xs text-muted">Only an authorized seller should record tickets after receiving cash or a check.</p>
                      <RecordSaleButton orgSlug={orgSlug} campaignId={campaign.id} ticketPriceCents={campaign.ticket_price_cents} ticketPackages={campaign.ticket_packages}
                        participant={participant} className="w-full" label="Record completed sale" />
                      {unavailable && <p className="text-xs text-muted">{unavailable}</p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </CardBody>
      </Card>
      {detail && progress.recent_sales.length > 0 && <Card className="mt-5">
        <CardHeader title="Issued tickets" description="Reopen or print recorded raffle tickets. Reversed sales remain visible as historical records." />
        <CardBody className="divide-y divide-line p-0">
          {progress.recent_sales.map((sale) => <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{sale.ticket_numbers.join(", ")}</p>
              <p className="mt-1 text-xs text-muted">{formatDateTime(sale.sold_at, timeZone)} · {formatMoney(sale.amount_cents)} · {sale.payment_method === "cash" ? "Cash" : "Check"}</p>
              {sale.reversed && <Badge className="mt-2" tone="muted">Reversed / voided</Badge>}
            </div>
            <ButtonLink href={`/o/${orgSlug}/tickets/${sale.id}`} variant="secondary" size="sm">View / print</ButtonLink>
          </div>)}
        </CardBody>
      </Card>}
    </section>
  );
}
