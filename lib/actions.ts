import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { AuthorizationError, getOrgContext, requirePermission, type OrgContext } from "@/lib/auth/org-context";
import type { Permission } from "@/lib/permissions";

export type FieldErrors = Record<string, string>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: FieldErrors): { ok: false; error: string; fieldErrors?: FieldErrors } {
  return { ok: false, error, fieldErrors };
}

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Turns database errors into messages an admin can act on. */
export function describeDbError(error: PostgrestError | { message: string; code?: string }): string {
  switch (error.code) {
    case "23505":
      return "That would create a duplicate. A record with the same unique value already exists.";
    case "23503":
      return "A related record is missing or belongs to another organization.";
    case "23514":
      return error.message.startsWith("new row") ? "Some values aren't allowed. Check the form and try again." : error.message;
    case "42501":
      return "You don't have permission to do that.";
    case "PGRST116":
      return "Record not found.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}

/**
 * Standard server-action wrapper: resolves the org from its slug, checks the
 * permission server-side (RLS re-checks in the database), validates input with
 * Zod, and converts thrown errors into a failed ActionResult.
 */
export async function orgAction<S extends z.ZodType, T>(
  orgSlug: string,
  permission: Permission,
  schema: S,
  input: unknown,
  run: (ctx: OrgContext, data: z.infer<S>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getOrgContext(orgSlug);
    if (!ctx) return fail("Organization not found or you are signed out.");
    requirePermission(ctx, permission);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
    return await run(ctx, parsed.data);
  } catch (error) {
    if (error instanceof AuthorizationError) return fail(error.message);
    // Next.js control-flow errors (redirect/notFound) must propagate.
    if (error instanceof Error && "digest" in error) throw error;
    console.error("[orgAction]", error);
    return fail("Something went wrong. Please try again.");
  }
}
