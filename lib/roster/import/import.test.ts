import { describe, expect, it } from "vitest";
import { compare, comparableFromRow, matchAgainstRoster, buildRosterIndex, similarFirstName } from "./duplicates";
import { checkMapping, headerSignature, suggestMapping } from "./fields";
import { planHouseholds } from "./households";
import { applyMapping } from "./map";
import { normalizeGender, normalizeName, normalizeRelationship, parseDate, splitFullName } from "./normalize";
import { parseRosterCsv } from "./parse";
import { runImportPipeline, suggestedResolution } from "./pipeline";
import { type RosterPlayer, type RowData, type TeamRef, rowDataSchema } from "./types";
import { matchTeam, validateRow } from "./validate";

const TODAY = new Date("2026-10-11T12:00:00Z");
const row = (patch: Partial<RowData>): RowData => ({ ...rowDataSchema.parse({}), ...patch });
const TEAMS: TeamRef[] = [
  { id: "t13", name: "U13 Boys", team_code: "U13B", current: true },
  { id: "t13old", name: "U13 Boys", team_code: null, current: false },
  { id: "t14", name: "U14 Boys", team_code: "U14B", current: true },
];

describe("column mapping", () => {
  it("maps common header variants", () => {
    const m = suggestMapping(["Player First", "Player Last Name", "DOB", "Team", "Parent Name", "Parent Email", "Parent 2 Cell", "Shoe size"]);
    expect(m).toEqual({
      "Player First": "first_name",
      "Player Last Name": "last_name",
      DOB: "date_of_birth",
      Team: "team",
      "Parent Name": "guardian1_name",
      "Parent Email": "guardian1_email",
      "Parent 2 Cell": "guardian2_phone",
      "Shoe size": null,
    });
  });
  it("treats First Name / First / Player First Name the same", () => {
    for (const h of ["First Name", "first_name", "Player First Name", "FIRST"]) expect(suggestMapping([h])[h]).toBe("first_name");
    expect(suggestMapping(["Reg #"])["Reg #"]).toBe("external_player_id");
  });
  it("never maps two columns to the same field", () => {
    const m = suggestMapping(["Email", "E-mail"]);
    expect(Object.values(m).filter((v) => v === "guardian1_email")).toHaveLength(1);
  });
  it("requires a player name and flags duplicate targets", () => {
    expect(checkMapping({ A: "first_name" }).map((p) => p.kind)).toEqual(["missing_name"]);
    expect(checkMapping({ A: "full_name" })).toEqual([]);
    expect(checkMapping({ A: "first_name", B: "last_name", C: "team", D: "team" }).map((p) => p.kind)).toEqual(["duplicate_target"]);
  });
  it("signature is order and formatting independent", () => {
    expect(headerSignature(["First Name", "DOB"])).toBe(headerSignature(["dob", "first_name"]));
  });
});

describe("normalization", () => {
  it("title-cases shouty or lowercase names but keeps mixed case", () => {
    expect(normalizeName("  JOHN   O'NEIL-SMITH ")).toBe("John O'Neil-Smith");
    expect(normalizeName("maria garcia")).toBe("Maria Garcia");
    expect(normalizeName("McDonald")).toBe("McDonald");
  });
  it("splits full names", () => {
    expect(splitFullName("Garcia, Maria")).toEqual({ first: "Maria", last: "Garcia" });
    expect(splitFullName("Maria Elena Garcia")).toEqual({ first: "Maria Elena", last: "Garcia" });
  });
  it("parses common date formats and rejects bad ones", () => {
    expect(parseDate("2013-04-12", TODAY)).toEqual({ ok: true, value: "2013-04-12" });
    expect(parseDate("4/12/2013", TODAY)).toEqual({ ok: true, value: "2013-04-12" });
    expect(parseDate("04-12-13", TODAY)).toEqual({ ok: true, value: "2013-04-12" });
    expect(parseDate("41376", TODAY)).toEqual({ ok: true, value: "2013-04-12" }); // Excel serial
    expect(parseDate("2/30/2013", TODAY).ok).toBe(false);
    expect(parseDate("2030-01-01", TODAY).ok).toBe(false);
    expect(parseDate("soon", TODAY).ok).toBe(false);
    expect(parseDate("", TODAY)).toEqual({ ok: true, value: null });
  });
  it("normalizes gender and relationship words", () => {
    expect(normalizeGender("Boy").value).toBe("male");
    expect(normalizeGender("F").value).toBe("female");
    expect(normalizeGender("purple").recognized).toBe(false);
    expect(normalizeRelationship("Mom")).toBe("mother");
    expect(normalizeRelationship("Step-dad")).toBe("stepparent");
    expect(normalizeRelationship("")).toBe("parent");
  });
});

