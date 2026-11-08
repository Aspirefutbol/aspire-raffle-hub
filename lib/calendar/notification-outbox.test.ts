import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  CALENDAR_DONOR_CONFIRMATION_TEMPLATE_VERSION,
  CALENDAR_OUTBOX_STATES,
  CALENDAR_OUTBOX_TERMINAL_STATES,
  CALENDAR_OUTBOX_TRANSITIONS,
  CalendarOutboxError,
  applyCalendarOutboxTransition,
  assertCalendarIntentIntegrity,
  calendarDonorConfirmationKey,
  calendarProviderIdempotencyKey,
  compareCalendarIntents,
  createInMemoryCalendarOutboxForTests,
  newCalendarOutboxRecord,
  prepareCalendarDonorConfirmationIntent,
  sweepMissingCalendarDonorConfirmations,
  validateCalendarOutboxPolicy,
  type CalendarDonorConfirmationIntent,
  type CalendarOutboxPolicy,
  type CalendarOutboxRecord,
} from "./notification-outbox";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "44444444-4444-4444-8444-444444444444";
const CAMPAIGN = "22222222-2222-4222-8222-222222222222";
const PLAYER = "33333333-3333-4333-8333-333333333333";
const OTHER_PLAYER = "55555555-5555-4555-8555-555555555555";
const R1 = "d1a04e38-e473-40d0-a1a0-ffbcb686b15a";
const R2 = "a2b04e38-e473-40d0-a1a0-ffbcb686b15b";
const R3 = "c3c04e38-e473-40d0-a1a0-ffbcb686b15c";
const DONOR = "fictional-donor@example.test";
const HOUR = 3_600_000;
const T0 = 1_800_000_000_000;

const scope = { organizationId: ORG, campaignId: CAMPAIGN, participantId: PLAYER };
const snapshots: Record<string, Record<string, unknown>> = {
  [R1]: { days: [10], multiplier: 5, baseCents: 1000, additionalImpactCents: 4000, totalCents: 5000 },
  [R2]: { days: [7, 3], multiplier: 1, baseCents: 1000, additionalImpactCents: 0, totalCents: 1000 },
  [R3]: { days: [31], multiplier: 2, baseCents: 3100, additionalImpactCents: 3100, totalCents: 6200 },
};
function paid(reservationId = R1, change: Record<string, unknown> = {}) {
  return {
    ...scope, reservationId, status: "PAID", mode: "test", currency: "usd", language: "en",
    recipient: DONOR, organizationName: "Aspire South", participantDisplayName: "Mateo R.",
    ...snapshots[reservationId], ...change,
  };
}
const expectedFor = (reservationId = R1) => ({ ...scope, reservationId });
const intentFor = (reservationId = R1, change: Record<string, unknown> = {}) =>
  prepareCalendarDonorConfirmationIntent(paid(reservationId, change), expectedFor(reservationId));

// Example window only: Resend documents 24h key retention. Not a provider selection.
const policy: CalendarOutboxPolicy = {
  maxAttempts: 4, leaseMs: 60_000, retryBaseMs: 30_000, retryCapMs: 10 * 60_000,
  providerIdempotencyWindowMs: 24 * HOUR, idempotencySafetyMarginMs: HOUR,
};
const outbox = (p: Partial<CalendarOutboxPolicy> = {}) => {
  let n = 0;
  return createInMemoryCalendarOutboxForTests({ ...policy, ...p }, { newLeaseId: () => `lease-${++n}` });
};

/** Every error must be a fixed-code outbox error with no donor data. */
async function expectSafeRejection(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(CalendarOutboxError);
  expect((error as CalendarOutboxError).code).toBe(code);
  for (const secret of [DONOR, "Mateo", "Aspire South", "other@example.test", "$50.00"]) {
    expect(String(error)).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
    expect((error as Error).stack ?? "").not.toContain(secret);
  }
}
const sync = (fn: () => unknown) => Promise.resolve().then(fn);

function withTemplate(intent: CalendarDonorConfirmationIntent, templateVersion: string, subject = intent.subject) {
  const contentDigest = createHash("sha256")
    .update(JSON.stringify([templateVersion, subject, intent.text, intent.html])).digest("hex");
  return { ...intent, templateVersion, subject, contentDigest } as CalendarDonorConfirmationIntent;
}

