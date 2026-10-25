"use client";
import { useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { RecordSaleButton } from "@/components/campaigns/sale-sheets";
import { updateRequestStatus } from "@/lib/sharing/actions";
import type { InterestRequest } from "@/lib/sharing/schemas";
import type { CampaignProgress } from "@/lib/fundraising/types";
export function RequestInbox({ orgSlug, campaignId, requests, progress }: { orgSlug: string; campaignId: string; requests: InterestRequest[]; progress: CampaignProgress }) {
  return <div className="space-y-4">
    <div className="rounded-control border border-line bg-surface p-3">
      <p className="text-sm font-semibold text-ink">Supporter requests</p>
      <p className="mt-1 text-sm text-ink-soft">Contact the supporter, receive the approved cash or check payment, then complete the sale here.</p>
    </div>
    <ButtonLink className="w-full" variant="secondary" href={`/o/${orgSlug}/fundraising/${campaignId}`}>← Back to my fundraiser</ButtonLink>
    {requests.length === 0 && <p>No requests for your linked players yet.</p>}
    {requests.map(request => <RequestCard key={request.id} {...{ request, orgSlug, campaignId, progress }}/>)}</div>;
}
function RequestCard({ request: r, orgSlug, campaignId, progress }: { request: InterestRequest; orgSlug: string; campaignId: string; progress: CampaignProgress }) {
  const [message, setMessage] = useState(""), [pending, start] = useTransition(), [completedSale, setCompletedSale] = useState(r.sale_id ?? "");
  const participant = progress.participants.find(p => p.id === r.participant_id);
  const closed = ["completed", "declined", "expired"].includes(r.status) || Boolean(completedSale);
  function update(status: "contacted" | "declined" | "expired") {
    start(async () => {
      try {
        const result = await updateRequestStatus(orgSlug, { request: r.id, campaign: campaignId, status });
        setMessage(result.ok ? "Request updated" : result.error);
      } catch { setMessage("Could not confirm. Retry the same status safely."); }
    });
  }

  async function completeFromSale(saleId: string) {
    setCompletedSale(saleId);
    setMessage("Sale recorded. Finishing this supporter request…");
    try {
      const result = await updateRequestStatus(orgSlug, { request: r.id, campaign: campaignId, status: "completed", sale: saleId });
      setMessage(result.ok ? "Completed — tickets were issued and this request is finished." : `Sale completed, but the request still needs attention: ${result.error}`);
    } catch {
      setMessage("Sale completed, but we could not confirm the request status. Your tickets and sale are safe; contact an administrator if this message remains.");
    }
  }
  return <article className="space-y-3 rounded-card border border-line bg-surface p-4" data-testid="interest-request">
    <h2 className="break-words text-lg font-semibold">{r.supporter_name}</h2><p>{participant?.player_name} · {r.requested_quantity} requested · <strong>{r.status}</strong></p>
    <p className="text-xs">{new Date(r.created_at).toLocaleString()} · Prefers {r.preferred_contact}</p>
    <div className="flex flex-wrap gap-4 break-all text-sm underline">{r.supporter_email && <a href={`mailto:${encodeURIComponent(r.supporter_email)}`}>{r.supporter_email}</a>}{r.supporter_phone && <a href={`tel:${r.supporter_phone}`}>{r.supporter_phone}</a>}</div>
    <p className="whitespace-pre-wrap break-words">{r.note}</p>
    {completedSale && <p className="rounded-control border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">Completed — this supporter’s sale has been recorded and tickets were issued.</p>}
    {!closed && <>
      <div className="rounded-control border border-brand-100 bg-brand-50/60 p-3">
        <p className="text-sm font-semibold text-ink">Next step: collect payment</p>
        <p className="mt-1 text-sm text-ink-soft">After you receive the approved cash or check payment, complete the sale below.</p>
      </div>
      {participant && <RecordSaleButton orgSlug={orgSlug} campaignId={campaignId} ticketPriceCents={progress.campaign.ticket_price_cents} ticketPackages={progress.campaign.ticket_packages} participant={participant} label="I received payment — complete sale" prefill={{ buyer_name: r.supporter_name, buyer_email: r.supporter_email ?? "", buyer_phone: r.supporter_phone ?? "", quantity: r.requested_quantity, notes: `Supporter request ${r.id}` }} onRecorded={completeFromSale}/>}
      <details className="border-t border-line pt-1">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-muted">More options</summary>
        <div className="flex flex-wrap gap-2 pb-1">
          <Button variant="secondary" disabled={pending} onClick={() => update("contacted")}>Mark contacted</Button>
          <Button variant="ghost" disabled={pending} onClick={() => update("declined")}>Decline request</Button>
          <Button variant="ghost" disabled={pending} onClick={() => update("expired")}>Mark expired</Button>
        </div>
      </details>
    </>}
    {message && <p role="status" className="text-sm text-ink-soft">{message}</p>}
    {closed && <ButtonLink className="w-full" variant="secondary" href={`/o/${orgSlug}/fundraising/${campaignId}`}>Back to my fundraiser</ButtonLink>}
  </article>;
}
