import type { ColumnMapping } from "./fields";
import { cleanText, normalizeName, splitFullName } from "./normalize";
import { type RowData, rowDataSchema } from "./types";

/** Applies a column mapping to one raw CSV row, producing editable row data. */
export function applyMapping(raw: Record<string, unknown>, mapping: ColumnMapping): RowData {
  const values: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    const v = cleanText(raw[header]);
    if (v) values[field] = v;
  }

  const data = rowDataSchema.parse({});
  data.first_name = normalizeName(values.first_name);
  data.last_name = normalizeName(values.last_name);
  if (values.full_name && (!data.first_name || !data.last_name)) {
    const split = splitFullName(values.full_name);
    data.first_name ||= split.first;
    data.last_name ||= split.last;
  }
  data.preferred_name = normalizeName(values.preferred_name) || null;
  data.date_of_birth = values.date_of_birth ?? null;
  data.gender = values.gender ?? null;
  data.external_player_id = values.external_player_id ?? null;
  data.team = values.team ?? null;
  data.notes = values.notes ?? null;
  data.household_name = normalizeName(values.household_name) || null;

  for (const n of [1, 2] as const) {
    let first = normalizeName(values[`guardian${n}_first_name`]);
    let last = normalizeName(values[`guardian${n}_last_name`]);
    const full = values[`guardian${n}_name`];
    if (full && (!first || !last)) {
      const split = splitFullName(full);
      first ||= split.first;
      last ||= split.last;
    }
    const email = values[`guardian${n}_email`] ?? null;
    const phone = values[`guardian${n}_phone`] ?? null;
    // A guardian with only a first name most often shares the player's last name.
    if (first && !last && data.last_name) last = data.last_name;
    data[`guardian${n}_first_name`] = first || null;
    data[`guardian${n}_last_name`] = last || null;
    data[`guardian${n}_email`] = email;
    data[`guardian${n}_phone`] = phone;
    data[`guardian${n}_relationship`] = values[`guardian${n}_relationship`] ?? null;
  }
  return data;
}
