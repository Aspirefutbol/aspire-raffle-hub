import { describe, expect, it, vi } from "vitest";
import {
  createStripeTestCalendarCheckout,
  type CalendarReservationSnapshot,
} from "./stripe-test-checkout";

const reservation: CalendarReservationSnapshot = {
  id: "d1a04e38-e473-40d0-a1a0-ffbcb686b15a",
  status: "HELD",
  days: [10],
  multiplier: 5,
  baseCents: 1000,
  additionalImpactCents: 4000,
  totalCents: 5000,
};

const stripeResult = {
  id: "cs_test_synthetic_only",
  url: "https://checkout.stripe.com/c/pay/cs_test_synthetic_only",
  mode: "payment",
  livemode: false,
};

function transport(payload: unknown = stripeResult, status = 200) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }));
}

describe("calendar Stripe TEST checkout handoff", () => {
  it("uses the authoritative calendar quote, TEST-only session and stable idempotency", async () => {
    const request = transport();
    const result = await createStripeTestCalendarCheckout(reservation, {
      secretKey: "sk_test_synthetic_placeholder",
      siteOrigin: "https://aspire-south-staging.example.test",
      nowEpochSeconds: 1800000000,
      request,
    });
    expect(result).toEqual({ id: stripeResult.id, url: stripeResult.url });
    const [requestUrl, options] = request.mock.calls[0]!;
    expect(requestUrl).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("Idempotency-Key")).toBe(
      `calendar-test-${reservation.id}`);
    const body = new URLSearchParams(options?.body as string);
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("5000");
    expect(body.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(body.get("metadata[reservation_id]")).toBe(reservation.id);
    expect(body.get("success_url")).toBe(
      "https://aspire-south-staging.example.test/calendar/aspire-south?checkout=verifying");
    expect(body.get("expires_at")).toBe(String(1800000000 + 45 * 60));
  });

  it("rejects LIVE keys without making a request", async () => {
    const request = transport();
    await expect(createStripeTestCalendarCheckout(reservation, {
      secretKey: "sk_live_do_not_use",
      siteOrigin: "https://example.test",
      request,
    })).rejects.toThrow(/TEST secret key/);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects altered monetary snapshots or paid reservations", async () => {
    const request = transport();
    const config = { secretKey: "sk_test_fake", siteOrigin: "https://example.test", request };
    await expect(createStripeTestCalendarCheckout(
      { ...reservation, totalCents: 100 }, config,
    )).rejects.toThrow(/does not reconcile/);
    await expect(createStripeTestCalendarCheckout(
      { ...reservation, status: "PAID" }, config,
    )).rejects.toThrow(/Only a held reservation/);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects insecure return origins before contacting Stripe", async () => {
    const request = transport();
    await expect(createStripeTestCalendarCheckout(reservation, {
      secretKey: "sk_test_fake",
      siteOrigin: "http://example.test",
      request,
    })).rejects.toThrow(/trusted HTTPS/);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects non-test sessions and untrusted checkout redirects", async () => {
    const config = { secretKey: "sk_test_fake", siteOrigin: "https://example.test" };
    await expect(createStripeTestCalendarCheckout(reservation, {
      ...config, request: transport({ ...stripeResult, livemode: true }),
    })).rejects.toThrow(/non-TEST/);
    await expect(createStripeTestCalendarCheckout(reservation, {
      ...config, request: transport({ ...stripeResult, url: "https://evil.example.test/phish" }),
    })).rejects.toThrow(/untrusted Checkout URL/);
  });

  it("does not expose Stripe error response bodies or secrets", async () => {
    await expect(createStripeTestCalendarCheckout(reservation, {
      secretKey: "sk_test_fake",
      siteOrigin: "https://example.test",
      request: transport({ error: { message: "INTERNAL_SECRET" } }, 400),
    })).rejects.toThrow("Stripe TEST checkout could not start (HTTP 400).");
  });
});
