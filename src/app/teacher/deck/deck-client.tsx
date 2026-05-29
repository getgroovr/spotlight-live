"use client";

// Client half of /teacher/deck: the interactive parts.
//
// Slice 1A / piece 3 changes:
//   1. Photo preview — as soon as a file is picked, render an inline
//      preview *above* the description field so the teacher writes the
//      description while looking at the photo. Server flow unchanged: both
//      fields still submit together in one Server Action call.
//   2. Inline description edit — each starter card now has an "Edit" button
//      that swaps the description into a textarea + Save/Cancel. Saves go
//      through the new updateStarterDescription Server Action.
//
// Slice 1A / piece 4 changes:
//   3. Optimistic delete via useOptimistic — clicking Remove removes the
//      card from the rendered list immediately. If the Server Action
//      returns an error, the optimistic state is discarded automatically
//      and the card reappears, and the error message shows below the
//      upload form. This both fixes the "stale card after delete" bug AND
//      makes any real server-side delete failure visible.
//   4. Tighter grid — pool grid now ladders 1 → 2 → 3 → 4 columns, so on a
//      wide monitor nine photos fit comfortably without taking forever to
//      scroll past.

import { useEffect, useOptimistic, useState, useTransition } from "react";
import {
  uploadStarter,
  deleteStarter,
  updateStarterDescription,
  type UploadResult,
} from "./actions";

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

  // ── Optimistic list ────────────────────────────────────────────────
  // Removing a card updates the UI immediately so we don't depend on
  // revalidatePath round-tripping before the user sees the change.
  // If the Server Action fails, useOptimistic discards the optimistic
  // state automatically when the transition ends, so the original card
  // reappears and the error message shows below the upload form.
  const [optimisticStarters, removeOptimistic] = useOptimistic(
    starters,
    (current: Starter[], deletedId: string) =>
      current.filter((s) => s.id !== deletedId),
  );

  // Preview state for the upload form. Held as an object URL so we can
  // revoke it when it changes — leaving these around leaks memory.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    // Cleanup the object URL whenever previewUrl changes or the component
    // unmounts. Without this, each picked file leaks a blob URL.
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Revoke any old URL first to avoid leaking when the user picks a
    // second file without submitting the first.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f && f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  };

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
      // On success, clear the preview so the form is visibly reset.
      if (r.ok) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    });
  };

  const onDelete = (id: string) => {
    if (!confirm("Remove this photo from the deck?")) return;
    setResult(null);
    startTransition(async () => {
      // Optimistic: the card vanishes from the list immediately. Note this
      // call must be inside the transition — useOptimistic enforces that.
      removeOptimistic(id);
      const r = await deleteStarter(id);
      setResult(r);
      // No manual revert needed on failure: when the transition ends, the
      // optimistic state is discarded and we re-render against the original
      // `starters` prop, which still contains the row.
    });
  };

  return (
    <>
      {/* ── Upload form ──────────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold mb-3">Add a photo</h2>
        <form action={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-white/80">
              Photo (JPEG / PNG / WebP, ≤ 8 MB)
            </label>
            <input
              type="file"
              name="photo"
              required
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
              className="w-full text-sm text-white/90 file:mr-3 file:rounded-md file:border-0 file:bg-fuchsia-500/80 file:px-3 file:py-2 file:text-white"
            />
          </div>

          {/* Live preview — appears as soon as a file is picked, so the
              teacher writes the description while looking at the photo. */}
          {previewUrl && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Selected photo preview"
                className="mx-auto block max-h-72 w-auto rounded"
              />
              <p className="mt-2 text-center text-xs text-white/50">
                Preview — write a description below before adding to the deck.
              </p>
            </div>
          )}

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
        {optimisticStarters.length === 0 ? (
          <p className="text-sm text-white/60">No photos yet.</p>
        ) : (
          // Tighter grid: 1 col on phones, 2 on small tablets, 3 on
          // laptops, 4 on a wide monitor. Each card naturally shrinks as
          // the column count grows, so all 9 starter photos can sit in
          // view without endless scrolling.
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {optimisticStarters.map((s) => (
              <StarterCard
                key={s.id}
                starter={s}
                pending={pending}
                onDelete={() => onDelete(s.id)}
                onSaveResult={setResult}
                startTransition={startTransition}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StarterCard — one entry in the "Current pool" grid.
//
// Two modes:
//   - view : shows the description text + Edit + Remove buttons
//   - edit : shows a textarea + Save + Cancel
//
// Edit state is local to the card so opening one card doesn't unmount the
// others. Save calls updateStarterDescription; on success the card returns
// to view mode and the page revalidates so the new text is canonical.
// ─────────────────────────────────────────────────────────────────────────
function StarterCard({
  starter,
  pending,
  onDelete,
  onSaveResult,
  startTransition,
}: {
  starter: Starter;
  pending: boolean;
  onDelete: () => void;
  onSaveResult: (r: UploadResult) => void;
  startTransition: (cb: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(starter.description_text);

  const startEdit = () => {
    // Reset draft to whatever the current saved text is — handles the case
    // where the user edited, cancelled, and re-opened.
    setDraft(starter.description_text);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(starter.description_text);
    setEditing(false);
  };

  const saveEdit = () => {
    // Client-side preflight matching the server bounds. Cheaper than a
    // round trip for the obvious cases.
    const trimmed = draft.trim();
    if (trimmed.length < 10) {
      onSaveResult({ ok: false, error: "Description must be at least 10 characters." });
      return;
    }
    if (trimmed.length > 1000) {
      onSaveResult({ ok: false, error: "Description is too long (1000 chars max)." });
      return;
    }
    // If nothing changed, just close — no point round-tripping.
    if (trimmed === starter.description_text.trim()) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const r = await updateStarterDescription(starter.id, trimmed);
      onSaveResult(r);
      if (r.ok) setEditing(false);
    });
  };

  return (
    <li className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      {starter.signed_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={starter.signed_url}
          alt=""
          className="block aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="aspect-[4/3] w-full bg-white/10 flex items-center justify-center text-xs text-white/40">
          (image unavailable)
        </div>
      )}
      <div className="p-3 space-y-2">
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              minLength={10}
              maxLength={1000}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-fuchsia-400"
            />
            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={pending}
                className="rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-3 py-1 font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-snug">{starter.description_text}</p>
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>{starter.uploaded_at?.slice(0, 10)}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={pending}
                  className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={pending}
                  className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </li>
  );
}
