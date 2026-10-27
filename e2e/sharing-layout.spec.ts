import { expect, test } from "@playwright/test";
import { apiAs, signIn } from "./helpers";

test.use({ actionTimeout: 15_000 });

test("parent sharing controls fit phone and tablet widths without changing the link", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw new Error("Sharing layout testing requires local Supabase.");
  const admin = await apiAs("admin@aspire.test");
  const org = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  if (org.error) throw org.error;
  const now = Date.now();
  const campaign = await admin.from("campaigns").insert({
    organization_id: org.data.id, name: `Synthetic sharing layout ${now}`,
    ticket_price_cents: 2000, ticket_packages: [{ quantity: 5, priceCents: 9000 }],
    ticket_prefix: `SL${now.toString(36).slice(-6).toUpperCase()}`, default_allocation: 10,
    rules_text: "Synthetic offline test. $20 single and five for $90. External drawing.",
    starts_at: new Date(now - 3600000).toISOString(),
    sales_close_at: new Date(now + 86400000).toISOString(), draw_at: new Date(now + 172800000).toISOString(),
  }).select("id").single();
  if (campaign.error) throw campaign.error;
  const id = campaign.data.id;
  expect((await admin.rpc("enroll_campaign_players", { p_organization_id: org.data.id, p_campaign_id: id, p_all_active: true })).error).toBeNull();
  for (const status of ["READY", "ACTIVE"]) expect((await admin.rpc("transition_campaign", { p_campaign_id: id, p_to: status, p_reason: "Synthetic sharing layout acceptance" })).error).toBeNull();
  await signIn(page, "coach@aspire.test");
  await page.goto(`/o/aspire/fundraising/${id}`);
  const playerChooser = page.getByRole("navigation", { name: "Choose player" });
  // This synthetic enrolled-all fixture has multiple linked players.
  // Require the streamed chooser to exist before clicking; count() can
  // incorrectly return zero during a fresh page load and skip selection.
  await expect(playerChooser).toBeVisible();
  await playerChooser.getByRole("button", { name: "Liam Smith", exact: true }).click();
  await expect(playerChooser.getByRole("button", { name: "Liam Smith", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("family-player-card").filter({ hasText: "Liam Smith" })).toBeVisible();
  // Parents must be able to hit each top-level action at narrow phone widths.
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dashboard = page.getByTestId("touch-dashboard");
    for (const name of ["Share raffle", "Record sale", "My progress"]) {
      const box = await dashboard.getByRole("button", { name, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(88);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const requests = await dashboard.getByRole("link", { name: "Requests", exact: true }).boundingBox();
    expect(requests).not.toBeNull();
    expect(requests!.height).toBeGreaterThanOrEqual(88);
  }
  const playerCard = page.getByTestId("family-player-card").filter({ hasText: "Liam Smith" });
  const playerHeading = playerCard.getByRole("heading", { name: "Liam Smith", exact: true });
  await page.getByRole("button", { name: "Share raffle", exact: true }).click();
  const shareBack = playerCard.getByTestId("parent-share-task").getByRole("button", { name: "Back to actions", exact: true });
  // The tile becomes hidden on navigation: keyboard/screen-reader focus must
  // move to a visible way back, not remain trapped in that hidden tile.
  await expect(shareBack).toBeFocused();
  await shareBack.click();
  await expect(playerHeading).toBeFocused();
  await playerCard.getByRole("button", { name: "My progress", exact: true }).click();
  const progressBack = playerCard.getByTestId("parent-progress-task").getByRole("button", { name: "Back to actions", exact: true });
  await expect(progressBack).toBeFocused();
  await progressBack.click();
  await expect(playerHeading).toBeFocused();
  await playerCard.getByRole("button", { name: "Share raffle", exact: true }).click();
  await expect(shareBack).toBeFocused();
  const tools = page.getByTestId("family-player-card").filter({ hasText: "Liam Smith" }).getByTestId("seller-tools");
  await expect(tools).toContainText("Step 1");
  await tools.getByRole("button", { name: "Create my sharing link", exact: true }).click();
  await page.getByRole("dialog", { name: "Create sharing link?", exact: true }).getByRole("button", { name: "Confirm create link", exact: true }).click();
  // Alternatives are deliberately tucked away, but remain available and touch-friendly.
  await expect(tools.getByRole("button", { name: "Copy invitation to share", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Copy link", exact: true })).not.toBeVisible();
  await tools.getByTestId("share-options").locator("summary").click();
  const url = await tools.getByTestId("seller-url").innerText();
  expect(decodeURIComponent((await tools.getByRole("link", { name: "Text / SMS", exact: true }).getAttribute("href"))!)).toContain("5 for $90.00");
  await tools.getByRole("button", { name: "Show QR code", exact: true }).click();
  await expect(tools.getByRole("img")).toBeVisible();
  for (const width of [320, 360, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await tools.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const shareDisclosure = await tools.getByTestId("share-options").locator("summary").boundingBox();
    expect(shareDisclosure).not.toBeNull();
    expect(shareDisclosure!.height).toBeGreaterThanOrEqual(44);
    for (const name of ["Copy invitation to share", "Copy link"]) {
      const box = await tools.getByRole("button", { name, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const qrBox = await tools.getByRole("img").boundingBox();
    expect(Math.abs(qrBox!.width - qrBox!.height)).toBeLessThan(1);
    await tools.getByText("Link settings", { exact: true }).click();
    await tools.getByRole("button", { name: "Create a new sharing link", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Create sharing link?", exact: true });
    await expect(confirmation).toContainText("Choose Cancel");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(tools.getByTestId("seller-url")).toHaveText(url);
    await tools.getByText("Link settings", { exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`parent-sharing-${width}.png`), fullPage: true });
  }
  expect((await admin.from("campaign_sales").select("id", { count: "exact", head: true }).eq("campaign_id", id)).count).toBe(0);
});
