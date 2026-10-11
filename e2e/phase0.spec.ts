import { expect, test } from "@playwright/test";
import { apiAs, MAILPIT_URL, signIn, uniqueEmail } from "./helpers";

// Phase 0 acceptance: one test per checklist item. Runs serially against freshly
// reset + seeded data (npx supabase db reset && npm run seed:dev).
test.describe.configure({ mode: "serial" });

test("platform admin manages an organization's protected settings with a reason", async ({ page }) => {
  await signIn(page, "superadmin@rafflehub.test");
  await page.goto("/platform");
  await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
  await page.getByRole("link", { name: /Northside Youth Soccer/ }).click();
  await expect(page.getByText("Protected settings")).toBeVisible();

  // Toggle so the test is re-runnable against the same database.
  const select = page.getByLabel("Jurisdiction profile");
  const target = (await select.inputValue()) ? "" : "TEXAS_CREA_OFFLINE_PAYMENT";
  await select.selectOption(target);
  const save = page.getByRole("button", { name: "Save protected changes" });
  await expect(save).toBeDisabled(); // reason required
  const reason = `Counsel review ${Date.now()}`;
  await page.getByLabel("Reason").fill(reason);
  await save.click();
  await expect(page.getByText(`“${reason}”`)).toBeVisible();
  await expect(page.getByText(/jurisdiction profile: .* → /).first()).toBeVisible();
});

test("platform admin creates an organization and its first admin is invited", async ({ page }) => {
  await signIn(page, "superadmin@rafflehub.test");
  await page.goto("/platform");
  await page.getByRole("button", { name: /new organization/i }).click();
  const name = `E2E Club ${Date.now().toString(36)}`;
  await page.locator("#po_name").fill(name);
  await page.locator("#po_admin").fill(uniqueEmail("director"));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("main li").filter({ hasText: name }).getByText("1 pending invites")).toBeVisible();

  // Org admins can't reach platform organization management.
  const api = await apiAs("admin@aspire.test");
  const { error } = await api.rpc("platform_organization_summaries");
  expect(error?.code).toBe("42501");
});

test("org admin cannot change protected fields — not in the UI, not through the API", async ({ page }) => {
  await signIn(page, "admin@aspire.test");
  await page.goto("/o/aspire/settings");
  await expect(page.getByText("Set by your platform administrator.")).toBeVisible();
  await expect(page.getByLabel("Jurisdiction profile")).toHaveCount(0);
  await expect(page.getByLabel("URL slug")).toHaveCount(0);
  const platform = await page.goto("/platform");
  expect(platform?.status()).toBe(404);

  const api = await apiAs("admin@aspire.test");
  const { data: org } = await api.from("organizations").select("id, jurisdiction_profile, status").eq("slug", "aspire").single();
  expect(org).toBeTruthy();
  const direct = await api.from("organizations").update({ status: "suspended" }).eq("id", org!.id);
  expect(direct.error?.code).toBe("42501");
  const rpc = await api.rpc("platform_update_organization", { p_organization_id: org!.id, p_changes: { status: "archived" }, p_reason: "try it" });
  expect(rpc.error?.code).toBe("42501");
  // Allowed field still works for the org admin.
  const allowed = await api.from("organizations").update({ support_phone: "(713) 555-0199" }).eq("id", org!.id);
  expect(allowed.error).toBeNull();
});

test("org admin adds an existing user and invites a new one in-app", async ({ page, browser }) => {
  await signIn(page, "admin@aspire.test");
  await page.goto("/o/aspire/settings/members");

  // Existing account (admin of another org) → added immediately with two roles.
  await page.getByRole("button", { name: "Add member" }).click();
  await page.locator("#member-email").fill("ADMIN@northside.test");
  await page.getByLabel("Finance Admin").check();
  await page.getByLabel("Campaign Manager").check();
  await page.getByRole("button", { name: "Add or invite" }).click();
  const row = page.locator("main li").filter({ hasText: "admin@northside.test" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Finance Admin")).toBeVisible();
  await expect(row.getByText("Campaign Manager")).toBeVisible();

  // New email → pending invitation + invite email delivered.
  const email = uniqueEmail("seller");
  await page.getByRole("button", { name: "Add member" }).click();
  await page.locator("#member-email").fill(email);
  await page.getByLabel("Seller / Family").check();
  await page.getByRole("button", { name: "Add or invite" }).click();
  await expect(page.locator("main li").filter({ hasText: email }).getByText("Seller / Family")).toBeVisible();

  if (process.env.E2E_SKIP_MAILPIT === "1") return;
  let messageId = "";
  await expect
    .poll(async () => {
      const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
      const body = res.ok ? ((await res.json()) as { messages: { ID: string }[] }) : { messages: [] };
      messageId = body.messages[0]?.ID ?? "";
      return messageId;
    }, { timeout: 15_000 })
    .not.toBe("");

  // Follow the emailed link as the invitee: confirm → welcome → membership is active.
  const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)).json()) as { HTML: string };
  const link = /href="([^"]*token_hash=[^"]*)"/.exec(message.HTML)?.[1]?.replace(/&amp;/g, "&");
  expect(link).toBeTruthy();
  const invitee = await browser.newContext();
  const p2 = await invitee.newPage();
  await p2.goto(link!);
  await expect(p2).toHaveURL(/\/welcome/);
  await p2.getByLabel("Your name").fill("Sam Seller");
  await p2.getByRole("button", { name: "Continue" }).click();
  await expect(p2).toHaveURL(/\/o\/aspire\//);
  await invitee.close();

  await page.reload();
  await expect(page.locator("main li").filter({ hasText: email }).filter({ hasText: "Sam Seller" })).toBeVisible();
});

