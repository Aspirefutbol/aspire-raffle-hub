import "server-only";
import { z } from "zod";
import { calendarTestConfirmationContent } from "./communication-content";
import { settleSignedStripeTestCalendarPayment, type ConfirmCalendarTestPayment } from "./stripe-test-settlement";

const scopeSchema = z.strictObject({ organizationId: z.uuid(), campaignId: z.uuid(), participantId: z.uuid() });
const paidSnapshotSchema = scopeSchema.extend({
  reservationId: z.uuid(),
  mode: z.literal("test"),
  status: z.literal("PAID"),
  currency: z.literal("usd"),
  language: z.enum(["en", "es"]),
  recipient: z.email().max(254),
  organizationName: z.string().min(1).max(120),
  participantDisplayName: z.string().min(1).max(120),
  days: z.array(z.number().int().min(1).max(31)).min(1).max(31),
  multiplier: z.number().int().min(1).max(5),
  baseCents: z.number().int().positive(),
  additionalImpactCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
});

export type CalendarTestEmailIntent = {
  key: string;
  organizationId: string;
  reservationId: string;
  mode: "test";
  recipient: string;
  subject: string;
  text: string;
  html: string;
};
export type CalendarTestNotificationDependencies = {
  confirm: ConfirmCalendarTestPayment;
  // Must read the committed reservation + its payer, not public request fields.
  loadPaidSnapshot: (reservationId: string) => Promise<unknown>;
  // An authorized adapter MUST durably enforce UNIQUE(key) atomically, compare
  // payloads on replay, and return only after commit. No email provider is called here.
  enqueueOnce: (intent: CalendarTestEmailIntent) => Promise<{ key: string; status: "queued" | "already_queued" }>;
};

/**
 * TEST-only integration boundary, not a public endpoint or an email sender.
 * Deployment requires a reviewed DB/outbox adapter and test-recipient sandbox.
 * Retrying after settlement but before enqueue MUST repair the missing intent;
 * never skip notification work merely because settlement.replayed is true.
 */
export async function settleAndQueueCalendarTestConfirmation(
  rawBody: string | Uint8Array,
  signature: string,
  webhookSecret: string,
  expectedScope: z.infer<typeof scopeSchema>,
  dependencies: CalendarTestNotificationDependencies,
  nowEpochSeconds?: number,
) {
  const scope = scopeSchema.parse(expectedScope);
  const confirmation = await settleSignedStripeTestCalendarPayment(
    rawBody, signature, webhookSecret, dependencies.confirm, nowEpochSeconds,
  );
  try {
    const paid = paidSnapshotSchema.parse(await dependencies.loadPaidSnapshot(confirmation.reservationId));
    if (paid.reservationId !== confirmation.reservationId || paid.totalCents !== confirmation.totalCents ||
        paid.organizationId !== scope.organizationId || paid.campaignId !== scope.campaignId ||
        paid.participantId !== scope.participantId) {
      throw new Error("Paid calendar scope or amount mismatch.");
    }
    const content = calendarTestConfirmationContent(paid, paid.language);
    // Stable per reservation, NOT per webhook event, recipient or language.
    const key = `calendar:test:${paid.organizationId}:${paid.reservationId}:donor-confirmation:v1`;
    const result = await dependencies.enqueueOnce({
      key, organizationId: paid.organizationId, reservationId: paid.reservationId,
      mode: "test", recipient: paid.recipient, ...content,
    });
    if (result.key !== key || !["queued", "already_queued"].includes(result.status)) {
      throw new Error("Notification was not durably acknowledged.");
    }
    return { ...confirmation, notification: result.status };
  } catch {
    // Do not leak donor email, names, tokens or DB/provider error details.
    throw new Error("Calendar TEST confirmation was not queued; retry or investigate privately.");
  }
}
