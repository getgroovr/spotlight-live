// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/play/multi/[gameId]/play-client.tsx
//
// Session 105: Client component for multi-teacher game student play.
//
// Flow:
//   1. SPLASH — Game title, round topic, "Enter the stage" button
//   2. GAME — 3×3 photo grid (blind — no avatars, no names), shuffle-stop
//      through all 9 photos. Each stop shows the photo larger with its
//      description and a comment field. Same mechanic as spotlight.jsx.
//   3. FAVORITES — Pick top 3 favorites in sequence (1st → 2nd → 3rd).
//      Each pick reveals the monster avatar of the photo's teacher.
//      Student writes a favorite comment on each pick.
//   4. SUBMIT — Email form. Saves votes + comments in one shot.
//   5. DONE — Confirmation screen.
//
// All state is client-side until the final submit. No authentication
// required during play — matches the existing visitor flow pattern.
//
// Key differences from spotlight.jsx:
//   - Photos are from teachers (multi_teacher_photos), not students
//   - No student names shown during play — photos are completely blind
//   - After shuffle-stop, pick TOP 3 (not just 1 favorite)
//   - Each pick reveals the MONSTER AVATAR (not teacher identity)
//   - Votes scored: 1st = 3pts, 2nd = 2pts, 3rd = 1pt
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { submitMultiGamePlay } from "../actions";
import { MonsterAvatar } from "@/game/monsters.jsx";

// ── Styling constants (matches existing warm theme) ──────────────────
const F = "'Outfit', sans-serif";
const C = {
  stage: "#E8D3A8",
  stageDeep: "#7a5a3a",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  success: "#2B8A3E",
  error: "#C53030",
};

const MIN_COMMENT_CHARS = 8;
const MIN_FAV_COMMENT_CHARS = 15;
const PHOTO_DISPLAY_MS = 3000;

// ── Types ────────────────────────────────────────────────────────────
type Photo = {
  id: string;
  teacherId: string;
  mediaUrl: string;
  description: string;
};

type Monster = {
  id: string;
  name: string;
  monsterIndex: number;
  personality: string;
  bodyColor: string;
  accentColor: string;
  bellyColor: string;
};

type GameInfo = {
  id: string;
  topic: string;
  status: string;
  totalRounds: number;
};

type RoundInfo = {
  id: string;
  roundNumber: number;
  topic: string;
};

