import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { settleAndQueueCalendarTestConfirmation, type CalendarTestEmailIntent } from "./test-payment-notifications";

const NOW = 1_800_000_000;
const SECRET = "whsec_synthetic_settlement_signing_secret";
const reservationId = "d1a04e38-e473-40d0-a1a0-ffbcb686b15a";
const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  campaignId: "22222222-2222-4222-8222-222222222222",
  participantId: "33333333-3333-4333-8333-333333333333",
};
const snapshot = {
  ...scope, reservationId, status: "PAID", mode: "test", currency: "usd", language: "en",
  recipient: "fictional-donor@example.test", organizationName: "Aspire South", participantDisplayName: "Mateo R.",
  days: [10], multiplier: 5, baseCents: 1000, additionalImpactCents: 4000, totalCents: 5000,
};
function signed(eventId = "evt_synthetic_notification_123", live = false) {
  const rawBody = JSON.stringify({ id: eventId, type: "checkout.session.completed", livemode: live,
    data: { object: { id: "cs_test_synthetic_notification", livemode: live, mode: "payment",
      payment_status: "paid", amount_total: 5000, currency: "usd", client_reference_id: reservationId,
      metadata: { reservation_id: reservationId } } } });
  return { rawBody, signature: `t=${NOW},v1=${createHmac("sha256", SECRET).update(`${NOW}.${rawBody}`).digest("hex")}` };
}
function dependencies() {
  const intents = new Map<string, CalendarTestEmailIntent>();
  const confirm = vi.fn(async () => ({ reservation_id: reservationId, status: "PAID" as const, replayed: false, total_cents: 5000 }));
  const loadPaidSnapshot = vi.fn(async (): Promise<unknown> => ({ ...snapshot }));
  const enqueueOnce = vi.fn(async (intent: CalendarTestEmailIntent) => {
    const status = intents.has(intent.key) ? "already_queued" as const : "queued" as const;
    intents.set(intent.key, intent);
    return { key: intent.key, status };
  });
  return { confirm, loadPaidSnapshot, enqueueOnce, intents };
}
const run = (deps: ReturnType<typeof dependencies>, payload = signed()) =>
  settleAndQueueCalendarTestConfirmation(payload.rawBody, payload.signature, SECRET, scope, deps, NOW);

describe("calendar TEST confirmation queue boundary", () => {
  it("queues a scoped TEST message only after signed settlement and a committed PAID read", async () => {
    const deps = dependencies();
    expect(await run(deps)).toMatchObject({ status: "PAID", notification: "queued" });
    expect(deps.confirm.mock.invocationCallOrder[0]).toBeLessThan(deps.loadPaidSnapshot.mock.invocationCallOrder[0]!);
    expect(deps.loadPaidSnapshot.mock.invocationCallOrder[0]).toBeLessThan(deps.enqueueOnce.mock.invocationCallOrder[0]!);
    const intent = deps.enqueueOnce.mock.calls[0]![0];
    expect(intent).toMatchObject({ mode: "test", recipient: snapshot.recipient, organizationId: scope.organizationId });
    expect(intent.text).toContain("$40.00");
    expect(intent.text).not.toContain(snapshot.recipient);
  });
  it("uses one reservation key across duplicate and distinct Stripe events", async () => {
    const deps = dependencies();
    await run(deps);
    deps.confirm.mockResolvedValue({ reservation_id: reservationId, status: "PAID", replayed: true, total_cents: 5000 });
    expect(await run(deps)).toMatchObject({ notification: "already_queued" });
    expect(await run(deps, signed("evt_synthetic_notification_another"))).toMatchObject({ notification: "already_queued" });
    expect(deps.intents.size).toBe(1);
  });
  it("repairs a missing queue entry when a settled event is retried", async () => {
    const deps = dependencies();
    deps.enqueueOnce.mockRejectedValueOnce(new Error("private donor/address failure"));
    await expect(run(deps)).rejects.toThrow("Calendar TEST confirmation was not queued; retry or investigate privately.");
    deps.confirm.mockResolvedValue({ reservation_id: reservationId, status: "PAID", replayed: true, total_cents: 5000 });
    expect(await run(deps)).toMatchObject({ notification: "queued", replayed: true });
    expect(deps.intents.size).toBe(1);
  });
  it("rejects forged bodies and LIVE events before database or email work", async () => {
    const deps = dependencies();
    const payload = signed();
    await expect(run(deps, { ...payload, rawBody: payload.rawBody.replace('"amount_total":5000', '"amount_total":1') })).rejects.toThrow();
    await expect(run(deps, signed("evt_synthetic_live_notification", true))).rejects.toThrow();
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.loadPaidSnapshot).not.toHaveBeenCalled();
    expect(deps.enqueueOnce).not.toHaveBeenCalled();
  });
  it("rejects foreign scopes, nonpaid state, forged totals, and extra private fields", async () => {
    for (const change of [
      { organizationId: "44444444-4444-4444-8444-444444444444" },
      { campaignId: "44444444-4444-4444-8444-444444444444" },
      { participantId: "44444444-4444-4444-8444-444444444444" },
      { reservationId: "44444444-4444-4444-8444-444444444444" },
      { status: "HELD" }, { status: "REFUNDED" }, { mode: "live" }, { currency: "eur" },
      { totalCents: 1 }, { baseCents: 5000 }, { additionalImpactCents: 0 }, { days: [10, 10] },
      { recipient: "bad\r\nBcc: other@example.test" }, { guardianEmail: "private@example.test" },
    ]) {
      const deps = dependencies();
      deps.loadPaidSnapshot.mockResolvedValue({ ...snapshot, ...change });
      await expect(run(deps)).rejects.toThrow(/was not queued/);
      expect(deps.enqueueOnce).not.toHaveBeenCalled();
    }
  });
  it("uses the language on the private paid record, not the webhook", async () => {
    const deps = dependencies();
    deps.loadPaidSnapshot.mockResolvedValue({ ...snapshot, language: "es" });
    await run(deps);
    expect(deps.enqueueOnce.mock.calls[0]![0].subject).toMatch(/^\[PRUEBA\]/);
    expect(deps.enqueueOnce.mock.calls[0]![0].text).toContain("Días patrocinados: 10");
  });
});
