// Mirrors the role/permission catalog in supabase/migrations (0100 + 1100).
// The database is authoritative (RLS + has_org_permission / has_platform_permission);
// this file lets the server return clear errors and the UI hide what a user can't do.
// lib/permissions/catalog.test.ts checks it stays consistent.

/** Organization-scoped permission keys (granted through organization roles). */
export const PERMISSIONS = [
  "organization.manage",
  "members.read",
  "members.manage",
  "roster.read",
  "roster.write",
  "roster.import",
  "audit.read",
  "campaigns.read",
  "campaigns.manage",
  "campaigns.activate",
  "tickets.issue",
  "tickets.void",
  "reconciliation.manage",
  "adjustments.approve",
  "drawing.manage",
  "drawing.certify",
  "exports.run",
] as const;

/** Platform-scoped permission keys (SUPER_ADMIN only; never grantable to org roles). */
export const PLATFORM_PERMISSIONS = ["platform.organizations", "platform.admins"] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const ORGANIZATION_ROLES = [
  "DIRECTOR",
  "ORGANIZATION_ADMIN",
  "CAMPAIGN_MANAGER",
  "FINANCE_ADMIN",
  "TEAM_CAPTAIN",
  "AUDITOR",
  "PARTICIPANT_FAMILY",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type RoleKey = OrganizationRole | "SUPER_ADMIN";

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Platform Admin",
  DIRECTOR: "Director",
  ORGANIZATION_ADMIN: "Organization Admin",
  CAMPAIGN_MANAGER: "Campaign Manager",
  FINANCE_ADMIN: "Finance Admin",
  TEAM_CAPTAIN: "Team Manager / Captain",
  AUDITOR: "Auditor (read-only)",
  PARTICIPANT_FAMILY: "Seller / Family",
};

export const ROLE_DESCRIPTIONS: Record<OrganizationRole, string> = {
  DIRECTOR: "Governance: activates and closes out campaigns, approves write-offs, certifies drawings.",
  ORGANIZATION_ADMIN: "Day-to-day operations: roster, members, settings, campaigns, corrections.",
  CAMPAIGN_MANAGER: "Sets up and runs campaigns; reads the roster.",
  FINANCE_ADMIN: "Records turn-ins and reconciles seller funds; exports.",
  TEAM_CAPTAIN: "Team-level follow-up (team-scoped access arrives with campaigns).",
  AUDITOR: "Read-only: roster, members, campaigns, activity log, exports.",
  PARTICIPANT_FAMILY: "Sells tickets for their player(s) once campaigns launch.",
};

/** Permissions each organization role grants (must match role_permissions). */
export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  DIRECTOR: ["roster.read", "members.read", "audit.read", "campaigns.read", "campaigns.activate", "adjustments.approve", "drawing.certify", "exports.run"],
  ORGANIZATION_ADMIN: [
    "organization.manage", "members.read", "members.manage", "roster.read", "roster.write", "roster.import", "audit.read",
    "campaigns.read", "campaigns.manage", "tickets.issue", "tickets.void", "reconciliation.manage", "drawing.manage", "exports.run",
  ],
  CAMPAIGN_MANAGER: ["roster.read", "members.read", "campaigns.read", "campaigns.manage", "tickets.void", "drawing.manage"],
  FINANCE_ADMIN: ["roster.read", "campaigns.read", "reconciliation.manage", "exports.run"],
  TEAM_CAPTAIN: [],
  AUDITOR: ["roster.read", "members.read", "audit.read", "campaigns.read", "exports.run"],
  PARTICIPANT_FAMILY: ["tickets.issue"],
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isOrganizationRole(value: string): value is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(value);
}

/**
 * Mirrors public.can_assign_role(): a user may grant or revoke a role only if
 * they hold members.manage and every permission the role grants.
 */
export function canAssignRole(granted: ReadonlySet<Permission>, role: OrganizationRole, isPlatformAdmin = false): boolean {
  if (isPlatformAdmin) return true;
  return granted.has("members.manage") && ROLE_PERMISSIONS[role].every((p) => granted.has(p));
}

export function permissionsForRoles(roles: readonly OrganizationRole[]): Set<Permission> {
  return new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]));
}
