import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney } from "@/lib/fundraising/money";
import type { MoneyBalances, MoneyProjection } from "@/lib/money/schemas";

export function MoneyTotals({ balances }: { balances: MoneyBalances }) {
  const fields = [
    ["recorded_cents", "Recorded sales (total)"], ["expected_cents", "Money expected"],
    ["received_cents", "Money received"], ["outstanding_cents", "Money still due"],
    ["uncleared_cents", "Uncleared checks"], ["exception_cents", "Check issues"],
    ["reconciled_cents", "Reconciled money"], ["credit_cents", "Available credits"],
    ["adjustment_cents", "Approved balance adjustments"], ["deposited_cents", "Deposits recorded"],
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
    <p className="mt-3 text-xs text-muted">Money received and refunds are tracked separately from recorded sales. Money status does not change ticket validity. Deposits are historical records, not a live bank balance.</p>
  </CardBody></Card>;
}
