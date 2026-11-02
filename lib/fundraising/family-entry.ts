import type { CampaignProgress } from "./types";

/**
 * Select the one currently sellable family fundraiser from RLS-scoped progress.
 * Prior READY/CLOSED/DRAWN campaigns must not force an extra selection step.
 * This is presentation-only; it never authorizes or changes participation.
 */
export function singleActiveFamilyCampaign<T extends Pick<CampaignProgress, "campaign" | "participants">>(
  visible: readonly T[],
  now = Date.now(),
): T | null {
  let onlyEligible: T | null = null;
  for (const candidate of visible) {
    if (candidate.campaign.status !== "ACTIVE"
      || !candidate.participants.some((participant) => participant.status === "active")) continue;
    const start = candidate.campaign.starts_at ? Date.parse(candidate.campaign.starts_at) : null;
    const close = candidate.campaign.sales_close_at ? Date.parse(candidate.campaign.sales_close_at) : null;
    if ((start !== null && (!Number.isFinite(start) || start > now))
      || (close !== null && (!Number.isFinite(close) || close <= now))) continue;
    if (onlyEligible) return null; // Two live fundraisers require an explicit choice.
    onlyEligible = candidate;
  }
  return onlyEligible;
}
