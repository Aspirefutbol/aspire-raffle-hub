import { describe, expect, it } from "vitest";
import { permissionsForRoles, type Permission } from "@/lib/permissions";
import { canReadFundraising, canRecordSale, canReverseSale, saleScopeAuthority } from "./capabilities";
import { centsToDollars, dollarsToCents, progressPercent, resolveGoal, saleAmountCents } from "./money";

describe("fundraising money and goals", () => {
  it("converts dollars exactly without floating point cents loss", () => {
    expect(dollarsToCents("0.29")).toBe(29);
    expect(dollarsToCents(" 10.5 ")).toBe(1050);
    expect(dollarsToCents("0005.00")).toBe(500);
    expect(dollarsToCents("0")).toBe(0);
    expect(centsToDollars(29)).toBe("0.29");
    expect(centsToDollars(1005)).toBe("10.05");
    expect(centsToDollars(null)).toBe("");
    expect(centsToDollars(-1005)).toBe("-10.05");
  });

  it("rejects lost cents, unsafe values and ambiguous dollar input", () => {
    for (const input of ["", "-1", "1.001", "1e3", "NaN", "Infinity", "$2", "1,000", "1.", ".25", "90071992547410.00"]) {
      expect(dollarsToCents(input), input).toBeNull();
    }
    expect(dollarsToCents("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => centsToDollars(1.5)).toThrow(RangeError);
  });

  it("calculates full face value and rejects unsafe or fractional quantities", () => {
    expect(saleAmountCents(3, 500)).toBe(1500);
    expect(saleAmountCents(500, 100_000)).toBe(50_000_000);
    expect(saleAmountCents(0, 500)).toBeNull();
    expect(saleAmountCents(1.5, 500)).toBeNull();
    expect(saleAmountCents(2, Number.MAX_SAFE_INTEGER)).toBeNull();
  });

  it("resolves zero overrides and missing goals without dividing by zero", () => {
    expect(resolveGoal(null, 25_000)).toBe(25_000);
    expect(resolveGoal(0, 25_000)).toBe(0);
    expect(resolveGoal(10_000, 25_000)).toBe(10_000);
    expect(resolveGoal(null, null)).toBeNull();
    expect(progressPercent(5000, 10_000)).toBe(50);
    expect(progressPercent(15_000, 10_000)).toBe(150);
    expect(progressPercent(5000, 0)).toBeNull();
    expect(progressPercent(5000, null)).toBeNull();
  });
});

describe("fundraising capability combinations", () => {
  it("keeps each dashboard view explicitly permission gated", () => {
    const family = permissionsForRoles(["PARTICIPANT_FAMILY"]);
    const captain = permissionsForRoles(["TEAM_CAPTAIN"]);
    expect(canReadFundraising(family, "family")).toBe(true);
    expect(canReadFundraising(family, "admin")).toBe(false);
    expect(canReadFundraising(family, "team")).toBe(false);
    expect(canReadFundraising(captain, "team")).toBe(true);
    expect(canReadFundraising(captain, "family")).toBe(false);
    expect(canReadFundraising(captain, "admin")).toBe(false);
  });

  it("does not give issuance to captain, campaign manager, finance, director or auditor alone", () => {
    for (const role of ["TEAM_CAPTAIN", "CAMPAIGN_MANAGER", "FINANCE_ADMIN", "DIRECTOR", "AUDITOR"] as const) {
      expect(canRecordSale(permissionsForRoles([role])), role).toBe(false);
    }
    expect(saleScopeAuthority(permissionsForRoles(["ORGANIZATION_ADMIN"]))).toBe("organization");
    expect(saleScopeAuthority(new Set<Permission>(["tickets.issue", "roster.read"]))).toBeNull();
  });

  it("additional read/captain/manager roles never broaden a family's sale scope", () => {
    for (const extraRole of ["TEAM_CAPTAIN", "CAMPAIGN_MANAGER", "FINANCE_ADMIN", "DIRECTOR", "AUDITOR"] as const) {
      const permissions = permissionsForRoles(["PARTICIPANT_FAMILY", extraRole]);
      expect(canRecordSale(permissions), extraRole).toBe(true);
      expect(saleScopeAuthority(permissions), extraRole).toBe("family");
    }
  });

  it("requires both void and adjustment approval for financial reversal", () => {
    expect(canReverseSale(permissionsForRoles(["ORGANIZATION_ADMIN"]))).toBe(false);
    expect(canReverseSale(permissionsForRoles(["DIRECTOR"]))).toBe(false);
    expect(canReverseSale(permissionsForRoles(["FINANCE_ADMIN"]))).toBe(false);
    expect(canReverseSale(permissionsForRoles(["CAMPAIGN_MANAGER", "DIRECTOR"]))).toBe(true);
    expect(canReverseSale(permissionsForRoles(["ORGANIZATION_ADMIN", "DIRECTOR"]))).toBe(true);
  });
});
