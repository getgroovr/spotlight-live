// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/page.tsx   (NEW FILE)
//
// Simple redirect so /teacher doesn't 404. Sends the teacher to the
// class management page (students view).
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";

export default function TeacherIndex() {
  redirect("/teacher/students");
}
