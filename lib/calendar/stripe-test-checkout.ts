import { calendarImpactQuote, type CalendarMultiplier } from "./pricing";

/**
 * TEST-mode transport only. This helper is NOT a donor endpoint.
 * The caller must read a reservation from the trusted database, atomically
 * attach the returned cs_test_ session, then expose its URL. A success redirect
 * is never evidence of payment. Only a verified webhook can mark PAID.
 */
export type CalendarReservationSnapshot = {
  id: string;
  status: "HELD" | "CHECKOUT_PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";
  days: number[];
  multiplier: CalendarMultiplier;
  baseCents: number;
  additionalImpactCents: number;
  totalCents: number;
};

type StripeCheckoutResponse = {
  id?: unknown;
  url?: unknown;
  mode?: unknown;
  livemode?: unknown;
};

export type StripeTestCheckoutConfig = {
  secretKey: string;
  siteOrigin: string;
  nowEpochSeconds?: number;
  request?: typeof fetch;
};

export async function createStripeTestCalendarCheckout(
  reservation: CalendarReservationSnapshot,
  config: StripeTestCheckoutConfig,
): Promise<{ id: string; url: string }> {
  if (!/^sk_test_[A-Za-z0-9_]+$/.test(config.secretKey)) {
    throw new Error("A Stripe TEST secret key is required; live keys are forbidden.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservation.id)) {
    throw new Error("Invalid reservation identifier.");
  }
  if (reservation.status !== "HELD") {
    throw new Error("Only a held reservation can start TEST checkout.");
  }
  const quote = calendarImpactQuote(reservation.days, reservation.multiplier);
  if (quote.baseCents !== reservation.baseCents ||
      quote.additionalImpactCents !== reservation.additionalImpactCents ||
      quote.totalCents !== reservation.totalCents ||
      quote.totalCents < 100 || quote.totalCents > 248000) {
    throw new Error("The reserved sponsorship amount does not reconcile.");
  }

  const site = new URL(config.siteOrigin);
  if (site.username || site.password || site.search || site.hash ||
      (site.protocol !== "https:" &&
        !(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname)))) {
    throw new Error("Use a trusted HTTPS site origin.");
  }
  const origin = site.origin;
  const success = new URL("/calendar/aspire-south?checkout=verifying", origin);
  const cancel = new URL("/calendar/aspire-south?checkout=cancelled", origin);
  // Stripe's hosted Checkout minimum session lifetime is 30 minutes.
  // CHECKOUT_PENDING inventory must not be reaped by the 15-minute HELD TTL.
  const now = config.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid clock.");
  const expiration = now + 45 * 60;

  const body = new URLSearchParams({
    mode: "payment",
    locale: "auto",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(quote.totalCents),
    "line_items[0][price_data][product_data][name]": "Aspire South Calendar Sponsorship",
    "line_items[0][quantity]": "1",
    client_reference_id: reservation.id,
    "metadata[reservation_id]": reservation.id,
    "payment_intent_data[metadata][reservation_id]": reservation.id,
    success_url: success.toString(),
    cancel_url: cancel.toString(),
    expires_at: String(expiration),
  });

  const response = await (config.request ?? fetch)("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `calendar-test-${reservation.id}`,
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Stripe TEST checkout could not start (HTTP ${response.status}).`);

  const payload = await response.json() as StripeCheckoutResponse;
  if (typeof payload.id !== "string" || !payload.id.startsWith("cs_test_") ||
      typeof payload.url !== "string" || payload.mode !== "payment" ||
      payload.livemode !== false) {
    throw new Error("Stripe returned a non-TEST or invalid Checkout session.");
  }
  const checkoutUrl = new URL(payload.url);
  if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") {
    throw new Error("Stripe returned an untrusted Checkout URL.");
  }
  return { id: payload.id, url: checkoutUrl.toString() };
}
