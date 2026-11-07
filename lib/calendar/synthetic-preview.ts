import { allCalendarDays, calendarImpactQuote, type CalendarMultiplier } from "./pricing";

/**
 * Public, fictional preview data only. This is deliberately NOT a database
 * seed, a Stripe result, or a real Aspire South roster. Production calendar
 * availability and progress must come from an authorized tenant-scoped read
 * model with confirmed PAID transactions, not from this fixture.
 */
export const aspireSouthSyntheticPreview = {
  tenantSlug: "aspire-south-synthetic",
  displayName: "Aspire South",
  participant: {
    displayName: "Mateo R.",
    teamName: "Aspire South 2012",
  },
  goalCents: 50000,
  // Illustrate that a sponsored day is claimed once regardless of its boost.
  paidDays: [
    { day: 2, multiplier: 4 },
    { day: 5, multiplier: 1 },
    { day: 8, multiplier: 1 },
    { day: 11, multiplier: 1 },
    { day: 17, multiplier: 1 },
    { day: 23, multiplier: 1 },
    { day: 28, multiplier: 5 },
  ],
} as const;

export type SyntheticPaidDay = { day: number; multiplier: CalendarMultiplier };

/**
 * A second fictional fixture for reviewing the completed-calendar treatment.
 * This never changes or settles a real reservation; all paid status still
 * originates exclusively from these static synthetic preview fixtures.
 */
export function completeSyntheticCalendar(
  fixture: readonly SyntheticPaidDay[],
): SyntheticPaidDay[] {
  const existing = new Map(fixture.map(({ day, multiplier }) => [day, multiplier]));
  return allCalendarDays().map(day => ({ day, multiplier: existing.get(day) ?? 1 }));
}

export function syntheticCalendarProgress(
  paidDays: readonly SyntheticPaidDay[],
  goalCents: number,
) {
  if (!Number.isSafeInteger(goalCents) || goalCents <= 0) {
    throw new RangeError("Preview goal must be a positive number of cents.");
  }
  const sponsoredDays = new Set<number>();
  const paidMultiplierByDay = new Map<number, CalendarMultiplier>();
  let baseCents = 0;
  let additionalImpactCents = 0;
  for (const { day, multiplier } of paidDays) {
    if (sponsoredDays.has(day)) {
      throw new Error("A calendar day must have only one primary sponsor.");
    }
    const quote = calendarImpactQuote([day], multiplier);
    sponsoredDays.add(day);
    paidMultiplierByDay.set(day, multiplier);
    baseCents += quote.baseCents;
    additionalImpactCents += quote.additionalImpactCents;
  }
  const raisedCents = baseCents + additionalImpactCents;
  const sponsoredCount = sponsoredDays.size;
  return {
    sponsoredDays,
    paidMultiplierByDay,
    sponsoredCount,
    isComplete: sponsoredCount === 31,
    dayCompletionPercent: (sponsoredCount / 31) * 100,
    baseCents,
    additionalImpactCents,
    raisedCents,
    percentOfGoal: Math.min(100, (raisedCents / goalCents) * 100),
  };
}
