import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { moneyProjectionSchema } from "@/lib/money/schemas";
import { campaignProgressSchema, recordedSaleSchema } from "@/lib/fundraising/types";
import { apiAs, signIn } from "./helpers";

test("money custody: partial receipts, uncertain retry, returned checks and correction accounting stay separate from tickets", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  for (const endpoint of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.E2E_BASE_URL ?? "http://localhost:3000"])
    if (!endpoint || !["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname)) throw new Error("Synthetic money acceptance requires local services.");
  const admin = await apiAs("admin@aspire.test");
  const family = await apiAs("coach@aspire.test");
  const org = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  if (org.error) throw org.error;
  const orgId = org.data.id;
  const team = await admin.from("teams").select("id").eq("organization_id", orgId).eq("name", "U13 Boys").single();
  if (team.error) throw team.error;
  const now = Date.now();
  const draft = await admin.from("campaigns").insert({ organization_id: orgId, name: `Synthetic money ${now.toString(36)}`,
    description: "Local synthetic custody acceptance only.", ticket_price_cents: 500, ticket_prefix: `MC${now.toString(36).slice(-6).toUpperCase()}`,
    default_allocation: 12, rules_text: "Synthetic approved offline raffle rules.", support_email: "support@aspire.test",
    starts_at: new Date(now - 3600000).toISOString(), sales_close_at: new Date(now + 86400000).toISOString(), draw_at: new Date(now + 172800000).toISOString(),
  }).select("id").single();
  if (draft.error) throw draft.error;
  const campaignId = draft.data.id;
  expect((await admin.rpc("enroll_campaign_players", { p_organization_id: orgId, p_campaign_id: campaignId, p_team_ids: [team.data.id] })).error).toBeNull();
  for (const status of ["READY", "ACTIVE"]) expect((await admin.rpc("transition_campaign", { p_campaign_id: campaignId, p_to: status, p_reason: "Synthetic money launch" })).error).toBeNull();
  expect((await admin.rpc("prepare_campaign_inventory", { p_organization_id: orgId, p_campaign_id: campaignId })).error).toBeNull();
  const progress = await admin.rpc("campaign_progress", { p_organization_id: orgId, p_campaign_id: campaignId, p_view: "admin" });
  const liam = campaignProgressSchema.parse(progress.data).participants.find((p) => p.player_name === "Liam Smith");
  if (!liam) throw new Error("Liam must be enrolled.");
  async function issue(key: string, soldAt: number, corrects?: string) {
    const result = await (corrects ? admin : family).rpc("record_campaign_sale", { p_organization_id: orgId, p_campaign_id: campaignId, p_participant_id: liam!.id,
      p_idempotency_key: key, p_buyer_name: "Synthetic custody buyer", p_quantity: 2, p_amount_cents: 1000, p_payment_method: "cash",
      p_sold_at: new Date(soldAt).toISOString(), p_corrects_sale_id: corrects });
    expect(result.error).toBeNull(); return recordedSaleSchema.parse(result.data);
  }
  const one = await issue(randomUUID(), now - 120000);
  await issue(randomUUID(), now - 60000);
  async function money() {
    const result = await admin.rpc("campaign_money", { p_organization_id: orgId, p_campaign_id: campaignId, p_view: "admin" });
    expect(result.error).toBeNull(); return moneyProjectionSchema.parse(result.data);
  }
  const sellerId = (await money()).sellers[0]!.id;
  await signIn(page, "admin@aspire.test");
  await page.goto(`/o/aspire/campaigns/${campaignId}`);
  await page.getByRole("link", { name: "Money & reconciliation", exact: true }).click();
  await expect(page.getByTestId("money-expected_cents")).toHaveText("$20.00");
  await expect(page.getByTestId("money-received_cents")).toHaveText("$0.00");
  const form = page.getByTestId("money-operation-form");
  let dropped = false;
  await page.route(`**/campaigns/${campaignId}/money`, async (route) => {
    if (route.request().method() === "POST" && !dropped) { dropped = true; await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await form.getByLabel("Seller / family account", { exact: true }).selectOption(sellerId);
  await form.getByLabel("Amount ($)", { exact: true }).fill("15.00");
  await form.getByLabel("Reason / notes").fill("Synthetic partial cash turn-in, five dollars still held");
  await form.getByRole("button", { name: "Record turn-in (full or partial)", exact: true }).click();
  await expect.poll(async () => (await money()).totals.received_cents).toBe(1500);
  await expect(form.getByRole("button", { name: "Retry preserved submission", exact: true })).toBeEnabled();
  await form.getByRole("button", { name: "Retry preserved submission", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("Existing money event confirmed");
  await page.unroute(`**/campaigns/${campaignId}/money`);
  expect((await money()).events.filter((e) => e.kind === "receipt")).toHaveLength(1);
  const cash = (await money()).events.find((e) => e.kind === "receipt")!.id;
  async function submit(kind: string, values: Record<string, string>) {
    await form.getByLabel("Choose action", { exact: true }).selectOption(kind);
    for (const [label, value] of Object.entries(values)) {
      const input = form.getByLabel(label, { exact: true });
      if (await input.evaluate((el) => el.tagName === "SELECT")) await input.selectOption(value);
      else await input.fill(value);
    }
    await form.getByLabel("Reason / notes").fill(`Synthetic ${kind} evidence`);
    const before = (await money()).events.length;
    await form.getByRole("button").click();
    await expect.poll(async () => (await money()).events.length).toBe(before + 1);
    await expect(form.getByRole("status")).toContainText("Money event recorded");
  }
  await submit("receipt", { "Seller / family account": sellerId, "Received as": "check", "Amount ($)": "5.00", "Check / batch reference": "Synthetic check 42" });
  const checkEvent = (await money()).events.find((e) => e.kind === "receipt" && e.payment_method === "check")!;
  const check = checkEvent.id;
  await form.getByLabel("Choose action", { exact: true }).selectOption("check_returned");
  await expect(form.getByLabel("Original receipt", { exact: true }).locator(`option[value="${check}"]`)).toContainText("receipt total $5.00");
  await expect(page.getByTestId("money-uncleared_cents")).toHaveText("$5.00");
  await submit("check_returned", { "Original receipt": check });
  await expect(page.getByTestId("money-exception_cents")).toHaveText("$5.00");
  await expect(page.getByTestId("money-outstanding_cents")).toHaveText("$5.00");
  await submit("receipt", { "Seller / family account": sellerId, "Received as": "cash", "Amount ($)": "5.00" });
  await submit("exception_resolved", { "Original receipt": check });
  await submit("deposit", { "Original receipt": cash, "Amount ($)": "15.00", "Check / batch reference": "Synthetic deposit A" });
  expect((await admin.rpc("reverse_campaign_sale", { p_organization_id: orgId, p_sale_id: one.sale_id, p_reason: "Synthetic correction after physical turn-in" })).error).toBeNull();
  const replacement = await issue(randomUUID(), Date.now(), one.sale_id);
  await page.reload();
  await expect(page.getByTestId("money-received_cents")).toHaveText("$20.00");
  await submit("credit", { "Original receipt": cash, "Source sale": one.sale_id, "Replacement / destination sale": replacement.sale_id, "Amount ($)": "7.00" });
  await submit("refund", { "Original receipt": cash, "Source sale": one.sale_id, "Amount ($)": "3.00" });
  await submit("adjustment", { "Source sale": replacement.sale_id, "Amount ($)": "2.00" });
  await submit("receipt", { "Seller / family account": sellerId, "Received as": "cash", "Amount ($)": "1.00" });
  await expect(page.getByTestId("money-outstanding_cents")).toHaveText("$0.00");
  await expect(page.getByTestId("money-received_cents")).toHaveText("$18.00");
  await expect(page.getByTestId("money-adjustment_cents")).toHaveText("$2.00");
  await expect(page.getByTestId("money-deposited_cents")).toHaveText("$15.00");
  expect((await money()).events.filter((e) => e.kind === "receipt")).toHaveLength(4);
  const after = await admin.rpc("campaign_progress", { p_organization_id: orgId, p_campaign_id: campaignId, p_view: "admin" });
  expect(campaignProgressSchema.parse(after.data).totals.tickets_sold).toBe(4);
  await page.setViewportSize({ width: 360, height: 780 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath("money-admin-360.png") });
  const familyContext = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const familyPage = await familyContext.newPage();
  try {
    await signIn(familyPage, "coach@aspire.test");
    await familyPage.goto(`/o/aspire/campaigns/${campaignId}/money`);
    // Next's streamed notFound boundary may follow HTTP 200 headers. Verify
    // actual denial and absence of financial data rather than headers alone.
    await expect(familyPage.getByRole("heading", { name: "We couldn’t find that page", exact: true })).toBeVisible();
    await expect(familyPage.getByTestId("money-operation-form")).toHaveCount(0);
    await expect(familyPage.getByTestId("money-balances")).toHaveCount(0);
    await expect(familyPage.getByText("Synthetic partial cash turn-in", { exact: false })).toHaveCount(0);
    await familyPage.goto(`/o/aspire/fundraising/${campaignId}`);
    await expect(familyPage.getByTestId(`money-player-${liam.player_id}`)).toBeVisible();
    await expect(familyPage.getByTestId("money-received_cents")).toHaveText("$18.00");
    await expect(familyPage.getByText("Synthetic partial cash turn-in", { exact: false })).toHaveCount(0);
    await expect(familyPage.getByTestId("money-operation-form")).toHaveCount(0);
    const scoped = await family.rpc("campaign_money", { p_organization_id: orgId, p_campaign_id: campaignId, p_view: "family" });
    expect(moneyProjectionSchema.parse(scoped.data).participants).toHaveLength(1);
    expect(moneyProjectionSchema.parse(scoped.data).events).toHaveLength(0);
    await familyPage.goto(`/o/aspire/team-fundraising/${campaignId}`);
    await expect(familyPage.getByTestId("money-player-" + liam.player_id)).toBeVisible();
    await expect(familyPage.getByTestId("money-operation-form")).toHaveCount(0);
    await expect.poll(() => familyPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  } finally { await familyContext.close(); }
});
