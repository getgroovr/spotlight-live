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
//
// Step 6 addition:
//   5. Teacher display_name field — an editable name field at the very top
//      of the page. Reads/writes `profiles.display_name` via the new
//      saveDisplayName server action. Small "Your name" label above a
//      compact inline-save field.

import { useEffect, useOptimistic, useState, useTransition } from "react";
import {
  uploadStarter,
  deleteStarter,
  updateStarterDescription,
  saveDisplayName,
  type UploadResult,
} from "./actions";

type Starter = {
  id: string;
  media_url: string;
  description_text: string;
  signed_url: string | null;
  uploaded_at: string;
};

export function DeckClient({
  starters,
  initialDisplayName,
}: {
  starters: Starter[];
  initialDisplayName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UploadResult | null>(null);

  // ── Optimistic list ────────────────────────────────────────────────
  const [optimisticStarters, removeOptimistic] = useOptimistic(
    starters,
    (current: Starter[], deletedId: string) =>
      current.filter((s) => s.id !== deletedId),
  );

  // Preview state for the upload form.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f && f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  };

  const onSubmit = async (formData: FormData) => {
    const f = formData.get("photo");
    if (f instanceof File && f.size > 8 * 1024 * 1024) {
      setResult({ ok: false, error: "Photo must be 8 MB or smaller." });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const r = await uploadStarter(formData);
      setResult(r);
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
      removeOptimistic(id);
      const r = await deleteStarter(id);
      setResult(r);
    });
  };

  return (
    <>
      {/* ── Display name field (Step 6) ──────────────────────────────── */}
      <DisplayNameField
        initialName={initialDisplayName}
        pending={pending}
        startTransition={startTransition}
      />

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

          {/* Live preview */}
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
// DisplayNameField — Step 6
//
// A compact inline field that reads/writes profiles.display_name. Sits at
// the very top of the deck client, above the upload form. Small "Your name"
// label so the affordance is discoverable (preference #10).
//
// Saves on blur or Enter. Shows a brief "Saved." confirmation. The field
// is visually understated — not a big hero input — because it's a settings
// value, not the page's primary action.
// ─────────────────────────────────────────────────────────────────────────
function DisplayNameField({
  initialName,
  pending,
  startTransition,
}: {
  initialName: string;
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const [name, setName] = useState(initialName);
  const [nameResult, setNameResult] = useState<UploadResult | null>(null);
  // Track what's been persisted so we only save on actual changes.
  const [savedName, setSavedName] = useState(initialName);

  const doSave = () => {
    const trimmed = name.trim();
    if (trimmed === savedName.trim()) return; // no change
    if (trimmed.length === 0) return; // don't save empty
    startTransition(async () => {
      const r = await saveDisplayName(trimmed);
      setNameResult(r);
      if (r.ok) setSavedName(trimmed);
      // Clear the "Saved." message after a moment.
      if (r.ok) setTimeout(() => setNameResult(null), 2000);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSave();
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-white/50">Your name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={doSave}
            onKeyDown={onKeyDown}
            maxLength={100}
            placeholder="Enter your name"
            disabled={pending}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-fuchsia-400 disabled:opacity-50"
          />
        </div>
        {nameResult && !nameResult.ok && (
          <p className="text-xs text-red-400 self-end pb-1">{nameResult.error}</p>
        )}
        {nameResult && nameResult.ok && (
          <p className="text-xs text-emerald-400 self-end pb-1">Saved.</p>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StarterCard — one entry in the "Current pool" grid.
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
    setDraft(starter.description_text);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(starter.description_text);
    setEditing(false);
  };

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed.length < 10) {
      onSaveResult({ ok: false, error: "Description must be at least 10 characters." });
      return;
    }
    if (trimmed.length > 1000) {
      onSaveResult({ ok: false, error: "Description is too long (1000 chars max)." });
      return;
    }
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
