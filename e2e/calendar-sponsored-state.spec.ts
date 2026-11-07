import { expect, test } from "@playwright/test";

test("synthetic preview is excluded from search indexing and browser caching", async ({ page }) => {
  const response = await page.goto("/calendar/aspire-south");
  expect(response?.status()).toBe(200);
  const headers = response!.headers();
  expect(headers["x-robots-tag"]).toContain("noindex");
  expect(headers["x-robots-tag"]).toContain("nofollow");
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("synthetic sponsored tiles celebrate verified-fixture payments, preserve prices, and redact donors", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  await expect(page.getByTestId("sponsored-day-progress")).toContainText("7 / 31 days sponsored");
  await expect(page.getByTestId("calendar-milestone")).toBeVisible();

  const paid = page.getByTestId("calendar-day-2");
  await expect(paid).toBeDisabled();
  await expect(paid).toHaveAttribute("aria-label", /Day 2, \$2, Sponsored, 4×/);
  await expect(paid).toHaveClass(/bg-emerald-50/);
  await expect(paid).toContainText("$2");
  await expect(page.getByTestId("day-impact-2")).toHaveText("4× · Champion");
  await expect(page.getByTestId("day-impact-28")).toHaveText("5× · Legacy");
  await expect(page.getByTestId("calendar-day-5")).toBeDisabled();
  await expect(page.getByTestId("day-impact-5")).toHaveCount(0);

  // The UI never surfaces supporter PII, checkout identifiers or bank data.
  await expect(page.locator("body")).not.toContainText(/supporter@example|cs_test_|sk_test_|customer_email/i);
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByTestId("calendar-day-2")).toHaveAttribute("aria-label", /Día 2, \$2, Patrocinado, 4×/);
  await expect(page.getByTestId("day-impact-2")).toHaveText("4× · Campeón");
  await expect(page.getByTestId("day-impact-28")).toHaveText("5× · Legado");
  await expect(page.getByTestId("sponsored-day-progress")).toContainText("7 / 31 días patrocinados");
});

test("full synthetic calendar has a celebratory bilingual completion state and no selectable days", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  await page.getByTestId("scenario-complete").click();
  await expect(page.getByTestId("sponsored-day-progress")).toContainText("31 / 31 days sponsored");
  await expect(page.getByTestId("calendar-complete")).toContainText("Calendar Complete!");
  await expect(page.getByRole("progressbar", { name: "days sponsored" })).toHaveAttribute("aria-valuenow", "31");
  await expect(page.getByText("Raised").locator("..")).toContainText("$614");
  await expect(page.getByTestId("calendar-day-31")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByTestId("calendar-complete")).toContainText("¡Calendario completo!");
  await expect(page.getByTestId("sponsored-day-progress")).toContainText("31 / 31 días patrocinados");
  await expect(page.getByTestId("calendar-day-2")).toContainText("$2");
  await expect(page.getByTestId("day-impact-28")).toHaveText("5× · Legado");

  // Director-only fixture switch changes a visual sample, not a paid record.
  await page.getByTestId("scenario-partial").click();
  await expect(page.getByTestId("calendar-complete")).toHaveCount(0);
  await expect(page.getByTestId("sponsored-day-progress")).toContainText("7 / 31 días patrocinados");
  await expect(page.getByTestId("calendar-day-31")).toBeEnabled();
});

test("a preview checkout is not a payment and cannot convert selected days to sponsored", async ({ page }) => {
  const sensitiveRequests: string[] = [];
  page.on("request", req => {
    if (/stripe|checkout|calendar.*reserve/i.test(req.url())) sensitiveRequests.push(req.url());
  });
  await page.goto("/calendar/aspire-south");
  await page.getByTestId("calendar-day-31").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Fictional Supporter");
  await page.getByLabel("Email").fill("fictional@example.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Preview secure checkout handoff" }).click();
  await expect(page.getByText("No reservation was placed and no payment was collected.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("sponsored-day-progress")).toContainText("7 / 31 days sponsored");
  await expect(page.getByTestId("day-impact-31")).toHaveCount(0);
  expect(sensitiveRequests).toEqual([]);
  await page.getByTestId("scenario-complete").click();
  await expect(page.getByRole("heading", { name: "Sponsor a Day" })).toBeVisible();
  await expect(page.getByText("Fictional Supporter")).toHaveCount(0);
  await expect(page.getByText("fictional@example.test")).toHaveCount(0);
});

test("sponsored and completed layouts remain usable on small phones and iPads", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  for (const width of [320, 360, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const paid = await page.getByTestId("calendar-day-2").boundingBox();
    expect(paid).not.toBeNull();
    expect(paid!.width).toBeGreaterThanOrEqual(44);
    expect(paid!.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId("scenario-complete").click();
    await expect(page.getByTestId("calendar-complete")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId("scenario-partial").click();
  }
});

test("milestone director scenarios show paid-only progress at 8, 16 and 24 days in EN/ES", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  const examples = [
    { scenario: "first", days: 8, english: "First milestone reached", spanish: "Primera meta alcanzada" },
    { scenario: "half", days: 16, english: "Halfway there", spanish: "Llegamos a la mitad" },
    { scenario: "final", days: 24, english: "Final stretch", spanish: "Última etapa" },
  ] as const;

  for (const example of examples) {
    await page.getByTestId(`scenario-${example.scenario}`).click();
    await expect(page.getByTestId("sponsored-day-progress")).toContainText(`${example.days} / 31 days sponsored`);
    await expect(page.getByRole("progressbar", { name: "days sponsored" })).toHaveAttribute("aria-valuenow", String(example.days));
    await expect(page.getByTestId("calendar-milestone")).toContainText(example.english);
    await expect(page.getByTestId("calendar-milestone")).toHaveAttribute("role", "status");
    await expect(page.getByTestId("calendar-milestone")).toHaveAttribute("aria-live", "polite");
    await expect(page.getByTestId("calendar-milestone")).toHaveClass(/bg-emerald-50/);
    await expect(page.getByTestId("calendar-complete")).toHaveCount(0);
    await expect(page.getByTestId("calendar-day-2")).toBeDisabled();
    await expect(page.getByTestId("day-impact-28")).toHaveText("5× · Legacy");
    await page.getByRole("button", { name: "Español" }).click();
    await expect(page.getByTestId("sponsored-day-progress")).toContainText(`${example.days} / 31 días patrocinados`);
    await expect(page.getByTestId("calendar-milestone")).toContainText(example.spanish);
    await page.getByRole("button", { name: "English" }).click();
  }

  await page.getByTestId("scenario-partial").click();
  await page.getByTestId("calendar-day-31").click();
  await expect(page.getByTestId("calendar-day-31")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("scenario-first").click();
  await expect(page.getByTestId("calendar-day-31")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await expect(page.locator("body")).not.toContainText(/supporter@example|cs_test_|sk_test_/i);
});

test("director milestone switcher stays within 320px phone and iPad viewports", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 780 });
    for (const scenario of ["first", "half", "final", "complete"] as const) {
      await page.getByTestId(`scenario-${scenario}`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});
