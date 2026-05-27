"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  STUDENTS,
  TEACHER,
  liveEntry,
  archivedEntries,
  addEntry,
  buildSessionCSV,
  buildSessionRows,
  sessionFilename,
} from "./students.js";

// ═══════════════════════════════════════════════════════════════════════
// Spotlight — shuffle-stop engine (education / ESL showcase)
//
// Forked from the GroovR matching template. The MATCHING logic is gone (no
// right answer here). What carried over: the content-layer pattern, the video
// player primitive, the reveal-card pattern, the splash/shell, the favorites
// data shape, and the SOCIAL master-switch.
//
// THE LOOP (as specified):
//   • 9 student tiles in the pool, scrambling while running.
//   • Player hits STOP → one student is selected; their LIVE video plays,
//     literally in a spotlight (the rest of the stage dims).
//   • Video ends → replaced by that student's PROFILE CARD, with an optional
//     "watch description video" button (only if the live entry has one).
//   • That student LEAVES the pool (won't replay this session); pool shrinks.
//   • Repeat until all 9 shown → "session complete" + reset.
//   • One fixed teacher.
//
// BUILT NOW, DORMANT ON DESKTOP (gated by SOCIAL, same pattern as the parent):
//   • Peer comments (other students commenting — text now, video online).
// BUILT NOW, ACTIVE ON DESKTOP:
//   • Favorites (star a student).
//   • Archive shelf (see a student's older videos; auto-archive is in students.js).
//   • "Send to teacher" — emails this session's favorites + comments via mailto:,
//     the poor-man's-backend alternative to a live server.
// ═══════════════════════════════════════════════════════════════════════

const F = "'Outfit',sans-serif";

// ─────────────────────────────────────────────────────────────────────────
// SOCIAL — master switch for ONLINE-only features (peer comments). Hidden on
// desktop. Flip to true for the online build. Same one-line gate as GroovR.
// ─────────────────────────────────────────────────────────────────────────
const SOCIAL = false;

// Warm, light "lamplit classroom" palette — tan/cream surfaces, amber accents,
// brown reserved for small contrast elements (inputs). No dark wells, no fades.
const C = {
  stage: "#E8D3A8",      // main stage — light warm tan
  stageDeep: "#7a5a3a",  // deep accent (inputs, video backdrop) — warm brown
  panel: "#F3E4C4",      // cards — light cream
  panelEdge: "#C9A877",  // visible warm border
  light: "#D98A2B",      // amber accent (buttons, highlights) — deeper for contrast on light
  lightSoft: "#E0954A",
  text: "#3A2A18",       // dark espresso text — readable on light surfaces
  textDim: "#6E5536",
  textFaint: "#9A815E",
};

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// ─────────────────────────────────────────────────────────────────────────
// SAVE / RESUME — local progress, so a student who closes mid-game picks up
// where they left off. Stored in localStorage, KEYED BY PLAYER NAME, so a
// shared browser keeps each student's progress separate. Autosaved after each
// comment; cleared when a session is finished or the student starts fresh.
//
// NOTE: localStorage works in the real `npm run dev` / desktop build but NOT
// in the sandboxed double-click preview.html — there, save/resume silently
// no-ops (wrapped in try/catch). This is a desktop-build feature.
//
// What's saved: enough to fully restore the IN-PROGRESS game — who's been
// shown, every comment written so far, favorites, the player's name. We do
// NOT save transient UI (the current spotlight animation, scramble order);
// resume always returns the student to the calm "pick a video" grid.
// ─────────────────────────────────────────────────────────────────────────
const SAVE_PREFIX = "spotlight:progress:";

function saveKey(name) {
  return SAVE_PREFIX + (name || "").trim().toLowerCase();
}

function saveProgress(name, data) {
  try {
    const payload = {
      playerName: name,
      shownIds: [...data.shownIds],          // Set -> array for JSON
      myComments: data.myComments,
      favorites: data.favorites,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(saveKey(name), JSON.stringify(payload));
  } catch (e) {
    // localStorage unavailable (sandboxed preview) — silently skip.
  }
}

function loadProgress(name) {
  try {
    const raw = localStorage.getItem(saveKey(name));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      playerName: p.playerName || name,
      shownIds: new Set(p.shownIds || []),
      myComments: p.myComments || {},
      favorites: p.favorites || {},
      savedAt: p.savedAt || null,
    };
  } catch (e) {
    return null;
  }
}

