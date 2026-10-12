import { z } from "zod";

/** Postgres uuid (accepts any version, as stored by gen_random_uuid or fixtures). */
export const id = z.guid("Invalid id.");

/** Optional free text from a form: trims, empties become null. */
export function optionalText(max = 200) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((v) => (v ? v : null));
}

export function requiredText(label: string, max = 100) {
  return z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);
}

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address.");

export const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || v.replace(/\D/g, "").length >= 7, "Enter a valid phone number.");

/** YYYY-MM-DD, not in the future, after 1900. */
export const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use the format YYYY-MM-DD.")
  .refine((v) => {
    if (v === null) return true;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.getUTCFullYear() > 1900 && d.getTime() <= Date.now();
  }, "Enter a real date that isn’t in the future.");

export const optionalId = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(id.nullable());

export const idList = z.array(id).min(1, "Select at least one record.").max(1000);
