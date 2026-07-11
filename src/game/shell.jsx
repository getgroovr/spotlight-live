"use client";

import { useEffect, useState } from "react";
import App from "./spotlight.jsx";

// Centers the self-contained Spotlight card on the warm tan page background.
//
// B30 (#48): currentRound / totalRounds — when mode="student" and
// currentRound >= 1, the shell shows a boxing-match-style round
// announcement splash before mounting the engine.
//
// B47 (session 59): splash redesigned with animated 5→1 countdown and
// a cute monster character holding the round placard. Auto-advances
// after the countdown finishes (~6.5s total). Tap to skip.
//
// B20 fix (session 55): the splash only shows ONCE per round. On resume
// (page reload, tab switch) it skips straight to the game. Tracked via
// sessionStorage so a fresh browser session always sees the splash once.
//
// B57 fix (session 60): splash state uses tri-state (null / true / false)
// so the App never renders before the sessionStorage check completes.
// null = still checking → show tan background only (matches SSR).
// true = show splash. false = skip to game.
//
// Session 79 (Chunk 2 — topics):
//   currentTopic / nextRoundTopic threaded from page → shell → App.
//   RoundSplash shows "Round N — Topic" when currentTopic is set.
/**
 * @param {{ initialStudents?: unknown[], mode?: "visitor" | "student", warmupComplete?: boolean, currentRound?: number, totalRounds?: number | null, currentTopic?: string | null, nextRoundTopic?: string | null }} props
 */

function hasSeenRoundSplash(round) {
  try {
    return sessionStorage.getItem(`spotlight:splash-seen:r${round}`) === "1";
  } catch { return false; }
}
function markRoundSplashSeen(round) {
  try {
    sessionStorage.setItem(`spotlight:splash-seen:r${round}`, "1");
  } catch {}
}

