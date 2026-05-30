"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  STUDENTS,
  TEACHER,
  liveEntry,
  archivedEntries,
  addEntry,
} from "./students.js";
import { enrollStudent } from "@/app/play/actions";

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

const SAVE_PREFIX = "spotlight:progress:";
function saveKey(name) { return SAVE_PREFIX + (name || "").trim().toLowerCase(); }
function saveProgress(name, data) {
  try {
    const payload = {
      playerName: name,
      shownIds: [...data.shownIds],
      myComments: data.myComments,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(saveKey(name), JSON.stringify(payload));
  } catch (e) {}
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
      savedAt: p.savedAt || null,
    };
  } catch (e) { return null; }
}
function clearProgress(name) { try { localStorage.removeItem(saveKey(name)); } catch (e) {} }
function hasResumableProgress(name) {
  const p = loadProgress(name);
  return !!(p && p.shownIds.size > 0);
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

function ProfileCard({
  student, onWatchDescription, onContinue, myComment, onSaveComment,
}) {
  const live = liveEntry(student);
  const hasDescription = !!(live && live.description);
  const [draft, setDraft] = useState(myComment || "");
  const trimmed = draft.trim();
  const meetsMin = trimmed.length >= MIN_COMMENT_CHARS;

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
        <label style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text,
          display: "block", marginBottom: 7 }}>
          Your comment on this photo
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What do you think? Write at least a sentence."
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
function ReviewGrid({ students, myComments, favoriteId, onSelectFavorite }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8,
      maxWidth: 580, margin: "0 auto",
    }}>
      {students.map((s) => {
        const live = liveEntry(s);
        const hasPhoto = !!(live && live.primary && live.mediaType === "photo");
        const isFav = favoriteId === s.id;
        const comment = myComments[s.id] || "";
        return (
          <button
            key={s.id}
            onClick={() => onSelectFavorite(s.id)}
            style={{
              all: "unset",
              cursor: "pointer",
              background: isFav ? C.light + "22" : C.panel,
              border: `2px solid ${isFav ? C.light : s.color + "55"}`,
              borderRadius: 12,
              padding: 7,
              display: "flex", flexDirection: "column", gap: 6,
              position: "relative",
              transition: "all 0.18s ease",
              boxShadow: isFav ? `0 0 20px ${C.light}66` : "none",
              transform: isFav ? "scale(1.02)" : "scale(1)",
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
              {comment || <span style={{ color: C.textFaint }}>(no comment)</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EnrollForm({ myComments, favoriteId, onBack }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const ready = !!name.trim() && !!email.trim() && !!photo;

  const handleSubmit = async () => {
    if (!ready || loading) return;
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("email", email);
      fd.append("photo", photo);
      fd.append("comments", JSON.stringify(myComments));
      fd.append("favorites", JSON.stringify({ [favoriteId]: true }));
      const result = await enrollStudent(fd);
      if (result.ok) {
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
      <div style={{ textAlign: "center", padding: "2rem 1rem", maxWidth: 420, margin: "0 auto" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✉️</div>
        <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 10px" }}>
          Check your email
        </h2>
        <p style={{ fontFamily: F, fontSize: 14, color: C.textDim, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
          You'll get a Spotlight invitation (sent via Supabase). Click the link inside to join the class.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "0.5rem 0" }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎓</div>
        <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>
          Complete your profile
        </h2>
        <p style={{ fontFamily: F, fontSize: 14, color: C.textDim, lineHeight: 1.6, maxWidth: 340, margin: "0 auto" }}>
          We'll email you an invitation. Click the link to join the class.
        </p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text,
          display: "block", marginBottom: 6 }}>Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First name is fine"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
            fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
            border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text,
          display: "block", marginBottom: 6 }}>Your email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
            fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
            border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text,
          display: "block", marginBottom: 6 }}>A photo of yourself</label>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {photoPreview ? (
            <img src={photoPreview} alt="preview"
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
                border: `2px solid ${C.light}` }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.panelEdge,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, color: C.textFaint }}>👤</div>
          )}
          <label style={{ fontFamily: F, fontSize: 13, fontWeight: 600, padding: "9px 18px",
            background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 20,
            cursor: "pointer", color: C.text }}>
            {photo ? "Change photo" : "Choose photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp"
              onChange={handlePhoto} style={{ display: "none" }} />
          </label>
        </div>
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
        {loading ? "Submitting…" : "Send my favorite to my new teacher →"}
      </button>

      <div style={{ textAlign: "center" }}>
        <button onClick={onBack}
          style={{ fontFamily: F, fontSize: 12, color: C.textFaint, background: "none",
            border: "none", cursor: "pointer", textDecoration: "underline" }}>
          ← Back to my photos
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DoneScreen — tighter header. Removed: emoji block, "9 of 9", "Nice work."
// Kept only the prompt + the grid + the button.
// ─────────────────────────────────────────────────────────────────────────
function DoneScreen({
  playerName, myComments, students, totalStudents, onPlayAgain,
}) {
  const [favoriteId, setFavoriteId] = useState(null);
  const [donePhase, setDonePhase] = useState("review");

  return (
    <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease", padding: "0.5rem 0" }}>
      <style>{`@keyframes popIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>

      {donePhase === "review" && (
        <>
          <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 4px" }}>
            Pick your favorite
          </h2>
          <p style={{ fontFamily: F, fontSize: 13, color: C.textDim, margin: "0 auto 16px" }}>
            Tap the photo you liked the most.
          </p>

          <ReviewGrid
            students={students}
            myComments={myComments}
            favoriteId={favoriteId}
            onSelectFavorite={setFavoriteId}
          />

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setDonePhase("enroll")}
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
              Join the class →
            </button>
            <button onClick={onPlayAgain}
              style={{ fontFamily: F, fontSize: 12, color: C.textDim, background: "none",
                border: "none", cursor: "pointer", textDecoration: "underline", marginTop: 4 }}>
              No thanks — play again
            </button>
          </div>
        </>
      )}

      {donePhase === "enroll" && (
        <EnrollForm
          myComments={myComments}
          favoriteId={favoriteId}
          onBack={() => setDonePhase("review")}
        />
      )}
    </div>
  );
}

export default function App({ initialStudents = STUDENTS }) {
  const [view, setView] = useState("splash");
  const [phase, setPhase] = useState("idle");
  const [order, setOrder] = useState(initialStudents);
  const [shownIds, setShownIds] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [students, setStudents] = useState(initialStudents);
  const [myComments, setMyComments] = useState({});
  const [playerName, setPlayerName] = useState("");

  const scrambleRef = useRef(null);
  const allShown = shownIds.size >= students.length;

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
    const pool = students.filter((s) => !shownIds.has(s.id));
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
    setPhase(next.size >= students.length ? "done" : "idle");
    setSelected(null);
  }, [selected, shownIds, students.length]);

  const saveComment = useCallback((id, text) => {
    setMyComments((c) => ({ ...c, [id]: text }));
  }, []);

  useEffect(() => {
    if (view !== "game") return;
    if (phase === "done") return;
    if (!playerName.trim()) return;
    if (shownIds.size === 0 && Object.keys(myComments).length === 0) return;
    saveProgress(playerName, { shownIds, myComments });
  }, [view, phase, playerName, shownIds, myComments]);

  const resume = useCallback(() => {
    const p = loadProgress(playerName);
    if (!p) return;
    setPlayerName(p.playerName);
    setShownIds(p.shownIds);
    setMyComments(p.myComments);
    setSelected(null);
    setOrder(shuffle(students));
    setPhase(p.shownIds.size >= students.length ? "done" : "idle");
    setView("game");
  }, [playerName, students]);

  const resetAll = useCallback(() => {
    clearProgress(playerName);
    setShownIds(new Set());
    setSelected(null);
    setPhase("idle");
    setOrder(shuffle(students));
    setMyComments({});
  }, [students, playerName]);

  const canResume = view === "splash" && playerName.trim() && hasResumableProgress(playerName);

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
            maxWidth: 360, margin: "0 auto 22px", lineHeight: 1.6, animation: "fadeUp 0.9s ease" }}>
            Nine photos. Hit stop, look closely, and tell us what you see.
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
              <button onClick={() => setView("splash")}
                style={{ background: "none", border: "none", color: C.textDim, fontSize: 18, cursor: "pointer" }}>←</button>
              <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>Spotlight</h2>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontFamily: F, fontSize: 12, color: C.textDim }}>
                ✎ {Object.values(myComments).filter((t) => t && t.trim()).length}/{students.length}
              </span>
            </div>
          </div>

          <div style={{ fontFamily: F, fontSize: 12, color: C.textDim, textAlign: "center", marginBottom: 16 }}>
            {shownIds.size} of {students.length} have been in the spotlight
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
            myComment={myComments[selected.id] || ""}
            onSaveComment={(text) => saveComment(selected.id, text)}
          />
        </div>
      )}

      {(phase === "idle" || phase === "running") && !allShown && (
        <>
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
        <DoneScreen
          playerName={playerName}
          myComments={myComments}
          students={students}
          totalStudents={students.length}
          onPlayAgain={resetAll}
        />
      )}
    </div>
  );
}
