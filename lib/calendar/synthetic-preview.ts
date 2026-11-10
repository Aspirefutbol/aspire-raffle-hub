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
/**
 * Build one of the director's visual milestone examples from synthetic PAID
 * fixtures. Existing multipliers survive, and extra days are always 1x.
 * Never use this helper to manufacture a real payment state.
 */
export function syntheticCalendarAtCount(
  fixture: readonly SyntheticPaidDay[],
  targetCount: number,
): SyntheticPaidDay[] {
  if (!Number.isSafeInteger(targetCount) || targetCount < 0 || targetCount > 31) {
    throw new RangeError("Calendar scenario must request 0 to 31 paid days.");
  }
  const source = syntheticCalendarProgress(fixture, 100);
  if (targetCount < source.sponsoredCount) {
    throw new RangeError("Calendar scenario cannot discard paid fixture days.");
  }
  const additions: SyntheticPaidDay[] = allCalendarDays()
    .filter(day => !source.sponsoredDays.has(day))
    .slice(0, targetCount - source.sponsoredCount)
    .map((day): SyntheticPaidDay => ({ day, multiplier: 1 }));
  return [...fixture, ...additions].sort((a, b) => a.day - b.day);
}

export function completeSyntheticCalendar(
  fixture: readonly SyntheticPaidDay[],
): SyntheticPaidDay[] {
  return syntheticCalendarAtCount(fixture, 31);
}

/** Deterministic milestones; a purchase attempt is never a paid milestone. */
export function syntheticCalendarMilestone(sponsoredCount: number):
  "start" | "first" | "half" | "final" | "complete" {
  if (!Number.isSafeInteger(sponsoredCount) || sponsoredCount < 0 || sponsoredCount > 31) {
    throw new RangeError("A calendar must contain 0 to 31 sponsored days.");
  }
  if (sponsoredCount === 31) return "complete";
  if (sponsoredCount >= 24) return "final";
  if (sponsoredCount >= 16) return "half";
  if (sponsoredCount >= 8) return "first";
  return "start";
}

/** Remaining distinct PAID days to the next celebration; never count pending reservations. */
export function syntheticCalendarNextMilestone(sponsoredCount: number):
  { target: 8 | 16 | 24 | 31; remaining: number } | null {
  // Also validates the count at the model boundary, including NaN/fractions.
  const current = syntheticCalendarMilestone(sponsoredCount);
  if (current === "complete") return null;
  const target = ([8, 16, 24, 31] as const).find(value => sponsoredCount < value);
  if (target === undefined) throw new Error("No next calendar milestone.");
  return { target, remaining: target - sponsoredCount };
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
