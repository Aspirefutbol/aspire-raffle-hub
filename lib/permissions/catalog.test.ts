import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canAssignRole, ORGANIZATION_ROLES, PERMISSIONS, PLATFORM_PERMISSIONS, permissionsForRoles, ROLE_PERMISSIONS } from "./index";

const migrations = ["20261011000100_foundation.sql", "20261012000100_hardening_identity_roles.sql"]
  .map((f) => readFileSync(join(__dirname, "../../supabase/migrations", f), "utf8"))
  .join("\n");

describe("permission catalog mirror", () => {
  it("every TS permission and role key is seeded by a migration", () => {
    for (const key of [...PERMISSIONS, ...PLATFORM_PERMISSIONS]) expect(migrations).toContain(`'${key}'`);
    for (const role of ORGANIZATION_ROLES) expect(migrations).toContain(`'${role}'`);
  });

  it("no organization role holds a platform permission", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) expect(p.startsWith("platform.")).toBe(false);
    }
  });

  it("multi-role permissions are the union of each role", () => {
    const perms = permissionsForRoles(["TEAM_CAPTAIN", "PARTICIPANT_FAMILY"]);
    expect([...perms]).toEqual(["tickets.issue"]);
    const dual = permissionsForRoles(["ORGANIZATION_ADMIN", "DIRECTOR"]);
    expect(dual.has("campaigns.activate") && dual.has("roster.write")).toBe(true);
  });

  it("grant rule: admins can't grant DIRECTOR, admin+director can, platform admins always can", () => {
    const admin = permissionsForRoles(["ORGANIZATION_ADMIN"]);
    expect(canAssignRole(admin, "FINANCE_ADMIN")).toBe(true);
    expect(canAssignRole(admin, "DIRECTOR")).toBe(false);
    expect(canAssignRole(permissionsForRoles(["ORGANIZATION_ADMIN", "DIRECTOR"]), "DIRECTOR")).toBe(true);
    expect(canAssignRole(permissionsForRoles(["DIRECTOR"]), "DIRECTOR")).toBe(false); // no members.manage
    expect(canAssignRole(new Set(), "DIRECTOR", true)).toBe(true);
  });

  it("an organization admin can assign every role except DIRECTOR (incl. Seller / Family)", () => {
    const admin = permissionsForRoles(["ORGANIZATION_ADMIN"]);
    for (const role of ORGANIZATION_ROLES) expect(canAssignRole(admin, role)).toBe(role !== "DIRECTOR");
  });
});
