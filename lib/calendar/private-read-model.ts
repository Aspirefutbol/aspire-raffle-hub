import { z } from "zod";
import { allCalendarDays, calendarSelectionTotalCents } from "./pricing";

/**
 * Server-only adapter for the two private, adult-scoped SQL read models.
 *
 * The trusted caller must derive the scope from an authenticated adult account
 * and call calendar_private.read_paid_progress / read_inventory with that scope
 * through an approved direct connection. Do not expose those functions to
 * PostgREST or treat this parser as authentication, authorization, or a grant.
 *
 * Both responses should be read in one consistent database snapshot. A
 * concurrent change between reads fails closed here instead of displaying
 * misleading availability or totals. No supporter PII is accepted.
 */
const uuid = z.string().uuid();
const days = z.array(z.number().int().min(1).max(31)).max(31)
  .refine(values => new Set(values).size === values.length, "Duplicate calendar day.");
const cents = z.number().int().min(0).max(248000);

const paidProgress = z.strictObject({
  participant_id: uuid,
  campaign_id: uuid,
  paid_days: days,
  sponsor_count: z.number().int().min(0).max(31),
  base_cents: cents,
  additional_impact_cents: cents,
  total_cents: cents,
});

const inventory = z.strictObject({
  participant_id: uuid,
  campaign_id: uuid,
  paid_days: days,
  checkout_pending_days: days,
  held_days: days,
  refunded_days: days,
  unavailable_days: days,
});

export type TrustedCalendarReadScope = {
  organizationId: string;
  campaignId: string;
  participantId: string;
};

export type CalendarDayState =
  | "PAID" | "CHECKOUT_PENDING" | "HELD" | "REFUNDED" | "AVAILABLE";

function invalid(): never {
  // Do not include incoming private database payloads in server error logs.
  throw new Error("Private calendar read models did not reconcile.");
}

export function parsePrivateCalendarReadModels(
  scope: TrustedCalendarReadScope,
  progressInput: unknown,
  inventoryInput: unknown,
) {
  // Validate scope supplied by a trusted server, never by the browser.
  if (!uuid.safeParse(scope.organizationId).success ||
      !uuid.safeParse(scope.campaignId).success ||
      !uuid.safeParse(scope.participantId).success) invalid();

  const p = paidProgress.safeParse(progressInput);
  const i = inventory.safeParse(inventoryInput);
  if (!p.success || !i.success) invalid();
  const progress = p.data;
  const snapshot = i.data;

  if (progress.campaign_id !== scope.campaignId ||
      snapshot.campaign_id !== scope.campaignId ||
      progress.participant_id !== scope.participantId ||
      snapshot.participant_id !== scope.participantId) invalid();

  const paidSet = new Set(progress.paid_days);
  if (paidSet.size !== snapshot.paid_days.length ||
      snapshot.paid_days.some(day => !paidSet.has(day))) invalid();

  // The AFC blueprint prices each paid day once, regardless of its 1x–5x
  // multiplier. Extra impact is kept separate and never grants extra days.
  const actualBase = calendarSelectionTotalCents(progress.paid_days);
  if (actualBase !== progress.base_cents ||
      progress.additional_impact_cents > progress.base_cents * 4 ||
      progress.additional_impact_cents % 100 !== 0 ||
      progress.total_cents !== progress.base_cents + progress.additional_impact_cents ||
      (paidSet.size === 0 && progress.sponsor_count !== 0) ||
      (paidSet.size > 0 &&
        (progress.sponsor_count < 1 || progress.sponsor_count > paidSet.size))) invalid();

  const states = new Map<number, CalendarDayState>();
  const occupied: [CalendarDayState, number[]][] = [
    ["PAID", snapshot.paid_days],
    ["CHECKOUT_PENDING", snapshot.checkout_pending_days],
    ["HELD", snapshot.held_days],
    ["REFUNDED", snapshot.refunded_days],
  ];
  for (const [state, numbers] of occupied) {
    for (const day of numbers) {
      if (states.has(day)) invalid();
      states.set(day, state);
    }
  }
  const unavailable = new Set(snapshot.unavailable_days);
  if (unavailable.size !== states.size ||
      [...unavailable].some(day => !states.has(day))) invalid();

  const daysByState = allCalendarDays().map(day => ({
    day,
    state: states.get(day) ?? "AVAILABLE",
  }));
  return {
    campaignId: scope.campaignId,
    participantId: scope.participantId,
    sponsorCount: progress.sponsor_count,
    // Distinct verified-PAID days are the only source of sponsored progress.
    // HELD, CHECKOUT_PENDING and REFUNDED days never count as sponsored.
    sponsoredDayCount: paidSet.size,
    calendarComplete: paidSet.size === 31,
    dayCompletionPercent: (paidSet.size / 31) * 100,
    paidDays: [...paidSet].sort((a, b) => a - b),
    baseCents: progress.base_cents,
    additionalImpactCents: progress.additional_impact_cents,
    totalCents: progress.total_cents,
    dayStates: daysByState,
    availableCount: daysByState.filter(entry => entry.state === "AVAILABLE").length,
  };
}
