import { expect, test, type Browser, type Page } from "@playwright/test";
import { z } from "zod";
import { apiAs, MAILPIT_URL, PASSWORD, signIn, uniqueEmail } from "./helpers";

const familyEmail = uniqueEmail("home-family");
const captainEmail = uniqueEmail("home-captain");
let campaignId: string;

async function submitLogin(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
}

/** Provision isolated local accounts through the existing invitation workflow.
 * Memberships and the campaign remain as auditable fixtures; never delete them
 * or change the seeded coach's roles/links to manufacture a single-role user. */
async function inviteLocalAccount(adminPage: Page, browser: Browser, email: string, roleLabel: string) {
  await adminPage.goto("/o/aspire/settings/members");
  await adminPage.getByRole("button", { name: "Add member", exact: true }).click();
  const dialog = adminPage.getByRole("dialog", { name: "Add member", exact: true });
  await dialog.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await dialog.getByLabel(roleLabel).check();
  await dialog.getByRole("button", { name: "Add or invite", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(adminPage.locator("main li").filter({ hasText: email })).toBeVisible();

  let messageId = "";
  await expect.poll(async () => {
    const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (!response.ok) return "";
    const body = z.object({ messages: z.array(z.object({ ID: z.string() })) }).parse(await response.json());
    messageId = body.messages[0]?.ID ?? "";
    return messageId;
  }, { timeout: 15_000 }).not.toBe("");
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  expect(response.ok).toBe(true);
  const message = z.object({ HTML: z.string() }).parse(await response.json());
  const link = /href="([^"]*token_hash=[^"]*)"/.exec(message.HTML)?.[1]?.replace(/&amp;/g, "&");
  expect(link).toBeTruthy();

  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  try {
    const invitee = await context.newPage();
    await invitee.goto(link!);
    await expect(invitee).toHaveURL(/\/welcome$/);
    await invitee.getByRole("textbox", { name: "Your name", exact: true }).fill(`Routing ${roleLabel}`);
    await invitee.getByLabel("Password (optional)", { exact: true }).fill(PASSWORD);
    await invitee.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(invitee).toHaveURL(/\/o\/aspire\/(fundraising|team-fundraising)$/);
  } finally {
    await context.close();
  }

  const userApi = await apiAs(email);
  const user = await userApi.auth.getUser();
  expect(user.error).toBeNull();
  const admin = await apiAs("admin@aspire.test");
  const membership = await admin.from("organization_members").select("id")
    .eq("user_id", user.data.user!.id).single();
  expect(membership.error).toBeNull();
  return z.object({ id: z.uuid() }).parse(membership.data).id;
}

async function expectFamilyFixture(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "My fundraising", exact: true })).toBeVisible();
  const campaign = page.locator(`[data-testid="family-campaign"][data-campaign-id="${campaignId}"]`);
  await expect(campaign.getByTestId("family-player-card")).toHaveCount(1);
  await expect(campaign.getByRole("heading", { name: "Liam Smith", exact: true })).toBeVisible();
  await expect(campaign).not.toContainText("Mateo Garcia");
  await expect(campaign).not.toContainText("Isaac Martinez");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard", exact: true })).toHaveCount(0);
}

