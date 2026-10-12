import { normalizeEmail, normalizeGender, normalizeName, normalizePhone, normalizeRelationship, parseDate } from "./normalize";
import type { RowData, RowIssue, TeamRef } from "./types";

const teamKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Resolves a team name or code (case/spacing-insensitive), preferring the current season. */
export function matchTeam(input: string | null, teams: TeamRef[]): TeamRef | null {
  if (!input) return null;
  const key = teamKey(input);
  if (!key) return null;
  const candidates = teams.filter((t) => teamKey(t.name) === key || (t.team_code && teamKey(t.team_code) === key));
  return candidates.find((t) => t.current) ?? candidates[0] ?? null;
}

/**
 * Normalizes a row in place-safe fashion and reports issues.
 * `matchedExisting`: the row matches an existing player, so team is optional.
 */
export function validateRow(input: RowData, teams: TeamRef[], opts: { matchedExisting?: boolean; today?: Date } = {}) {
  const data: RowData = { ...input };
  const issues: RowIssue[] = [];
  const err = (code: RowIssue["code"], field: keyof RowData, message: string) => issues.push({ code, field, message, severity: "error" });
  const warn = (code: RowIssue["code"], field: keyof RowData, message: string) => issues.push({ code, field, message, severity: "warning" });

  data.first_name = normalizeName(data.first_name);
  data.last_name = normalizeName(data.last_name);
  if (!data.first_name) err("missing_first_name", "first_name", "First name is missing.");
  if (!data.last_name) err("missing_last_name", "last_name", "Last name is missing.");

  const dob = parseDate(data.date_of_birth, opts.today);
  if (dob.ok) data.date_of_birth = dob.value;
  else err("invalid_dob", "date_of_birth", dob.reason);

  if (data.gender) {
    const g = normalizeGender(data.gender);
    if (g.recognized) data.gender = g.value;
    else {
      warn("unknown_gender", "gender", `Gender “${data.gender}” wasn’t recognized and will be left blank.`);
      data.gender = null;
    }
  }

  // Team
  const team = matchTeam(data.team, teams);
  const teamStillValid = data.team_id && teams.some((t) => t.id === data.team_id);
  if (team) data.team_id = team.id;
  else if (!teamStillValid) data.team_id = null;
  if (!data.team_id && !data.allow_unassigned) {
    const severity = opts.matchedExisting ? "warning" : "error";
    if (data.team) {
      issues.push({ code: "team_not_found", field: "team", severity, message: `No team named “${data.team}”. Pick a team or create it first.` });
    } else {
      issues.push({ code: "team_missing", field: "team", severity, message: "No team assigned." });
    }
  }

  // Guardians
  for (const n of [1, 2] as const) {
    const firstKey = `guardian${n}_first_name` as const;
    const lastKey = `guardian${n}_last_name` as const;
    const emailKey = `guardian${n}_email` as const;
    const phoneKey = `guardian${n}_phone` as const;
    const relKey = `guardian${n}_relationship` as const;

    data[firstKey] = normalizeName(data[firstKey]) || null;
    data[lastKey] = normalizeName(data[lastKey]) || (data[firstKey] ? data.last_name || null : null);

    const email = normalizeEmail(data[emailKey]);
    data[emailKey] = email.value;
    if (!email.valid) err("invalid_email", emailKey, `Guardian ${n} email “${email.value}” isn’t valid.`);

    const phone = normalizePhone(data[phoneKey]);
    data[phoneKey] = phone.value;
    if (!phone.valid) warn("invalid_phone", phoneKey, `Guardian ${n} phone “${phone.value}” looks incomplete.`);

    const hasAny = Boolean(data[firstKey] || data[emailKey] || data[phoneKey]);
    if (hasAny && !data[firstKey]) err("guardian_missing_name", firstKey, `Guardian ${n} has contact details but no name.`);
    data[relKey] = hasAny ? normalizeRelationship(data[relKey]) : null;
  }

  return { data, issues };
}

export function hasErrors(issues: RowIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
