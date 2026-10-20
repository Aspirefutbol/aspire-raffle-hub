import "server-only";
import { z } from "zod";
import type { OrgContext } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().nullish().transform((v) => v ?? null),
  city: z.string().min(1),
  region: z.string().min(1),
  postal_code: z.string().nullish().transform((v) => v ?? null),
  country: z.string().nullish().transform((v) => v ?? null),
});

export const ticketReceiptSchema = z.object({
  sale_id: id,
  campaign_id: id,
  campaign_name: z.string(),
  buyer_name: z.string(),
  sold_at: z.string(),
  amount_cents: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  payment_method: z.enum(["cash", "check"]),
  reversed: z.boolean(),
  tickets: z.array(z.object({
    ticket_number: z.string(),
    status: z.enum(["AVAILABLE", "ALLOCATED", "ISSUED", "VOIDED"]),
  })),
  operator_legal_name: z.string().nullish().transform((v) => v ?? null),
  operator_address: addressSchema.nullish().transform((v) => v ?? null),
  ticket_price_cents: z.number().int().positive().nullish().transform((v) => v ?? null),
  prize_description: z.string().nullish().transform((v) => v ?? null),
  charitable_purpose: z.string().nullish().transform((v) => v ?? null),
  draw_at: z.string().nullish().transform((v) => v ?? null),
  timezone: z.string().nullish().transform((v) => v ?? null),
  support_email: z.string().nullish().transform((v) => v ?? null),
  support_phone: z.string().nullish().transform((v) => v ?? null),
  rules_text: z.string().nullish().transform((v) => v ?? null),
});

export type TicketReceipt = z.infer<typeof ticketReceiptSchema>;

export async function getSaleTicketReceipt(ctx: OrgContext, saleId: string): Promise<TicketReceipt | null> {
  const checked = id.safeParse(saleId);
  if (!checked.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sale_ticket_receipt", {
    p_organization_id: ctx.organization.id,
    p_sale_id: checked.data,
  });
  if (error?.code === "42501" || error?.code === "P0002") return null;
  if (error) throw new Error("Could not load issued raffle ticket.");
  const parsed = ticketReceiptSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
