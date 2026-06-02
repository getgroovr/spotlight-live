// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/ProfileArchive.tsx — the student history strip
// (Slice 1 Part 2). Client component.
//
// Renders one collapsible tile per past class, newest first. The newest class
// starts expanded; older ones collapse to a tile showing the favorite picture
// that started it + the class name + a date. Click a collapsed tile to expand
// it into that class's full Round-1 archive (favorite block, all comments,
// teacher notes) — the SAME layout the dashboard always showed, now per class.
//
// Each expanded class carries a "Download this class (CSV)" link → the
// per-class student export route, which the student can hand to a new teacher.
//
// All visual tokens (C, F) and the archive JSX are matched to the existing
// dashboard so the strip reads as the same product, not a bolt-on.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState } from "react";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
};
const F = "'Outfit',sans-serif";

type Entry = {
  id: string;
  description_text: string | null;
  publicUrl: string | null;
  comment: string;
  isFavorite: boolean;
  teacherNote: string | null;
};

export type ClassArchive = {
  classId: string;
  className: string;
  isCurrent: boolean;
  round: number;
  completedAt: string | null;
  enrolledAt: string | null;
  favoriteComment: string | null;
  entries: Entry[];
  generalNotes: Array<{ body: string; round: number | null }>;
  favoriteThumb: string | null;
};

function fmtDate(s: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return "";
  }
}

