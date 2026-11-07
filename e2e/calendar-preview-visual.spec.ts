import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

/**
 * Review-only visual evidence. The route uses fictional data, never calls
 * reservation/Stripe APIs, and screenshots contain no real participant PII.
 * These artifacts help the director inspect EN/ES and mobile work even when
 * Netlify cannot publish an isolated PR preview.
 */
test("capture Aspire South donor journey for director review (synthetic only)", async ({ page }) => {
  const folder = "test-results/aspire-south-preview";
  await mkdir(folder, { recursive: true });

  await page.goto("/calendar/aspire-south");
  await expect(page.getByRole("heading", { name: "Sponsor a Day" })).toBeVisible();
  await page.screenshot({ path: `${folder}/01-desktop-en-calendar.png`, fullPage: true });

  await page.getByTestId("scenario-complete").click();
  await expect(page.getByTestId("calendar-complete")).toBeVisible();
  await page.screenshot({ path: `${folder}/01b-desktop-en-sponsored-complete.png`, fullPage: true });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByTestId("calendar-complete")).toContainText("¡Calendario completo!");
  await page.screenshot({ path: `${folder}/01c-phone-es-sponsored-complete.png`, fullPage: true });
  await page.getByTestId("scenario-partial").click();
  await page.getByRole("button", { name: "English" }).click();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByTestId("calendar-day-10").click();
  await page.getByText("More ways to help").click();
  await page.getByRole("button", { name: /5x · Legacy/ }).click();
  await expect(page.getByText("Sponsorship total").locator("..")).toContainText("$50");
  await page.screenshot({ path: `${folder}/02-desktop-en-5x.png`, fullPage: true });

  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Patrocina un Día" })).toBeVisible();
  await expect(page.getByText("Total del patrocinio").locator("..")).toContainText("$50");
  await page.screenshot({ path: `${folder}/03-phone-es-5x.png`, fullPage: true });

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Tu nombre").fill("Patrocinador ficticio");
  await page.getByLabel("Correo electrónico").fill("fictional@example.test");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Revisar patrocinio" })).toBeVisible();
  await expect(page.getByText("No reserva días ni cobra ningún pago.")).toBeVisible();
  await page.screenshot({ path: `${folder}/04-phone-es-review.png`, fullPage: true });
});
