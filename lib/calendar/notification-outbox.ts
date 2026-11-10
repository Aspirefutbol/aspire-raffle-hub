import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { calendarTestConfirmationContent } from "./communication-content";

/*
 * Calendar donor-confirmation OUTBOX CONTRACT (TEST mode only).
 *
 * This module defines what a durable outbox must guarantee. It contains no
 * database access, no route, no email provider and sends nothing. The in-memory
 * adapter at the bottom is a TEST-ONLY reference used to exercise the contract;
 * passing its tests proves the contract's rules, NOT durable storage and NOT
 * exactly-once email delivery. A durable implementation (Batch 2) must enforce
 * the same rules atomically in Postgres, and the delivery boundary still needs
 * the duplicate safeguards described on `CalendarOutboxPolicy`.
 *
 * Definitions:
 * - SENT means the provider ACCEPTED the message for delivery and returned a
 *   message id. It is not evidence that the message reached the donor's inbox;
 *   bounces/complaints are later, separately recorded provider events.
 * - An expired lease, timeout or network error is an UNKNOWN outcome, never
 *   "not sent". It may be retried only while the provider's documented
 *   idempotency window still covers the attempt epoch; otherwise the intent is
 *   held in DELIVERY_UNCERTAIN for reconciliation/manual review.
 */

// ---------------------------------------------------------------------------
// Keys and template versions
// ---------------------------------------------------------------------------

/**
 * Template version of the rendered confirmation wording. Bump this whenever
 * `calendarTestConfirmationContent` output changes. It is stored on the intent
 * and is deliberately NOT part of the notification key: re-preparing an
 * already-queued reservation after a wording change resolves to the ORIGINAL
 * intent (status `already_queued`, original content kept) and never creates a
 * second confirmation for the same payment.
 */
export const CALENDAR_DONOR_CONFIRMATION_TEMPLATE_VERSION = "calendar-donor-confirmation/2026-11-07.1";

const uuid = z.uuid();

/**
 * Reservation-scoped key — stable across Stripe events, retries, sweeps,
 * recipients, languages and template versions. The trailing `v1` names the
 * notification PURPOSE, not the wording; never bump it to change copy.
 */
export function calendarDonorConfirmationKey(organizationId: string, reservationId: string) {
  if (!uuid.safeParse(organizationId).success || !uuid.safeParse(reservationId).success) {
    throw new CalendarOutboxError("INVALID_INTENT");
  }
  return `calendar:test:${organizationId}:${reservationId}:donor-confirmation:v1`;
}

/**
 * Key sent to the provider as its idempotency key. It changes only when a
 * reviewer explicitly re-arms an uncertain intent (new epoch), so automatic
 * retries inside one epoch are deduplicated by a provider that honors it.
 * Hashed so organization/reservation ids are not handed to the provider.
 */
export function calendarProviderIdempotencyKey(key: string, epoch: number) {
  return `afc-cal-${createHash("sha256").update(`${key}#epoch-${epoch}`).digest("hex").slice(0, 48)}`;
}

// ---------------------------------------------------------------------------
// Privacy-safe errors
// ---------------------------------------------------------------------------

const ERROR_MESSAGES = {
  INVALID_INTENT: "Calendar notification intent is invalid.",
  INVALID_PAID_RECORD: "Calendar paid record is not a valid committed PAID record.",
  SCOPE_MISMATCH: "Calendar paid record does not match the expected scope or amount.",
  PAYLOAD_CONFLICT: "A different notification already exists for this key.",
  NOT_FOUND: "Calendar notification intent was not found.",
  STALE_LEASE: "Calendar notification lease is not current.",
  INVALID_TRANSITION: "Calendar notification transition is not permitted.",
  INVALID_POLICY: "Calendar notification policy is invalid.",
  TEST_ONLY_ADAPTER: "The in-memory calendar outbox is test-only.",
} as const;
export type CalendarOutboxErrorCode = keyof typeof ERROR_MESSAGES;

