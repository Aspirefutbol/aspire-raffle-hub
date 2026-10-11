import "server-only";
import type { Json } from "@/lib/database/types.gen";
import type { ServerSupabase } from "@/lib/supabase/server";
import { isTargetField, type ColumnMapping } from "./fields";
import { applyMapping } from "./map";
import { runImportPipeline, type PipelineRowInput } from "./pipeline";
import { type ExistingGuardian, type MatchType, parseRowData, type Resolution, type RosterPlayer, type RowData, type TeamRef } from "./types";

const PAGE = 1000; // PostgREST max rows per request

/** Reads every row of a query by paging with range(). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadPipelineContext(supabase: ServerSupabase, orgId: string) {
  const [teams, players, guardians] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, team_code, seasons(is_current)")
      .eq("organization_id", orgId)
      .eq("status", "active"),
    fetchAll((from, to) =>
      supabase
        .from("players")
        .select("id, first_name, last_name, preferred_name, date_of_birth, external_player_id, household_id, player_guardians(guardians(email_normalized, phone_digits))")
        .eq("organization_id", orgId)
        .is("archived_at", null)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("guardians")
        .select("email_normalized, phone_digits, household_id")
        .eq("organization_id", orgId)
        .is("archived_at", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (teams.error) throw new Error(teams.error.message);

  const teamRefs: TeamRef[] = teams.data.map((t) => ({ id: t.id, name: t.name, team_code: t.team_code, current: Boolean(t.seasons?.is_current) }));
  const roster: RosterPlayer[] = players.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    preferred_name: p.preferred_name,
    date_of_birth: p.date_of_birth,
    external_player_id: p.external_player_id,
    household_id: p.household_id,
    guardian_emails: p.player_guardians.flatMap((pg) => (pg.guardians?.email_normalized ? [pg.guardians.email_normalized] : [])),
    guardian_phones: p.player_guardians.flatMap((pg) => (pg.guardians?.phone_digits ? [pg.guardians.phone_digits] : [])),
  }));
  const existingGuardians: ExistingGuardian[] = guardians.map((g) => ({ email: g.email_normalized, phone_digits: g.phone_digits, household_id: g.household_id }));
  return { teams: teamRefs, roster, guardians: existingGuardians };
}

export interface RowOverride {
  data?: RowData;
  resolution?: Resolution | null;
}

export type ImportRecord = NonNullable<Awaited<ReturnType<typeof getImport>>>;

export async function getImport(supabase: ServerSupabase, orgId: string, importId: string) {
  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", importId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadImportRows(supabase: ServerSupabase, importId: string) {
  return fetchAll((from, to) =>
    supabase
      .from("import_rows")
      .select("id, row_number, raw, data, status, issues, match_type, match_player_id, match_reasons, resolution, household_key, result_player_id")
      .eq("import_id", importId)
      .order("row_number")
      .range(from, to),
  );
}

export function sanitizeMapping(input: Record<string, unknown>, headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const value = input[header];
    mapping[header] = isTargetField(value) ? value : null;
  }
  return mapping;
}

/**
 * (Re)validates an import and persists the outcome atomically.
 * `remap`: recompute row data from the raw cells using `mapping` (discards edits).
 */
export async function revalidateImport(
  supabase: ServerSupabase,
  imp: { id: string; organization_id: string; column_mapping: unknown },
  opts: {
    remap?: ColumnMapping;
    mappingId?: string | null;
    resetDecisions?: boolean;
    /** Admin edits applied before validation: new row data and/or resolution. */
    overrides?: Map<string, RowOverride>;
  } = {},
) {
  const [rows, ctx] = await Promise.all([loadImportRows(supabase, imp.id), loadPipelineContext(supabase, imp.organization_id)]);

  const input: PipelineRowInput[] = rows.map((r) => {
    const override = opts.overrides?.get(r.id);
    const current = opts.remap ? applyMapping((r.raw ?? {}) as Record<string, unknown>, opts.remap) : parseRowData(r.data);
    return {
      id: r.id,
      row_number: r.row_number,
      data: override?.data ?? current,
      resolution: override && "resolution" in override ? (override.resolution ?? null) : opts.resetDecisions ? null : (r.resolution as Resolution | null),
      match_player_id: opts.resetDecisions ? null : r.match_player_id,
      match_type: opts.resetDecisions ? null : (r.match_type as MatchType | null),
    };
  });

  const { rows: results, summary } = runImportPipeline(input, ctx);

  const { error } = await supabase.rpc("save_import_validation", {
    p_import_id: imp.id,
    // Plain data objects; the interfaces just lack Json's index signature.
    p_rows: results as unknown as Json,
    p_summary: summary as unknown as Json,
    p_column_mapping: opts.remap ?? undefined,
    p_mapping_id: opts.mappingId ?? undefined,
  });
  if (error) throw new Error(error.message);
  return summary;
}