afterEach(() => vi.unstubAllEnvs());

describe("notification key and template versions", () => {
  it("keeps the existing reservation-scoped key exactly, independent of template version", () => {
    const intent = intentFor();
    expect(intent.key).toBe(`calendar:test:${ORG}:${R1}:donor-confirmation:v1`);
    expect(calendarDonorConfirmationKey(ORG, R1)).toBe(intent.key);
    expect(intent.key).not.toContain(CALENDAR_DONOR_CONFIRMATION_TEMPLATE_VERSION);
    expect(intent.templateVersion).toBe(CALENDAR_DONOR_CONFIRMATION_TEMPLATE_VERSION);
    expect(intentFor(R1, { language: "es" }).key).toBe(intent.key);
    expect(Object.isFrozen(intent) && Object.isFrozen(intent.facts) && Object.isFrozen(intent.facts.days)).toBe(true);
  });

  it("treats a wording-only template change as already queued and keeps the original content", async () => {
    const box = outbox();
    const original = intentFor();
    expect(await box.enqueueOnce(original, { now: T0 })).toEqual({ key: original.key, status: "queued" });
    const reworded = withTemplate(original, "calendar-donor-confirmation/2027-01-01.1", "New wording");
    expect(compareCalendarIntents(original, reworded)).toBe("template_superseded");
    expect(await box.enqueueOnce(reworded, { now: T0 })).toEqual({ key: original.key, status: "already_queued" });
    expect(box.size()).toBe(1);
    expect(box.record(original.key)!.intent.subject).toBe(original.subject);
    const claim = await box.claimNext({ workerId: "w1", providerAccountId: "acct-test-1", now: T0 });
    expect(claim!.delivery.subject).toBe(original.subject);
    expect(box.record(original.key)!.intent.templateVersion).toBe(CALENDAR_DONOR_CONFIRMATION_TEMPLATE_VERSION);
    expect(box.record(original.key)!.intent.contentDigest).toBe(original.contentDigest);
    // Retries deliver the STORED payload, never the newer template.
    const scheduled = await box.acknowledge({ key: original.key, leaseId: claim!.leaseId, outcome: { type: "rejected_retryable" }, now: T0 + 1 });
    await box.enqueueOnce(reworded, { now: T0 + 2 });
    const retry = await box.claimNext({ workerId: "w2", providerAccountId: "acct-test-1", now: scheduled.nextAttemptAt! });
    expect(retry!.delivery).toEqual(claim!.delivery);
    expect(retry!.delivery.subject).not.toBe("New wording");
    // Business-fact changes still conflict even when combined with a newer template.
    for (const change of [{ recipient: "other@example.test" }, { language: "es" }, { participantId: OTHER_PLAYER },
      { days: [11], baseCents: 1100, additionalImpactCents: 4400, totalCents: 5500 },
      { multiplier: 4, additionalImpactCents: 3000, totalCents: 4000 }]) {
      const changed = prepareCalendarDonorConfirmationIntent(paid(R1, change), { ...expectedFor(), ...("participantId" in change ? { participantId: OTHER_PLAYER } : {}) });
      await expectSafeRejection(box.enqueueOnce(withTemplate(changed, "calendar-donor-confirmation/2027-01-01.1", "New wording"), { now: T0 }), "PAYLOAD_CONFLICT");
    }
  });

  it("rejects changed content under the SAME template version as a conflict", async () => {
    const box = outbox();
    const original = intentFor();
    await box.enqueueOnce(original, { now: T0 });
    const drifted = withTemplate(original, original.templateVersion, "Different subject");
    expect(compareCalendarIntents(original, drifted)).toBe("conflict");
    await expectSafeRejection(box.enqueueOnce(drifted, { now: T0 }), "PAYLOAD_CONFLICT");
  });
});

