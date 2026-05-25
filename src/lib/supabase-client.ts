// Client-side Supabase client (browser).
// Use this in any "use client" component or hook.
//
// SLICE ONE: returns null when credentials aren't configured yet, so pages can
// render (and statically prerender) without a backend. Callers should handle a
// null client by disabling auth actions. Once NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_ANON_KEY are set, this returns a real client.
import { createBrowserClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(URL && ANON_KEY);
}

export function createClient() {
  if (!URL || !ANON_KEY) return null;
  return createBrowserClient(URL, ANON_KEY);
}
