import { expect, test } from "@playwright/test";

// Seed-free checks safe to run against any environment, including staging.
const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonHeaders = () => ({ apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", "content-type": "application/json" });

test("sign-in page renders", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/login/);
});

test("self-signup is disabled", async () => {
  const res = await fetch(`${supabaseUrl()}/auth/v1/signup`, {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({ email: `smoke-${Date.now()}@example.invalid`, password: "Smoke-test-12345" }),
  });
  expect(res.status).toBe(422);
});

test("anonymous API callers see no tenant data", async () => {
  for (const table of ["organizations", "players", "guardians", "audit_events", "campaigns"]) {
    const res = await fetch(`${supabaseUrl()}/rest/v1/${table}?select=id&limit=1`, { headers: anonHeaders() });
    const body = res.ok ? ((await res.json()) as unknown[]) : [];
    expect(body, table).toEqual([]);
  }
});
