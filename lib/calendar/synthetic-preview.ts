import { calendarImpactQuote, type CalendarMultiplier } from "./pricing";

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
    { day: 28, multiplier: 4 },
  ],
} as const;

export function syntheticCalendarProgress(
  paidDays: readonly { day: number; multiplier: CalendarMultiplier }[],
  goalCents: number,
) {
  if (!Number.isSafeInteger(goalCents) || goalCents <= 0) {
    throw new RangeError("Preview goal must be a positive number of cents.");
  }
  const sponsoredDays = new Set<number>();
  let baseCents = 0;
  let additionalImpactCents = 0;
  for (const { day, multiplier } of paidDays) {
    if (sponsoredDays.has(day)) {
      throw new Error("A calendar day must have only one primary sponsor.");
    }
    const quote = calendarImpactQuote([day], multiplier);
    sponsoredDays.add(day);
    baseCents += quote.baseCents;
    additionalImpactCents += quote.additionalImpactCents;
  }
  const raisedCents = baseCents + additionalImpactCents;
  return {
    sponsoredDays,
    baseCents,
    additionalImpactCents,
    raisedCents,
    percentOfGoal: Math.min(100, (raisedCents / goalCents) * 100),
  };
}
