/** Parse decimal dollar input without floating-point rounding or silent cents loss. */
export function dollarsToCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = match[1];
  if (!whole) return null;
  const cents = BigInt(whole) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export function centsToDollars(value: number | null | undefined): string {
  if (value == null) return "";
  if (!Number.isSafeInteger(value)) throw new RangeError("Money must be an integer number of cents.");
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function formatMoney(value: number): string {
  if (!Number.isSafeInteger(value)) throw new RangeError("Money must be an integer number of cents.");
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

/** Null means no positive goal; values above 100 preserve over-goal achievement. */
export function progressPercent(raisedCents: number, goalCents: number | null | undefined): number | null {
  if (!goalCents || goalCents <= 0) return null;
  return Math.round((raisedCents / goalCents) * 100);
}

/** A zero override intentionally clears the goal rather than using the default. */
export function resolveGoal(overrideCents: number | null | undefined, defaultCents: number | null | undefined): number | null {
  return overrideCents ?? defaultCents ?? null;
}

export function saleAmountCents(quantity: number, ticketPriceCents: number): number | null {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(ticketPriceCents) || ticketPriceCents <= 0) return null;
  const total = quantity * ticketPriceCents;
  return Number.isSafeInteger(total) ? total : null;
}
