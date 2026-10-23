/** Pure, integer-cent pricing helpers. Not wired to sales until server/DB parity is verified. */
export type TicketPackage = Readonly<{ quantity: number; priceCents: number }>;

export function validateTicketPackages(packages: readonly TicketPackage[]): boolean {
  if (packages.length === 0 || packages.length > 20) return false;
  const quantities = new Set<number>();
  for (const entry of packages) {
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 500 ||
        !Number.isSafeInteger(entry.priceCents) || entry.priceCents < 1 ||
        quantities.has(entry.quantity)) return false;
    quantities.add(entry.quantity);
  }
  return quantities.has(1);
}

/** Find the cheapest exact combination of approved packages, in cents. */
export function ticketPackageTotalCents(quantity: number, packages: readonly TicketPackage[]): number | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 500 || !validateTicketPackages(packages)) return null;
  const totals: number[] = [0];
  for (let count = 1; count <= quantity; count += 1) {
    let best: number | null = null;
    for (const pack of packages) {
      if (pack.quantity > count) continue;
      const prior = totals[count - pack.quantity];
      if (prior === undefined) continue;
      const sum = prior + pack.priceCents;
      if (!Number.isSafeInteger(sum)) return null;
      if (best === null || sum < best) best = sum;
    }
    if (best === null) return null;
    totals.push(best);
  }
  return totals[quantity] ?? null;
}
