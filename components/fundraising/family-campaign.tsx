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
import { familyCampaignDisplayState, fundraisingEncouragement } from "@/lib/fundraising/family-messaging";
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
  const displayState = familyCampaignDisplayState(campaign.status, campaign.starts_at, campaign.sales_close_at);
  return (
    <section data-testid="family-campaign" data-campaign-id={campaign.id}>
      <Card>
        <CardHeader
          title={<span className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-words">{campaign.name}</span> {displayState ? <Badge tone={displayState.tone}>{displayState.label}</Badge> : <CampaignStatusBadge status={campaign.status} />}</span>}
          description={`${progress.totals.player_count} participating linked player${progress.totals.player_count === 1 ? "" : "s"} · Based on recorded cash and check sales.`}
          action={!detail ? <ButtonLink href={`/o/${orgSlug}/fundraising/${campaign.id}`} variant="ghost" size="sm">View raffle</ButtonLink> : undefined}
        />
        <CardBody className="space-y-4">
          {detail && <details className="rounded-control border border-line bg-surface px-4 py-2">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-ink">How does this work?</summary>
            <ol className="space-y-2 pb-3 text-sm text-ink-soft">
              <li><strong className="text-ink">1. Share:</strong> Send your raffle link to friends and family.</li>
              <li><strong className="text-ink">2. Follow up:</strong> Check requests and receive approved cash or check payment.</li>
              <li><strong className="text-ink">3. Record:</strong> Record the completed sale so tickets are issued and progress updates.</li>
            </ol>
          </details>}
          <p className="text-xs text-muted">
            Sales close {formatDate(campaign.sales_close_at, timeZone)}
            {campaign.ticket_price_cents != null && <> · {ticketOfferText(campaign.ticket_price_cents, campaign.ticket_packages)}</>}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {progress.participants.map((participant) => {
              const unavailable = saleUnavailable(progress, participant);
              const encouragement = fundraisingEncouragement(participant.raised_cents, participant.goal_amount_cents, participant.tickets_sold);
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
                  <p data-testid="fundraising-encouragement" className="mt-2 rounded-control border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm font-medium text-brand-800">{encouragement}</p>
                  <div className="my-4 rounded-control border border-line bg-surface p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                      <Ticket aria-hidden className="size-4 text-muted" /> {participant.available_tickets} tickets available
                    </p>
                    {participant.ticket_range.first && (
                      <details className="mt-2 border-t border-line pt-1" data-testid="inventory-details">
                        <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-ink-soft">
                          View assigned ticket numbers
                        </summary>
                        <p className="pb-1 break-all text-xs text-muted">
                          Assigned numbers: <span className="font-mono">{participant.ticket_range.first}</span>
                          {participant.ticket_range.last !== participant.ticket_range.first && <> – <span className="font-mono">{participant.ticket_range.last}</span></>}
                        </p>
                        <p className="pb-2 text-xs text-muted">These are your assigned tickets, not supporter entries. Tickets are issued only after an approved offline payment and recorded sale.</p>
                      </details>
                    )}
                  </div>
                  <div className="space-y-3">
                    {detail && participant.status === "active" && <SellerTools orgSlug={orgSlug} participantId={participant.id} price={campaign.ticket_price_cents} ticketPackages={campaign.ticket_packages}/>}
                    {detail && <div className="space-y-2 rounded-control border border-line bg-surface p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Step 2</p>
                      <p className="text-base font-semibold text-ink">Check requests and receive payment</p>
                      <p className="text-sm text-ink-soft">If someone requested tickets, contact them and receive the approved cash or check payment before recording the sale.</p>
                      <ButtonLink className="w-full" variant="secondary" href={`/o/${orgSlug}/fundraising/${campaign.id}/requests`}>Check supporter requests</ButtonLink>
                    </div>}
                    <div className="space-y-2 rounded-control border border-line bg-surface p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Step 3</p>
                      <p className="text-base font-semibold text-ink">Received payment? Record the sale</p>
                      <p className="text-sm text-ink-soft">Only do this after you have the approved cash or check payment. Recording the sale issues the tickets and updates your progress.</p>
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