// The full archive body for ONE class — lifted from the dashboard's
// complete-state render so an expanded class looks identical to the old
// single-class profile.
function ClassBody({ a }: { a: ClassArchive }) {
  const favorite = a.entries.find((e) => e.isFavorite) || null;
  const classSize = a.entries.length;

  return (
    <div>
      {/* ── FROM YOUR TEACHER (general/welcome notes only) ── */}
      {a.generalNotes.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase",
            color: C.light, marginBottom: 10, marginTop: 0 }}>
            From your teacher
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {a.generalNotes.map((t, i) => (
              <div key={i} style={{ background: C.bg, border: `1px solid ${C.panelEdge}`,
                borderRadius: 14, padding: "14px 16px" }}>
                {t.round != null && (
                  <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>
                    Round {t.round}
                  </div>
                )}
                <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, margin: 0 }}>{t.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── ROUND header ── */}
      <section style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase",
          color: C.light, marginBottom: 4, marginTop: 0 }}>
          Round {a.round}
        </h3>
        {a.completedAt && (
          <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 16 }}>
            Completed {fmtDate(a.completedAt)}
          </div>
        )}
      </section>

      {/* ── FAVORITE ── */}
      {favorite && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Your favorite</div>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start",
            background: C.bg, border: `1px solid ${C.panelEdge}`,
            borderRadius: 16, padding: 16 }}>
            {favorite.publicUrl && (
              <img src={favorite.publicUrl} alt=""
                style={{ width: 200, height: 200, objectFit: "cover", borderRadius: 12,
                  border: `2px solid ${C.light}`, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              {favorite.description_text && (
                <p style={{ fontSize: 14, color: C.text, fontStyle: "italic",
                  margin: "0 0 12px", lineHeight: 1.5,
                  borderLeft: `2px solid ${C.light}`, paddingLeft: 10 }}>
                  &quot;{favorite.description_text}&quot;
                </p>
              )}
              {favorite.comment && (
                <>
                  <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                    What you said during the game:
                  </div>
                  <p style={{ fontSize: 14, color: C.text, margin: "0 0 12px", lineHeight: 1.6 }}>
                    {favorite.comment}
                  </p>
                </>
              )}
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                Why it was your favorite:
              </div>
              <p style={{ fontSize: 14, color: C.text, margin: "0 0 12px", lineHeight: 1.6 }}>
                {a.favoriteComment}
              </p>
              {favorite.teacherNote && (
                <div style={{ background: C.light + "14", border: `1px solid ${C.light}55`,
                  borderLeft: `3px solid ${C.light}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, color: C.light, fontWeight: 700, marginBottom: 3 }}>
                    From your teacher
                  </div>
                  <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.5 }}>
                    {favorite.teacherNote}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── ALL COMMENTS ── */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>All your comments</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {a.entries.map((e) => (
            <div key={e.id} style={{
              background: e.isFavorite ? C.light + "22" : C.bg,
              border: `2px solid ${e.isFavorite ? C.light : C.panelEdge}`,
              borderRadius: 12, padding: 8, position: "relative",
            }}>
              {e.isFavorite && (
                <div style={{
                  position: "absolute", top: -8, right: -8,
                  width: 26, height: 26, borderRadius: "50%",
                  background: C.light, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                }}>★</div>
              )}
              {e.publicUrl && (
                <img src={e.publicUrl} alt=""
                  style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover",
                    borderRadius: 8, display: "block", marginBottom: 6 }} />
              )}
              <div style={{ fontSize: 11, color: C.text, lineHeight: 1.4,
                minHeight: 28, wordBreak: "break-word" }}>
                {e.comment}
              </div>
              {e.teacherNote && (
                <div style={{ marginTop: 6, borderTop: `1px solid ${C.light}55`, paddingTop: 6 }}>
                  <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                    color: C.light, fontWeight: 700, marginBottom: 2 }}>
                    From your teacher
                  </div>
                  <div style={{ fontSize: 11, color: C.text, lineHeight: 1.4, wordBreak: "break-word" }}>
                    {e.teacherNote}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── SEND TO A NEW TEACHER (per-class CSV) ── */}
      <section style={{ borderTop: `1px solid ${C.panelEdge}`, paddingTop: 16 }}>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>
          Moving to a new teacher? Download this class as a spreadsheet and send it to them —
          it saves them gathering all this by hand.
        </div>
        <a
          href={`/student/dashboard/export?class_id=${encodeURIComponent(a.classId)}`}
          style={{
            display: "inline-block", textDecoration: "none",
            background: C.light, color: "#fff", fontFamily: F, fontSize: 13, fontWeight: 700,
            padding: "9px 16px", borderRadius: 10,
          }}
        >
          Download this class (CSV)
        </a>
      </section>
    </div>
  );
}

export default function ProfileArchive({ classes }: { classes: ClassArchive[] }) {
  // Current class starts open; if somehow none is current, fall back to first.
  const initialOpen =
    classes.find((c) => c.isCurrent)?.classId ?? classes[0]?.classId ?? null;
  const [openId, setOpenId] = useState<string | null>(initialOpen);

  if (classes.length === 0) {
    return (
      <section style={{ background: C.panel, border: `1px solid ${C.panelEdge}`,
        borderRadius: 16, padding: "20px 22px" }}>
        <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.6 }}>
          You&apos;re not in any classes yet. Play at <strong>/play</strong> to join one.
        </p>
      </section>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {classes.map((a) => {
        const open = openId === a.classId;
        return (
          <div key={a.classId} style={{
            background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 16,
            overflow: "hidden",
          }}>
            {/* ── TILE HEADER (always visible; click to toggle) ── */}
            <button
              onClick={() => setOpenId(open ? null : a.classId)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 14,
                background: "transparent", border: "none", cursor: "pointer",
                padding: 14, textAlign: "left", fontFamily: F, color: C.text,
              }}
            >
              {a.favoriteThumb ? (
                <img src={a.favoriteThumb} alt=""
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10,
                    border: `2px solid ${C.light}`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0,
                  background: C.panelEdge }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.className}
                  </span>
                  <span style={{
                    fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
                    fontWeight: 700, padding: "2px 7px", borderRadius: 999, flexShrink: 0,
                    background: a.isCurrent ? C.light : "transparent",
                    color: a.isCurrent ? "#fff" : C.textFaint,
                    border: a.isCurrent ? "none" : `1px solid ${C.panelEdge}`,
                  }}>
                    {a.isCurrent ? "Current" : "Past"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.textFaint }}>
                  {fmtDate(a.completedAt || a.enrolledAt)}
                </div>
              </div>
              <div style={{ fontSize: 18, color: C.textDim, transform: open ? "rotate(90deg)" : "none",
                transition: "transform 0.15s", flexShrink: 0 }}>
                ›
              </div>
            </button>

            {/* ── EXPANDED BODY ── */}
            {open && (
              <div style={{ padding: "0 16px 18px" }}>
                <ClassBody a={a} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
