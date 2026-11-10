import {
  verifyStripeTestCalendarPayment,
  type VerifiedCalendarTestPayment,
} from "./stripe-test-webhook";

/**
 * Server-only boundary between Stripe's signed TEST webhook and the private
 * calendar_private.confirm_test_checkout_paid database transaction.
 *
 * No public route, grants, Stripe keys or database privileges are created
 * here. The caller must supply an authorized, least-privilege direct database
 * callback and send a 2xx response to Stripe only after this resolves.
 * Never settle from a success redirect or a browser-provided event body.
 */
export type CalendarTestPaymentSettlement = {
  reservation_id: string;
  status: "PAID";
  replayed: boolean;
  total_cents: number;
};

export type CalendarTestPaymentConfirmation = {
  reservationId: string;
  status: "PAID";
  replayed: boolean;
  totalCents: number;
};

export type ConfirmCalendarTestPayment = (
  reservationId: string,
  checkoutSessionId: string,
  stripeEventId: string,
  amountCents: number,
) => Promise<CalendarTestPaymentSettlement>;

function assertSettlement(
  settlement: CalendarTestPaymentSettlement,
  proof: VerifiedCalendarTestPayment,
): asserts settlement is CalendarTestPaymentSettlement {
  if (!settlement || settlement.reservation_id !== proof.reservationId ||
      settlement.status !== "PAID" ||
      typeof settlement.replayed !== "boolean" ||
      settlement.total_cents !== proof.totalCents) {
    throw new Error("Stripe TEST settlement result did not reconcile.");
  }
}

export async function settleSignedStripeTestCalendarPayment(
  rawBody: string | Uint8Array,
  signatureHeader: string,
  webhookSecret: string,
  confirm: ConfirmCalendarTestPayment,
  nowEpochSeconds?: number,
): Promise<CalendarTestPaymentConfirmation> {
  // Verify the exact raw body *before* touching the database.
  const proof = verifyStripeTestCalendarPayment(
    rawBody, signatureHeader, webhookSecret, nowEpochSeconds,
  );

  // Only normalized, verified values can reach the privileged transaction.
  // Mask DB error details from the HTTP layer. A thrown error must cause a
  // non-2xx webhook response so Stripe can retry idempotently.
  let settlement: CalendarTestPaymentSettlement;
  try {
    settlement = await confirm(
      proof.reservationId,
      proof.checkoutSessionId,
      proof.stripeEventId,
      proof.totalCents,
    );
  } catch {
    throw new Error("Trusted Stripe TEST settlement failed; event must be retried.");
  }
  assertSettlement(settlement, proof);

  return {
    reservationId: proof.reservationId,
    status: "PAID",
    replayed: settlement.replayed,
    totalCents: proof.totalCents,
  };
}
