import { z } from "zod";
import { id } from "@/lib/validation";
import type { Permission } from "@/lib/permissions";

export const MONEY_KINDS = ["receipt", "check_cleared", "check_returned", "exception_opened", "exception_resolved", "refund", "credit", "adjustment", "deposit"] as const;
export type MoneyKind = typeof MONEY_KINDS[number];
export function moneyPermission(kind: MoneyKind): Permission {
  return ["refund", "credit", "adjustment"].includes(kind) ? "adjustments.approve" : "reconciliation.manage";
}
export const moneyRequestSchema = z.object({
  campaign_id: id,
  kind: z.enum(MONEY_KINDS),
  idempotency_key: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3).max(500),
  reference: z.string().trim().max(200).optional(),
  amount_cents: z.number().int().safe().min(-1_000_000_000_000).max(1_000_000_000_000).optional(),
  seller_id: id.optional(),
  receipt_id: id.optional(),
  sale_id: id.optional(),
  target_sale_id: id.optional(),
  exception_id: id.optional(),
  payment_method: z.enum(["cash", "check"]).optional(),
}).strict().superRefine((value, ctx) => {
  const required = (field: "seller_id" | "receipt_id" | "sale_id" | "target_sale_id" | "payment_method") => {
    if (!value[field]) ctx.addIssue({ code: "custom", path: [field], message: "Select a value." });
  };
  if (["receipt", "refund", "credit", "adjustment", "deposit", "exception_opened"].includes(value.kind)) {
    if (!value.amount_cents || (value.kind !== "adjustment" && value.amount_cents < 0))
      ctx.addIssue({ code: "custom", path: ["amount_cents"], message: "Enter a nonzero amount (positive except for undoing an adjustment)." });
  }
  if (value.kind === "receipt") { required("seller_id"); required("payment_method"); }
  else if (["adjustment", "exception_opened"].includes(value.kind)) required("sale_id");
  else if (value.kind === "exception_resolved" && value.exception_id) { /* explicit non-check exception */ }
  else required("receipt_id");
  if (["refund", "credit"].includes(value.kind)) required("sale_id");
  if (value.kind === "credit") required("target_sale_id");
  if (value.kind === "exception_resolved" && Boolean(value.receipt_id) === Boolean(value.exception_id))
    ctx.addIssue({ code: "custom", path: ["exception_id"], message: "Choose one check receipt or one other exception." });
});

const cents = z.number().int().safe();
export const moneyBalancesSchema = z.object({
  recorded_cents: cents, expected_cents: cents, received_cents: cents,
  outstanding_cents: cents, reconciled_cents: cents, exception_cents: cents,
  uncleared_cents: cents, credit_cents: cents, adjustment_cents: cents, deposited_cents: cents,
});
export const moneyProjectionSchema = z.object({
  totals: moneyBalancesSchema,
  participants: z.array(moneyBalancesSchema.extend({ id, player_id: id, player_name: z.string(), team_id: id.nullable(), team_name: z.string().nullable() })),
  teams: z.array(moneyBalancesSchema.extend({ id: id.nullable(), name: z.string().nullable() })),
  sellers: z.array(z.object({ id, name: z.string(), expected_cents: cents, received_cents: cents, outstanding_cents: cents,
    credit_cents: cents, reconciled_cents: cents, exception_cents: cents, uncleared_cents: cents, deposited_cents: cents })),
  events: z.array(z.object({ id, kind: z.enum(MONEY_KINDS), seller_id: id, receipt_id: id.nullable(), sale_id: id.nullable(),
    target_sale_id: id.nullable(), exception_id: id.nullable(), amount_cents: cents, payment_method: z.enum(["cash", "check"]).nullable(),
    reference: z.string().nullable(), reason: z.string(), actor_id: id, occurred_at: z.string() })),
  sales: z.array(z.object({ id, participant_id: id, seller_id: id, recorded_cents: cents, expected_cents: cents, received_cents: cents,
    adjustment_cents: cents, deposited_cents: cents, uncleared_cents: cents, exception_cents: cents, sold_at: z.string(), payment_method: z.string() })),
});
export const custodyResultSchema = z.object({ event_id: id, amount_cents: cents, replayed: z.boolean() });
export type MoneyBalances = z.infer<typeof moneyBalancesSchema>;
export type MoneyProjection = z.infer<typeof moneyProjectionSchema>;
