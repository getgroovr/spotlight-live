// Server-side Supabase client (Server Components, Route Handlers, Server Actions).
// Reads/writes auth cookies so the user stays logged in across requests.
//
// SLICE ONE: returns null when credentials aren't configured yet, so server
// components and route handlers can run without a backend. Callers must handle
// a null client. Activates automatically once the env vars are set.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(URL && ANON_KEY);
}

export async function createClient() {
  if (!URL || !ANON_KEY) return null;
  const cookieStore = await cookies();

  return createServerClient(URL, ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method can be called from a Server Component.
          // That's fine — proxy refreshes the session, so we can ignore.
        }
      },
    },
  });
}
