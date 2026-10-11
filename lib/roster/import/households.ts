import { nameKey, phoneDigits } from "./normalize";
import type { ExistingGuardian, RowData } from "./types";

export interface HouseholdPlanInput {
  key: string; // row id
  data: RowData;
  /** Household of the existing player this row links to / reuses (if any). */
  matchedHouseholdId?: string | null;
}

/**
 * Groups rows into households:
 *  - rows sharing any guardian email or phone (or the same household name) form one household;
 *  - a group whose guardian already exists in the organization reuses that guardian's household;
 *  - a group linked to an existing player with a household reuses it;
 *  - otherwise rows with guardian info get a new household; rows without stay household-less.
 * Returns row key → 'existing:<uuid>' | 'new:<groupKey>' | null.
 */
export function planHouseholds(rows: HouseholdPlanInput[], existingGuardians: ExistingGuardian[]): Map<string, string | null> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const tokensOf = (d: RowData): string[] => {
    const t: string[] = [];
    for (const n of [1, 2] as const) {
      const email = d[`guardian${n}_email`];
      const phone = phoneDigits(d[`guardian${n}_phone`]);
      if (email) t.push(`e:${email.toLowerCase()}`);
      if (phone.length >= 7) t.push(`p:${phone}`);
    }
    if (d.household_name) t.push(`h:${nameKey(d.household_name)}`);
    return t;
  };

  const tokenOwner = new Map<string, string>();
  for (const row of rows) {
    parent.set(row.key, row.key);
    for (const token of tokensOf(row.data)) {
      const owner = tokenOwner.get(token);
      if (owner) union(owner, row.key);
      else tokenOwner.set(token, row.key);
    }
  }

  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const g of existingGuardians) {
    if (!g.household_id) continue;
    if (g.email) byEmail.set(g.email.toLowerCase(), g.household_id);
    if (g.phone_digits && g.phone_digits.length >= 7) byPhone.set(g.phone_digits, g.household_id);
  }

  // Resolve each group once.
  const groupHousehold = new Map<string, string | null>();
  const groups = new Map<string, HouseholdPlanInput[]>();
  for (const row of rows) groups.set(find(row.key), [...(groups.get(find(row.key)) ?? []), row]);

  for (const [root, members] of groups) {
    let existing: string | null = null;
    for (const m of members) {
      if (m.matchedHouseholdId) existing ??= m.matchedHouseholdId;
      for (const token of tokensOf(m.data)) {
        if (token.startsWith("e:")) existing ??= byEmail.get(token.slice(2)) ?? null;
        if (token.startsWith("p:")) existing ??= byPhone.get(token.slice(2)) ?? null;
      }
    }
    const hasGuardianInfo = members.some((m) => m.data.guardian1_first_name || m.data.guardian2_first_name || m.data.household_name);
    groupHousehold.set(root, existing ? `existing:${existing}` : hasGuardianInfo ? `new:${root}` : null);
  }

  return new Map(rows.map((r) => [r.key, groupHousehold.get(find(r.key)) ?? null]));
}
