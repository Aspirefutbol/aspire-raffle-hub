// Human-readable descriptions for audit events shown in activity feeds.

const LABELS: Record<string, string> = {
  PLAYER_CREATED: "Player added",
  PLAYER_IMPORTED: "Player imported",
  PLAYER_UPDATED: "Player details updated",
  PLAYER_ARCHIVED: "Player archived",
  PLAYER_RESTORED: "Player restored",
  PLAYER_TEAM_CHANGED: "Team changed",
  PLAYER_GUARDIAN_LINKED: "Guardian linked",
  PLAYER_GUARDIAN_UNLINKED: "Guardian unlinked",
  PLAYER_GUARDIAN_UPDATED: "Guardian link updated",
  TEAM_CREATED: "Team created",
  TEAM_UPDATED: "Team updated",
  TEAM_ARCHIVED: "Team archived",
  TEAM_RESTORED: "Team restored",
  HOUSEHOLD_CREATED: "Household created",
  HOUSEHOLD_IMPORTED: "Household imported",
  HOUSEHOLD_UPDATED: "Household updated",
  HOUSEHOLD_ARCHIVED: "Household archived",
  GUARDIAN_CREATED: "Guardian added",
  GUARDIAN_IMPORTED: "Guardian imported",
  GUARDIAN_UPDATED: "Guardian updated",
  GUARDIAN_ARCHIVED: "Guardian removed",
  IMPORT_STARTED: "Import started",
  IMPORT_COMPLETED: "Import completed",
  IMPORT_CANCELLED: "Import cancelled",
  MEMBER_ADDED: "Member added",
  ROLE_CHANGED: "Role changed",
  ROLE_GRANTED: "Role granted",
  ROLE_REVOKED: "Role removed",
  INVITATION_CREATED: "Invitation sent",
  INVITATION_RESENT: "Invitation resent",
  INVITATION_ACCEPTED: "Invitation accepted",
  INVITATION_REVOKED: "Invitation revoked",
  INVITATION_EXPIRED: "Invitation expired",
  TEAM_STAFF_CREATED: "Team access granted",
  TEAM_STAFF_ARCHIVED: "Team access removed",
  FAMILY_LINK_CREATED: "Family account linked",
  FAMILY_LINK_ARCHIVED: "Family account unlinked",
  PLATFORM_ADMIN_GRANTED: "Platform admin granted",
  PLATFORM_ADMIN_REVOKED: "Platform admin revoked",
  ORGANIZATION_PROTECTED_CHANGED: "Protected settings changed (platform)",
  ORGANIZATION_STATUS_CHANGED: "Organization status changed",
  CAMPAIGN_CREATED: "Campaign created",
  CAMPAIGN_UPDATED: "Campaign updated",
  CAMPAIGN_STATUS_CHANGED: "Campaign status changed",
  MEMBER_STATUS_CHANGED: "Member status changed",
  ORGANIZATION_UPDATED: "Organization settings updated",
  SEASON_CREATED: "Season created",
  SEASON_UPDATED: "Season updated",
};

const FIELD_LABELS: Record<string, string> = {
  first_name: "first name",
  last_name: "last name",
  preferred_name: "preferred name",
  date_of_birth: "date of birth",
  external_player_id: "external ID",
  household_id: "household",
  is_primary_contact: "primary contact",
  communication_preferences: "communication preferences",
};

export function describeAction(action: string): string {
  return LABELS[action] ?? action.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function describeChangedFields(fields: string[] | null | undefined): string | null {
  const shown = (fields ?? []).filter((f) => !["status", "archived_at", "source_import_id"].includes(f));
  if (!shown.length) return null;
  return shown.map((f) => FIELD_LABELS[f] ?? f.replace(/_/g, " ")).join(", ");
}
