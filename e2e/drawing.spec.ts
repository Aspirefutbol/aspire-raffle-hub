import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import Papa from "papaparse";
import { z } from "zod";
import { campaignProgressSchema, recordedSaleSchema } from "@/lib/fundraising/types";
import { apiAs, signIn } from "./helpers";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const artifactSchema = z.object({
  schema_version: z.literal(1), manifest_canonical: z.string(), manifest_hash: hash,
  entries: z.array(z.object({ entry_payload_canonical: z.string(), entry_hash: hash })),
});
const manifestSchema = z.object({
  snapshot_id: z.uuid(), campaign_id: z.uuid(), organization_id: z.uuid(), version: z.number().int().positive(),
  frozen_at: z.string(), ticket_count: z.number().int().positive(), total_face_value_cents: z.number().int().positive(),
  supersedes_snapshot_id: z.uuid().nullable(), eligibility_policy: z.literal("ISSUED_UNREVERSED_V1"),
  source_ledger_heads: z.record(z.string(), z.object({ position: z.number().int().nonnegative(), hash })),
});
const entrySchema = z.object({
  ticket_id: z.uuid(), ticket_number: z.string(), sale_id: z.uuid(), buyer_name: z.string(),
  buyer_email: z.string().nullable(), buyer_phone: z.string().nullable(), player_name: z.string(),
});

function sha256(contents: string | Buffer) {
  return createHash("sha256").update(contents).digest("hex");
}

async function localTimestamp(page: Page, milliseconds: number) {
  return page.evaluate((value) => {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }, milliseconds);
}