describe("trusted PAID preparation", () => {
  it("rejects unpaid, LIVE, malformed and extra-private-field records", async () => {
    for (const change of [
      { status: "HELD" }, { status: "CHECKOUT_PENDING" }, { status: "REFUNDED" }, { status: "paid" },
      { mode: "live" }, { currency: "eur" }, { totalCents: 1 }, { baseCents: 5000 },
      { additionalImpactCents: 0 }, { days: [10, 10] }, { recipient: "bad\r\nBcc: other@example.test" },
      { guardianEmail: "private@example.test" }, { stripeSessionId: "cs_test_x" },
    ]) {
      await expectSafeRejection(sync(() => intentFor(R1, change)), "INVALID_PAID_RECORD");
    }
    await expectSafeRejection(sync(() => prepareCalendarDonorConfirmationIntent({ status: "PAID" }, expectedFor())), "INVALID_PAID_RECORD");
    await expectSafeRejection(sync(() => prepareCalendarDonorConfirmationIntent(null, expectedFor())), "INVALID_PAID_RECORD");
  });

  it("rejects wrong tenant, campaign, player, reservation and total", async () => {
    for (const expected of [
      { ...expectedFor(), organizationId: OTHER_ORG }, { ...expectedFor(), campaignId: OTHER_ORG },
      { ...expectedFor(), participantId: OTHER_PLAYER }, { ...expectedFor(), reservationId: R2 },
      { ...expectedFor(), totalCents: 4999 },
    ]) {
      await expectSafeRejection(sync(() => prepareCalendarDonorConfirmationIntent(paid(), expected)), "SCOPE_MISMATCH");
    }
  });

  it("recomputes digests so a tampered or hand-built intent cannot be stored", async () => {
    const box = outbox();
    const intent = intentFor();
    for (const tampered of [
      { ...intent, recipient: "other@example.test" },
      { ...intent, facts: { ...intent.facts, totalCents: 1 } },
      { ...intent, key: calendarDonorConfirmationKey(ORG, R2) },
      { ...intent, organizationId: OTHER_ORG },
      { ...intent, text: `${intent.text} extra` },
      { ...intent, privateNote: "x" },
    ]) {
      await expectSafeRejection(sync(() => assertCalendarIntentIntegrity(tampered)), "INVALID_INTENT");
      await expectSafeRejection(box.enqueueOnce(tampered as CalendarDonorConfirmationIntent, { now: T0 }), "INVALID_INTENT");
    }
    expect(box.size()).toBe(0);
  });
});

describe("enqueue consistency", () => {
  it("returns the existing result for identical retries", async () => {
    const box = outbox();
    expect((await box.enqueueOnce(intentFor(), { now: T0 })).status).toBe("queued");
    expect((await box.enqueueOnce(intentFor(), { now: T0 + 5 })).status).toBe("already_queued");
    expect(box.size()).toBe(1);
  });

  it("fails safely on changed recipient, language, scope facts or amounts without overwriting", async () => {
    const box = outbox();
    const original = intentFor();
    await box.enqueueOnce(original, { now: T0 });
    for (const changed of [
      intentFor(R1, { recipient: "other@example.test" }),
      intentFor(R1, { language: "es" }),
      intentFor(R1, { participantDisplayName: "Someone Else" }),
      intentFor(R1, { days: [11], baseCents: 1100, additionalImpactCents: 4400, totalCents: 5500 }),
      intentFor(R1, { multiplier: 4, additionalImpactCents: 3000, totalCents: 4000 }),
    ]) {
      await expectSafeRejection(box.enqueueOnce(changed, { now: T0 }), "PAYLOAD_CONFLICT");
    }
    expect(box.size()).toBe(1);
    expect(box.record(original.key)!.intent).toEqual(original);
  });

  it("creates exactly one intent under overlapping enqueue attempts", async () => {
    const box = outbox();
    const results = await Promise.all(Array.from({ length: 25 }, () => box.enqueueOnce(intentFor(), { now: T0 })));
    expect(results.filter(r => r.status === "queued")).toHaveLength(1);
    expect(results.filter(r => r.status === "already_queued")).toHaveLength(24);
    expect(box.size()).toBe(1);
  });
});

