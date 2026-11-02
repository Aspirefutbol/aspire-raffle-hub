import { Badge, type Tone } from "@/components/ui/badge";
import { formatMoney, progressPercent } from "@/lib/fundraising/money";

const STATUS_TONES: Record<string, Tone> = { DRAFT: "neutral", READY: "info", ACTIVE: "success", CLOSED: "warning", DRAWN: "info", ARCHIVED: "muted" };

export function CampaignStatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export function GoalProgress({ raisedCents, goalCents, label = "Goal progress" }: { raisedCents: number; goalCents: number | null; label?: string }) {
  const percent = progressPercent(raisedCents, goalCents);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{goalCents && goalCents > 0 ? `${formatMoney(raisedCents)} of ${formatMoney(goalCents)}` : "No goal set"}</span>
        {percent !== null && <span className="tabular font-medium text-ink-soft">{percent}%</span>}
      </div>
      {percent !== null && <progress aria-label={label} max={100} value={Math.min(percent, 100)} className="block h-2 w-full overflow-hidden rounded-full accent-brand-600" />}
    </div>
  );
}
