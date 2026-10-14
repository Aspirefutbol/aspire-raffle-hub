import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney } from "@/lib/fundraising/money";
import type { MoneyBalances, MoneyProjection } from "@/lib/money/schemas";

export function MoneyTotals({ balances }: { balances: MoneyBalances }) {
  const fields = [
    ["recorded_cents", "Recorded sales (gross)"], ["expected_cents", "Expected money (net sales)"],
    ["received_cents", "Organization receipts (net)"], ["outstanding_cents", "Outstanding money"],
    ["uncleared_cents", "Uncleared checks"], ["exception_cents", "Open check exceptions"],
    ["reconciled_cents", "Reconciled funds"], ["credit_cents", "Unallocated credits"],
    ["adjustment_cents", "Approved liability relief"], ["deposited_cents", "Recorded deposits (historical)"],
  ] as const;
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="money-balances">{fields.map(([field, label]) =>
    <StatCard key={field} label={label} value={<span data-testid={`money-${field}`}>{formatMoney(balances[field])}</span>} />)}</div>;
}

export function ScopedMoney({ money }: { money: MoneyProjection }) {
  return <Card className="mt-5"><CardHeader title="Money status" description="Only balances within your current player/team scope. Sale receipts and private notes are not shared." /><CardBody>
    <MoneyTotals balances={money.totals} />
    <ul className="mt-4 divide-y divide-line">{money.participants.map((p) => <li key={p.id} className="py-3 text-sm" data-testid={`money-player-${p.player_id}`}>
      <strong>{p.player_name}</strong><p>{formatMoney(p.expected_cents)} expected · {formatMoney(p.received_cents)} received · {formatMoney(p.outstanding_cents)} outstanding · {formatMoney(p.reconciled_cents)} reconciled · {formatMoney(p.exception_cents)} exceptions</p>
    </li>)}</ul>
    <p className="mt-3 text-xs text-muted">Organization receipts and refunds are separate from recorded sales. Ticket validity is unchanged by money status. Deposits show historical evidence, not a live bank balance.</p>
  </CardBody></Card>;
}
