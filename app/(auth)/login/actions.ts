"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/redirect";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; info?: string; email?: string };

const passwordSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return { error: "That email and password don't match an account. Try again or use a sign-in link.", email };
  }
  redirect(safeNextPath(parsed.data.next));
}

const magicSchema = z.object({ email: z.email("Enter a valid email address."), next: z.string().optional() });

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = magicSchema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const origin = publicEnv().NEXT_PUBLIC_SITE_URL ?? `https://${(await headers()).get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false, // accounts are provisioned by an organization, not self-signup
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNextPath(parsed.data.next))}`,
    },
  });
  // Same message whether or not the account exists (no account enumeration).
  if (error && error.status !== 400 && error.status !== 422) {
    return { error: "We couldn't send a link right now. Please try again shortly.", email };
  }
  return { info: `If ${parsed.data.email} has an account, a sign-in link is on its way.`, email };
}