describe("parseRosterCsv", () => {
  it("parses CSV with BOM, quoted commas and blank lines", () => {
    const r = parseRosterCsv('﻿First Name,Last Name,Notes\n"Ana","Lopez","likes ""soccer"", art"\n\n,,\nBen,Ng,\n');
    expect(r.ok && r.rows).toEqual([
      { "First Name": "Ana", "Last Name": "Lopez", Notes: 'likes "soccer", art' },
      { "First Name": "Ben", "Last Name": "Ng", Notes: "" },
    ]);
  });
  it("detects tab-delimited files", () => {
    const r = parseRosterCsv("First\tLast\nAna\tLopez\n");
    expect(r.ok && r.headers).toEqual(["First", "Last"]);
  });
  it("rejects empty files and keeps duplicate headers distinct", () => {
    expect(parseRosterCsv("").ok).toBe(false);
    expect(parseRosterCsv("First,Last\n").ok).toBe(false);
    const dup = parseRosterCsv("First,First\nA,B");
    expect(dup.ok && dup.headers).toEqual(["First", "First_1"]);
  });
});

describe("applyMapping + validateRow", () => {
  it("splits names, inherits guardian last name, normalizes values", () => {
    const data = applyMapping(
      { Player: "MATEO GARCIA", Born: "4/12/2013", Squad: "u13 boys", Mom: "Maria", "Mom Email": "Maria@Example.com " },
      { Player: "full_name", Born: "date_of_birth", Squad: "team", Mom: "guardian1_name", "Mom Email": "guardian1_email" },
    );
    const { data: v, issues } = validateRow(data, TEAMS, { today: TODAY });
    expect(issues).toEqual([]);
    expect(v).toMatchObject({
      first_name: "Mateo",
      last_name: "Garcia",
      date_of_birth: "2013-04-12",
      team_id: "t13",
      guardian1_first_name: "Maria",
      guardian1_last_name: "Garcia",
      guardian1_email: "maria@example.com",
      guardian1_relationship: "parent",
    });
  });
  it("matches teams by name or code, preferring the current season", () => {
    expect(matchTeam("U13 BOYS", TEAMS)?.id).toBe("t13");
    expect(matchTeam("u14b", TEAMS)?.id).toBe("t14");
    expect(matchTeam("U15 Boys", TEAMS)).toBeNull();
  });
  it("reports blocking issues", () => {
    const { issues } = validateRow(row({ first_name: "", last_name: "X", team: "Nope", date_of_birth: "13/45/2010", guardian1_email: "bad" }), TEAMS, { today: TODAY });
    expect(issues.filter((i) => i.severity === "error").map((i) => i.code).sort()).toEqual(
      ["guardian_missing_name", "invalid_dob", "invalid_email", "missing_first_name", "team_not_found"].sort(),
    );
  });
  it("team is optional when the row matches an existing player, or when allowed unassigned", () => {
    expect(validateRow(row({ first_name: "A", last_name: "B" }), TEAMS, { matchedExisting: true }).issues.every((i) => i.severity === "warning")).toBe(true);
    expect(validateRow(row({ first_name: "A", last_name: "B", allow_unassigned: true }), TEAMS).issues).toEqual([]);
  });
});

