// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/enroll/[teacherId]/enroll-client.tsx   (NEW FILE)
//
// R2 — Teacher Storefront client component.
//
// Renders the teacher header + class cards. Handles two enrollment paths:
//   1. Visitor is logged in → click "Enroll" → enrolls directly → redirect
//      to /student/dashboard.
//   2. Visitor is anonymous → click "Enroll" → email form slides open →
//      submit → enrollment created + magic link sent → confirmation shown.
//
// The component receives pre-fetched data from the server component so no
// client-side Supabase calls are needed except the server action.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enrollInClass } from "@/app/enroll/actions";
import type { StorefrontTeacher, StorefrontClass } from "./page";

export function EnrollStorefront({
  teacher,
  classes,
  currentUserId,
  currentEmail,
}: {
  teacher: StorefrontTeacher;
  classes: StorefrontClass[];
  currentUserId: string | null;
  currentEmail: string | null;
}) {
  const router = useRouter();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  const isLoggedIn = Boolean(currentUserId && currentEmail);

  // ── Enroll handler ───────────────────────────────────────────────────
  async function handleEnroll(classId: string) {
    if (isLoggedIn) {
      // Logged in — enroll directly
      setSubmitting(true);
      setResult(null);
      const fd = new FormData();
      fd.set("classId", classId);
      fd.set("email", currentEmail!);
      const res = await enrollInClass(fd);
      setSubmitting(false);
      if (res.ok) {
        router.push("/student/dashboard");
      } else {
        setResult({ ok: false, error: res.error });
      }
    } else {
      // Not logged in — show email form for this class
      setSelectedClassId(classId);
      setResult(null);
    }
  }

  // ── Email form submit ────────────────────────────────────────────────
  async function handleSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId || !email.trim()) return;
    setSubmitting(true);
    setResult(null);
    const fd = new FormData();
    fd.set("classId", selectedClassId);
    fd.set("email", email.trim().toLowerCase());
    const res = await enrollInClass(fd);
    setSubmitting(false);
    if (res.ok) {
      setResult({ ok: true, message: res.message });
    } else {
      setResult({ ok: false, error: res.error });
    }
  }

  // ── Format helpers ───────────────────────────────────────────────────
  function formatDate(iso: string | null) {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const availableClasses = classes.filter((c) => c.enrolled < c.capacity);
  const fullClasses = classes.filter((c) => c.enrolled >= c.capacity);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Teacher header ─────────────────────────────────────────── */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            {teacher.avatar_url ? (
              <img
                src={teacher.avatar_url}
                alt=""
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xl font-bold">
                {(teacher.display_name || "T")[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {teacher.display_name || "Teacher"}
              </h1>
              {teacher.bio && (
                <p className="text-gray-600 mt-1">{teacher.bio}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Class cards ────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Available Classes
        </h2>

        {availableClasses.length === 0 && fullClasses.length === 0 && (
          <p className="text-gray-500">
            No classes are available right now. Check back later.
          </p>
        )}

        {availableClasses.length === 0 && fullClasses.length > 0 && (
          <p className="text-gray-500 mb-6">
            All classes are currently full. Check back later for openings.
          </p>
        )}

        <div className="space-y-4">
          {availableClasses.map((cls) => (
            <div
              key={cls.id}
              className="bg-white rounded-lg border shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{cls.name}</h3>

                  {cls.description && (
                    <p className="text-gray-600 text-sm mt-1">
                      {cls.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                    <span>
                      {cls.enrolled}/{cls.capacity} enrolled
                    </span>
                    {cls.time_slot && <span>{cls.time_slot}</span>}
                    {cls.game_starts_at && (
                      <span>Starts {formatDate(cls.game_starts_at)}</span>
                    )}
                    {cls.total_rounds && (
                      <span>{cls.total_rounds} rounds</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleEnroll(cls.id)}
                  disabled={submitting}
                  className="shrink-0 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting && selectedClassId === cls.id
                    ? "Enrolling…"
                    : "Enroll"}
                </button>
              </div>

              {/* ── Email form (shown when this class is selected + visitor is anonymous) ── */}
              {selectedClassId === cls.id && !isLoggedIn && (
                <form
                  onSubmit={handleSubmitEmail}
                  className="mt-4 pt-4 border-t flex items-end gap-3"
                >
                  <div className="flex-1">
                    <label
                      htmlFor={`email-${cls.id}`}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Your email
                    </label>
                    <input
                      id={`email-${cls.id}`}
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? "Sending…" : "Join"}
                  </button>
                </form>
              )}
            </div>
          ))}

          {/* ── Full classes (shown but disabled) ──────────────────── */}
          {fullClasses.map((cls) => (
            <div
              key={cls.id}
              className="bg-white rounded-lg border shadow-sm p-5 opacity-60"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{cls.name}</h3>
                  {cls.description && (
                    <p className="text-gray-600 text-sm mt-1">
                      {cls.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                    <span className="text-amber-600 font-medium">Full</span>
                    {cls.time_slot && <span>{cls.time_slot}</span>}
                  </div>
                </div>
                <span className="shrink-0 px-4 py-2 bg-gray-200 text-gray-500 rounded-md text-sm font-medium cursor-not-allowed">
                  Full
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Global result banner ─────────────────────────────────── */}
        {result && (
          <div
            className={`mt-6 p-4 rounded-md text-sm ${
              result.ok
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {result.ok ? result.message : result.error}
          </div>
        )}
      </div>
    </div>
  );
}