describe("claims, leases and acknowledgements", () => {
  it("grants one claim to overlapping workers and nothing before nextAttemptAt", async () => {
    const box = outbox();
    await box.enqueueOnce(intentFor(), { now: T0 });
    expect(await box.claimNext({ workerId: "early", providerAccountId: "acct-test-1", now: T0 - 1 })).toBeNull();
    const claims = await Promise.all(Array.from({ length: 10 }, (_, i) => box.claimNext({ workerId: `w${i}`, providerAccountId: "acct-test-1", now: T0 })));
    const granted = claims.filter(Boolean);
    expect(granted).toHaveLength(1);
    expect(granted[0]).toMatchObject({ attempt: 1, epoch: 1, leaseExpiresAt: T0 + policy.leaseMs });
    expect(granted[0]!.delivery.recipient).toBe(DONOR);
    expect((await box.status(intentFor().key))!.state).toBe("SENDING");
  });

  it("rejects a stale worker acknowledging after its lease was expired and re-claimed", async () => {
    const box = outbox();
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    const a = (await box.claimNext({ workerId: "worker-a", providerAccountId: "acct-test-1", now: T0 }))!;
    expect(await box.expireLeases({ now: T0 + policy.leaseMs })).toEqual({ requeued: 1, uncertain: 0 });
    const status = (await box.status(key))!;
    expect(status).toMatchObject({ state: "PENDING", nextAttemptAt: T0 + policy.leaseMs + 30_000 });
    const b = (await box.claimNext({ workerId: "worker-b", providerAccountId: "acct-test-1", now: status.nextAttemptAt! }))!;
    expect(b.leaseId).not.toBe(a.leaseId);
    expect(b.providerIdempotencyKey).toBe(a.providerIdempotencyKey);
    await expectSafeRejection(box.acknowledge({ key, leaseId: a.leaseId, outcome: { type: "accepted", providerMessageId: "msg_a" }, now: status.nextAttemptAt! + 1 }), "STALE_LEASE");
    expect((await box.acknowledge({ key, leaseId: b.leaseId, outcome: { type: "accepted", providerMessageId: "msg_b" }, now: status.nextAttemptAt! + 2 })).state).toBe("SENT");
    expect(box.record(key)!.providerMessageId).toBe("msg_b");
    await expectSafeRejection(box.acknowledge({ key, leaseId: b.leaseId, outcome: { type: "accepted", providerMessageId: "msg_b" }, now: status.nextAttemptAt! + 3 }), "STALE_LEASE");
  });

  it("accepts the current lease holder's late ack before the lease is reaped (fencing is by lease id)", async () => {
    const box = outbox();
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    const claim = (await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: T0 }))!;
    const late = T0 + policy.leaseMs + 5;
    expect((await box.acknowledge({ key, leaseId: claim.leaseId, outcome: { type: "accepted", providerMessageId: "msg_1" }, now: late })).state).toBe("SENT");
    expect(await box.expireLeases({ now: late + 1 })).toEqual({ requeued: 0, uncertain: 0 });
  });

  it("defines SENT as provider acceptance and records a provider id, with no further transitions", async () => {
    const box = outbox();
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    const claim = (await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: T0 }))!;
    await box.acknowledge({ key, leaseId: claim.leaseId, outcome: { type: "accepted", providerMessageId: "msg_1" }, now: T0 + 10 });
    expect(box.record(key)).toMatchObject({ state: "SENT", sentAt: T0 + 10, providerMessageId: "msg_1" });
    expect(await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: T0 + HOUR })).toBeNull();
    await expectSafeRejection(box.resolveUncertain({ key, reviewerId: "ops", now: T0 + 20, resolution: "abandon" }), "INVALID_TRANSITION");
  });
});

