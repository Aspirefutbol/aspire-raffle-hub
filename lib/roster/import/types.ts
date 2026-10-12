import { z } from "zod";

/** Editable, mapped values for one import row (stored in import_rows.data). */
export const rowDataSchema = z.object({
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  preferred_name: z.string().nullable().default(null),
  date_of_birth: z.string().nullable().default(null),
  gender: z.string().nullable().default(null),
  external_player_id: z.string().nullable().default(null),
  team: z.string().nullable().default(null),
  team_id: z.string().nullable().default(null),
  allow_unassigned: z.boolean().default(false),
  notes: z.string().nullable().default(null),
  household_name: z.string().nullable().default(null),
  guardian1_first_name: z.string().nullable().default(null),
  guardian1_last_name: z.string().nullable().default(null),
  guardian1_email: z.string().nullable().default(null),
  guardian1_phone: z.string().nullable().default(null),
  guardian1_relationship: z.string().nullable().default(null),
  guardian2_first_name: z.string().nullable().default(null),
  guardian2_last_name: z.string().nullable().default(null),
  guardian2_email: z.string().nullable().default(null),
  guardian2_phone: z.string().nullable().default(null),
  guardian2_relationship: z.string().nullable().default(null),
});
export type RowData = z.infer<typeof rowDataSchema>;

export function parseRowData(value: unknown): RowData {
  const parsed = rowDataSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : rowDataSchema.parse({});
}

export type IssueSeverity = "error" | "warning";
export interface RowIssue {
  code:
    | "missing_first_name"
    | "missing_last_name"
    | "invalid_dob"
    | "invalid_email"
    | "invalid_phone"
    | "unknown_gender"
    | "team_missing"
    | "team_not_found"
    | "guardian_missing_name";
  field: keyof RowData;
  message: string;
  severity: IssueSeverity;
}

export type MatchType = "EXACT_MATCH" | "LIKELY_MATCH" | "NEW_RECORD" | "NEEDS_REVIEW";
export type Resolution = "create" | "use_existing" | "link" | "skip";
export type RowStatus = "pending" | "ready" | "duplicate" | "error" | "skipped" | "imported";

export interface TeamRef {
  id: string;
  name: string;
  team_code: string | null;
  current: boolean;
}

export interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  external_player_id: string | null;
  household_id: string | null;
  guardian_emails: string[];
  guardian_phones: string[];
}

export interface ExistingGuardian {
  email: string | null;
  phone_digits: string | null;
  household_id: string | null;
}
