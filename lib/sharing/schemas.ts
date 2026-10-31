import { z } from "zod";
import { ticketBundlesSchema } from "@/lib/fundraising/campaign-pricing";
export const sellerToken = z.string().regex(/^[a-f0-9]{64}$/);
const email = z.union([z.literal(""), z.email().max(254)]);
const phone = z.string().max(50).refine(v => !v || /^\+?[0-9() .-]{7,50}$/.test(v), "Enter a valid phone number.");
export const interestSchema = z.object({
  name: z.string().trim().min(1).max(200), email, phone, contact: z.enum(["email", "phone"]),
  quantity: z.number().int().min(1).max(100), note: z.string().max(1000), website: z.string().max(200),
}).strict().refine(v => Boolean(v[v.contact]), "Provide your preferred contact details.");
export const submissionSchema = z.object({ key: z.uuid(), request: interestSchema }).strict();
export const requestRowSchema = z.object({
  id: z.uuid(), participant_id: z.uuid(), supporter_name: z.string(), supporter_email: z.string().nullable(),
  supporter_phone: z.string().nullable(), preferred_contact: z.enum(["email", "phone"]), requested_quantity: z.number().int(),
  note: z.string(), created_at: z.string(), status: z.enum(["new", "contacted", "completed", "declined", "expired"]), sale_id: z.uuid().nullable(),
});
export const publicPageSchema = z.object({organization: z.string(), campaign: z.string(), description: z.string().nullable(), rules: z.string().nullable(), ticket_price_cents: z.number(), ticket_packages: ticketBundlesSchema.default([]), sales_close_at: z.string(), draw_at: z.string(), timezone: z.string(), support_email: z.string().nullable(), support_phone: z.string().nullable(), requests_open: z.literal(true)});
export type InterestRequest = z.infer<typeof requestRowSchema>;
export function shareLinks(url: string, price: string, packages = "") {
  const text = `I’m helping raise funds for Aspire. Raffle tickets are ${price} each${packages ? `; ${packages}` : ""}. Use this page to let me know how many you’d like, and I’ll follow up with offline payment and ticket details: ${url}`;
  return { text, sms: `sms:?body=${encodeURIComponent(text)}`, email: `mailto:?subject=${encodeURIComponent("Support our fundraiser")}&body=${encodeURIComponent(text)}`, whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}` };
}
