import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { canonicalizeNetlifyDeployUrl } from "./proxy";

const SITE = "https://aspire-raffle-hub-staging.netlify.app";
const location = (url: string, ...site: [string?]) =>
  canonicalizeNetlifyDeployUrl(new NextRequest(url), site.length ? site[0] : SITE)?.headers.get("location") ?? null;

describe("canonicalizeNetlifyDeployUrl", () => {
  it("redirects a deploy alias to the canonical staging origin before auth runs", () => {
    expect(location("https://abc123--aspire-raffle-hub-staging.netlify.app/auth/confirm?token_hash=test&type=magiclink&next=%2F")).toBe(
      "https://aspire-raffle-hub-staging.netlify.app/auth/confirm?token_hash=test&type=magiclink&next=%2F",
    );
    expect(location("https://6acc308bfc7dc0811fd5118d--aspire-raffle-hub-staging.netlify.app/")).toBe(`${SITE}/`);
  });

  it("does not redirect the canonical hostname to itself", () => {
    expect(location(`${SITE}/auth/confirm?token_hash=test&type=magiclink`)).toBeNull();
    expect(location(`${SITE}/`)).toBeNull();
  });

  it("preserves the path and query string exactly", () => {
    const pathAndQuery = "/o/aspire/people/players?q=Ana%20Mar%C3%ADa&team=none&page=2&next=%2Fo%2Faspire%3Fx%3D1";
    expect(location(`https://deploy-preview-7--aspire-raffle-hub-staging.netlify.app${pathAndQuery}`)).toBe(`${SITE}${pathAndQuery}`);
  });

  it("leaves unrelated and custom hosts alone", () => {
    expect(location("https://other-site.netlify.app/auth/confirm?token_hash=t")).toBeNull();
    expect(location("https://abc--other-site.netlify.app/")).toBeNull();
    expect(location("https://raffle.aspirefutbol.com/login")).toBeNull();
    expect(location("https://evil-aspire-raffle-hub-staging.netlify.app/")).toBeNull(); // no "--" separator
    expect(location("http://localhost:3000/login", "http://localhost:3000")).toBeNull();
    expect(location("https://abc123--aspire-raffle-hub-staging.netlify.app/", undefined)).toBeNull();
  });

  it("uses the Host / X-Forwarded-Host header the browser sent (proxied or `next start`)", () => {
    const viaHost = new NextRequest("http://127.0.0.1:3000/auth/confirm?token_hash=t&type=magiclink", {
      headers: { host: "abc123--aspire-raffle-hub-staging.netlify.app" },
    });
    expect(canonicalizeNetlifyDeployUrl(viaHost, SITE)?.headers.get("location")).toBe(`${SITE}/auth/confirm?token_hash=t&type=magiclink`);
    const viaForwarded = new NextRequest("http://10.0.0.5/login", {
      headers: { host: "10.0.0.5", "x-forwarded-host": "abc123--aspire-raffle-hub-staging.netlify.app, cdn.internal" },
    });
    expect(canonicalizeNetlifyDeployUrl(viaForwarded, SITE)?.headers.get("location")).toBe(`${SITE}/login`);
    const canonicalBehindProxy = new NextRequest("http://10.0.0.5/login", { headers: { "x-forwarded-host": "aspire-raffle-hub-staging.netlify.app" } });
    expect(canonicalizeNetlifyDeployUrl(canonicalBehindProxy, SITE)).toBeNull();
  });

  it("uses the custom domain when that is the canonical site", () => {
    expect(location("https://main--raffle.aspirefutbol.com/login?next=%2F", "https://raffle.aspirefutbol.com")).toBe(
      "https://raffle.aspirefutbol.com/login?next=%2F",
    );
  });
});
