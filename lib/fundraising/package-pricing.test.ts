import { describe, expect, it } from "vitest";
import { ticketPackageTotalCents, validateTicketPackages } from "./package-pricing";

const aspire = [{ quantity: 1, priceCents: 2000 }, { quantity: 5, priceCents: 9000 }] as const;

describe("ticket package pricing foundation", () => {
  it("calculates Aspire bundles exactly", () => {
    for (const [qty, expected] of [[1, 2000], [4, 8000], [5, 9000], [6, 11000], [10, 18000], [11, 20000]]) {
      expect(ticketPackageTotalCents(qty, aspire)).toBe(expected);
    }
  });
  it("rejects invalid configurations and quantities", () => {
    expect(validateTicketPackages([{ quantity: 5, priceCents: 9000 }])).toBe(false);
    expect(validateTicketPackages([{ quantity: 1, priceCents: 2000 }, { quantity: 1, priceCents: 1900 }])).toBe(false);
    expect(ticketPackageTotalCents(0, aspire)).toBeNull();
    expect(ticketPackageTotalCents(501, aspire)).toBeNull();
    expect(ticketPackageTotalCents(1.5, aspire)).toBeNull();
  });
  it("chooses the lowest cost across overlapping packages", () => {
    expect(ticketPackageTotalCents(6, [
      { quantity: 1, priceCents: 2000 },
      { quantity: 3, priceCents: 5000 },
      { quantity: 5, priceCents: 9000 },
    ])).toBe(10000);
  });
});
