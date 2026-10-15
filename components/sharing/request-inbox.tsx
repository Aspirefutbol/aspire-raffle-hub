"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RecordSaleButton } from "@/components/campaigns/sale-sheets";
import { updateRequestStatus } from "@/lib/sharing/actions";
import type { InterestRequest } from "@/lib/sharing/schemas";
import type { CampaignProgress } from "@/lib/fundraising/types";
export function RequestInbox({ orgSlug, campaignId, requests, progress }: { orgSlug: string; campaignId: string; requests: InterestRequest[]; progress: CampaignProgress }) {
  return <div className="space-y-4"><p>Showing up to 200 newest requests. Requests do not hold inventory. Follow up, receive approved offline payment, then use Record sale. After confirming the sale result, link its reference separately. Marking a request completed does not collect money or issue tickets.</p>
    {requests.length === 0 && <p>No requests for your linked players yet.</p>}
    {requests.map(request => <RequestCard key={request.id} {...{ request, orgSlug, campaignId, progress }}/>)}</div>;
}
function RequestCard({ request: r, orgSlug, campaignId, progress }: { request: InterestRequest; orgSlug: string; campaignId: string; progress: CampaignProgress }) {
  const [message, setMessage] = useState(""), [pending, start] = useTransition(), [sale, setSale] = useState("");
  const participant = progress.participants.find(p => p.id === r.participant_id);
  const closed = ["completed", "declined", "expired"].includes(r.status);
  function update(status: "contacted" | "completed" | "declined" | "expired") {
    start(async () => {
      try {
        const result = await updateRequestStatus(orgSlug, { request: r.id, campaign: campaignId, status, sale: status === "completed" ? sale : undefined });
        setMessage(result.ok ? "Request status confirmed" : result.error);
      } catch { setMessage("Could not confirm. Retry the same status safely."); }
    });
  }
  return <article className="space-y-3 rounded-card border border-line bg-surface p-4" data-testid="interest-request">
    <h2 className="break-words text-lg font-semibold">{r.supporter_name}</h2><p>{participant?.player_name} · {r.requested_quantity} requested · <strong>{r.status}</strong></p>
    <p className="text-xs">{new Date(r.created_at).toLocaleString()} · Prefers {r.preferred_contact}</p>
    <div className="flex flex-wrap gap-4 break-all text-sm underline">{r.supporter_email && <a href={`mailto:${encodeURIComponent(r.supporter_email)}`}>{r.supporter_email}</a>}{r.supporter_phone && <a href={`tel:${r.supporter_phone}`}>{r.supporter_phone}</a>}</div>
    <p className="whitespace-pre-wrap break-words">{r.note}</p>
    {r.sale_id && <p className="break-all text-xs">Recorded sale reference: {r.sale_id}. Any later reversal/correction remains in sale history; this request does not change it.</p>}
    {!closed && <><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending} onClick={() => update("contacted")}>Mark contacted</Button><Button variant="ghost" disabled={pending} onClick={() => update("declined")}>Decline</Button><Button variant="ghost" disabled={pending} onClick={() => update("expired")}>Expire</Button></div>
      {participant && <RecordSaleButton orgSlug={orgSlug} campaignId={campaignId} ticketPriceCents={progress.campaign.ticket_price_cents} participant={participant} prefill={{ buyer_name: r.supporter_name, buyer_email: r.supporter_email ?? "", buyer_phone: r.supporter_phone ?? "", quantity: r.requested_quantity, notes: `Supporter request ${r.id}` }} onRecorded={id => setSale(id)}/>}
      <label className="block text-sm">Confirmed recorded sale reference<input aria-label="Confirmed recorded sale reference" className="mt-1 block w-full min-w-0 rounded-control border border-line p-2" value={sale} onChange={e => setSale(e.target.value)} placeholder="Paste the existing sale UUID or record above"/></label>
      <Button disabled={pending || !sale} onClick={() => update("completed")}>Link sale and complete request</Button>
    </>}
    {message && <p role="status">{message}</p>}
  </article>;
}
