import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe TEST webhook authentication only. Must run on the trusted server using
 * the exact raw HTTP body. Never use a browser redirect or an unverified
 * Checkout session object as proof that a sponsorship was paid.
 *
 * This is deliberately not a public route or database grant. The reviewed
 * server integration must correlate this result with a locked private
 * reservation and idempotently record the event before changing inventory.
 */
export type VerifiedCalendarTestPayment = {
  stripeEventId: string;
  reservationId: string;
  checkoutSessionId: string;
  totalCents: number;
  currency: "usd";
};

type StripeSession = {
  id?: unknown;
  livemode?: unknown;
  mode?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  client_reference_id?: unknown;
  metadata?: unknown;
};

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  livemode?: unknown;
  data?: { object?: StripeSession };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_SESSION = /^cs_test_[A-Za-z0-9_]{3,248}$/;
const EVENT_ID = /^evt_[A-Za-z0-9_]{3,248}$/;
const WEBHOOK_TOLERANCE_SECONDS = 300;

export function verifyStripeTestCalendarPayment(
  rawBody: string | Uint8Array,
  signatureHeader: string,
  webhookSecret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): VerifiedCalendarTestPayment {
  if (typeof webhookSecret !== "string" || !/^whsec_[A-Za-z0-9_]{8,}$/.test(webhookSecret)) {
    throw new Error("A server-only Stripe webhook signing secret is required.");
  }
  if (!Number.isSafeInteger(nowEpochSeconds) || nowEpochSeconds <= 0) {
    throw new Error("Invalid webhook verification clock.");
  }
  if (typeof signatureHeader !== "string" || signatureHeader.length > 4096) {
    throw new Error("Invalid Stripe signature.");
  }

  let timestamp: number | null = null;
  const signatures: Buffer[] = [];
  for (const entry of signatureHeader.split(",")) {
    const [key, value, extra] = entry.trim().split("=");
    if (extra !== undefined || value === undefined) continue;
    if (key === "t" && /^\d{1,16}$/.test(value)) {
      const parsed = Number(value);
      if (timestamp !== null || !Number.isSafeInteger(parsed)) throw new Error("Invalid Stripe timestamp.");
      timestamp = parsed;
    }
    if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) {
      signatures.push(Buffer.from(value, "hex"));
    }
  }
  if (timestamp === null || Math.abs(nowEpochSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS ||
    signatures.length === 0) {
    throw new Error("Invalid or expired Stripe signature.");
  }

  const body = Buffer.from(rawBody);
  const signedPayload = Buffer.concat([Buffer.from(String(timestamp) + "."), body]);
  const expected = createHmac("sha256", webhookSecret).update(signedPayload).digest();
  if (!signatures.some(signature => timingSafeEqual(signature, expected))) {
    throw new Error("Invalid Stripe signature.");
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(body.toString("utf8")) as StripeEvent;
  } catch {
    throw new Error("Invalid Stripe event body.");
  }

  if (!event || !EVENT_ID.test(String(event.id ?? "")) ||
      event.type !== "checkout.session.completed" || event.livemode !== false) {
    throw new Error("Unsupported Stripe TEST payment event.");
  }

  const session = event.data?.object;
  if (!session || typeof session.id !== "string" || !TEST_SESSION.test(session.id) ||
      session.mode !== "payment" || session.livemode !== false ||
      session.payment_status !== "paid" ||
      typeof session.amount_total !== "number" ||
      !Number.isSafeInteger(session.amount_total) ||
      session.amount_total < 100 || session.amount_total > 248000 ||
      session.currency !== "usd" ||
      typeof session.client_reference_id !== "string" ||
      !UUID.test(session.client_reference_id) ||
      !session.metadata || typeof session.metadata !== "object" ||
      (session.metadata as Record<string, unknown>).reservation_id !== session.client_reference_id) {
    throw new Error("Stripe TEST payment details did not reconcile.");
  }

  return {
    stripeEventId: event.id as string,
    reservationId: session.client_reference_id,
    checkoutSessionId: session.id,
    totalCents: session.amount_total,
    currency: "usd",
  };
}
