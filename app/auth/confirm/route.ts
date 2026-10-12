import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { acceptPendingInvitations } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "invite", "recovery", "signup", "email_change"];

// Token-hash confirmation links (email templates using {{ .TokenHash }}).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));
  // Always land on the canonical site (never a Netlify deploy alias), where the session cookie lives.
  const canonicalOrigin = publicEnv().NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? origin;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      await acceptPendingInvitations();
      return NextResponse.redirect(new URL(next, canonicalOrigin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", canonicalOrigin));
}
