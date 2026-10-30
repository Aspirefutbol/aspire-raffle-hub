import { expect, test } from "@playwright/test";
import { apiAs, signIn } from "./helpers";

test.use({ actionTimeout: 15_000 });

test("phone-only supporter request: discounted quote, private contact and no issued tickets", async ({ page, browser }, testInfo) => {
  test.setTimeout(150_000);
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) {
    throw new Error("Phone supporter acceptance requires isolated local Supabase.");
  }

  const admin = await apiAs("admin@aspire.test");
  const family = await apiAs("coach@aspire.test");
  const org = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  if (org.error) throw org.error;
  const now = Date.now();
  const campaign = await admin.from("campaigns").insert({
    organization_id: org.data.id,
    name: `Synthetic phone supporter ${now}`,
    description: "Synthetic offline raffle request; no online sales.",
    ticket_price_cents: 2000,
    ticket_packages: [{ quantity: 5, priceCents: 9000 }],
    ticket_prefix: `PH${now.toString(36).slice(-6).toUpperCase()}`,
    default_allocation: 10,
    rules_text: "Synthetic cash/check only; external physical draw.",
    starts_at: new Date(now - 3600000).toISOString(),
    sales_close_at: new Date(now + 86400000).toISOString(),
    draw_at: new Date(now + 172800000).toISOString(),
  }).select("id").single();
  if (campaign.error) throw campaign.error;
  const campaignId = campaign.data.id;

  expect((await admin.rpc("enroll_campaign_players", {
    p_organization_id: org.data.id, p_campaign_id: campaignId, p_all_active: true,
  })).error).toBeNull();
  for (const status of ["READY", "ACTIVE"]) {
    expect((await admin.rpc("transition_campaign", {
      p_campaign_id: campaignId, p_to: status, p_reason: "Synthetic phone-only acceptance",
    })).error).toBeNull();
  }
  expect((await admin.rpc("prepare_campaign_inventory", {
    p_organization_id: org.data.id, p_campaign_id: campaignId,
  })).error).toBeNull();

  await signIn(page, "coach@aspire.test");
  await page.goto(`/o/aspire/fundraising/${campaignId}`);
  const playerChooser = page.getByRole("navigation", { name: "Choose player" });
  // This synthetic enrolled-all fixture has multiple linked players.
  // Require the streamed chooser to exist before clicking; count() can
  // incorrectly return zero during a fresh page load and skip selection.
  await expect(playerChooser).toBeVisible();
  await playerChooser.getByRole("button", { name: "Liam Smith", exact: true }).click();
  await expect(playerChooser.getByRole("button", { name: "Liam Smith", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Share raffle", exact: true }).click();
  await expect(page.getByTestId("family-player-card").filter({ hasText: "Liam Smith" }).getByTestId("seller-tools")).toBeVisible();
  const tools = page.getByTestId("family-player-card")
    .filter({ hasText: "Liam Smith" }).getByTestId("seller-tools");
  await tools.getByRole("button", { name: "Create my sharing link", exact: true }).click();
  await page.getByRole("dialog", { name: "Create sharing link?", exact: true })
    .getByRole("button", { name: "Confirm create link", exact: true }).click();
  await tools.getByTestId("share-options").locator("summary").click();
  const url = await tools.getByTestId("seller-url").innerText();

  const context = await browser.newContext({ viewport: { width: 320, height: 780 } });
  try {
    const supporter = await context.newPage();
    await supporter.goto(url);
    await expect(supporter.getByRole("heading", { name: "Request raffle tickets" })).toBeVisible();
    await supporter.getByLabel("How many tickets?").fill("5");
    await expect(supporter.getByRole("status", { name: "Requested ticket total" }))
      .toContainText("5 tickets · $90.00");
    await supporter.getByLabel("Your name", { exact: true }).fill("Phone-Only Supporter");
    await supporter.getByRole("combobox", { name: "Preferred contact" }).selectOption("phone");
    await expect(supporter.getByLabel(/^Email\s*\*?$/)).toHaveCount(0);
    await expect(supporter.locator('input[name="email"][type="hidden"]')).toHaveValue("");
    await supporter.getByLabel(/^Phone\s*\*?$/).fill("7135550123");
    await expect(supporter.getByLabel(/^Phone\s*\*?$/)).toHaveAttribute("required", "");

    for (const width of [320, 360, 390]) {
      await supporter.setViewportSize({ width, height: 780 });
      expect(await supporter.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      const send = await supporter.getByRole("button", { name: "Request tickets" }).boundingBox();
      expect(send).not.toBeNull();
      expect(send!.height).toBeGreaterThanOrEqual(44);
      expect(send!.x + send!.width).toBeLessThanOrEqual(width);
    }
    await supporter.screenshot({ path: testInfo.outputPath("phone-request-390.png"), fullPage: true });
    await supporter.getByRole("button", { name: "Request tickets", exact: true }).click();
    await expect(supporter.getByRole("status")).toContainText("Request sent!");
    await expect(supporter.getByRole("status")).toContainText("5 tickets · $90.00");
    await expect(supporter.getByRole("status"))
      .toContainText("No payment was collected on this page.");
    await supporter.screenshot({ path: testInfo.outputPath("phone-request-success.png"), fullPage: true });
  } finally {
    await context.close();
  }

  const inbox = await family.rpc("seller_request_inbox", {
    p_organization_id: org.data.id, p_campaign_id: campaignId,
  });
  expect(inbox.error).toBeNull();
  expect(inbox.data).toHaveLength(1);
  expect(inbox.data[0].supporter_name).toBe("Phone-Only Supporter");
  expect(inbox.data[0].preferred_contact).toBe("phone");
  expect(inbox.data[0].supporter_phone).toBe("7135550123");
  expect(inbox.data[0].supporter_email).toBeNull();
  expect(inbox.data[0].requested_quantity).toBe(5);
  expect(inbox.data[0].status).toBe("new");
  expect(inbox.data[0].sale_id).toBeNull();

  const sales = await admin.from("campaign_sales").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  expect(sales.error).toBeNull();
  expect(sales.count).toBe(0);
  await page.goto(`/o/aspire/fundraising/${campaignId}/requests`);
  const request = page.getByTestId("interest-request");
  await expect(request).toContainText("Phone-Only Supporter");
  await expect(request.getByRole("link", { name: "7135550123", exact: true }))
    .toHaveAttribute("href", "tel:7135550123");
  await expect(request).not.toContainText("@example");

  // The inbox is a separate parent task: reading a nonbinding supporter
  // request must not appear to have collected money or issued tickets.
  await expect(request).toContainText("new");
  await expect(request).toContainText("After you receive the approved cash or check payment");
  const completeSale = request.getByRole("button", { name: "I received payment — complete sale", exact: true });
  const options = request.locator("details").first();
  const optionsToggle = options.locator("summary");
  await expect(completeSale).toBeVisible();
  await expect(options).not.toHaveAttribute("open", "");
  await expect(request.getByRole("button", { name: "Mark contacted", exact: true })).not.toBeVisible();
  await expect(request.getByRole("button", { name: "Decline request", exact: true })).not.toBeVisible();
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // A parent must be able to tap directly to call a supporter without
    // a tiny inline text target or any horizontal scrolling.
    for (const control of [completeSale, optionsToggle, request.getByRole("link", { name: "7135550123", exact: true })]) {
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
  }
  // Secondary actions are available by deliberate disclosure, not crowded
  // alongside the primary offline-sale handoff on first entry.
  await optionsToggle.click();
  await expect(request.getByRole("button", { name: "Mark contacted", exact: true })).toBeVisible();
  await optionsToggle.click();
  await expect(options).not.toHaveAttribute("open", "");
  const untouchedMoney = await admin.from("money_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  expect(untouchedMoney.error).toBeNull();
  expect(untouchedMoney.count).toBe(0);
  const untouchedSales = await admin.from("campaign_sales").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  expect(untouchedSales.error).toBeNull();
  expect(untouchedSales.count).toBe(0);
});
