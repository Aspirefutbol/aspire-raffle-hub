import { describe, expect, it } from "vitest";
import {
  aspireSouthSyntheticPreview,
  syntheticCalendarProgress,
} from "./synthetic-preview";

describe("fictional Aspire South calendar preview model", () => {
  it("derives the displayed progress from funded days and impact levels", () => {
    const progress = syntheticCalendarProgress(
      aspireSouthSyntheticPreview.paidDays,
      aspireSouthSyntheticPreview.goalCents,
    );
    expect(aspireSouthSyntheticPreview.tenantSlug).toBe("aspire-south-synthetic");
    expect(progress.sponsoredDays).toEqual(new Set([2, 5, 8, 11, 17, 23, 28]));
    expect(progress.baseCents).toBe(9400);
    expect(progress.additionalImpactCents).toBe(9000);
    expect(progress.raisedCents).toBe(18400);
    expect(progress.percentOfGoal).toBeCloseTo(36.8);
  });

  it("never adds another primary sponsor for a higher multiplier", () => {
    expect(() => syntheticCalendarProgress([
      { day: 10, multiplier: 1 }, { day: 10, multiplier: 5 },
    ], 50000)).toThrow(/one primary sponsor/);
  });

  it("rejects invalid days, multipliers, and campaign goals", () => {
    expect(() => syntheticCalendarProgress([{ day: 0, multiplier: 1 }], 50000))
      .toThrow(RangeError);
    expect(() => syntheticCalendarProgress([{ day: 10, multiplier: 7 as 1 }], 50000))
      .toThrow(RangeError);
    expect(() => syntheticCalendarProgress([], 0)).toThrow(RangeError);
  });

  it("caps visual progress without misreporting collected funds", () => {
    const result = syntheticCalendarProgress([{ day: 31, multiplier: 5 }], 100);
    expect(result.raisedCents).toBe(15500);
    expect(result.percentOfGoal).toBe(100);
  });
});
