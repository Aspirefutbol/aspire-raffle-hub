// Mirrors the permission/role catalog seeded in supabase/migrations/…0100_foundation.sql.
// The database is authoritative (RLS + has_org_permission); this file exists so the
// server can return clear errors and the UI can hide actions a user cannot take.

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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ORGANIZATION_ROLES = [
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
  SUPER_ADMIN: "Super Admin",
  ORGANIZATION_ADMIN: "Organization Admin",
  CAMPAIGN_MANAGER: "Campaign Manager",
  FINANCE_ADMIN: "Finance Admin",
  TEAM_CAPTAIN: "Team Captain",
  AUDITOR: "Auditor (read-only)",
  PARTICIPANT_FAMILY: "Participant / Family",
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isOrganizationRole(value: string): value is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(value);
}

export function hasPermission(granted: ReadonlySet<Permission>, needed: Permission): boolean {
  return granted.has(needed);
}
