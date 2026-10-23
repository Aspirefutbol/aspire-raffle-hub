import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ci = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

describe("database lint release gate", () => {
  it("fails CI on error diagnostics instead of merely printing them", () => {
    expect(ci).toMatch(/^\s+run: npx supabase db lint --local --level error --fail-on error\s*$/m);
  });

  it("does not permit ignored errors in the CI workflow", () => {
    expect(ci).not.toMatch(/continue-on-error:\s*true/);
    expect(ci).not.toMatch(/supabase db lint[^\n]*\|\|\s*(true|:)/);
  });
});
