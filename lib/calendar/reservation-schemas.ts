import { z } from "zod";
import { calendarImpactQuote, type CalendarMultiplier } from "./pricing";

// This is a transport parser, not authorization. Route handlers must derive
// tenant/campaign context from a verified session or reviewed seller token.
// Browser-provided amounts, organization IDs, and Stripe state are forbidden.
export const calendarReservationRequestSchema = z.strictObject({
  participantId: z.string().uuid(),
  requestKey: z.string().uuid(),
  days: z.array(z.number().int().min(1).max(31)).min(1).max(31)
    .refine(days => new Set(days).size === days.length, "Select each day only once."),
  multiplier: z.number().int().min(1).max(5).default(1),
  supporterName: z.string().trim().min(1).max(200),
  supporterEmail: z.string().trim().toLowerCase().email().max(254),
});

export type CalendarReservationRequest = z.output<typeof calendarReservationRequestSchema>;

export function parseCalendarReservationRequest(input: unknown) {
  const parsed = calendarReservationRequestSchema.parse(input);
  const quote = calendarImpactQuote(parsed.days, parsed.multiplier as CalendarMultiplier);
  return { request: parsed, quote };
}
