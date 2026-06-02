// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/social/actions.ts — Server Actions for the moderation surface
//
// Four gates, each a thin wrapper over a SECURITY DEFINER RPC that already
// self-authorizes via owns_class() in the database:
//   - approveSubmission / rejectSubmission  → approve_submission / reject_submission(p_submission_id)
//   - approveComment    / rejectComment     → approve_comment    / reject_comment(p_comment_id)
//
// Like the deck actions: Server Actions are reachable by direct POST, so the
// screen's existence is NOT authorization. We re-check on every call. The RPC
// then enforces class ownership in the DB regardless of this layer, so a
// caller who somehow reached the action for a class they don't own gets a
// raise from owns_class() rather than a silent success.
//
// The gate RPCs RETURN the affected row (a `submissions` / `submission_comments`
// record). A non-null return is our success signal; a null return with no error
// means the row wasn't found / wasn't in an owned class.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export type GateResult = { ok: true } | { ok: false; error: string };

const SURFACE_PATH = "/teacher/social";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

// Shared auth perimeter. Returns the client + confirmed-teacher, or an error.
// Factored (unlike the deck actions, which inline it) because four gates would
// otherwise repeat the same six lines verbatim.
async function requireTeacher(): Promise<
  { ok: true; supabase: Client } | { ok: false; error: string }
> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be logged in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, error: "Only teachers can moderate." };
  }
  return { ok: true, supabase };
}

// ── Submissions (the upload gate) ───────────────────────────────────────────
export async function approveSubmission(submissionId: string): Promise<GateResult> {
  const auth = await requireTeacher();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc("approve_submission", {
    p_submission_id: submissionId,
  });
  if (error) return { ok: false, error: `Approve failed: ${error.message}` };
  if (!data) {
    return { ok: false, error: "Nothing changed — that photo isn’t in a class you own." };
  }
  revalidatePath(SURFACE_PATH);
  return { ok: true };
}

export async function rejectSubmission(submissionId: string): Promise<GateResult> {
  const auth = await requireTeacher();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc("reject_submission", {
    p_submission_id: submissionId,
  });
  if (error) return { ok: false, error: `Reject failed: ${error.message}` };
  if (!data) {
    return { ok: false, error: "Nothing changed — that photo isn’t in a class you own." };
  }
  revalidatePath(SURFACE_PATH);
  return { ok: true };
}

// ── Comments (the comment gate) ─────────────────────────────────────────────
export async function approveComment(commentId: string): Promise<GateResult> {
  const auth = await requireTeacher();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc("approve_comment", {
    p_comment_id: commentId,
  });
  if (error) return { ok: false, error: `Approve failed: ${error.message}` };
  if (!data) {
    return { ok: false, error: "Nothing changed — that comment isn’t in a class you own." };
  }
  revalidatePath(SURFACE_PATH);
  return { ok: true };
}

export async function rejectComment(commentId: string): Promise<GateResult> {
  const auth = await requireTeacher();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc("reject_comment", {
    p_comment_id: commentId,
  });
  if (error) return { ok: false, error: `Reject failed: ${error.message}` };
  if (!data) {
    return { ok: false, error: "Nothing changed — that comment isn’t in a class you own." };
  }
  revalidatePath(SURFACE_PATH);
  return { ok: true };
}
