import type { Permission } from "@/lib/permissions";

export const FUNDRAISING_VIEWS = ["admin", "family", "team"] as const;
export type FundraisingView = (typeof FUNDRAISING_VIEWS)[number];

export const VIEW_PERMISSIONS: Readonly<Record<FundraisingView, Permission>> = {
  admin: "campaigns.read",
  family: "roster.read_own_family",
  team: "roster.read_assigned_teams",
};

export function canReadFundraising(permissions: ReadonlySet<Permission>, view: FundraisingView): boolean {
  return permissions.has(VIEW_PERMISSIONS[view]);
}

/** A capability gate only. SQL checks the specific linked player and inventory. */
export function canRecordSale(permissions: ReadonlySet<Permission>): boolean {
  return saleScopeAuthority(permissions) !== null;
}

/** Read authority never upgrades a family's sale authority to organization scope. */
export function saleScopeAuthority(permissions: ReadonlySet<Permission>): "organization" | "family" | null {
  if (!permissions.has("tickets.issue")) return null;
  if (permissions.has("organization.manage")) return "organization";
  return permissions.has("roster.read_own_family") ? "family" : null;
}

export function canReverseSale(permissions: ReadonlySet<Permission>): boolean {
  return permissions.has("tickets.void") && permissions.has("adjustments.approve");
}
