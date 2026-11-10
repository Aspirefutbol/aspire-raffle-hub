import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { CalendarOutboxError, assertCalendarIntentIntegrity } from "./notification-outbox";

/*
 * Batch 2A golden digest vectors (proposal rev 2.2 §4.3).
 *
 * The expected SHA-256 values were computed by an INDEPENDENT implementation of the
 * canonical rules (Python json.dumps, compact, raw UTF-8). This test proves Batch 1's
 * real JSON.stringify-based digests produce exactly the same bytes; the pgTAP suite
 * proves PostgreSQL does too. A mismatch must never be "fixed" by changing payloads.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = "22222222-2222-4222-8222-222222222222";
const PARTICIPANT = "33333333-3333-4333-8333-333333333333";
const TEMPLATE = "calendar-donor-confirmation/2026-11-07.1";

type Facts = {
  reservationId: string; recipient: string; language: "en" | "es"; days: number[];
  multiplier: number; baseCents: number; additionalImpactCents: number; totalCents: number;
};
type Content = { subject: string; text: string; html: string };

const FACTS = {
  F1: {
    facts: { reservationId: "44444444-4444-4444-8444-444444444444", recipient: "donor@example.test", language: "en",
      days: [7], multiplier: 1, baseCents: 700, additionalImpactCents: 0, totalCents: 700 },
    digest: "9a328211277fcd1e52889caaf6fd448591bf7c37ef7fe557620d0d0aecd121ac",
  },
  F2: {
    facts: { reservationId: "55555555-5555-4555-8555-555555555555", recipient: "donante+prueba@example.test", language: "es",
      days: Array.from({ length: 31 }, (_, i) => i + 1), multiplier: 5, baseCents: 49600,
      additionalImpactCents: 198400, totalCents: 248000 },
    digest: "f4dbbc350b676747d72ae1232b7b9cb44fb3183f76d10a5f988c1bbddc0cab43",
  },
} satisfies Record<string, { facts: Facts; digest: string }>;

const CONTENT = {
  C1: { content: { subject: "Thank you", text: "Thank you for sponsoring day 7.", html: "<p>Thank you for sponsoring day 7.</p>" },
    digest: "257c4e3869ca092780a2574bbae129c80af977679f52093ede9b9c5b1e9aac82" },
  C2: { content: { subject: "¡Gracias!", text: "Patrocinó el día 7. ¿Preguntas?",
      html: "<p>¡Gracias! Patrocinó el <b>día 7</b>.</p>" },
    digest: "ac1de67b6bbf8866837ad11ccacdf3ef3bcab5a0fa767576e78694dcca7b3e78" },
  C3: { content: { subject: 'He said "hi"', text: "path\\to/file \\\\ end", html: '<a href="/x/y">a\\b</a>' },
    digest: "c3e16b36a478a07e811e2a034001feb42728842fa8a7db4f6a50005887262537" },
  C4: { content: { subject: "tab\there", text: "line1\nline2\r\nline3\b\f\u0001\u001f end", html: "<p>ab</p>" },
    digest: "dfd6bcefdd7107a96d46348ce6a184108a854f47f1f11ee217306a6e7a4f0586" },
  C5: { content: { subject: "x y", text: "p1 p2 del\u007fend", html: "<p> </p>" },
    digest: "7000ae7dff172cf141bb4eae76a27ba26fd2db521908390652d81c7671adf272" },
  C6: { content: { subject: "⚽ Goal! \u{1F389}", text: "Gracias \u{1F600} — día 31 \u{1F3C6}", html: "<p>\u{1F389}</p>" },
    digest: "c417cb50583225a167cbfffbd04aaf0c62297cbeb17430d2a2768962fcb589f1" },
  C7: { content: { subject: "Tom & Ana", text: "<script>alert(1)</script>", html: "<p>Tom &amp; Ana &lt;3 <script>x</script></p>" },
    digest: "5bbdfcda8d2aa331945c9d4a39df418d0c4c7d2777dadb2ad334634ebdad8a4f" },
  C8: { content: { subject: "S".repeat(300), text: "t".repeat(20_000), html: "h".repeat(100_000) },
    digest: "dafdf437f8938a9bb464318112170dd9974e3143b9b1fdf5bfc73e7d79cd5050" },
} satisfies Record<string, { content: Content; digest: string }>;

function intent(f: { facts: Facts; digest: string }, c: { content: Content; digest: string }) {
  return {
    key: `calendar:test:${ORG}:${f.facts.reservationId}:donor-confirmation:v1`,
    kind: "calendar_donor_confirmation",
    mode: "test",
    organizationId: ORG,
    campaignId: CAMPAIGN,
    participantId: PARTICIPANT,
    reservationId: f.facts.reservationId,
    recipient: f.facts.recipient,
    language: f.facts.language,
    facts: {
      currency: "usd", days: f.facts.days, multiplier: f.facts.multiplier, baseCents: f.facts.baseCents,
      additionalImpactCents: f.facts.additionalImpactCents, totalCents: f.facts.totalCents,
    },
    templateVersion: TEMPLATE,
    subject: c.content.subject,
    text: c.content.text,
    html: c.content.html,
    factsDigest: f.digest,
    contentDigest: c.digest,
  };
}

function rejects(value: unknown) {
  try {
    assertCalendarIntentIntegrity(value);
    return false;
  } catch (error) {
    return error instanceof CalendarOutboxError && error.code === "INVALID_INTENT";
  }
}

describe("Batch 2A golden digest vectors: Node JSON.stringify equals the independent constants", () => {
  it.each(Object.entries(FACTS))("facts vector %s", (_name, vector) => {
    expect(() => assertCalendarIntentIntegrity(intent(vector, CONTENT.C1))).not.toThrow();
  });

  it.each(Object.entries(CONTENT))("content vector %s", (_name, vector) => {
    expect(() => assertCalendarIntentIntegrity(intent(FACTS.F1, vector))).not.toThrow();
  });

  it("G3: a one-character change in any digested field is rejected", () => {
    const base = intent(FACTS.F1, CONTENT.C2);
    expect(rejects({ ...base, subject: base.subject + "!" })).toBe(true);
    expect(rejects({ ...base, text: base.text.replace("7", "8") })).toBe(true);
    expect(rejects({ ...base, recipient: "donor2@example.test" })).toBe(true);
    expect(rejects({ ...base, facts: { ...base.facts, totalCents: 701 } })).toBe(true);
  });

  it("does not normalize: escaped and unescaped forms of the same text are different inputs", () => {
    const base = intent(FACTS.F1, CONTENT.C5);
    expect(rejects({ ...base, subject: "x\\u2028y" })).toBe(true);
  });
});
