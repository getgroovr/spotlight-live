// ─────────────────────────────────────────────────────────────────────────
// src/app/auth/confirm/route.ts — magic-link landing endpoint.
//
// The enrollment email now points HERE (not straight at the dashboard).
// Supabase puts a one-time token_hash in the link; we exchange it for a
// real auth session cookie via verifyOtp, THEN redirect to the dashboard.
//
// Why this exists: the old link dropped the token into the URL #hash
// fragment, which a server component can never read — so the dashboard
// always thought nobody was logged in. token_hash arrives as a normal
// query param the server CAN read, which fixes that.
// ─────────────────────────────────────────────────────────────────────────
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/student/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (!error) {
        // Session cookie is now set — go to the dashboard.
        redirect(next);
      }
    }
  }

  // Missing/expired token, or verification failed — back to /play.
  redirect("/play");
}