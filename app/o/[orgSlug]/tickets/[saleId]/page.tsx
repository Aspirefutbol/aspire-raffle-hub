import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintTicketsButton } from "@/components/fundraising/print-tickets-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext } from "@/lib/auth/org-context";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/fundraising/money";
import { getSaleTicketReceipt, type TicketReceipt } from "@/lib/fundraising/ticket-receipt";

export const metadata: Metadata = { title: "Issued raffle tickets" };

function addressLines(address: TicketReceipt["operator_address"]): string[] {
  if (!address) return [];
  const cityRegion = [address.city, address.region].filter(Boolean).join(", ");
  const cityLine = [cityRegion, address.postal_code].filter(Boolean).join(" ");
  return [address.line1, address.line2, cityLine, address.country].filter((part): part is string => Boolean(part));
}

export default async function IssuedTicketsPage({ params }: { params: Promise<{ orgSlug: string; saleId: string }> }) {
  const { orgSlug, saleId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const receipt = await getSaleTicketReceipt(ctx, saleId);
  if (!receipt) notFound();

  const missingDisclosure = !receipt.operator_legal_name || !receipt.operator_address
    || receipt.ticket_price_cents === null || !receipt.prize_description || !receipt.draw_at;
  const timezone = receipt.timezone || ctx.organization.timezone;
  const address = addressLines(receipt.operator_address);

  return <>
    <div className="print:hidden">
      <PageHeader
        breadcrumb={<Link href={`/o/${orgSlug}`} className="hover:text-ink">Home</Link>}
        title="Issued raffle tickets"
        description={`${receipt.campaign_name} · Sale ${receipt.sale_id}`}
        actions={<PrintTicketsButton />}
      />
      {missingDisclosure && <div className="mb-5 rounded-control border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This historical sale is missing one or more current compliance disclosures. Do not use it as a live legal ticket until the campaign disclosure package is complete.</div>}
    </div>

    <div className="space-y-6 print:space-y-0">
      {receipt.tickets.map((ticket) => {
        const voided = receipt.reversed || ticket.status === "VOIDED";
        return <article key={ticket.ticket_number} data-testid="issued-ticket" className="print:break-after-page print:p-0">
          <Card className="overflow-hidden print:border-2 print:border-black print:shadow-none">
            <CardHeader
              title={<span className="flex flex-wrap items-center gap-2"><span>Issued Raffle Ticket</span>{voided && <Badge tone="danger">VOIDED</Badge>}</span>}
              description={receipt.campaign_name}
            />
            <CardBody className="space-y-5">
              {voided && <div className="rounded-control border-2 border-red-400 bg-red-50 p-4 text-center text-lg font-bold text-red-800">VOIDED — NOT ELIGIBLE FOR DRAWING</div>}
              <div className="rounded-card border border-line bg-canvas p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-muted">Ticket number</p>
                <p className="mt-1 break-all font-mono text-2xl font-bold text-ink">{ticket.ticket_number}</p>
              </div>

              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Organization conducting raffle</dt><dd className="mt-1 font-semibold text-ink">{receipt.operator_legal_name || "Not recorded"}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Organization / officer address</dt><dd className="mt-1 whitespace-pre-line text-ink">{address.length ? address.join("\n") : "Not recorded"}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Ticket price</dt><dd className="mt-1 font-semibold text-ink">{receipt.ticket_price_cents === null ? "Not recorded" : formatMoney(receipt.ticket_price_cents)}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Prize award / drawing date</dt><dd className="mt-1 font-semibold text-ink">{receipt.draw_at ? `${formatDateTime(receipt.draw_at, timezone)} · ${timezone}` : "Not recorded"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-muted">Prize description(s)</dt><dd className="mt-1 whitespace-pre-wrap text-ink">{receipt.prize_description || "Not recorded"}</dd></div>
              </dl>

              {receipt.charitable_purpose && <div><p className="text-xs font-medium uppercase tracking-wide text-muted">Charitable purpose of proceeds</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{receipt.charitable_purpose}</p></div>}

              <div className="border-t border-line pt-4 text-xs text-muted">
                <p>Buyer: {receipt.buyer_name} · Sale reference: {receipt.sale_id}</p>
                <p className="mt-1">Recorded {formatDateTime(receipt.sold_at, timezone)} · Payment recorded offline by {receipt.payment_method === "cash" ? "cash" : "check"}.</p>
                {(receipt.support_email || receipt.support_phone) && <p className="mt-1">Support: {[receipt.support_email, receipt.support_phone].filter(Boolean).join(" · ")}</p>}
              </div>
              {receipt.rules_text && <details className="print:block"><summary className="cursor-pointer text-sm font-medium text-ink-soft print:hidden">Raffle rules</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted print:text-black">{receipt.rules_text}</p></details>}
            </CardBody>
          </Card>
        </article>;
      })}
    </div>
  </>;
}
