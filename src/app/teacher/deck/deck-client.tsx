"use client";

// Client half of /teacher/deck: the interactive parts — upload form with
// live validation, per-row delete buttons, and result toasts. Pure UI; all
// the actual work happens in the Server Action.

import { useState, useTransition } from "react";
import { uploadStarter, deleteStarter, type UploadResult } from "./actions";

type Starter = {
  id: string;
  media_url: string;
  description_text: string;
  signed_url: string | null;
  uploaded_at: string;
};

export function DeckClient({ starters }: { starters: Starter[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UploadResult | null>(null);

  const onSubmit = async (formData: FormData) => {
    // Client-side preflight on file size. The Server Action also checks, but
    // a file larger than the proxy's 12 MB body limit would arrive truncated;
    // catching it here avoids any chance of that and gives a faster error.
    const f = formData.get("photo");
    if (f instanceof File && f.size > 8 * 1024 * 1024) {
      setResult({ ok: false, error: "Photo must be 8 MB or smaller." });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const r = await uploadStarter(formData);
      setResult(r);
    });
  };

  const onDelete = (id: string) => {
    if (!confirm("Remove this photo from the deck?")) return;
    setResult(null);
    startTransition(async () => {
      const r = await deleteStarter(id);
      setResult(r);
    });
  };

  return (
    <>
      {/* ── Upload form ──────────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold mb-3">Add a photo</h2>
        <form action={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-white/80">Photo (JPEG / PNG / WebP, ≤ 8 MB)</label>
            <input
              type="file"
              name="photo"
              required
              accept="image/jpeg,image/png,image/webp"
              className="w-full text-sm text-white/90 file:mr-3 file:rounded-md file:border-0 file:bg-fuchsia-500/80 file:px-3 file:py-2 file:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-white/80">
              Description (will be shown to students alongside the photo)
            </label>
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              placeholder="What is happening in the photo? Use natural English the students will read while writing their own comments."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-fuchsia-400"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-6 py-2 font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Uploading..." : "Add to deck"}
          </button>

          {result && !result.ok && (
            <p className="text-sm text-red-400">{result.error}</p>
          )}
          {result && result.ok && (
            <p className="text-sm text-emerald-400">Saved.</p>
          )}
        </form>
      </section>

      {/* ── Current pool ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Current pool</h2>
        {starters.length === 0 ? (
          <p className="text-sm text-white/60">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {starters.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
              >
                {s.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.signed_url}
                    alt=""
                    className="block aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="aspect-[4/3] w-full bg-white/10 flex items-center justify-center text-xs text-white/40">
                    (image unavailable)
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <p className="text-sm leading-snug">{s.description_text}</p>
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>{s.uploaded_at?.slice(0, 10)}</span>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      disabled={pending}
                      className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:bg-white/10 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