describe("duplicate detection", () => {
  const roster: RosterPlayer[] = [
    { id: "p1", first_name: "Ethan", last_name: "Johnson", preferred_name: null, date_of_birth: "2012-02-20", external_player_id: "ASG-1001", household_id: "h1", guardian_emails: ["sarah@example.com"], guardian_phones: [] },
    { id: "p2", first_name: "Noah", last_name: "Williams", preferred_name: null, date_of_birth: "2012-05-17", external_player_id: null, household_id: "h2", guardian_emails: [], guardian_phones: ["7135550130"] },
    { id: "p3", first_name: "Alexander", last_name: "Kim", preferred_name: null, date_of_birth: "2011-01-01", external_player_id: null, household_id: null, guardian_emails: [], guardian_phones: [] },
  ];
  const index = buildRosterIndex(roster);
  const m = (patch: Partial<RowData>) => matchAgainstRoster(row(patch), index);

  it("EXACT on external ID or name + DOB", () => {
    expect(m({ first_name: "E", last_name: "J", external_player_id: "asg-1001" })).toMatchObject({ type: "EXACT_MATCH", playerId: "p1" });
    expect(m({ first_name: "Ethan", last_name: "Johnson", date_of_birth: "2012-02-20" })).toMatchObject({ type: "EXACT_MATCH", playerId: "p1" });
  });
  it("LIKELY on name + shared guardian contact or missing DOB", () => {
    expect(m({ first_name: "Ethan", last_name: "Johnson", guardian1_email: "SARAH@example.com" }).type).toBe("LIKELY_MATCH");
    expect(m({ first_name: "Ethan", last_name: "Johnson" }).type).toBe("LIKELY_MATCH");
    expect(m({ first_name: "Alex", last_name: "Kim", date_of_birth: "2011-01-01" })).toMatchObject({ type: "LIKELY_MATCH", playerId: "p3" });
  });
  it("NEEDS_REVIEW when names match but DOBs differ", () => {
    expect(m({ first_name: "Ethan", last_name: "Johnson", date_of_birth: "2013-01-01" }).type).toBe("NEEDS_REVIEW");
  });
  it("never flags siblings or twins (different first names)", () => {
    expect(m({ first_name: "Jacob", last_name: "Williams", date_of_birth: "2012-05-17", guardian1_phone: "713-555-0130" }).type).toBe("NEW_RECORD");
  });
  it("similar first names: nicknames, prefixes, single typos — but not unrelated names", () => {
    expect(similarFirstName("Matt", "Matthew")).toBe(true);
    expect(similarFirstName("Jonathon", "Jonathan")).toBe(true);
    expect(similarFirstName("Bill", "William")).toBe(true);
    expect(similarFirstName("Noah", "Jacob")).toBe(false);
    expect(similarFirstName("Ana", "Ava")).toBe(false); // too short for typo tolerance
  });
  it("conflicting external IDs downgrade an otherwise exact match", () => {
    const a = comparableFromRow(row({ first_name: "Ethan", last_name: "Johnson", date_of_birth: "2012-02-20", external_player_id: "X-1" }));
    const b = comparableFromRow(row({ first_name: "Ethan", last_name: "Johnson", date_of_birth: "2012-02-20", external_player_id: "X-2" }));
    expect(compare(a, b)?.type).toBe("NEEDS_REVIEW");
  });
});

