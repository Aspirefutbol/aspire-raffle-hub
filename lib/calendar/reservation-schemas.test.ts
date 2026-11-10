import { describe, expect, it } from "vitest";
import { parseCalendarReservationRequest } from "./reservation-schemas";

const valid = {
  participantId: "0e52edc6-3414-48ec-a82b-a15a553b36f9",
  requestKey: "f149d4cb-d024-4cbc-bfdb-321ba247a1b6",
  days: [10, 11],
  multiplier: 5,
  supporterName: " Demo Supporter ",
  supporterEmail: " DONOR@EXAMPLE.TEST ",
};

describe("calendar reservation server-input contract", () => {
  it("normalizes contact and computes the original AFC base + extra impact", () => {
    const result = parseCalendarReservationRequest(valid);
    expect(result.request.supporterName).toBe("Demo Supporter");
    expect(result.request.supporterEmail).toBe("donor@example.test");
    expect(result.quote).toEqual({
      multiplier: 5, label: "Legacy",
      baseCents: 2100, additionalImpactCents: 8400, totalCents: 10500,
    });
  });

  it("defaults donor multiplier to 1x", () => {
    const { quote } = parseCalendarReservationRequest({ ...valid, multiplier: undefined });
    expect(quote.baseCents).toBe(2100);
    expect(quote.additionalImpactCents).toBe(0);
    expect(quote.totalCents).toBe(2100);
  });

  it("rejects duplicate, out-of-range, noninteger and empty day sets", () => {
    for (const days of [[], [10,10], [0], [32], [2.5], [10, null]]) {
      expect(() => parseCalendarReservationRequest({ ...valid, days })).toThrow();
    }
  });

  it("rejects forged tenant/amount/payment status and other unexpected client fields", () => {
    for (const key of ["organizationId", "campaignId", "totalCents", "baseCents", "status", "checkoutSessionId"]) {
      expect(() => parseCalendarReservationRequest({ ...valid, [key]: "forged" })).toThrow();
    }
  });

  it("rejects invalid multipliers, contacts and missing idempotency keys", () => {
    for (const multiplier of [0, 6, -1, 2.5, "5"]) {
      expect(() => parseCalendarReservationRequest({ ...valid, multiplier })).toThrow();
    }
    expect(() => parseCalendarReservationRequest({ ...valid, requestKey: "" })).toThrow();
    expect(() => parseCalendarReservationRequest({ ...valid, supporterEmail: "not-an-email" })).toThrow();
    expect(() => parseCalendarReservationRequest({ ...valid, supporterName: "  " })).toThrow();
  });
});
