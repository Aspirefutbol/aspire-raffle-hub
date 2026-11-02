import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database/types.gen";
import { publicEnv } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/auth", "/s"];

/**
 * The hostname the browser actually requested. Behind a proxy or under
 * `next start`, nextUrl can reflect the internal bind address, so prefer the
 * forwarded/Host header. Spoofing it can only trigger a redirect to the
 * configured canonical site.
 */
function requestHostname(request: NextRequest): string {
  const header = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim();
  if (header) {
    try {
      return new URL(`http://${header}`).hostname;
    } catch {
      // fall through to nextUrl
    }
  }
  return request.nextUrl.hostname;
}

/**
 * Netlify serves every deploy and branch on an alias such as
 * `<deploy-id>--<site>.netlify.app`. Cookies don't cross hostnames, so a
 * session created on an alias is lost on the canonical site. Send alias
 * requests to the canonical origin with the exact path and query (e.g.
 * /auth/confirm?token_hash=…) before any Supabase session work happens.
 */
export function canonicalizeNetlifyDeployUrl(request: NextRequest, siteUrl?: string): NextResponse | null {
  if (!siteUrl) return null;

  const canonical = new URL(siteUrl);
  const requestHost = requestHostname(request);
  const deployAliasSuffix = `--${canonical.hostname}`;

  if (requestHost !== canonical.hostname && requestHost.endsWith(deployAliasSuffix)) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical.origin);
    return NextResponse.redirect(url);
  }

  return null;
}

/** Refreshes the Supabase session cookie and redirects anonymous users to /login. */
export async function updateSession(request: NextRequest) {
  const env = publicEnv();

  // Must run before createServerClient/getUser so auth cookies are only ever
  // set on the canonical host.
  const canonicalRedirect = canonicalizeNetlifyDeployUrl(request, env.NEXT_PUBLIC_SITE_URL);
  if (canonicalRedirect) return canonicalRedirect;

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not run code between createServerClient and getUser(): it refreshes the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}