describe("retries, exhaustion and uncertain delivery", () => {
  async function claimAndAck(box: ReturnType<typeof outbox>, now: number, outcome: Parameters<ReturnType<typeof outbox>["acknowledge"]>[0]["outcome"]) {
    const claim = (await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now }))!;
    expect(claim).not.toBeNull();
    return box.acknowledge({ key: claim.key, leaseId: claim.leaseId, outcome, now: now + 1 });
  }

  it("schedules definitive retryable rejections with capped exponential backoff, then dead-letters", async () => {
    const box = outbox();
    await box.enqueueOnce(intentFor(), { now: T0 });
    let now = T0;
    const delays: number[] = [];
    for (let attempt = 1; attempt < policy.maxAttempts; attempt++) {
      const status = await claimAndAck(box, now, { type: "rejected_retryable", code: "rate_limited" });
      expect(status.state).toBe("PENDING");
      delays.push(status.nextAttemptAt! - (now + 1));
      expect(await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: status.nextAttemptAt! - 1 })).toBeNull();
      now = status.nextAttemptAt!;
    }
    expect(delays).toEqual([30_000, 60_000, 120_000]);
    const final = await claimAndAck(box, now, { type: "rejected_retryable" });
    expect(final).toMatchObject({ state: "DEAD_LETTER", holdReason: "retry_exhausted", epochAttempts: policy.maxAttempts });
    expect(await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: now + HOUR })).toBeNull();
  });

  it("dead-letters permanent rejection and keeps only an allowlisted code, not provider text", async () => {
    const box = outbox();
    await box.enqueueOnce(intentFor(), { now: T0 });
    const status = await claimAndAck(box, T0, { type: "rejected_permanent", code: `invalid recipient ${DONOR}` });
    expect(status).toMatchObject({ state: "DEAD_LETTER", holdReason: "rejected_permanent:unspecified" });
    expect(JSON.stringify(status)).not.toContain(DONOR);
  });

  it("never treats an unknown outcome as not sent when the provider has no idempotency guarantee", async () => {
    const box = outbox({ providerIdempotencyWindowMs: 0 });
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    expect(await claimAndAck(box, T0, { type: "unknown", code: "timeout" })).toMatchObject({ state: "DELIVERY_UNCERTAIN", holdReason: "no_provider_idempotency" });
    await box.enqueueOnce(intentFor(R2), { now: T0 });
    await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: T0 });
    expect(await box.expireLeases({ now: T0 + policy.leaseMs })).toEqual({ requeued: 0, uncertain: 1 });
    expect((await box.status(calendarDonorConfirmationKey(ORG, R2)))!.state).toBe("DELIVERY_UNCERTAIN");
    expect(await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: T0 + 48 * HOUR })).toBeNull();
    expect((await box.status(key))!.state).toBe("DELIVERY_UNCERTAIN");
  });

  it("retries unknown outcomes only while the idempotency window covers the epoch", async () => {
    const box = outbox({ maxAttempts: 10 });
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    expect((await claimAndAck(box, T0, { type: "unknown" })).state).toBe("PENDING");
    // Last claim that is still safe (now + lease + margin == window close).
    const lastSafeClaim = T0 + 24 * HOUR - HOUR - policy.leaseMs;
    // Its retry would be scheduled (60s backoff) inside the safety margin -> held at SCHEDULING time.
    const status = await claimAndAck(box, lastSafeClaim, { type: "unknown" });
    expect(status).toMatchObject({ state: "DELIVERY_UNCERTAIN", holdReason: "unknown_outcome_outside_idempotency_window" });
    expect(box.record(key)!.epochStartedAt).toBe(T0);
  });

  it("rechecks the window at CLAIM time when a worker picks up a safely scheduled retry too late", async () => {
    const box = outbox({ maxAttempts: 10 });
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    const scheduled = await claimAndAck(box, T0, { type: "unknown", code: "timeout" });
    expect(scheduled).toMatchObject({ state: "PENDING", nextAttemptAt: T0 + 1 + 30_000 });
    // The retry was safe when scheduled, but no worker runs until 23.5h later.
    const late = T0 + 23 * HOUR + 30 * 60_000;
    expect(await box.claimNext({ workerId: "late-worker", providerAccountId: "acct-test-1", now: late })).toBeNull();
    expect(await box.status(key)).toMatchObject({ state: "DELIVERY_UNCERTAIN", holdReason: "idempotency_window_elapsed_before_retry" });
    expect(box.record(key)!.totalAttempts).toBe(1);
    // A late claim still serves other, safe work instead of returning nothing.
    await box.enqueueOnce(intentFor(R2), { now: late });
    expect((await box.claimNext({ workerId: "late-worker", providerAccountId: "acct-test-1", now: late }))!.key).toBe(calendarDonorConfirmationKey(ORG, R2));
  });

  it("does not let a claim after definitive rejections only be blocked by the window", async () => {
    const box = outbox({ maxAttempts: 10 });
    await box.enqueueOnce(intentFor(), { now: T0 });
    await claimAndAck(box, T0, { type: "rejected_retryable" });
    expect(await box.claimNext({ workerId: "w", providerAccountId: "acct-other", now: T0 + 48 * HOUR })).not.toBeNull();
  });

  it("never extends the safe window through repeated timeouts", async () => {
    const box = outbox({ maxAttempts: 10, retryBaseMs: HOUR, retryCapMs: 8 * HOUR });
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    let now = T0;
    const claimTimes: number[] = [];
    for (;;) {
      const claim = await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now });
      if (!claim) break;
      claimTimes.push(now);
      const status = await box.acknowledge({ key, leaseId: claim.leaseId, outcome: { type: "unknown", code: "timeout" }, now: now + 1 });
      if (status.state !== "PENDING") break;
      now = status.nextAttemptAt!;
    }
    expect(box.record(key)!.epochStartedAt).toBe(T0);
    expect(box.record(key)!.state).toBe("DELIVERY_UNCERTAIN");
    // Backoff 1h,2h,4h,8h(cap): attempts at T0, +1h, +3h, +7h, +15h; +23h would breach the 24h-1h margin.
    expect(claimTimes.map(t => Math.round((t - T0) / HOUR))).toEqual([0, 1, 3, 7, 15]);
    expect(Math.max(...claimTimes) + policy.leaseMs + HOUR).toBeLessThanOrEqual(T0 + 24 * HOUR);
  });

  it("keeps provider account, payload and idempotency key fixed across retries after an unknown outcome", async () => {
    const box = outbox({ maxAttempts: 10 });
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    const first = (await box.claimNext({ workerId: "w1", providerAccountId: "acct-test-1", now: T0 }))!;
    const scheduled = await box.acknowledge({ key, leaseId: first.leaseId, outcome: { type: "unknown" }, now: T0 + 1 });
    const second = (await box.claimNext({ workerId: "w2", providerAccountId: "acct-test-1", now: scheduled.nextAttemptAt! }))!;
    expect(second.delivery).toEqual(first.delivery);
    expect(second.providerIdempotencyKey).toBe(first.providerIdempotencyKey);
    const again = await box.acknowledge({ key, leaseId: second.leaseId, outcome: { type: "unknown" }, now: scheduled.nextAttemptAt! + 1 });
    // A different provider/account cannot honor the first account's idempotency key.
    expect(await box.claimNext({ workerId: "w3", providerAccountId: "acct-test-2", now: again.nextAttemptAt! })).toBeNull();
    expect(await box.status(key)).toMatchObject({ state: "DELIVERY_UNCERTAIN", holdReason: "provider_changed_after_unknown_outcome" });
  });

  it("holds for review, not dead-letter, when attempts run out on an unknown outcome", async () => {
    const box = outbox({ maxAttempts: 1 });
    await box.enqueueOnce(intentFor(), { now: T0 });
    expect(await claimAndAck(box, T0, { type: "unknown" })).toMatchObject({ state: "DELIVERY_UNCERTAIN", holdReason: "unknown_outcome_attempts_exhausted" });
  });

  it("resolves uncertainty only by recorded review; re-arming starts a new idempotency epoch", async () => {
    const box = outbox({ providerIdempotencyWindowMs: 0 });
    const key = intentFor().key;
    await box.enqueueOnce(intentFor(), { now: T0 });
    const first = (await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: T0 }))!;
    await box.acknowledge({ key, leaseId: first.leaseId, outcome: { type: "unknown" }, now: T0 + 1 });
    await expectSafeRejection(box.resolveUncertain({ key, reviewerId: "bad reviewer id with spaces", now: T0 + 2, resolution: "abandon" }), "INVALID_TRANSITION");
    const rearmed = await box.resolveUncertain({ key, reviewerId: "ops-reviewer", now: T0 + 3, resolution: "provider_confirmed_not_accepted" });
    expect(rearmed).toMatchObject({ state: "PENDING", epoch: 2, epochAttempts: 0, totalAttempts: 1 });
    const second = (await box.claimNext({ workerId: "w", providerAccountId: "acct-test-1", now: T0 + 3 }))!;
    expect(second.providerIdempotencyKey).not.toBe(first.providerIdempotencyKey);
    expect(second.providerIdempotencyKey).toBe(calendarProviderIdempotencyKey(key, 2));
    expect(second.providerIdempotencyKey).not.toContain(R1);
    await box.acknowledge({ key, leaseId: second.leaseId, outcome: { type: "unknown" }, now: T0 + 4 });
    expect((await box.resolveUncertain({ key, reviewerId: "ops-reviewer", now: T0 + 5, resolution: "provider_confirmed_accepted", providerMessageId: "msg_found" })).state).toBe("SENT");
    expect(box.record(key)!.resolutions.map(r => r.resolution)).toEqual(["provider_confirmed_not_accepted", "provider_confirmed_accepted"]);
  });

  it("only produces transitions listed in the state contract", () => {
    expect(CALENDAR_OUTBOX_STATES).toContain("DELIVERY_UNCERTAIN");
    for (const terminal of CALENDAR_OUTBOX_TERMINAL_STATES) expect(CALENDAR_OUTBOX_TRANSITIONS[terminal]).toEqual([]);
    const base = newCalendarOutboxRecord(intentFor(), T0);
    const events = [
      { type: "claim", workerId: "w", leaseId: "l", providerAccountId: "acct-test-1", now: T0 },
      { type: "ack", leaseId: "l", outcome: { type: "accepted", providerMessageId: "m" }, now: T0 },
      { type: "lease_expired", now: T0 + HOUR },
      { type: "manual_resolution", reviewerId: "r", resolution: "abandon", now: T0 },
    ] as const;
    for (const state of CALENDAR_OUTBOX_STATES) {
      const record: CalendarOutboxRecord = {
        ...base, state, lease: state === "SENDING" ? { leaseId: "l", workerId: "w", expiresAt: T0 } : null,
      };
      for (const event of events) {
        try {
          const next = applyCalendarOutboxTransition(record, event, validateCalendarOutboxPolicy(policy));
          expect(CALENDAR_OUTBOX_TRANSITIONS[state]).toContain(next.state);
        } catch (error) {
          expect(error).toBeInstanceOf(CalendarOutboxError);
        }
      }
    }
  });

  it("validates policy bounds", async () => {
    for (const bad of [{ maxAttempts: 0 }, { maxAttempts: 11 }, { leaseMs: 1000 }, { retryCapMs: 1 }, { providerIdempotencyWindowMs: -1 }, { retryBaseMs: 0.5 }]) {
      await expectSafeRejection(sync(() => validateCalendarOutboxPolicy({ ...policy, ...bad })), "INVALID_POLICY");
    }
  });
});

