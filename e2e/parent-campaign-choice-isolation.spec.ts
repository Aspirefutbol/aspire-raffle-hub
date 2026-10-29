import { expect, test } from "@playwright/test";
import { campaignProgressSchema } from "@/lib/fundraising/types";
import { apiAs, signIn } from "./helpers";

test.use({ actionTimeout: 15_000 });

test("parent browser-tab selection stays scoped to its fundraiser and cannot select a participant from another fundraiser", async ({ page }) => {
  test.setTimeout(120_000);
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) {
    throw new Error("Campaign selection isolation testing requires local Supabase.");
  }

  const admin = await apiAs("admin@aspire.test");
  const org = await admin.from("organizations").select("id").eq("slug", "aspire").single();
  if (org.error) throw org.error;
  const orgId = org.data.id;
  const now = Date.now();
  const campaignIds: string[] = [];

  // Two *different* synthetic campaigns with the same family memberships.
  // Participant IDs differ even when the real player identities would be the same.
  for (const index of [1, 2]) {
    const campaign = await admin.from("campaigns").insert({
      organization_id: orgId,
      name: "Synthetic parent campaign-choice isolation " + index + " " + now,
      ticket_price_cents: 2000,
      ticket_packages: [{ quantity: 5, priceCents: 9000 }],
      ticket_prefix: "PC" + index + now.toString(36).slice(-5).toUpperCase(),
      default_allocation: 10,
      rules_text: "Synthetic offline acceptance; no checkout or drawing.",
      starts_at: new Date(now - 3600000).toISOString(),
      sales_close_at: new Date(now + 86400000).toISOString(),
      draw_at: new Date(now + 172800000).toISOString(),
    }).select("id").single();
    if (campaign.error) throw campaign.error;
    const id = campaign.data.id;
    campaignIds.push(id);
    expect((await admin.rpc("enroll_campaign_players", {
      p_organization_id: orgId, p_campaign_id: id, p_all_active: true,
    })).error).toBeNull();
    for (const status of ["READY", "ACTIVE"] as const) {
      expect((await admin.rpc("transition_campaign", {
        p_campaign_id: id, p_to: status, p_reason: "Synthetic campaign-choice isolation",
      })).error).toBeNull();
    }
  }

  const [firstId, secondId] = campaignIds;
  const firstKey = "aspire:parent-selected-player:/o/aspire/fundraising/" + firstId + "/requests";
  const secondKey = "aspire:parent-selected-player:/o/aspire/fundraising/" + secondId + "/requests";
  expect(firstKey).not.toBe(secondKey);
  await signIn(page, "coach@aspire.test");

  await page.goto("/o/aspire/fundraising/" + firstId);
  const firstChooser = page.getByRole("navigation", { name: "Choose player" });
  await expect(firstChooser).toBeVisible();
  await firstChooser.getByRole("button", { name: "Liam Smith", exact: true }).click();
  const other = firstChooser.getByRole("button").filter({ hasNotText: "Liam Smith" }).first();
  await expect(other).toBeVisible();
  const otherName = (await other.innerText()).trim();
  await other.click();
  await expect(other).toHaveAttribute("aria-pressed", "true");
  const storedFirst = await page.evaluate((key) => sessionStorage.getItem(key), firstKey);
  expect(storedFirst).toMatch(/^[0-9a-f-]{36}$/i);
  expect(storedFirst).not.toContain("/s/");

  // Opening fundraiser B cannot silently reuse A's participant ID.
  await page.goto("/o/aspire/fundraising/" + secondId);
  const secondChooser = page.getByRole("navigation", { name: "Choose player" });
  await expect(secondChooser).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), secondKey)).toBeNull();
  await expect(secondChooser.getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
  await secondChooser.getByRole("button", { name: "Liam Smith", exact: true }).click();
  const storedSecond = await page.evaluate((key) => sessionStorage.getItem(key), secondKey);
  expect(storedSecond).toMatch(/^[0-9a-f-]{36}$/i);
  expect(storedSecond).not.toBe(storedFirst);

  // Confirm both values are actual participant IDs from their respective
  // campaigns; this is stronger than checking only the visible player names.
  for (const [id, selectedId] of [[firstId, storedFirst], [secondId, storedSecond]] as const) {
    const projection = await admin.rpc("campaign_progress", {
      p_organization_id: orgId, p_campaign_id: id, p_view: "admin",
    });
    expect(projection.error).toBeNull();
    expect(campaignProgressSchema.parse(projection.data).participants.some(p => p.id === selectedId)).toBe(true);
  }
  const secondProjection = await admin.rpc("campaign_progress", {
    p_organization_id: orgId, p_campaign_id: secondId, p_view: "admin",
  });
  expect(secondProjection.error).toBeNull();
  expect(campaignProgressSchema.parse(secondProjection.data).participants.some(p => p.id === storedFirst)).toBe(false);

  // Returning to A restores A's remembered sibling, not B's selection.
  await page.goto("/o/aspire/fundraising/" + firstId);
  const rememberedChooser = page.getByRole("navigation", { name: "Choose player" });
  await expect(rememberedChooser.getByRole("button", { name: otherName, exact: true }))
    .toHaveAttribute("aria-pressed", "true");

  // Deliberately inject campaign A's *valid* participant UUID into campaign B's
  // storage key. B must fall back to an authorized B participant instead.
  await page.evaluate(({ key, id }) => sessionStorage.setItem(key, id), {
    key: secondKey, id: storedFirst!,
  });
  await page.goto("/o/aspire/fundraising/" + secondId);
  const untrustedChooser = page.getByRole("navigation", { name: "Choose player" });
  await expect(untrustedChooser).toBeVisible();
  await expect(untrustedChooser.getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("family-player-card").first()).toBeVisible();
  await expect(page.getByTestId("family-player-card").first()).not.toHaveAttribute("data-player-id", storedFirst!);

  // Browser navigation and untrusted storage alone must never write requests,
  // sales, or money. No seller links or real payments are used in this test.
  for (const id of campaignIds) {
    for (const table of ["campaign_sales", "money_events"] as const) {
      const result = await admin.from(table).select("id", { count: "exact", head: true }).eq("campaign_id", id);
      expect(result.error).toBeNull();
      expect(result.count).toBe(0);
    }
  }
});
