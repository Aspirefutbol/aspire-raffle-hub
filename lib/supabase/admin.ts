import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database/types.gen";
import { publicEnv } from "@/lib/env";

/**
 * Service-role client — the ONLY place the app touches the service-role key.
 *
 * Allowed uses (each called only after the caller's permission was checked
 * server-side):
 *   1. Exact email → user lookup (public.auth_user_id_by_email, service_role only)
 *   2. Sending Supabase Auth invitation emails
 *
 * Never use it to read or write organization data: those writes must go through
 * the signed-in user's client so RLS and audit attribution apply.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new AdminNotConfiguredError();
  }
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class AdminNotConfiguredError extends Error {
  constructor() {
    super("Invitations aren’t configured on this server (SUPABASE_SECRET_KEY is missing).");
    this.name = "AdminNotConfiguredError";
  }
}

export function siteUrl(): string {
  const configured = publicEnv().NEXT_PUBLIC_SITE_URL;
  if (!configured) {
    // Never derive auth redirect URLs from request headers.
    throw new Error("NEXT_PUBLIC_SITE_URL must be set to send invitations.");
  }
  return configured.replace(/\/$/, "");
}
