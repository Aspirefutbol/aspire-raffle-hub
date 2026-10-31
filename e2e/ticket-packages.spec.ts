import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { apiAs, signIn } from "./helpers";
import { campaignProgressSchema } from "@/lib/fundraising/types";
import { moneyProjectionSchema } from "@/lib/money/schemas";

// Bound a missing control to a focused failure instead of the full journey timeout.
test.use({ actionTimeout: 15_000 });

async function timestamp(page: Page, value: number) {
  return page.evaluate((v) => {
    const d = new Date(v), pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, value);
}

test("packages: admin setup, family sale/retry, exact receipts, correction, custody and frozen drawing", async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw new Error("Package testing requires disposable local Supabase.");
  const admin = await apiAs("admin@aspire.test"), familyApi = await apiAs("coach@aspire.test");
  const { data: org, error } = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  if (error || !org) throw error ?? new Error("Missing synthetic organization");
  const now = Date.now(), day = 86_400_000, name = `Package raffle ${now}`;
  await signIn(page, "admin@aspire.test");
  await page.goto("/o/aspire/campaigns");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "New raffle campaign", exact: true });
  await draft.getByRole("textbox", { name: "Campaign name", exact: true }).fill(name);
  await draft.getByLabel("Ticket price ($)", { exact: true }).fill("20.00");
  await draft.getByRole("button", { name: "Add ticket package", exact: true }).click();
  await draft.getByLabel("Package 1 tickets", { exact: true }).fill("5");
  await draft.getByLabel("Package 1 price ($)", { exact: true }).fill("90.00");
  await expect(draft.getByTestId("ticket-package-row")).toContainText("Package 1 — 5 tickets for $90.00");
  await draft.getByLabel("Preview ticket quantity", { exact: true }).fill("11");
  await expect(draft.getByRole("status")).toContainText("11 tickets · $200.00");
  await draft.getByLabel("Ticket number prefix", { exact: true }).fill(`PK${now.toString(36).slice(-6).toUpperCase()}`);
  await draft.getByLabel("Tickets per player", { exact: true }).fill("30");
  await draft.getByLabel("Sales start", { exact: true }).fill(await timestamp(page, now - day));
  await draft.getByLabel("Sales close", { exact: true }).fill(await timestamp(page, now + day));
  await draft.getByLabel("Drawing date", { exact: true }).fill(await timestamp(page, now + 2 * day));
  await draft.getByLabel("Raffle rules", { exact: true }).fill("Synthetic offline raffle. $20 single, five for $90. External witnessed drawing.");
  await draft.getByLabel("Charitable purpose of proceeds", { exact: true }).fill("Synthetic youth development fixture");
  await draft.getByLabel("Raffle number this calendar year", { exact: true }).fill("1");
  await draft.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
  const campaignId = new URL(page.url()).pathname.split("/").at(-1)!;
  const created = await admin.from("campaigns").select("ticket_price_cents,ticket_packages").eq("id", campaignId).single();
  expect(created.error).toBeNull();
  expect(created.data).toMatchObject({ ticket_price_cents: 2000, ticket_packages: [{ quantity: 5, priceCents: 9000 }] });
  expect((await admin.rpc("upsert_campaign_prize", { p_organization_id: org.id, p_campaign_id: campaignId, p_name: "Synthetic training package", p_description: "Synthetic donated training package", p_fair_value_cents: 50000, p_source: "DONATED", p_possession_basis: "OWNED_OR_POSSESSED", p_evidence_ref: "SYNTHETIC-PACKAGE-TEST" })).error).toBeNull();
  expect((await admin.rpc("enroll_campaign_players", { p_organization_id: org.id, p_campaign_id: campaignId, p_all_active: true })).error).toBeNull();
  for (const status of ["READY", "ACTIVE"]) expect((await admin.rpc("transition_campaign", { p_campaign_id: campaignId, p_to: status, p_reason: "Synthetic package campaign approval" })).error).toBeNull();
  expect((await admin.rpc("prepare_campaign_inventory", { p_organization_id: org.id, p_campaign_id: campaignId })).error).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "Edit campaign", exact: true }).click();
  const locked = page.getByRole("dialog", { name: "Edit raffle campaign", exact: true });
  await expect(locked.getByLabel("Package 1 price ($)", { exact: true })).toBeDisabled();
  await expect(locked.getByLabel("Ticket price ($)", { exact: true })).toBeDisabled();
  await locked.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await admin.from("campaigns").update({ ticket_packages: [] }).eq("id", campaignId)).error?.code).toBe("23514");
  const progress = async () => campaignProgressSchema.parse((await admin.rpc("campaign_progress", { p_organization_id: org.id, p_campaign_id: campaignId, p_view: "admin" })).data);
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", viewport: { width: 390, height: 844 } });
  try {
    const family = await context.newPage();
    await signIn(family, "coach@aspire.test");
    await family.goto(`/o/aspire/fundraising/${campaignId}`);
    const playerChooser = family.getByRole("navigation", { name: "Choose player" });
    const chooseLiam = async () => {
      // This enrolled-all-players fixture includes multiple linked players.
      // Wait for the streamed dashboard, then require an explicit player selection.
      await expect(family.getByTestId("parent-touch-tasks")).toBeVisible();
      await expect(playerChooser).toBeVisible();
      await playerChooser.getByRole("button", { name: "Liam Smith", exact: true }).click();
      await expect(playerChooser.getByRole("button", { name: "Liam Smith", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(family.getByTestId("family-player-card").filter({ hasText: "Liam Smith" })).toBeVisible();
    };
    await chooseLiam();
    const card = family.getByTestId("family-player-card").filter({ hasText: "Liam Smith" });
    await family.getByText("Raffle info", { exact: true }).click();
    await expect(family.getByTestId("family-campaign")).toContainText("5 for $90.00");
    await card.getByRole("button", { name: "Record sale", exact: true }).click();
    let form = family.getByRole("dialog", { name: "Record sale", exact: true });
    await form.getByRole("textbox", { name: "Buyer name", exact: true }).fill("Package Cash Buyer");
    await form.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("5");
    await expect(form.getByRole("textbox", { name: "Amount collected ($)", exact: true })).toHaveValue("90.00");
    await form.getByRole("textbox", { name: "Amount collected ($)", exact: true }).fill("100.00");
    await form.getByRole("button", { name: "Record sale", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("approved ticket package total");
    expect((await progress()).recent_sales).toHaveLength(0);
    await form.getByRole("textbox", { name: "Amount collected ($)", exact: true }).fill("90.00");
    await form.getByRole("button", { name: "Record sale", exact: true }).click();
    await family.getByRole("dialog").getByRole("link", { name: "View / print tickets", exact: true }).click();
    await expect(family.getByTestId("issued-ticket")).toHaveCount(5);
    await expect(family.getByTestId("issued-ticket").first()).toContainText("$18.00");
    await expect(family.getByTestId("ticket-package-receipt").first()).toContainText("5 tickets for $90.00");
    expect(await family.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await family.screenshot({ path: testInfo.outputPath("package-ticket-phone.png"), fullPage: true });
    const first = (await progress()).recent_sales[0]!;

    await family.goto(`/o/aspire/fundraising/${campaignId}`);
    await chooseLiam();
    await card.getByRole("button", { name: "Record sale", exact: true }).click();
    form = family.getByRole("dialog", { name: "Record sale", exact: true });
    await form.getByRole("textbox", { name: "Buyer name", exact: true }).fill("Package Check Buyer");
    await form.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("6");
    await form.getByLabel("Payment method", { exact: true }).selectOption("check");
    await expect(form.getByRole("textbox", { name: "Amount collected ($)", exact: true })).toHaveValue("110.00");
    let dropped = false;
    await family.route(`**/o/aspire/fundraising/${campaignId}`, async (route) => {
      if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
        dropped = true; await route.fetch(); await route.abort("failed");
      } else await route.continue();
    });
    await form.getByRole("button", { name: "Record sale", exact: true }).click();
    await expect(form.getByRole("button", { name: "Retry same sale", exact: true })).toBeVisible();
    await form.getByRole("button", { name: "Retry same sale", exact: true }).click();
    const packageReceipt = family.getByRole("dialog", { name: "Tickets issued", exact: true });
    await expect(packageReceipt).toContainText("Sale complete!");
    await expect(packageReceipt).toContainText("6 tickets sold · $110.00 raised");
    await expect(packageReceipt).toContainText("offline payment is recorded and the tickets have been issued");
    await expect(packageReceipt.getByText("View ticket numbers (6)", { exact: true })).toBeVisible();
    await packageReceipt.locator("details summary").click();
    await expect(packageReceipt.getByRole("listitem")).toHaveCount(6);
    await family.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
    expect((await progress()).recent_sales).toHaveLength(2);
    expect((await progress()).totals.raised_cents).toBe(20000);
    const familyUser = (await familyApi.auth.getUser()).data.user!.id;
    const receipt = await admin.rpc("record_money_custody", { p_organization_id: org.id, p_campaign_id: campaignId, p_request: { kind: "receipt", idempotency_key: randomUUID(), reason: "Synthetic package cash custody", seller_id: familyUser, amount_cents: 9000, payment_method: "cash" } });
    expect(receipt.error).toBeNull();
    await page.goto(`/o/aspire/campaigns/${campaignId}`);
    const row = page.getByTestId(`campaign-sale-${first.id}`);
    await row.getByRole("button", { name: "Reverse sale", exact: true }).click();
    const reversal = page.getByRole("dialog", { name: "Reverse sale", exact: true });
    await reversal.getByRole("textbox", { name: "Reason for reversal", exact: true }).fill("Synthetic bundle buyer correction");
    await reversal.getByRole("button", { name: "Confirm reversal", exact: true }).click();
    await expect(reversal).not.toBeVisible();
    await row.getByRole("button", { name: "Record correction", exact: true }).click();
    const correction = page.getByRole("dialog", { name: "Record sale", exact: true });
    await correction.getByRole("textbox", { name: "Buyer name", exact: true }).fill("Corrected Package Buyer");
    await correction.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("5");
    await expect(correction.getByRole("textbox", { name: "Amount collected ($)", exact: true })).toHaveValue("90.00");
    await correction.getByRole("button", { name: "Record sale", exact: true }).click();
    await page.getByRole("dialog", { name: "Tickets issued", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
    const replacement = (await progress()).recent_sales.find((sale) => sale.corrects_sale_id === first.id)!;
    expect(replacement.amount_cents).toBe(9000);
    expect(replacement.ticket_numbers.every((number) => !first.ticket_numbers.includes(number))).toBe(true);
    expect((await admin.rpc("record_money_custody", { p_organization_id: org.id, p_campaign_id: campaignId, p_request: { kind: "credit", idempotency_key: randomUUID(), reason: "Transfer existing bundle cash", amount_cents: 9000, receipt_id: receipt.data.event_id, sale_id: first.id, target_sale_id: replacement.id } })).error).toBeNull();
    const check = await admin.rpc("record_money_custody", { p_organization_id: org.id, p_campaign_id: campaignId, p_request: { kind: "receipt", idempotency_key: randomUUID(), reason: "Synthetic package check custody", seller_id: familyUser, amount_cents: 11000, payment_method: "check" } });
    expect(check.error).toBeNull();
    expect((await admin.rpc("record_money_custody", { p_organization_id: org.id, p_campaign_id: campaignId, p_request: { kind: "check_cleared", idempotency_key: randomUUID(), reason: "Synthetic check clears", receipt_id: check.data.event_id } })).error).toBeNull();
    const money = moneyProjectionSchema.parse((await admin.rpc("campaign_money", { p_organization_id: org.id, p_campaign_id: campaignId, p_view: "admin" })).data);
    expect(money.totals).toMatchObject({ expected_cents: 20000, received_cents: 20000, outstanding_cents: 0 });
    expect((await admin.from("campaigns").update({ sales_close_at: new Date().toISOString() }).eq("id", campaignId)).error).toBeNull();
    expect((await admin.rpc("transition_campaign", { p_campaign_id: campaignId, p_to: "CLOSED", p_reason: "Synthetic package sales complete" })).error).toBeNull();
    const frozen = await admin.rpc("freeze_drawing", { p_organization_id: org.id, p_campaign_id: campaignId, p_idempotency_key: randomUUID(), p_reason: "Synthetic package drawing freeze", p_prize_readiness_confirmed: true });
    expect(frozen.error).toBeNull();
    expect(frozen.data).toMatchObject({ count: 11, total_face_value_cents: 20000 });
    const integrity = await admin.rpc("verify_drawing_snapshot", { p_organization_id: org.id, p_snapshot_id: frozen.data.snapshot_id });
    expect(integrity.error).toBeNull(); expect(integrity.data.ok).toBe(true);
  } finally { await context.close(); }
});
