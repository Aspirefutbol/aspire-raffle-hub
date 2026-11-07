import { expect, test } from "@playwright/test";

test("Aspire South synthetic donor preview keeps 1x-5x quote and EN/ES state", async ({ page }) => {
  await page.goto("/calendar/aspire-south");
  await expect(page.getByRole("heading", { name: "Sponsor a Day" })).toBeVisible();
  await expect(page.getByTestId("calendar-day-10")).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("calendar-day-10").click();
  await expect(page.getByTestId("calendar-day-10")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Base calendar value", { exact: true }).locator("..")).toContainText("$10");
  await expect(page.getByText("Additional impact", { exact: true }).locator("..")).toContainText("$0");
  // Existing verified-paid progress and the in-flight supporter quote are separate.
  await expect(page.getByTestId("paid-impact-breakdown")).toContainText("Base calendar value: $94");
  await expect(page.getByTestId("paid-impact-breakdown")).toContainText("Additional impact: $118");
  await expect(page.getByTestId("sponsored-day-progress")).toContainText("7 / 31 days sponsored");

  await page.getByText("More ways to help").click();
  await page.getByRole("button", { name: /5x · Legacy/ }).click();
  await expect(page.getByText("Additional impact", { exact: true }).locator("..")).toContainText("$40");
  await expect(page.getByText("Sponsorship total").locator("..")).toContainText("$50");
  await expect(page.getByTestId("paid-impact-breakdown")).toContainText("Base calendar value: $94");
  await expect(page.getByTestId("paid-impact-breakdown")).toContainText("Additional impact: $118");

  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Patrocina un Día" })).toBeVisible();
  await expect(page.getByTestId("calendar-day-10")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Impacto adicional", { exact: true }).locator("..")).toContainText("$40");
  await expect(page.getByText("Total del patrocinio").locator("..")).toContainText("$50");
  await expect(page.getByTestId("paid-impact-breakdown")).toContainText("Valor base del calendario: $94");
  await expect(page.getByTestId("paid-impact-breakdown")).toContainText("Impacto adicional: $118");

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Tu nombre").fill("Donante de prueba");
  await page.getByLabel("Correo electrónico").fill("supporter@example.test");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Revisar patrocinio" })).toBeVisible();
  await expect(page.getByText("Total del patrocinio").locator("..")).toContainText("$50");
  await expect(page.getByText("No reserva días ni cobra ningún pago.")).toBeVisible();

  await page.getByRole("button", { name: "Ver ejemplo del paso al pago seguro" }).click();
  await expect(page.getByText("No se reservaron días ni se cobró ningún pago.", { exact: false })).toBeVisible();
  await expect(page.getByText("Donante de prueba")).toHaveCount(0);
});

test("the preview never marks a sponsorship paid or performs checkout", async ({ page }) => {
  const checkoutCalls: string[] = [];
  page.on("request", request => {
    if (/stripe|checkout|calendar.*reserve/i.test(request.url())) checkoutCalls.push(request.url());
  });
  await page.goto("/calendar/aspire-south");
  await page.getByTestId("calendar-day-31").click();
  await expect(page.getByText("Sponsorship total").locator("..")).toContainText("$31");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Synthetic Supporter");
  await page.getByLabel("Email").fill("synthetic@example.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Preview secure checkout handoff" }).click();
  await expect(page.getByText("No reservation was placed and no payment was collected.", { exact: false })).toBeVisible();
  expect(checkoutCalls).toEqual([]);
});
