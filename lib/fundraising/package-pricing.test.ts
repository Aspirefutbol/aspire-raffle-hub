import { describe, expect, it } from "vitest";
import { quoteTicketPackages, ticketPackageTotalCents, validateTicketPackages } from "./package-pricing";

const aspire = [{ quantity: 1, priceCents: 2000 }, { quantity: 5, priceCents: 9000 }] as const;
const cases = [[1, 2000], [4, 8000], [5, 9000], [6, 11000], [10, 18000], [11, 20000], [500, 900000]] as const;

describe("ticket package pricing foundation", () => {
  it("calculates Aspire bundles exactly", () => {
    for (const [quantity, expected] of cases) {
      expect(ticketPackageTotalCents(quantity, aspire)).toBe(expected);
    }
  });

  it("returns an exact package breakdown for eleven tickets", () => {
    expect(quoteTicketPackages(11, aspire)).toEqual({
      quantity: 11,
      totalCents: 20000,
      packages: [
        { quantity: 5, priceCents: 9000, count: 2 },
        { quantity: 1, priceCents: 2000, count: 1 },
      ],
    });
  });

  it("matches the approved formula and breakdown for all 500 supported quantities", () => {
    for (let quantity = 1; quantity <= 500; quantity += 1) {
      const quote = quoteTicketPackages(quantity, aspire);
      expect(quote?.totalCents).toBe(Math.floor(quantity / 5) * 9000 + (quantity % 5) * 2000);
      expect(quote?.packages.reduce((sum, line) => sum + line.count * line.quantity, 0)).toBe(quantity);
      expect(quote?.packages.reduce((sum, line) => sum + line.count * line.priceCents, 0)).toBe(quote?.totalCents);
    }
  });

  it("rejects malformed setup data without throwing", () => {
    const invalid: unknown[] = [
      null, undefined, {}, "packages", [], [null], [undefined], [[]], [{}], new Array(2),
      [{ quantity: "1", priceCents: 2000 }], [{ quantity: 1, priceCents: "2000" }],
      [{ quantity: 5, priceCents: 9000 }],
      [{ quantity: 1, priceCents: 2000 }, { quantity: 1, priceCents: 1900 }],
      Array.from({ length: 21 }, (_, index) => ({ quantity: index + 1, priceCents: 2000 })),
    ];
    for (const packages of invalid) expect(validateTicketPackages(packages)).toBe(false);
  });

  it("rejects zero, negative, fractional, non-finite and unsafe package values", () => {
    for (const quantity of [0, -1, 1.5, 501, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateTicketPackages([{ quantity: 1, priceCents: 2000 }, { quantity, priceCents: 9000 }])).toBe(false);
    }
    for (const priceCents of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateTicketPackages([{ quantity: 1, priceCents }])).toBe(false);
    }
  });

  it("rejects invalid sale quantities", () => {
    for (const quantity of [0, -1, 1.5, 501, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(ticketPackageTotalCents(quantity, aspire)).toBeNull();
    }
  });

  it("rejects an invalid configuration when quoting", () => {
    expect(quoteTicketPackages(5, [{ quantity: 5, priceCents: 9000 }])).toBeNull();
  });

  it("chooses the lowest cost, not the largest package greedily", () => {
    expect(quoteTicketPackages(6, [
      { quantity: 1, priceCents: 2000 },
      { quantity: 3, priceCents: 5000 },
      { quantity: 5, priceCents: 9000 },
    ])).toEqual({ quantity: 6, totalCents: 10000, packages: [{ quantity: 3, priceCents: 5000, count: 2 }] });
  });

  it("prefers fewer packages when totals tie", () => {
    expect(quoteTicketPackages(5, [{ quantity: 1, priceCents: 2000 }, { quantity: 5, priceCents: 10000 }])?.packages)
      .toEqual([{ quantity: 5, priceCents: 10000, count: 1 }]);
  });

  it("is independent of package order and does not mutate input", () => {
    const frozen = Object.freeze(aspire.map((pack) => Object.freeze({ ...pack })));
    expect(quoteTicketPackages(11, frozen)).toEqual(quoteTicketPackages(11, [...aspire].reverse()));
    expect(frozen).toEqual(aspire);
  });

  it("ignores a package that costs more than the equivalent singles", () => {
    expect(ticketPackageTotalCents(5, [{ quantity: 1, priceCents: 2000 }, { quantity: 5, priceCents: 11000 }])).toBe(10000);
  });

  it("does not issue extra tickets just because a larger package is cheaper", () => {
    expect(quoteTicketPackages(4, [{ quantity: 1, priceCents: 2000 }, { quantity: 5, priceCents: 1000 }])?.totalCents).toBe(8000);
  });

  it("does not reject a valid bundle because a different path overflows", () => {
    const large = [{ quantity: 1, priceCents: Number.MAX_SAFE_INTEGER }, { quantity: 2, priceCents: 1 }];
    expect(ticketPackageTotalCents(1, large)).toBe(Number.MAX_SAFE_INTEGER);
    expect(ticketPackageTotalCents(2, large)).toBe(1);
    expect(ticketPackageTotalCents(3, large)).toBeNull();
    expect(ticketPackageTotalCents(4, large)).toBe(2);
    expect(ticketPackageTotalCents(4, [...large].reverse())).toBe(2);
  });

  it("preserves legacy single-ticket calculations", () => {
    expect(ticketPackageTotalCents(3, [{ quantity: 1, priceCents: 500 }])).toBe(1500);
    expect(ticketPackageTotalCents(500, [{ quantity: 1, priceCents: 100000 }])).toBe(50000000);
  });
});
