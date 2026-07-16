"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/game/spotlight.jsx
//
// Slice 1B (Profile v1) changes vs. previous version:
//   • Splash no longer gates on a name — you hit "Enter the stage" and go.
//     Progress save/resume now keys on a single per-browser anon key.
//   • The end-of-game join form collects EMAIL ONLY. Name, screen name, and
//     the "why was this your favorite?" note all moved to the profile (the
//     page you land on after clicking the magic link). No self-photo here —
//     the student's own content photo belongs to round 2.
//   • The "check your email" screen now briefly explains what the class is.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  STUDENTS,
  TEACHER,
  liveEntry,
  archivedEntries,
  addEntry,
} from "./students.js";
import { enrollStudent, saveStudentRound, addEntry as addEntryAction } from "@/app/play/actions";
import { MonsterCard, padWithMonsters } from "./monsters.jsx";

const F = "'Outfit',sans-serif";
const SOCIAL = false;

const C = {
  stage: "#E8D3A8",
  stageDeep: "#7a5a3a",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  lightSoft: "#E0954A",
  text: "#3A2A18",
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

// Progress is saved per browser so a player can hit Resume without typing a name.
//
// PER-ROUTE STORAGE KEYS (added in slice 1 engine-adaptation pass):
//   The single static key broke the in-class flow: a visitor who played /play
//   (writing under one key), then enrolled and later returned, would see a
//   stale "Resume" offer pointing at their old visitor game. Worse, in-class
//   progress at /student/play would overwrite or be overwritten by visitor
//   progress.
//
//   Fix: derive the key from window.location.pathname so /play and
//   /student/play never see each other's progress. They're conceptually
//   different games (cross-class starters vs your own class) and shouldn't
//   share state. SSR safety: when window is undefined (server render), fall
//   back to the visitor key so existing keys continue to be readable. All
//   real reads/writes happen client-side anyway.
function saveKey() {
  // B33 fix: bumped to v2 when comments/favorites switched from student-id
  // keying to entry-id keying. Old v1 progress would resume with mismatched
  // keys and silently lose data on save; the new key forces a clean start
  // for any in-flight game (worst case: one student starts over).
  if (typeof window === "undefined") return "spotlight:progress:v2:visitor";
  return window.location.pathname.startsWith("/student")
    ? "spotlight:progress:v2:student"
    : "spotlight:progress:v2:visitor";
}
function saveProgress(data) {
  try {
    const payload = {
      shownIds: [...data.shownIds],
      myComments: data.myComments,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(saveKey(), JSON.stringify(payload));
  } catch (e) {}
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      shownIds: new Set(p.shownIds || []),
      myComments: p.myComments || {},
      savedAt: p.savedAt || null,
    };
  } catch (e) { return null; }
}
function clearProgress() { try { localStorage.removeItem(saveKey()); } catch (e) {} }
function hasResumableProgress() {
  const p = loadProgress();
  return !!(p && p.shownIds.size > 0);
}

// B33 fix: comments and favorites are keyed by ENTRY ID throughout the
// system — the all-in-one SQL seeds warm-up comments that way, enrollStudent
// resolves favorites by looking the key up in `entries.id`, and
// student-archive's classmate-comment lookup queries `entries WHERE id IN
// (...)`. The engine previously keyed by student.id, which only happened to
// work in the visitor flow because the hardcoded STUDENTS deck used IDs
// that coincided with entry IDs. Once real auth UUIDs entered the picture
// (live class mode), that coincidence broke and classmate comments stopped
// rendering in completed rounds. This helper centralizes the lookup so any
// future change to "what counts as the student's primary entry for this
// round" only has to be made in one place. Fallback to student.id keeps
// the visitor flow working if liveEntry is unavailable for any reason.
function entryIdOf(student) {
  return liveEntry(student)?.id || student.id;
}

