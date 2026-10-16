import { describe, expect, it } from "vitest";
import { moneyPermission, moneyRequestSchema } from "./schemas";
const id = "10000000-0000-4000-8000-000000000001";
const receipt = { campaign_id: id, kind: "receipt", idempotency_key: "retry", seller_id: id, amount_cents: 123, payment_method: "cash", reason: "Synthetic turn-in" };
describe("money transactions", () => {
  it("accepts integer cents and an exact retry", () => {
    expect(moneyRequestSchema.parse(receipt)).toEqual(moneyRequestSchema.parse({ ...receipt }));
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid receipt cents %s", (amount_cents) => {
    expect(moneyRequestSchema.safeParse({ ...receipt, amount_cents }).success).toBe(false);
  });
  it("rejects forged approval, unsupported payment and missing variance reasons", () => {
    for (const change of [{ approved_by: id }, { payment_method: "card" }, { reason: "" }])
      expect(moneyRequestSchema.safeParse({ ...receipt, ...change }).success).toBe(false);
  });
  it("requires traceable receipt/source/destination for a correction credit", () => {
    const credit = { campaign_id: id, kind: "credit", idempotency_key: "credit", receipt_id: id, sale_id: id, target_sale_id: id, amount_cents: 100, reason: "Correction" };
    expect(moneyRequestSchema.safeParse(credit).success).toBe(true);
    expect(moneyRequestSchema.safeParse({ ...credit, target_sale_id: undefined }).success).toBe(false);
  });
  it("uses sensitive permission for refunds, credits and adjustments without widening receiving rights", () => {
    for (const kind of ["refund", "credit", "adjustment"] as const) expect(moneyPermission(kind)).toBe("adjustments.approve");
    for (const kind of ["receipt", "deposit", "check_cleared", "check_returned", "exception_opened", "exception_resolved"] as const) expect(moneyPermission(kind)).toBe("reconciliation.manage");
  });
  it("requires one traceable source for exception resolution", () => {
    expect(moneyRequestSchema.safeParse({ campaign_id: id, kind: "exception_resolved", idempotency_key: "resolve", reason: "Synthetic resolution", exception_id: id }).success).toBe(true);
    expect(moneyRequestSchema.safeParse({ campaign_id: id, kind: "exception_resolved", idempotency_key: "resolve", reason: "Synthetic resolution" }).success).toBe(false);
    expect(moneyRequestSchema.safeParse({ campaign_id: id, kind: "exception_resolved", idempotency_key: "resolve", reason: "Synthetic resolution", receipt_id: id, exception_id: id }).success).toBe(false);
  });
});
