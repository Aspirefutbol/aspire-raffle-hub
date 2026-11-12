import { expect, test, type Page } from "@playwright/test";
import { MAILPIT_URL } from "./helpers";

// N1/N1-B acceptance: only local disposable Auth/Mailpit, never hosted.
const email = "admin@aspire.test";
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const intendedPath = "/o/aspire/settings/members";

function guardLocal() {
  for (const target of [
    baseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    MAILPIT_URL,
  ]) {
    if (!target || !["localhost", "127.0.0.1"].includes(new URL(target).hostname)) {
      throw new Error("Auth acceptance requires loopback-only app, Supabase and Mailpit.");
    }
  }
}

async function messageIds(): Promise<string[]> {
  const response = await fetch(
    MAILPIT_URL + "/api/v1/search?query=" + encodeURIComponent("to:" + email),
  );
  expect(response.ok).toBe(true);
  const body = (await response.json()) as { messages?: Array<{ ID?: string }> };
  return (body.messages ?? []).flatMap((message) => message.ID ? [message.ID] : []);
}

async function redirectWithoutFollowing(page: Page, path: string) {
  const response = await page.request.get(path, { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(response.status());
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  const locationHeader = response.headers()["location"];
  expect(locationHeader).toBeTruthy();
  const location = new URL(locationHeader ?? "/", baseUrl);
  expect(location.origin).toBe(new URL(baseUrl).origin);
  return { location, response };
}

// Disable browser recordings for this token-bearing acceptance file only. Playwright
// fixture overrides must be top-level, before describe groups, to avoid a new-worker error.
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("N1/N1-B canonical auth route acceptance (local synthetic)", () => {

  test("absent and unsupported token paths reject email-borne next and clear a scoped hint", async ({ page }) => {
    guardLocal();
    await page.context().addCookies([{
      name: "rh_auth_next",
      value: intendedPath,
      domain: "localhost",
      path: "/auth/confirm",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    for (const path of [
      "/auth/confirm?type=magiclink&next=https%3A%2F%2Fattacker.invalid",
      "/auth/confirm?token_hash=synthetic-invalid&type=signup&next=%2F%2Fattacker.invalid",
    ]) {
      const { location, response } = await redirectWithoutFollowing(page, path);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("error")).toBe("link");
      expect(response.headers()["set-cookie"]).toContain("rh_auth_next=");
      expect(response.headers()["set-cookie"]).toContain("Path=/auth/confirm");
      expect((await page.context().cookies()).some((cookie) => cookie.name === "rh_auth_next"))
        .toBe(false);
    }
  });

  test("Mailpit token link is canonical, ignores forged emailed next, retains browser-local deep link and cannot replay", async ({ page }) => {
    guardLocal();
    const before = new Set(await messageIds());
    await page.goto("/login?next=%2Fo%2Faspire%2Fsettings%2Fmembers");
    await page.getByRole("button", { name: "Email me a sign-in link instead" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("a sign-in link is on its way");

    const hint = (await page.context().cookies()).find((cookie) => cookie.name === "rh_auth_next");
    expect(hint?.httpOnly).toBe(true);
    expect(hint?.path).toBe("/auth/confirm");
    expect(hint?.sameSite).toBe("Lax");
    expect(decodeURIComponent(hint?.value ?? "")).toBe(intendedPath);

    let messageId = "";
    await expect.poll(async () => {
      messageId = (await messageIds()).find((id) => !before.has(id)) ?? "";
      return Boolean(messageId);
    }, { timeout: 30_000 }).toBe(true);
    const messageResponse = await fetch(MAILPIT_URL + "/api/v1/message/" + encodeURIComponent(messageId));
    expect(messageResponse.ok).toBe(true);
    const message = (await messageResponse.json()) as { HTML?: string };
    const href = /href="([^"]*token_hash=[^"]*)"/.exec(message.HTML ?? "")?.[1];
    expect(Boolean(href)).toBe(true);

    // Never log the token or email body, even on failed assertions.
    const link = new URL(href!.replace(/&amp;/g, "&"));
    expect(link.origin).toBe(new URL(baseUrl).origin);
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("type")).toBe("magiclink");
    expect(link.searchParams.has("token_hash")).toBe(true);
    expect(link.searchParams.has("next")).toBe(false);
    link.searchParams.set("next", "https://attacker.invalid/steal");

    // Follow the one-time token with an actual browser navigation. A request made
    // through Playwright's APIRequestContext does not exercise browser redirect /
    // cookie processing the same way as opening the link from email.
    const firstHopPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === new URL(baseUrl).origin
        && url.pathname === "/auth/confirm"
        && url.searchParams.has("token_hash");
    });
    // Avoid embedding the one-time token in navigation assertion failures or logs.
    await page.evaluate((target: string) => { window.location.assign(target); }, link.toString());
    const firstHop = await firstHopPromise;
    expect([302, 303, 307, 308].includes(firstHop.status())).toBe(true);
    expect(firstHop.headers()["cache-control"]?.includes("no-store")).toBe(true);
    expect(firstHop.headers()["referrer-policy"]).toBe("no-referrer");
    const firstLocation = new URL(firstHop.headers()["location"] ?? "/", baseUrl);
    expect(firstLocation.origin).toBe(new URL(baseUrl).origin);
    expect(firstLocation.pathname).toBe(intendedPath);
    expect(firstLocation.searchParams.has("token_hash")).toBe(false);
    expect(firstLocation.searchParams.has("next")).toBe(false);
    // Browser response.headers() intentionally omits sensitive Set-Cookie.
    // Read only the specific header values and assert booleans to avoid printing
    // session cookies or one-time auth data in failing CI logs.
    const clearsHint = (await firstHop.headerValues("set-cookie")).some((header) =>
      header.startsWith("rh_auth_next=")
        && header.includes("Path=/auth/confirm")
        && /(?:^|;\\s*)Max-Age=0(?:;|$)/i.test(header),
    );
    expect(clearsHint, "auth redirect must expire its scoped hint").toBe(true);

    await page.waitForURL((url) => url.pathname === intendedPath);
    await expect.poll(async () =>
      (await page.context().cookies()).some((cookie) =>
        cookie.name === "rh_auth_next" && cookie.path === "/auth/confirm",
      ),
    ).toBe(false);
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);

    const replay = await redirectWithoutFollowing(page, link.toString());
    expect(replay.location.pathname).toBe("/login");
    expect(replay.location.searchParams.get("error")).toBe("link");
  });
});
