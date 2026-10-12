import { z } from "zod";
import { optionalEmail, optionalPhone, optionalText, requiredText } from "@/lib/validation";

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

export const organizationSchema = z.object({
  name: requiredText("Display name", 120),
  legal_name: optionalText(160),
  timezone: z.enum(TIMEZONES),
  address_line1: optionalText(120),
  address_line2: optionalText(120),
  city: optionalText(80),
  region: optionalText(40),
  postal_code: optionalText(20),
  support_email: optionalEmail,
  support_phone: optionalPhone,
});
export type OrganizationInput = z.input<typeof organizationSchema>;

export const seasonSchema = z
  .object({
    name: requiredText("Season name", 40),
    starts_on: z.string().trim().nullish().transform((v) => v || null),
    ends_on: z.string().trim().nullish().transform((v) => v || null),
    make_current: z.boolean().default(false),
  })
  .refine((s) => !s.starts_on || !s.ends_on || s.starts_on < s.ends_on, { message: "End date must be after the start date.", path: ["ends_on"] });

