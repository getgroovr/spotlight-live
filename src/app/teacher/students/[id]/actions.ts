// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/students/[id]/actions.ts
//
// writeTeacherComment — the recruit mechanism (Parked A), per-photo version.
//
// A teacher writes a note attached to one specific photo the student commented
// on. The note then shows on the student's profile UNDER that photo. Photos the
// teacher hasn't written on show nothing — no empty slot.
//
// Uses the USER-SCOPED Supabase client (the teacher's session cookie), so RLS
// is the guard: the insert/update policies only allow writes for classes the
// teacher owns. No service-role key in this mutation path.
//
// One note per (student, photo): if a note already exists for the photo we
// UPDATE it, otherwise we INSERT. An empty body is a no-op (clearing a note
// does not delete it in v1 — deleting is a tiny later follow-up).
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export async function writeTeacherComment(formData: FormData) {
  const studentId = String(formData.get("studentId") || "");
  const classId = String(formData.get("classId") || "");
  const entryId = String(formData.get("entryId") || "") || null;
  const roundRaw = formData.get("round");
  const round =
    roundRaw && String(roundRaw) !== "" ? Number(roundRaw) : null;
  const body = String(formData.get("body") || "").trim();

  // Need a student, a class, and something to say. Empty body = no-op.
  if (!studentId || !classId || !body) return;

  const supabase = await createClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Is there already a note for this photo? (RLS limits this read to the
  // teacher's own classes, so we can only ever find our own notes.)
  let existingId: string | null = null;
  if (entryId) {
    const { data: existing } = await supabase
      .from("teacher_comments")
      .select("id")
      .eq("student_id", studentId)
      .eq("entry_id", entryId)
      .maybeSingle();
    existingId = existing?.id ?? null;
  }

  if (existingId) {
    await supabase
      .from("teacher_comments")
      .update({ body })
      .eq("id", existingId);
  } else {
    await supabase.from("teacher_comments").insert({
      student_id: studentId,
      class_id: classId,
      entry_id: entryId,
      round,
      body,
    });
  }

  // Refresh the teacher detail page so the saved note shows immediately.
  revalidatePath(`/teacher/students/${studentId}`);
}
