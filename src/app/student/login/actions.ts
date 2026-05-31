// ─────────────────────────────────────────────────────────────────────────
// src/app/student/login/actions.ts — returning-student sign-in.
//
// A student who already joined doesn't need to replay the game to get back to
// their profile. This action emails them a magic link, reusing the SAME call
// enrollStudent uses (anon-key client → signInWithOtp → emailRedirectTo
// /auth/confirm, which exchanges token_hash for a session and forwards to the
// profile). Differences from enroll: no game data is saved, and
// shouldCreateUser is FALSE — only existing students can sign in here; brand-
// new people join through /play.
//
// We never reveal whether an email has an account (any send error is logged,
// not shown), and we keep the email out of the URL — we just redirect to
// /student/login?sent=1 and show a generic "check your email" confirmation.
//
// Note: magic links are rate-limited on the Supabase free tier (~3-4 per email
// per hour). A 429 is logged here and the student still sees the "sent" screen.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { redirect } from "next/navigation";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function requestLoginLink(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/student/login?error=email");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    redirect("/student/login?error=config");
  }

  const anon = createServiceClient(supabaseUrl, anonKey);
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  });

  if (error) {
    // Could be "user not found" (no account) or a rate limit. We don't reveal
    // which — log it and show the same confirmation either way.
    console.error("Login link send failed:", error.message);
  }

  redirect("/student/login?sent=1");
}
