/** Pure pricing helpers. Sales must not use these until server/database parity is verified. */
export type TicketPackage = Readonly<{ quantity: number; priceCents: number }>;
export type TicketPackageLine = TicketPackage & Readonly<{ count: number }>;
export type TicketPackageQuote = Readonly<{
  quantity: number;
  totalCents: number;
  packages: readonly TicketPackageLine[];
}>;

/** Validate untrusted setup data without coercing dollars, quantities, or missing values. */
export function validateTicketPackages(packages: unknown): packages is readonly TicketPackage[] {
  if (!Array.isArray(packages) || packages.length === 0 || packages.length > 20) return false;
  const quantities = new Set<number>();
  for (const entry of packages) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
    const { quantity, priceCents } = entry as Record<string, unknown>;
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 500 ||
        typeof priceCents !== "number" || !Number.isSafeInteger(priceCents) || priceCents < 1 ||
        quantities.has(quantity)) return false;
    quantities.add(quantity);
  }
  return quantities.has(1);
}

/**
 * Quote the cheapest exact combination; never round quantities or include extra tickets.
 * Ties use fewer packages, then a stable larger-package-first ordering.
 * BigInt keeps intermediate totals exact: an expensive path must not hide a valid bundle.
 * The final amount must still fit in a safe integer number of cents.
 */
export function quoteTicketPackages(quantity: number, packages: readonly TicketPackage[]): TicketPackageQuote | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 500 || !validateTicketPackages(packages)) return null;
  const ordered = [...packages].sort((a, b) => b.quantity - a.quantity);
  const totals: Array<bigint | null> = Array(quantity + 1).fill(null);
  const counts: number[] = Array(quantity + 1).fill(Infinity);
  const choices: Array<TicketPackage | null> = Array(quantity + 1).fill(null);
  totals[0] = 0n;
  counts[0] = 0;
  for (let tickets = 1; tickets <= quantity; tickets += 1) {
    for (const pack of ordered) {
      if (pack.quantity > tickets) continue;
      const previousTotal = totals[tickets - pack.quantity];
      const previousCount = counts[tickets - pack.quantity];
      if (previousTotal == null || previousCount === undefined) continue;
      const candidate = previousTotal + BigInt(pack.priceCents);
      const candidateCount = previousCount + 1;
      const best = totals[tickets];
      if (best == null || candidate < best || (candidate === best && candidateCount < (counts[tickets] ?? Infinity))) {
        totals[tickets] = candidate;
        counts[tickets] = candidateCount;
        choices[tickets] = pack;
      }
    }
  }
  const total = totals[quantity];
  if (total == null || total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const used = new Map<number, number>();
  for (let remaining = quantity; remaining > 0;) {
    const pack = choices[remaining];
    if (!pack) return null;
    used.set(pack.quantity, (used.get(pack.quantity) ?? 0) + 1);
    remaining -= pack.quantity;
  }
  return {
    quantity,
    totalCents: Number(total),
    packages: ordered.filter((pack) => used.has(pack.quantity))
      .map((pack) => ({ ...pack, count: used.get(pack.quantity) ?? 0 })),
  };
}

/** Compatibility entry point for callers that only need the total. */
export function ticketPackageTotalCents(quantity: number, packages: readonly TicketPackage[]): number | null {
  return quoteTicketPackages(quantity, packages)?.totalCents ?? null;
}
