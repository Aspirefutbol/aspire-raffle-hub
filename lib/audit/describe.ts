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