test("a user can hold multiple roles; changes are audited with the reason", async ({ page }) => {
  await signIn(page, "admin@aspire.test");
  await page.goto("/o/aspire/settings/members");
  const row = page.locator("main li").filter({ hasText: "auditor@aspire.test" });
  await row.getByRole("button", { name: "Roles" }).click();
  await page.getByLabel("Finance Admin").check();
  await page.getByLabel(/^Reason/).fill("Covers turn-ins this season");
  await page.getByRole("button", { name: "Save roles" }).click();
  await expect(row.getByText("Auditor (read-only)")).toBeVisible();
  await expect(row.getByText("Finance Admin")).toBeVisible();

  await page.goto("/o/aspire/settings/activity?category=MEMBER");
  await expect(page.getByRole("row").filter({ hasText: "Role granted" }).filter({ hasText: "Covers turn-ins this season" }).first()).toBeVisible();
});

test("permissions are enforced server-side for lower roles", async ({ page }) => {
  await signIn(page, "coach@aspire.test");
  const api = await apiAs("coach@aspire.test");
  const { data: org } = await api.from("organizations").select("id").eq("slug", "aspire").single();
  // Team captain + seller holds no members.manage / roster.write.
  const add = await api.rpc("add_organization_member", {
    p_organization_id: org!.id, p_user_id: "00000000-0000-0000-0000-000000000000", p_roles: ["ORGANIZATION_ADMIN"], p_reason: "escalate",
  });
  expect(add.error).not.toBeNull();
  const team = await api.from("teams").insert({ organization_id: org!.id, name: "Sneaky FC" }).select();
  expect(team.error).not.toBeNull();
  const camp = await api.from("campaigns").insert({ organization_id: org!.id, name: "Rogue raffle" }).select();
  expect(camp.error).not.toBeNull();

  await page.goto("/o/aspire/settings/members");
  await expect(page.getByRole("button", { name: "Add member" })).toHaveCount(0);
});

test("campaign lifecycle: ticket price locks after activation and every status change is recorded", async () => {
  const api = await apiAs("admin@aspire.test");
  const { data: org } = await api.from("organizations").select("id").eq("slug", "aspire").single();
  const day = 86_400_000;
  const { data: c, error } = await api
    .from("campaigns")
    .insert({
      organization_id: org!.id, name: `E2E raffle ${Date.now()}`, ticket_price_cents: 1000, ticket_prefix: "E2E",
      starts_at: new Date(Date.now() - day).toISOString(), sales_close_at: new Date(Date.now() + 30 * day).toISOString(),
      draw_at: new Date(Date.now() + 31 * day).toISOString(),
    })
    .select("id, status")
    .single();
  expect(error).toBeNull();
  expect(c!.status).toBe("DRAFT");

  expect((await api.rpc("transition_campaign", { p_campaign_id: c!.id, p_to: "ACTIVE", p_reason: "skip ahead" })).error).not.toBeNull();
  expect((await api.rpc("transition_campaign", { p_campaign_id: c!.id, p_to: "READY" })).error).toBeNull();
  expect((await api.rpc("transition_campaign", { p_campaign_id: c!.id, p_to: "ACTIVE" })).error).not.toBeNull(); // reason required
  expect((await api.rpc("transition_campaign", { p_campaign_id: c!.id, p_to: "ACTIVE", p_reason: "Board approved" })).error).toBeNull();

  const price = await api.from("campaigns").update({ ticket_price_cents: 500 }).eq("id", c!.id);
  expect(price.error?.message).toMatch(/Locked after activation/);
  const status = await api.from("campaigns").update({ status: "DRAFT" }).eq("id", c!.id);
  expect(status.error).not.toBeNull();

  const { data: events } = await api.from("campaign_events").select("from_status, to_status, reason").eq("campaign_id", c!.id).order("chain_pos");
  expect(events).toEqual([
    { from_status: "DRAFT", to_status: "READY", reason: null },
    { from_status: "READY", to_status: "ACTIVE", reason: "Board approved" },
  ]);
  const { data: chain } = await api.rpc("verify_campaign_ledgers", { p_campaign_id: c!.id });
  expect(JSON.stringify(chain)).not.toMatch(/"ok":\s*false/);
});

test("public self-signup is disabled — accounts come only from admin invitations", async () => {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ email: `stranger-${Date.now()}@x.test`, password: "Whatever-12345" }),
  });
  expect(res.status).toBe(422);
  expect(((await res.json()) as { error_code: string }).error_code).toBe("signup_disabled");
});
