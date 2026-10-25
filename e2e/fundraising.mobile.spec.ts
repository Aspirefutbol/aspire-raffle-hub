import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { campaignProgressSchema } from "@/lib/fundraising/types";
import { apiAs, signIn } from "./helpers";

async function localTimestamp(page: Page, milliseconds: number) {
  return page.evaluate((value) => {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }, milliseconds);
}

async function expectPhoneLayout(page: Page) {
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0),
    "Phone input emulation must remain active throughout the workflow").toBe(true);
  const smallControls = await page.evaluate(() => {
    const failures: string[] = [];
    const selector = "main button, main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main select, header button, nav a, nav button, dialog[open] button, dialog[open] input:not([type=hidden]), dialog[open] select, dialog[open] textarea";
    for (const control of document.querySelectorAll<HTMLElement>(selector)) {
      const bounds = control.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) continue;
      if (bounds.height < 44) failures.push(`${control.tagName} ${control.getAttribute("aria-label") || control.textContent?.trim() || control.id}: ${bounds.height}px`);
    }
    return failures;
  });
  expect(smallControls, smallControls.join("\n")).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const dialogOverflow = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    return dialog ? dialog.scrollWidth - dialog.clientWidth : 0;
  });
  expect(dialogOverflow).toBeLessThanOrEqual(0);
}

