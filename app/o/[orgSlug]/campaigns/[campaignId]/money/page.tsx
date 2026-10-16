import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyTotals } from "@/components/money/balances";
import { MoneyOperationForm } from "@/components/money/operation-form";
import { HelpLink } from "@/components/learning/help-link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { can, requireOrgContext } from "@/lib/auth/org-context";
import { formatMoney } from "@/lib/fundraising/money";
import { canReadMoney, getCampaignMoney } from "@/lib/money/queries";

export const metadata = { title: "Money & reconciliation" };
export default async function MoneyPage({ params }: { params: Promise<{ orgSlug: string; campaignId: string }> }) {
  const { orgSlug, campaignId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!canReadMoney(ctx)) notFound();
  const money = await getCampaignMoney(ctx, campaignId);
  if (!money) notFound();
  const canReceive = can(ctx, "reconciliation.manage");
  const canAdjust = can(ctx, "adjustments.approve");
  const sellers = new Map(money.sellers.map((s) => [s.id, s.name]));
  return <>
    <PageHeader title="Money & reconciliation" description="Track sales, money turned in, checks, deposits, and corrections without erasing history."
      breadcrumb={<Link href={`/o/${orgSlug}/campaigns/${campaignId}`}>Campaign</Link>} actions={<>{(canReceive || canAdjust) && <ButtonLink href="#record-money">Record money</ButtonLink>}{can(ctx, "organization.manage") && <HelpLink orgSlug={orgSlug} article="understand-money-balances" label="Money guide" />}</>} />
    <MoneyTotals balances={money.totals} />
    <p className="my-4 text-sm text-muted">Money received is cash or checks turned in, minus refunds and returned checks. Reconciled money excludes uncleared checks. Deposits are historical records, not a bank balance. Money actions do not change ticket validity or the drawing.</p>
    {(canReceive || canAdjust) && <div id="record-money" className="scroll-mt-4"><Card className="mb-5"><CardHeader title="Record money received / adjustments" description="Record cash or checks turned in, check outcomes, refunds, credits, adjustments, and deposits. Every entry stays in audit history." /><CardBody><MoneyOperationForm orgSlug={orgSlug} campaignId={campaignId} money={money} canReceive={canReceive} canAdjust={canAdjust} /></CardBody></Card></div>}
    {[{ title: "Seller balances", entries: money.sellers }, { title: "Team balances", entries: money.teams }].map(({ title, entries }) => <Card className="mb-5" key={title}><CardHeader title={title} /><CardBody><ul className="divide-y divide-line">{entries.map((s) => <li key={s.id ?? "unassigned"} className="py-3 text-sm"><strong>{s.name ?? "No team"}</strong><p>{formatMoney(s.expected_cents)} expected · {formatMoney(s.received_cents)} received · {formatMoney(s.outstanding_cents)} outstanding · {formatMoney(s.reconciled_cents)} reconciled · {formatMoney(s.exception_cents)} exceptions</p></li>)}</ul></CardBody></Card>)}
    <Card className="mb-5"><CardHeader title="Player balances" /><CardBody><ul className="divide-y divide-line">{money.participants.map((p) => <li key={p.id} className="py-3 text-sm"><strong>{p.player_name}</strong> · {p.team_name ?? "No team"}<p>{formatMoney(p.expected_cents)} expected · {formatMoney(p.received_cents)} received · {formatMoney(p.outstanding_cents)} outstanding · {formatMoney(p.reconciled_cents)} reconciled · {formatMoney(p.exception_cents)} exceptions</p></li>)}</ul></CardBody></Card>
    <Card><CardHeader title="Money history" description="Turn-ins, check outcomes, refunds, credits, adjustments, and deposits stay available for audit." /><CardBody>
      {!money.events.length && <p className="text-sm text-muted">No money has been turned in or adjusted yet. Recorded sales alone do not mean the organization has received money.</p>}
      <ol className="divide-y divide-line">{money.events.map((e) => <li key={e.id} className="space-y-1 py-3 text-sm" data-testid={`money-event-${e.kind}`}>
        <p className="font-medium">{e.kind.replaceAll("_", " ")} · {formatMoney(e.amount_cents)}{e.payment_method ? ` · ${e.payment_method}` : ""} · {sellers.get(e.seller_id) ?? "Seller"}</p>
        <p>{e.reason}{e.reference ? ` · Reference: ${e.reference}` : ""}</p>
        <p className="break-all text-xs text-muted">{e.occurred_at} · Event {e.id} · Actor {e.actor_id}{e.receipt_id ? ` · Receipt ${e.receipt_id}` : ""}</p>
        {(e.sale_id || e.target_sale_id) && <p className="break-all text-xs text-muted">{e.sale_id ? `Source sale ${e.sale_id}` : ""}{e.target_sale_id ? ` → Destination sale ${e.target_sale_id}` : ""}</p>}
      </li>)}</ol>
    </CardBody></Card>
  </>;
}
