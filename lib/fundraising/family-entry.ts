import type { CampaignProgress } from "./types";

/** Only RLS-filtered family projections are passed here; this never grants access. */
export function singleActiveFamilyCampaign<T extends Pick<CampaignProgress, "campaign" | "participants">>(
  visible: readonly T[],
  now = Date.now(),
): T | null {
  if (visible.length !== 1) return null;
  const only = visible[0];
  if (only.campaign.status !== "ACTIVE" || !only.participants.some((participant) => participant.status === "active")) return null;
  const start = only.campaign.starts_at ? Date.parse(only.campaign.starts_at) : null;
  const close = only.campaign.sales_close_at ? Date.parse(only.campaign.sales_close_at) : null;
  if ((start !== null && (!Number.isFinite(start) || start > now))
    || (close !== null && (!Number.isFinite(close) || close <= now))) return null;
  return only;
}