test("phone family can recover a rejected timestamp and issue exact cash tickets without widening captain scope", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const day = 86_400_000;
  const now = Date.now();
  const suffix = now.toString(36).toUpperCase();
  const campaignName = `Phone raffle ${suffix}`;
  const admin = await apiAs("admin@aspire.test");
  const organization = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  expect(organization.error).toBeNull();
  const orgId = z.object({ id: z.uuid() }).parse(organization.data).id;
  const team = await admin.from("teams").select("id").eq("organization_id", orgId).eq("name", "U13 Boys").single();
  expect(team.error).toBeNull();
  const teamId = z.object({ id: z.uuid() }).parse(team.data).id;

  // Independent campaign fixture through a real authorized administrator.
  const draft = await admin.from("campaigns").insert({
    organization_id: orgId,
    name: campaignName,
    ticket_price_cents: 500,
    ticket_prefix: `MO${suffix.slice(-6)}`,
    goal_amount_cents: 100_000,
    player_goal_default_cents: 10_000,
    team_goal_default_cents: 50_000,
    default_allocation: 4,
    starts_at: new Date(now - day).toISOString(),
    sales_close_at: new Date(now + 7 * day).toISOString(),
    draw_at: new Date(now + 8 * day).toISOString(),
  }).select("id").single();
  expect(draft.error).toBeNull();
  const campaignId = z.object({ id: z.uuid() }).parse(draft.data).id;
  const enrolled = await admin.rpc("enroll_campaign_players", {
    p_organization_id: orgId, p_campaign_id: campaignId, p_team_ids: [teamId],
  });
  expect(enrolled.error).toBeNull();
  expect(enrolled.data).toBe(3);
  expect((await admin.rpc("transition_campaign", { p_campaign_id: campaignId, p_to: "READY" })).error).toBeNull();
  expect((await admin.rpc("transition_campaign", { p_campaign_id: campaignId, p_to: "ACTIVE", p_reason: "Board approved the independent phone raffle" })).error).toBeNull();
  const prepared = await admin.rpc("prepare_campaign_inventory", { p_organization_id: orgId, p_campaign_id: campaignId });
  expect(prepared.error).toBeNull();
  expect(prepared.data).toBe(12);
  const progress = async () => {
    const result = await admin.rpc("campaign_progress", { p_organization_id: orgId, p_campaign_id: campaignId, p_view: "admin" });
    expect(result.error).toBeNull();
    return campaignProgressSchema.parse(result.data);
  };
  const liam = (await progress()).participants.find((participant) => participant.player_name === "Liam Smith");
  if (!liam) throw new Error("The phone fixture must enroll Liam from U13 Boys");
  const inventory = await admin.from("tickets").select("ticket_number,status")
    .eq("campaign_id", campaignId).eq("participant_id", liam.id).order("sequence_number");
  expect(inventory.error).toBeNull();
  const stock = z.array(z.object({ ticket_number: z.string(), status: z.literal("ALLOCATED") })).parse(inventory.data);
  expect(stock).toHaveLength(4);
  const expectedNumbers = stock.slice(0, 2).map((ticket) => ticket.ticket_number);

  await signIn(page, "coach@aspire.test");
  await page.goto(`/o/aspire/fundraising/${campaignId}`);
  await expect(page.getByRole("heading", { name: "My fundraising", exact: true })).toBeVisible();
  await expect(page.getByTestId("family-campaign").getByRole("heading", { level: 2, name: new RegExp(campaignName) })).toContainText(campaignName);
  const card = page.getByTestId("family-player-card");
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("heading", { name: "Liam Smith", exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Mateo Garcia");
  await expect(page.locator("main")).not.toContainText("Isaac Martinez");
  await expectPhoneLayout(page);
  await card.getByRole("button", { name: "Record completed sale", exact: true }).click();
  const sale = page.getByRole("dialog", { name: "Record sale", exact: true });
  await sale.getByRole("textbox", { name: "Buyer name", exact: true }).fill("Phone cash buyer");
  await sale.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
  await expect(sale.getByRole("textbox", { name: "Amount collected ($)", exact: true })).toHaveValue("10.00");
  await sale.getByLabel("Payment method", { exact: true }).selectOption("cash");
  await sale.getByLabel("Sale timestamp", { exact: true }).fill(await localTimestamp(page, now - 2 * day));
  await expectPhoneLayout(page);
  // Full-page capture with a native dialog resets Chromium's mobile input
  // emulation. Capture the actual phone viewport and retain touch assertions.
  await page.screenshot({ path: testInfo.outputPath("phone-sale-form.png"), fullPage: false });
  await sale.getByRole("button", { name: "Record sale", exact: true }).click();
  await expect(sale.getByRole("alert")).toContainText("Sale timestamp must fall within the campaign sales window");
  await expect(sale.getByRole("button", { name: "Edit details", exact: true })).toBeVisible();
  const rejected = await progress();
  expect(rejected.recent_sales).toEqual([]);
  expect(rejected.totals.raised_cents).toBe(0);
  expect(rejected.totals.tickets_sold).toBe(0);
  expect(rejected.participants.find((participant) => participant.id === liam.id)?.available_tickets).toBe(4);
  const rejectedSales = await admin.from("campaign_sales").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  expect(rejectedSales.error).toBeNull();
  expect(rejectedSales.count).toBe(0);
  const rejectedMoney = await admin.from("money_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  expect(rejectedMoney.error).toBeNull();
  expect(rejectedMoney.count).toBe(0);
  await sale.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(sale.getByRole("textbox", { name: "Buyer name", exact: true })).toBeEditable();
  await expect(sale.getByRole("textbox", { name: "Buyer name", exact: true })).toHaveValue("Phone cash buyer");
  await expect(sale.getByLabel("Sale timestamp", { exact: true })).toBeEditable();
  await sale.getByLabel("Sale timestamp", { exact: true }).fill(await localTimestamp(page, Date.now()));
  await sale.getByRole("button", { name: "Record sale", exact: true }).click();
  const receipt = page.getByRole("dialog", { name: "Tickets issued", exact: true });
  await expect(receipt).toContainText("Sale complete!");
  await expect(receipt).toContainText("2 tickets sold · $10.00 raised");
  await expect(receipt).toContainText("offline payment is recorded and the tickets have been issued");
  await expect(receipt.getByText("View ticket numbers (2)", { exact: true })).toBeVisible();
  await expect(receipt.getByRole("listitem")).toHaveCount(0);
  await receipt.locator("details summary").click();
  await expect(receipt.getByRole("listitem")).toHaveText(expectedNumbers);
  await expectPhoneLayout(page);
  await page.screenshot({ path: testInfo.outputPath("phone-ticket-receipt.png"), fullPage: false });
  await receipt.getByRole("button", { name: "Done", exact: true }).click();
  await expect(card.getByText("Amount raised", { exact: true }).locator("..").getByText("$10.00", { exact: true })).toBeVisible();
  await expect(card.getByText("Tickets sold", { exact: true }).locator("..").getByText("2", { exact: true })).toBeVisible();
  await expect(card.getByText("2 tickets available", { exact: true })).toBeVisible();
  await expectPhoneLayout(page);
  await page.screenshot({ path: testInfo.outputPath("phone-family-progress.png"), fullPage: false });
  const final = await progress();
  expect(final.totals).toEqual({ raised_cents: 1000, tickets_sold: 2, player_count: 3, team_count: 1 });
  expect(final.recent_sales).toHaveLength(1);
  expect(final.recent_sales[0]).toMatchObject({ participant_id: liam.id, quantity: 2, amount_cents: 1000, payment_method: "cash", ticket_numbers: expectedNumbers });

  await page.goto(`/o/aspire/team-fundraising/${campaignId}`);
  await expect(page.getByRole("heading", { name: "Team fundraising", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mateo Garcia", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liam Smith", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Record sale|Record completed sale|Resume sale)$/ })).toHaveCount(0);
  await expectPhoneLayout(page);
  await page.screenshot({ path: testInfo.outputPath("phone-team-progress.png"), fullPage: false });
});
