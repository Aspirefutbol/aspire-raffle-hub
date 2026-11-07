import { expect, test } from "@playwright/test";

test("Aspire South calendar donor preview is usable on 320-390px phone screens", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  await expect(page.getByRole("heading", { name: "Sponsor a Day" })).toBeVisible();

  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const day = page.getByTestId("calendar-day-10");
    const bounds = await day.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByTestId("calendar-day-10").click();
  await page.getByRole("button", { name: /3x · Impact/ }).click();
  await expect(page.getByText("Sponsorship total").locator("..")).toContainText("$30");

  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByTestId("calendar-day-10")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Total del patrocinio").locator("..")).toContainText("$30");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
