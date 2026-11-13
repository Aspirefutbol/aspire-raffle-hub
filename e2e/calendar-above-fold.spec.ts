import { mkdir } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * Issue #41 acceptance: calendar-first layout. Synthetic preview only.
 * Each viewport is the VISIBLE area (browser chrome excluded). Checks run without
 * scrolling (scrollY === 0). Screenshots are review evidence, not a pixel-diff gate,
 * and are saved where CI already uploads the synthetic preview artifact.
 * Physical iPhone/iPad acceptance is NOT claimed by these tests.
 */

type Viewport = { name: string; width: number; height: number; columns: number; allDaysVisible: boolean };
const VIEWPORTS: Viewport[] = [
  { name: "phone-320x454", width: 320, height: 454, columns: 5, allDaysVisible: false },
  { name: "phone-360x640", width: 360, height: 640, columns: 6, allDaysVisible: false },
  { name: "phone-390x664", width: 390, height: 664, columns: 7, allDaysVisible: true },
  { name: "phone-430x740", width: 430, height: 740, columns: 7, allDaysVisible: true },
  { name: "phone-landscape-667x320", width: 667, height: 320, columns: 7, allDaysVisible: false },
  { name: "phone-landscape-844x340", width: 844, height: 340, columns: 7, allDaysVisible: false },
  { name: "ipad-portrait-768x954", width: 768, height: 954, columns: 7, allDaysVisible: true },
  { name: "ipad-landscape-1024x695", width: 1024, height: 695, columns: 7, allDaysVisible: true },
];
const LANGUAGES = ["en", "es"] as const;
const SHOTS = "test-results/aspire-south-preview";

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "element must be rendered").not.toBeNull();
  return b!;
}
async function expectWithin(locator: Locator, top: number, bottom: number, label: string) {
  const b = await box(locator);
  expect(b.y, `${label}: top`).toBeGreaterThanOrEqual(top - 0.5);
  expect(b.y + b.height, `${label}: bottom`).toBeLessThanOrEqual(bottom + 0.5);
}
async function scrollY(page: Page) { return page.evaluate(() => window.scrollY); }
async function toSpanish(page: Page) { await page.getByRole("button", { name: "Español", exact: true }).click(); }