async function recoverToHome(page: Page, deniedPath: string, expectedHome: RegExp) {
  // Next can stream the denied page with HTTP 200: prove the actual fallback
  // renders, protected content is absent, and its link exits the denied route.
  await page.goto(deniedPath);
  await expect(page.getByRole("heading", { name: "We couldn’t find that page", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Go to your home", exact: true }).click();
  await expect(page).toHaveURL(expectedHome);
  await expect(page.getByRole("heading", { name: "We couldn’t find that page", exact: true })).toHaveCount(0);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const frontend = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000");
  const mailpit = new URL(MAILPIT_URL);
  if ([backend, frontend, mailpit].some((url) => !["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Home-routing fixture setup requires local Supabase, app and Mailpit; it must never provision hosted QA accounts.");
  }
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  try {
    const adminPage = await context.newPage();
    await signIn(adminPage, "admin@aspire.test");
    const familyMemberId = await inviteLocalAccount(adminPage, browser, familyEmail, "Seller / Family");
    const captainMemberId = await inviteLocalAccount(adminPage, browser, captainEmail, "Team Manager / Captain");
    const admin = await apiAs("admin@aspire.test");
    const organization = await admin.from("organizations").select("id").eq("slug", "aspire").single();
    expect(organization.error).toBeNull();
    const orgId = z.object({ id: z.uuid() }).parse(organization.data).id;
    const player = await admin.from("players").select("id, household_id").eq("organization_id", orgId)
      .eq("first_name", "Liam").eq("last_name", "Smith").single();
    expect(player.error).toBeNull();
    const liam = z.object({ id: z.uuid(), household_id: z.uuid() }).parse(player.data);
    // A guardian can link to only one account. Preserve the coach's Dana link
    // and primary guardian by creating a separate, non-primary local record.
    const guardian = await admin.rpc("create_guardian", {
      p_organization_id: orgId, p_household_id: liam.household_id,
      p_guardian: { first_name: "Routing", last_name: "Family", email: familyEmail, relationship: "parent" },
      p_player_ids: [liam.id], p_make_primary: false,
    });
    expect(guardian.error).toBeNull();
    const guardianId = z.uuid().parse(guardian.data);
    const team = await admin.from("teams").select("id").eq("organization_id", orgId).eq("name", "U13 Boys").single();
    expect(team.error).toBeNull();
    const teamId = z.object({ id: z.uuid() }).parse(team.data).id;
    expect((await admin.rpc("link_family_guardian", {
      p_member_id: familyMemberId, p_guardian_id: guardianId, p_reason: "Local family home-routing acceptance fixture",
    })).error).toBeNull();
    expect((await admin.rpc("set_team_staff_assignments", {
      p_member_id: captainMemberId, p_team_ids: [teamId], p_reason: "Local captain home-routing acceptance fixture",
    })).error).toBeNull();

    const now = Date.now();
    const day = 86_400_000;
    const draft = await admin.from("campaigns").insert({
      organization_id: orgId, name: `Home routing ${now.toString(36)}`,
      ticket_price_cents: 500, ticket_prefix: `HR${now.toString(36).slice(-6).toUpperCase()}`,
      starts_at: new Date(now - day).toISOString(), sales_close_at: new Date(now + 7 * day).toISOString(),
      draw_at: new Date(now + 8 * day).toISOString(),
    }).select("id").single();
    expect(draft.error).toBeNull();
    campaignId = z.object({ id: z.uuid() }).parse(draft.data).id;
    const enrolled = await admin.rpc("enroll_campaign_players", {
      p_organization_id: orgId, p_campaign_id: campaignId, p_team_ids: [teamId],
    });
    expect(enrolled.error).toBeNull();
    expect(enrolled.data).toBe(3);
    expect((await admin.rpc("transition_campaign", { p_campaign_id: campaignId, p_to: "READY" })).error).toBeNull();
    expect((await admin.rpc("transition_campaign", {
      p_campaign_id: campaignId, p_to: "ACTIVE", p_reason: "Activate isolated local home-routing acceptance fixture",
    })).error).toBeNull();
  } finally {
    await context.close();
  }
});

test("family login and denied-admin dashboard fallback return to linked-family fundraising", async ({ page }) => {
  await signIn(page, familyEmail);
  await expect(page).toHaveURL(/\/o\/aspire\/fundraising$/);
  await expectFamilyFixture(page);
  await recoverToHome(page, "/o/aspire/dashboard", /\/o\/aspire\/fundraising$/);
  await expectFamilyFixture(page);
  await recoverToHome(page, `/o/aspire/team-fundraising/${campaignId}`, /\/o\/aspire\/fundraising$/);
  await expectFamilyFixture(page);
});

test("captain-only login and family-route fallback return to assigned-team fundraising", async ({ page }) => {
  await signIn(page, captainEmail);
  await expect(page).toHaveURL(/\/o\/aspire\/team-fundraising$/);
  await expect(page.getByRole("heading", { level: 1, name: "Team fundraising", exact: true })).toBeVisible();
  await recoverToHome(page, `/o/aspire/fundraising/${campaignId}`, /\/o\/aspire\/team-fundraising$/);
  await page.goto(`/o/aspire/team-fundraising/${campaignId}`);
  for (const name of ["Liam Smith", "Isaac Martinez", "Mateo Garcia"]) {
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Record sale", exact: true })).toHaveCount(0);
});

test("admin login and missing-page fallback preserve the organization dashboard", async ({ page }) => {
  await signIn(page, "admin@aspire.test");
  await expect(page).toHaveURL(/\/o\/aspire\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard", exact: true })).toBeVisible();
  await recoverToHome(page, "/o/aspire/not-a-real-page", /\/o\/aspire\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard", exact: true })).toBeVisible();
});

test("admin sign-out then combined family/captain login prefers family home and preserves allowed team deep links", async ({ page }) => {
  await signIn(page, "admin@aspire.test");
  await expect(page).toHaveURL(/\/o\/aspire\/dashboard$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await submitLogin(page, "coach@aspire.test");
  await expect(page).toHaveURL(/\/o\/aspire\/fundraising$/);
  await expectFamilyFixture(page);
  await recoverToHome(page, "/o/aspire/dashboard", /\/o\/aspire\/fundraising$/);
  await expectFamilyFixture(page);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const teamPath = `/o/aspire/team-fundraising/${campaignId}`;
  await page.goto(teamPath);
  await expect(page).toHaveURL(/\/login\?next=/);
  await submitLogin(page, "coach@aspire.test");
  await expect(page).toHaveURL(new RegExp(`${teamPath}$`));
  for (const name of ["Liam Smith", "Isaac Martinez", "Mateo Garcia"]) {
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Record sale", exact: true })).toHaveCount(0);
  await page.goto("/");
  await expect(page).toHaveURL(/\/o\/aspire\/fundraising$/);
  await expectFamilyFixture(page);
});
