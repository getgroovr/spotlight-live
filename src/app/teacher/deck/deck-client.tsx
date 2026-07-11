// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/deck/deck-client.tsx  (REPLACES existing)
//
// Session 70 rebuild: multi-mode photo selection.
// Session 75: Added approval status indicators on each photo card.
//   is_active=false → "Pending admin approval" amber banner
//   is_active=true  → "Approved" green badge
//   Mode selection works regardless of approval status, but photos
//   only appear in-game once the admin has approved (is_active=true).
//
// All multi-column layouts use inline styles (Tailwind grid-cols broken).
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import {
  uploadStarter,
  deleteStarter,
  updateStarterDescription,
  toggleModeSelection,
  saveDisplayName,
  type UploadResult,
} from "./actions";

type Starter = {
  id: string;
  media_url: string;
  description_text: string;
  is_active: boolean;
  selected_solo: boolean;
  selected_trio: boolean;
  selected_full: boolean;
  signed_url: string | null;
  uploaded_at: string;
};

type Mode = "solo" | "trio" | "full";

const MODE_LIMITS: Record<Mode, number> = { solo: 9, trio: 3, full: 1 };
const MODE_LABELS: Record<Mode, string> = { solo: "Solo", trio: "Trio", full: "Full" };
const MODE_DESCRIPTIONS: Record<Mode, string> = {
  solo: "1 teacher · 9 photos",
  trio: "3 teachers · 3 photos each",
  full: "9 teachers · 1 photo each",
};

