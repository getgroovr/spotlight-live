// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/deck/deck-client.tsx  (REPLACES existing)
//
// Session 94: Per-class deck with level sections.
//   - Level sections: Beginning, Intermediate, Advanced
//   - Each level: "+ Add class" button, list of class cards
//   - Each class card: collapsible, shows recruiting toggle, warmup
//     title/prompt, upload form, photo grid
//   - Photos are per-class (not per-level)
//
// Session 96: Removed "Your name" display from deck page (redundant
//   with teacher profile page at /teacher/profile).
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useEffect, useState, useTransition } from "react";
import {
  uploadStarter,
  deleteStarter,
  updateStarterDescription,
  toggleInWarmup,
  toggleRecruiting,
  saveWarmupTitle,
  saveWarmupPrompt,
  createClassWithLevel,
  type UploadResult,
} from "./actions";

export type Starter = {
  id: string;
  media_url: string;
  description_text: string;
  is_active: boolean;
  signed_url: string | null;
  uploaded_at: string;
};

export type ClassData = {
  id: string;
  name: string;
  level: string;
  is_recruiting: boolean;
  warmup_title: string;
  warmup_prompt: string;
  photos: Starter[];
};

type Level = "beginner" | "intermediate" | "advanced";
const LEVELS: { key: Level; label: string }[] = [
  { key: "beginner", label: "Beginning" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
];

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  success: "#2B8A3E",
  error: "#C53030",
  recruit: "#2563EB",
};

const CAPACITY_OPTIONS = [
  { value: 9, label: "9 students" },
  { value: 16, label: "16 students" },
  { value: 25, label: "25 students" },
];

