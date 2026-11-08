import "server-only";
import { z } from "zod";
import {
  calendarScopeSchema,
  prepareCalendarDonorConfirmationIntent,
  type CalendarDonorConfirmationIntent,
  type CalendarNotificationOutbox,
} from "./notification-outbox";
import { settleSignedStripeTestCalendarPayment, type ConfirmCalendarTestPayment } from "./stripe-test-settlement";

/** @deprecated Use CalendarDonorConfirmationIntent from ./notification-outbox. */
export type CalendarTestEmailIntent = CalendarDonorConfirmationIntent;
export type CalendarTestNotificationDependencies = {
  confirm: ConfirmCalendarTestPayment;
  // Must read the committed reservation + its payer, not public request fields.
  loadPaidSnapshot: (reservationId: string) => Promise<unknown>;
  // Must satisfy the CalendarNotificationOutbox contract: durable atomic
  // UNIQUE(key), full payload comparison on replay, return only after commit.
  // No email provider is called here.
  enqueueOnce: CalendarNotificationOutbox["enqueueOnce"];
};

/**
 * TEST-only integration boundary, not a public endpoint or an email sender.
 * Deployment requires a reviewed DB/outbox adapter and test-recipient sandbox.
 * Retrying after settlement but before enqueue MUST repair the missing intent;
 * never skip notification work merely because settlement.replayed is true.
 * The recovery sweep (sweepMissingCalendarDonorConfirmations) uses the same
 * intent preparation, key and payload-consistency rules as this path.
 */
export async function settleAndQueueCalendarTestConfirmation(
  rawBody: string | Uint8Array,
  signature: string,
  webhookSecret: string,
  expectedScope: z.infer<typeof calendarScopeSchema>,
  dependencies: CalendarTestNotificationDependencies,
  nowEpochSeconds?: number,
) {
  const scope = calendarScopeSchema.parse(expectedScope);
  const confirmation = await settleSignedStripeTestCalendarPayment(
    rawBody, signature, webhookSecret, dependencies.confirm, nowEpochSeconds,
  );
  try {
    // Stable per reservation, NOT per webhook event, recipient, language or template version.
    const intent = prepareCalendarDonorConfirmationIntent(
      await dependencies.loadPaidSnapshot(confirmation.reservationId),
      { ...scope, reservationId: confirmation.reservationId, totalCents: confirmation.totalCents },
    );
    const result = await dependencies.enqueueOnce(intent);
    if (result.key !== intent.key || !["queued", "already_queued"].includes(result.status)) {
      throw new Error("Notification was not durably acknowledged.");
    }
    return { ...confirmation, notification: result.status };
  } catch {
    // Do not leak donor email, names, tokens or DB/provider error details.
    throw new Error("Calendar TEST confirmation was not queued; retry or investigate privately.");
  }
}
