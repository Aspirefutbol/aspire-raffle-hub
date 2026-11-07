/**
 * Recover inventory from a Stripe TEST Checkout session only after Stripe's
 * API reports it terminally expired and unpaid. A local timeout or success/
 * cancel redirect is never enough to release CHECKOUT_PENDING days.
 *
 * This helper is server-only plumbing, not a route or a payment outcome.
 * The private DB expiry transaction must follow successful verification.
 */
export type PendingCalendarTestCheckout = {
  reservationId: string;
  checkoutSessionId: string;
  totalCents: number;
  expiresAtEpochSeconds: number;
};

type StripeSession = {
  id?: unknown;
  livemode?: unknown;
  mode?: unknown;
  status?: unknown;
  payment_status?: unknown;
  client_reference_id?: unknown;
  metadata?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  expires_at?: unknown;
};

export type StripeTestExpiryConfig = {
  secretKey: string;
  nowEpochSeconds?: number;
  request?: typeof fetch;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_SESSION = /^cs_test_[A-Za-z0-9_]{3,248}$/;

/**
 * Returns exactly the verified session identity for the private transaction.
 * Throws closed on any mismatch or API failure. Never return a verification
 * result based solely on locally recorded expiry time.
 */
export async function verifyExpiredStripeTestCalendarCheckout(
  pending: PendingCalendarTestCheckout,
  config: StripeTestExpiryConfig,
): Promise<{ reservationId: string; sessionId: string; expiresAtEpochSeconds: number }> {
  if (!/^sk_test_[A-Za-z0-9_]+$/.test(config.secretKey)) {
    throw new Error("Only a server-side Stripe TEST key is allowed.");
  }
  if (!UUID.test(pending.reservationId) || !TEST_SESSION.test(pending.checkoutSessionId) ||
      !Number.isSafeInteger(pending.totalCents) || pending.totalCents < 100 ||
      pending.totalCents > 248000 ||
      !Number.isSafeInteger(pending.expiresAtEpochSeconds)) {
    throw new Error("Invalid private calendar checkout snapshot.");
  }
  const now = config.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now <= 0 || now < pending.expiresAtEpochSeconds) {
    throw new Error("Checkout has not reached its recorded expiration.");
  }

  // Session ID is strictly validated above; encode it before URL construction.
  const url = "https://api.stripe.com/v1/checkout/sessions/" +
    encodeURIComponent(pending.checkoutSessionId);
  const response = await (config.request ?? fetch)(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${config.secretKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Unable to verify Stripe TEST session expiry (HTTP ${response.status}).`);
  }
  const session = await response.json() as StripeSession;
  const metadata = session.metadata;
  if (!session || session.id !== pending.checkoutSessionId ||
      session.livemode !== false || session.mode !== "payment" ||
      session.status !== "expired" || session.payment_status !== "unpaid" ||
      session.client_reference_id !== pending.reservationId ||
      !metadata || typeof metadata !== "object" ||
      (metadata as Record<string, unknown>).reservation_id !== pending.reservationId ||
      session.currency !== "usd" || session.amount_total !== pending.totalCents ||
      session.expires_at !== pending.expiresAtEpochSeconds) {
    throw new Error("Stripe TEST checkout is not a matching expired and unpaid session.");
  }
  return {
    reservationId: pending.reservationId,
    sessionId: pending.checkoutSessionId,
    expiresAtEpochSeconds: pending.expiresAtEpochSeconds,
  };
}
