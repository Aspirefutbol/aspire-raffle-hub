import { describe, expect, it } from "vitest";
import { parsePrivateCalendarReadModels } from "./private-read-model";

const scope = {
  organizationId: "d11f5276-86cf-48ba-8db9-63a7784eff32",
  campaignId: "7ff3d936-684e-4b3b-b7ae-0105c678b138",
  participantId: "5de0dca8-d561-412e-bd01-13b3892e6c4b",
};

const paidDays = [2, 5, 8, 11, 17, 23, 28];
function fixtures() {
  return {
    progress: {
      campaign_id: scope.campaignId,
      participant_id: scope.participantId,
      paid_days: [...paidDays],
      sponsor_count: 7,
      base_cents: 9400,
      additional_impact_cents: 9000,
      total_cents: 18400,
    },
    inventory: {
      campaign_id: scope.campaignId,
      participant_id: scope.participantId,
      paid_days: [...paidDays],
      checkout_pending_days: [4],
      held_days: [7],
      refunded_days: [16],
      unavailable_days: [...paidDays, 4, 7, 16],
    },
  };
}

describe("private calendar read models — server-only reconciliation", () => {
  it("preserves 1x–5x base/extra split and separates paid, held, pending and refunded", () => {
    const { progress, inventory } = fixtures();
    const result = parsePrivateCalendarReadModels(scope, progress, inventory);
    expect(result.baseCents).toBe(9400);
    expect(result.additionalImpactCents).toBe(9000);
    expect(result.totalCents).toBe(18400);
    expect(result.paidDays).toEqual(paidDays);
    expect(result.availableCount).toBe(21);
    expect(result.dayStates.find(x => x.day === 2)?.state).toBe("PAID");
    expect(result.dayStates.find(x => x.day === 4)?.state).toBe("CHECKOUT_PENDING");
    expect(result.dayStates.find(x => x.day === 7)?.state).toBe("HELD");
    expect(result.dayStates.find(x => x.day === 16)?.state).toBe("REFUNDED");
    expect(result.dayStates.find(x => x.day === 3)?.state).toBe("AVAILABLE");
    expect(Object.keys(result)).not.toContain("supporter_email");
    expect(Object.keys(result)).not.toContain("checkout_session_id");
  });

  it("blocks mismatched identity or context rather than mixing affiliate/player inventory", () => {
    const { progress, inventory } = fixtures();
    expect(() => parsePrivateCalendarReadModels(
      { ...scope, participantId: "712255ae-38d2-41be-81d6-61d466d629ac" },
      progress, inventory,
    )).toThrow(/did not reconcile/);
    expect(() => parsePrivateCalendarReadModels(
      scope, progress, { ...inventory, campaign_id: "712255ae-38d2-41be-81d6-61d466d629ac" },
    )).toThrow(/did not reconcile/);
    expect(() => parsePrivateCalendarReadModels(
      { ...scope, organizationId: "forged" }, progress, inventory,
    )).toThrow(/did not reconcile/);
  });

  it("rejects forged or internally contradictory financial totals", () => {
    const { progress, inventory } = fixtures();
    for (const forged of [
      { ...progress, base_cents: 9500, total_cents: 18500 },
      { ...progress, total_cents: 18500 },
      { ...progress, additional_impact_cents: 40000, total_cents: 49400 },
      { ...progress, sponsor_count: 8 },
      { ...progress, sponsor_count: 0 },
      { ...progress, paid_days: [2, 2, 8] },
      { ...progress, paid_days: [0, 5] },
      { ...progress, additional_impact_cents: -100 },
    ]) {
      expect(() => parsePrivateCalendarReadModels(scope, forged, inventory))
        .toThrow(/did not reconcile/);
    }
  });

  it("fails closed on stale cross-snapshot data and contradictory occupancy", () => {
    const { progress, inventory } = fixtures();
    for (const forged of [
      { ...inventory, paid_days: [2, 5, 8] },
      { ...inventory, checkout_pending_days: [2] },
      { ...inventory, refunded_days: [4] },
      { ...inventory, unavailable_days: [...paidDays] },
      { ...inventory, unavailable_days: [...inventory.unavailable_days, 6] },
      { ...inventory, unavailable_days: [...inventory.unavailable_days, 7] },
      { ...inventory, held_days: [32] },
    ]) {
      expect(() => parsePrivateCalendarReadModels(scope, progress, forged))
        .toThrow(/did not reconcile/);
    }
  });

  it("refuses unexpected donor/Stripe fields in either private response", () => {
    const { progress, inventory } = fixtures();
    expect(() => parsePrivateCalendarReadModels(
      scope, { ...progress, supporter_email: "private@example.test" }, inventory,
    )).toThrow(/did not reconcile/);
    expect(() => parsePrivateCalendarReadModels(
      scope, progress, { ...inventory, checkout_session_id: "cs_test_synthetic" },
    )).toThrow(/did not reconcile/);
  });

  it("handles an empty synthetic participant without inventing funds or sponsors", () => {
    const { progress, inventory } = fixtures();
    const result = parsePrivateCalendarReadModels(
      scope,
      {
        ...progress,
        paid_days: [],
        sponsor_count: 0,
        base_cents: 0,
        additional_impact_cents: 0,
        total_cents: 0,
      },
      {
        ...inventory,
        paid_days: [],
        checkout_pending_days: [],
        held_days: [],
        refunded_days: [],
        unavailable_days: [],
      },
    );
    expect(result.availableCount).toBe(31);
    expect(result.totalCents).toBe(0);
    expect(result.dayStates.every(day => day.state === "AVAILABLE")).toBe(true);
  });
});
