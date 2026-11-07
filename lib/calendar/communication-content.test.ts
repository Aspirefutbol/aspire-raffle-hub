import { describe, expect, it } from "vitest";
import { calendarPreviewShareContent, calendarTestConfirmationContent, type CalendarEmailDetails } from "./communication-content";

const origin = "https://6aef239da142b590991a1373--aspire-raffle-hub-staging.netlify.app";
const details: CalendarEmailDetails = {
  organizationName: "Aspire South", participantDisplayName: "Mateo R.",
  days: [10], multiplier: 5, baseCents: 1000, additionalImpactCents: 4000, totalCents: 5000,
};

describe("calendar communication content", () => {
  it("keeps English and Spanish invitations explicitly synthetic and recipient-free", () => {
    for (const language of ["en", "es"] as const) {
      const result = calendarPreviewShareContent(origin, language);
      expect(result.url).toBe(`${origin}/calendar/aspire-south`);
      expect(result.title).toContain("[DEMO]");
      expect(result.text).toContain(language === "es" ? "no acepta pagos" : "does not accept payments");
      expect(new URL(result.emailHref).searchParams.get("body")).toBe(result.invitation);
      expect(new URL(result.whatsappHref).searchParams.get("text")).toBe(result.invitation);
      expect(result.invitation).not.toMatch(/token|password|@|view=family/);
    }
  });
  it("rejects non-preview hosts, credentials, auth queries and fragments", () => {
    for (const bad of ["https://evil.test", "javascript:alert(1)",
      "https://aspire-raffle-hub-staging.netlify.app", `${origin}/auth`,
      `${origin}?token=private`, `${origin}#private`, origin.replace("https://", "https://user:pass@"),
      `${origin}.evil.test`, origin.replace("https:", "http:")]) {
      expect(() => calendarPreviewShareContent(bad, "en"), bad).toThrow();
    }
    expect(calendarPreviewShareContent("http://127.0.0.1:3000", "en").url).toContain("/calendar/aspire-south");
  });
  it("renders bilingual TEST confirmations without implying a live receipt", () => {
    const en = calendarTestConfirmationContent(details, "en");
    const es = calendarTestConfirmationContent(details, "es");
    expect(en.subject).toMatch(/^\[TEST\]/);
    expect(es.subject).toMatch(/^\[PRUEBA\]/);
    expect(en.text).toContain("Sponsored days: 10");
    expect(es.text).toContain("Días patrocinados: 10");
    for (const content of [en, es]) {
      expect(content.text).toContain("$10.00");
      expect(content.text).toContain("$40.00");
      expect(content.text).toContain("$50.00");
      expect(content.text).toContain("5×");
    }
    expect(es.html).toContain('lang="es"');
  });
  it("rejects mismatched money, duplicate days, invalid multipliers and header injection", () => {
    for (const change of [
      { totalCents: 1000 }, { baseCents: 5000 }, { additionalImpactCents: 0 },
      { days: [10, 10] }, { days: [] }, { days: [32] }, { days: [NaN] },
      { multiplier: 6 }, { multiplier: 1.5 }, { organizationName: "Aspire\r\nBcc: secret@example.test" },
    ]) expect(() => calendarTestConfirmationContent({ ...details, ...change }, "en")).toThrow();
  });
  it("escapes display names in HTML and never includes a donor address", () => {
    const content = calendarTestConfirmationContent({ ...details, participantDisplayName: '<img src=x onerror="bad()">' }, "en");
    expect(content.html).toContain("&lt;img");
    expect(content.html).not.toContain("<img");
    expect(content.text).not.toContain("@");
  });
});
