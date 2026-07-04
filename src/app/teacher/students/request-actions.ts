// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/request-actions.ts   (NEW FILE)
//
// Server action: teacher requests a new class. Inserts into class_requests.
// One pending request at a time per teacher.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export type RequestResult = { ok: true } | { ok: false; error: string };

export async function requestNewClass(): Promise<RequestResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Block if teacher already has a pending request
  const { data: existing } = await supabase
    .from("class_requests")
    .select("id")
    .eq("teacher_id", user.id)
    .eq("status", "pending")
    .limit(1);

  if (existing && existing.length > 0) {
    return { ok: false, error: "You already have a pending request." };
  }

  const { error: insErr } = await supabase
    .from("class_requests")
    .insert({ teacher_id: user.id });

  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/teacher/students");
  return { ok: true };
}