test.describe("donor view: calendar, progress and action without scrolling (F1–F6, F12)", () => {
  for (const vp of VIEWPORTS) {
    for (const lang of LANGUAGES) {
      test(`${vp.name} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/calendar/aspire-south");
        if (lang === "es") await toSpanish(page);
        await expect(page.getByRole("heading", { name: lang === "es" ? "Patrocina un Día" : "Sponsor a Day" })).toBeVisible();
        expect(await scrollY(page), "no scroll needed").toBe(0);

        const bar = page.getByTestId("calendar-action-bar");
        const barTop = (await box(bar)).y;
        expect(barTop + (await box(bar)).height, "F5: action bar inside the first screen").toBeLessThanOrEqual(vp.height + 0.5);

        // F1: the first full row of days is visible and not covered by the action bar.
        expect(await page.getByTestId("calendar-day-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(vp.columns);
        for (let day = 1; day <= vp.columns; day++) await expectWithin(page.getByTestId(`calendar-day-${day}`), 0, barTop, `F1 day ${day}`);
        if (vp.allDaysVisible) await expectWithin(page.getByTestId("calendar-day-31"), 0, barTop, "F1 all 31 days");

        // F2–F4: identity, progress, language and demo disclosure in the first screen.
        // In short landscape the footer is fixed: mere within-viewport bounds
        // would miss controls hidden *under* the footer. Require F3/F4 to end
        // above its top edge, not simply above the viewport bottom.
        await expectWithin(page.getByTestId("calendar-identity"), 0, vp.height, "F2 identity");
        await expectWithin(page.getByTestId("calendar-progress"), 0, vp.height, "F2 progress");
        await expectWithin(page.getByTestId("sponsored-day-progress"), 0, vp.height, "F2 days x/31");
        const unobscuredBottom = Math.min(vp.height, barTop);
        await expectWithin(page.getByRole("button", { name: lang === "es" ? "English" : "Español", exact: true }), 0, unobscuredBottom, "F3 language unobscured");
        await expectWithin(page.getByTestId("calendar-demo-badge"), 0, unobscuredBottom, "F4 demo badge unobscured");

        // F6: no sideways scroll; every day tile is at least 44×44.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        for (let day = 1; day <= 31; day++) {
          const b = await box(page.getByTestId(`calendar-day-${day}`));
          expect(b.width, `day ${day} width`).toBeGreaterThanOrEqual(44);
          expect(b.height, `day ${day} height`).toBeGreaterThanOrEqual(44);
        }

        await mkdir(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/above-fold-donor-${vp.name}-${lang}.png` });

        // F5: tapping a visible day keeps the action bar in view with count, total and multiplier.
        const selectedDay = page.getByTestId("calendar-day-3");
        await selectedDay.click();
        // Wait for the actual selected state, not a mid-transition screenshot.
        // Brand-700 background and white foreground must both reach their
        // final values: immediate screenshots made the tile appear washed out.
        await expect(selectedDay).toHaveAttribute("aria-pressed", "true");
        await expect(selectedDay).toHaveCSS("background-color", "rgb(29, 63, 216)");
        await expect(selectedDay).toHaveCSS("color", "rgb(255, 255, 255)");
        expect(await scrollY(page), "selecting a first-row day does not scroll").toBe(0);
        await expect(bar).toContainText("$3");
        await expect(bar).toContainText(lang === "es" ? "1 día" : "1 day");
        await expect(bar).toContainText(lang === "es" ? "1× Apoyo" : "1× Support");
        await expect(bar.getByRole("button", { name: lang === "es" ? "Continuar" : "Continue", exact: true })).toBeEnabled();
        expect(await bar.getAttribute("class")).toContain("env(safe-area-inset-bottom)");
        await page.screenshot({ path: `${SHOTS}/above-fold-donor-${vp.name}-${lang}-selected.png` });
      });
    }
  }
});

test("F4: the compact demo badge expands to the full synthetic disclosure in EN and ES", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/calendar/aspire-south");
  const badge = page.getByTestId("calendar-demo-badge");
  await badge.locator("summary").click();
  await expect(badge).toContainText("No live donor data or payment credentials are used on this preview route.");
  await toSpanish(page);
  await expect(badge).toContainText("no utiliza datos reales de donantes ni credenciales de pago");
});

test("F3/F10: language switch keeps days and multiplier; 5× of days 10 + 12 still totals $110", async ({ page }) => {
  // (Day 11 is a sponsored day in the synthetic fixture, so 10 + 12 is used: $22 base + $88 impact.)
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/calendar/aspire-south");
  await page.getByTestId("calendar-day-10").click();
  await page.getByTestId("calendar-day-12").click();
  await page.getByText("More ways to help").click();
  await page.getByRole("button", { name: /5x · Legacy/ }).click();
  await expect(page.getByText("Base calendar value", { exact: true }).locator("..")).toContainText("$22");
  await expect(page.getByText("Additional impact", { exact: true }).locator("..")).toContainText("$88");
  await expect(page.getByText("Sponsorship total").locator("..")).toContainText("$110");
  await expect(page.getByTestId("calendar-action-bar")).toContainText("2 days · $110");
  await toSpanish(page);
  await expect(page.getByTestId("calendar-day-10")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("calendar-day-12")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Total del patrocinio").locator("..")).toContainText("$110");
  await expect(page.getByTestId("calendar-action-bar")).toContainText("5× Legado");
});

test("F5: Continue in the action bar opens the existing supporter step", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/calendar/aspire-south");
  await page.getByTestId("calendar-day-4").click();
  await page.getByTestId("calendar-action-bar").getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your information" })).toBeVisible();
  await expect(page.getByTestId("synthetic-contact-warning")).toBeVisible();
});