function Avatar({ student, size = 56, lit = false }) {
  const initial = student.name[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: lit ? student.color : student.color + "dd",
      border: `2px solid ${student.color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: F, fontWeight: 800, fontSize: size * 0.42,
      color: "#ffffff", flexShrink: 0, transition: "all 0.3s ease",
      boxShadow: lit ? `0 0 ${size * 0.5}px ${student.color}99` : "none",
    }}>{initial}</div>
  );
}

const PHOTO_BEAT_MS = 3000;
const VIDEO_PLACEHOLDER_MS = 6000;

function VideoStage({ student, src, mediaType = "video", onEnded, label }) {
  const vref = useRef(null);
  const [placeholderProgress, setPlaceholderProgress] = useState(0);
  const isPhoto = mediaType === "photo";

  useEffect(() => {
    if (!isPhoto && src) return;
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
      <div style={{
        position: "relative", width: "100%", aspectRatio: "4/3",
        borderRadius: 16, overflow: "hidden",
        background: `radial-gradient(ellipse at 50% 35%, ${student.color}26, ${C.stageDeep} 72%)`,
        border: `2px solid ${student.color}`,
        boxShadow: `0 0 80px ${student.color}55, 0 14px 34px #7a5a3a55`,
      }}>
        {isPhoto && src ? (
          <>
            <img src={src} alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0,
              height: 4, background: "#00000033" }}>
              <div style={{ width: `${placeholderProgress * 100}%`, height: "100%",
                background: student.color, transition: "width 0.06s linear" }} />
            </div>
          </>
        ) : src ? (
          <video ref={vref} src={src} autoPlay playsInline onEnded={onEnded}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
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

const MIN_COMMENT_CHARS = 8;

// ── Rotating prompt phrases ──────────────────────────────────────────────
// Fun/snarky/encouraging lines that cycle in the comment placeholder before
// the actual rule appears. Sequence: fun → fun → rule → fun → fun → rule …
// Future: this array will migrate to the DB (game_prompts table, C6) so
// teachers can author and admin can approve custom prompts.
const PROMPT_PHRASES = [
  "Drop a comment so good they'll frame it.",
  "Channel your inner art critic. Monocle optional.",
  "Say something nice. Or something clever. Or both.",
  "Your words here. Make 'em count.",
  "Think of this as a tiny love letter to their photo.",
  "Be the comment you wish someone left on YOUR photo.",
  "No pressure… but everyone's watching.",
  "Fun fact: great comments make the world go round.",
  "Write like nobody's grading you. (We're not. Probably.)",
  "Two thumbs up? Tell them WHY two thumbs up.",
  "Pretend you're a food critic, but for photos.",
  "Hot take? Cold take? Just give us A take.",
  "Words of wisdom, words of chaos — dealer's choice.",
  "Quick — say something before the moment passes!",
  "This photo isn't going to compliment itself.",
  "You've got opinions. We've got a text box. Let's go.",
  "Shakespeare started with a blank page too. Just saying.",
  "Make future-you proud of this comment.",
  "If this photo could talk, what would YOU say back?",
  "Somewhere out there, a perfect comment exists. Find it.",
  "Plot twist: YOUR comment becomes everyone's favorite.",
  "Type something. Anything. Okay, maybe not anything.",
  "This is your moment. Don't waste it on 'nice pic.'",
  "Dig deep. Or dig shallow. Just dig.",
  "One does not simply scroll past without commenting.",
];
const RULE_TEXT = "What do you think? Write at least a sentence.";

function ProfileCard({
  student, onWatchDescription, onContinue, myComment, onSaveComment,
  teacherPrompt,
}) {
  const live = liveEntry(student);
  const hasDescription = !!(live && live.description);
  const [draft, setDraft] = useState(myComment || "");
  const trimmed = draft.trim();
  const meetsMin = trimmed.length >= MIN_COMMENT_CHARS;

  // ── Rotating placeholder logic ───────────────────────────────────────
  // P10 (session 76): Shows 2 fun phrases then the rule, then stops.
  // Sequence: fun → fun → rule (DONE). No continuous loop.
  // Pauses rotation once the student starts typing.
  //
  // Session 89: When teacherPrompt is present, it replaces the first fun
  // phrase. Sequence becomes: teacher → fun → rule (DONE). The teacher's
  // voice leads, a fun phrase follows, then the rule anchors.
  const [phraseIndex, setPhraseIndex] = useState(() => Math.floor(Math.random() * PROMPT_PHRASES.length));
  const [cycleStep, setCycleStep] = useState(0); // 0,1 = fun phrase (or teacher prompt); 2 = rule (final)
  const [placeholderText, setPlaceholderText] = useState(
    teacherPrompt ? teacherPrompt : PROMPT_PHRASES[phraseIndex % PROMPT_PHRASES.length],
  );

  useEffect(() => {
    // Don't rotate while the student is typing, or after the rule has shown
    if (draft.trim().length > 0) return;
    if (cycleStep >= 2) return; // rule already showing — stop
    const iv = setInterval(() => {
      setCycleStep((prev) => {
        const next = prev + 1;
        if (next >= 2) {
          // Show the rule and stop rotating
          setPlaceholderText(RULE_TEXT);
          clearInterval(iv);
        } else {
          setPhraseIndex((pi) => {
            const nextPi = (pi + 1) % PROMPT_PHRASES.length;
            setPlaceholderText(PROMPT_PHRASES[nextPi]);
            return nextPi;
          });
        }
        return next;
      });
    }, 4000);
    return () => clearInterval(iv);
  }, [draft, cycleStep]);

  useEffect(() => {
    setDraft(myComment || "");
    // P10: reset rotation for the new photo so they see teacher prompt (or fun phrase) + rule again
    setCycleStep(0);
    const newPi = Math.floor(Math.random() * PROMPT_PHRASES.length);
    setPhraseIndex(newPi);
    setPlaceholderText(teacherPrompt ? teacherPrompt : PROMPT_PHRASES[newPi]);
  }, [student.id, teacherPrompt]);

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
        {(live && live.primary && live.mediaType === "photo") ? (
          <img src={live.primary} alt=""
            style={{
              width: "100%", maxWidth: 380, aspectRatio: "4/3",
              objectFit: "cover", borderRadius: 16,
              border: `2px solid ${student.color}`,
              boxShadow: `0 0 40px ${student.color}55`,
              display: "block",
            }} />
        ) : (
          <Avatar student={student} size={84} lit />
        )}
        <h2 style={{ fontFamily: F, fontSize: 26, fontWeight: 800, color: C.text, margin: "14px 0 4px" }}>
          {student.name}
        </h2>
        {live && live.descriptionText && (
          <p style={{ fontFamily: F, fontSize: 13, color: C.text, lineHeight: 1.6,
            margin: "10px 0 0", maxWidth: 360, fontStyle: "italic",
            borderLeft: `2px solid ${student.color}`, paddingLeft: 12, textAlign: "left" }}>
            "{live.descriptionText}"
          </p>
        )}
      </div>

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

      <div style={{ marginTop: 22 }}>
        {/* Session 89: teacher guidance banner — only shown in student mode
            when the teacher has written a prompt for the class */}
        {teacherPrompt && (
          <div style={{
            fontFamily: F, fontSize: 12, color: C.textDim,
            background: C.light + "12", border: `1px solid ${C.light}33`,
            borderRadius: 10, padding: "8px 12px",
            marginBottom: 10, lineHeight: 1.5,
            fontStyle: "italic",
          }}>
            <span style={{ fontWeight: 700, fontStyle: "normal", color: C.light, fontSize: 10,
              letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
              From your teacher
            </span>
            {teacherPrompt}
          </div>
        )}
        <label style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text,
          display: "block", marginBottom: 7 }}>
          Your comment on this photo
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholderText}
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
    </div>
  );
}