function clearProgress(name) {
  try {
    localStorage.removeItem(saveKey(name));
  } catch (e) {}
}

// Does a saved game exist for this name with at least one comment? (Used to
// offer "Resume" only when there's real progress to resume.)
function hasResumableProgress(name) {
  const p = loadProgress(name);
  return !!(p && p.shownIds.size > 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Avatar — colored initial placeholder (used when a student has no avatar img).
// ─────────────────────────────────────────────────────────────────────────
function Avatar({ student, size = 56, lit = false }) {
  const initial = student.name[0].toUpperCase();
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: lit ? student.color : student.color + "dd",
        border: `2px solid ${student.color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: F, fontWeight: 800, fontSize: size * 0.42,
        color: "#ffffff",
        flexShrink: 0, transition: "all 0.3s ease",
        boxShadow: lit ? `0 0 ${size * 0.5}px ${student.color}99` : "none",
      }}
    >
      {initial}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// VideoStage — plays the spotlighted student's video, OR shows their photo.
//
// VIDEO: if there's a real videoUrl it plays the file; if null (prototype),
// an animated placeholder "performs" for ~6 seconds, then fires onEnded.
//
// PHOTO: shows the image with a soft timer — the photo is on screen alone
// for ~3 seconds, then onEnded fires and the comment card appears. The
// progress bar gives the student a visible "look here for a moment" beat
// without locking anything; they can't interact with the photo (no buttons
// yet), so there's no friction, just pacing.
//
// This is the analog of the matching game's DancerVideo, simplified for
// shuffle-stop: one media item at a time, calls back when its beat ends.
// ─────────────────────────────────────────────────────────────────────────
const PHOTO_BEAT_MS = 3000;
const VIDEO_PLACEHOLDER_MS = 6000;

function VideoStage({ student, src, mediaType = "video", onEnded, label }) {
  const vref = useRef(null);
  const [placeholderProgress, setPlaceholderProgress] = useState(0);

  const isPhoto = mediaType === "photo";

  useEffect(() => {
    // Real <video> with a src drives its own onEnded; nothing to time here.
    if (!isPhoto && src) return;
    // For photos OR for the no-src video placeholder, we run a timed beat.
    setPlaceholderProgress(0);
    const total = isPhoto ? PHOTO_BEAT_MS : VIDEO_PLACEHOLDER_MS;
    const step = 60;
    let elapsed = 0;
    const iv = setInterval(() => {
      elapsed += step;
      setPlaceholderProgress(Math.min(1, elapsed / total));
      if (elapsed >= total) {
        clearInterval(iv);
        onEnded && onEnded();
      }
    }, step);
    return () => clearInterval(iv);
  }, [src, student.id, onEnded, isPhoto]);

  return (
    <div style={{ width: "100%", maxWidth: 440, margin: "0 auto" }}>
      {label && (
        <div style={{ fontFamily: F, fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
          color: C.light, textAlign: "center", marginBottom: 10, opacity: 0.85 }}>
          {label}
        </div>
      )}
      <div
        style={{
          position: "relative", width: "100%", aspectRatio: "4/3",
          borderRadius: 16, overflow: "hidden",
          background: `radial-gradient(ellipse at 50% 35%, ${student.color}26, ${C.stageDeep} 72%)`,
          border: `2px solid ${student.color}`,
          boxShadow: `0 0 80px ${student.color}55, 0 14px 34px #7a5a3a55`,
        }}
      >
        {isPhoto && src ? (
          // ── PHOTO branch: <img> + soft-timer progress bar at the bottom.
          <>
            <img
              src={src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0,
              height: 4, background: "#00000033" }}>
              <div style={{ width: `${placeholderProgress * 100}%`, height: "100%",
                background: student.color, transition: "width 0.06s linear" }} />
            </div>
          </>
        ) : src ? (
          <video
            ref={vref} src={src} autoPlay playsInline
            onEnded={onEnded}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          // Animated placeholder: a "performing" avatar that bobs, plus a
          // progress bar so it clearly reads as a finite video that will end.
          <div style={{ position: "absolute", inset: 0, display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
            <style>{`@keyframes bob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-10px) scale(1.04)}}`}</style>
            <div style={{ animation: "bob 1.1s ease-in-out infinite" }}>
              <Avatar student={student} size={110} lit />
            </div>
            <div style={{ fontFamily: F, fontSize: 13, color: C.textDim }}>
              {student.name}'s video (placeholder)
            </div>
            <div style={{ width: "70%", height: 4, background: "#ffffff1a", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${placeholderProgress * 100}%`, height: "100%",
                background: student.color, transition: "width 0.06s linear" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MIN_COMMENT_CHARS — the gate threshold. A comment must be at least this many
// non-space characters before the student can return to the game. Small enough
// not to frustrate, large enough that a single keystroke won't escape the gate.
const MIN_COMMENT_CHARS = 8;

// ProfileCard — the reveal after a video ends (analog of GroovR's RevealCard).
// The comment box is now MANDATORY and CENTRAL: the student must write a
// comment about this video before "Continue" unlocks. Each video gets exactly
// one comment from this player; together the nine become the CSV sent to the
// teacher at the end. Also: optional description video, favorite toggle, the
// archive shelf, and the (dormant) classmate-peer-comments panel.
// ─────────────────────────────────────────────────────────────────────────
function ProfileCard({
  student, isFav, onToggleFav, onWatchDescription, onContinue,
  myComment, onSaveComment, comments, archiveOpen, onToggleArchive,
}) {
  const live = liveEntry(student);
  const archive = archivedEntries(student);
  const hasDescription = !!(live && live.description);
  const [draft, setDraft] = useState(myComment || "");

  const trimmed = draft.trim();
  const meetsMin = trimmed.length >= MIN_COMMENT_CHARS;

  // Keep the saved comment in sync as they type, so it's captured even if they
  // navigate to the description video and come back (the draft is restored).
  useEffect(() => { setDraft(myComment || ""); }, [student.id]);

  const handleContinue = () => {
    if (!meetsMin) return;
    onSaveComment(trimmed);
    onContinue();
  };

  return (
    <div style={{
      width: "100%", maxWidth: 460, margin: "0 auto",
      background: C.panel, border: `1px solid ${C.panelEdge}`,
      borderRadius: 20, padding: "1.75rem 1.5rem",
      boxShadow: `0 0 60px ${student.color}33, 0 14px 34px #7a5a3a55`,
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <Avatar student={student} size={84} lit />
        <h2 style={{ fontFamily: F, fontSize: 26, fontWeight: 800, color: C.text, margin: "14px 0 4px" }}>
          {student.name}
        </h2>
        <p style={{ fontFamily: F, fontSize: 14, color: C.textDim, lineHeight: 1.5, margin: "0 0 4px", maxWidth: 340 }}>
          {student.bio}
        </p>
        {live && live.descriptionText && (
          <p style={{ fontFamily: F, fontSize: 13, color: C.text, lineHeight: 1.6,
            margin: "10px 0 0", maxWidth: 360, fontStyle: "italic",
            borderLeft: `2px solid ${student.color}`, paddingLeft: 12, textAlign: "left" }}>
            “{live.descriptionText}”
          </p>
        )}
        <button
          onClick={onToggleFav}
          style={{
            fontFamily: F, fontSize: 13, fontWeight: 600, marginTop: 10,
            padding: "7px 16px", borderRadius: 30, cursor: "pointer",
            background: isFav ? C.light + "22" : "transparent",
            border: `1px solid ${isFav ? C.light : C.panelEdge}`,
            color: isFav ? C.light : C.textDim,
          }}
        >
          {isFav ? "★ Favorited" : "☆ Add to favorites"}
        </button>
      </div>

      {/* Optional description video button (only if the live entry has one) */}
      {hasDescription && (
        <button
          onClick={() => { onSaveComment(trimmed); onWatchDescription(); }}
          style={{
            width: "100%", marginTop: 20, padding: "12px", fontFamily: F,
            fontSize: 14, fontWeight: 600, background: student.color,
            color: C.stageDeep, border: "none", borderRadius: 12, cursor: "pointer",
          }}
        >
          ▶ Watch {student.name}'s description
        </button>
      )}

      {/* ── MANDATORY COMMENT — the heart of the game. Gates Continue. ── */}
      <div style={{ marginTop: 22 }}>
        <label style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text,
          display: "block", marginBottom: 7 }}>
          Your comment on {student.name}'s video
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`What did you think of ${student.name}'s video? Write at least a sentence.`}
          rows={3}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
            fontFamily: F, fontSize: 14, lineHeight: 1.5,
            background: "#FFFDF7", color: C.text,
            border: `1px solid ${meetsMin ? student.color + "88" : C.panelEdge}`,
            borderRadius: 12, outline: "none", resize: "vertical" }}
        />
        <div style={{ fontFamily: F, fontSize: 11, color: meetsMin ? C.light : C.textFaint,
          marginTop: 5, minHeight: 14 }}>
          {meetsMin
            ? "✓ Looks good — you can continue."
            : `Write a little more to continue (at least ${MIN_COMMENT_CHARS} characters).`}
        </div>
      </div>

      <button
        onClick={handleContinue}
        disabled={!meetsMin}
        style={{
          width: "100%", marginTop: 14,
          padding: "13px", fontFamily: F, fontSize: 15, fontWeight: 700,
          background: meetsMin ? C.light : C.panelEdge,
          color: meetsMin ? C.stageDeep : C.textFaint,
          border: "none", borderRadius: 12,
          cursor: meetsMin ? "pointer" : "not-allowed",
          letterSpacing: 0.5, transition: "all 0.2s ease",
        }}
      >
        Save comment & continue
      </button>

      {/* ── Archive shelf — older videos, auto-archived, comment kept with each ── */}
      {archive.length > 0 && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${C.panelEdge}`, paddingTop: 14 }}>
          <button
            onClick={onToggleArchive}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: F, fontSize: 12, fontWeight: 600, color: C.textDim,
              display: "flex", alignItems: "center", gap: 6, padding: 0,
            }}
          >
            {archiveOpen ? "▾" : "▸"} Earlier videos ({archive.length})
          </button>
          {archiveOpen && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {archive.map((e, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#E8D3A8", borderRadius: 10, padding: "9px 12px",
                  border: `1px solid ${C.panelEdge}`,
                }}>
                  <div style={{ fontSize: 18 }}>🎞️</div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontFamily: F, fontSize: 12, color: C.text }}>
                      {e.primary ? "Video" : "Video (placeholder)"} · {e.uploadedAt}
                    </div>
                    <div style={{ fontFamily: F, fontSize: 11, color: C.textFaint }}>
                      {e.description
                        ? "has description video (kept with it)"
                        : "no description video"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Classmate peer comments — built now, dormant on desktop (SOCIAL gate).
           In the teacher-hub design these are NOT shown to other students on
           desktop; this display-only block exists for a future online build
           where the teacher may choose to surface selected comments. ── */}
      {SOCIAL && (comments || []).length > 0 && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${C.panelEdge}`, paddingTop: 14 }}>
          <div style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.textDim, marginBottom: 8 }}>
            Comments from classmates
          </div>
          {(comments || []).map((c, i) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.light }}>{c.author}</span>
              <span style={{ fontFamily: F, fontSize: 12, color: C.text, marginLeft: 6 }}>{c.text}</span>
              {c.videoUrl && (
                <span style={{ fontFamily: F, fontSize: 11, color: C.textFaint, marginLeft: 6 }}>🎥 video reply</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StageGrid — the 3×3 of student tiles, scrambling while running.
// "shown" students render as dimmed/checked and are out of play.
// ─────────────────────────────────────────────────────────────────────────
function StageGrid({ order, shownIds, running, favorites }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10,
      maxWidth: 460, margin: "0 auto",
    }}>
      {order.map((s) => {
        const shown = shownIds.has(s.id);
        return (
          <div key={s.id} style={{
            background: C.panel,
            border: `1px solid ${shown ? C.panelEdge : s.color + "66"}`,
            borderRadius: 14, padding: "14px 8px 12px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            opacity: shown ? 0.4 : 1,
            transition: running ? "all 0.18s ease" : "all 0.3s ease",
            position: "relative",
          }}>
            {shown && (
              <div style={{ position: "absolute", top: 7, right: 9, fontSize: 13, color: C.light }}>✓</div>
            )}
            {favorites[s.id] && !shown && (
              <div style={{ position: "absolute", top: 7, right: 9, fontSize: 12, color: C.light }}>★</div>
            )}
            <Avatar student={s} size={50} />
            <div style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: shown ? C.textFaint : C.text }}>
              {s.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// APP
//
// initialStudents: the deck the engine plays. Defaults to the in-file
// STUDENTS array so local dev without Supabase still works. The /play
// Server Component fetches the DB-backed deck and passes it in; the engine
// neither knows nor cares where the deck came from. The thin DB→engine
// adapter (src/lib/deck.ts) is what shapes DB rows into this prop.
// ─────────────────────────────────────────────────────────────────────────
export default function App({ initialStudents = STUDENTS }) {
  const [view, setView] = useState("splash"); // splash | game
  // Phase within the game: idle (not scrambling) | running | playing | descr | reveal | done
  const [phase, setPhase] = useState("idle");
  const [order, setOrder] = useState(initialStudents);
  const [shownIds, setShownIds] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // We keep a local mutable copy of students so simulate-upload can mutate.
  const [students, setStudents] = useState(initialStudents);

  // Favorites (active) + the player's ONE comment per student (the data that
  // becomes the CSV sent to the teacher). myComments = { studentId: "text" }.
  const [favorites, setFavorites] = useState({});
  const [myComments, setMyComments] = useState({});
  const [playerName, setPlayerName] = useState("");

  const scrambleRef = useRef(null);

  const remaining = students.filter((s) => !shownIds.has(s.id));
  const allShown = shownIds.size >= students.length;

  // Scramble the grid order while running.
  useEffect(() => {
    if (phase !== "running") {
      clearInterval(scrambleRef.current);
      return;
    }
    scrambleRef.current = setInterval(() => {
      setOrder((o) => shuffle(o));
    }, 180);
    return () => clearInterval(scrambleRef.current);
  }, [phase]);

  const startScramble = useCallback(() => {
    if (allShown) return;
    setSelected(null);
    setArchiveOpen(false);
    setPhase("running");
  }, [allShown]);

  const stop = useCallback(() => {
    if (phase !== "running") return;
    const pool = students.filter((s) => !shownIds.has(s.id));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSelected(pick);
    setPhase("playing");
  }, [phase, students, shownIds]);

  // Called when the (placeholder or real) video finishes.
  const onVideoEnded = useCallback(() => {
    setPhase("reveal");
  }, []);

  const finishStudent = useCallback(() => {
    if (!selected) return;
    // Build the next set explicitly, then set both pieces of state from it.
    // No stale reads, no side-effects inside an updater.
    const next = new Set(shownIds);
    next.add(selected.id);
    setShownIds(next);
    setPhase(next.size >= students.length ? "done" : "idle");
    setSelected(null);
    setArchiveOpen(false);
  }, [selected, shownIds, students.length]);

  // Re-watch a video from the end-of-game review list. Plays the chosen
  // student's video, then returns to the review screen ("done") — the student's
  // edits to their comments are preserved (they live in myComments state).
  const rewatch = useCallback((id) => {
    const s = students.find((x) => x.id === id);
    if (!s) return;
    setSelected(s);
    setPhase("rewatch");
  }, [students]);

  const toggleFav = useCallback((id) => {
    setFavorites((f) => ({ ...f, [id]: !f[id] }));
  }, []);

  // Save THE player's comment for a student (one per student; overwrites).
  const saveComment = useCallback((id, text) => {
    setMyComments((c) => ({ ...c, [id]: text }));
  }, []);

  // ── AUTOSAVE: persist progress whenever the saved data changes, but only
  // while a game is actually underway (in the "game" view, not yet finished).
  // Keyed by player name. Driven by an effect so it always reflects the latest
  // committed state — no stale-closure risk from saving inside handlers. ──
  useEffect(() => {
    if (view !== "game") return;
    if (phase === "done") return;            // finished sessions are cleared, not saved
    if (!playerName.trim()) return;
    if (shownIds.size === 0 && Object.keys(myComments).length === 0) return;
    saveProgress(playerName, { shownIds, myComments, favorites });
  }, [view, phase, playerName, shownIds, myComments, favorites]);

  // Resume a saved game for the current playerName.
  const resume = useCallback(() => {
    const p = loadProgress(playerName);
    if (!p) return;
    setPlayerName(p.playerName);
    setShownIds(p.shownIds);
    setMyComments(p.myComments);
    setFavorites(p.favorites);
    setSelected(null);
    setArchiveOpen(false);
    setOrder(shuffle(students));
    // If everything was already done, land on the review screen; else the grid.
    setPhase(p.shownIds.size >= students.length ? "done" : "idle");
    setView("game");
  }, [playerName, students]);

  // Simulate an upload (desktop stand-in for real upload). Adds a new live
  // entry to a student via addEntry, auto-archiving the old one.
  const simulateUpload = useCallback((id) => {
    setStudents((sts) =>
      sts.map((s) => (s.id === id ? addEntry(s, { primary: null, description: null }) : s))
    );
  }, []);

  // Start a FRESH session — also clears any saved progress for this name.
  const resetAll = useCallback(() => {
    clearProgress(playerName);
    setShownIds(new Set());
    setSelected(null);
    setPhase("idle");
    setOrder(shuffle(students));
    setArchiveOpen(false);
    setMyComments({});
    setFavorites({});
  }, [students, playerName]);

  const favCount = Object.values(favorites).filter(Boolean).length;

  // Whether the currently-typed name has a saved, unfinished game to resume.
  // Recomputed on each render (cheap: one localStorage read) so it appears the
  // moment a returning student types their name on the splash.
  const canResume = view === "splash" && playerName.trim() && hasResumableProgress(playerName);

  // ── SPLASH ──
  if (view === "splash") {
    return (
      <div style={{
        minHeight: 560, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        background: C.stage,
        borderRadius: 18, padding: "3rem 1.5rem", position: "relative", overflow: "hidden",
        border: `1px solid ${C.panelEdge}`,
        boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
          @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
          @keyframes beam{0%,100%{opacity:0.5}50%{opacity:0.9}}`}</style>
        {/* spotlight beam */}
        <div style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)",
          width: 360, height: 420,
          background: `conic-gradient(from 180deg at 50% 0%, transparent 78deg, ${C.light}26 90deg, transparent 102deg)`,
          animation: "beam 4s ease-in-out infinite", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: F, fontSize: 13, letterSpacing: 5, color: C.light,
            marginBottom: 10, animation: "fadeUp 0.6s ease", textTransform: "uppercase" }}>
            {TEACHER.className}
          </div>
          <h1 style={{ fontFamily: F, fontSize: 60, fontWeight: 800, letterSpacing: -2,
            color: C.text, margin: "0 0 6px", animation: "fadeUp 0.7s ease" }}>
            Spotlight
          </h1>
          <p style={{ fontFamily: F, fontSize: 15, fontWeight: 300, color: C.textDim,
            maxWidth: 360, margin: "0 auto 22px", lineHeight: 1.6, animation: "fadeUp 0.9s ease" }}>
            Nine classmates, nine videos. Hit stop, and one steps into the light.
            Watch each one, write a comment, and favorite the ones you love.
          </p>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Type your name"
            style={{ fontFamily: F, fontSize: 14, padding: "11px 16px", width: 220,
              textAlign: "center", background: "#FFFDF7", color: C.text,
              border: `1px solid ${C.panelEdge}`, borderRadius: 30, outline: "none",
              marginBottom: 18, animation: "fadeUp 1.0s ease", display: "block",
              marginLeft: "auto", marginRight: "auto" }}
          />
          {/* If this name has a saved, unfinished game, offer to resume it. */}
          {canResume ? (
            <div style={{ animation: "fadeUp 1.1s ease" }}>
              <button
                onClick={resume}
                style={{ fontFamily: F, fontSize: 16, fontWeight: 700, padding: "14px 44px",
                  background: C.light, color: C.stageDeep, border: "none", borderRadius: 50,
                  cursor: "pointer", letterSpacing: 1, boxShadow: `0 8px 30px ${C.light}44`,
                  display: "block", marginLeft: "auto", marginRight: "auto", marginBottom: 10 }}
              >
                ↻ Resume where you left off
              </button>
              <button
                onClick={() => { resetAll(); setView("game"); }}
                style={{ fontFamily: F, fontSize: 13, fontWeight: 500, padding: "8px 18px",
                  background: "transparent", color: C.textDim, border: `1px solid ${C.panelEdge}`,
                  borderRadius: 30, cursor: "pointer" }}
              >
                Start over instead
              </button>
            </div>
          ) : (
            <button
              onClick={() => { resetAll(); setView("game"); }}
              disabled={!playerName.trim()}
              style={{ fontFamily: F, fontSize: 16, fontWeight: 600, padding: "14px 44px",
                background: playerName.trim() ? C.light : C.panelEdge,
                color: playerName.trim() ? C.stageDeep : C.textFaint, border: "none", borderRadius: 50,
                cursor: playerName.trim() ? "pointer" : "not-allowed", letterSpacing: 1,
                animation: "fadeUp 1.1s ease", boxShadow: playerName.trim() ? `0 8px 30px ${C.light}44` : "none" }}
            >
              Enter the stage
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── GAME ──
  return (
    <div style={{
      minHeight: 560, background: C.stage, borderRadius: 18,
      padding: "1.25rem 1.25rem 1.75rem", border: `1px solid ${C.panelEdge}`,
      boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("splash")}
            style={{ background: "none", border: "none", color: C.textDim, fontSize: 18, cursor: "pointer" }}>←</button>
          <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>Spotlight</h2>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontFamily: F, fontSize: 12, color: C.textDim }}>★ {favCount}</span>
          <span style={{ fontFamily: F, fontSize: 12, color: C.textDim }}>
            ✎ {Object.values(myComments).filter((t) => t && t.trim()).length}/{students.length}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div style={{ fontFamily: F, fontSize: 12, color: C.textDim, textAlign: "center", marginBottom: 16 }}>
        {shownIds.size} of {students.length} have been in the spotlight
      </div>

      {/* ── PLAYING: the spotlight moment ── */}
      {phase === "playing" && selected && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <VideoStage student={selected} src={liveEntry(selected)?.primary || null}
            mediaType={liveEntry(selected)?.mediaType || "video"}
            onEnded={onVideoEnded} label="In the spotlight" />
        </div>
      )}

      {/* ── DESCRIPTION video ── */}
      {phase === "descr" && selected && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <VideoStage student={selected} src={liveEntry(selected)?.description || null}
            onEnded={() => setPhase("reveal")} label={`${selected.name} describes the clip`} />
        </div>
      )}

      {/* ── REVEAL: profile card ── */}
      {phase === "reveal" && selected && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <ProfileCard
            student={students.find((s) => s.id === selected.id) || selected}
            isFav={!!favorites[selected.id]}
            onToggleFav={() => toggleFav(selected.id)}
            onWatchDescription={() => setPhase("descr")}
            onContinue={finishStudent}
            myComment={myComments[selected.id] || ""}
            onSaveComment={(text) => saveComment(selected.id, text)}
            comments={null}
            archiveOpen={archiveOpen}
            onToggleArchive={() => setArchiveOpen((o) => !o)}
          />
        </div>
      )}

      {/* ── REWATCH: replay a video from the review list, return to done ── */}
      {phase === "rewatch" && selected && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <VideoStage student={selected} src={liveEntry(selected)?.primary || null}
            mediaType={liveEntry(selected)?.mediaType || "video"}
            onEnded={() => { setSelected(null); setPhase("done"); }}
            label={`Watching ${selected.name} again`} />
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { setSelected(null); setPhase("done"); }}
              style={{ fontFamily: F, fontSize: 13, fontWeight: 600, padding: "9px 20px",
                background: "transparent", color: C.textDim, border: `1px solid ${C.panelEdge}`,
                borderRadius: 30, cursor: "pointer" }}>
              ← Back to my comments
            </button>
          </div>
        </div>
      )}

      {/* ── IDLE / RUNNING: the grid + stop/start ── */}
      {(phase === "idle" || phase === "running") && !allShown && (
        <>
          <StageGrid order={order} shownIds={shownIds} running={phase === "running"} favorites={favorites} />
          <div style={{ textAlign: "center", marginTop: 24 }}>
            {phase === "idle" ? (
              <button onClick={startScramble}
                style={{ fontFamily: F, fontSize: 16, fontWeight: 700, padding: "14px 50px",
                  background: C.light, color: C.stageDeep, border: "none", borderRadius: 50,
                  cursor: "pointer", letterSpacing: 1, boxShadow: `0 8px 30px ${C.light}44` }}>
                {shownIds.size === 0 ? "Start" : "Spin again"}
              </button>
            ) : (
              <button onClick={stop}
                style={{ fontFamily: F, fontSize: 16, fontWeight: 700, padding: "14px 56px",
                  background: "#E2554A", color: "#fff", border: "none", borderRadius: 50,
                  cursor: "pointer", letterSpacing: 2, boxShadow: "0 8px 30px #E2554A55" }}>
                STOP
              </button>
            )}
          </div>
        </>
      )}

      {/* ── DONE — produce the single CSV deliverable for the teacher ── */}
      {allShown && phase === "done" && (
        <DoneScreen
          playerName={playerName}
          favorites={favorites}
          myComments={myComments}
          students={students}
          favCount={favCount}
          totalStudents={students.length}
          onEditComment={saveComment}
          onRewatch={rewatch}
          onPlayAgain={resetAll}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DoneScreen — end of session. Shows the student's NINE comments as an editable
// review list, each next to the video's creator, with a re-watch link (click
// the name to replay that video). The student can fix their English before
// downloading the single CSV deliverable to send to the teacher. Because local
// downloads can be unreliable in some preview contexts, it also offers the CSV
// on screen with a copy button as a fallback.
// ─────────────────────────────────────────────────────────────────────────
function DoneScreen({
  playerName, favorites, myComments, students, favCount, totalStudents,
  onEditComment, onRewatch, onPlayAgain,
}) {
  const state = { playerName, favorites, myComments };
  const rows = buildSessionRows(state);
  const csv = buildSessionCSV(state);
  const filename = sessionFilename(state);
  const [copied, setCopied] = useState(false);
  const [showCsv, setShowCsv] = useState(false);

  const download = () => {
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      // If the download is blocked (some sandboxed previews), reveal the CSV
      // so the student can still copy it manually.
      setShowCsv(true);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setShowCsv(true);
    }
  };

  return (
    <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease", padding: "1rem 0" }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🎬</div>
      <h2 style={{ fontFamily: F, fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 6px" }}>
        Everyone's had their moment
      </h2>
      <p style={{ fontFamily: F, fontSize: 14, color: C.textDim, maxWidth: 360, margin: "0 auto 8px", lineHeight: 1.6 }}>
        You watched all {totalStudents} videos, wrote {rows.length} comments, and favorited {favCount}.
      </p>
      <p style={{ fontFamily: F, fontSize: 13, color: C.textFaint, maxWidth: 360, margin: "0 auto 22px", lineHeight: 1.6 }}>
        Review and fix your comments below, then download the file and send it to {TEACHER.name}.
      </p>

      {/* ── Editable review list: each comment next to its video's creator. ── */}
      <div style={{ textAlign: "left", maxWidth: 460, margin: "0 auto 22px",
        display: "flex", flexDirection: "column", gap: 10 }}>
        {students.map((s) => {
          const text = myComments[s.id] || "";
          return (
            <div key={s.id} style={{ background: C.panel, border: `1px solid ${C.panelEdge}`,
              borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Avatar student={s} size={34} />
                <button
                  onClick={() => onRewatch(s.id)}
                  title="Watch this video again"
                  style={{ fontFamily: F, fontSize: 14, fontWeight: 700, color: s.color,
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  {s.name} ▶
                </button>
                {favorites[s.id] && <span style={{ fontSize: 12, color: C.light }}>★</span>}
              </div>
              <textarea
                value={text}
                onChange={(e) => onEditComment(s.id, e.target.value)}
                rows={2}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px",
                  fontFamily: F, fontSize: 13, lineHeight: 1.5, background: "#FFFDF7",
                  color: C.text, border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                  outline: "none", resize: "vertical" }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={download}
          style={{ fontFamily: F, fontSize: 14, fontWeight: 700, padding: "12px 26px",
            background: C.light, color: C.stageDeep, border: "none", borderRadius: 30,
            cursor: "pointer" }}>
          ⬇ Download my comments (.csv)
        </button>
        <button onClick={onPlayAgain}
          style={{ fontFamily: F, fontSize: 14, fontWeight: 600, padding: "12px 24px",
            background: "transparent", color: C.text, border: `1px solid ${C.panelEdge}`,
            borderRadius: 30, cursor: "pointer" }}>
          Play again
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <button onClick={() => setShowCsv((s) => !s)}
          style={{ fontFamily: F, fontSize: 12, color: C.textDim, background: "none",
            border: "none", cursor: "pointer", textDecoration: "underline" }}>
          {showCsv ? "Hide" : "Can't download? Show the text to copy"}
        </button>
      </div>

      {showCsv && (
        <div style={{ marginTop: 12, textAlign: "left", maxWidth: 460, margin: "12px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontFamily: F, fontSize: 12, color: C.textDim }}>{filename}</span>
            <button onClick={copy}
              style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.light,
                background: C.light + "1a", border: `1px solid ${C.light}44`,
                borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <textarea readOnly value={csv} rows={Math.min(12, rows.length + 2)}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace",
              fontSize: 12, padding: "10px 12px", background: "#FFFDF7", color: C.text,
              border: `1px solid ${C.panelEdge}`, borderRadius: 10, resize: "vertical" }}
          />
        </div>
      )}
    </div>
  );
}