// ─────────────────────────────────────────────────────────────────────────
// DeckClient — top-level
// ─────────────────────────────────────────────────────────────────────────
export function DeckClient({
  classes,
  initialDisplayName,
}: {
  classes: ClassData[];
  initialDisplayName?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const onDelete = (id: string) => {
    if (!confirm("Remove this photo from the deck?")) return;
    setDeletedIds((prev) => new Set([...prev, id]));
    startTransition(async () => {
      await deleteStarter(id);
      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };

  return (
    <>
      {LEVELS.map(({ key, label }) => {
        const levelClasses = classes
          .filter((c) => c.level === key)
          .map((c) => ({
            ...c,
            photos: c.photos.filter((p) => !deletedIds.has(p.id)),
          }));
        return (
          <LevelSection
            key={key}
            levelKey={key}
            levelLabel={label}
            classes={levelClasses}
            pending={pending}
            startTransition={startTransition}
            onDelete={onDelete}
          />
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LevelSection — one section per level
// ─────────────────────────────────────────────────────────────────────────
function LevelSection({
  levelKey,
  levelLabel,
  classes,
  pending,
  startTransition,
  onDelete,
}: {
  levelKey: Level;
  levelLabel: string;
  classes: ClassData[];
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onDelete: (id: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCapacity, setCreateCapacity] = useState(9);
  const [createResult, setCreateResult] = useState<UploadResult | null>(null);

  const handleCreate = () => {
    const name = createName.trim();
    if (!name) { setCreateResult({ ok: false, error: "Enter a class name." }); return; }
    setCreateResult(null);
    startTransition(async () => {
      const r = await createClassWithLevel(name, createCapacity, levelKey);
      setCreateResult(r);
      if (r.ok) {
        setCreateName("");
        setCreateCapacity(9);
        setShowCreate(false);
      }
    });
  };

  const totalPhotos = classes.reduce((sum, c) => sum + c.photos.length, 0);

  return (
    <section style={{ marginBottom: 28 }}>
      {/* ── Level header ───────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 0", borderBottom: `2px solid ${C.light}44`, marginBottom: 12,
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: C.text }}>
            {levelLabel}
          </h2>
          <span style={{ fontSize: 12, color: C.textFaint }}>
            {classes.length} {classes.length === 1 ? "class" : "classes"} · {totalPhotos} photo{totalPhotos !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            fontSize: 13, fontWeight: 600, color: C.light,
            background: C.light + "15", border: `1px solid ${C.light}44`,
            borderRadius: 8, padding: "6px 14px",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {showCreate ? "Cancel" : "+ Add class"}
        </button>
      </div>

      {/* ── Inline create class form ───────────────────────────────── */}
      {showCreate && (
        <div style={{
          background: C.panel, border: `1px solid ${C.panelEdge}`,
          borderRadius: 12, padding: "12px 14px", marginBottom: 14,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            New {levelLabel.toLowerCase()} class
          </div>
          <input
            type="text" value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Class name"
            maxLength={100}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
            style={{
              background: "#fff", border: `1px solid ${C.panelEdge}`,
              borderRadius: 8, padding: "7px 10px", fontSize: 13,
              color: C.text, fontFamily: "inherit", outline: "none",
              width: "100%", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}>Size</span>
            <select
              value={createCapacity}
              onChange={(e) => setCreateCapacity(Number(e.target.value))}
              style={{
                background: "#fff", border: `1px solid ${C.panelEdge}`,
                borderRadius: 8, padding: "5px 8px", fontSize: 12,
                color: C.text, fontFamily: "inherit", outline: "none", cursor: "pointer",
              }}
            >
              {CAPACITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={handleCreate}
              disabled={pending || !createName.trim()}
              style={{
                background: C.light, color: "#fff", border: "none",
                borderRadius: 8, padding: "6px 14px", fontSize: 12,
                fontWeight: 700, fontFamily: "inherit",
                cursor: pending || !createName.trim() ? "default" : "pointer",
                opacity: pending || !createName.trim() ? 0.5 : 1,
              }}
            >
              {pending ? "Creating…" : "Create"}
            </button>
            {createResult && !createResult.ok && (
              <span style={{ fontSize: 11, color: C.error }}>{createResult.error}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Class cards ────────────────────────────────────────────── */}
      {classes.length === 0 ? (
        <p style={{
          fontSize: 13, color: C.textDim, textAlign: "center",
          padding: "20px 0", fontStyle: "italic",
        }}>
          No classes at this level yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {classes.map((cls) => (
            <ClassCard
              key={cls.id}
              classData={cls}
              pending={pending}
              startTransition={startTransition}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ClassCard — one collapsible card per class
// ─────────────────────────────────────────────────────────────────────────
function ClassCard({
  classData,
  pending,
  startTransition,
  onDelete,
}: {
  classData: ClassData;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Warmup title state
  const [warmupTitle, setWarmupTitle] = useState(classData.warmup_title);
  const [savedTitle, setSavedTitle] = useState(classData.warmup_title);

  // Warmup prompt state
  const [showPrompt, setShowPrompt] = useState(false);
  const [warmupPrompt, setWarmupPrompt] = useState(classData.warmup_prompt);
  const [savedPrompt, setSavedPrompt] = useState(classData.warmup_prompt);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const activeCount = classData.photos.filter((p) => p.is_active).length;
  const photoCount = classData.photos.length;

  const doSaveTitle = () => {
    const trimmed = warmupTitle.trim();
    if (trimmed === savedTitle.trim()) return;
    startTransition(async () => {
      const r = await saveWarmupTitle(classData.id, trimmed);
      if (r.ok) setSavedTitle(trimmed);
    });
  };

  const doSavePrompt = () => {
    const trimmed = warmupPrompt.trim();
    if (trimmed === savedPrompt.trim()) return;
    startTransition(async () => {
      const r = await saveWarmupPrompt(classData.id, trimmed);
      if (r.ok) setSavedPrompt(trimmed);
    });
  };

  const onToggleRecruiting = () => {
    startTransition(async () => {
      await toggleRecruiting(classData.id, !classData.is_recruiting);
    });
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const onSubmitUpload = async (formData: FormData) => {
    formData.set("class_id", classData.id);
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

  return (
    <div style={{
      background: expanded ? "#fff" : C.panel,
      border: `1px solid ${expanded ? C.light + "66" : C.panelEdge}`,
      borderRadius: 14, overflow: "hidden",
      transition: "all 0.15s ease",
    }}>
      {/* ── Summary bar (click to expand) ────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          gap: 10, padding: "12px 16px",
          background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 12, color: C.textDim, lineHeight: 1, flexShrink: 0 }}>
          {expanded ? "▾" : "▸"}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1, minWidth: 0 }}>
          {classData.name}
        </span>
        <span style={{ fontSize: 12, color: C.textFaint, whiteSpace: "nowrap" }}>
          {photoCount} photo{photoCount !== 1 ? "s" : ""}
          {activeCount > 0 && ` · ${activeCount} in warmup`}
          {activeCount >= 3 && activeCount < 9 &&
            ` · ${9 - activeCount} filler${9 - activeCount !== 1 ? "s" : ""}`}
          {activeCount >= 9 && " · Full grid ✓"}
        </span>
        {classData.is_recruiting && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: C.recruit,
            background: C.recruit + "18", padding: "2px 8px",
            borderRadius: 999, textTransform: "uppercase" as const, letterSpacing: 0.5,
          }}>
            Recruiting
          </span>
        )}
      </button>

      {/* ── Expanded content ──────────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.panelEdge}44` }}>

          {/* ── Recruiting toggle ─────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 0", gap: 10,
          }}>
            <span style={{ fontSize: 13, color: C.textDim }}>
              {activeCount < 3
                ? `Need ${3 - activeCount} more photo${3 - activeCount !== 1 ? "s" : ""} to open warmup`
                : `${activeCount} of ${photoCount} in warmup`}
            </span>
            <button
              type="button" onClick={onToggleRecruiting} disabled={pending}
              style={{
                fontSize: 13, fontWeight: 700, padding: "6px 16px", borderRadius: 999,
                border: classData.is_recruiting ? `2px solid ${C.recruit}` : `1px solid ${C.panelEdge}`,
                background: classData.is_recruiting ? C.recruit + "15" : "transparent",
                color: classData.is_recruiting ? C.recruit : C.textFaint,
                cursor: pending ? "default" : "pointer",
                opacity: pending ? 0.5 : 1, fontFamily: "inherit",
              }}
            >
              {classData.is_recruiting ? "Recruiting ✓" : "Not recruiting"}
            </button>
          </div>

          {/* ── Warmup title ──────────────────────────────────────── */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
              Warmup title
              <span style={{ fontWeight: 400, color: C.textFaint, marginLeft: 6 }}>
                (shown to students at the start)
              </span>
            </label>
            <input
              type="text" value={warmupTitle}
              onChange={(e) => setWarmupTitle(e.target.value)}
              onBlur={doSaveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSaveTitle(); } }}
              placeholder="e.g. Mountain landscapes of the American Southwest"
              maxLength={200} disabled={pending}
              style={{
                width: "100%", boxSizing: "border-box", background: C.panel,
                border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                padding: "7px 10px", fontSize: 13, color: C.text,
                fontFamily: "inherit", outline: "none",
                opacity: pending ? 0.6 : 1,
              }}
            />
          </div>

          {/* ── Warmup prompt (under a button) ────────────────────── */}
          <div style={{ marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setShowPrompt(!showPrompt)}
              style={{
                background: "none", border: "none",
                color: C.textDim, fontSize: 12, fontWeight: 600,
                cursor: "pointer", padding: "4px 0", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 10, lineHeight: 1 }}>{showPrompt ? "▾" : "▸"}</span>
              Warmup prompt
              {warmupPrompt.trim() && (
                <span style={{ fontWeight: 400, color: C.success, fontSize: 11 }}>set ✓</span>
              )}
            </button>
            {showPrompt && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, color: C.textFaint, display: "block", marginBottom: 4 }}>
                  Shown in the comment box while students play — encouragement, guidance, or a fun challenge.
                </span>
                <textarea
                  value={warmupPrompt}
                  onChange={(e) => setWarmupPrompt(e.target.value)}
                  onBlur={doSavePrompt}
                  placeholder="e.g. What do you notice first about this photo? Tell me in 2-3 sentences."
                  rows={2} maxLength={300} disabled={pending}
                  style={{
                    width: "100%", boxSizing: "border-box", background: C.panel,
                    border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                    padding: "7px 10px", fontSize: 13, color: C.text,
                    fontFamily: "inherit", outline: "none", resize: "vertical",
                    opacity: pending ? 0.6 : 1,
                  }}
                />
              </div>
            )}
          </div>

          {/* ── Upload form ───────────────────────────────────────── */}
          <section style={{
            background: C.panel, border: `1px solid ${C.panelEdge}`,
            borderRadius: 12, padding: "14px 16px", marginBottom: 14,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px", color: C.text }}>
              Add a photo
            </h3>
            <form action={onSubmitUpload}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
                  Photo (JPEG / PNG / WebP, ≤ 8 MB)
                </label>
                <input
                  type="file" name="photo" required
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onFileChange}
                  style={{ fontSize: 13, color: C.text }}
                />
              </div>
              {previewUrl && (
                <div style={{
                  borderRadius: 8, border: `1px solid ${C.panelEdge}`,
                  background: "#fff", padding: 6, marginBottom: 10, textAlign: "center",
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Preview" style={{ maxHeight: 160, borderRadius: 6, display: "inline-block" }} />
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
                  Description (shown to students alongside the photo)
                </label>
                <textarea
                  name="description" required minLength={10} maxLength={1000} rows={3}
                  placeholder="What is happening in the photo? Use natural English the students will read while writing their own comments."
                  style={{
                    width: "100%", boxSizing: "border-box", background: "#fff",
                    border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                    padding: "7px 10px", fontSize: 13, color: C.text,
                    fontFamily: "inherit", outline: "none", resize: "vertical",
                  }}
                />
              </div>
              <button
                type="submit" disabled={pending}
                style={{
                  background: C.light, color: "#fff", border: "none",
                  borderRadius: 999, padding: "7px 18px", fontSize: 13,
                  fontWeight: 700, fontFamily: "inherit",
                  cursor: pending ? "default" : "pointer",
                  opacity: pending ? 0.6 : 1,
                }}
              >
                {pending ? "Uploading…" : "Add to deck"}
              </button>
              {result && !result.ok && (
                <p style={{ fontSize: 13, color: C.error, marginTop: 8 }}>{result.error}</p>
              )}
              {result && result.ok && (
                <p style={{ fontSize: 13, color: C.success, marginTop: 8 }}>Photo added.</p>
              )}
            </form>
          </section>

          {/* ── Photo grid ────────────────────────────────────────── */}
          {classData.photos.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textDim, textAlign: "center", padding: "16px 0" }}>
              No photos yet. Upload some above.
            </p>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 14,
            }}>
              {classData.photos.map((s) => (
                <StarterCard
                  key={s.id}
                  starter={s}
                  pending={pending}
                  onDelete={() => onDelete(s.id)}
                  onSaveResult={setResult}
                  startTransition={startTransition}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StarterCard (mostly unchanged from session 93)
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
  const inWarmup = starter.is_active;

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed.length < 10) { onSaveResult({ ok: false, error: "Description must be at least 10 characters." }); return; }
    if (trimmed === starter.description_text.trim()) { setEditing(false); return; }
    startTransition(async () => {
      const r = await updateStarterDescription(starter.id, trimmed);
      onSaveResult(r);
      if (r.ok) setEditing(false);
    });
  };

  const onToggleWarmup = () => {
    startTransition(async () => {
      const r = await toggleInWarmup(starter.id, !inWarmup);
      onSaveResult(r);
    });
  };

  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      border: `1px solid ${inWarmup ? C.light + "66" : C.panelEdge}`,
      background: inWarmup ? "#fff" : C.panel,
      opacity: inWarmup ? 1 : 0.75,
      transition: "all 0.2s ease",
    }}>
      {starter.signed_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={starter.signed_url} alt="" style={{ display: "block", aspectRatio: "4/3", width: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ aspectRatio: "4/3", width: "100%", background: C.panelEdge + "44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.textFaint }}>
          (image unavailable)
        </div>
      )}

      <div style={{ padding: "6px 10px", borderTop: `1px solid ${C.panelEdge}44`, display: "flex", justifyContent: "center" }}>
        <button
          type="button" onClick={onToggleWarmup} disabled={pending}
          style={{
            fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 999,
            border: inWarmup ? `2px solid ${C.light}` : `1px solid ${C.panelEdge}`,
            background: inWarmup ? C.light + "22" : "transparent",
            color: inWarmup ? C.light : C.textFaint,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.5 : 1,
            fontFamily: "inherit", transition: "all 0.15s ease",
          }}
        >
          {inWarmup ? "In warmup ✓" : "Not in warmup"}
        </button>
      </div>

      <div style={{ padding: "6px 10px 10px" }}>
        {editing ? (
          <>
            <textarea
              value={draft} onChange={(e) => setDraft(e.target.value)}
              rows={3} minLength={10} maxLength={1000}
              style={{
                width: "100%", boxSizing: "border-box", background: "#fff",
                border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                padding: "5px 7px", fontSize: 12, color: C.text,
                fontFamily: "inherit", outline: "none", resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
              <button type="button" onClick={() => { setDraft(starter.description_text); setEditing(false); }}
                disabled={pending} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, border: `1px solid ${C.panelEdge}`, background: "transparent", color: C.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button type="button" onClick={saveEdit} disabled={pending}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, border: "none", background: C.light, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: pending ? 0.5 : 1 }}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, lineHeight: 1.4, margin: "0 0 4px", color: C.text }}>
              {starter.description_text}
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: C.textFaint }}>
              <span>{starter.uploaded_at?.slice(0, 10)}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" onClick={() => { setDraft(starter.description_text); setEditing(true); }}
                  disabled={pending} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.panelEdge}`, background: "transparent", color: C.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                  Edit
                </button>
                <button type="button" onClick={onDelete} disabled={pending}
                  style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.panelEdge}`, background: "transparent", color: C.textDim, cursor: "pointer", fontFamily: "inherit" }}>
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
