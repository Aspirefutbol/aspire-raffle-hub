import { describe, expect, it } from "vitest";
import { ORGANIZATION_ROLES, ROLE_PERMISSIONS } from "./index";

// Compares the TS mirror with the live role_permissions table. Runs when a
// Supabase instance is configured (local dev, CI); skipped otherwise.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

describe.skipIf(!url || !key)("permission catalog matches the database", () => {
  it("role → permission grants are identical", async () => {
    const res = await fetch(`${url}/rest/v1/role_permissions?select=role_key,permission_key`, {
      headers: { apikey: key!, Authorization: `Bearer ${key}` },
    });
    expect(res.ok).toBe(true);
    const rows = (await res.json()) as Array<{ role_key: string; permission_key: string }>;
    for (const role of ORGANIZATION_ROLES) {
      const db = rows.filter((r) => r.role_key === role).map((r) => r.permission_key).sort();
      expect(db, role).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });
});
