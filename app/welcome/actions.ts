"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type WelcomeState = { error?: string };

const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(120),
  password: z
    .string()
    .max(128)
    .refine((v) => v === "" || v.length >= 10, "Use at least 10 characters, or leave it blank to sign in with email links."),
});

export async function completeWelcome(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.full_name },
    ...(parsed.data.password ? { password: parsed.data.password } : {}),
  });
  if (error) return { error: error.message };
  await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", user.id);
  redirect("/");
}
