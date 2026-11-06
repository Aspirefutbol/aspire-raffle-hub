import { describe, expect, it, vi } from "vitest";
import {
  verifyExpiredStripeTestCalendarCheckout,
  type PendingCalendarTestCheckout,
} from "./stripe-test-expiry";

const NOW = 1_800_000_000;
const pending: PendingCalendarTestCheckout = {
  reservationId: "d1a04e38-e473-40d0-a1a0-ffbcb686b15a",
  checkoutSessionId: "cs_test_synthetic_expiry",
  totalCents: 3000,
  expiresAtEpochSeconds: NOW - 100,
};
const session = {
  id: pending.checkoutSessionId,
  livemode: false,
  mode: "payment",
  status: "expired",
  payment_status: "unpaid",
  client_reference_id: pending.reservationId,
  metadata: { reservation_id: pending.reservationId },
  currency: "usd",
  amount_total: pending.totalCents,
  expires_at: pending.expiresAtEpochSeconds,
};
function transport(payload: unknown = session, status = 200) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }));
}
const config = {
  secretKey: "sk_test_synthetic_only",
  nowEpochSeconds: NOW,
};

describe("Stripe TEST checkout expiry proof", () => {
  it("checks Stripe's terminal unpaid state before releasing a day", async () => {
    const request = transport();
    const verified = await verifyExpiredStripeTestCalendarCheckout(
      pending, { ...config, request },
    );
    expect(verified).toEqual({
      reservationId: pending.reservationId,
      sessionId: pending.checkoutSessionId,
      expiresAtEpochSeconds: pending.expiresAtEpochSeconds,
    });
    const [url, options] = request.mock.calls[0]!;
    expect(url).toBe(
      "https://api.stripe.com/v1/checkout/sessions/cs_test_synthetic_expiry");
    expect(options?.method).toBe("GET");
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer sk_test_synthetic_only");
  });

  it("never releases inventory based solely on elapsed time", async () => {
    for (const changed of [
      { status: "open" },
      { status: "complete", payment_status: "paid" },
      { payment_status: "paid" },
      { livemode: true },
      { id: "cs_test_other_session" },
      { client_reference_id: "another-reservation" },
      { metadata: { reservation_id: "another-reservation" } },
      { amount_total: 1000 },
      { currency: "eur" },
      { expires_at: NOW - 200 },
      { mode: "subscription" },
    ]) {
      await expect(verifyExpiredStripeTestCalendarCheckout(pending, {
        ...config, request: transport({ ...session, ...changed }),
      })).rejects.toThrow(/not a matching expired and unpaid/);
    }
  });

  it("rejects future expiration and LIVE keys before contacting Stripe", async () => {
    const request = transport();
    await expect(verifyExpiredStripeTestCalendarCheckout(
      { ...pending, expiresAtEpochSeconds: NOW + 1 },
      { ...config, request },
    )).rejects.toThrow(/not reached/);
    await expect(verifyExpiredStripeTestCalendarCheckout(pending, {
      ...config, secretKey: "sk_live_forbidden", request,
    })).rejects.toThrow(/TEST key/);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects invalid private snapshots and API errors without leaking response body", async () => {
    await expect(verifyExpiredStripeTestCalendarCheckout(
      { ...pending, checkoutSessionId: "cs_live_invalid" },
      { ...config, request: transport() },
    )).rejects.toThrow(/Invalid private/);
    await expect(verifyExpiredStripeTestCalendarCheckout(pending, {
      ...config,
      request: transport({ error: { message: "PRIVATE_STRIPE_RESPONSE" } }, 403),
    })).rejects.toThrow("Unable to verify Stripe TEST session expiry (HTTP 403).");
  });
});
