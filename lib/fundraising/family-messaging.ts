export type FamilyCampaignDisplayState = Readonly<{
  label: string;
  tone: "warning" | "info";
}>;

export function familyCampaignDisplayState(
  status: string,
  startsAt: string | null,
  salesCloseAt: string | null,
  now = Date.now(),
): FamilyCampaignDisplayState | null {
  if (status !== "ACTIVE") return null;
  if (salesCloseAt && new Date(salesCloseAt).getTime() <= now) return { label: "Sales closed", tone: "warning" };
  if (startsAt && new Date(startsAt).getTime() > now) return { label: "Starts soon", tone: "info" };
  return null;
}

export function fundraisingEncouragement(
  raisedCents: number,
  goalCents: number | null,
  ticketsSold: number,
): string {
  if (!goalCents || goalCents <= 0) {
    return ticketsSold > 0
      ? `Nice work — ${ticketsSold} ticket${ticketsSold === 1 ? "" : "s"} sold so far.`
      : "Share your raffle link to get started.";
  }
  const percent = Math.floor((raisedCents / goalCents) * 100);
  if (percent >= 150) return "Amazing — 150% of goal and still helping Aspire. Keep pushing for the team.";
  if (percent >= 125) return "Goal reached and growing — every extra sale helps Aspire.";
  if (percent >= 100) return "Goal reached — celebrate it, then keep pushing for the team.";
  if (percent >= 75) return "Almost there — you’re in the final stretch.";
  if (percent >= 50) return "Halfway there — keep the momentum going.";
  if (percent >= 25) return "Great start — you’re building momentum.";
  if (ticketsSold > 0) return "Nice start — every sale moves you closer to your goal.";
  return "Share your raffle link to get started.";
}
