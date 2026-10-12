import { buildRosterIndex, findInFileDuplicate, matchAgainstRoster } from "./duplicates";
import { planHouseholds } from "./households";
import type { ExistingGuardian, MatchType, Resolution, RosterPlayer, RowData, RowIssue, RowStatus, TeamRef } from "./types";
import { hasErrors, validateRow } from "./validate";

export interface PipelineRowInput {
  id: string;
  row_number: number;
  data: RowData;
  resolution: Resolution | null;
  match_player_id: string | null;
  match_type: MatchType | null;
}

export interface PipelineRowResult {
  id: string;
  data: RowData;
  status: RowStatus;
  issues: RowIssue[];
  match_type: MatchType;
  match_player_id: string | null;
  match_reasons: string[];
  resolution: Resolution | null;
  household_key: string | null;
}

export interface ImportSummary {
  total: number;
  ready: number;
  duplicates: number;
  duplicates_unresolved: number;
  exact_unresolved: number;
  errors: number;
  missing_team: number;
  skipped: number;
  importable: number;
}

export interface PipelineContext {
  teams: TeamRef[];
  roster: RosterPlayer[];
  guardians: ExistingGuardian[];
  today?: Date;
}

/** Suggested resolution for a duplicate classification (never applied automatically). */
export function suggestedResolution(type: MatchType, hasPlayer: boolean): Resolution {
  if (!hasPlayer) return "create";
  if (type === "EXACT_MATCH") return "use_existing";
  if (type === "LIKELY_MATCH") return "link";
  return "create";
}

/**
 * Validates every row, classifies duplicates (roster + earlier rows in the file),
 * plans households and derives each row's status. Admin decisions (resolution)
 * are preserved when the match they were made against hasn't changed.
 */
export function runImportPipeline(rows: PipelineRowInput[], ctx: PipelineContext) {
  const index = buildRosterIndex(ctx.roster);
  const rosterById = new Map(ctx.roster.map((p) => [p.id, p]));
  const ordered = [...rows].sort((a, b) => a.row_number - b.row_number);
  const earlier: Array<{ rowNumber: number; data: RowData }> = [];

  const staged = ordered.map((row) => {
    // First pass validation to normalize values used for matching (DOB, emails).
    const pre = validateRow(row.data, ctx.teams, { today: ctx.today });
    let match = matchAgainstRoster(pre.data, index);
    if (match.type === "NEW_RECORD") {
      const inFile = findInFileDuplicate(pre.data, earlier);
      if (inFile) match = { type: "NEEDS_REVIEW", playerId: null, reasons: [inFile.reason] };
    }
    earlier.push({ rowNumber: row.row_number, data: pre.data });

    const matched = match.type !== "NEW_RECORD" && match.playerId !== null;
    const { data, issues } = matched ? validateRow(row.data, ctx.teams, { matchedExisting: true, today: ctx.today }) : pre;

    // Preserve the admin's decision if it still applies.
    let resolution: Resolution | null;
    const sameMatch = row.match_type === match.type && row.match_player_id === match.playerId;
    if (row.resolution === "skip") resolution = "skip";
    else if (match.type === "NEW_RECORD") resolution = "create";
    else if (sameMatch && row.resolution && (match.playerId || row.resolution === "create")) resolution = row.resolution;
    else resolution = null;

    let status: RowStatus;
    if (resolution === "skip") status = "skipped";
    else if (hasErrors(issues)) status = "error";
    else if (match.type !== "NEW_RECORD") status = "duplicate";
    else status = "ready";

    return { row, data, issues, match, resolution, status };
  });

  const households = planHouseholds(
    staged.map((s) => ({
      key: s.row.id,
      data: s.data,
      matchedHouseholdId:
        (s.resolution === "link" || s.resolution === "use_existing") && s.match.playerId
          ? (rosterById.get(s.match.playerId)?.household_id ?? null)
          : null,
    })),
    ctx.guardians,
  );

  const results: PipelineRowResult[] = staged.map((s) => ({
    id: s.row.id,
    data: s.data,
    status: s.status,
    issues: s.issues,
    match_type: s.match.type,
    match_player_id: s.match.playerId,
    match_reasons: s.match.reasons,
    resolution: s.resolution,
    household_key: households.get(s.row.id) ?? null,
  }));

  return { rows: results, summary: summarize(results) };
}

export function summarize(rows: Array<Pick<PipelineRowResult, "status" | "issues" | "match_type" | "resolution">>): ImportSummary {
  const s: ImportSummary = { total: rows.length, ready: 0, duplicates: 0, duplicates_unresolved: 0, exact_unresolved: 0, errors: 0, missing_team: 0, skipped: 0, importable: 0 };
  for (const r of rows) {
    if (r.status === "ready") s.ready++;
    if (r.status === "duplicate") {
      s.duplicates++;
      if (!r.resolution) s.duplicates_unresolved++;
      if (!r.resolution && r.match_type === "EXACT_MATCH") s.exact_unresolved++;
    }
    if (r.status === "error") {
      s.errors++;
      if (r.issues.some((i) => i.severity === "error" && (i.code === "team_missing" || i.code === "team_not_found"))) s.missing_team++;
    }
    if (r.status === "skipped") s.skipped++;
    if (r.status === "ready" || (r.status === "duplicate" && r.resolution && r.resolution !== "skip")) s.importable++;
  }
  return s;
}
