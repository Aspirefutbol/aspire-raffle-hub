import Papa from "papaparse";

export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 5000, maxColumns: 100 } as const;

export type ParseResult =
  | { ok: true; headers: string[]; rows: Array<Record<string, string>> }
  | { ok: false; error: string };

/** Parses CSV/TSV text (delimiter auto-detected, BOM stripped). Blank rows are dropped. */
export function parseRosterCsv(text: string): ParseResult {
  const clean = text.replace(/^﻿/, "");
  if (!clean.trim()) return { ok: false, error: "The file is empty." };

  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h, i) => h.replace(/\s+/g, " ").trim() || `Column ${i + 1}`,
  });

  const headers = (result.meta.fields ?? []).filter(Boolean);
  if (headers.length === 0) return { ok: false, error: "We couldn’t find a header row. The first row should contain column names." };
  if (headers.length > IMPORT_LIMITS.maxColumns) return { ok: false, error: `Too many columns (${headers.length}). The limit is ${IMPORT_LIMITS.maxColumns}.` };
  if (new Set(headers).size !== headers.length) {
    return { ok: false, error: "Two columns have the same name. Rename one so every column header is unique." };
  }

  const rows = result.data
    .map((r) => Object.fromEntries(headers.map((h) => [h, typeof r[h] === "string" ? r[h]!.trim() : ""])))
    .filter((r) => Object.values(r).some((v) => v !== ""));

  if (rows.length === 0) return { ok: false, error: "The file has a header row but no data rows." };
  if (rows.length > IMPORT_LIMITS.maxRows) return { ok: false, error: `Too many rows (${rows.length}). Split the file into batches of ${IMPORT_LIMITS.maxRows}.` };
  return { ok: true, headers, rows };
}
