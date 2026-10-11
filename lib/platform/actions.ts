"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, describeDbError, fail, ok, zodFieldErrors } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { optionalEmail, requiredText } from "@/lib/validation";
import { TIMEZONES } from "@/lib/settings/schemas";

const createOrgSchema = z.object({
  name: requiredText("Organization name", 120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/, "Use 1–48 lowercase letters, numbers or dashes."),
  organization_type: z.enum(["sports_club", "nonprofit", "school", "ministry", "community", "other"]),
  timezone: z.enum(TIMEZONES),
  jurisdiction_profile: z.enum(["", "TEXAS_CREA_OFFLINE_PAYMENT"]).transform((v) => v || null),
  admin_email: optionalEmail,
});

/** SUPER_ADMIN only. RLS also restricts organization inserts to platform admins. */
export async function createOrganization(input: unknown): Promise<ActionResult<{ slug: string }>> {
  const user = await getSessionUser();
  if (!user?.isPlatformAdmin) return fail("Only platform administrators can create organizations.");
  const parsed = createOrgSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { admin_email, ...org } = parsed.data;

  const supabase = await createClient();
  let adminId: string | null = null;
  if (admin_email) {
    const { data: profile } = await supabase.from("profiles").select("id").ilike("email", admin_email).maybeSingle();
    if (!profile) return fail("No account exists with that email yet. Create the user first, or leave it blank.", { admin_email: "No account with this email." });
    adminId = profile.id;
  }

  const { data: created, error } = await supabase.from("organizations").insert(org).select("id, slug").single();
  if (error) {
    return error.code === "23505" ? fail("That URL is taken.", { slug: "Already in use." }) : fail(describeDbError(error));
  }
  if (adminId) {
    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ organization_id: created.id, user_id: adminId, role_key: "ORGANIZATION_ADMIN" });
    if (memberError) return fail(`Organization created, but the admin couldn’t be added: ${describeDbError(memberError)}`);
  }
  revalidatePath("/platform");
  return ok({ slug: created.slug }, `${org.name} created`);
}
