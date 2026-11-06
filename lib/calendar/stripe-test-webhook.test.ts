import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeTestCalendarPayment } from "./stripe-test-webhook";

const NOW = 1_800_000_000;
const SECRET = "whsec_synthetic_signing_secret_for_tests";
const RESERVATION = "d1a04e38-e473-40d0-a1a0-ffbcb686b15a";
const session = {
  id: "cs_test_synthetic_calendar_checkout",
  livemode: false,
  mode: "payment",
  payment_status: "paid",
  amount_total: 5000,
  currency: "usd",
  client_reference_id: RESERVATION,
  metadata: { reservation_id: RESERVATION },
};
const event = { id: "evt_synthetic_calendar_123", type: "checkout.session.completed", livemode: false,
  data: { object: session } };

function sign(body: string, when = NOW, key = SECRET) {
  const digest = createHmac("sha256", key).update(`${when}.${body}`).digest("hex");
  return `t=${when},v1=${digest}`;
}
function verify(payload: unknown, header?: string, timestamp = NOW) {
  const body = JSON.stringify(payload);
  return verifyStripeTestCalendarPayment(body, header ?? sign(body), SECRET, timestamp);
}

describe("Stripe TEST calendar webhook proof", () => {
  it("verifies raw-body HMAC before accepting a paid TEST session", () => {
    const body = JSON.stringify(event);
    expect(verifyStripeTestCalendarPayment(Buffer.from(body), sign(body), SECRET, NOW)).toEqual({
      stripeEventId: event.id,
      reservationId: RESERVATION,
      checkoutSessionId: session.id,
      totalCents: 5000,
      currency: "usd",
    });
  });

  it("rejects altered content, invalid timestamps and forged signatures", () => {
    const body = JSON.stringify(event);
    expect(() => verifyStripeTestCalendarPayment(body.replace("5000", "1000"), sign(body), SECRET, NOW)).toThrow(/signature/);
    expect(() => verifyStripeTestCalendarPayment(body, sign(body, NOW-301), SECRET, NOW)).toThrow(/expired/);
    expect(() => verifyStripeTestCalendarPayment(body, sign(body), SECRET, NOW+301)).toThrow(/expired/);
    expect(() => verifyStripeTestCalendarPayment(body, "t=foo,v1=deadbeef", SECRET, NOW)).toThrow(/signature/);
    expect(() => verifyStripeTestCalendarPayment(body, sign(body, NOW, "whsec_fake_synthetic_secret"), SECRET, NOW)).toThrow(/signature/);
  });

  it("accepts Stripe key rotation with multiple v1 signatures", () => {
    const body = JSON.stringify(event);
    const correct = sign(body);
    expect(verifyStripeTestCalendarPayment(body, correct + ",v1=" + "0".repeat(64), SECRET, NOW).totalCents).toBe(5000);
  });

  it("rejects LIVE and unpaid sessions even with a valid signature", () => {
    for (const override of [
      { event: { livemode: true } },
      { session: { livemode: true } },
      { session: { id: "cs_live_unsafe" } },
      { session: { payment_status: "unpaid" } },
      { session: { mode: "setup" } },
      { event: { type: "checkout.session.expired" } },
    ]) {
      const changed = {
        ...event,
        ...override.event,
        data: { object: { ...session, ...override.session } },
      };
      expect(() => verify(changed)).toThrow();
    }
  });

  it("rejects mismatched reservations, currency and unsafe amounts", () => {
    for (const override of [
      { amount_total: 1 },
      { amount_total: 248001 },
      { amount_total: "5000" },
      { currency: "eur" },
      { client_reference_id: "not-a-reservation" },
      { metadata: { reservation_id: "another-reservation" } },
    ]) {
      expect(() => verify({ ...event, data: { object: { ...session, ...override } } })).toThrow(/did not reconcile/);
    }
  });

  it("rejects malformed payloads and never treats a redirect as payment", () => {
    const raw = "{this is not json";
    expect(() => verifyStripeTestCalendarPayment(raw, sign(raw), SECRET, NOW)).toThrow(/body/);
    expect(() => verifyStripeTestCalendarPayment(JSON.stringify(event), sign(JSON.stringify(event)), "sk_test_wrong_kind", NOW)).toThrow(/server-only/);
  });
});
