import { expect, test } from "@playwright/test";
import { apiAs, signIn } from "./helpers";

test.use({ actionTimeout: 15_000 });

test("revoking one linked sibling's seller link never disables another sibling or records money", async ({ page, browser }) => {
  test.setTimeout(120_000);
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) {
    throw new Error("Sibling link isolation testing requires local Supabase.");
  }

  const admin = await apiAs("admin@aspire.test");
  const org = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  if (org.error) throw org.error;
  const now = Date.now();
  const campaign = await admin.from("campaigns").insert({
    organization_id: org.data.id, name: `Synthetic sibling isolation ${now}`,
    ticket_price_cents: 2000,
    ticket_packages: [{ quantity: 5, priceCents: 9000 }],
    ticket_prefix: `SI${now.toString(36).slice(-6).toUpperCase()}`,
    default_allocation: 10,
    rules_text: "Synthetic offline fundraising; external physical drawing.",
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
      p_campaign_id: campaignId, p_to: status,
      p_reason: "Synthetic linked sibling token isolation",
    })).error).toBeNull();
  }

  expect((await admin.rpc("prepare_campaign_inventory", { p_organization_id: org.data.id, p_campaign_id: campaignId })).error).toBeNull();

  await signIn(page, "coach@aspire.test");
  await page.goto(`/o/aspire/fundraising/${campaignId}`);
  const chooser = page.getByRole("navigation", { name: "Choose player" });
  await expect(chooser).toBeVisible();
  const liamButton = chooser.getByRole("button", { name: "Liam Smith", exact: true });
  await liamButton.click();
  const liamCard = page.getByTestId("family-player-card").filter({ hasText: "Liam Smith" });
  await liamCard.getByRole("button", { name: "Share raffle", exact: true }).click();
  const liamTools = liamCard.getByTestId("seller-tools");
  await liamTools.getByRole("button", { name: "Create my sharing link", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Create sharing link?", exact: true });
  await createDialog.getByRole("button", { name: "Confirm create link", exact: true }).click();
  await expect(createDialog).toBeHidden();
  await liamTools.getByTestId("share-options").locator("summary").click();
  const liamUrl = await liamTools.getByTestId("seller-url").innerText();
  expect(new URL(liamUrl).pathname).toMatch(/^\/s\/[0-9a-f]{64}$/);

  const siblingButton = chooser.getByRole("button").filter({ hasNotText: "Liam Smith" }).first();
  await expect(siblingButton).toBeVisible();
  const siblingName = (await siblingButton.innerText()).trim();
  await siblingButton.click();
  await expect(liamCard).toBeHidden();
  const siblingCard = page.getByTestId("family-player-card").filter({ hasText: siblingName });
  await expect(siblingCard).toBeVisible();
  await siblingCard.getByRole("button", { name: "Share raffle", exact: true }).click();
  const siblingTools = siblingCard.getByTestId("seller-tools");
  await siblingTools.getByRole("button", { name: "Create my sharing link", exact: true }).click();
  await createDialog.getByRole("button", { name: "Confirm create link", exact: true }).click();
  await expect(createDialog).toBeHidden();
  await siblingTools.getByTestId("share-options").locator("summary").click();
  const siblingUrl = await siblingTools.getByTestId("seller-url").innerText();
  expect(siblingUrl).not.toBe(liamUrl);

  // Both supporters can make a nonbinding request; neither page collects payment.
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const supporter = await context.newPage();
  await supporter.goto(liamUrl);
  await expect(supporter.getByRole("button", { name: "Request tickets", exact: true })).toBeVisible();
  await expect(supporter.locator("form")).toContainText("No payment is collected here.");
  await supporter.goto(siblingUrl);
  await expect(supporter.getByRole("button", { name: "Request tickets", exact: true })).toBeVisible();

  // Cancel preserves BOTH links; confirmation disables only the selected sibling.
  await siblingTools.getByText("Link settings", { exact: true }).click();
  await siblingTools.getByRole("button", { name: "Revoke seller link", exact: true }).click();
  const disableDialog = page.getByRole("dialog", { name: "Disable sharing link?", exact: true });
  await disableDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(siblingTools.getByTestId("seller-url")).toHaveText(siblingUrl);
  await supporter.goto(liamUrl);
  await expect(supporter.getByRole("button", { name: "Request tickets", exact: true })).toBeVisible();
  await supporter.goto(siblingUrl);
  await expect(supporter.getByRole("button", { name: "Request tickets", exact: true })).toBeVisible();

  await siblingTools.getByRole("button", { name: "Revoke seller link", exact: true }).click();
  await disableDialog.getByRole("button", { name: "Confirm disable link", exact: true }).click();
  await expect(siblingTools.getByRole("status")).toContainText("Link revoked");
  await supporter.goto(siblingUrl);
  await expect(supporter.getByRole("button", { name: "Request tickets", exact: true })).toHaveCount(0);
  await supporter.goto(liamUrl);
  await expect(supporter.getByRole("button", { name: "Request tickets", exact: true })).toBeVisible();

  // Link management alone must not issue tickets, submit requests or record money.
  for (const table of ["campaign_sales", "money_events", "seller_interest_requests"] as const) {
    const result = await admin.from(table).select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
    expect(result.error).toBeNull();
    expect(result.count).toBe(0);
  }
  await context.close();
});