test("F7: the action bar never covers a tapped day, even at the end of the calendar", async ({ page }) => {
  for (const [width, height] of [[320, 454], [360, 640], [844, 340]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/calendar/aspire-south");
    const day = page.getByTestId("calendar-day-31");
    await day.evaluate(el => el.scrollIntoView({ block: "center" }));
    const b = await box(day);
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-testid]")?.getAttribute("data-testid"), { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    expect(hit, `${width}×${height}: centre of day 31 is the tile itself`).toBe("calendar-day-31");
    await day.click();
    await expect(day).toHaveAttribute("aria-pressed", "true");
  }
});

test("F9: keyboard order is language → days → action bar, and reduced motion adds no transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/calendar/aspire-south");
  await page.getByTestId("calendar-day-1").click();
  await page.getByRole("button", { name: "Español", exact: true }).focus();
  const order: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "";
      if (el.closest("[data-testid='calendar-action-bar']")) return el.textContent?.includes("Continue") ? "continue" : "bar-summary";
      return el.getAttribute("data-testid") ?? el.tagName.toLowerCase();
    });
    order.push(id);
    if (id === "continue") break;
  }
  const firstDay = order.indexOf("calendar-day-1");
  const lastDay = order.indexOf("calendar-day-31");
  expect(firstDay, order.join(",")).toBeGreaterThanOrEqual(0);
  expect(lastDay).toBeGreaterThan(firstDay);
  expect(order.indexOf("continue")).toBeGreaterThan(lastDay);
  const transition = await page.getByTestId("calendar-action-bar").evaluate(el => getComputedStyle(el).transitionDuration);
  expect(transition.split(",").every(value => value.trim() === "0s")).toBe(true);
});

test.describe("family view: progress and sharing without scrolling (F8, F12)", () => {
  for (const vp of VIEWPORTS) {
    for (const lang of LANGUAGES) {
      test(`${vp.name} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`/calendar/aspire-south?view=family&lang=${lang}`);
        await expect(page.getByRole("heading", { name: lang === "es" ? "Mi calendario" : "My calendar", exact: true })).toBeVisible();
        expect(await scrollY(page)).toBe(0);
        const names = lang === "es"
          ? ["Compartir mi calendario", "Copiar enlace", "Mostrar código QR"]
          : ["Share My Calendar", "Copy Link", "Show QR Code"];
        for (const name of names) {
          const button = page.getByRole("button", { name, exact: true });
          await expectWithin(button, 0, vp.height, `F8 ${name}`);
          expect((await box(button)).height).toBeGreaterThanOrEqual(44);
        }
        await expectWithin(page.getByTestId("calendar-family-demo-warning"), 0, vp.height, "F8 demo badge");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await mkdir(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/above-fold-family-${vp.name}-${lang}.png` });
      });
    }
  }
});

test("F8: the QR code appears after one tap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/calendar/aspire-south?view=family");
  await page.getByRole("button", { name: "Show QR Code", exact: true }).click();
  await expect(page.getByRole("img", { name: "Calendar preview QR code", exact: true })).toBeVisible();
});

test("Issue #41: Spanish donor link opens in Spanish and family tab preserves locale", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/calendar/aspire-south?lang=es");
  await expect(page.getByRole("heading", { name: "Patrocina un Día" })).toBeVisible();
  await page.getByTestId("calendar-family-preview-link").click();
  await expect(page).toHaveURL(/view=family&lang=es/);
  await expect(page.getByRole("heading", { name: "Mi calendario" })).toBeVisible();
});

test("Issue #41: selected days use a checkmark as well as color", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  const day = page.getByTestId("calendar-day-3");
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(day.locator('[aria-hidden="true"]')).toContainText("✓");
});

test("Issue #41: completed calendar removes the misleading Continue action", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  await page.getByRole("button", { name: "Complete calendar" }).click();
  await expect(page.getByTestId("calendar-complete-alert")).toBeVisible();
  await expect(page.getByTestId("calendar-action-bar")).toContainText("Calendar Complete!");
  await expect(page.getByTestId("calendar-action-bar")).not.toContainText("Tap a day to start");
  await expect(page.getByTestId("calendar-action-bar").getByRole("button", { name: "Continue" })).toHaveCount(0);
});
