import { describe, expect, it } from "vitest";
import {
  aspireSouthSyntheticPreview,
  completeSyntheticCalendar,
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
    expect(progress.additionalImpactCents).toBe(11800);
    expect(progress.raisedCents).toBe(21200);
    expect(progress.percentOfGoal).toBeCloseTo(42.4);
  });


  it("shows completion only for all 31 distinct fictional verified-paid days", () => {
    const complete = completeSyntheticCalendar(aspireSouthSyntheticPreview.paidDays);
    expect(complete).toHaveLength(31);
    const result = syntheticCalendarProgress(complete, aspireSouthSyntheticPreview.goalCents);
    expect(result.sponsoredCount).toBe(31);
    expect(result.isComplete).toBe(true);
    expect(result.dayCompletionPercent).toBe(100);
    expect(result.baseCents).toBe(49600);
    expect(result.additionalImpactCents).toBe(11800);
    expect(result.raisedCents).toBe(61400);
    expect(result.paidMultiplierByDay.get(2)).toBe(4);
    expect(result.paidMultiplierByDay.get(28)).toBe(5);
    expect(result.paidMultiplierByDay.get(31)).toBe(1);
  });

  it("keeps held, selected and unpaid checkout days out of the paid-only day progress", () => {
    const original = syntheticCalendarProgress(aspireSouthSyntheticPreview.paidDays, 50000);
    expect(original.sponsoredCount).toBe(7);
    expect(original.isComplete).toBe(false);
    expect(original.dayCompletionPercent).toBeCloseTo((7 / 31) * 100);
    expect(original.paidMultiplierByDay.has(10)).toBe(false);
    expect(original.paidMultiplierByDay.get(2)).toBe(4);
    // A user's selected days are not input to this paid-only read model.
    const selected = [10, 31];
    selected.push(12);
    expect(original.sponsoredDays.size).toBe(7);
    expect(original.raisedCents).toBe(21200);
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
