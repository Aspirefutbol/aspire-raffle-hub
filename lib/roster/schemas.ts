import { z } from "zod";
import { id, optionalDate, optionalEmail, optionalId, optionalPhone, optionalText, requiredText } from "@/lib/validation";
import { GENDER_DIVISIONS, PLAYER_GENDERS, RELATIONSHIPS } from "./constants";

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? (v as T[number]) : null));

// ── Teams ────────────────────────────────────────────────────────────────────

export const teamInputSchema = z.object({
  name: requiredText("Team name", 80),
  season_id: optionalId,
  age_group: optionalText(20),
  gender_division: optionalEnum(GENDER_DIVISIONS),
  coach_name: optionalText(100),
  team_code: optionalText(20),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type TeamInput = z.input<typeof teamInputSchema>;

// ── Players ──────────────────────────────────────────────────────────────────

export const playerFieldsSchema = z.object({
  first_name: requiredText("First name", 60),
  last_name: requiredText("Last name", 60),
  preferred_name: optionalText(60),
  date_of_birth: optionalDate,
  gender: optionalEnum(PLAYER_GENDERS),
  external_player_id: optionalText(60),
  notes: optionalText(2000),
});

export const guardianFieldsSchema = z.object({
  first_name: requiredText("Guardian first name", 60),
  last_name: requiredText("Guardian last name", 60),
  email: optionalEmail,
  phone: optionalPhone,
  relationship: z.enum(RELATIONSHIPS).default("parent"),
});
export type GuardianFields = z.input<typeof guardianFieldsSchema>;

/** Manual "Add Player". Required: first name, last name, team. */
export const createPlayerSchema = playerFieldsSchema.extend({
  team_id: id.or(z.literal("")).refine((v) => v !== "", "Choose a team."),
  household: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("none") }),
      z.object({ mode: z.literal("existing"), id }),
      z.object({ mode: z.literal("new"), name: requiredText("Household name", 100) }),
    ])
    .default({ mode: "none" }),
  guardian: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("none") }),
      z.object({ mode: z.literal("new") }).extend(guardianFieldsSchema.shape),
    ])
    .default({ mode: "none" }),
});
export type CreatePlayerInput = z.input<typeof createPlayerSchema>;

export const updatePlayerSchema = playerFieldsSchema.extend({
  id,
  status: z.enum(["active", "inactive"]),
});
export type UpdatePlayerInput = z.input<typeof updatePlayerSchema>;

// ── Households & guardians ───────────────────────────────────────────────────

export const householdInputSchema = z.object({
  name: requiredText("Household name", 100),
  address_line1: optionalText(120),
  address_line2: optionalText(120),
  city: optionalText(80),
  region: optionalText(40),
  postal_code: optionalText(20),
  notes: optionalText(2000),
});
export type HouseholdInput = z.input<typeof householdInputSchema>;

export const createGuardianSchema = guardianFieldsSchema.extend({
  household_id: optionalId,
  player_ids: z.array(id).max(50).default([]),
  make_primary: z.boolean().default(false),
});

export const updateGuardianSchema = z.object({
  id,
  first_name: requiredText("First name", 60),
  last_name: requiredText("Last name", 60),
  email: optionalEmail,
  phone: optionalPhone,
  sms_opt_in: z.boolean().default(false),
  email_opt_in: z.boolean().default(true),
});
export type UpdateGuardianInput = z.input<typeof updateGuardianSchema>;
