// Middleware: refreshes the user's auth session on every request.
// Without this, expired tokens won't auto-refresh and users get logged out
// unexpectedly. Runs at the edge before any page renders.
//
// SLICE ONE NOTE: spotlight-live currently ships without Supabase credentials
// (the game is playable without an account). When the env vars are absent we
// simply pass the request through untouched, so the public game and auth pages
// load fine locally. The moment NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are set, the
// full session-refresh + route-protection logic below activates automatically.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Routes that require a signed-in user. The proxy redirects unauthenticated
// requests to /auth/login. Real authz (teacher-vs-student, ownership) is
// done in Server Actions / RLS — the proxy is only an optimistic check, per
// the Next.js 16 proxy docs.
const PROTECTED_PREFIXES: string[] = ["/teacher"];

export async function proxy(request: NextRequest) {
  // No backend configured yet -> nothing to refresh or protect. Pass through.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = PROTECTED_PREFIXES.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );
  if (!user && needsAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
