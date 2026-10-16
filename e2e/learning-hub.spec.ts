import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("Learning Hub is admin-only, searchable, and linked from operational screens", async ({ page, browser }) => {
  test.setTimeout(90_000);

  await signIn(page, "admin@aspire.test");
  await page.goto("/o/aspire/learn");
  await expect(page.getByRole("heading", { name: "Learning Hub", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create and prepare a raffle campaign", exact: true }).first()).toBeVisible();

  const search = page.getByRole("search");
  await search.getByPlaceholder("What do you need help with?").fill("check bounced");
  await search.getByRole("button", { name: "Search guides", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Handle uncleared and returned checks/ })).toBeVisible();

  await page.getByRole("link", { name: /Handle uncleared and returned checks/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Handle uncleared and returned checks", exact: true })).toBeVisible();
  await expect(page.getByText("A returned check does not automatically void the raffle ticket.", { exact: true })).toBeVisible();

  await page.goto("/o/aspire/campaigns");
  await expect(page.getByRole("link", { name: "Campaign guide", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Campaign guide", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Create and prepare a raffle campaign", exact: true })).toBeVisible();

  const familyContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  try {
    const family = await familyContext.newPage();
    await signIn(family, "coach@aspire.test");
    await family.goto("/o/aspire/fundraising");
    await expect(family.getByRole("link", { name: "Learning Hub", exact: true })).toHaveCount(0);
    await family.goto("/o/aspire/learn");
    await expect(family.getByRole("heading", { name: "We couldn’t find that page", exact: true })).toBeVisible();
    await expect(family.getByRole("heading", { name: "Learning Hub", exact: true })).toHaveCount(0);
  } finally {
    await familyContext.close();
  }
});
