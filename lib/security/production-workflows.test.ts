import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function workflow(name: string) {
  return readFileSync(join(process.cwd(), ".github", "workflows", name), "utf8");
}

describe("production workflow safety contracts", () => {
  it("keeps production bootstrap manual, main-only, reviewed, and exact-commit gated", () => {
    const text = workflow("production-bootstrap.yml");
    expect(text).toContain("workflow_dispatch:");
    expect(text).toContain("github.ref == 'refs/heads/main'");
    expect(text).toContain("environment: production");
    expect(text).toContain("pull-requests: read");
    expect(text).toContain("Verify production Auth configuration");
    expect(text).toContain("uri_allow_list");
    expect(text).toContain("smtp_host");
    expect(text).toContain("disable_signup");
    expect(text).toContain("Require this main commit to come from a merged pull request");
    expect(text).toContain("Wait for full CI on this main commit");
    expect(text).toContain("--dry-run");
    expect(text).toContain("Verify production schema matches committed TypeScript contract");
    expect(text).toContain("Verify production public API exposure contract");
    expect(text).toContain("public_seller_page,submit_seller_interest_request");
    expect(text).toContain("not c.relrowsecurity");
    expect(text).toContain("Verify production security advisors");
  });

  it("blocks production app deploy until the same commit passed bootstrap and environment preflight", () => {
    const text = workflow("production-deploy.yml");
    expect(text).toContain("workflow_dispatch:");
    expect(text).toContain("github.ref == 'refs/heads/main'");
    expect(text).toContain("environment: production");
    expect(text).toContain("pull-requests: read");
    expect(text).toContain("Require this main commit to come from a merged pull request");
    expect(text).toContain("Wait for full CI on this main commit");
    expect(text).toContain("Require successful production database bootstrap for this main commit");
    expect(text).toContain("production-bootstrap.yml");
    expect(text).toContain("Verify required production Netlify environment");
    expect(text).toContain("NEXT_PUBLIC_SITE_URL");
    expect(text).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(text).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(text).toContain("SUPABASE_SECRET_KEY");
    expect(text).toContain("Deploy exact main commit to production site");
    expect(text).toContain("Smoke-check production");
  });
});
