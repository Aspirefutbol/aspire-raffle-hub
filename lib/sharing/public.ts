import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database/types.gen";
import { publicEnv } from "@/lib/env";
import { publicPageSchema, sellerToken } from "./schemas";
// Public key only; never inherit an authenticated cookie or use a service role.
export function supporterClient() {
  const env = publicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function publicSellerPage(token: string) {
  if (!sellerToken.safeParse(token).success) return null;
  const { data, error } = await supporterClient().rpc("public_seller_page", { p_token: token });
  if (error || !data) return null;
  const parsed = publicPageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
