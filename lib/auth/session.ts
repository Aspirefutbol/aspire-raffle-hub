import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  isPlatformAdmin: boolean;
  lastOrganizationId: string | null;
}

/** Current user (verified with the auth server), once per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: platformAdmin }] = await Promise.all([
    supabase.from("profiles").select("full_name, last_organization_id").eq("id", user.id).maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    isPlatformAdmin: Boolean(platformAdmin),
    lastOrganizationId: profile?.last_organization_id ?? null,
  };
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

/** Organizations the current user can open (all of them for a SUPER_ADMIN). */
export const getMyOrganizations = cache(async (): Promise<OrganizationSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(`Could not load organizations: ${error.message}`);
  return data;
});
