import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const route = "/calendar/aspire-south?view=family";

test("family preview exposes simple sharing and a bilingual unsent confirmation", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  await page.goto("/calendar/aspire-south");
  await page.getByTestId("calendar-family-preview-link").click();
  await expect(page.getByRole("heading", { name: "My calendar", exact: true })).toBeVisible();
  await expect(page.getByTestId("calendar-family-demo-warning")).toContainText("fictional player only");
  await expect(page.getByRole("button", { name: "Share My Calendar", exact: true })).toBeVisible();
  await page.getByTestId("calendar-confirmation-preview").locator("summary").click();
  await expect(page.getByTestId("calendar-confirmation-text")).toContainText("$50.00");
  await expect(page.getByTestId("calendar-confirmation-text")).toContainText("not a receipt for a real payment");
  await page.getByRole("button", { name: "Español", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mi calendario", exact: true })).toBeVisible();
  await expect(page.getByTestId("calendar-confirmation-text")).toContainText("Días patrocinados: 10");
  await expect(page.getByTestId("calendar-confirmation-text")).toContainText("Impacto adicional: $40.00");
  expect(posts).toEqual([]);
});

test("clipboard failure gives a clearly marked manual demo invitation", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("blocked"); } } });
  });
  await page.goto(route);
  await page.getByRole("button", { name: "Copy Link", exact: true }).click();
  const manual = page.getByRole("textbox", { name: "Demo invitation — select and copy", exact: true });
  await expect(manual).toHaveValue(/\[DEMO\]/);
  await expect(manual).toHaveValue(/does not accept payments/);
  const text = await manual.inputValue();
  expect(text).not.toContain("view=family");
  expect(text).not.toContain("token=");
});

test("native sharing and QR contain only the sanitized public demonstration URL", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      (window as Window & { calendarShared?: ShareData }).calendarShared = data;
    } });
  });
  await page.goto(route + "&token=do-not-share#private");
  await page.getByRole("button", { name: "Share My Calendar", exact: true }).click();
  const shared = await page.evaluate(() => (window as Window & { calendarShared?: ShareData }).calendarShared);
  const expected = new URL("/calendar/aspire-south", page.url()).toString();
  expect(shared?.url).toBe(expected);
  expect(shared?.title).toContain("[DEMO]");
  await page.getByRole("button", { name: "Show QR Code", exact: true }).click();
  const image = page.getByRole("img", { name: "Calendar preview QR code", exact: true });
  await expect(image).toBeVisible();
  const src = await image.getAttribute("src");
  expect(src).toMatch(/^data:image\/png;base64,/);
  const png = PNG.sync.read(Buffer.from(src!.split(",")[1]!, "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded?.data).toBe(expected);
});

test("family tools fit phone and iPad widths in both languages", async ({ page }) => {
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    for (const language of ["en", "es"] as const) {
      if (language === "es") await page.getByRole("button", { name: "Español", exact: true }).click();
      const box = await page.getByRole("button", { name: language === "es" ? "Compartir mi calendario" : "Share My Calendar", exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});
