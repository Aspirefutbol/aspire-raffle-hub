import { describe, expect, it } from "vitest";
import {
  CALENDAR_FULL_TOTAL_CENTS,
  allCalendarDays,
  calendarDayAmountCents,
  calendarImpactQuote,
  calendarSelectionTotalCents,
} from "./pricing";

describe("Sponsor-a-Day calendar pricing", () => {
  it("preserves the original AFC 1-through-31 pricing", () => {
    expect(calendarDayAmountCents(1)).toBe(100);
    expect(calendarDayAmountCents(31)).toBe(3100);
    expect(calendarSelectionTotalCents(allCalendarDays())).toBe(CALENDAR_FULL_TOTAL_CENTS);
    expect(CALENDAR_FULL_TOTAL_CENTS).toBe(49600);
  });

  it("does not double-charge duplicate day selections", () => {
    expect(calendarSelectionTotalCents([5, 5, 12])).toBe(1700);
  });

  it("preserves supporter-choice multiplier semantics", () => {
    expect(calendarImpactQuote([10], 1)).toEqual({
      multiplier: 1,
      label: "Support",
      baseCents: 1000,
      additionalImpactCents: 0,
      totalCents: 1000,
    });

    expect(calendarImpactQuote([10], 5)).toEqual({
      multiplier: 5,
      label: "Legacy",
      baseCents: 1000,
      additionalImpactCents: 4000,
      totalCents: 5000,
    });

    expect(calendarImpactQuote(allCalendarDays(), 5).totalCents).toBe(248000);
  });

  it("rejects invalid day values", () => {
    expect(() => calendarDayAmountCents(0)).toThrow(RangeError);
    expect(() => calendarDayAmountCents(32)).toThrow(RangeError);
    expect(() => calendarDayAmountCents(1.5)).toThrow(RangeError);
  });
});
