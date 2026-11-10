import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { acceptPendingInvitations } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "invite", "recovery", "email_change"];
const NEXT_COOKIE = "rh_auth_next";
const COOKIE_PATH = "/auth/confirm";

// Only canonical email links may deliver the token_hash. The email itself
// cannot choose the post-auth destination; a browser-local cookie may do so.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const canonicalOrigin = publicEnv().NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? origin;
  const next = safeNextPath(request.cookies.get(NEXT_COOKIE)?.value);
  const landing = type === "invite" || type === "recovery"
    ? "/welcome"
    : type === "email_change" ? "/" : next;

  const respond = (path: string) => {
    const response = NextResponse.redirect(new URL(path, canonicalOrigin));
    // Exact Path is required to clear a cookie scoped to /auth/confirm.
    response.cookies.set(NEXT_COOKIE, "", {
      path: COOKIE_PATH,
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: canonicalOrigin.startsWith("https://"),
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      await acceptPendingInvitations();
      return respond(landing);
    }
  }

  return respond("/login?error=link");
}
