import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { type Permission, type RoleKey, isOrganizationRole, isPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, type SessionUser } from "./session";

export interface OrgContext {
  user: SessionUser;
  organization: {
    id: string;
    name: string;
    slug: string;
    legalName: string | null;
    timezone: string;
  };
  role: RoleKey | null;
  permissions: ReadonlySet<Permission>;
}

export class AuthorizationError extends Error {
  constructor(public readonly permission: Permission) {
    super(`You don't have permission to do that (${permission}).`);
    this.name = "AuthorizationError";
  }
}

/**
 * Resolves user + organization + role + effective permissions for a URL slug.
 * RLS only returns organizations the user belongs to (or all, for SUPER_ADMIN),
 * so an unknown slug and a foreign organization look the same: not found.
 */
export const getOrgContext = cache(async (slug: string): Promise<OrgContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, legal_name, timezone")
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle();
  if (!org) return null;

  const [{ data: perms, error: permsError }, { data: membership }] = await Promise.all([
    supabase.rpc("my_org_permissions", { p_organization_id: org.id }),
    supabase
      .from("organization_members")
      .select("role_key")
      .eq("organization_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (permsError) throw new Error(`Could not load permissions: ${permsError.message}`);

  const roleKey = membership?.role_key;
  const role: RoleKey | null = user.isPlatformAdmin
    ? "SUPER_ADMIN"
    : roleKey && isOrganizationRole(roleKey)
      ? roleKey
      : null;

  return {
    user,
    organization: { id: org.id, name: org.name, slug: org.slug, legalName: org.legal_name, timezone: org.timezone },
    role,
    permissions: new Set((perms ?? []).filter(isPermission)),
  };
});

/** For pages/layouts: redirects anonymous users, 404s for foreign/unknown orgs. */
export async function requireOrgContext(slug: string): Promise<OrgContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getOrgContext(slug);
  if (!ctx) notFound();
  return ctx;
}

export function can(ctx: OrgContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/** Throws AuthorizationError. Server actions convert it into a failed ActionResult. */
export function requirePermission(ctx: OrgContext, permission: Permission): void {
  if (!can(ctx, permission)) throw new AuthorizationError(permission);
}

/** For pages: renders the 404 page rather than leaking that the page exists. */
export function requirePagePermission(ctx: OrgContext, permission: Permission): void {
  if (!can(ctx, permission)) notFound();
}