export default function GameShell({ initialStudents, mode, warmupComplete, currentRound, totalRounds, currentTopic, nextRoundTopic } = {}) {
  // B57 FIX: tri-state — null means "still checking sessionStorage."
  // Server renders null → tan background div. Client hydrates to same.
  // useEffect then resolves to true (show splash) or false (skip).
  const [showSplash, setShowSplash] = useState(null);

  // Check sessionStorage AFTER hydration to avoid server/client mismatch.
  useEffect(() => {
    if (
      mode === "student" &&
      currentRound != null &&
      Number(currentRound) >= 1 &&
      !hasSeenRoundSplash(Number(currentRound))
    ) {
      setShowSplash(true);
    } else {
      setShowSplash(false);
    }
  }, [mode, currentRound]);

  useEffect(() => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prev = {
      htmlBg: htmlEl.style.background,
      htmlScheme: htmlEl.style.colorScheme,
      bodyBg: bodyEl.style.background,
      bodyMargin: bodyEl.style.margin,
    };
    htmlEl.style.background = "#D9BE8E";
    htmlEl.style.colorScheme = "light";
    bodyEl.style.background = "#D9BE8E";
    bodyEl.style.margin = "0";
    return () => {
      htmlEl.style.background = prev.htmlBg;
      htmlEl.style.colorScheme = prev.htmlScheme;
      bodyEl.style.background = prev.bodyBg;
      bodyEl.style.margin = prev.bodyMargin;
    };
  }, []);

  // B30: auto-dismiss after 6.5 seconds. B20: mark as seen so it won't replay.
  // B61 FIX: markRoundSplashSeen is deferred to the DISMISS callback, not
  // called when the splash first appears. In React StrictMode, effects run
  // twice — calling markSeen immediately caused the second pass to find it
  // already seen and skip the splash entirely (appeared for one frame then
  // vanished). By marking seen only on dismiss (timer or tap), the double-
  // fire is harmless: both passes start the timer, cleanup kills the first,
  // second one runs to completion.
  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      markRoundSplashSeen(Number(currentRound));
      setShowSplash(false);
    }, 6500);
    return () => clearTimeout(timer);
  }, [showSplash, currentRound]);

  // B57: while still checking sessionStorage, show only the background.
  // This prevents the App from flashing before the splash appears.
  if (showSplash === null) {
    return (
      <div style={{ minHeight: "100vh", background: "#D9BE8E" }} />
    );
  }

  if (showSplash) {
    return (
      <RoundSplash
        round={Number(currentRound)}
        totalRounds={totalRounds != null ? Number(totalRounds) : null}
        currentTopic={currentTopic || null}
        onDismiss={() => {
          markRoundSplashSeen(Number(currentRound));
          setShowSplash(false);
        }}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
        background: "#D9BE8E",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        <App
          initialStudents={initialStudents}
          mode={mode}
          warmupComplete={warmupComplete}
          currentRound={currentRound}
          totalRounds={totalRounds}
          currentTopic={currentTopic || null}
          nextRoundTopic={nextRoundTopic || null}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// B47 (session 59): Boxing-ring round announcement with animated countdown.
//
// A cute monster holds up a placard with the round number. The countdown
// ticks 5-4-3-2-1, each number scaling in with a punch. When it hits zero
// the splash auto-advances (via the useEffect timer in GameShell). Tap
// anywhere to skip. The final round gets extra "🔔 Last round!" fanfare.
//
// B20: splash only shows once per round (tracked in sessionStorage by
// GameShell above).
//
// Session 79 (Chunk 2): When currentTopic is set, the placard shows
// "Round N — Topic" instead of just "Round N". Topic text appears on
// its own line below the round number, smaller and in the warm gold.
// ─────────────────────────────────────────────────────────────────────────
function RoundSplash({ round, totalRounds, currentTopic, onDismiss }) {
  const isFinal = totalRounds != null && round === totalRounds;
  const [count, setCount] = useState(5);

  // Tick the countdown every second after a short entrance delay
  useEffect(() => {
    const delay = setTimeout(() => {
      const iv = setInterval(() => {
        setCount((c) => {
          if (c <= 1) { clearInterval(iv); return 0; }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(iv);
    }, 800); // wait for card entrance animation
    return () => clearTimeout(delay);
  }, []);

  return (
    <div
      onClick={onDismiss}
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #1a1208 0%, #3A2A18 40%, #5C3D1A 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        cursor: "pointer",
        fontFamily: "'Outfit', ui-sans-serif, system-ui, sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&display=swap');
        @keyframes splash-glow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes splash-card-enter {
          0% { opacity: 0; transform: translateY(60px) scale(0.8) rotate(-3deg); }
          60% { opacity: 1; transform: translateY(-8px) scale(1.02) rotate(1deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
        }
        @keyframes splash-stars {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes splash-shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes countdown-pop {
          0% { transform: scale(2.5); opacity: 0; }
          40% { transform: scale(0.9); opacity: 1; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes monster-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes monster-blink {
          0%, 42%, 46%, 100% { clip-path: none; }
          44% { clip-path: inset(0 0 50% 0); }
        }
      `}</style>

      {/* Spotlight beam */}
      <div style={{
        position: "absolute",
        top: "-20%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "300px",
        height: "120%",
        background: "radial-gradient(ellipse at top, rgba(217,138,43,0.3) 0%, transparent 70%)",
        animation: "splash-glow 2s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      {/* Boxing ring ropes */}
      {[22, 78].map((top) => (
        <div key={top} style={{
          position: "absolute",
          top: `${top}%`,
          left: 0,
          right: 0,
          height: 3,
          background: "linear-gradient(90deg, transparent 5%, #C9A877 20%, #D98A2B 50%, #C9A877 80%, transparent 95%)",
          opacity: 0.4,
          pointerEvents: "none",
        }} />
      ))}

      {/* Sparkle stars */}
      {[
        { top: "15%", left: "15%", delay: "0s", size: 18 },
        { top: "20%", left: "78%", delay: "0.3s", size: 14 },
        { top: "70%", left: "12%", delay: "0.6s", size: 16 },
        { top: "75%", left: "85%", delay: "0.9s", size: 12 },
        { top: "30%", left: "90%", delay: "0.4s", size: 10 },
        { top: "65%", left: "20%", delay: "0.7s", size: 11 },
      ].map((s, i) => (
        <div key={i} style={{
          position: "absolute",
          top: s.top,
          left: s.left,
          fontSize: s.size,
          animation: `splash-stars 1.5s ease-in-out ${s.delay} infinite`,
          pointerEvents: "none",
          color: "#D98A2B",
        }}>
          ✦
        </div>
      ))}

      {/* The placard + monster assembly */}
      <div style={{
        animation: "splash-card-enter 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Card */}
        <div style={{
          background: "linear-gradient(145deg, #FBF6EC 0%, #F3E4C4 100%)",
          border: "4px solid #D98A2B",
          borderRadius: 20,
          padding: "36px 52px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.4), 0 0 80px rgba(217,138,43,0.3), inset 0 1px 0 rgba(255,255,255,0.6)",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          minWidth: 240,
        }}>
          {/* Shine sweep */}
          <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)",
            animation: "splash-shine 3s ease-in-out 0.8s infinite",
            pointerEvents: "none",
          }} />

          <div style={{
            fontSize: 14, fontWeight: 700, letterSpacing: 6,
            textTransform: "uppercase", color: "#9A815E", marginBottom: 8,
          }}>
            {isFinal ? "Final" : "Student"}
          </div>

          <div style={{
            fontSize: 52, fontWeight: 900, color: "#3A2A18",
            lineHeight: 1, marginBottom: 4,
            textShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}>
            Round {round}
          </div>

          {/* ── Session 79: Topic line below the round number ── */}
          {currentTopic && (
            <div style={{
              fontSize: 18, fontWeight: 700, color: "#D98A2B",
              marginTop: 8, lineHeight: 1.2,
              letterSpacing: 0.5,
            }}>
              {currentTopic}
            </div>
          )}

          {isFinal ? (
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: 4,
              textTransform: "uppercase", color: "#C04030", marginTop: 8,
            }}>
              🔔 Last round! 🔔
            </div>
          ) : (
            <div style={{
              fontSize: 12, color: "#9A815E", marginTop: 6, fontWeight: 600,
            }}>
              {totalRounds != null ? `${round} of ${totalRounds}` : ""}
            </div>
          )}
        </div>

        {/* Stick */}
        <div style={{
          width: 6, height: 40,
          background: "linear-gradient(180deg, #C9A877 0%, #8B6E47 100%)",
          borderRadius: 3, marginTop: -2,
          boxShadow: "2px 0 4px rgba(0,0,0,0.2)",
        }} />

        {/* ── Cute monster holding the placard ── */}
        <div style={{
          animation: "monster-bounce 1.6s ease-in-out infinite",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: -4,
        }}>
          {/* Monster body */}
          <svg width="80" height="72" viewBox="0 0 80 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Body — rounded blob */}
            <ellipse cx="40" cy="42" rx="32" ry="28" fill="#6BBF59" />
            <ellipse cx="40" cy="42" rx="32" ry="28" fill="url(#monsterShade)" />

            {/* Belly highlight */}
            <ellipse cx="40" cy="48" rx="20" ry="16" fill="#8DD67A" opacity="0.6" />

            {/* Arms reaching up to hold the stick */}
            <path d="M18 30 Q12 22 16 16 Q18 14 20 16 L24 28" fill="#6BBF59" stroke="#4A9A3A" strokeWidth="1.5" />
            <path d="M62 30 Q68 22 64 16 Q62 14 60 16 L56 28" fill="#6BBF59" stroke="#4A9A3A" strokeWidth="1.5" />

            {/* Hands gripping */}
            <circle cx="16" cy="15" r="5" fill="#6BBF59" stroke="#4A9A3A" strokeWidth="1" />
            <circle cx="64" cy="15" r="5" fill="#6BBF59" stroke="#4A9A3A" strokeWidth="1" />

            {/* Eyes */}
            <ellipse cx="30" cy="36" rx="7" ry="8" fill="white" />
            <ellipse cx="50" cy="36" rx="7" ry="8" fill="white" />
            <circle cx="32" cy="37" r="4" fill="#2A1A08" />
            <circle cx="52" cy="37" r="4" fill="#2A1A08" />
            {/* Eye shine */}
            <circle cx="33.5" cy="35.5" r="1.5" fill="white" />
            <circle cx="53.5" cy="35.5" r="1.5" fill="white" />

            {/* Big smile */}
            <path d="M28 50 Q40 60 52 50" stroke="#2A1A08" strokeWidth="2.5" strokeLinecap="round" fill="none" />

            {/* Little fangs */}
            <path d="M32 50 L34 54 L36 50" fill="white" />
            <path d="M44 50 L46 54 L48 50" fill="white" />

            {/* Horns */}
            <path d="M20 18 Q16 6 22 4 Q26 3 24 14" fill="#D98A2B" />
            <path d="M60 18 Q64 6 58 4 Q54 3 56 14" fill="#D98A2B" />

            {/* Feet */}
            <ellipse cx="28" cy="68" rx="10" ry="5" fill="#5AAE48" />
            <ellipse cx="52" cy="68" rx="10" ry="5" fill="#5AAE48" />

            <defs>
              <radialGradient id="monsterShade" cx="0.4" cy="0.3">
                <stop offset="0%" stopColor="white" stopOpacity="0.15" />
                <stop offset="100%" stopColor="black" stopOpacity="0.1" />
              </radialGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* ── Animated countdown: 5 → 4 → 3 → 2 → 1 → GO ── */}
      <div style={{
        marginTop: 28,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
      }}>
        <div
          key={count}
          style={{
            fontSize: count === 0 ? 36 : 52,
            fontWeight: 900,
            color: count <= 2 && count > 0 ? "#E2554A" : count === 0 ? "#6BBF59" : "#D98A2B",
            textShadow: count <= 2 && count > 0
              ? "0 0 20px rgba(226,85,74,0.5)"
              : count === 0
                ? "0 0 20px rgba(107,191,89,0.5)"
                : "0 0 20px rgba(217,138,43,0.4)",
            animation: "countdown-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            letterSpacing: count === 0 ? 4 : 0,
          }}
        >
          {count === 0 ? "GO!" : count}
        </div>
      </div>

      {/* Tap hint — subtle, below the countdown */}
      <div style={{
        color: "#C9A877", fontSize: 12, fontWeight: 600,
        marginTop: 20, letterSpacing: 1, opacity: 0.5, zIndex: 1,
      }}>
        Tap to skip
      </div>
    </div>
  );
}
