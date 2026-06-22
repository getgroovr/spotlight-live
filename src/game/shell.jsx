"use client";

import { useEffect, useState } from "react";
import App from "./spotlight.jsx";

// Centers the self-contained Spotlight card on the warm tan page background.
//
// B30 (#48): currentRound / totalRounds — when mode="student" and
// currentRound >= 1, the shell shows a boxing-match-style round
// announcement splash before mounting the engine. Auto-dismisses
// after 3.5s or on tap.
/**
 * @param {{ initialStudents?: unknown[], mode?: "visitor" | "student", warmupComplete?: boolean, currentRound?: number, totalRounds?: number | null }} props
 */
export default function GameShell({ initialStudents, mode, warmupComplete, currentRound, totalRounds } = {}) {
  const [showSplash, setShowSplash] = useState(
    mode === "student" && typeof currentRound === "number" && currentRound >= 1
  );

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

  // B30: auto-dismiss after 3.5 seconds.
  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => setShowSplash(false), 3500);
    return () => clearTimeout(timer);
  }, [showSplash]);

  if (showSplash) {
    return (
      <RoundSplash
        round={currentRound}
        totalRounds={totalRounds}
        onDismiss={() => setShowSplash(false)}
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
        <App initialStudents={initialStudents} mode={mode} warmupComplete={warmupComplete} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// B30 (#48): Boxing-match round announcement splash.
//
// A spotlight-lit placard with the round number, held up like a boxing
// ring round card. Auto-dismisses or tap to skip. The final round gets
// extra fanfare ("Last round!").
// ─────────────────────────────────────────────────────────────────────────
function RoundSplash({ round, totalRounds, onDismiss }) {
  const isFinal = totalRounds != null && round === totalRounds;

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

      {/* The placard — round card held up on a stick */}
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
          width: 6, height: 60,
          background: "linear-gradient(180deg, #C9A877 0%, #8B6E47 100%)",
          borderRadius: 3, marginTop: -2,
          boxShadow: "2px 0 4px rgba(0,0,0,0.2)",
        }} />

        {/* Hand grip */}
        <div style={{
          width: 28, height: 18,
          background: "linear-gradient(180deg, #D4A574 0%, #B8885C 100%)",
          borderRadius: "50%", marginTop: -3,
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
        }} />
      </div>

      {/* Tap hint */}
      <div style={{
        color: "#C9A877", fontSize: 13, fontWeight: 600,
        marginTop: 40, letterSpacing: 1, opacity: 0.7, zIndex: 1,
      }}>
        Tap anywhere to begin
      </div>
    </div>
  );
}