describe("recovery sweep", () => {
  function sweepDeps(box: ReturnType<typeof outbox>, candidates: unknown[], overrides: Record<string, unknown> = {}) {
    const listPaidCandidates = vi.fn(async () => candidates);
    const loadPaidSnapshot = vi.fn(async (reservationId: string): Promise<unknown> =>
      reservationId in overrides ? overrides[reservationId] : paid(reservationId));
    return { listPaidCandidates, loadPaidSnapshot, enqueueOnce: box.enqueueOnce };
  }
  const candidate = (reservationId: string, change: Record<string, unknown> = {}) => ({ ...scope, reservationId, ...change });

  it("repairs missing intents with the same key and is idempotent across repeated and overlapping sweeps", async () => {
    const box = outbox();
    await box.enqueueOnce(intentFor(R1), { now: T0 });
    const deps = sweepDeps(box, [candidate(R1), candidate(R2), candidate(R3), candidate(R2)]);
    expect(await sweepMissingCalendarDonorConfirmations(deps, { organizationId: ORG, now: T0 }))
      .toEqual({ examined: 4, queued: 2, alreadyQueued: 1, skipped: [] });
    expect(box.record(calendarDonorConfirmationKey(ORG, R2))!.intent.key).toBe(`calendar:test:${ORG}:${R2}:donor-confirmation:v1`);
    const again = await sweepMissingCalendarDonorConfirmations(deps, { organizationId: ORG, now: T0 });
    expect(again).toMatchObject({ queued: 0, alreadyQueued: 3 });
    const fresh = outbox();
    const overlapping = await Promise.all(Array.from({ length: 5 }, () =>
      sweepMissingCalendarDonorConfirmations(sweepDeps(fresh, [candidate(R1), candidate(R2), candidate(R3)]), { organizationId: ORG, now: T0 })));
    expect(overlapping.reduce((n, r) => n + r.queued, 0)).toBe(3);
    expect(fresh.size()).toBe(3);
    expect(deps.listPaidCandidates).toHaveBeenCalledWith({ organizationId: ORG, limit: 100 });
  });

  it("revalidates every candidate through the trusted loader and rejects wrong scope or unpaid records", async () => {
    const box = outbox();
    const deps = sweepDeps(box, [
      candidate(R1, { organizationId: OTHER_ORG }),
      { ...candidate(R2), status: "PAID", recipient: DONOR },
      "not-an-object",
      candidate(R2),
      candidate(R3),
    ], {
      [R2]: paid(R2, { status: "HELD" }),
      [R3]: paid(R3, { participantId: OTHER_PLAYER }),
    });
    const report = await sweepMissingCalendarDonorConfirmations(deps, { organizationId: ORG, now: T0 });
    expect(report).toEqual({
      examined: 5, queued: 0, alreadyQueued: 0,
      skipped: [
        { reservationId: R1, reason: "wrong_tenant" },
        { reservationId: null, reason: "invalid_candidate" },
        { reservationId: null, reason: "invalid_candidate" },
        { reservationId: R2, reason: "invalid_paid_record" },
        { reservationId: R3, reason: "scope_mismatch" },
      ],
    });
    expect(deps.loadPaidSnapshot).not.toHaveBeenCalledWith(R1);
    expect(box.size()).toBe(0);
  });

  it("reports conflicts and loader failures without donor data and without overwriting", async () => {
    const box = outbox();
    const original = intentFor(R1);
    await box.enqueueOnce(original, { now: T0 });
    const deps = sweepDeps(box, [candidate(R1), candidate(R2)], { [R1]: paid(R1, { recipient: "other@example.test" }) });
    deps.loadPaidSnapshot.mockImplementation(async (id: string) => {
      if (id === R2) throw new Error(`db failure for ${DONOR}`);
      return paid(R1, { recipient: "other@example.test" });
    });
    const report = await sweepMissingCalendarDonorConfirmations(deps, { organizationId: ORG, now: T0 });
    expect(report.skipped).toEqual([
      { reservationId: R1, reason: "payload_conflict" },
      { reservationId: R2, reason: "load_failed" },
    ]);
    expect(JSON.stringify(report)).not.toContain("example.test");
    expect(box.record(original.key)!.intent.recipient).toBe(DONOR);
  });

  it("rejects an invalid organization or limit", async () => {
    const deps = sweepDeps(outbox(), []);
    await expectSafeRejection(sweepMissingCalendarDonorConfirmations(deps, { organizationId: "nope" }), "INVALID_INTENT");
    await expectSafeRejection(sweepMissingCalendarDonorConfirmations(deps, { organizationId: ORG, limit: 501 }), "INVALID_INTENT");
    expect(deps.listPaidCandidates).not.toHaveBeenCalled();
  });
});

describe("test-only reference adapter", () => {
  it("refuses to run in a production runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expectSafeRejection(sync(() => createInMemoryCalendarOutboxForTests(policy)), "TEST_ONLY_ADAPTER");
  });

  it("is not imported by application code", async () => {
    const { execSync } = await import("node:child_process");
    const hits = execSync("grep -rl \"notification-outbox\" app components lib proxy.ts || true", { encoding: "utf8" })
      .split("\n").filter(Boolean).filter(f => !f.startsWith("lib/calendar/"));
    expect(hits).toEqual([]);
  });
});
