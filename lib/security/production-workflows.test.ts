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
    expect(text).toContain("PRODUCTION_DB_URL");
    expect(text).not.toContain("Resolve production session-pooler connection");
    expect(text).toContain("Verify production Auth configuration");
    expect(text).toContain("Verify production database SSL enforcement");
    expect(text).toContain("uri_allow_list");
    expect(text).toContain("smtp_host");
    expect(text).toContain("disable_signup");
    expect(text).toContain("Require this main commit to come from a merged pull request");
    expect(text).toContain("Wait for full CI on this main commit");
    expect(text).toContain("Verify production database URL identity");
    expect(text).toContain("Require successful read-only production preflight for this commit");
    expect(text).toContain("production-preflight.yml");
    expect(text).toContain("--dry-run");
    expect(text).toContain("Verify production schema matches committed TypeScript contract");
    expect(text).toContain("Verify production public API exposure contract");
    expect(text).toContain("public_seller_page,submit_seller_interest_request");
    expect(text).toContain("not c.relrowsecurity");
    expect(text).toContain("Verify production security advisors");
  });

  it("uses the exact staging database host without requiring a Supabase management PAT", () => {
    const text = workflow("hosted-qa.yml");
    expect(text).toContain("SUPABASE_DB_PASSWORD");
    expect(text).toContain("Build exact staging database connection");
    expect(text).toContain('"db."+process.env.STAGING_PROJECT_REF+".supabase.co"');
    expect(text).toContain("sslmode=require");
    expect(text).toContain("npx supabase migration list --db-url");
    expect(text).toContain("npx supabase db push --db-url");
    expect(text).toContain("npx supabase gen types typescript --db-url");
    expect(text).not.toContain("secrets.SUPABASE_ACCESS_TOKEN");
    expect(text).not.toContain("supabase link --project-ref");
    expect(text).not.toContain("Resolve staging session-pooler connection");
  });

  it("keeps production preflight read-only and exact-commit gated", () => {
    const text = workflow("production-preflight.yml");
    expect(text).toContain("workflow_dispatch:");
    expect(text).toContain("github.ref == 'refs/heads/main'");
    expect(text).toContain("environment: production");
    expect(text).toContain("Require this main commit to come from a merged pull request");
    expect(text).toContain("Wait for full CI on this main commit");
    expect(text).toContain("Verify production database URL identity");
    expect(text).toContain("Verify production Auth configuration");
    expect(text).toContain("Verify production database SSL enforcement");
    expect(text).toContain("Verify required production Netlify environment");
    expect(text).toContain("Preview production migration delta — no writes");
    expect(text).toContain("--dry-run");
    expect(text).toContain("Inspect current production public API exposure — no writes");
    expect(text).toContain("Verify current production security advisors — no writes");
    expect(text).not.toContain("db push --db-url \"$PRODUCTION_DB_URL\" --yes");
    expect(text).not.toContain("netlify-cli@27.12.0 deploy");
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
