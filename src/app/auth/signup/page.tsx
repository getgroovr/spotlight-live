"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!confirm) {
      setError("Please confirm you're 18 or older.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    if (!supabase) {
      setLoading(false);
      setError("Accounts aren't enabled yet. You can still play without an account.");
      return;
    }
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (signupError) {
      setError(signupError.message);
      return;
    }

    // If email confirmation is ON, Supabase returns a user but no session.
    // If email confirmation is OFF, we get a session immediately and can go to dashboard.
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setNeedsEmailConfirm(true);
    }
  };

  if (needsEmailConfirm) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-purple-950 to-blue-950 p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
          <h1 className="mb-3 text-2xl font-bold text-white">Check your email</h1>
          <p className="text-white/70">
            We sent a confirmation link to <strong>{email}</strong>. Click it to finish signing up.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-purple-950 to-blue-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <h1 className="mb-6 bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-3xl font-extrabold text-transparent">
          Create your Spotlight account
        </h1>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-white/80">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-fuchsia-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/80">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-fuchsia-400"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="mt-1"
            />
            <span>I'm 18 or older and accept the house rules.</span>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/60">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-fuchsia-400 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
