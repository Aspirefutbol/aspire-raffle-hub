"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, describeDbError, fail, ok, zodFieldErrors } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { emailSchema } from "@/lib/members/email";
import { addOrInviteMember } from "@/lib/members/service";
import { AdminNotConfiguredError } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONES } from "@/lib/settings/schemas";
import { id, optionalText, requiredText } from "@/lib/validation";
import { JURISDICTION_PROFILES, ORGANIZATION_STATUSES } from "./constants";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/, "Use 1–48 lowercase letters, numbers or dashes.");

const createOrgSchema = z.object({
  name: requiredText("Organization name", 120),
  slug: slugSchema,
  organization_type: z.enum(["sports_club", "nonprofit", "school", "ministry", "community", "other"]),
  timezone: z.enum(TIMEZONES),
  jurisdiction_profile: z.enum(["", ...JURISDICTION_PROFILES]).transform((v) => v || null),
  admin_email: z.union([z.literal(""), emailSchema]).transform((v) => v || null),
});

/** Server-side gate for every platform action (the database re-checks). */
async function requirePlatformAdmin() {
  const user = await getSessionUser();
  return user?.isPlatformAdmin ? user : null;
}

export async function createOrganization(input: unknown): Promise<ActionResult<{ slug: string; adminNote?: string }>> {
  if (!(await requirePlatformAdmin())) return fail("Only platform administrators can create organizations.");
  const parsed = createOrgSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { admin_email, ...org } = parsed.data;

  const supabase = await createClient();
  const { data: created, error } = await supabase.from("organizations").insert(org).select("id, slug").single();
  if (error) {
    return error.code === "23505" ? fail("That URL is taken.", { slug: "Already in use." }) : fail(describeDbError(error));
  }

  let adminNote: string | undefined;
  if (admin_email) {
    try {
      const result = await addOrInviteMember(supabase, created.id, admin_email, ["ORGANIZATION_ADMIN", "DIRECTOR"], "First administrator");
      adminNote =
        result.kind === "added" ? `${admin_email} added as Organization Admin + Director.`
        : result.kind === "invited" ? (result.emailSent ? `Invitation sent to ${admin_email}.` : `Invitation saved; email failed (${result.emailError}).`)
        : `Organization created, but the admin couldn’t be added: ${result.message}`;
    } catch (e) {
      adminNote = e instanceof AdminNotConfiguredError ? `Organization created. ${e.message}` : "Organization created; adding the admin failed.";
    }
  }
  revalidatePath("/platform");
  return ok({ slug: created.slug, adminNote }, `${org.name} created${adminNote ? ` · ${adminNote}` : ""}`);
}

const protectedSchema = z.object({
  organization_id: id,
  slug: slugSchema.optional(),
  status: z.enum(ORGANIZATION_STATUSES).optional(),
  jurisdiction_profile: z.enum(["", ...JURISDICTION_PROFILES]).optional(),
  reason: requiredText("Reason", 300).refine((v) => v.length >= 5, "Give a reason of at least 5 characters."),
});

/** Changes protected organization fields (platform only, reason required, audited). */
export async function updateProtectedOrganization(input: unknown): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) return fail("Only platform administrators can change protected settings.");
  const parsed = protectedSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { organization_id, reason, ...changes } = parsed.data;
  const patch = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
  if (Object.keys(patch).length === 0) return fail("Nothing to change.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_organization", {
    p_organization_id: organization_id,
    p_changes: patch,
    p_reason: reason,
  });
  if (error) {
    return error.code === "23505" ? fail("That URL is taken.", { slug: "Already in use." }) : fail(describeDbError(error));
  }
  revalidatePath("/platform", "layout");
  return ok(undefined, "Protected settings updated · recorded in the activity log");
}

export async function inviteOrganizationAdmin(input: unknown): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) return fail("Only platform administrators can do this.");
  const parsed = z.object({ organization_id: id, email: emailSchema, reason: optionalText(300) }).safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  try {
    const supabase = await createClient();
    const result = await addOrInviteMember(supabase, parsed.data.organization_id, parsed.data.email, ["ORGANIZATION_ADMIN", "DIRECTOR"], parsed.data.reason ?? "Platform-assigned administrator");
    if (result.kind === "error") return fail(result.message, { email: result.message });
    revalidatePath("/platform", "layout");
    return ok(undefined, result.kind === "added" ? `${parsed.data.email} added as administrator` : `Invitation sent to ${parsed.data.email}`);
  } catch (e) {
    if (e instanceof AdminNotConfiguredError) return fail(e.message);
    throw e;
  }
}