describe("household planning", () => {
  it("groups siblings by shared guardian contact and reuses existing households", () => {
    const plan = planHouseholds(
      [
        { key: "r1", data: row({ first_name: "Mia", last_name: "Lee", guardian1_first_name: "Jo", guardian1_email: "jo@x.com" }) },
        { key: "r2", data: row({ first_name: "Max", last_name: "Lee", guardian1_first_name: "Jo", guardian1_phone: "555-111-2222", guardian2_first_name: "Al", guardian2_email: "JO@x.com" }) },
        { key: "r3", data: row({ first_name: "Zed", last_name: "Ng", guardian1_first_name: "Kim", guardian1_email: "kim@x.com" }) },
        { key: "r4", data: row({ first_name: "Solo", last_name: "Kid" }) },
        { key: "r5", data: row({ first_name: "Liv", last_name: "Lee", guardian1_first_name: "Sam", guardian1_phone: "(555) 111-2222" }) },
      ],
      [{ email: "kim@x.com", phone_digits: null, household_id: "hh-ng" }],
    );
    expect(plan.get("r1")).toMatch(/^new:/);
    expect(plan.get("r2")).toBe(plan.get("r1"));
    expect(plan.get("r5")).toBe(plan.get("r1")); // linked through r2's phone
    expect(plan.get("r3")).toBe("existing:hh-ng");
    expect(plan.get("r4")).toBeNull();
  });
});

describe("runImportPipeline", () => {
  const roster: RosterPlayer[] = [
    { id: "p1", first_name: "Ethan", last_name: "Johnson", preferred_name: null, date_of_birth: "2012-02-20", external_player_id: null, household_id: "h1", guardian_emails: [], guardian_phones: [] },
  ];
  const input = (id: string, n: number, data: Partial<RowData>, extra: Partial<{ resolution: "skip" | "use_existing" | "link" | "create" | null; match_player_id: string | null; match_type: "EXACT_MATCH" | null }> = {}) => ({
    id, row_number: n, data: row(data), resolution: null, match_player_id: null, match_type: null, ...extra,
  });

  it("produces the review summary (ready / duplicates / missing team)", () => {
    const { rows, summary } = runImportPipeline(
      [
        input("a", 1, { first_name: "Ana", last_name: "Lopez", team: "U13 Boys" }),
        input("b", 2, { first_name: "Ethan", last_name: "Johnson", date_of_birth: "2/20/2012" }),
        input("c", 3, { first_name: "Ben", last_name: "Ng" }),
        input("d", 4, { first_name: "Ana", last_name: "Lopez", team: "U13 Boys" }),
      ],
      { teams: TEAMS, roster, guardians: [], today: TODAY },
    );
    expect(rows.map((r) => [r.status, r.match_type])).toEqual([
      ["ready", "NEW_RECORD"],
      ["duplicate", "EXACT_MATCH"],
      ["error", "NEW_RECORD"],
      ["duplicate", "NEEDS_REVIEW"],
    ]);
    expect(rows[3]?.match_reasons[0]).toContain("row 1");
    expect(summary).toMatchObject({ total: 4, ready: 1, duplicates: 2, duplicates_unresolved: 2, exact_unresolved: 1, errors: 1, missing_team: 1, importable: 1 });
    expect(suggestedResolution("EXACT_MATCH", true)).toBe("use_existing");
  });

  it("keeps admin decisions when the match is unchanged and resets them otherwise", () => {
    const ctx = { teams: TEAMS, roster, guardians: [], today: TODAY };
    const kept = runImportPipeline(
      [input("b", 1, { first_name: "Ethan", last_name: "Johnson", date_of_birth: "2012-02-20" }, { resolution: "use_existing", match_player_id: "p1", match_type: "EXACT_MATCH" })],
      ctx,
    );
    expect(kept.rows[0]).toMatchObject({ resolution: "use_existing", status: "duplicate" });
    expect(kept.summary.importable).toBe(1);

    const reset = runImportPipeline(
      [input("b", 1, { first_name: "Evan", last_name: "Johnson", team: "U14B" }, { resolution: "use_existing", match_player_id: "p1", match_type: "EXACT_MATCH" })],
      ctx,
    );
    expect(reset.rows[0]).toMatchObject({ resolution: "create", status: "ready", match_type: "NEW_RECORD" });

    const skipped = runImportPipeline([input("c", 1, { first_name: "" }, { resolution: "skip" })], ctx);
    expect(skipped.rows[0]?.status).toBe("skipped");
  });
});
