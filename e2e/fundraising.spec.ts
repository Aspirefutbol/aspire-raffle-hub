import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { campaignProgressSchema } from "@/lib/fundraising/types";
import { apiAs, signIn } from "./helpers";

const stockSchema = z.array(z.object({ ticket_number: z.string(), status: z.string() }));

async function localTimestamp(page: Page, milliseconds: number) {
  return page.evaluate((value) => {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }, milliseconds);
}

async function expectStat(page: Page, label: string, value: string) {
  const card = page.getByText(label, { exact: true }).first().locator("../..");
  await expect(card.getByText(value, { exact: true })).toBeVisible();
}

test("raffle: admin prepares inventory, family issues cash tickets, and approved correction preserves history", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const day = 86_400_000;
  const suffix = Date.now().toString(36).toUpperCase();
  const campaignName = `Desktop raffle ${suffix}`;
  const prefix = `DE${suffix.slice(-6)}`;
  const admin = await apiAs("admin@aspire.test");
  const organization = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  expect(organization.error).toBeNull();
  const orgId = z.object({ id: z.uuid() }).parse(organization.data).id;

  await signIn(page, "admin@aspire.test");
  await page.goto("/o/aspire/campaigns");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "New raffle campaign", exact: true });
  await draft.getByRole("textbox", { name: "Campaign name", exact: true }).fill(campaignName);
  await draft.getByLabel("Ticket price ($)", { exact: true }).fill("5.00");
  await draft.getByLabel("Campaign goal ($)", { exact: true }).fill("1000.00");
  await draft.getByLabel("Default player goal ($)", { exact: true }).fill("100.00");
  await draft.getByLabel("Default team goal ($)", { exact: true }).fill("500.00");
  await draft.getByLabel("Tickets per player", { exact: true }).fill("4");
  await draft.getByLabel("Ticket number prefix", { exact: true }).fill(prefix);
  await draft.getByLabel("Sales start", { exact: true }).fill(await localTimestamp(page, Date.now() - day));
  await draft.getByLabel("Sales close", { exact: true }).fill(await localTimestamp(page, Date.now() + 7 * day));
  await draft.getByLabel("Drawing date", { exact: true }).fill(await localTimestamp(page, Date.now() + 8 * day));
  await draft.getByLabel("Support email", { exact: true }).fill("support@aspire.test");
  await draft.getByLabel("Support phone", { exact: true }).fill("7135550101");
  await draft.getByLabel("Charitable purpose of proceeds", { exact: true }).fill("Support Aspire youth soccer financial aid and player development");
  await draft.getByLabel("Raffle number this calendar year", { exact: true }).fill("1");
  await draft.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page).toHaveURL(/\/o\/aspire\/campaigns\/[0-9a-f-]+$/);
  const campaignId = z.uuid().parse(new URL(page.url()).pathname.split("/").at(-1));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(campaignName);

  const prize = await admin.rpc("upsert_campaign_prize", {
    p_organization_id: orgId,
    p_campaign_id: campaignId,
    p_name: "Coaching package",
    p_description: "Donated synthetic coaching package and equipment bundle",
    p_fair_value_cents: 25_000,
    p_source: "DONATED",
    p_possession_basis: "OWNED_OR_POSSESSED",
    p_evidence_ref: "SYNTHETIC-E2E-DONATION-EVIDENCE",
  });
  expect(prize.error).toBeNull();

  const progress = async () => {
    const result = await admin.rpc("campaign_progress", {
      p_organization_id: orgId, p_campaign_id: campaignId, p_view: "admin",
    });
    expect(result.error).toBeNull();
    return campaignProgressSchema.parse(result.data);
  };

  await page.getByRole("button", { name: "Enroll players", exact: true }).click();
  const enrollment = page.getByRole("dialog", { name: "Enroll players", exact: true });
  await enrollment.getByRole("radio", { name: "Selected teams", exact: true }).check();
  await enrollment.getByRole("checkbox", { name: /U13 Boys/ }).check();
  await enrollment.getByRole("button", { name: "Enroll players", exact: true }).click();
  await expect(enrollment).not.toBeVisible();
  await expectStat(page, "Participating players", "3");
  await expectStat(page, "Participating teams", "1");
  const enrolled = await progress();
  expect(enrolled.participants.map((participant) => participant.player_name).sort()).toEqual(["Isaac Martinez", "Liam Smith", "Mateo Garcia"]);
  expect(enrolled.participants.every((participant) => participant.goal_amount_cents === 10_000)).toBe(true);
  expect(enrolled.teams).toHaveLength(1);
  expect(enrolled.teams[0]?.goal_amount_cents).toBe(50_000);

  await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  await page.getByRole("button", { name: "Activate campaign", exact: true }).click();
  const activation = page.getByRole("dialog", { name: "Activate campaign", exact: true });
  await activation.getByRole("textbox", { name: "Reason", exact: true }).fill("Board approved the desktop raffle pilot");
  await activation.getByRole("button", { name: "Activate campaign", exact: true }).click();
  await expect(activation).not.toBeVisible();
  await page.getByRole("button", { name: "Prepare inventory", exact: true }).click();
  await expect.poll(async () => (await progress()).participants.reduce((sum, participant) => sum + participant.available_tickets, 0)).toBe(12);
  const prepared = await progress();
  expect(prepared.campaign.status).toBe("ACTIVE");
  await page.getByRole("button", { name: "Edit campaign", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit raffle campaign", exact: true });
  for (const label of ["Campaign name", "Ticket price ($)", "Ticket number prefix", "Sales start", "Drawing date"]) {
    const field = label === "Campaign name"
      ? edit.getByRole("textbox", { name: label, exact: true })
      : edit.getByLabel(label, { exact: true });
    await expect(field).toBeDisabled();
  }
  await expect(edit.getByLabel("Sales close", { exact: true })).toBeEditable();
  await edit.getByLabel("Description", { exact: true }).fill("Active raffle description updated without changing locked disclosures");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).not.toBeVisible();
  const updated = await progress();
  expect(updated.campaign.description).toBe("Active raffle description updated without changing locked disclosures");
  expect(updated.campaign).toMatchObject({ name: campaignName, ticket_price_cents: 500, ticket_prefix: prefix, player_goal_default_cents: 10_000, team_goal_default_cents: 50_000, default_allocation: 4 });
  expect(updated.campaign.starts_at).toBe(prepared.campaign.starts_at);
  expect(updated.campaign.draw_at).toBe(prepared.campaign.draw_at);
  const liam = prepared.participants.find((participant) => participant.player_name === "Liam Smith");
  expect(liam).toBeDefined();
  if (!liam) throw new Error("Liam must be enrolled in U13 Boys");
  const inventoryResult = await admin.from("tickets").select("ticket_number,status")
    .eq("campaign_id", campaignId).eq("participant_id", liam.id).order("sequence_number");
  expect(inventoryResult.error).toBeNull();
  const inventory = stockSchema.parse(inventoryResult.data);
  expect(inventory).toHaveLength(4);
  expect(inventory.every((ticket) => ticket.status === "ALLOCATED")).toBe(true);
  const issuedNumbers = inventory.slice(0, 2).map((ticket) => ticket.ticket_number);
  const replacementNumbers = inventory.slice(2).map((ticket) => ticket.ticket_number);
  expect(issuedNumbers.every((number) => number.startsWith(`${prefix}-`))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("desktop-admin-prepared.png"), fullPage: true });

  const familyContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  try {
    const family = await familyContext.newPage();
    await signIn(family, "coach@aspire.test");
    await family.goto("/o/aspire/fundraising");
    await expect(family.getByRole("heading", { name: "My fundraising", exact: true })).toBeVisible();
    const raffle = family.locator(`[data-testid="family-campaign"][data-campaign-id="${campaignId}"]`);
    await expect(raffle.getByRole("heading", { level: 2, name: new RegExp(campaignName) })).toContainText(campaignName);
    await raffle.getByRole("link", { name: "View raffle", exact: true }).click();
    await expect(family).toHaveURL(new RegExp(`/fundraising/${campaignId}$`));
    const playerCard = family.getByTestId("family-player-card");
    await expect(playerCard).toHaveCount(1);
    await expect(playerCard.getByRole("heading", { name: "Liam Smith", exact: true })).toBeVisible();
    await expect(family.locator("main")).not.toContainText("Mateo Garcia");
    await expect(family.locator("main")).not.toContainText("Isaac Martinez");
    await expect(playerCard.getByText("4 tickets available", { exact: true })).toBeVisible();

    // Captain visibility remains a separate read projection, including Mateo.
    await family.goto(`/o/aspire/team-fundraising/${campaignId}`);
    await expect(family.getByRole("heading", { name: "Team fundraising", exact: true })).toBeVisible();
    await expect(family.getByRole("row").filter({ hasText: "Mateo Garcia" })).toBeVisible();
    await expect(family.getByRole("button", { name: /^(Record sale|Record completed sale|Resume sale)$/ })).toHaveCount(0);
    await family.goto(`/o/aspire/fundraising/${campaignId}`);
    await playerCard.getByRole("button", { name: "Record completed sale", exact: true }).click();
    const sale = family.getByRole("dialog", { name: "Record sale", exact: true });
    await sale.getByRole("textbox", { name: "Buyer name", exact: true }).fill("Desktop cash buyer");
    await sale.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
    await expect(sale.getByRole("textbox", { name: "Amount collected ($)", exact: true })).toHaveValue("10.00");
    await sale.getByLabel("Payment method", { exact: true }).selectOption("cash");
    await sale.getByRole("button", { name: "Record sale", exact: true }).click();
    const receipt = family.getByRole("dialog", { name: "Tickets issued", exact: true });
    await expect(receipt).toContainText("Sale complete!");
    await expect(receipt).toContainText("2 tickets sold · $10.00 raised");
    await expect(receipt).toContainText("offline payment is recorded and the tickets have been issued");
    await expect(receipt.getByText("View ticket numbers (2)", { exact: true })).toBeVisible();
    await expect(receipt.getByRole("listitem")).toHaveCount(0);
    await receipt.locator("details summary").click();
    await expect(receipt.getByRole("listitem")).toHaveText(issuedNumbers);
    await family.screenshot({ path: testInfo.outputPath("desktop-family-ticket-receipt.png"), fullPage: true });
    await receipt.getByRole("link", { name: "View / print tickets", exact: true }).click();
    await expect(family.getByRole("heading", { name: "Issued raffle tickets", exact: true })).toBeVisible();
    await expect(family.getByRole("button", { name: "Print tickets", exact: true })).toBeVisible();
    await expect(family.getByTestId("issued-ticket")).toHaveCount(2);
    for (const number of issuedNumbers) await expect(family.getByTestId("issued-ticket").filter({ hasText: number })).toBeVisible();
    await expect(family.getByText("Aspire Sports Group", { exact: true }).first()).toBeVisible();
    await expect(family.getByTestId("issued-ticket").first()).toContainText("100 Example Way (dev placeholder)");
    await expect(family.getByText("$5.00", { exact: true }).first()).toBeVisible();
    await expect(family.getByTestId("issued-ticket").first()).toContainText("Coaching package: Donated synthetic coaching package and equipment bundle (estimated value $250.00)");
    await expect(family.getByText("Prize award / drawing date", { exact: true }).first()).toBeVisible();
    await family.screenshot({ path: testInfo.outputPath("desktop-family-printable-tickets.png"), fullPage: true });
    await family.goto(`/o/aspire/fundraising/${campaignId}`);
    const refreshedPlayerCard = family.getByTestId("family-player-card");
    await expect(refreshedPlayerCard.getByText("Amount raised", { exact: true }).locator("..").getByText("$10.00", { exact: true })).toBeVisible();
    await expect(refreshedPlayerCard.getByText("Tickets sold", { exact: true }).locator("..").getByText("2", { exact: true })).toBeVisible();
    await expect(refreshedPlayerCard.getByText("2 tickets available", { exact: true })).toBeVisible();
    await expect(refreshedPlayerCard.getByRole("progressbar", { name: "Personal fundraising goal", exact: true })).toHaveAttribute("value", "10");
    await family.screenshot({ path: testInfo.outputPath("desktop-family-progress.png"), fullPage: true });

    await family.goto(`/o/aspire/team-fundraising/${campaignId}`);
    await expectStat(family, "Assigned teams raised", "$10.00");
    const liamRow = family.getByRole("row").filter({ hasText: "Liam Smith" });
    await expect(liamRow.getByRole("cell", { name: "$10.00", exact: true })).toBeVisible();
    await expect(liamRow.getByText("Low progress", { exact: true })).toBeVisible();
    await expect(family.getByRole("row").filter({ hasText: "Mateo Garcia" }).getByText("No sales", { exact: true })).toBeVisible();
    await family.screenshot({ path: testInfo.outputPath("desktop-team-progress.png"), fullPage: true });
  } finally {
    await familyContext.close();
  }

  const collected = await progress();
  expect(collected.totals).toEqual({ raised_cents: 1000, tickets_sold: 2, player_count: 3, team_count: 1 });
  expect(collected.teams[0]).toMatchObject({ raised_cents: 1000, tickets_sold: 2, player_count: 3 });
  expect(collected.recent_sales).toHaveLength(1);
  const originalSale = collected.recent_sales[0];
  if (!originalSale) throw new Error("The real UI sale must appear in campaign history");
  expect(originalSale).toMatchObject({ participant_id: liam.id, amount_cents: 1000, quantity: 2, payment_method: "cash", ticket_numbers: issuedNumbers, reversed: false });
  await page.reload();
  await expectStat(page, "Total raised", "$10.00");
  await expectStat(page, "Tickets sold", "2");
  const originalRow = page.getByTestId(`campaign-sale-${originalSale.id}`);
  await originalRow.getByRole("button", { name: "Reverse sale", exact: true }).click();
  const reversal = page.getByRole("dialog", { name: "Reverse sale", exact: true });
  await reversal.getByRole("textbox", { name: "Reason for reversal", exact: true }).fill("Buyer details corrected with director approval");
  await reversal.getByRole("button", { name: "Confirm reversal", exact: true }).click();
  await expect(reversal).not.toBeVisible();
  await expectStat(page, "Total raised", "$0.00");
  await expectStat(page, "Tickets sold", "0");
  await expect(originalRow.getByText("Reversed", { exact: true })).toBeVisible();
  expect((await progress()).totals.raised_cents).toBe(0);
  await originalRow.getByRole("link", { name: "View / print ticket", exact: true }).click();
  await expect(page.getByText("VOIDED — NOT ELIGIBLE FOR DRAWING", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(issuedNumbers[0]!, { exact: true })).toBeVisible();
  await page.goto(`/o/aspire/campaigns/${campaignId}`);
  const refreshedOriginalRow = page.getByTestId(`campaign-sale-${originalSale.id}`);

  await refreshedOriginalRow.getByRole("button", { name: "Record correction", exact: true }).click();
  const correction = page.getByRole("dialog", { name: "Record sale", exact: true });
  await correction.getByRole("textbox", { name: "Buyer name", exact: true }).fill("Corrected desktop cash buyer");
  await correction.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
  await correction.getByLabel("Payment method", { exact: true }).selectOption("cash");
  await correction.getByRole("button", { name: "Record sale", exact: true }).click();
  const correctionReceipt = page.getByRole("dialog", { name: "Tickets issued", exact: true });
  await expect(correctionReceipt.getByRole("listitem")).toHaveText(replacementNumbers);
  await correctionReceipt.getByRole("button", { name: "Done", exact: true }).click();
  await expectStat(page, "Total raised", "$10.00");
  await expectStat(page, "Tickets sold", "2");
  await page.screenshot({ path: testInfo.outputPath("desktop-admin-corrected-history.png"), fullPage: true });

  const finalProgress = await progress();
  expect(finalProgress.totals).toEqual(collected.totals);
  expect(finalProgress.recent_sales).toHaveLength(2);
  const replacementSale = finalProgress.recent_sales.find((record) => record.corrects_sale_id === originalSale.id);
  if (!replacementSale) throw new Error("The replacement must retain its original sale association");
  expect(finalProgress.recent_sales.find((record) => record.id === originalSale.id)?.replacement_sale_id).toBe(replacementSale.id);
  await expect(refreshedOriginalRow.getByRole("button", { name: "Record correction", exact: true })).toHaveCount(0);
  await expect(refreshedOriginalRow.getByText("Corrected", { exact: true })).toBeVisible();
  await expect(page.getByTestId(`campaign-sale-${replacementSale.id}`).getByText("Correction", { exact: true })).toBeVisible();
  const salesResult = await admin.from("campaign_sales").select("id,corrects_sale_id,buyer_name,amount_cents,quantity")
    .eq("campaign_id", campaignId);
  expect(salesResult.error).toBeNull();
  const sales = z.array(z.object({ id: z.uuid(), corrects_sale_id: z.uuid().nullable(), buyer_name: z.string(), amount_cents: z.number(), quantity: z.number() })).parse(salesResult.data);
  expect(sales).toHaveLength(2);
  expect(sales.find((record) => record.id === originalSale.id)).toMatchObject({ buyer_name: "Desktop cash buyer", corrects_sale_id: null, amount_cents: 1000, quantity: 2 });
  expect(sales.find((record) => record.corrects_sale_id === originalSale.id)).toMatchObject({ buyer_name: "Corrected desktop cash buyer", amount_cents: 1000, quantity: 2 });
  const finalStock = await admin.from("tickets").select("ticket_number,status")
    .eq("campaign_id", campaignId).eq("participant_id", liam.id).order("sequence_number");
  expect(finalStock.error).toBeNull();
  expect(stockSchema.parse(finalStock.data)).toEqual([
    ...issuedNumbers.map((ticket_number) => ({ ticket_number, status: "VOIDED" })),
    ...replacementNumbers.map((ticket_number) => ({ ticket_number, status: "ISSUED" })),
  ]);
  const money = await admin.from("money_events").select("event_type,amount_cents").eq("campaign_id", campaignId).order("chain_pos");
  expect(money.error).toBeNull();
  expect(money.data).toEqual([
    { event_type: "SALE_COLLECTED", amount_cents: 1000 },
    { event_type: "REVERSAL", amount_cents: -1000 },
    { event_type: "SALE_COLLECTED", amount_cents: 1000 },
  ]);
  const ledgers = await admin.rpc("verify_campaign_ledgers", { p_campaign_id: campaignId });
  expect(ledgers.error).toBeNull();
  const verified = z.array(z.object({ ledger: z.string(), ok: z.literal(true), rows_checked: z.number().int().positive() })).parse(ledgers.data);
  expect(verified.map((ledger) => ledger.ledger).sort()).toEqual(["campaign_events", "money_events", "ticket_events"]);
  const audit = await admin.rpc("verify_audit_chain", { p_organization_id: orgId });
  expect(audit.error).toBeNull();
  expect(z.array(z.object({ ok: z.literal(true), rows_checked: z.number().int().positive() })).parse(audit.data)).toHaveLength(1);
});