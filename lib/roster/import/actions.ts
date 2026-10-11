"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, describeDbError, fail, ok, orgAction } from "@/lib/actions";
import { pluralize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { id, idList, optionalText } from "@/lib/validation";
import { checkMapping, headerSignature, suggestMapping, type ColumnMapping } from "./fields";
import { IMPORT_LIMITS, parseRosterCsv } from "./parse";
import type { ImportSummary } from "./pipeline";
import { getImport, loadImportRows, revalidateImport, type RowOverride, sanitizeMapping } from "./server";
import { parseRowData, rowDataSchema } from "./types";

const OPEN_STATUSES = ["uploaded", "mapped", "validated"];

function refresh(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}`, "layout");
}

async function withOpenImport<T>(
  orgId: string,
  importId: string,
  run: (supabase: Awaited<ReturnType<typeof createClient>>, imp: NonNullable<Awaited<ReturnType<typeof getImport>>>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const imp = await getImport(supabase, orgId, importId);
  if (!imp) return fail("Import not found.");
  if (!OPEN_STATUSES.includes(imp.status)) return fail(`This import is already ${imp.status}.`);
  try {
    return await run(supabase, imp);
  } catch (error) {
    console.error("[import]", error);
    return fail(error instanceof Error ? describeDbError({ message: error.message }) : "Something went wrong.");
  }
}

// ── 1. Upload ────────────────────────────────────────────────────────────────

const uploadSchema = z.object({
  file: z
    .instanceof(File, { message: "Choose a CSV file to upload." })
    .refine((f) => f.size > 0, "The file is empty.")
    .refine((f) => f.size <= IMPORT_LIMITS.maxBytes, "The file is larger than 5 MB. Split it into smaller files.")
    .refine((f) => /\.(csv|tsv|txt)$/i.test(f.name), "Upload a .csv file. In Excel or Google Sheets use File → Download/Save as → CSV."),
});

export async function uploadImport(orgSlug: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return orgAction(orgSlug, "roster.import", uploadSchema, { file: formData.get("file") }, async (ctx, { file }) => {
    const parsed = parseRosterCsv(await file.text());
    if (!parsed.ok) return fail(parsed.error, { file: parsed.error });

    const supabase = await createClient();
    const orgId = ctx.organization.id;

    // Reuse a saved mapping when this file's headers match one exactly.
    const signature = headerSignature(parsed.headers);
    const { data: saved } = await supabase
      .from("import_mappings")
      .select("id, name, mapping")
      .eq("organization_id", orgId)
      .eq("header_signature", signature)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const mapping = saved
      ? sanitizeMapping(saved.mapping as Record<string, unknown>, parsed.headers)
      : suggestMapping(parsed.headers);

    const { data: imp, error } = await supabase
      .from("imports")
      .insert({
        organization_id: orgId,
        file_name: file.name.slice(0, 200),
        source_name: saved?.name ?? null,
        mapping_id: saved?.id ?? null,
        headers: parsed.headers,
        column_mapping: mapping,
        row_count: parsed.rows.length,
      })
      .select("id")
      .single();
    if (error) return fail(describeDbError(error));

    for (let i = 0; i < parsed.rows.length; i += 500) {
      const chunk = parsed.rows.slice(i, i + 500).map((raw, j) => ({
        organization_id: orgId,
        import_id: imp.id,
        row_number: i + j + 1,
        raw,
      }));
      const { error: rowError } = await supabase.from("import_rows").insert(chunk);
      if (rowError) {
        await supabase.from("imports").update({ status: "cancelled" }).eq("id", imp.id);
        return fail(`The file couldn’t be staged: ${describeDbError(rowError)}`);
      }
    }

    refresh(orgSlug);
    return ok({ id: imp.id }, `${pluralize(parsed.rows.length, "row")} uploaded${saved ? ` · using saved mapping “${saved.name}”` : ""}`);
  });
}

// ── 2. Map columns (+ validate) ──────────────────────────────────────────────

const mappingSchema = z.object({
  importId: id,
  mapping: z.record(z.string(), z.string().nullable()),
  saveAs: optionalText(80),
});

export async function saveMappingAndValidate(orgSlug: string, input: unknown): Promise<ActionResult<ImportSummary>> {
  return orgAction(orgSlug, "roster.import", mappingSchema, input, (ctx, data) =>
    withOpenImport(ctx.organization.id, data.importId, async (supabase, imp) => {
      const mapping: ColumnMapping = sanitizeMapping(data.mapping, imp.headers);
      const problems = checkMapping(mapping);
      if (problems.length) return fail(problems.map((p) => p.message).join(" "));

      let mappingId: string | null = null;
      if (data.saveAs) {
        const signature = headerSignature(imp.headers);
        const { data: existing } = await supabase
          .from("import_mappings")
          .select("id")
          .eq("organization_id", ctx.organization.id)
          .ilike("name", data.saveAs.replace(/[\\%_]/g, (c) => `\\${c}`))
          .maybeSingle();
        const result = existing
          ? await supabase.from("import_mappings").update({ mapping, header_signature: signature }).eq("id", existing.id).select("id").single()
          : await supabase
              .from("import_mappings")
              .insert({ organization_id: ctx.organization.id, name: data.saveAs, mapping, header_signature: signature })
              .select("id")
              .single();
        if (result.error) return fail(`Couldn’t save the mapping: ${describeDbError(result.error)}`);
        mappingId = result.data.id;
        await supabase.from("imports").update({ source_name: data.saveAs }).eq("id", imp.id);
      }

      const summary = await revalidateImport(supabase, imp, { remap: mapping, mappingId, resetDecisions: true });
      refresh(orgSlug);
      return ok(summary, `${pluralize(summary.total, "row")} checked · ${summary.ready} ready`);
    }),
  );
}

// ── 3. Review & resolve ──────────────────────────────────────────────────────

const rowPatchSchema = z.object({
  importId: id,
  rowId: id,
  patch: rowDataSchema.partial(),
});

export async function updateImportRow(orgSlug: string, input: unknown): Promise<ActionResult<ImportSummary>> {
  return orgAction(orgSlug, "roster.import", rowPatchSchema, input, (ctx, data) =>
    withOpenImport(ctx.organization.id, data.importId, async (supabase, imp) => {
      const { data: row, error } = await supabase.from("import_rows").select("data").eq("id", data.rowId).eq("import_id", imp.id).maybeSingle();
      if (error || !row) return fail("Row not found.");
      const merged = { ...parseRowData(row.data), ...data.patch };
      // Choosing a team explicitly overrides the spreadsheet's team text.
      if (data.patch.team_id) merged.team = null;
      const summary = await revalidateImport(supabase, imp, { overrides: new Map([[data.rowId, { data: merged }]]) });
      refresh(orgSlug);
      return ok(summary, "Row updated");
    }),
  );
}

const resolveSchema = z.object({
  importId: id,
  rowIds: idList,
  resolution: z.enum(["create", "use_existing", "link", "skip"]).nullable(),
});

export async function resolveImportRows(orgSlug: string, input: unknown): Promise<ActionResult<ImportSummary>> {
  return orgAction(orgSlug, "roster.import", resolveSchema, input, (ctx, data) =>
    withOpenImport(ctx.organization.id, data.importId, async (supabase, imp) => {
      const rows = await loadImportRows(supabase, imp.id);
      const needsMatch = data.resolution === "use_existing" || data.resolution === "link";
      const wanted = new Set(data.rowIds);
      const overrides = new Map(
        rows
          .filter((r) => wanted.has(r.id) && (!needsMatch || r.match_player_id))
          .map((r) => [r.id, { resolution: data.resolution }] as const),
      );
      if (!overrides.size) return fail("Those rows can’t take that choice.");
      const summary = await revalidateImport(supabase, imp, { overrides });
      refresh(orgSlug);
      const labels = { create: "Will create new players", use_existing: "Will use existing players", link: "Will merge into existing players", skip: "Rows skipped" };
      return ok(summary, data.resolution ? labels[data.resolution] : "Row restored");
    }),
  );
}

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ importId: id, action: z.literal("assign_team"), teamId: id }),
  z.object({ importId: id, action: z.literal("allow_unassigned") }),
  z.object({ importId: id, action: z.literal("accept_exact") }),
  z.object({ importId: id, action: z.literal("skip_errors") }),
]);

export async function bulkFixImport(orgSlug: string, input: unknown): Promise<ActionResult<ImportSummary>> {
  return orgAction(orgSlug, "roster.import", bulkSchema, input, (ctx, data) =>
    withOpenImport(ctx.organization.id, data.importId, async (supabase, imp) => {
      const rows = await loadImportRows(supabase, imp.id);
      const teamIssue = (r: (typeof rows)[number]) =>
        r.status === "error" &&
        Array.isArray(r.issues) &&
        r.issues.some((i) => typeof i === "object" && i !== null && "code" in i && (i.code === "team_missing" || i.code === "team_not_found"));

      const overrides = new Map<string, RowOverride>();
      if (data.action === "assign_team" || data.action === "allow_unassigned") {
        let teamName: string | null = null;
        if (data.action === "assign_team") {
          const { data: team } = await supabase.from("teams").select("name").eq("id", data.teamId).eq("organization_id", ctx.organization.id).maybeSingle();
          if (!team) return fail("Team not found.");
          teamName = team.name;
        }
        for (const r of rows.filter(teamIssue)) {
          const d = parseRowData(r.data);
          overrides.set(r.id, {
            data: data.action === "assign_team" ? { ...d, team: teamName, team_id: data.teamId } : { ...d, allow_unassigned: true },
          });
        }
      } else if (data.action === "accept_exact") {
        for (const r of rows) {
          if (r.status === "duplicate" && r.match_type === "EXACT_MATCH" && !r.resolution && r.match_player_id) overrides.set(r.id, { resolution: "use_existing" });
        }
      } else {
        for (const r of rows) if (r.status === "error") overrides.set(r.id, { resolution: "skip" });
      }
      const changed = overrides.size;
      if (!changed) return fail("No rows needed that fix.");

      const summary = await revalidateImport(supabase, imp, { overrides });
      refresh(orgSlug);
      const messages = {
        assign_team: "assigned a team",
        allow_unassigned: "will be imported without a team",
        accept_exact: "matched to existing players",
        skip_errors: "skipped",
      };
      return ok(summary, `${pluralize(changed, "row")} ${messages[data.action]}`);
    }),
  );
}

// ── 4. Import ────────────────────────────────────────────────────────────────

export async function commitImport(orgSlug: string, importId: unknown): Promise<ActionResult<Record<string, number>>> {
  return orgAction(orgSlug, "roster.import", id, importId, async (ctx, impId) => {
    // Re-check against the current roster first (someone may have edited it meanwhile).
    const pre = await withOpenImport(ctx.organization.id, impId, async (supabase, imp) => ok(await revalidateImport(supabase, imp)));
    if (!pre.ok) return pre;
    if (pre.data.duplicates_unresolved > 0) {
      return fail(`Choose what to do with ${pluralize(pre.data.duplicates_unresolved, "possible duplicate")} before importing.`);
    }
    if (pre.data.importable === 0) return fail("There are no rows ready to import.");

    const supabase = await createClient();
    if (!ctx.permissions.has("roster.write")) return fail("Importing also requires permission to edit the roster.");
    const { data, error } = await supabase.rpc("commit_player_import", { p_import_id: impId });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    const result = data as Record<string, number>;
    return ok(result, `Import complete · ${pluralize(result.players_created ?? 0, "player")} added`);
  });
}

export async function cancelImport(orgSlug: string, importId: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.import", id, importId, (ctx, impId) =>
    withOpenImport(ctx.organization.id, impId, async (supabase, imp) => {
      const { error } = await supabase.from("imports").update({ status: "cancelled" }).eq("id", imp.id);
      if (error) return fail(describeDbError(error));
      refresh(orgSlug);
      return ok(undefined, "Import cancelled · nothing was added to the roster");
    }),
  );
}

export async function deleteSavedMapping(orgSlug: string, mappingId: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.import", id, mappingId, async (ctx, mid) => {
    const supabase = await createClient();
    const { error } = await supabase.from("import_mappings").delete().eq("id", mid).eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Saved mapping deleted");
  });
}
