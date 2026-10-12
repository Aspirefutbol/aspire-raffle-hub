import { z } from "zod";

/** Canonical form used for every email comparison: trimmed, lowercase. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export const emailSchema = z
  .string({ error: "Enter an email address." })
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254));