function StageGrid({ order, shownIds, running }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10,
      maxWidth: 460, margin: "0 auto",
    }}>
      {order.map((s) => {
        // Chunk F: monster filler cards — non-interactive visual padding.
        if (s.isMonster) {
          return (
            <div key={s.id} style={{
              background: C.panel,
              border: `1px solid ${s.color}44`,
              borderRadius: 14, padding: "10px 8px 12px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              opacity: 0.7,
              transition: running ? "all 0.18s ease" : "all 0.3s ease",
            }}>
              <div style={{
                width: "100%", aspectRatio: "1/1",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: s.color + "18", borderRadius: 10,
              }}>
                <MonsterCard index={s.monsterIndex} size={56} />
              </div>
            </div>
          );
        }

        const shown = shownIds.has(s.id);
        const live = liveEntry(s);
        const hasPhoto = !!(live && live.primary && live.mediaType === "photo");
        return (
          <div key={s.id} style={{
            background: C.panel,
            border: `1px solid ${shown ? C.panelEdge : s.color + "66"}`,
            borderRadius: 14, padding: "10px 8px 12px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            opacity: shown ? 0.4 : 1,
            transition: running ? "all 0.18s ease" : "all 0.3s ease",
            position: "relative",
          }}>
            {shown && (
              <div style={{ position: "absolute", top: 7, right: 9, fontSize: 13, color: C.light }}>✓</div>
            )}
            {hasPhoto ? (
              <img src={live.primary} alt=""
                style={{
                  width: "100%", aspectRatio: "1/1",
                  objectFit: "cover", borderRadius: 10,
                  border: `2px solid ${s.color}`,
                  display: "block",
                }} />
            ) : (
              <Avatar student={s} size={50} />
            )}
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
// ReviewGrid — slightly smaller cells so the whole grid fits comfortably
// on a single screen. Max-width tightened from 720 → 580; gap 12 → 8;
// padding 10 → 7; comment text 12 → 11.
// ─────────────────────────────────────────────────────────────────────────
// B31: the student's own tile appears in the grid (their submitted photo,
// not an avatar — students want to see their own picture next to their
// classmates') but is greyed out and unclickable. Picking yourself as a
// favorite isn't allowed; the grid just acknowledges your tile is here.
//
// B38: classmates who didn't submit a photo for this round also appear in
// the grid as greyed-out, unclickable tiles — the slot falls back to their
// profile avatar (initial + color) with a "(no photo this round)" caption
// where the comment text would normally sit. They can't be picked as a
// favorite. Treatment is parallel to isSelf: same opacity + grayscale +
// disabled button, different caption.
function ReviewGrid({ students, myComments, favoriteId, onSelectFavorite }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8,
      maxWidth: 580, margin: "0 auto",
    }}>
      {students.map((s) => {
        // Chunk F: monster filler cards — non-interactive in the review grid.
        if (s.isMonster) {
          return (
            <div
              key={s.id}
              style={{
                background: C.panel,
                border: `2px solid ${s.color}33`,
                borderRadius: 12,
                padding: 7,
                display: "flex", flexDirection: "column", gap: 6,
                opacity: 0.45,
              }}
            >
              <div style={{ width: "100%", aspectRatio: "1/1",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: s.color + "15", borderRadius: 8 }}>
                <MonsterCard index={s.monsterIndex} size={46} />
              </div>
            </div>
          );
        }

        const isSelf = !!s.isSelf;
        const isPlaceholder = !!s.isPlaceholder;
        const inactive = isSelf || isPlaceholder;
        const live = liveEntry(s);
        const hasPhoto = !!(live && live.primary && live.mediaType === "photo");
        // B33 fix: favoriteId and myComments are keyed by entry.id, not
        // student.id. See entryIdOf() comment above for full rationale.
        const eid = entryIdOf(s);
        const isFav = favoriteId === eid;
        const comment = myComments[eid] || "";
        return (
          <button
            key={s.id}
            onClick={inactive ? undefined : () => onSelectFavorite(eid)}
            disabled={inactive}
            aria-label={
              isSelf
                ? "Your own photo (can't pick yourself)"
                : isPlaceholder
                  ? `${s.name} didn't submit a photo this round`
                  : undefined
            }
            style={{
              all: "unset",
              cursor: inactive ? "default" : "pointer",
              background: isFav ? C.light + "22" : C.panel,
              border: `2px solid ${isFav ? C.light : s.color + "55"}`,
              borderRadius: 12,
              padding: 7,
              display: "flex", flexDirection: "column", gap: 6,
              position: "relative",
              transition: "all 0.18s ease",
              boxShadow: isFav ? `0 0 20px ${C.light}66` : "none",
              transform: isFav ? "scale(1.02)" : "scale(1)",
              opacity: inactive ? 0.5 : 1,
              filter: inactive ? "grayscale(0.6)" : "none",
            }}
          >
            {isFav && (
              <div style={{
                position: "absolute", top: -8, right: -8,
                width: 28, height: 28, borderRadius: "50%",
                background: C.light, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                animation: "popIn 0.25s ease",
              }}>★</div>
            )}
            {isSelf && (
              <div style={{
                position: "absolute", top: 4, left: 4, zIndex: 1,
                fontFamily: F, fontSize: 10, fontWeight: 800,
                color: C.stageDeep, background: C.light,
                padding: "2px 7px", borderRadius: 8,
                letterSpacing: 0.5,
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}>YOU</div>
            )}
            {hasPhoto ? (
              <img src={live.primary} alt=""
                style={{
                  width: "100%", aspectRatio: "1/1",
                  objectFit: "cover", borderRadius: 8,
                  display: "block",
                }} />
            ) : (
              <div style={{ width: "100%", aspectRatio: "1/1",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: s.color + "33", borderRadius: 8 }}>
                <Avatar student={s} size={42} />
              </div>
            )}
            <div style={{ fontFamily: F, fontSize: 11, color: C.text,
              lineHeight: 1.35, minHeight: 28, textAlign: "left",
              wordBreak: "break-word" }}>
              {isSelf
                ? <span style={{ color: C.textFaint, fontStyle: "italic" }}>your photo</span>
                : isPlaceholder
                  ? <span style={{ color: C.textFaint, fontStyle: "italic" }}>no photo this round</span>
                  : (comment || <span style={{ color: C.textFaint }}>(no comment)</span>)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EnrollForm — now collects EMAIL ONLY. Name, screen name, and the
// "why is this your favorite?" note are gathered on the profile, after the
// student clicks the magic link. The favorite + the nine comments still go
// up in the same Server Action call so nothing is lost.
// ─────────────────────────────────────────────────────────────────────────
function EnrollForm({ myComments, favoriteId, totalStudents, onBack }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = validEmail;

  const handleSubmit = async () => {
    if (!ready || loading) return;
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("email", email.trim());
      fd.append("comments", JSON.stringify(myComments));
      fd.append("favorites", JSON.stringify({ [favoriteId]: true }));
      const result = await enrollStudent(fd);
      if (result.ok) {
        // Wipe visitor progress on successful enrollment. Otherwise this
        // localStorage key persists and a later return to /play would offer
        // Resume from the old game the visitor just enrolled out of. (Per-
        // route saveKey() above ensures we're targeting the visitor key here,
        // not the student key.)
        clearProgress();
        setDone(true);
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 1rem", maxWidth: 440, margin: "0 auto" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✉️</div>
        <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 10px" }}>
          Check your email
        </h2>
        <p style={{ fontFamily: F, fontSize: 14, color: C.textDim, lineHeight: 1.7, maxWidth: 380, margin: "0 auto 14px" }}>
          We just sent you a Spotlight invitation. Click the link inside to open your
          profile and finish joining — that's where you'll add your name and tell us
          why you picked your favorite.
        </p>
        <p style={{ fontFamily: F, fontSize: 13, color: C.textDim, lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>
          You're joining a small class of up to {totalStudents} students. Each round you'll
          add one of your own photos and comment on the other students' photos.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "0.5rem 0" }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎓</div>
        <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>
          Join the class
        </h2>
        <p style={{ fontFamily: F, fontSize: 14, color: C.textDim, lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>
          Enter your email and we'll send you an invitation. Click the link to open
          your profile and finish up — no password needed.
        </p>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text,
          display: "block", marginBottom: 6 }}>Your email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
            fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
            border: `1px solid ${validEmail ? C.light + "88" : C.panelEdge}`,
            borderRadius: 10, outline: "none" }}
        />
      </div>

      {error && (
        <div style={{ fontFamily: F, fontSize: 13, color: "#C0392B", marginBottom: 12,
          background: "#FDECEA", border: "1px solid #F5C6CB", borderRadius: 8, padding: "9px 12px" }}>
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!ready || loading}
        style={{ width: "100%", padding: "13px", fontFamily: F, fontSize: 15, fontWeight: 700,
          background: (ready && !loading) ? C.light : C.panelEdge,
          color: (ready && !loading) ? C.stageDeep : C.textFaint,
          border: "none", borderRadius: 12,
          cursor: (ready && !loading) ? "pointer" : "not-allowed",
          letterSpacing: 0.5, marginBottom: 12 }}
      >
        {loading ? "Sending…" : "Send my invitation →"}
      </button>

      <div style={{ textAlign: "center" }}>
        <button onClick={onBack}
          style={{ fontFamily: F, fontSize: 12, color: C.textFaint, background: "none",
            border: "none", cursor: "pointer", textDecoration: "underline" }}>
          ← Back to the photos
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StudentFavoriteEdit — B32: focused on the student's chosen favorite. One
// big card showing the favorite photo, an editable comment field prefilled
// with what they wrote during the spotlight round, and "Save my comments".
//
// B48 (session 58): Once the next-round photo is uploaded (or the last
// round is saved), the celebration screen takes over the full viewport.
// No more editing escape hatches — the favorite section, comment field,
// and "pick a different" link all disappear. Just confetti, balloons,
// and a "back to dashboard" (or "see results") CTA.
//
// B49 (session 58): Favorite comment locks on first save. Before saving,
// the textarea is editable and "Pick a different favorite" is visible.
// After saving, the comment displays read-only with no Edit button, and
// the "pick a different" link is gone. The flow is: pick → comment →
// save (locked) → upload next-round photo → celebration (locked).
// ─────────────────────────────────────────────────────────────────────────
function StudentFavoriteEdit({
  favoriteStudent, myComments, favoriteId, onBack, onCommentChange,
  currentRound, totalRounds, nextRoundTopic,
}) {
  const [comment, setComment] = useState(myComments[favoriteId] || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedOnce, setSavedOnce] = useState(false);

  // B43: next-round upload state
  const nextRound = (typeof currentRound === "number" && typeof totalRounds === "number" && currentRound < totalRounds)
    ? currentRound + 1
    : null;
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null);
  const uploadFormRef = useRef(null);

  const handleSave = async () => {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const trimmed = comment.trim();
      onCommentChange(favoriteId, trimmed);
      const updatedComments = { ...myComments, [favoriteId]: trimmed };
      const fd = new FormData();
      fd.append("comments", JSON.stringify(updatedComments));
      fd.append("favorites", JSON.stringify({ [favoriteId]: true }));
      const result = await saveStudentRound(fd);
      if (result.ok) {
        if (!savedOnce) clearProgress();
        setSavedOnce(true);
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const live = liveEntry(favoriteStudent);
  const hasPhoto = !!(live && live.primary && live.mediaType === "photo");

  // ── B48: Once the next-round photo is uploaded (or the last round is
  // saved), the congratulations screen owns the full viewport. No
  // favorite editing, no "pick a different" escape hatch — just
  // celebration. The flow is final.
  const roundComplete = savedOnce && (uploadDone || !nextRound);

  if (roundComplete) {
    const isLastRound = !nextRound;
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "1rem 0", textAlign: "center" }}>
        <style>{`
          @keyframes celebrate-pop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
          @keyframes confetti-fall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(60px) rotate(360deg); opacity: 0; } }
          @keyframes balloon-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        `}</style>

        {/* Confetti burst */}
        <div style={{ position: "relative", height: 60, margin: "0 auto 8px", overflow: "hidden", maxWidth: 300 }}>
          {["🎊", "✨", "🎉", "⭐", "🎊", "✨", "🎉", "⭐", "🎊", "✨"].map((e, i) => (
            <span key={i} style={{
              position: "absolute",
              left: `${8 + i * 9}%`,
              top: 0,
              fontSize: 18 + (i % 3) * 4,
              animation: `confetti-fall ${1.2 + (i % 4) * 0.3}s ease-out ${i * 0.08}s forwards`,
              pointerEvents: "none",
            }}>{e}</span>
          ))}
        </div>

        {/* Balloons */}
        <div style={{ fontSize: 44, marginBottom: 10, display: "flex", justifyContent: "center", gap: 8 }}>
          {["🎈", "🎊", "🎈"].map((b, i) => (
            <span key={i} style={{
              animation: `balloon-float ${1.8 + i * 0.3}s ease-in-out ${i * 0.2}s infinite`,
              display: "inline-block",
            }}>{b}</span>
          ))}
        </div>

        <div style={{ animation: "celebrate-pop 0.5s ease-out forwards" }}>
          <h2 style={{ fontFamily: F, fontSize: 28, fontWeight: 900, color: C.text, margin: "0 0 6px" }}>
            {isLastRound ? "You\u2019re all done!" : `Round ${currentRound} complete!`}
          </h2>

          {!isLastRound && (
            <p style={{ fontFamily: F, fontSize: 15, color: "#2E7D32", fontWeight: 600,
              margin: "0 0 4px" }}>
              Photo uploaded for Round {nextRound} — your teacher will review it.
            </p>
          )}

          <p style={{ fontFamily: F, fontSize: 14, color: C.textDim, lineHeight: 1.6,
            margin: "8px auto 24px", maxWidth: 320 }}>
            {isLastRound
              ? "All rounds are finished — your teacher will reveal the winners soon!"
              : "Sit tight — the next round starts once your teacher opens it up."}
          </p>
        </div>

        {isLastRound ? (
          <>
            <div style={{
              background: C.panel, border: `1px solid ${C.panelEdge}`,
              borderRadius: 14, padding: "16px 20px",
              maxWidth: 340, margin: "0 auto 18px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🎪</div>
              <p style={{ fontFamily: F, fontSize: 14, color: C.text, lineHeight: 1.6,
                margin: "0 0 4px", fontWeight: 600 }}>
                Setting up for the party!
              </p>
              <p style={{ fontFamily: F, fontSize: 13, color: C.textDim, lineHeight: 1.6,
                margin: 0 }}>
                Your teacher is reviewing the final submissions. Check back soon to see who got the most favorites!
              </p>
            </div>
            <a href="/student/dashboard"
              style={{
                display: "inline-block",
                fontFamily: F, fontSize: 15, fontWeight: 700,
                color: C.stageDeep, background: C.light,
                padding: "13px 32px", borderRadius: 12,
                textDecoration: "none", letterSpacing: 0.5,
                boxShadow: `0 8px 24px ${C.light}55`,
              }}>
              Back to your dashboard →
            </a>
          </>
        ) : (
          <a href="/student/dashboard"
            style={{
              display: "inline-block",
              fontFamily: F, fontSize: 15, fontWeight: 700,
              color: C.stageDeep, background: C.light,
              padding: "13px 32px", borderRadius: 12,
              textDecoration: "none", letterSpacing: 0.5,
              boxShadow: `0 8px 24px ${C.light}55`,
            }}>
            Back to your dashboard →
          </a>
        )}
      </div>
    );
  }

  // ── Pre-save flow: favorite card + comment + upload ──
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "0.5rem 0", textAlign: "center" }}>
      <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>
        Your favorite
      </h2>
      <p style={{ fontFamily: F, fontSize: 13, color: C.textDim, lineHeight: 1.6,
        maxWidth: 360, margin: "0 auto 18px" }}>
        {!savedOnce
          ? "Here\u2019s your favorite. If you\u2019d like to change your pick or update your comment, now\u2019s the time. Students with the most favorite votes for each round will see their classmates\u2019 comments."
          : "Your comment has been saved."}
      </p>

      <div style={{
        maxWidth: 180, margin: "0 auto 16px",
        background: C.panel, border: `2px solid ${C.light}`,
        borderRadius: 14, padding: 6,
        boxShadow: `0 0 16px ${C.light}44`,
      }}>
        {hasPhoto ? (
          <img src={live.primary} alt=""
            style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover",
              borderRadius: 10, display: "block" }} />
        ) : (
          <div style={{ width: "100%", aspectRatio: "1/1",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: favoriteStudent.color + "33", borderRadius: 10 }}>
            <Avatar student={favoriteStudent} size={56} />
          </div>
        )}
      </div>

      {/* ── B49: Favorite comment is editable ONLY until first save.
           After savedOnce, the comment is locked — read-only, no Edit button. ── */}
      {!savedOnce ? (
        /* ── First-time EDIT MODE: textarea + Save button ── */
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What did you like about this one?"
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              fontFamily: F, fontSize: 14, color: C.text,
              background: "#fff", border: `1px solid ${C.panelEdge}`,
              borderRadius: 10, padding: "10px 12px",
              lineHeight: 1.5, resize: "vertical", outline: "none",
              marginBottom: 14, textAlign: "left",
            }}
          />
          {error && (
            <div style={{ fontFamily: F, fontSize: 13, color: "#C0392B", marginBottom: 12,
              background: "#FDECEA", border: "1px solid #F5C6CB", borderRadius: 8, padding: "9px 12px" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <button
              onClick={handleSave}
              disabled={loading}
              style={{ flex: 1, padding: "13px", fontFamily: F, fontSize: 15, fontWeight: 700,
                background: loading ? C.panelEdge : C.light,
                color: loading ? C.textFaint : C.stageDeep,
                border: "none", borderRadius: 12,
                cursor: loading ? "not-allowed" : "pointer",
                letterSpacing: 0.5 }}
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      ) : (
        /* ── B49: LOCKED MODE — read-only comment, no Edit button ── */
        <>
          <div style={{
            textAlign: "left", fontFamily: F, fontSize: 14, color: C.text,
            background: "#fff", border: `1px solid ${C.panelEdge}`,
            borderRadius: 10, padding: "10px 12px",
            lineHeight: 1.5, marginBottom: 10, minHeight: 40,
            wordBreak: "break-word",
          }}>
            {comment || <span style={{ color: C.textFaint, fontStyle: "italic" }}>(no comment)</span>}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, justifyContent: "center" }}>
            <span style={{ fontFamily: F, fontSize: 12, color: "#2E7D32" }}>
              ✓ Comment saved
            </span>
          </div>
        </>
      )}

      {/* ── B48: "Pick a different favorite" only visible BEFORE save.
           Once saved, favorite is locked — no going back. ── */}
      {!savedOnce && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
          gap: 18, flexWrap: "wrap", marginBottom: 8 }}>
          <button onClick={onBack}
            style={{ fontFamily: F, fontSize: 12, color: C.textFaint, background: "none",
              border: "none", cursor: "pointer", textDecoration: "underline" }}>
            ← Pick a different favorite
          </button>
        </div>
      )}

      {/* ── B43: Upload photo for the next round ── */}
      {savedOnce && nextRound && !uploadDone && (
        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: `1px solid ${C.panelEdge}`,
          textAlign: "left",
        }}>
          <h3 style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: C.text,
            margin: "0 0 4px", textAlign: "center" }}>
            Almost done with Round {currentRound} — last step!
          </h3>
          <h3 style={{ fontFamily: F, fontSize: 15, fontWeight: 600, color: C.textDim,
            margin: "0 0 6px", textAlign: "center" }}>
            Now add your photo for Round {nextRound}
          </h3>
          <p style={{ fontFamily: F, fontSize: 13, color: C.textDim, lineHeight: 1.6,
            textAlign: "center", margin: "0 0 16px" }}>
            Upload the photo your classmates will see next round.
            {nextRoundTopic ? ` The topic for Round ${nextRound} is: ${nextRoundTopic}.` : ""}
          </p>

          <form ref={uploadFormRef} onSubmit={(e) => e.preventDefault()}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.textDim,
                letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                Your photo
              </label>
              {/* B87 FIX: Single file input. Two inputs with the same name
                  caused formData.get("entry_photo") to grab the stale first
                  input when the user picked via "Choose a different photo."
                  Now one input is always visible (hidden via CSS); both
                  trigger labels point to it. */}
              <input
                type="file"
                name="entry_photo"
                accept="image/*"
                required
                id="upload-entry-photo"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setUploadPreviewUrl(url);
                  } else {
                    setUploadPreviewUrl(null);
                  }
                }}
                style={{ display: "none" }}
              />
              {!uploadPreviewUrl && (
                <label htmlFor="upload-entry-photo" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  fontFamily: F, fontSize: 13, fontWeight: 700,
                  background: C.light, color: C.stageDeep,
                  padding: "9px 20px", borderRadius: 10,
                  cursor: "pointer", letterSpacing: 0.5,
                  boxShadow: `0 4px 14px ${C.light}44`,
                  transition: "all 0.2s ease",
                }}>
                  📷 Choose a photo
                </label>
              )}
              {uploadPreviewUrl && (
                <div style={{ marginTop: 0, textAlign: "center" }}>
                  <img src={uploadPreviewUrl} alt="Preview"
                    style={{
                      maxWidth: 180, maxHeight: 180, objectFit: "cover",
                      borderRadius: 12, border: `2px solid ${C.light}`,
                      boxShadow: `0 4px 16px ${C.light}44`,
                    }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <label htmlFor="upload-entry-photo" style={{
                      fontFamily: F, fontSize: 12, color: C.textDim,
                      cursor: "pointer", textDecoration: "underline",
                    }}>
                      Choose a different photo
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.textDim,
                letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                Describe it
              </label>
              <textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Tell your classmates about this photo…"
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box", padding: "8px 10px",
                  fontFamily: F, fontSize: 13, lineHeight: 1.5,
                  border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                  resize: "vertical", outline: "none",
                }}
              />
            </div>

            {uploadError && (
              <div style={{ fontFamily: F, fontSize: 13, color: "#C0392B", marginBottom: 12,
                background: "#FDECEA", border: "1px solid #F5C6CB", borderRadius: 8, padding: "9px 12px" }}>
                {uploadError}
              </div>
            )}

            <button
              type="button"
              onClick={async () => {
                if (!uploadFormRef.current || uploadLoading) return;
                setUploadError("");
                setUploadLoading(true);
                try {
                  const fd = new FormData(uploadFormRef.current);
                  fd.set("entry_description", uploadDescription.trim());
                  fd.set("round_number", String(nextRound));
                  const result = await addEntryAction(null, fd);
                  if (result.ok) {
                    setUploadDone(true);
                  } else if (
                    typeof result.error === "string" &&
                    (result.error.toLowerCase().includes("already") ||
                     result.error.toLowerCase().includes("duplicate") ||
                     result.error.toLowerCase().includes("exists"))
                  ) {
                    // B55: entry already exists (student replaying a completed
                    // round). Treat as success — skip to celebration.
                    setUploadDone(true);
                  } else {
                    setUploadError(result.error || "Upload failed.");
                  }
                } catch (e) {
                  setUploadError("Something went wrong. Please try again.");
                } finally {
                  setUploadLoading(false);
                }
              }}
              disabled={uploadLoading}
              style={{
                padding: "9px 20px", fontFamily: F, fontSize: 13, fontWeight: 700,
                background: uploadLoading ? C.panelEdge : C.light,
                color: uploadLoading ? C.textFaint : C.stageDeep,
                border: "none", borderRadius: 10,
                cursor: uploadLoading ? "not-allowed" : "pointer",
                letterSpacing: 0.5,
              }}
            >
              {uploadLoading ? "Uploading…" : `Upload for Round ${nextRound}`}
            </button>

            {/* B55: escape hatch for students replaying a completed round —
                they've already uploaded, so let them skip without blocking. */}
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <a href="/student/dashboard"
                style={{ fontFamily: F, fontSize: 12, color: C.textFaint,
                  textDecoration: "underline" }}>
                Skip — back to your dashboard
              </a>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DoneScreen — tighter header. Removed: emoji block, "9 of 9", "Nice work."
// Kept only the prompt + the grid + the button.
//
// #39: mode="student" swaps the EnrollForm for StudentFavoriteEdit (B32).
// ─────────────────────────────────────────────────────────────────────────
function DoneScreen({
  myComments, students, totalStudents, onPlayAgain, onCommentChange, mode = "visitor",
  currentRound, totalRounds, nextRoundTopic,
}) {
  const [favoriteId, setFavoriteId] = useState(null);
  const [donePhase, setDonePhase] = useState("review");

  // B33 fix: favoriteId is an entry.id (not a student.id). Find the student
  // whose live entry matches.
  const favoriteStudent = favoriteId
    ? students.find((s) => entryIdOf(s) === favoriteId)
    : null;

  return (
    <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease", padding: "0.5rem 0" }}>
      <style>{`@keyframes popIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>

      {donePhase === "review" && (
        <>
          <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 16px" }}>
            Pick your favorite
          </h2>

          <ReviewGrid
            students={students}
            myComments={myComments}
            favoriteId={favoriteId}
            onSelectFavorite={setFavoriteId}
          />

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 6 }}>
            {!favoriteId && (
              <p style={{ fontFamily: F, fontSize: 13, color: C.textDim, margin: "0 0 6px",
                maxWidth: 280, lineHeight: 1.5 }}>
                ↑ Tap the photo you liked the most to continue
              </p>
            )}
            <button
              onClick={() => setDonePhase(mode === "student" ? "save" : "enroll")}
              disabled={!favoriteId}
              style={{
                fontFamily: F, fontSize: 15, fontWeight: 700,
                padding: "12px 34px",
                background: favoriteId ? C.light : C.panelEdge,
                color: favoriteId ? C.stageDeep : C.textFaint,
                border: "none", borderRadius: 30,
                cursor: favoriteId ? "pointer" : "not-allowed",
                letterSpacing: 0.5,
                boxShadow: favoriteId ? `0 8px 24px ${C.light}55` : "none",
                transition: "all 0.2s ease",
              }}
            >
              {mode === "student" ? "Save your favorite →" : "Join the class →"}
            </button>
            {mode !== "student" && (
              <button onClick={onPlayAgain}
                style={{ fontFamily: F, fontSize: 12, color: C.textDim, background: "none",
                  border: "none", cursor: "pointer", textDecoration: "underline", marginTop: 4 }}>
                No thanks — play again
              </button>
            )}
          </div>
        </>
      )}

      {donePhase === "enroll" && (
        <EnrollForm
          myComments={myComments}
          favoriteId={favoriteId}
          totalStudents={totalStudents}
          onBack={() => setDonePhase("review")}
        />
      )}

      {donePhase === "save" && favoriteStudent && (
        <StudentFavoriteEdit
          favoriteStudent={favoriteStudent}
          myComments={myComments}
          favoriteId={favoriteId}
          onCommentChange={onCommentChange}
          onBack={() => setDonePhase("review")}
          currentRound={currentRound}
          totalRounds={totalRounds}
          nextRoundTopic={nextRoundTopic}
        />
      )}
    </div>
  );
}

export default function App({ initialStudents = STUDENTS, mode = "visitor", currentRound, totalRounds, currentTopic, nextRoundTopic, teacherPrompt }) {
  // Chunk F: pad the deck to 9 with monster filler cards. useMemo ensures
  // the same set of monsters persists across re-renders (shuffle positions
  // are fixed for the session). Monster tiles have isMonster:true and
  // isPlaceholder:true so the engine skips them in shuffle/stop and the
  // grids render them as non-interactive visual padding.
  const paddedStudents = useMemo(() => padWithMonsters(initialStudents), [initialStudents]);

  const [view, setView] = useState("splash");
  const [phase, setPhase] = useState("idle");
  const [order, setOrder] = useState(paddedStudents);
  const [shownIds, setShownIds] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [students, setStudents] = useState(paddedStudents);
  const [myComments, setMyComments] = useState({});

  // ─────────────────────────────────────────────────────────────────────
  // isSelf-derived view of the deck (added in slice 1 engine-adaptation):
  //   playableStudents = everyone EXCEPT the current student AND any
  //                      placeholder tiles (B38). The spotlight cycle uses
  //                      this — you don't comment on yourself, and you
  //                      can't comment on a classmate who didn't submit
  //                      a photo this round, but both still SHOW in the
  //                      grid as real participants (greyed).
  //   playableCount    = how many tiles the player actually plays. Used
  //                      everywhere we previously read `students.length`
  //                      for "is the game done" / progress counters.
  //   hasSelf          = true when this is the in-class flow (class-deck
  //                      sets isSelf:true on one tile). False for the
  //                      visitor deck where nobody is "self".
  //   soloSelf         = the edge case: a freshly-joined student whose
  //                      only tile is their own pending entry. There's
  //                      nobody else to comment on yet, so the splash
  //                      shows a "waiting for classmates" message
  //                      instead of the Enter-the-stage button.
  // For the visitor deck (no isSelf/isPlaceholder flags), playableStudents
  // === students, so all the in-class adjustments below are no-ops there.
  // ─────────────────────────────────────────────────────────────────────
  const playableStudents = students.filter((s) => !s.isSelf && !s.isPlaceholder);
  const playableCount = playableStudents.length;
  const hasSelf = students.length > playableCount;
  const soloSelf = hasSelf && playableCount === 0;

  // SSR hydration gate: anything that depends on localStorage (canResume,
  // below) must NOT be evaluated during the server render or the first
  // client render — otherwise server sees "no resume" (no window) and the
  // hydrating client sees "yes resume" (saved progress in localStorage),
  // and React throws a hydration mismatch. We flip `mounted` to true in a
  // post-mount effect so the resume branch only renders after hydration
  // is safely past.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const scrambleRef = useRef(null);
  // Game ends when every PLAYABLE tile has been in the spotlight. Self is
  // never picked (see stop()), so it doesn't count toward "all shown".
  const allShown = shownIds.size >= playableCount;

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
    setPhase("running");
  }, [allShown]);

  const stop = useCallback(() => {
    if (phase !== "running") return;
    // Exclude the student's own tile AND any placeholder tiles from the
    // pool — you don't comment on yourself (isSelf), and you can't comment
    // on a classmate who didn't submit this round (isPlaceholder, B38).
    // In the visitor deck nobody is isSelf/isPlaceholder, so this is a
    // no-op there and the pool is the same as before.
    const pool = students.filter((s) => !shownIds.has(s.id) && !s.isSelf && !s.isPlaceholder);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSelected(pick);
    const live = liveEntry(pick);
    const isPhoto = live?.mediaType === "photo";
    setPhase(isPhoto ? "reveal" : "playing");
  }, [phase, students, shownIds]);

  const onVideoEnded = useCallback(() => { setPhase("reveal"); }, []);

  const finishStudent = useCallback(() => {
    if (!selected) return;
    const next = new Set(shownIds);
    next.add(selected.id);
    setShownIds(next);
    setPhase(next.size >= playableCount ? "done" : "idle");
    setSelected(null);
  }, [selected, shownIds, playableCount]);

  const saveComment = useCallback((id, text) => {
    setMyComments((c) => ({ ...c, [id]: text }));
  }, []);

  useEffect(() => {
    if (view !== "game") return;
    if (phase === "done") return;
    if (shownIds.size === 0 && Object.keys(myComments).length === 0) return;
    saveProgress({ shownIds, myComments });
  }, [view, phase, shownIds, myComments]);

  const resume = useCallback(() => {
    const p = loadProgress();
    if (!p) return;
    setShownIds(p.shownIds);
    setMyComments(p.myComments);
    setSelected(null);
    setOrder(shuffle(students));
    setPhase(p.shownIds.size >= playableCount ? "done" : "idle");
    setView("game");
  }, [students, playableCount]);

  const resetAll = useCallback(() => {
    clearProgress();
    setShownIds(new Set());
    setSelected(null);
    setPhase("idle");
    setOrder(shuffle(students));
    setMyComments({});
  }, [students]);

  // Gated on `mounted` — see the SSR hydration comment above. Before mount
  // we always render the "Enter the stage" branch, matching the server.
  const canResume = mounted && view === "splash" && hasResumableProgress();

  // B35: student mode skips the spotlight splash entirely. The boxing-match
  // round splash in shell.jsx already announces the round, so showing
  // another splash with Resume/Start-over is redundant friction. Auto-resume
  // if there's saved progress, auto-start otherwise. The visitor flow still
  // uses the splash (it's the marketing surface for the public game).
  // The soloSelf case still shows the "waiting on classmates" splash, since
  // there's nothing to auto-start into.
  useEffect(() => {
    if (!mounted) return;
    if (view !== "splash") return;
    if (mode !== "student") return;
    if (soloSelf) return;
    if (hasResumableProgress()) {
      resume();
    } else {
      resetAll();
      setView("game");
    }
  }, [mounted, view, mode, soloSelf, resume, resetAll]);

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
            maxWidth: 360, margin: "0 auto 24px", lineHeight: 1.6, animation: "fadeUp 0.9s ease" }}>
            {soloSelf
              ? "Here you are. Classmates' photos will appear in the empty spots as they join."
              : hasSelf
                ? `${playableCount} ${playableCount === 1 ? "classmate" : "classmates"} to meet. Hit stop, look closely, and tell us what you see.`
                : `${playableCount} photos. Hit stop, look closely, and tell us what you see.`}
          </p>
          {soloSelf ? (
            // No game to play yet — only the student's own tile exists. Render
            // a small 3×3 preview grid with their photo in the center and
            // dashed-border placeholders where classmates' photos will land,
            // plus a disabled "Enter the stage" button beneath. Mike's
            // direction (#25 testing): make the page feel like the game just
            // not yet populated, instead of a separate "waiting" screen. The
            // button doesn't fire — it's purely a preview of what the game
            // will look like once the deck fills up.
            <div style={{ animation: "fadeUp 1.1s ease" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 6,
                maxWidth: 240,
                margin: "0 auto 20px",
              }}>
                {Array.from({ length: 9 }).map((_, i) => {
                  // Put the student's own tile in the center (index 4) — it's
                  // the visual focal point and matches where the spotlight
                  // beam from the splash header is already pointing.
                  if (i === 4) {
                    const own = students[0];
                    const ownPhoto = own?.entries?.[0]?.primary || null;
                    return (
                      <div key={i} style={{
                        aspectRatio: "1",
                        borderRadius: 8,
                        overflow: "hidden",
                        border: `2px solid ${C.light}`,
                        background: own?.color || C.panelEdge,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 22,
                      }}>
                        {ownPhoto ? (
                          <img src={ownPhoto} alt="" style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }} />
                        ) : (
                          (own?.name?.[0] || "?").toUpperCase()
                        )}
                      </div>
                    );
                  }
                  // Chunk F: show monster cards in the empty slots instead
                  // of dashed borders. Gives the preview grid personality.
                  return (
                    <div key={i} style={{
                      aspectRatio: "1",
                      borderRadius: 8,
                      border: `1px solid ${C.panelEdge}`,
                      opacity: 0.4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: C.panel,
                    }}>
                      <MonsterCard index={i < 4 ? i : i - 1} size={36} />
                    </div>
                  );
                })}
              </div>
              <button
                disabled
                style={{ fontFamily: F, fontSize: 16, fontWeight: 700, padding: "14px 44px",
                  background: C.panelEdge, color: "#fff", border: "none", borderRadius: 50,
                  cursor: "not-allowed", letterSpacing: 1, opacity: 0.5,
                  display: "block", marginLeft: "auto", marginRight: "auto", marginBottom: 10 }}
              >
                Enter the stage
              </button>
              <div style={{
                fontFamily: F, fontSize: 12, color: C.textFaint,
                lineHeight: 1.6, maxWidth: 320, margin: "0 auto",
              }}>
                Waiting on classmates. The game starts once at least one
                classmate&apos;s photo is approved.
              </div>
            </div>
          ) : canResume ? (
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
              style={{ fontFamily: F, fontSize: 16, fontWeight: 600, padding: "14px 44px",
                background: C.light, color: C.stageDeep, border: "none", borderRadius: 50,
                cursor: "pointer", letterSpacing: 1,
                animation: "fadeUp 1.1s ease", boxShadow: `0 8px 30px ${C.light}44` }}
            >
              Enter the stage
            </button>
          )}
        </div>
      </div>
    );
  }

  // Game view: also trim header when in "done" phase (the review screen)
  const isDone = allShown && phase === "done";

  return (
    <div style={{
      minHeight: 560, background: C.stage, borderRadius: 18,
      padding: "1.25rem 1.25rem 1.75rem", border: `1px solid ${C.panelEdge}`,
      boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Show the header only DURING the game, not on the review screen */}
      {!isDone && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => {
                  if (mode === "student") {
                    window.location.href = "/student/dashboard";
                  } else {
                    setView("splash");
                  }
                }}
                style={{ background: "none", border: "none", color: C.textDim, fontSize: 18, cursor: "pointer" }}>←</button>
              <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>Spotlight</h2>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontFamily: F, fontSize: 12, color: C.textDim }}>
                ✎ {Object.values(myComments).filter((t) => t && t.trim()).length}/{playableCount}
              </span>
            </div>
          </div>

          <div style={{ fontFamily: F, fontSize: 12, color: C.textDim, textAlign: "center", marginBottom: 16 }}>
            {shownIds.size} of {playableCount} have been in the spotlight
          </div>
        </>
      )}

      {phase === "playing" && selected && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <VideoStage student={selected} src={liveEntry(selected)?.primary || null}
            mediaType={liveEntry(selected)?.mediaType || "video"}
            onEnded={onVideoEnded} label="In the spotlight" />
        </div>
      )}

      {phase === "descr" && selected && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <VideoStage student={selected} src={liveEntry(selected)?.description || null}
            onEnded={() => setPhase("reveal")} label={`${selected.name} describes the clip`} />
        </div>
      )}

      {phase === "reveal" && selected && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <ProfileCard
            student={students.find((s) => s.id === selected.id) || selected}
            onWatchDescription={() => setPhase("descr")}
            onContinue={finishStudent}
            myComment={myComments[entryIdOf(selected)] || ""}
            onSaveComment={(text) => saveComment(entryIdOf(selected), text)}
            teacherPrompt={teacherPrompt}
          />
        </div>
      )}

      {(phase === "idle" || phase === "running") && !allShown && (
        <>
          {/* Session 79 (Chunk 2): Topic label above the photo grid */}
          {currentTopic && (
            <div style={{
              fontFamily: F, fontSize: 14, fontWeight: 700,
              color: C.light, textAlign: "center",
              marginBottom: 10, letterSpacing: 0.5,
            }}>
              Topic: {currentTopic}
            </div>
          )}
          <StageGrid order={order} shownIds={shownIds} running={phase === "running"} />
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

      {isDone && (
        // NOTE on favorite locking (slice-1 decision, future implementation):
        // Students can change their favorite freely while the round is LIVE,
        // but cannot change it across rounds. Today there's no round-state
        // concept in spotlight.jsx — within a single play session, the user
        // can re-tap a different tile in the ReviewGrid until they submit.
        // The cross-round lock will be enforced server-side once the
        // round-timing feature lands.
        //
        // B31: pass `students` (the full deck including self) so the
        // student's own tile appears in the 9-cell grid, greyed out and
        // unclickable. ReviewGrid handles the isSelf rendering. The
        // can't-pick-yourself rule is enforced inside the grid via the
        // disabled button, not by filtering self out.
        //
        // onCommentChange lets the StudentFavoriteEdit screen push a
        // revised comment back into spotlight's myComments state, so if
        // the student returns to the grid they see the new text.
        <DoneScreen
          myComments={myComments}
          students={students}
          totalStudents={students.filter(s => !s.isMonster).length}
          onPlayAgain={resetAll}
          onCommentChange={saveComment}
          mode={mode}
          currentRound={currentRound}
          totalRounds={totalRounds}
          nextRoundTopic={nextRoundTopic}
        />
      )}
    </div>
  );
}