// ── Helpers ──────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const b = [...arr];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// ── Comment prompts (from spotlight.jsx) ─────────────────────────────
const PROMPTS = [
  "Drop a comment so good they'll frame it.",
  "Say something nice. Or something clever. Or both.",
  "Your words here. Make 'em count.",
  "Be the comment you wish someone left on YOUR photo.",
  "Two thumbs up? Tell them WHY.",
  "Pretend you're a food critic, but for photos.",
  "Quick — say something before the moment passes!",
  "This photo isn't going to compliment itself.",
  "If this photo could talk, what would YOU say back?",
];

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export function MultiPlayClient({
  game,
  round,
  photos,
  monsters,
  teacherAvatarMap,
  hasSubmitted,
}: {
  game: GameInfo;
  round: RoundInfo;
  photos: Photo[];
  monsters: Monster[];
  teacherAvatarMap: Record<string, string>; // teacherId → monsterId
  hasSubmitted: boolean;
}) {
  // If already submitted, show the done state
  if (hasSubmitted) {
    return <AlreadySubmitted game={game} round={round} />;
  }

  return (
    <GameEngine
      game={game}
      round={round}
      photos={photos}
      monsters={monsters}
      teacherAvatarMap={teacherAvatarMap}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════
// Game engine — manages all state transitions
// ═════════════════════════════════════════════════════════════════════
function GameEngine({
  game,
  round,
  photos,
  monsters,
  teacherAvatarMap,
}: {
  game: GameInfo;
  round: RoundInfo;
  photos: Photo[];
  monsters: Monster[];
  teacherAvatarMap: Record<string, string>;
}) {
  type View = "splash" | "game" | "favorites" | "submit" | "done";

  // Shuffle photo order once on mount
  const shuffledPhotos = useMemo(() => shuffle(photos), [photos]);

  const [view, setView] = useState<View>("splash");
  const [order, setOrder] = useState(shuffledPhotos);
  const [phase, setPhase] = useState<"idle" | "running" | "reveal">("idle");
  const [shownIds, setShownIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Photo | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const scrambleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Favorites state
  const [favorites, setFavorites] = useState<Photo[]>([]);
  const [favComments, setFavComments] = useState<Record<string, string>>({});
  const [pickingRank, setPickingRank] = useState(1); // 1, 2, or 3

  // Submit state
  const [submitMessage, setSubmitMessage] = useState("");

  const allShown = shownIds.size >= photos.length;

  // Helper: find monster for a photo's teacher
  const getMonsterForPhoto = useCallback(
    (photo: Photo): Monster | null => {
      const monsterId = teacherAvatarMap[photo.teacherId];
      if (!monsterId) return null;
      return monsters.find((m) => m.id === monsterId) || null;
    },
    [teacherAvatarMap, monsters],
  );

  // ── Shuffle-stop mechanic ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") {
      if (scrambleRef.current) clearInterval(scrambleRef.current);
      return;
    }
    scrambleRef.current = setInterval(() => {
      setOrder((o) => shuffle(o));
    }, 180);
    return () => {
      if (scrambleRef.current) clearInterval(scrambleRef.current);
    };
  }, [phase]);

  const startShuffle = useCallback(() => {
    if (allShown) return;
    setSelected(null);
    setPhase("running");
  }, [allShown]);

  const stopShuffle = useCallback(() => {
    if (phase !== "running") return;
    const pool = photos.filter((p) => !shownIds.has(p.id));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSelected(pick);
    setPhase("reveal");
  }, [phase, photos, shownIds]);

  const finishPhoto = useCallback(() => {
    if (!selected) return;
    const next = new Set(shownIds);
    next.add(selected.id);
    setShownIds(next);
    setSelected(null);

    if (next.size >= photos.length) {
      // All photos seen — move to favorites
      setView("favorites");
      setPickingRank(1);
    } else {
      setPhase("idle");
    }
  }, [selected, shownIds, photos.length]);

  const saveComment = useCallback((photoId: string, text: string) => {
    setComments((c) => ({ ...c, [photoId]: text }));
  }, []);

  const saveFavComment = useCallback((photoId: string, text: string) => {
    setFavComments((c) => ({ ...c, [photoId]: text }));
  }, []);

  // ── Favorite pick handler ─────────────────────────────────────────
  const pickFavorite = useCallback(
    (photo: Photo) => {
      setFavorites((prev) => [...prev, photo]);
      if (pickingRank < 3) {
        setPickingRank((r) => r + 1);
      } else {
        setView("submit");
      }
    },
    [pickingRank],
  );

  // ── Submit handler ────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (email: string) => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("game_id", game.id);
      fd.set("round_id", round.id);
      fd.set(
        "votes",
        JSON.stringify(
          favorites.map((p, i) => ({
            photo_id: p.id,
            rank: i + 1,
          })),
        ),
      );
      fd.set("comments", JSON.stringify(comments));
      fd.set("fav_comments", JSON.stringify(favComments));

      const result = await submitMultiGamePlay(fd);
      if (result.ok) {
        setSubmitMessage(
          result.message || "Your votes are in!",
        );
        setView("done");
        return { ok: true as const };
      }
      return { ok: false as const, error: result.error };
    },
    [game.id, round.id, favorites, comments, favComments],
  );

  // ── Reset ─────────────────────────────────────────────────────────
  const resetGame = useCallback(() => {
    setView("splash");
    setPhase("idle");
    setShownIds(new Set());
    setSelected(null);
    setOrder(shuffle(photos));
    setComments({});
    setFavorites([]);
    setFavComments({});
    setPickingRank(1);
    setSubmitMessage("");
  }, [photos]);

  // ── Render ────────────────────────────────────────────────────────
  if (view === "splash") {
    return (
      <Splash
        game={game}
        round={round}
        photoCount={photos.length}
        onStart={() => {
          setOrder(shuffle(photos));
          setView("game");
        }}
      />
    );
  }

  if (view === "done") {
    return <DoneScreen message={submitMessage} game={game} />;
  }

  if (view === "submit") {
    return (
      <SubmitScreen
        favorites={favorites}
        favComments={favComments}
        getMonster={getMonsterForPhoto}
        onSubmit={handleSubmit}
        onBack={() => {
          // Let them re-pick favorites
          setFavorites([]);
          setFavComments({});
          setPickingRank(1);
          setView("favorites");
        }}
      />
    );
  }

  if (view === "favorites") {
    return (
      <FavoritesPhase
        photos={photos}
        favorites={favorites}
        pickingRank={pickingRank}
        favComments={favComments}
        comments={comments}
        onPick={pickFavorite}
        onSaveFavComment={saveFavComment}
        getMonster={getMonsterForPhoto}
      />
    );
  }

  // ── GAME VIEW ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: 560,
        background: C.stage,
        borderRadius: 18,
        padding: "1.25rem 1.25rem 1.75rem",
        border: `1px solid ${C.panelEdge}`,
        boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Header */}
      {phase !== "reveal" && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={resetGame}
                style={{
                  background: "none",
                  border: "none",
                  color: C.textDim,
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ←
              </button>
              <h2
                style={{
                  fontFamily: F,
                  fontSize: 20,
                  fontWeight: 800,
                  color: C.text,
                  margin: 0,
                }}
              >
                Spotlight
              </h2>
            </div>
            <span style={{ fontFamily: F, fontSize: 12, color: C.textDim }}>
              ✎ {Object.values(comments).filter((t) => t?.trim()).length}/
              {photos.length}
            </span>
          </div>

          {round.topic && (
            <div
              style={{
                fontFamily: F,
                fontSize: 14,
                fontWeight: 700,
                color: C.light,
                textAlign: "center",
                marginBottom: 10,
                letterSpacing: 0.5,
              }}
            >
              Topic: {round.topic}
            </div>
          )}

          <div
            style={{
              fontFamily: F,
              fontSize: 12,
              color: C.textDim,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            {shownIds.size} of {photos.length} have been in the spotlight
          </div>
        </>
      )}

      {/* Photo reveal (after stop) */}
      {phase === "reveal" && selected && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <PhotoReveal
            photo={selected}
            comment={comments[selected.id] || ""}
            onSaveComment={(text) => saveComment(selected.id, text)}
            onContinue={finishPhoto}
          />
        </div>
      )}

      {/* Grid + spin/stop buttons */}
      {(phase === "idle" || phase === "running") && (
        <>
          <PhotoGrid order={order} shownIds={shownIds} running={phase === "running"} />
          <div style={{ textAlign: "center", marginTop: 24 }}>
            {phase === "idle" ? (
              <button
                onClick={startShuffle}
                style={{
                  fontFamily: F,
                  fontSize: 16,
                  fontWeight: 700,
                  padding: "14px 50px",
                  background: C.light,
                  color: C.stageDeep,
                  border: "none",
                  borderRadius: 50,
                  cursor: "pointer",
                  letterSpacing: 1,
                  boxShadow: `0 8px 30px ${C.light}44`,
                }}
              >
                {shownIds.size === 0 ? "Start" : "Spin again"}
              </button>
            ) : (
              <button
                onClick={stopShuffle}
                style={{
                  fontFamily: F,
                  fontSize: 16,
                  fontWeight: 700,
                  padding: "14px 56px",
                  background: "#E2554A",
                  color: "#fff",
                  border: "none",
                  borderRadius: 50,
                  cursor: "pointer",
                  letterSpacing: 2,
                  boxShadow: "0 8px 30px #E2554A55",
                }}
              >
                STOP
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Splash screen
// ═════════════════════════════════════════════════════════════════════
function Splash({
  game,
  round,
  photoCount,
  onStart,
}: {
  game: GameInfo;
  round: RoundInfo;
  photoCount: number;
  onStart: () => void;
}) {
  return (
    <div
      style={{
        minHeight: 560,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: C.stage,
        borderRadius: 18,
        padding: "3rem 1.5rem",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${C.panelEdge}`,
        boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes beam{0%,100%{opacity:0.5}50%{opacity:0.9}}`}</style>

      <div
        style={{
          position: "absolute",
          top: -80,
          left: "50%",
          transform: "translateX(-50%)",
          width: 360,
          height: 420,
          background: `conic-gradient(from 180deg at 50% 0%, transparent 78deg, ${C.light}26 90deg, transparent 102deg)`,
          animation: "beam 4s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            fontFamily: F,
            fontSize: 11,
            letterSpacing: 5,
            color: C.light,
            marginBottom: 6,
            animation: "fadeUp 0.6s ease",
            textTransform: "uppercase",
          }}
        >
          Multi-Teacher Game
        </div>
        <h1
          style={{
            fontFamily: F,
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: -2,
            color: C.text,
            margin: "0 0 6px",
            animation: "fadeUp 0.7s ease",
          }}
        >
          Spotlight
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 16,
            fontWeight: 600,
            color: C.text,
            margin: "0 0 4px",
            animation: "fadeUp 0.8s ease",
          }}
        >
          {game.topic}
        </p>
        {round.topic && round.topic !== game.topic && (
          <p
            style={{
              fontFamily: F,
              fontSize: 14,
              color: C.textDim,
              margin: "0 0 4px",
              fontStyle: "italic",
              animation: "fadeUp 0.85s ease",
            }}
          >
            Round {round.roundNumber}: {round.topic}
          </p>
        )}
        <p
          style={{
            fontFamily: F,
            fontSize: 15,
            fontWeight: 300,
            color: C.textDim,
            maxWidth: 380,
            margin: "0 auto 28px",
            lineHeight: 1.6,
            animation: "fadeUp 0.9s ease",
          }}
        >
          {photoCount} photos from mystery teachers. Spin, stop, look
          closely, and pick your 3 favorites.
        </p>

        <button
          onClick={onStart}
          style={{
            fontFamily: F,
            fontSize: 16,
            fontWeight: 600,
            padding: "14px 44px",
            background: C.light,
            color: C.stageDeep,
            border: "none",
            borderRadius: 50,
            cursor: "pointer",
            letterSpacing: 1,
            animation: "fadeUp 1.1s ease",
            boxShadow: `0 8px 30px ${C.light}44`,
          }}
        >
          Enter the stage
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// 3×3 photo grid — blind (no avatars, no names)
// ═════════════════════════════════════════════════════════════════════
function PhotoGrid({
  order,
  shownIds,
  running,
}: {
  order: Photo[];
  shownIds: Set<string>;
  running: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 6,
        width: "100%",
        maxWidth: 460,
        margin: "0 auto",
      }}
    >
      {order.map((p) => {
        const shown = shownIds.has(p.id);
        return (
          <div
            key={p.id}
            style={{
              background: C.panel,
              border: `1px solid ${shown ? C.panelEdge : C.light + "66"}`,
              borderRadius: 14,
              padding: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              opacity: shown ? 0.4 : 1,
              transition: running ? "all 0.18s ease" : "all 0.3s ease",
              position: "relative",
            }}
          >
            {shown && (
              <div
                style={{
                  position: "absolute",
                  top: 7,
                  right: 9,
                  fontSize: 13,
                  color: C.light,
                  zIndex: 1,
                }}
              >
                ✓
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.mediaUrl}
              alt=""
              style={{
                width: "100%",
                aspectRatio: "1/1",
                objectFit: "cover",
                borderRadius: 10,
                display: "block",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Photo reveal — shown after stopping the shuffle
// ═════════════════════════════════════════════════════════════════════
function PhotoReveal({
  photo,
  comment,
  onSaveComment,
  onContinue,
}: {
  photo: Photo;
  comment: string;
  onSaveComment: (text: string) => void;
  onContinue: () => void;
}) {
  const [draft, setDraft] = useState(comment);
  const meetsMin = draft.trim().length >= MIN_COMMENT_CHARS;
  const promptIdx = useMemo(
    () => Math.floor(Math.random() * PROMPTS.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photo.id],
  );

  useEffect(() => {
    setDraft(comment);
  }, [photo.id, comment]);

  const handleContinue = () => {
    if (!meetsMin) return;
    onSaveComment(draft.trim());
    onContinue();
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 460,
        margin: "0 auto",
        background: C.panel,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 20,
        padding: "1.75rem 1.5rem",
        boxShadow: `0 0 60px ${C.light}33, 0 14px 34px #7a5a3a55`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.mediaUrl}
          alt=""
          style={{
            width: "100%",
            maxWidth: 380,
            aspectRatio: "4/3",
            objectFit: "cover",
            borderRadius: 16,
            border: `2px solid ${C.light}`,
            boxShadow: `0 0 40px ${C.light}55`,
            display: "block",
          }}
        />

        <div
          style={{
            fontFamily: F,
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: C.light,
            margin: "14px 0 6px",
          }}
        >
          In the spotlight
        </div>

        {photo.description && (
          <p
            style={{
              fontFamily: F,
              fontSize: 13,
              color: C.text,
              lineHeight: 1.6,
              margin: "0 0 12px",
              maxWidth: 360,
              fontStyle: "italic",
              borderLeft: `2px solid ${C.light}`,
              paddingLeft: 12,
              textAlign: "left",
            }}
          >
            &ldquo;{photo.description}&rdquo;
          </p>
        )}
      </div>

      {/* Comment field */}
      <div style={{ marginTop: 16 }}>
        <label
          style={{
            fontFamily: F,
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            display: "block",
            marginBottom: 7,
          }}
        >
          Your comment on this photo
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={PROMPTS[promptIdx]}
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontFamily: F,
            fontSize: 14,
            lineHeight: 1.5,
            background: "#FFFDF7",
            color: C.text,
            border: `1px solid ${meetsMin ? C.light + "88" : C.panelEdge}`,
            borderRadius: 12,
            outline: "none",
            resize: "vertical",
          }}
        />
        <div
          style={{
            fontFamily: F,
            fontSize: 11,
            color: meetsMin ? C.light : C.textFaint,
            marginTop: 5,
          }}
        >
          {meetsMin
            ? "✓ Looks good — you can continue."
            : `Write a little more (at least ${MIN_COMMENT_CHARS} characters).`}
        </div>
      </div>

      <button
        onClick={handleContinue}
        disabled={!meetsMin}
        style={{
          width: "100%",
          marginTop: 14,
          padding: "13px",
          fontFamily: F,
          fontSize: 15,
          fontWeight: 700,
          background: meetsMin ? C.light : C.panelEdge,
          color: meetsMin ? C.stageDeep : C.textFaint,
          border: "none",
          borderRadius: 12,
          cursor: meetsMin ? "pointer" : "not-allowed",
          letterSpacing: 0.5,
          transition: "all 0.2s ease",
        }}
      >
        Save comment & continue
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Favorites phase — pick top 3 in sequence with avatar reveal
// ═════════════════════════════════════════════════════════════════════
function FavoritesPhase({
  photos,
  favorites,
  pickingRank,
  favComments,
  comments,
  onPick,
  onSaveFavComment,
  getMonster,
}: {
  photos: Photo[];
  favorites: Photo[];
  pickingRank: number;
  favComments: Record<string, string>;
  comments: Record<string, string>;
  onPick: (photo: Photo) => void;
  onSaveFavComment: (photoId: string, text: string) => void;
  getMonster: (photo: Photo) => Monster | null;
}) {
  const pickedIds = new Set(favorites.map((f) => f.id));
  const [selectedFav, setSelectedFav] = useState<Photo | null>(null);
  const [favDraft, setFavDraft] = useState("");
  const [showReveal, setShowReveal] = useState(false);

  // Reset selection when rank changes
  useEffect(() => {
    setSelectedFav(null);
    setFavDraft("");
    setShowReveal(false);
  }, [pickingRank]);

  const rankLabels = ["", "1st favorite", "2nd favorite", "3rd favorite"];
  const rankPoints = ["", "3 pts", "2 pts", "1 pt"];
  const meetsMin = favDraft.trim().length >= MIN_FAV_COMMENT_CHARS;

  const handleConfirmPick = () => {
    if (!selectedFav || !meetsMin) return;
    onSaveFavComment(selectedFav.id, favDraft.trim());
    onPick(selectedFav);
  };

  // If a favorite is selected, show the reveal + comment screen
  if (selectedFav && showReveal) {
    const monster = getMonster(selectedFav);

    return (
      <div
        style={{
          minHeight: 560,
          background: C.stage,
          borderRadius: 18,
          padding: "1.25rem 1.25rem 1.75rem",
          border: `1px solid ${C.panelEdge}`,
          boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
        }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
          @keyframes fadeIn{from{opacity:0}to{opacity:1}}
          @keyframes popIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>

        <div
          style={{
            maxWidth: 460,
            margin: "0 auto",
            textAlign: "center",
            animation: "fadeIn 0.5s ease",
          }}
        >
          <div
            style={{
              fontFamily: F,
              fontSize: 11,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: C.light,
              marginBottom: 6,
            }}
          >
            Your {rankLabels[pickingRank]} ({rankPoints[pickingRank]})
          </div>

          {/* Photo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedFav.mediaUrl}
            alt=""
            style={{
              width: "100%",
              maxWidth: 320,
              aspectRatio: "4/3",
              objectFit: "cover",
              borderRadius: 16,
              border: `2px solid ${C.light}`,
              boxShadow: `0 0 40px ${C.light}55`,
              display: "block",
              margin: "0 auto 16px",
            }}
          />

          {selectedFav.description && (
            <p
              style={{
                fontFamily: F,
                fontSize: 13,
                color: C.text,
                fontStyle: "italic",
                margin: "0 auto 16px",
                maxWidth: 360,
                lineHeight: 1.5,
              }}
            >
              &ldquo;{selectedFav.description}&rdquo;
            </p>
          )}

          {/* Avatar reveal */}
          {monster && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: monster.bodyColor + "18",
                border: `1px solid ${monster.bodyColor}44`,
                borderRadius: 14,
                padding: "12px 16px",
                margin: "0 auto 16px",
                maxWidth: 340,
                animation: "popIn 0.4s ease",
              }}
            >
              <MonsterAvatar
                index={monster.monsterIndex}
                size={48}
                ring
              />
              <div style={{ textAlign: "left" }}>
                <div
                  style={{
                    fontFamily: F,
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.text,
                  }}
                >
                  This photo was by {monster.name}!
                </div>
                <div
                  style={{
                    fontFamily: F,
                    fontSize: 11,
                    color: C.textDim,
                    fontStyle: "italic",
                  }}
                >
                  {monster.personality.length > 80
                    ? monster.personality.slice(0, 80) + "…"
                    : monster.personality}
                </div>
              </div>
            </div>
          )}

          {/* Favorite comment */}
          <div style={{ textAlign: "left", marginTop: 12 }}>
            <label
              style={{
                fontFamily: F,
                fontSize: 13,
                fontWeight: 600,
                color: C.text,
                display: "block",
                marginBottom: 7,
              }}
            >
              Why is this your {rankLabels[pickingRank]}?
            </label>
            <textarea
              value={favDraft}
              onChange={(e) => setFavDraft(e.target.value)}
              placeholder="Tell us what you loved about this photo…"
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                fontFamily: F,
                fontSize: 14,
                lineHeight: 1.5,
                background: "#FFFDF7",
                color: C.text,
                border: `1px solid ${meetsMin ? C.light + "88" : C.panelEdge}`,
                borderRadius: 12,
                outline: "none",
                resize: "vertical",
              }}
            />
            <div
              style={{
                fontFamily: F,
                fontSize: 11,
                color: meetsMin ? C.light : C.textFaint,
                marginTop: 5,
              }}
            >
              {meetsMin
                ? "✓ Looks good."
                : `Write at least ${MIN_FAV_COMMENT_CHARS} characters.`}
            </div>
          </div>

          <button
            onClick={handleConfirmPick}
            disabled={!meetsMin}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "13px",
              fontFamily: F,
              fontSize: 15,
              fontWeight: 700,
              background: meetsMin ? C.light : C.panelEdge,
              color: meetsMin ? C.stageDeep : C.textFaint,
              border: "none",
              borderRadius: 12,
              cursor: meetsMin ? "pointer" : "not-allowed",
              letterSpacing: 0.5,
            }}
          >
            {pickingRank < 3
              ? `Confirm ${rankLabels[pickingRank]} →`
              : "Confirm & submit your picks →"}
          </button>

          <button
            onClick={() => {
              setSelectedFav(null);
              setShowReveal(false);
              setFavDraft("");
            }}
            style={{
              fontFamily: F,
              fontSize: 12,
              color: C.textDim,
              background: "none",
              border: "none",
              cursor: "pointer",
              marginTop: 10,
              textDecoration: "underline",
            }}
          >
            Pick a different photo
          </button>
        </div>
      </div>
    );
  }

  // ── Selection grid ────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: 560,
        background: C.stage,
        borderRadius: 18,
        padding: "1.25rem 1.25rem 1.75rem",
        border: `1px solid ${C.panelEdge}`,
        boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes popIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>

      <h2
        style={{
          fontFamily: F,
          fontSize: 22,
          fontWeight: 800,
          color: C.text,
          margin: "0 0 6px",
          textAlign: "center",
        }}
      >
        Pick your {rankLabels[pickingRank]}
      </h2>
      <p
        style={{
          fontFamily: F,
          fontSize: 13,
          color: C.textDim,
          textAlign: "center",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        Tap the photo you liked {pickingRank === 1 ? "the most" : pickingRank === 2 ? "second most" : "third most"}.
        {pickingRank === 1 ? " (3 pts)" : pickingRank === 2 ? " (2 pts)" : " (1 pt)"}
      </p>

      {/* Review grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          maxWidth: 580,
          margin: "0 auto",
        }}
      >
        {photos.map((p) => {
          const isPicked = pickedIds.has(p.id);
          const isSelected = selectedFav?.id === p.id;
          const comment = comments[p.id] || "";
          return (
            <button
              key={p.id}
              onClick={isPicked ? undefined : () => {
                setSelectedFav(p);
                setShowReveal(true);
                setFavDraft("");
              }}
              disabled={isPicked}
              style={{
                all: "unset",
                cursor: isPicked ? "default" : "pointer",
                background: isSelected ? C.light + "22" : C.panel,
                border: `2px solid ${isSelected ? C.light : isPicked ? C.panelEdge + "44" : C.light + "55"}`,
                borderRadius: 12,
                padding: 7,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                position: "relative",
                transition: "all 0.18s ease",
                opacity: isPicked ? 0.4 : 1,
                filter: isPicked ? "grayscale(0.5)" : "none",
              }}
            >
              {isPicked && (
                <div
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: C.success,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    fontFamily: F,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                    animation: "popIn 0.25s ease",
                  }}
                >
                  {favorites.findIndex((f) => f.id === p.id) + 1}
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.mediaUrl}
                alt=""
                style={{
                  width: "100%",
                  aspectRatio: "1/1",
                  objectFit: "cover",
                  borderRadius: 8,
                  display: "block",
                }}
              />
              <div
                style={{
                  fontFamily: F,
                  fontSize: 11,
                  color: C.text,
                  lineHeight: 1.35,
                  minHeight: 28,
                  textAlign: "left",
                  wordBreak: "break-word",
                }}
              >
                {comment || (
                  <span style={{ color: C.textFaint }}>(no comment)</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Submit screen — email form
// ═════════════════════════════════════════════════════════════════════
function SubmitScreen({
  favorites,
  favComments,
  getMonster,
  onSubmit,
  onBack,
}: {
  favorites: Photo[];
  favComments: Record<string, string>;
  getMonster: (photo: Photo) => Monster | null;
  onSubmit: (email: string) => Promise<{ ok: boolean; error?: string }>;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async () => {
    if (!validEmail || loading) return;
    setError("");
    setLoading(true);
    const result = await onSubmit(email.trim());
    if (!result.ok) {
      setError(result.error || "Something went wrong.");
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: 560,
        background: C.stage,
        borderRadius: 18,
        padding: "1.5rem",
        border: `1px solid ${C.panelEdge}`,
        boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
        <h2
          style={{
            fontFamily: F,
            fontSize: 22,
            fontWeight: 800,
            color: C.text,
            margin: "0 0 8px",
          }}
        >
          Your picks are ready
        </h2>
        <p
          style={{
            fontFamily: F,
            fontSize: 14,
            color: C.textDim,
            lineHeight: 1.6,
            margin: "0 auto 20px",
            maxWidth: 340,
          }}
        >
          Enter your email to submit your votes. We&apos;ll send you a link
          so you can come back for the reveal.
        </p>

        {/* Summary of picks */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          {favorites.map((p, i) => {
            const monster = getMonster(p);
            return (
              <div
                key={p.id}
                style={{
                  background: C.panel,
                  border: `2px solid ${C.light}`,
                  borderRadius: 12,
                  padding: 5,
                  width: 90,
                  textAlign: "center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.mediaUrl}
                  alt=""
                  style={{
                    width: "100%",
                    aspectRatio: "1/1",
                    objectFit: "cover",
                    borderRadius: 8,
                    display: "block",
                    marginBottom: 4,
                  }}
                />
                <div
                  style={{
                    fontFamily: F,
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.light,
                  }}
                >
                  #{i + 1}
                </div>
                {monster && (
                  <div
                    style={{
                      fontFamily: F,
                      fontSize: 9,
                      color: C.textDim,
                    }}
                  >
                    {monster.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Email input */}
        <div style={{ marginBottom: 18, textAlign: "left" }}>
          <label
            style={{
              fontFamily: F,
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              display: "block",
              marginBottom: 6,
            }}
          >
            Your email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              fontFamily: F,
              fontSize: 14,
              background: "#FFFDF7",
              color: C.text,
              border: `1px solid ${validEmail ? C.light + "88" : C.panelEdge}`,
              borderRadius: 10,
              outline: "none",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              fontFamily: F,
              fontSize: 13,
              color: C.error,
              marginBottom: 12,
              background: "#FDECEA",
              border: "1px solid #F5C6CB",
              borderRadius: 8,
              padding: "9px 12px",
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!validEmail || loading}
          style={{
            width: "100%",
            padding: "13px",
            fontFamily: F,
            fontSize: 15,
            fontWeight: 700,
            background: validEmail && !loading ? C.light : C.panelEdge,
            color: validEmail && !loading ? C.stageDeep : C.textFaint,
            border: "none",
            borderRadius: 12,
            cursor: validEmail && !loading ? "pointer" : "not-allowed",
            letterSpacing: 0.5,
            marginBottom: 12,
          }}
        >
          {loading ? "Submitting…" : "Submit my votes →"}
        </button>

        <button
          onClick={onBack}
          style={{
            fontFamily: F,
            fontSize: 12,
            color: C.textFaint,
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          ← Change my picks
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Done screen — votes submitted
// ═════════════════════════════════════════════════════════════════════
function DoneScreen({
  message,
  game,
}: {
  message: string;
  game: GameInfo;
}) {
  return (
    <div
      style={{
        minHeight: 400,
        background: C.stage,
        borderRadius: 18,
        padding: "2rem 1.5rem",
        border: `1px solid ${C.panelEdge}`,
        boxShadow: `0 0 0 1px ${C.light}22, 0 20px 50px #7a5a3a44`,
        textAlign: "center",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        @keyframes celebrate-pop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes balloon-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}`}</style>

      <div
        style={{
          fontSize: 44,
          marginBottom: 10,
          display: "flex",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {["🎈", "🎊", "🎈"].map((b, i) => (
          <span
            key={i}
            style={{
              animation: `balloon-float ${1.8 + i * 0.3}s ease-in-out ${i * 0.2}s infinite`,
              display: "inline-block",
            }}
          >
            {b}
          </span>
        ))}
      </div>

      <div style={{ animation: "celebrate-pop 0.5s ease-out forwards" }}>
        <h2
          style={{
            fontFamily: F,
            fontSize: 28,
            fontWeight: 900,
            color: C.text,
            margin: "0 0 10px",
          }}
        >
          You&apos;re in!
        </h2>
        <p
          style={{
            fontFamily: F,
            fontSize: 15,
            color: C.textDim,
            lineHeight: 1.6,
            maxWidth: 360,
            margin: "0 auto 24px",
          }}
        >
          {message}
        </p>
      </div>

      <a
        href="/play"
        style={{
          display: "inline-block",
          fontFamily: F,
          fontSize: 15,
          fontWeight: 700,
          color: C.stageDeep,
          background: C.light,
          padding: "13px 32px",
          borderRadius: 12,
          textDecoration: "none",
          letterSpacing: 0.5,
          boxShadow: `0 8px 24px ${C.light}55`,
        }}
      >
        Browse more games →
      </a>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Already submitted screen
// ═════════════════════════════════════════════════════════════════════
function AlreadySubmitted({
  game,
  round,
}: {
  game: GameInfo;
  round: RoundInfo;
}) {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "3rem auto",
        textAlign: "center",
        fontFamily: F,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: C.text,
          margin: "0 0 10px",
        }}
      >
        Already voted!
      </h2>
      <p
        style={{
          fontSize: 14,
          color: C.textDim,
          lineHeight: 1.6,
          maxWidth: 340,
          margin: "0 auto 20px",
        }}
      >
        You&apos;ve already submitted your votes for Round {round.roundNumber} of{" "}
        <strong>{game.topic}</strong>. Check back when the reveal is ready!
      </p>
      <a
        href="/play"
        style={{
          display: "inline-block",
          fontSize: 14,
          fontWeight: 600,
          color: C.light,
          textDecoration: "none",
        }}
      >
        ← Browse more games
      </a>
    </div>
  );
}