/** Fixed messages only: never donor email, names, payload contents or provider text. */
export class CalendarOutboxError extends Error {
  readonly code: CalendarOutboxErrorCode;
  constructor(code: CalendarOutboxErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "CalendarOutboxError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Trusted PAID record -> immutable intent (shared by normal path and sweep)
// ---------------------------------------------------------------------------

export const calendarScopeSchema = z.strictObject({
  organizationId: z.uuid(), campaignId: z.uuid(), participantId: z.uuid(),
});
export const calendarPaidSnapshotSchema = calendarScopeSchema.extend({
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

export type CalendarDonorConfirmationIntent = Readonly<{
  key: string;
  kind: "calendar_donor_confirmation";
  mode: "test";
  organizationId: string;
  campaignId: string;
  participantId: string;
  reservationId: string;
  recipient: string;
  language: "en" | "es";
  facts: Readonly<{
    currency: "usd"; days: readonly number[]; multiplier: number;
    baseCents: number; additionalImpactCents: number; totalCents: number;
  }>;
  templateVersion: string;
  subject: string;
  text: string;
  html: string;
  /** SHA-256 over every delivery-critical fact (scope, recipient, language, amounts...). */
  factsDigest: string;
  /** SHA-256 over template version + rendered subject/text/html. */
  contentDigest: string;
}>;

export type CalendarExpectedPaidScope = z.infer<typeof calendarScopeSchema> & {
  reservationId: string;
  /** When known (e.g. from the verified settlement), the paid total must match exactly. */
  totalCents?: number;
};

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Explicit field order keeps the digest canonical.
function factsDigestOf(i: Omit<CalendarDonorConfirmationIntent, "factsDigest" | "contentDigest">) {
  return sha256([
    i.key, i.kind, i.mode, i.organizationId, i.campaignId, i.participantId, i.reservationId,
    i.recipient, i.language, i.facts.currency, [...i.facts.days], i.facts.multiplier,
    i.facts.baseCents, i.facts.additionalImpactCents, i.facts.totalCents,
  ]);
}
function contentDigestOf(i: Pick<CalendarDonorConfirmationIntent, "templateVersion" | "subject" | "text" | "html">) {
  return sha256([i.templateVersion, i.subject, i.text, i.html]);
}

/**
 * The ONLY way to build a donor-confirmation intent. `rawSnapshot` must come
 * from a trusted loader that re-reads the committed reservation and payer; an
 * arbitrary object labelled PAID is re-validated and rejected if anything is
 * off (state, mode, scope, amount reconciliation, extra private fields).
 */
export function prepareCalendarDonorConfirmationIntent(
  rawSnapshot: unknown,
  expected: CalendarExpectedPaidScope,
): CalendarDonorConfirmationIntent {
  const parsed = calendarPaidSnapshotSchema.safeParse(rawSnapshot);
  if (!parsed.success) throw new CalendarOutboxError("INVALID_PAID_RECORD");
  const paid = parsed.data;
  if (paid.organizationId !== expected.organizationId || paid.campaignId !== expected.campaignId ||
      paid.participantId !== expected.participantId || paid.reservationId !== expected.reservationId ||
      (expected.totalCents !== undefined && paid.totalCents !== expected.totalCents)) {
    throw new CalendarOutboxError("SCOPE_MISMATCH");
  }
  let content: { subject: string; text: string; html: string };
  try {
    // Also reconciles day prices x multiplier against base/additional/total.
    content = calendarTestConfirmationContent(paid, paid.language);
  } catch {
    throw new CalendarOutboxError("INVALID_PAID_RECORD");
  }
  const base = {
    key: calendarDonorConfirmationKey(paid.organizationId, paid.reservationId),
    kind: "calendar_donor_confirmation" as const,
    mode: "test" as const,
    organizationId: paid.organizationId,
    campaignId: paid.campaignId,
    participantId: paid.participantId,
    reservationId: paid.reservationId,
    recipient: paid.recipient,
    language: paid.language,
    facts: Object.freeze({
      currency: paid.currency,
      days: Object.freeze([...paid.days].sort((a, b) => a - b)),
      multiplier: paid.multiplier,
      baseCents: paid.baseCents,
      additionalImpactCents: paid.additionalImpactCents,
      totalCents: paid.totalCents,
    }),
    templateVersion: CALENDAR_DONOR_CONFIRMATION_TEMPLATE_VERSION,
    subject: content.subject,
    text: content.text,
    html: content.html,
  };
  return Object.freeze({ ...base, factsDigest: factsDigestOf(base), contentDigest: contentDigestOf(base) });
}

const intentShapeSchema = z.strictObject({
  key: z.string().min(1).max(200),
  kind: z.literal("calendar_donor_confirmation"),
  mode: z.literal("test"),
  organizationId: z.uuid(), campaignId: z.uuid(), participantId: z.uuid(), reservationId: z.uuid(),
  recipient: z.email().max(254),
  language: z.enum(["en", "es"]),
  facts: z.strictObject({
    currency: z.literal("usd"),
    days: z.array(z.number().int().min(1).max(31)).min(1).max(31),
    multiplier: z.number().int().min(1).max(5),
    baseCents: z.number().int().positive(),
    additionalImpactCents: z.number().int().nonnegative(),
    totalCents: z.number().int().positive(),
  }),
  templateVersion: z.string().min(1).max(100),
  subject: z.string().min(1).max(300),
  text: z.string().min(1).max(20_000),
  html: z.string().min(1).max(100_000),
  factsDigest: z.string().regex(/^[a-f0-9]{64}$/),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * Adapters MUST call this before storing: digests are recomputed, never
 * trusted, and the key must be the canonical key for the intent's scope.
 */
export function assertCalendarIntentIntegrity(intent: unknown): CalendarDonorConfirmationIntent {
  const parsed = intentShapeSchema.safeParse(intent);
  if (!parsed.success) throw new CalendarOutboxError("INVALID_INTENT");
  const i = parsed.data;
  if (i.key !== calendarDonorConfirmationKey(i.organizationId, i.reservationId) ||
      i.factsDigest !== factsDigestOf(i) || i.contentDigest !== contentDigestOf(i)) {
    throw new CalendarOutboxError("INVALID_INTENT");
  }
  return i;
}

export type CalendarIntentComparison = "identical" | "template_superseded" | "conflict";

/**
 * Replay rule for an existing key (the stored intent is immutable and wins):
 * - any delivery-critical fact differs (scope, recipient, language, days,
 *   multiplier, amounts) -> `conflict`: fail safely, never overwrite, never send twice;
 * - facts equal, template version differs -> `template_superseded`: treat as
 *   already queued and KEEP the original content;
 * - facts and template version equal but rendered content differs -> `conflict`
 *   (non-deterministic rendering is a defect, not a reason for a second message).
 */
export function compareCalendarIntents(
  existing: CalendarDonorConfirmationIntent,
  incoming: CalendarDonorConfirmationIntent,
): CalendarIntentComparison {
  if (existing.key !== incoming.key || existing.factsDigest !== incoming.factsDigest) return "conflict";
  if (existing.templateVersion !== incoming.templateVersion) return "template_superseded";
  return existing.contentDigest === incoming.contentDigest ? "identical" : "conflict";
}

// ---------------------------------------------------------------------------
// Delivery state machine
// ---------------------------------------------------------------------------

export const CALENDAR_OUTBOX_STATES = ["PENDING", "SENDING", "SENT", "DELIVERY_UNCERTAIN", "DEAD_LETTER"] as const;
export type CalendarOutboxState = (typeof CALENDAR_OUTBOX_STATES)[number];

/**
 * SENT and DEAD_LETTER are terminal. DELIVERY_UNCERTAIN exits only by manual
 * resolution. The contract RECORDS the reviewer id it is given; it does NOT
 * authorize that reviewer. A durable adapter must derive the reviewer from
 * the authenticated session (never a caller-supplied string) and check a
 * specific review permission for that organization before resolving.
 */
export const CALENDAR_OUTBOX_TERMINAL_STATES: readonly CalendarOutboxState[] = ["SENT", "DEAD_LETTER"];
export const CALENDAR_OUTBOX_TRANSITIONS: Readonly<Record<CalendarOutboxState, readonly CalendarOutboxState[]>> = {
  // PENDING -> DELIVERY_UNCERTAIN happens at CLAIM time when a retry after an
  // unknown outcome is no longer safe (window elapsed or provider changed).
  PENDING: ["SENDING", "DELIVERY_UNCERTAIN"],
  SENDING: ["SENT", "PENDING", "DELIVERY_UNCERTAIN", "DEAD_LETTER"],
  DELIVERY_UNCERTAIN: ["SENT", "PENDING", "DEAD_LETTER"],
  SENT: [],
  DEAD_LETTER: [],
};

export type CalendarOutboxPolicy = Readonly<{
  /** Automatic attempts per idempotency epoch (1-10). */
  maxAttempts: number;
  /** Claim lease duration. Expiry is an UNKNOWN outcome, not "not sent". */
  leaseMs: number;
  /** Retry delay = min(retryCapMs, retryBaseMs * 2^(attempt-1)); deterministic, no jitter. */
  retryBaseMs: number;
  retryCapMs: number;
  /**
   * The selected provider's DOCUMENTED idempotency-key retention. 0 = no
   * guarantee, so every unknown outcome goes straight to DELIVERY_UNCERTAIN.
   * Never assume indefinite deduplication. No provider is selected here.
   */
  providerIdempotencyWindowMs: number;
  /**
   * Safety margin before the window closes. Checked twice: when a retry is
   * scheduled (nextAttemptAt + margin) and again when it is claimed
   * (now + leaseMs + margin), so a late worker cannot send outside the window.
   * The window is anchored to the FIRST attempt of the epoch; repeated
   * timeouts never extend it.
   */
  idempotencySafetyMarginMs: number;
}>;

export function validateCalendarOutboxPolicy(policy: CalendarOutboxPolicy): CalendarOutboxPolicy {
  const ok = Number.isInteger(policy.maxAttempts) && policy.maxAttempts >= 1 && policy.maxAttempts <= 10 &&
    Number.isInteger(policy.leaseMs) && policy.leaseMs >= 5_000 && policy.leaseMs <= 15 * 60_000 &&
    Number.isInteger(policy.retryBaseMs) && policy.retryBaseMs > 0 &&
    Number.isInteger(policy.retryCapMs) && policy.retryCapMs >= policy.retryBaseMs &&
    Number.isInteger(policy.providerIdempotencyWindowMs) && policy.providerIdempotencyWindowMs >= 0 &&
    Number.isInteger(policy.idempotencySafetyMarginMs) && policy.idempotencySafetyMarginMs >= 0;
  if (!ok) throw new CalendarOutboxError("INVALID_POLICY");
  return Object.freeze({ ...policy });
}

export function calendarRetryDelayMs(attempt: number, policy: CalendarOutboxPolicy) {
  return Math.min(policy.retryCapMs, policy.retryBaseMs * 2 ** Math.max(0, attempt - 1));
}

const SAFE_CODE = /^[a-z0-9_.-]{1,64}$/;
const SAFE_ID = /^[A-Za-z0-9._:@<>+-]{1,256}$/;
/** Provider/operator detail is reduced to a short allowlisted code. */
const safeCode = (code: string | undefined) => (code && SAFE_CODE.test(code) ? code : "unspecified");

export type CalendarDeliveryOutcome =
  | { type: "accepted"; providerMessageId: string }
  /** Provider definitively did NOT accept (e.g. validation, suppressed recipient). */
  | { type: "rejected_permanent"; code?: string }
  /** Provider definitively did NOT accept but may later (e.g. rate limited before acceptance). */
  | { type: "rejected_retryable"; code?: string }
  /** Timeout, network error or ambiguous response: the message MAY have been accepted. */
  | { type: "unknown"; code?: string };

export type CalendarManualResolution =
  | { resolution: "provider_confirmed_accepted"; providerMessageId: string }
  /** Starts a NEW idempotency epoch: the reviewer accepts the duplicate risk on record. */
  | { resolution: "provider_confirmed_not_accepted" }
  | { resolution: "abandon" };

export type CalendarAttemptRecord = Readonly<{
  epoch: number; attempt: number; workerId: string; leaseId: string;
  startedAt: number; endedAt: number | null; outcome: string | null;
}>;

/** Contains no donor data except via `intent`, which adapters must keep private. */
export type CalendarOutboxRecord = Readonly<{
  intent: CalendarDonorConfirmationIntent;
  state: CalendarOutboxState;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number | null;
  lease: Readonly<{ leaseId: string; workerId: string; expiresAt: number }> | null;
  epoch: number;
  epochStartedAt: number | null;
  epochAttempts: number;
  /** True once any attempt in this epoch ended UNKNOWN (the message may have been accepted). */
  epochUnknownOutcome: boolean;
  /** Provider account bound to the epoch; a retry after an unknown outcome must use the same one. */
  epochProviderAccountId: string | null;
  totalAttempts: number;
  history: readonly CalendarAttemptRecord[];
  resolutions: readonly Readonly<{ at: number; reviewerId: string; resolution: CalendarManualResolution["resolution"] }>[];
  providerMessageId: string | null;
  sentAt: number | null;
  holdReason: string | null;
}>;

export type CalendarOutboxEvent =
  | { type: "claim"; workerId: string; leaseId: string; providerAccountId: string; now: number }
  | { type: "ack"; leaseId: string; outcome: CalendarDeliveryOutcome; now: number }
  | { type: "lease_expired"; now: number }
  | ({ type: "manual_resolution"; reviewerId: string; now: number } & CalendarManualResolution);

export function newCalendarOutboxRecord(intent: CalendarDonorConfirmationIntent, now: number): CalendarOutboxRecord {
  return Object.freeze({
    intent, state: "PENDING", createdAt: now, updatedAt: now, nextAttemptAt: now, lease: null,
    epoch: 1, epochStartedAt: null, epochAttempts: 0, epochUnknownOutcome: false, epochProviderAccountId: null, totalAttempts: 0, history: [], resolutions: [],
    providerMessageId: null, sentAt: null, holdReason: null,
  });
}

function closeAttempt(record: CalendarOutboxRecord, now: number, outcome: string) {
  const history = [...record.history];
  const last = history.at(-1);
  if (last && last.endedAt === null) history[history.length - 1] = Object.freeze({ ...last, endedAt: now, outcome });
  return history;
}

function move(record: CalendarOutboxRecord, next: Partial<CalendarOutboxRecord> & { state: CalendarOutboxState }, now: number) {
  if (!CALENDAR_OUTBOX_TRANSITIONS[record.state].includes(next.state)) throw new CalendarOutboxError("INVALID_TRANSITION");
  return Object.freeze({ ...record, ...next, updatedAt: now });
}

function afterUnknown(record: CalendarOutboxRecord, now: number, policy: CalendarOutboxPolicy, outcome: string) {
  const history = closeAttempt(record, now, outcome);
  const base = { lease: null, history, epochUnknownOutcome: true };
  const hold = (holdReason: string) => move(record, { ...base, state: "DELIVERY_UNCERTAIN", nextAttemptAt: null, holdReason }, now);
  if (policy.providerIdempotencyWindowMs === 0) return hold("no_provider_idempotency");
  if (record.epochAttempts >= policy.maxAttempts) return hold("unknown_outcome_attempts_exhausted");
  const nextAttemptAt = now + calendarRetryDelayMs(record.epochAttempts, policy);
  const windowCloses = (record.epochStartedAt ?? now) + policy.providerIdempotencyWindowMs;
  if (nextAttemptAt + policy.idempotencySafetyMarginMs > windowCloses) return hold("unknown_outcome_outside_idempotency_window");
  return move(record, { ...base, state: "PENDING", nextAttemptAt, holdReason: null }, now);
}

/**
 * Pure transition function. A durable adapter applies it inside one
 * transaction with a row lock (or equivalent compare-and-set on state+leaseId).
 */
export function applyCalendarOutboxTransition(
  record: CalendarOutboxRecord,
  event: CalendarOutboxEvent,
  policy: CalendarOutboxPolicy,
): CalendarOutboxRecord {
  const now = event.now;
  if (!Number.isInteger(now) || now < 0) throw new CalendarOutboxError("INVALID_TRANSITION");
  switch (event.type) {
    case "claim": {
      if (record.state !== "PENDING" || record.nextAttemptAt === null || record.nextAttemptAt > now ||
          !SAFE_ID.test(event.workerId) || !SAFE_ID.test(event.leaseId) || !SAFE_ID.test(event.providerAccountId)) {
        throw new CalendarOutboxError("INVALID_TRANSITION");
      }
      // Claim-time recheck: scheduling-time checks are not enough, because a
      // worker may claim long after nextAttemptAt.
      if (record.epochUnknownOutcome) {
        const hold = (holdReason: string) => move(record, { state: "DELIVERY_UNCERTAIN", nextAttemptAt: null, holdReason }, now);
        const windowCloses = (record.epochStartedAt ?? now) + policy.providerIdempotencyWindowMs;
        if (policy.providerIdempotencyWindowMs === 0 || now + policy.leaseMs + policy.idempotencySafetyMarginMs > windowCloses) {
          return hold("idempotency_window_elapsed_before_retry");
        }
        if (record.epochProviderAccountId !== event.providerAccountId) return hold("provider_changed_after_unknown_outcome");
      }
      const epochAttempts = record.epochAttempts + 1;
      return move(record, {
        state: "SENDING",
        nextAttemptAt: null,
        lease: Object.freeze({ leaseId: event.leaseId, workerId: event.workerId, expiresAt: now + policy.leaseMs }),
        epochStartedAt: record.epochStartedAt ?? now,
        epochAttempts,
        epochProviderAccountId: event.providerAccountId,
        totalAttempts: record.totalAttempts + 1,
        history: [...record.history, Object.freeze({
          epoch: record.epoch, attempt: epochAttempts, workerId: event.workerId, leaseId: event.leaseId,
          startedAt: now, endedAt: null, outcome: null,
        })],
      }, now);
    }
    case "ack": {
      // Fencing: only the holder of the CURRENT lease may report an outcome.
      if (record.state !== "SENDING" || record.lease?.leaseId !== event.leaseId) {
        throw new CalendarOutboxError("STALE_LEASE");
      }
      const outcome = event.outcome;
      switch (outcome.type) {
        case "accepted":
          if (!SAFE_ID.test(outcome.providerMessageId)) throw new CalendarOutboxError("INVALID_TRANSITION");
          return move(record, {
            state: "SENT", lease: null, nextAttemptAt: null, holdReason: null,
            providerMessageId: outcome.providerMessageId, sentAt: now, history: closeAttempt(record, now, "accepted"),
          }, now);
        case "rejected_permanent":
          return move(record, {
            state: "DEAD_LETTER", lease: null, nextAttemptAt: null, holdReason: `rejected_permanent:${safeCode(outcome.code)}`,
            history: closeAttempt(record, now, "rejected_permanent"),
          }, now);
        case "rejected_retryable": {
          const history = closeAttempt(record, now, "rejected_retryable");
          if (record.epochAttempts >= policy.maxAttempts) {
            return move(record, { state: "DEAD_LETTER", lease: null, nextAttemptAt: null, holdReason: "retry_exhausted", history }, now);
          }
          return move(record, {
            state: "PENDING", lease: null, holdReason: null, history,
            nextAttemptAt: now + calendarRetryDelayMs(record.epochAttempts, policy),
          }, now);
        }
        case "unknown":
          return afterUnknown(record, now, policy, "unknown");
        default:
          throw new CalendarOutboxError("INVALID_TRANSITION");
      }
    }
    case "lease_expired": {
      if (record.state !== "SENDING" || !record.lease || record.lease.expiresAt > now) {
        throw new CalendarOutboxError("INVALID_TRANSITION");
      }
      return afterUnknown(record, now, policy, "lease_expired");
    }
    case "manual_resolution": {
      if (record.state !== "DELIVERY_UNCERTAIN" || !SAFE_ID.test(event.reviewerId)) {
        throw new CalendarOutboxError("INVALID_TRANSITION");
      }
      const resolutions = [...record.resolutions, Object.freeze({ at: now, reviewerId: event.reviewerId, resolution: event.resolution })];
      switch (event.resolution) {
        case "provider_confirmed_accepted":
          if (!SAFE_ID.test(event.providerMessageId)) throw new CalendarOutboxError("INVALID_TRANSITION");
          return move(record, {
            state: "SENT", resolutions, holdReason: null, providerMessageId: event.providerMessageId, sentAt: now,
          }, now);
        case "provider_confirmed_not_accepted":
          return move(record, {
            state: "PENDING", resolutions, holdReason: null, nextAttemptAt: now,
            epoch: record.epoch + 1, epochStartedAt: null, epochAttempts: 0,
            epochUnknownOutcome: false, epochProviderAccountId: null,
          }, now);
        case "abandon":
          return move(record, { state: "DEAD_LETTER", resolutions, holdReason: "abandoned_after_review" }, now);
        default:
          throw new CalendarOutboxError("INVALID_TRANSITION");
      }
    }
    default:
      throw new CalendarOutboxError("INVALID_TRANSITION");
  }
}

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

export type CalendarEnqueueResult = { key: string; status: "queued" | "already_queued" };

export type CalendarDeliveryClaim = Readonly<{
  key: string;
  leaseId: string;
  leaseExpiresAt: number;
  epoch: number;
  attempt: number;
  /** Must be sent as the provider's idempotency key on every attempt in this epoch. */
  providerIdempotencyKey: string;
  delivery: Readonly<{ recipient: string; subject: string; text: string; html: string }>;
}>;

/** Donor-free view for operators, health checks and tests. */
export type CalendarOutboxStatus = Readonly<{
  key: string; state: CalendarOutboxState; epoch: number; epochAttempts: number; totalAttempts: number;
  nextAttemptAt: number | null; holdReason: string | null; templateVersion: string;
}>;

/**
 * What a durable outbox MUST provide (Batch 2 implements this in Postgres):
 * 1. enqueueOnce: atomic insert on UNIQUE(key) after `assertCalendarIntentIntegrity`;
 *    on conflict, `compareCalendarIntents` against the stored row: identical or
 *    template_superseded -> `already_queued`; conflict -> PAYLOAD_CONFLICT, no write.
 *    Returns only after commit.
 * 2. claimNext: atomic claim (e.g. FOR UPDATE SKIP LOCKED) of one eligible PENDING
 *    row, issuing a fresh unguessable lease id, re-checking the idempotency
 *    window and provider binding at claim time (rows that fail move to
 *    DELIVERY_UNCERTAIN and are not returned). Never claims SENDING rows.
 *    The delivery payload is always the STORED intent, never re-rendered.
 * 3. acknowledge: compare-and-set on (key, state=SENDING, leaseId); otherwise STALE_LEASE.
 * 4. expireLeases: moves SENDING rows past their lease through `lease_expired`
 *    (unknown outcome); never directly back to "not sent".
 * 5. resolveUncertain: DELIVERY_UNCERTAIN only. The adapter must AUTHORIZE the
 *    reviewer (session-derived identity + review permission for the org);
 *    the reviewer id parameter here is only what gets recorded.
 * Errors carry only CalendarOutboxError codes.
 */
export interface CalendarNotificationOutbox {
  enqueueOnce(intent: CalendarDonorConfirmationIntent, options?: { now?: number }): Promise<CalendarEnqueueResult>;
  /**
   * `providerAccountId` identifies the provider and sending account the worker
   * will use. After an unknown outcome, only the same account may retry in
   * that epoch; delivery payload always comes from the stored intent.
   */
  claimNext(input: { workerId: string; providerAccountId: string; now: number }): Promise<CalendarDeliveryClaim | null>;
  acknowledge(input: { key: string; leaseId: string; outcome: CalendarDeliveryOutcome; now: number }): Promise<CalendarOutboxStatus>;
  expireLeases(input: { now: number }): Promise<{ requeued: number; uncertain: number }>;
  resolveUncertain(input: { key: string; reviewerId: string; now: number } & CalendarManualResolution): Promise<CalendarOutboxStatus>;
  status(key: string): Promise<CalendarOutboxStatus | null>;
}

function statusOf(record: CalendarOutboxRecord): CalendarOutboxStatus {
  return Object.freeze({
    key: record.intent.key, state: record.state, epoch: record.epoch, epochAttempts: record.epochAttempts,
    totalAttempts: record.totalAttempts, nextAttemptAt: record.nextAttemptAt, holdReason: record.holdReason,
    templateVersion: record.intent.templateVersion,
  });
}

// ---------------------------------------------------------------------------
// Recovery sweep (same trusted path, same key, same consistency rules)
// ---------------------------------------------------------------------------

const candidateSchema = calendarScopeSchema.extend({ reservationId: z.uuid() });

export type CalendarRecoverySweepDependencies = {
  /**
   * Trusted server-side source of PAID reservations that may lack an intent.
   * Candidates are only hints: every one is reloaded and revalidated.
   */
  listPaidCandidates: (input: { organizationId: string; limit: number }) => Promise<unknown[]>;
  /** The same committed PAID-record loader used by the settlement path. */
  loadPaidSnapshot: (reservationId: string) => Promise<unknown>;
  enqueueOnce: CalendarNotificationOutbox["enqueueOnce"];
};

export type CalendarSweepSkipReason =
  | "invalid_candidate" | "wrong_tenant" | "load_failed" | "invalid_paid_record"
  | "scope_mismatch" | "payload_conflict" | "enqueue_failed";

export type CalendarRecoverySweepReport = {
  examined: number;
  queued: number;
  alreadyQueued: number;
  /** Reservation ids only (null for malformed candidates); never donor data or error text. */
  skipped: { reservationId: string | null; reason: CalendarSweepSkipReason }[];
};

/**
 * Enqueues missing donor confirmations for one organization. It only reads
 * (through the injected trusted loader) and enqueues; it never writes payment,
 * reservation or calendar records. Repeated or overlapping sweeps are safe
 * because enqueueOnce is keyed per reservation.
 */
export async function sweepMissingCalendarDonorConfirmations(
  dependencies: CalendarRecoverySweepDependencies,
  input: { organizationId: string; limit?: number; now?: number },
): Promise<CalendarRecoverySweepReport> {
  const organizationId = uuid.safeParse(input.organizationId);
  const limit = input.limit ?? 100;
  if (!organizationId.success || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new CalendarOutboxError("INVALID_INTENT");
  }
  const report: CalendarRecoverySweepReport = { examined: 0, queued: 0, alreadyQueued: 0, skipped: [] };
  const raw = await dependencies.listPaidCandidates({ organizationId: organizationId.data, limit });
  const seen = new Set<string>();
  for (const value of (Array.isArray(raw) ? raw : []).slice(0, limit)) {
    report.examined += 1;
    const candidate = candidateSchema.safeParse(value);
    if (!candidate.success) { report.skipped.push({ reservationId: null, reason: "invalid_candidate" }); continue; }
    const c = candidate.data;
    if (c.organizationId !== organizationId.data) { report.skipped.push({ reservationId: c.reservationId, reason: "wrong_tenant" }); continue; }
    if (seen.has(c.reservationId)) continue;
    seen.add(c.reservationId);
    let snapshot: unknown;
    try { snapshot = await dependencies.loadPaidSnapshot(c.reservationId); }
    catch { report.skipped.push({ reservationId: c.reservationId, reason: "load_failed" }); continue; }
    let intent: CalendarDonorConfirmationIntent;
    try { intent = prepareCalendarDonorConfirmationIntent(snapshot, c); }
    catch (error) {
      const code = error instanceof CalendarOutboxError ? error.code : null;
      report.skipped.push({ reservationId: c.reservationId, reason: code === "SCOPE_MISMATCH" ? "scope_mismatch" : "invalid_paid_record" });
      continue;
    }
    try {
      const result = await dependencies.enqueueOnce(intent, { now: input.now });
      if (result.key !== intent.key) throw new CalendarOutboxError("INVALID_INTENT");
      if (result.status === "queued") report.queued += 1;
      else if (result.status === "already_queued") report.alreadyQueued += 1;
      else throw new CalendarOutboxError("INVALID_INTENT");
    } catch (error) {
      const conflict = error instanceof CalendarOutboxError && error.code === "PAYLOAD_CONFLICT";
      report.skipped.push({ reservationId: c.reservationId, reason: conflict ? "payload_conflict" : "enqueue_failed" });
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// TEST-ONLY in-memory reference adapter
// ---------------------------------------------------------------------------

/**
 * TEST-ONLY reference implementation of `CalendarNotificationOutbox`.
 * NOT durable, NOT shared across processes, and NOT imported by application
 * runtime. Each method yields once and then runs a synchronous critical
 * section, which is how it models the atomicity a database must provide.
 */
export function createInMemoryCalendarOutboxForTests(
  policyInput: CalendarOutboxPolicy,
  options: { newLeaseId?: () => string } = {},
): CalendarNotificationOutbox & { size(): number; record(key: string): CalendarOutboxRecord | undefined } {
  if (process.env.NODE_ENV === "production") throw new CalendarOutboxError("TEST_ONLY_ADAPTER");
  const policy = validateCalendarOutboxPolicy(policyInput);
  const rows = new Map<string, CalendarOutboxRecord>();
  const newLeaseId = options.newLeaseId ?? (() => randomUUID());
  const tick = () => Promise.resolve();
  const get = (key: string) => {
    const row = rows.get(key);
    if (!row) throw new CalendarOutboxError("NOT_FOUND");
    return row;
  };

  return {
    async enqueueOnce(intent, enqueueOptions) {
      await tick();
      const checked = assertCalendarIntentIntegrity(intent);
      const existing = rows.get(checked.key);
      if (existing) {
        if (compareCalendarIntents(existing.intent, checked) === "conflict") throw new CalendarOutboxError("PAYLOAD_CONFLICT");
        return { key: checked.key, status: "already_queued" };
      }
      // `checked` is a fresh parsed copy; freeze it so later caller mutation cannot alter the stored intent.
      Object.freeze(checked.facts.days);
      Object.freeze(checked.facts);
      rows.set(checked.key, newCalendarOutboxRecord(Object.freeze(checked), enqueueOptions?.now ?? Date.now()));
      return { key: checked.key, status: "queued" };
    },
    async claimNext({ workerId, providerAccountId, now }) {
      await tick();
      const eligible = [...rows.values()]
        .filter(r => r.state === "PENDING" && r.nextAttemptAt !== null && r.nextAttemptAt <= now)
        .sort((a, b) => (a.nextAttemptAt! - b.nextAttemptAt!) || (a.createdAt - b.createdAt) || a.intent.key.localeCompare(b.intent.key));
      let next: CalendarOutboxRecord | undefined;
      for (const row of eligible) {
        const candidate = applyCalendarOutboxTransition(row, { type: "claim", workerId, leaseId: newLeaseId(), providerAccountId, now }, policy);
        rows.set(row.intent.key, candidate);
        if (candidate.state === "SENDING") { next = candidate; break; }
      }
      if (!next) return null;
      const { intent, lease } = next;
      return Object.freeze({
        key: intent.key, leaseId: lease!.leaseId, leaseExpiresAt: lease!.expiresAt, epoch: next.epoch,
        attempt: next.epochAttempts, providerIdempotencyKey: calendarProviderIdempotencyKey(intent.key, next.epoch),
        delivery: Object.freeze({ recipient: intent.recipient, subject: intent.subject, text: intent.text, html: intent.html }),
      });
    },
    async acknowledge({ key, leaseId, outcome, now }) {
      await tick();
      const next = applyCalendarOutboxTransition(get(key), { type: "ack", leaseId, outcome, now }, policy);
      rows.set(key, next);
      return statusOf(next);
    },
    async expireLeases({ now }) {
      await tick();
      let requeued = 0;
      let uncertain = 0;
      for (const row of [...rows.values()]) {
        if (row.state !== "SENDING" || !row.lease || row.lease.expiresAt > now) continue;
        const next = applyCalendarOutboxTransition(row, { type: "lease_expired", now }, policy);
        rows.set(row.intent.key, next);
        if (next.state === "PENDING") requeued += 1; else uncertain += 1;
      }
      return { requeued, uncertain };
    },
    async resolveUncertain({ key, reviewerId, now, ...resolution }) {
      await tick();
      const next = applyCalendarOutboxTransition(get(key), { type: "manual_resolution", reviewerId, now, ...resolution } as CalendarOutboxEvent, policy);
      rows.set(key, next);
      return statusOf(next);
    },
    async status(key) {
      await tick();
      const row = rows.get(key);
      return row ? statusOf(row) : null;
    },
    size: () => rows.size,
    record: (key: string) => rows.get(key),
  };
}
