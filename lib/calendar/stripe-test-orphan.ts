import {
  createStripeTestCalendarCheckout,
  type CalendarReservationSnapshot,
  type StripeTestCheckoutConfig,
} from "./stripe-test-checkout";

/**
 * Server-side TEST-only checkout association.
 *
 * The returned Stripe URL MUST NOT reach a browser until an authorized
 * trusted database transaction has attached the exact session to the held
 * reservation. The attachment callback is not an exposed RPC or public API.
 * A failed attachment immediately attempts to expire the orphan at Stripe
 * instead of leaving an untracked payment URL in circulation.
 */
export type AttachedCalendarTestCheckout = {
  id: string;
  status: "CHECKOUT_PENDING";
  checkout_session_id: string;
};

type StripeExpiredSession = {
  id?: unknown;
  livemode?: unknown;
  status?: unknown;
  payment_status?: unknown;
  mode?: unknown;
  client_reference_id?: unknown;
  metadata?: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_SESSION = /^cs_test_[A-Za-z0-9_]{3,248}$/;

/**
 * Explicitly expire a Stripe TEST session created for a reservation, then
 * verify Stripe confirms it is terminally expired and unpaid. This never
 * releases database day inventory; that requires independent DB state checks.
 */
export async function expireOrphanedCalendarTestSession(
  sessionId: string,
  reservationId: string,
  config: Pick<StripeTestCheckoutConfig, "secretKey" | "request">,
): Promise<void> {
  if (!/^sk_test_[A-Za-z0-9_]+$/.test(config.secretKey)) {
    throw new Error("Only a server-side Stripe TEST key is allowed.");
  }
  if (!TEST_SESSION.test(sessionId) || !UUID.test(reservationId)) {
    throw new Error("Invalid Stripe TEST orphan identifiers.");
  }

  const response = await (config.request ?? fetch)(
    "https://api.stripe.com/v1/checkout/sessions/" +
      encodeURIComponent(sessionId) + "/expire",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.secretKey}` },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    // Never include the Stripe error body or a secret in an error message.
    throw new Error(`Stripe TEST orphan expiry failed (HTTP ${response.status}).`);
  }

  const expired = await response.json() as StripeExpiredSession;
  if (!expired || expired.id !== sessionId || expired.livemode !== false ||
      expired.mode !== "payment" || expired.status !== "expired" ||
      expired.payment_status !== "unpaid" ||
      expired.client_reference_id !== reservationId ||
      !expired.metadata || typeof expired.metadata !== "object" ||
      (expired.metadata as Record<string, unknown>).reservation_id !== reservationId) {
    throw new Error("Stripe did not confirm a matching expired/unpaid TEST orphan.");
  }
}

export async function startAttachedStripeTestCalendarCheckout(
  reservation: CalendarReservationSnapshot,
  config: StripeTestCheckoutConfig,
  attach: (
    reservationId: string,
    sessionId: string,
    expiresAtIso: string,
  ) => Promise<AttachedCalendarTestCheckout>,
): Promise<{ id: string; url: string; expiresAtEpochSeconds: number }> {
  const session = await createStripeTestCalendarCheckout(reservation, config);
  try {
    // Attach must atomically verify authorization, HELD status, day ownership,
    // session expiry and idempotency under the private database lock.
    const result = await attach(
      reservation.id,
      session.id,
      new Date(session.expiresAtEpochSeconds * 1000).toISOString(),
    );
    if (result.id !== reservation.id ||
        result.checkout_session_id !== session.id ||
        result.status !== "CHECKOUT_PENDING") {
      throw new Error("Calendar checkout attachment did not reconcile.");
    }
  } catch {
    // Do not leak a usable, unattached checkout URL. A Stripe failure leaves
    // the local HELD reservation to expire normally; never release on a timer
    // or a browser redirect without independently verified Stripe state.
    try {
      await expireOrphanedCalendarTestSession(session.id, reservation.id, config);
    } catch {
      throw new Error(
        "TEST checkout attachment failed and orphan cleanup is unverified; manual review required.",
      );
    }
    throw new Error("TEST checkout attachment failed; Stripe session expired safely.");
  }

  return session;
}