export function DeckClient({
  starters,
  initialDisplayName,
  canUpload,
  activeMode,
}: {
  starters: Starter[];
  initialDisplayName: string;
  canUpload: boolean;
  activeMode: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UploadResult | null>(null);

  const [optimisticStarters, removeOptimistic] = useOptimistic(
    starters,
    (current: Starter[], deletedId: string) =>
      current.filter((s) => s.id !== deletedId),
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Count selections per mode
  const counts: Record<Mode, number> = {
    solo: optimisticStarters.filter((s) => s.selected_solo).length,
    trio: optimisticStarters.filter((s) => s.selected_trio).length,
    full: optimisticStarters.filter((s) => s.selected_full).length,
  };

  const pendingCount = optimisticStarters.filter((s) => !s.is_active).length;

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
      {/* ── Mode selection status ────────────────────────────────────── */}
      <ModeStatusPanel counts={counts} activeMode={activeMode} />

      {/* ── Display name field ───────────────────────────────────────── */}
      <DisplayNameField
        initialName={initialDisplayName}
        pending={pending}
        startTransition={startTransition}
      />

      {/* ── Upload form ──────────────────────────────────────────────── */}
      {canUpload ? (
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

            {previewUrl && (
              <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Selected photo preview"
                  className="mx-auto block max-h-72 w-auto rounded"
                />
                <p className="mt-2 text-center text-xs text-white/50">
                  Preview — write a description below before adding.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm text-white/80">
                Description (shown to students alongside the photo)
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
              <p className="text-sm text-amber-300">
                Uploaded — awaiting admin approval before it appears in the game.
              </p>
            )}
          </form>
        </section>
      ) : (
        <section className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
          <p className="text-sm text-amber-200">
            You need a class before you can upload photos. Ask the admin to create one for you.
          </p>
        </section>
      )}

      {/* ── Photo pool ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Your photos</h2>
        <p className="text-xs text-white/50 mb-4">
          Use the Solo / Trio / Full chips to select which modes each photo appears in.
          {pendingCount > 0 && (
            <span className="text-amber-300">
              {" "}· {pendingCount} photo{pendingCount !== 1 ? "s" : ""} awaiting admin approval.
            </span>
          )}
        </p>
        {optimisticStarters.length === 0 ? (
          <p className="text-sm text-white/60">No photos yet.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            {optimisticStarters.map((s) => (
              <StarterCard
                key={s.id}
                starter={s}
                pending={pending}
                counts={counts}
                onDelete={() => onDelete(s.id)}
                onSaveResult={setResult}
                startTransition={startTransition}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ModeStatusPanel — shows counts for all three modes
// ─────────────────────────────────────────────────────────────────────────
function ModeStatusPanel({
  counts,
  activeMode,
}: {
  counts: Record<Mode, number>;
  activeMode: string;
}) {
  const modes: Mode[] = ["solo", "trio", "full"];

  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        {modes.map((mode) => {
          const count = counts[mode];
          const limit = MODE_LIMITS[mode];
          const ready = count >= limit;
          const isActive = activeMode === mode;

          return (
            <div
              key={mode}
              style={{
                flex: "1 1 0",
                minWidth: "140px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: isActive
                  ? "2px solid rgba(168, 85, 247, 0.5)"
                  : "1px solid rgba(255,255,255,0.08)",
                background: isActive
                  ? "rgba(168, 85, 247, 0.1)"
                  : "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <span style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase" as const,
                  letterSpacing: "1px",
                  color: ready ? "#34d399" : isActive ? "#c084fc" : "rgba(255,255,255,0.5)",
                }}>
                  {MODE_LABELS[mode]}
                </span>
                {isActive && (
                  <span style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    background: "rgba(168,85,247,0.3)",
                    color: "#c084fc",
                    padding: "1px 6px",
                    borderRadius: "999px",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.5px",
                  }}>
                    Active
                  </span>
                )}
              </div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
                <strong>{count}</strong> / {limit} selected
                {ready ? " ✓" : ""}
              </div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
                {MODE_DESCRIPTIONS[mode]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DisplayNameField
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
  const [savedName, setSavedName] = useState(initialName);

  const doSave = () => {
    const trimmed = name.trim();
    if (trimmed === savedName.trim()) return;
    if (trimmed.length === 0) return;
    startTransition(async () => {
      const r = await saveDisplayName(trimmed);
      setNameResult(r);
      if (r.ok) setSavedName(trimmed);
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
// ModeChip — toggle chip for a single mode on a single photo
// ─────────────────────────────────────────────────────────────────────────
function ModeChip({
  mode,
  selected,
  atLimit,
  pending,
  onToggle,
}: {
  mode: Mode;
  selected: boolean;
  atLimit: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  const canSelect = selected || !atLimit;
  const colors: Record<Mode, { on: string; onBg: string }> = {
    solo: { on: "#fbbf24", onBg: "rgba(251,191,36,0.2)" },
    trio: { on: "#34d399", onBg: "rgba(52,211,153,0.2)" },
    full: { on: "#60a5fa", onBg: "rgba(96,165,250,0.2)" },
  };
  const c = colors[mode];

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending || !canSelect}
      style={{
        fontSize: "11px",
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: "999px",
        border: selected ? `1.5px solid ${c.on}` : "1px solid rgba(255,255,255,0.12)",
        background: selected ? c.onBg : "transparent",
        color: selected ? c.on : !canSelect ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.45)",
        cursor: canSelect && !pending ? "pointer" : "default",
        transition: "all 0.15s ease",
        opacity: pending ? 0.5 : 1,
        letterSpacing: "0.5px",
        textTransform: "uppercase" as const,
      }}
    >
      {MODE_LABELS[mode]}
      {selected ? " ✓" : ""}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StarterCard — one entry in the photo pool grid
//
// Session 75: Shows approval status.
//   is_active=false → amber "PENDING" banner at top of card
//   is_active=true  → green "APPROVED" badge on thumbnail
// ─────────────────────────────────────────────────────────────────────────
function StarterCard({
  starter,
  pending,
  counts,
  onDelete,
  onSaveResult,
  startTransition,
}: {
  starter: Starter;
  pending: boolean;
  counts: Record<Mode, number>;
  onDelete: () => void;
  onSaveResult: (r: UploadResult) => void;
  startTransition: (cb: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(starter.description_text);

  const isSelectedAnywhere = starter.selected_solo || starter.selected_trio || starter.selected_full;
  const isApproved = starter.is_active;

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

  const onModeToggle = (mode: Mode) => {
    const currentlySelected =
      mode === "solo" ? starter.selected_solo
      : mode === "trio" ? starter.selected_trio
      : starter.selected_full;
    const newValue = !currentlySelected;

    // Client-side limit check
    if (newValue && counts[mode] >= MODE_LIMITS[mode]) return;

    startTransition(async () => {
      const r = await toggleModeSelection(starter.id, mode, newValue);
      onSaveResult(r);
    });
  };

  return (
    <div
      style={{
        borderRadius: "12px",
        overflow: "hidden",
        border: isApproved
          ? isSelectedAnywhere
            ? "2px solid rgba(168, 85, 247, 0.4)"
            : "2px solid rgba(16, 185, 129, 0.3)"
          : "2px solid rgba(245, 158, 11, 0.3)",
        background: isApproved
          ? isSelectedAnywhere
            ? "rgba(168, 85, 247, 0.06)"
            : "rgba(255,255,255,0.02)"
          : "rgba(245, 158, 11, 0.04)",
        opacity: isApproved ? 1 : 0.85,
        transition: "all 0.2s ease",
      }}
    >
      {/* ── Approval status banner ── */}
      {!isApproved && (
        <div style={{
          background: "rgba(245, 158, 11, 0.15)",
          padding: "4px 10px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
        }}>
          <span style={{ fontSize: "10px", color: "#f59e0b" }}>⏳</span>
          <span style={{
            fontSize: "10px",
            fontWeight: 600,
            color: "#f59e0b",
            letterSpacing: "0.5px",
            textTransform: "uppercase" as const,
          }}>
            Pending admin approval
          </span>
        </div>
      )}

      {/* Photo */}
      <div style={{ position: "relative" }}>
        {starter.signed_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={starter.signed_url}
            alt=""
            style={{
              display: "block",
              aspectRatio: "4/3",
              width: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              aspectRatio: "4/3",
              width: "100%",
              background: "rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            (image unavailable)
          </div>
        )}
        {/* Approved badge on thumbnail */}
        {isApproved && (
          <div style={{
            position: "absolute",
            top: 6,
            right: 6,
            background: "rgba(16, 185, 129, 0.85)",
            color: "#fff",
            fontSize: "9px",
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: "999px",
            letterSpacing: "0.5px",
            textTransform: "uppercase" as const,
          }}>
            ✓ Approved
          </div>
        )}
      </div>

      {/* Mode selection chips */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          padding: "8px 10px",
          background: isSelectedAnywhere
            ? "rgba(168, 85, 247, 0.08)"
            : "rgba(255,255,255,0.03)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          justifyContent: "center",
        }}
      >
        {(["solo", "trio", "full"] as Mode[]).map((mode) => {
          const isSelected =
            mode === "solo" ? starter.selected_solo
            : mode === "trio" ? starter.selected_trio
            : starter.selected_full;
          return (
            <ModeChip
              key={mode}
              mode={mode}
              selected={isSelected}
              atLimit={counts[mode] >= MODE_LIMITS[mode]}
              pending={pending}
              onToggle={() => onModeToggle(mode)}
            />
          );
        })}
      </div>

      {/* Description + controls */}
      <div style={{ padding: "10px 12px" }}>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "8px",
                marginTop: "6px",
              }}
            >
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={pending}
                className="rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: "13px", lineHeight: "1.4", marginBottom: "6px" }}>
              {starter.description_text}
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "12px",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              <span>{starter.uploaded_at?.slice(0, 10)}</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={pending}
                  className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:bg-white/10 disabled:opacity-50"
                  style={{ fontSize: "12px" }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={pending}
                  className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:bg-white/10 disabled:opacity-50"
                  style={{ fontSize: "12px" }}
                >
                  Remove
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
