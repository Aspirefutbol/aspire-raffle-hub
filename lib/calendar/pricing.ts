export const CALENDAR_FIRST_DAY = 1;
export const CALENDAR_LAST_DAY = 31;
export const CALENDAR_FULL_TOTAL_CENTS = 49600;

export const CALENDAR_MULTIPLIERS = [1, 2, 3, 4, 5] as const;
export type CalendarMultiplier = (typeof CALENDAR_MULTIPLIERS)[number];

export const CALENDAR_MULTIPLIER_LABELS = {
  1: "Support",
  2: "Boost",
  3: "Impact",
  4: "Champion",
  5: "Legacy",
} as const satisfies Record<CalendarMultiplier, string>;

export function calendarDayAmountCents(day: number): number {
  if (!Number.isInteger(day) || day < CALENDAR_FIRST_DAY || day > CALENDAR_LAST_DAY) {
    throw new RangeError("Calendar day must be an integer from 1 through 31.");
  }
  return day * 100;
}

export function calendarSelectionTotalCents(days: number[]): number {
  const unique = new Set<number>();
  let total = 0;

  for (const day of days) {
    if (unique.has(day)) continue;
    unique.add(day);
    total += calendarDayAmountCents(day);
  }

  return total;
}

export function calendarImpactQuote(days: number[], multiplier: CalendarMultiplier) {
  if (!CALENDAR_MULTIPLIERS.includes(multiplier)) {
    throw new RangeError("Calendar multiplier must be between 1x and 5x.");
  }

  const baseCents = calendarSelectionTotalCents(days);
  const totalCents = baseCents * multiplier;

  return {
    multiplier,
    label: CALENDAR_MULTIPLIER_LABELS[multiplier],
    baseCents,
    additionalImpactCents: totalCents - baseCents,
    totalCents,
  };
}

export function allCalendarDays(): number[] {
  return Array.from(
    { length: CALENDAR_LAST_DAY - CALENDAR_FIRST_DAY + 1 },
    (_, index) => index + CALENDAR_FIRST_DAY,
  );
}
