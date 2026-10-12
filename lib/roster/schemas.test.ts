import { describe, expect, it } from "vitest";
import { createPlayerSchema, guardianFieldsSchema, teamInputSchema } from "./schemas";

const TEAM = "6f1c3a52-6a3e-4c1b-9b7e-3b8e2f1d0a11";

describe("createPlayerSchema", () => {
  it("requires first name, last name and team only", () => {
    const r = createPlayerSchema.safeParse({ first_name: " Mateo ", last_name: "Garcia", team_id: TEAM });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.first_name).toBe("Mateo");
      expect(r.data.household).toEqual({ mode: "none" });
      expect(r.data.date_of_birth).toBeNull();
    }
  });

  it("reports missing team and names", () => {
    const r = createPlayerSchema.safeParse({ first_name: "", last_name: "", team_id: "" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["first_name", "last_name", "team_id"]));
  });

  it("rejects future birth dates and bad formats", () => {
    expect(createPlayerSchema.safeParse({ first_name: "A", last_name: "B", team_id: TEAM, date_of_birth: "2999-01-01" }).success).toBe(false);
    expect(createPlayerSchema.safeParse({ first_name: "A", last_name: "B", team_id: TEAM, date_of_birth: "04/12/2013" }).success).toBe(false);
  });

  it("validates a new guardian when provided", () => {
    const r = createPlayerSchema.safeParse({
      first_name: "A", last_name: "B", team_id: TEAM,
      guardian: { mode: "new", first_name: "C", last_name: "B", email: "not-an-email" },
    });
    expect(r.success).toBe(false);
  });
});

describe("guardianFieldsSchema", () => {
  it("normalizes email and allows missing contact", () => {
    const r = guardianFieldsSchema.parse({ first_name: "Maria", last_name: "Garcia", email: " Maria@Example.COM " });
    expect(r.email).toBe("maria@example.com");
    expect(r.phone).toBeNull();
    expect(r.relationship).toBe("parent");
  });
});

describe("teamInputSchema", () => {
  it("turns empty optional fields into null", () => {
    const r = teamInputSchema.parse({ name: "U13 Boys", gender_division: "", season_id: "", coach_name: "" });
    expect(r).toMatchObject({ name: "U13 Boys", gender_division: null, season_id: null, coach_name: null, status: "active" });
  });
});
