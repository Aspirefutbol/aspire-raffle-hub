import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("preserves ordinary relative deep links without normalizing them", () => {
    expect(safeNextPath("/o/aspire/dashboard?x=1#details")).toBe("/o/aspire/dashboard?x=1#details");
    expect(safeNextPath("/login?next=%2Fo%2Faspire")).toBe("/login?next=%2Fo%2Faspire");
    expect(safeNextPath("/o/../o/aspire")).toBe("/o/../o/aspire");
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/%09/evil.example",
    "/%0a/evil.example",
    "/%0d/evil.example",
    "/%00/evil.example",
    "/%1f/evil.example",
    "/%7f/evil.example",
    "/%5c/evil.example",
    "/%2f/evil.example",
    "/%250a/evil.example",
    "/%252f/evil.example",
    "/o/..//evil.example",
    "/\t/evil.example",
    "/\r/evil.example",
    "/\n/evil.example",
  ])("rejects unsafe or ambiguous redirect %s", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("rejects malformed and non-string targets", () => {
    expect(safeNextPath(undefined, "/login")).toBe("/login");
    expect(safeNextPath("not a path")).toBe("/");
    expect(safeNextPath("/%broken")).toBe("/%broken");
  });
});
