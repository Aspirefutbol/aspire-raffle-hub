import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  settleSignedStripeTestCalendarPayment,
  type CalendarTestPaymentSettlement,
} from "./stripe-test-settlement";

const NOW = 1_800_000_000;
const SECRET = "whsec_synthetic_settlement_signing_secret";
const RESERVATION = "d1a04e38-e473-40d0-a1a0-ffbcb686b15a";
const SESSION = "cs_test_synthetic_settlement";
const EVENT_ID = "evt_synthetic_settlement_123";

const event = {
  id: EVENT_ID,
  type: "checkout.session.completed",
  livemode: false,
  data: {
    object: {
      id: SESSION,
      livemode: false,
      mode: "payment",
      payment_status: "paid",
      amount_total: 5000,
      currency: "usd",
      client_reference_id: RESERVATION,
      metadata: { reservation_id: RESERVATION },
    },
  },
};

function signed(payload: unknown = event) {
  const rawBody = JSON.stringify(payload);
  const digest = createHmac("sha256", SECRET)
    .update(`${NOW}.${rawBody}`).digest("hex");
  return { rawBody, signature: `t=${NOW},v1=${digest}` };
}

function confirmation(replayed = false): CalendarTestPaymentSettlement {
  return { reservation_id: RESERVATION, status: "PAID", replayed, total_cents: 5000 };
}

describe("signed Stripe TEST calendar settlement orchestration", () => {
  it("confirms only the verified TEST payment using the private DB callback", async () => {
    const { rawBody, signature } = signed();
    const confirm = vi.fn(async () => confirmation());
    await expect(settleSignedStripeTestCalendarPayment(
      Buffer.from(rawBody), signature, SECRET, confirm, NOW,
    )).resolves.toEqual({
      reservationId: RESERVATION,
      status: "PAID",
      replayed: false,
      totalCents: 5000,
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      RESERVATION, SESSION, EVENT_ID, 5000,
    );
  });

  it("preserves a confirmed idempotent replay without a second credited transition", async () => {
    const { rawBody, signature } = signed();
    const confirm = vi.fn(async () => confirmation(true));
    await expect(settleSignedStripeTestCalendarPayment(
      rawBody, signature, SECRET, confirm, NOW,
    )).resolves.toMatchObject({ replayed: true, totalCents: 5000 });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("never calls the private database for a tampered signed body", async () => {
    const { rawBody, signature } = signed();
    const confirm = vi.fn(async () => confirmation());
    await expect(settleSignedStripeTestCalendarPayment(
      rawBody.replace('"amount_total":5000', '"amount_total":1000'),
      signature, SECRET, confirm, NOW,
    )).rejects.toThrow(/signature/);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("blocks signed LIVE and unpaid events before any private write", async () => {
    const confirm = vi.fn(async () => confirmation());
    for (const changed of [
      { ...event, livemode: true },
      { ...event, data: { object: { ...event.data.object, payment_status: "unpaid" } } },
      { ...event, type: "checkout.session.expired" },
    ]) {
      const { rawBody, signature } = signed(changed);
      await expect(settleSignedStripeTestCalendarPayment(
        rawBody, signature, SECRET, confirm, NOW,
      )).rejects.toThrow();
    }
    expect(confirm).not.toHaveBeenCalled();
  });

  it("rejects a callback that falsely reports paid or mismatched money/tenant reservation", async () => {
    const { rawBody, signature } = signed();
    const incorrect = [
      { ...confirmation(), reservation_id: "another-reservation" },
      { ...confirmation(), total_cents: 1000 },
      { ...confirmation(), status: "HELD" },
      { ...confirmation(), replayed: "yes" },
    ];
    for (const item of incorrect) {
      const confirm = vi.fn(async () => item as CalendarTestPaymentSettlement);
      await expect(settleSignedStripeTestCalendarPayment(
        rawBody, signature, SECRET, confirm, NOW,
      )).rejects.toThrow(/did not reconcile/);
    }
  });

  it("hides database details and fails so Stripe can retry", async () => {
    const { rawBody, signature } = signed();
    const confirm = vi.fn(async (): Promise<CalendarTestPaymentSettlement> => {
      throw new Error("DO_NOT_EXPOSE_INTERNAL_DATABASE_PII");
    });
    await expect(settleSignedStripeTestCalendarPayment(
      rawBody, signature, SECRET, confirm, NOW,
    )).rejects.toThrow("Trusted Stripe TEST settlement failed; event must be retried.");
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("does not accept expired signatures before any database write", async () => {
    const { rawBody, signature } = signed();
    const confirm = vi.fn(async () => confirmation());
    await expect(settleSignedStripeTestCalendarPayment(
      rawBody, signature, SECRET, confirm, NOW + 301,
    )).rejects.toThrow(/expired/);
    expect(confirm).not.toHaveBeenCalled();
  });
});
