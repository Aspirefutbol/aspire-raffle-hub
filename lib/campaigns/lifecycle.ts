// Mirrors the campaign state machine in supabase/migrations/20261012000200_campaign_lifecycle.sql.
// The database (transition_campaign + guard_campaign_write) is authoritative; this
// mirror lets the server return clear errors and the UI offer only valid actions.
import type { Permission } from "@/lib/permissions";

export const CAMPAIGN_STATUSES = ["DRAFT", "READY", "ACTIVE", "CLOSED", "DRAWN", "ARCHIVED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  DRAFT: ["READY", "ARCHIVED"],
  READY: ["DRAFT", "ACTIVE"],
  ACTIVE: ["CLOSED"],
  CLOSED: ["DRAWN"],
  DRAWN: ["ARCHIVED"],
  ARCHIVED: [],
};

/** Fields frozen once a campaign is ACTIVE (ticket-critical and legal disclosure). */
export const CAMPAIGN_LOCKED_FIELDS = [
  "name", "campaign_type", "season_id", "ticket_price_cents", "ticket_prefix", "jurisdiction_mode",
  "timezone", "starts_at", "draw_at", "operator_legal_name", "operator_address", "rules_text", "rules_version",
] as const;

export function isCampaignStatus(value: string): value is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

export function transitionPermission(from: CampaignStatus, to: CampaignStatus): Permission {
  if (to === "READY" || to === "DRAFT" || to === "CLOSED") return "campaigns.manage";
  if (from === "DRAFT" && to === "ARCHIVED") return "campaigns.manage";
  return "campaigns.activate";
}

/** Every transition except DRAFT → READY needs a reason (≥3 characters). */
export function transitionNeedsReason(from: CampaignStatus, to: CampaignStatus): boolean {
  return !(from === "DRAFT" && to === "READY");
}

/** Fields an update may touch in the given status (null = none). */
export function editableFieldsFilter(status: CampaignStatus): ((field: string) => boolean) | null {
  if (status === "DRAFT" || status === "READY") return () => true;
  if (status === "ACTIVE") return (f) => !(CAMPAIGN_LOCKED_FIELDS as readonly string[]).includes(f);
  return null;
}
