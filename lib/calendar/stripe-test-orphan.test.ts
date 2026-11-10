import { describe, expect, it, vi } from "vitest";
import {
  expireOrphanedCalendarTestSession,
  startAttachedStripeTestCalendarCheckout,
} from "./stripe-test-orphan";
import type { CalendarReservationSnapshot } from "./stripe-test-checkout";

const NOW = 1_800_000_000;
const reservation: CalendarReservationSnapshot = {
  id: "d1a04e38-e473-40d0-a1a0-ffbcb686b15a",
  status: "HELD",
  days: [10],
  multiplier: 3,
  baseCents: 1000,
  additionalImpactCents: 2000,
  totalCents: 3000,
};
const checkout = {
  id: "cs_test_synthetic_orphan_123",
  url: "https://checkout.stripe.com/c/pay/cs_test_synthetic_orphan_123",
  mode: "payment",
  livemode: false,
  amount_total: 3000,
  currency: "usd",
  client_reference_id: reservation.id,
  expires_at: NOW + 45 * 60,
};
const expired = {
  id: checkout.id,
  livemode: false,
  mode: "payment",
  status: "expired",
  payment_status: "unpaid",
  client_reference_id: reservation.id,
  metadata: { reservation_id: reservation.id },
};

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const config = {
  secretKey: "sk_test_synthetic_only",
  siteOrigin: "https://aspire-south.example.test",
  nowEpochSeconds: NOW,
};

describe("Stripe TEST calendar attachment and orphan recovery", () => {
  it("only returns a donor checkout URL after a matching private attachment", async () => {
    const request = vi.fn<typeof fetch>(async () => response(checkout));
    const attach = vi.fn(async () => ({
      id: reservation.id,
      status: "CHECKOUT_PENDING" as const,
      checkout_session_id: checkout.id,
    }));
    const result = await startAttachedStripeTestCalendarCheckout(
      reservation, { ...config, request }, attach,
    );
    expect(result.id).toBe(checkout.id);
    expect(result.url).toBe(checkout.url);
    expect(attach).toHaveBeenCalledWith(
      reservation.id, checkout.id, new Date(checkout.expires_at * 1000).toISOString(),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("expires an orphan at Stripe when the private database attachment rejects", async () => {
    const request = vi.fn<typeof fetch>(async (url, options) => {
      if (options?.method === "POST" && String(url).endsWith("/expire")) {
        return response(expired);
      }
      return response(checkout);
    });
    const attach = vi.fn(async () => { throw new Error("SENSITIVE_DATABASE_DETAIL"); });
    await expect(startAttachedStripeTestCalendarCheckout(
      reservation, { ...config, request }, attach,
    )).rejects.toThrow("TEST checkout attachment failed; Stripe session expired safely.");
    expect(request).toHaveBeenCalledTimes(2);
    const [url, options] = request.mock.calls[1]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions/" + checkout.id + "/expire");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer sk_test_synthetic_only");
  });

  it("fails closed on a mismatched attachment result and never returns checkout URL", async () => {
    const request = vi.fn<typeof fetch>(async (url) =>
      response(String(url).endsWith("/expire") ? expired : checkout));
    await expect(startAttachedStripeTestCalendarCheckout(
      reservation, { ...config, request },
      async () => ({
        id: reservation.id,
        checkout_session_id: "cs_test_wrong_session",
        status: "CHECKOUT_PENDING",
      }),
    )).rejects.toThrow(/expired safely/);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("flags manual review if Stripe cannot confirm orphan expiry", async () => {
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/expire")
        ? response({ error: { message: "NEVER_LOG_THIS" } }, 409)
        : response(checkout));
    await expect(startAttachedStripeTestCalendarCheckout(
      reservation, { ...config, request },
      async () => { throw new Error("do not expose database errors"); },
    )).rejects.toThrow(/manual review required/);
  });

  it("does not accept a completed, paid, LIVE, or mismatched Stripe expiry", async () => {
    for (const change of [
      { status: "complete", payment_status: "paid" },
      { livemode: true },
      { client_reference_id: "different-reservation" },
      { metadata: { reservation_id: "different-reservation" } },
    ]) {
      const request = vi.fn<typeof fetch>(async () => response({ ...expired, ...change }));
      await expect(expireOrphanedCalendarTestSession(
        checkout.id, reservation.id, { secretKey: config.secretKey, request },
      )).rejects.toThrow(/matching expired\/unpaid/);
    }
  });

  it("rejects LIVE keys and invalid identifiers before any Stripe request", async () => {
    const request = vi.fn<typeof fetch>(async () => response(expired));
    await expect(expireOrphanedCalendarTestSession(
      checkout.id, reservation.id, { secretKey: "sk_live_forbidden", request },
    )).rejects.toThrow(/TEST key/);
    await expect(expireOrphanedCalendarTestSession(
      "cs_live_forbidden", reservation.id, { secretKey: config.secretKey, request },
    )).rejects.toThrow(/Invalid/);
    expect(request).not.toHaveBeenCalled();
  });
});
