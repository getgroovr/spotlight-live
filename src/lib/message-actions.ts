// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/lib/message-actions.ts   (NEW file)
//
// Server actions for the messaging system. Used by all three dashboards
// (student, teacher, admin) via the MessagePanel client component.
//
// Session 77: initial implementation.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

const MAX_BODY = 280;

// ── Send a message ──────────────────────────────────────────────────────
export async function sendMessage(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Server not configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const recipientId = formData.get("recipientId") as string;
  const body = (formData.get("body") as string || "").trim();
  const classId = (formData.get("classId") as string) || null;

  if (!recipientId) return { error: "No recipient selected" };
  if (!body) return { error: "Message is empty" };
  if (body.length > MAX_BODY) return { error: `Message too long (${MAX_BODY} char limit)` };
  if (recipientId === user.id) return { error: "Cannot message yourself" };

  const { error } = await supabase.from("messages").insert({
    sender_id: user.id,
    recipient_id: recipientId,
    class_id: classId || null,
    body,
  });

  if (error) {
    console.error("[sendMessage]", error);
    return { error: "Failed to send message" };
  }

  // Revalidate all dashboard paths so the recipient sees the new message
  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/students");
  revalidatePath("/admin");

  return { success: true };
}

// ── Send to all students in a class (teacher only) ──────────────────────
export async function sendMessageToAll(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return { error: "Server not configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const classId = formData.get("classId") as string;
  const body = (formData.get("body") as string || "").trim();

  if (!classId) return { error: "No class selected" };
  if (!body) return { error: "Message is empty" };
  if (body.length > MAX_BODY) return { error: `Message too long (${MAX_BODY} char limit)` };

  // Verify this teacher owns the class
  const { data: cls } = await supabase
    .from("classes")
    .select("id, teacher_id")
    .eq("id", classId)
    .single();

  if (!cls || cls.teacher_id !== user.id) {
    return { error: "Not authorized for this class" };
  }

  // Get all enrolled student IDs
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id")
    .eq("class_id", classId)
    .eq("status", "active");

  if (!enrollments || enrollments.length === 0) {
    return { error: "No students enrolled" };
  }

  // Insert one message per student
  const rows = enrollments.map((e) => ({
    sender_id: user.id,
    recipient_id: e.student_id,
    class_id: classId,
    body,
  }));

  const { error } = await supabase.from("messages").insert(rows);

  if (error) {
    console.error("[sendMessageToAll]", error);
    return { error: "Failed to send messages" };
  }

  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/students");
  revalidatePath("/admin");

  return { success: true, count: enrollments.length };
}

// ── Mark a single message as read ───────────────────────────────────────
export async function markMessageRead(messageId: string) {
  const supabase = await createClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("messages")
    .update({ is_read: true })
    .eq("id", messageId);

  if (error) console.error("[markMessageRead]", error);

  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/students");
  revalidatePath("/admin");
}

// ── Mark all messages as read for the current user ──────────────────────
export async function markAllRead() {
  const supabase = await createClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("messages")
    .update({ is_read: true })
    .eq("recipient_id", user.id)
    .eq("is_read", false);

  if (error) console.error("[markAllRead]", error);

  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/students");
  revalidatePath("/admin");
}
