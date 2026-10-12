import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Touch targets: on a coarse-pointer phone every interactive control is ≥44px tall.
const PAGES = ["/o/aspire/dashboard", "/o/aspire/people/players", "/o/aspire/people/households", "/o/aspire/teams", "/o/aspire/settings/members"];

for (const path of PAGES) {
  test(`touch targets ≥44px at 360px: ${path}`, async ({ page }) => {
    await signIn(page, "admin@aspire.test");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("main button, main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main select, header button, nav a, nav button")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(r.height)}px`);
      }
      return out;
    });
    expect(small, small.join("\n")).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