async function downloadFile(page: Page, section: Locator, label: string, file: string, testInfo: TestInfo) {
  const downloading = page.waitForEvent("download");
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname.endsWith("/drawing/export"));
  await section.getByRole("button", { name: label, exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-disposition"]).toContain("attachment");
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  const path = testInfo.outputPath(file);
  await download.saveAs(path);
  await chmod(path, 0o600);
  return { path, contents: await readFile(path, "utf8"), url: download.url() };
}

async function freeze(page: Page, reason: string) {
  await page.getByRole("button", { name: "Freeze drawing entries", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Freeze drawing entries", exact: true });
  await dialog.getByRole("textbox", { name: "Reason", exact: true }).fill(reason);
  await dialog.getByRole("checkbox", { name: /approved prizes and drawing readiness/i }).check();
  await dialog.getByRole("button", { name: "Freeze drawing entries", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("director freezes private exports, reopens for an approved void, preserves versions, and certifies an external drawing", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  // This journey records synthetic sale/drawing facts. Never run its setup on
  // staging or a live raffle, and never manufacture roles or change seed links.
  for (const endpoint of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.E2E_BASE_URL ?? "http://localhost:3000"]) {
    if (!endpoint || !["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname)) {
      throw new Error("Drawing E2E fixtures require the local app and local Supabase.");
    }
  }
  const admin = await apiAs("admin@aspire.test");
  const family = await apiAs("coach@aspire.test");
  const organization = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  expect(organization.error).toBeNull();
  const orgId = z.object({ id: z.uuid() }).parse(organization.data).id;
  const team = await admin.from("teams").select("id").eq("organization_id", orgId).eq("name", "U13 Boys").single();
  expect(team.error).toBeNull();
  const teamId = z.object({ id: z.uuid() }).parse(team.data).id;
  const now = Date.now();
  const drawAt = now + 31_000;
  const draft = await admin.from("campaigns").insert({
    organization_id: orgId, name: `Synthetic drawing ${now.toString(36)}`,
    description: "Local browser acceptance fixture. No real raffle, prize, buyer or money.",
    ticket_price_cents: 500, ticket_prefix: `DR${now.toString(36).slice(-6).toUpperCase()}`,
    default_allocation: 4, rules_text: "Synthetic offline raffle acceptance fixture only.",
    support_email: "support@aspire.test", starts_at: new Date(now - 60_000).toISOString(),
    sales_close_at: new Date(now + 30_000).toISOString(), draw_at: new Date(drawAt).toISOString(),
  }).select("id").single();
  expect(draft.error).toBeNull();
  const campaignId = z.object({ id: z.uuid() }).parse(draft.data).id;
  expect((await admin.rpc("enroll_campaign_players", {
    p_organization_id: orgId, p_campaign_id: campaignId, p_team_ids: [teamId],
  })).error).toBeNull();
  expect((await admin.rpc("transition_campaign", { p_campaign_id: campaignId, p_to: "READY" })).error).toBeNull();
  expect((await admin.rpc("transition_campaign", {
    p_campaign_id: campaignId, p_to: "ACTIVE", p_reason: "Approve synthetic local drawing fixtures",
  })).error).toBeNull();
  expect((await admin.rpc("prepare_campaign_inventory", { p_organization_id: orgId, p_campaign_id: campaignId })).error).toBeNull();
  const progress = await admin.rpc("campaign_progress", { p_organization_id: orgId, p_campaign_id: campaignId, p_view: "admin" });
  expect(progress.error).toBeNull();
  const liam = campaignProgressSchema.parse(progress.data).participants.find((participant) => participant.player_name === "Liam Smith");
  if (!liam) throw new Error("The drawing fixture must enroll Liam in U13 Boys.");

  const voidableResult = await family.rpc("record_campaign_sale", {
    p_organization_id: orgId, p_campaign_id: campaignId, p_participant_id: liam.id, p_idempotency_key: randomUUID(),
    p_buyer_name: "=SUM(1,2)", p_buyer_email: "synthetic-void@example.test", p_buyer_phone: "+15555550101",
    p_quantity: 2, p_amount_cents: 1000, p_payment_method: "cash", p_notes: "PRIVATE DRAWING INTERNAL NOTE",
  });
  expect(voidableResult.error).toBeNull();
  const voidable = recordedSaleSchema.parse(voidableResult.data);
  const winnerResult = await family.rpc("record_campaign_sale", {
    p_organization_id: orgId, p_campaign_id: campaignId, p_participant_id: liam.id, p_idempotency_key: randomUUID(),
    p_buyer_name: 'Zoë, "Synthetic winner"', p_buyer_email: "synthetic-winner@example.test",
    p_quantity: 1, p_amount_cents: 500, p_payment_method: "check",
  });
  expect(winnerResult.error).toBeNull();
  const winner = recordedSaleSchema.parse(winnerResult.data);
  const winningNumber = winner.ticket_numbers[0]!;
  const campaignRoute = `/o/aspire/campaigns/${campaignId}`;
  const drawingRoute = `${campaignRoute}/drawing`;

  await signIn(page, "admin@aspire.test");
  await expect(page).toHaveURL(/\/o\/aspire\/dashboard$/);
  await page.goto(campaignRoute);
  await page.getByRole("button", { name: "Close sales", exact: true }).click();
  const closing = page.getByRole("dialog", { name: "Close sales", exact: true });
  await closing.getByRole("textbox", { name: "Reason", exact: true }).fill("Close synthetic drawing sales before the operator rehearsal");
  await closing.getByRole("button", { name: "Close sales", exact: true }).click();
  await expect(closing).not.toBeVisible();
  await page.goto(drawingRoute);
  await expect(page.getByRole("heading", { level: 1, name: "Drawing", exact: true })).toBeVisible();
  await freeze(page, "Approved prizes and physical drawing arrangements verified for synthetic rehearsal");
  const firstSection = page.locator('[data-testid="drawing-snapshot"][data-version="1"]');
  await expect(firstSection).toBeVisible();
  const retainedHash = hash.parse((await firstSection.getByTestId("drawing-manifest-hash").textContent())?.trim());
  const firstCsv = await downloadFile(page, firstSection, "Download CSV", "snapshot-1.csv", testInfo);
  const firstJson = await downloadFile(page, firstSection, "Download JSON manifest", "snapshot-1.json", testInfo);
  const firstArtifact = artifactSchema.parse(JSON.parse(firstJson.contents));
  const firstManifest = manifestSchema.parse(JSON.parse(firstArtifact.manifest_canonical));
  expect(firstArtifact.manifest_hash).toBe(retainedHash);
  expect(sha256(firstArtifact.manifest_canonical)).toBe(retainedHash);
  expect(firstManifest).toMatchObject({ campaign_id: campaignId, organization_id: orgId, version: 1,
    ticket_count: 3, total_face_value_cents: 1500, supersedes_snapshot_id: null });
  expect(Object.keys(firstManifest.source_ledger_heads).sort()).toEqual(["audit_events", "campaign_events", "money_events", "ticket_events"]);
  expect(execFileSync(process.execPath, ["scripts/verify-drawing-export.mjs", firstJson.path, retainedHash], { encoding: "utf8" }))
    .toContain("Verified 3 frozen entries");
  const entries = firstArtifact.entries.map((entry) => entrySchema.parse(JSON.parse(entry.entry_payload_canonical)));
  expect(entries.map((entry) => entry.ticket_number).sort()).toEqual([...voidable.ticket_numbers, winningNumber].sort());
  const csv = Papa.parse<Record<string, string>>(firstCsv.contents, { header: true, skipEmptyLines: true });
  expect(csv.errors).toEqual([]);
  expect(csv.data).toHaveLength(3);
  expect(csv.data.map((row) => row["Ticket number"]).sort()).toEqual(entries.map((entry) => entry.ticket_number).sort());
  expect(csv.data.every((row) => row["Manifest SHA-256"] === retainedHash && row["Eligible ticket count"] === "3")).toBe(true);
  expect(csv.data.filter((row) => voidable.ticket_numbers.includes(row["Ticket number"]!)).every((row) => row["Buyer name"] === "'=SUM(1,2)" && row["Buyer phone"] === "'+15555550101")).toBe(true);
  expect(firstCsv.contents).not.toContain("PRIVATE DRAWING INTERNAL NOTE");
  expect(firstJson.contents).not.toContain("PRIVATE DRAWING INTERNAL NOTE");
  const exportEvents = await admin.from("drawing_events").select("metadata").eq("snapshot_id", firstManifest.snapshot_id).eq("event_type", "EXPORTED");
  expect(exportEvents.error).toBeNull();
  const exportMetadata = z.array(z.object({ metadata: z.object({ format: z.string(), export_sha256: hash, manifest_hash: hash, delivery_confirmed: z.literal(false) }) })).parse(exportEvents.data);
  expect(exportMetadata.map(({ metadata }) => `${metadata.format}:${metadata.export_sha256}`).sort())
    .toEqual([`csv:${sha256(firstCsv.contents)}`, `json:${sha256(firstJson.contents)}`].sort());
  await page.screenshot({ path: testInfo.outputPath("desktop-drawing-frozen-private-exports.png"), fullPage: true });

  const familyContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  try {
    const scoped = await familyContext.newPage();
    await signIn(scoped, "coach@aspire.test");
    await expect(scoped).toHaveURL(/\/o\/aspire\/fundraising$/);
    await scoped.goto(`/o/aspire/fundraising/${campaignId}`);
    await expect(scoped.getByTestId("family-player-card")).toHaveCount(1);
    await expect(scoped.getByRole("heading", { name: "Liam Smith", exact: true })).toBeVisible();
    await expect(scoped.locator("main")).not.toContainText("Mateo Garcia");
    await expect(scoped.locator("main")).not.toContainText("Isaac Martinez");
    await scoped.goto(`/o/aspire/team-fundraising/${campaignId}`);
    for (const name of ["Liam Smith", "Mateo Garcia", "Isaac Martinez"]) {
      await expect(scoped.getByRole("row").filter({ hasText: name })).toBeVisible();
    }
    await expect(scoped.getByRole("button", { name: "Record sale", exact: true })).toHaveCount(0);
    await expect(scoped.getByRole("button", { name: "Download CSV", exact: true })).toHaveCount(0);
    await scoped.goto(drawingRoute);
    await expect(scoped.getByRole("heading", { name: "We couldn’t find that page", exact: true })).toBeVisible();
    await expect(scoped.getByRole("button", { name: "Freeze drawing entries", exact: true })).toHaveCount(0);
    for (const format of ["csv", "json"]) {
      const response = await scoped.request.post(`${drawingRoute}/export`, {
        form: { snapshot_id: firstManifest.snapshot_id, format, idempotency_key: randomUUID() },
        headers: { Origin: new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin },
      });
      expect([401, 403, 404]).toContain(response.status());
      expect(response.headers()["content-disposition"]).toBeUndefined();
      expect(await response.text()).not.toContain("synthetic-winner@example.test");
    }
    await scoped.getByRole("link", { name: "Go to your home", exact: true }).click();
    await expect(scoped).toHaveURL(/\/o\/aspire\/fundraising$/);
  } finally {
    await familyContext.close();
  }

  await firstSection.getByRole("button", { name: "Reopen drawing", exact: true }).click();
  const reopening = page.getByRole("dialog", { name: "Reopen drawing", exact: true });
  await reopening.getByRole("textbox", { name: "Reason", exact: true }).fill("Director approved a synthetic pre-drawing sale void; retain the original snapshot");
  await reopening.getByRole("button", { name: "Reopen drawing", exact: true }).click();
  await expect(reopening).not.toBeVisible();
  await page.goto(campaignRoute);
  const saleRow = page.getByTestId(`campaign-sale-${voidable.sale_id}`);
  await saleRow.getByRole("button", { name: "Reverse sale", exact: true }).click();
  const reversal = page.getByRole("dialog", { name: "Reverse sale", exact: true });
  await reversal.getByRole("textbox", { name: "Reason for reversal", exact: true }).fill("Approved synthetic buyer correction before drawing; void the original two tickets");
  await reversal.getByRole("button", { name: "Confirm reversal", exact: true }).click();
  await expect(reversal).not.toBeVisible();
  await expect(saleRow.getByText("Reversed", { exact: true })).toBeVisible();
  await page.goto(drawingRoute);
  await freeze(page, "Refreeze verified eligibility after the director-approved synthetic sale reversal");
  const secondSection = page.locator('[data-testid="drawing-snapshot"][data-version="2"]');
  await expect(secondSection).toBeVisible();
  const secondHash = hash.parse((await secondSection.getByTestId("drawing-manifest-hash").textContent())?.trim());
  const secondJson = await downloadFile(page, secondSection, "Download JSON manifest", "snapshot-2.json", testInfo);
  const secondArtifact = artifactSchema.parse(JSON.parse(secondJson.contents));
  const secondManifest = manifestSchema.parse(JSON.parse(secondArtifact.manifest_canonical));
  expect(secondManifest).toMatchObject({ version: 2, ticket_count: 1, total_face_value_cents: 500,
    supersedes_snapshot_id: firstManifest.snapshot_id });
  expect(secondArtifact.entries.map((entry) => entrySchema.parse(JSON.parse(entry.entry_payload_canonical)).ticket_number)).toEqual([winningNumber]);
  expect(execFileSync(process.execPath, ["scripts/verify-drawing-export.mjs", secondJson.path, secondHash], { encoding: "utf8" }))
    .toContain("Verified 1 frozen entries");
  const historicalJson = await downloadFile(page, firstSection, "Download JSON manifest", "snapshot-1-after-reopen.json", testInfo);
  const historicalCsv = await downloadFile(page, firstSection, "Download CSV", "snapshot-1-after-reopen.csv", testInfo);
  expect(historicalJson.contents).toBe(firstJson.contents);
  expect(historicalCsv.contents).toBe(firstCsv.contents);

  // Wait for the real disclosed time; no clock mocking or retroactive campaign
  // date edits. Seconds precision keeps the entered result after both freezes.
  await expect.poll(() => Date.now(), { timeout: 60_000 }).toBeGreaterThan(Math.max(drawAt, Date.parse(secondManifest.frozen_at)) + 2000);
  await secondSection.getByRole("button", { name: "Record external result", exact: true }).click();
  const result = page.getByRole("dialog", { name: "Record external result", exact: true });
  await result.getByLabel(/^Drawing timestamp/).fill(await localTimestamp(page, Date.now() - 1000));
  await result.getByRole("textbox", { name: "Location", exact: true }).fill("Synthetic local operator rehearsal room");
  await result.getByRole("textbox", { name: "Operator", exact: true }).fill("Synthetic Drawing Operator");
  await result.getByRole("textbox", { name: "Witnesses", exact: true }).fill("Synthetic Witness One\nSynthetic Witness Two");
  await result.getByRole("combobox", { name: "Drawing method", exact: true }).selectOption("physical");
  await result.getByRole("textbox", { name: "Winning ticket number", exact: true }).fill(winningNumber);
  await result.getByRole("textbox", { name: "Result / evidence", exact: true }).fill("Synthetic physical drawing selected the explicitly entered winning ticket. No platform-generated winner.");
  await result.getByRole("textbox", { name: "Evidence reference", exact: true }).fill("https://example.test/synthetic-drawing-rehearsal");
  await result.getByRole("textbox", { name: "Reason", exact: true }).fill("Record synthetic physical result after the disclosed drawing time");
  // Discard a real committed Server Action response, then close/resume/retry.
  // A new request key here could append a second WINNER/result, so the client
  // must retain the exact original payload even when the modal is closed.
  let discardedResultResponse = false;
  await page.route(`**${drawingRoute}`, async (route) => {
    if (!discardedResultResponse && route.request().method() === "POST"
      && route.request().headers()["next-action"]) {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      discardedResultResponse = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await result.getByRole("button", { name: "Record external result", exact: true }).click();
  await expect.poll(() => discardedResultResponse).toBe(true);
  await expect(result.getByRole("button", { name: "Retry same external result", exact: true })).toBeVisible();
  await expect(result.getByRole("textbox", { name: "Winning ticket number", exact: true })).toBeDisabled();
  await expect(result.getByRole("button", { name: "Edit details", exact: true })).toHaveCount(0);
  await result.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(result).not.toBeVisible();
  await secondSection.getByRole("button", { name: "Resume external result", exact: true }).click();
  await result.getByRole("button", { name: "Retry same external result", exact: true }).click();
  await expect(result).not.toBeVisible();
  await page.unroute(`**${drawingRoute}`);
  await expect(secondSection.getByText(winningNumber, { exact: true })).toBeVisible();
  await expect(secondSection.getByRole("button", { name: "Reopen drawing", exact: true })).toHaveCount(0);
  const blockedReopen = await admin.rpc("reopen_drawing", {
    p_organization_id: orgId, p_snapshot_id: secondManifest.snapshot_id, p_idempotency_key: randomUUID(),
    p_reason: "An external result must block this synthetic reopen attempt",
  });
  expect(blockedReopen.error?.code).toBe("23514");
  await secondSection.getByRole("button", { name: "Certify drawing", exact: true }).click();
  const certification = page.getByRole("dialog", { name: "Certify drawing", exact: true });
  await certification.getByRole("textbox", { name: "Reason", exact: true }).fill("Director verified the retained manifest, physical drawing evidence and winning ticket number");
  await certification.getByRole("button", { name: "Certify drawing", exact: true }).click();
  await expect(certification).not.toBeVisible();
  await page.getByRole("button", { name: "Mark drawn", exact: true }).click();
  const drawn = page.getByRole("dialog", { name: "Mark drawn", exact: true });
  await drawn.getByRole("textbox", { name: "Reason", exact: true }).fill("Complete synthetic drawing after independent export verification and director certification");
  await drawn.getByRole("button", { name: "Mark drawn", exact: true }).click();
  await expect(drawn).not.toBeVisible();
  const finalCampaign = await admin.from("campaigns").select("status").eq("id", campaignId).single();
  expect(finalCampaign.error).toBeNull();
  expect(finalCampaign.data?.status).toBe("DRAWN");
  const finalResults = await admin.from("drawing_results").select("ticket_number,method,drawn_at,evidence_ref,witnesses")
    .eq("snapshot_id", secondManifest.snapshot_id);
  expect(finalResults.error).toBeNull();
  const resultRows = z.array(z.object({ ticket_number: z.string(), method: z.literal("physical"), drawn_at: z.string(),
    evidence_ref: z.string(), witnesses: z.array(z.string()) })).parse(finalResults.data);
  expect(resultRows).toHaveLength(1);
  expect(resultRows[0]).toMatchObject({ ticket_number: winningNumber, evidence_ref: "https://example.test/synthetic-drawing-rehearsal",
    witnesses: ["Synthetic Witness One", "Synthetic Witness Two"] });
  expect(Date.parse(resultRows[0]!.drawn_at)).toBeGreaterThanOrEqual(drawAt);
  expect(Date.parse(resultRows[0]!.drawn_at)).toBeGreaterThanOrEqual(Date.parse(secondManifest.frozen_at));
  const ledgers = await admin.rpc("verify_campaign_ledgers", { p_campaign_id: campaignId });
  expect(ledgers.error).toBeNull();
  expect(z.array(z.object({ ok: z.literal(true) })).parse(ledgers.data)).toHaveLength(3);
  const audit = await admin.rpc("verify_audit_chain", { p_organization_id: orgId });
  expect(audit.error).toBeNull();
  expect(z.array(z.object({ ok: z.literal(true) })).parse(audit.data)).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath("desktop-drawing-certified-complete.png"), fullPage: true });
});
