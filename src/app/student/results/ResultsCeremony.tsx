// ─────────────────────────────────────────────────────────────────────────
// src/app/student/results/ResultsCeremony.tsx
//
// Session 63 — U9: Awards ceremony with dramatic sequential reveal.
//
// Flow per round:
//   1. Round announcement + countdown 3-2-1 (combined splash)
//   2. For each place (bronze → silver → gold), skip any missing:
//      a. Brief medal splash (large emoji, ~1.2s)
//      b. Winner card with photo + comments (replaces previous entirely)
//         Bronze: ~8s, Silver: ~11s, Gold: ~7s — longer for higher ranks
//         so viewers can read the comments.
//   3. After gold: confetti burst, then ALL winners shown together
//      in a vertical stack with full comments + "Next round →"
//
// After all rounds: finale celebration + "Back to dashboard →"
//
// Missing placements are silently skipped (no "not enough votes" text).
// Confetti escalates: small burst for bronze, bigger for silver, biggest
// for gold. Finale gets the full shower.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

// ── Types ───────────────────────────────────────────────────────────────
type TopEntry = {
  entryId: string;
  rank: number;
  voteCount: number;
  photoUrl: string | null;
  description: string | null;
  comments: string[];
};

type Round = {
  roundNumber: number;
  totalVoters: number;
  noWinners: boolean;
  topEntries: TopEntry[];
};

type Props = {
  rounds: Round[];
  className: string;
};

// ── Palette ─────────────────────────────────────────────────────────────
const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  gold: "#D4A843",
  goldBg: "#FFF8E7",
  silver: "#8C8C8C",
  silverBg: "#F4F4F2",
  bronze: "#B87333",
  bronzeBg: "#FDF3E8",
  countdown: "#E85D3A",
};
const F = "'Outfit',sans-serif";

const MEDAL = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = [
  { border: "#D4A843", bg: "#FFF8E7", accent: "#D4A843", glow: "rgba(212,168,67,0.35)" },
  { border: "#8C8C8C", bg: "#F4F4F2", accent: "#8C8C8C", glow: "rgba(140,140,140,0.2)" },
  { border: "#B87333", bg: "#FDF3E8", accent: "#B87333", glow: "rgba(184,115,51,0.25)" },
];
const RANK_LABEL = ["1st Place", "2nd Place", "3rd Place"];
const CONFETTI_COLORS = ["#D4A843", "#D98A2B", "#E2554A", "#B87333", "#6E9F5B", "#5B8AC9", "#C06090", "#E8C547"];

// ── Timing constants (easy to tweak) ────────────────────────────────────
const COUNTDOWN_STEP_MS   = 800;
const MEDAL_SPLASH_MS     = 1200;
// Card display time per rank — longer for higher placements so
// viewers have time to read more comments.
//   Bronze (3rd): 8.4s   Silver (2nd): 11.2s   Gold (1st): 7s
const CARD_MS_BY_RANK: Record<number, number> = { 3: 8400, 2: 11200, 1: 7000 };

// ── Confetti ────────────────────────────────────────────────────────────
function Confetti({ count = 50, active }: { count?: number; active: boolean }) {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 3 + Math.random() * 3;
        const size = 5 + Math.random() * 7;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const shape = i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0";
        return (
          <div
            key={i}
            style={{
              position: "fixed", top: -20, left: `${left}%`,
              width: size, height: size * (0.6 + Math.random() * 0.8),
              background: color, borderRadius: shape,
              animation: `confetti-fall ${duration}s ease-in ${delay}s forwards,
                          confetti-sway ${1.5 + Math.random()}s ease-in-out ${delay}s ${Math.ceil(duration / 1.5)}`,
              pointerEvents: "none" as const, zIndex: 100,
            }}
          />
        );
      })}
    </>
  );
}

// ── Winner card (single) ────────────────────────────────────────────────
function WinnerCard({ entry, size = "full" }: { entry: TopEntry; size?: "full" | "podium" }) {
  const isGold = entry.rank === 1;
  const colors = MEDAL_COLORS[(entry.rank - 1)] || MEDAL_COLORS[2];
  const isPodium = size === "podium";
  const photoSize = isGold ? 180 : 150;

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: isGold ? 20 : 16,
      padding: isGold ? 18 : 14,
      boxShadow: isGold
        ? `0 8px 32px ${colors.glow}, 0 0 0 1px ${colors.border}22`
        : `0 2px 12px ${colors.glow}`,
      position: "relative" as const,
      overflow: "hidden",
      animation: "fade-in-scale 0.5s ease forwards",
    }}>
      {isGold && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.3) 50%, transparent 60%)",
          animation: "shine-sweep 3s ease-in-out 0.8s infinite",
          pointerEvents: "none" as const,
        }} />
      )}

      {/* Medal + rank header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: isGold ? 34 : 26, lineHeight: 1,
          filter: isGold ? "drop-shadow(0 3px 10px rgba(212,168,67,0.5))" : "none",
          animation: isGold ? "trophy-bounce 2s ease-in-out infinite" : "none",
        }}>
          {MEDAL[entry.rank - 1] || ""}
        </span>
        <div>
          <div style={{
            fontSize: isGold ? 18 : 15, fontWeight: 800,
            color: colors.accent, letterSpacing: 0.5,
          }}>
            {RANK_LABEL[entry.rank - 1] || `${entry.rank}th Place`}
          </div>
          <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}>
            {entry.voteCount} favorite {entry.voteCount === 1 ? "vote" : "votes"}
          </div>
        </div>
      </div>

      {/* Body: photo+desc LEFT — comments RIGHT */}
      <div style={{
        display: "flex", gap: 16, alignItems: "flex-start",
        flexWrap: "wrap" as const,
      }}>
        {/* LEFT: photo + description */}
        <div style={{ flexShrink: 0 }}>
          {entry.photoUrl ? (
            <img src={entry.photoUrl} alt="" style={{
              width: photoSize, height: photoSize, objectFit: "cover",
              borderRadius: isGold ? 14 : 10,
              border: `2px solid ${colors.border}`,
              boxShadow: isGold ? `0 6px 24px ${colors.glow}` : `0 2px 8px ${colors.glow}`,
              display: "block",
            }} />
          ) : (
            <div style={{
              width: photoSize, height: photoSize,
              borderRadius: isGold ? 14 : 10,
              border: `2px dashed ${C.panelEdge}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: C.textFaint,
            }}>
              photo unavailable
            </div>
          )}
          {entry.description && (
            <p style={{
              fontSize: 13, color: C.text, fontStyle: "italic",
              lineHeight: 1.5, margin: "8px 0 0",
              maxWidth: photoSize,
              borderLeft: `2px solid ${colors.accent}`, paddingLeft: 10,
              wordBreak: "break-word" as const, textAlign: "left" as const,
            }}>
              &quot;{entry.description}&quot;
            </p>
          )}
        </div>

        {/* RIGHT: comments stacked */}
        {entry.comments.length > 0 && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{
              fontSize: 10, letterSpacing: 1.5, fontWeight: 600,
              color: C.textDim, textTransform: "uppercase" as const, marginBottom: 6,
            }}>
              Why classmates picked this one
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
              {entry.comments.map((text, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.6)",
                  borderRadius: 8, padding: "7px 10px", textAlign: "left" as const,
                }}>
                  <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5, wordBreak: "break-word" as const }}>
                    &quot;{text}&quot;
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Podium layout (all winners together) ────────────────────────────────
function Podium({ entries }: { entries: TopEntry[] }) {
  // Show winners in rank order: gold first, then silver, then bronze.
  // Each gets a full-width card with photo + description + comments.
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);

  const pedestalColors: Record<number, { bg: string; height: number }> = {
    1: { bg: C.gold, height: 10 },
    2: { bg: "#B8B8B8", height: 8 },
    3: { bg: C.bronze, height: 6 },
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column" as const, gap: 16,
      animation: "fade-in 0.6s ease forwards",
    }}>
      {sorted.map((entry) => {
        const pedestal = pedestalColors[entry.rank] || pedestalColors[3];
        return (
          <div key={entry.entryId}>
            <WinnerCard entry={entry} size="full" />
            <div style={{
              background: pedestal.bg,
              height: pedestal.height,
              borderRadius: "0 0 10px 10px",
              marginTop: -2,
            }} />
          </div>
        );
      })}
    </div>
  );
}

// ── State machine ───────────────────────────────────────────────────────
type Phase =
  | "intro"
  | "countdown"
  | "medal-splash"
  | "card-reveal"
  | "podium"
  | "finale";

export default function ResultsCeremony({ rounds, className }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [roundIndex, setRoundIndex] = useState(0);
  const [countdownValue, setCountdownValue] = useState(3);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [confettiCount, setConfettiCount] = useState(0);
  const [finaleConfetti, setFinaleConfetti] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentRound = rounds[roundIndex] ?? null;
  const isLastRound = roundIndex === rounds.length - 1;

  // Winners sorted bronze-first (rank 3 → 2 → 1) for reveal order.
  const sortedWinners = currentRound
    ? [...currentRound.topEntries].sort((a, b) => b.rank - a.rank)
    : [];
  const currentWinner = revealIndex >= 0 && revealIndex < sortedWinners.length
    ? sortedWinners[revealIndex]
    : null;

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ── Countdown tick ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownValue > 0) {
      timerRef.current = setTimeout(() => setCountdownValue((v) => v - 1), COUNTDOWN_STEP_MS);
    } else {
      timerRef.current = setTimeout(() => {
        if (sortedWinners.length === 0) {
          setPhase("podium");
        } else {
          setRevealIndex(0);
          setPhase("medal-splash");
        }
      }, 500);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, countdownValue, sortedWinners.length]);

  // ── Medal splash → card reveal ────────────────────────────────────
  useEffect(() => {
    if (phase !== "medal-splash") return;
    timerRef.current = setTimeout(() => {
      if (currentWinner) {
        if (currentWinner.rank === 1) setConfettiCount(70);
        else if (currentWinner.rank === 2) setConfettiCount(35);
        else setConfettiCount(18);
      }
      setPhase("card-reveal");
    }, MEDAL_SPLASH_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, currentWinner]);

  // ── Card reveal → next medal or podium ────────────────────────────
  useEffect(() => {
    if (phase !== "card-reveal") return;
    const isLast = revealIndex >= sortedWinners.length - 1;
    const delay = CARD_MS_BY_RANK[currentWinner?.rank ?? 3] ?? 8400;

    timerRef.current = setTimeout(() => {
      setConfettiCount(0);
      if (isLast) {
        setPhase("podium");
      } else {
        setRevealIndex((i) => i + 1);
        setPhase("medal-splash");
      }
    }, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, revealIndex, sortedWinners.length, currentWinner]);

  const beginCeremony = useCallback(() => {
    if (rounds.length === 0) { setPhase("finale"); return; }
    setRoundIndex(0);
    setRevealIndex(-1);
    setCountdownValue(3);
    setPhase("countdown");
  }, [rounds.length]);

  const nextRound = useCallback(() => {
    if (isLastRound) {
      setFinaleConfetti(true);
      setPhase("finale");
      return;
    }
    setRoundIndex((i) => i + 1);
    setRevealIndex(-1);
    setCountdownValue(3);
    setConfettiCount(0);
    setPhase("countdown");
  }, [isLastRound]);

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", fontFamily: F, color: C.text,
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
        @keyframes confetti-sway {
          0%, 100% { margin-left: 0; }
          25% { margin-left: 18px; }
          75% { margin-left: -18px; }
        }
        @keyframes trophy-bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
        @keyframes shine-sweep {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(200%); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in-scale {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(212,168,67,0.2); }
          50% { box-shadow: 0 0 40px rgba(212,168,67,0.5); }
        }
        @keyframes countdown-pop {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes medal-entrance {
          0% { transform: scale(0.2) rotate(-20deg); opacity: 0; }
          60% { transform: scale(1.3) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>

      <Confetti active={confettiCount > 0} count={confettiCount} />
      <Confetti active={finaleConfetti} count={100} />

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "2rem 1rem 4rem", position: "relative", zIndex: 1 }}>

        {/* ═══ INTRO ═══ */}
        {phase === "intro" && (
          <div style={{ textAlign: "center", paddingTop: "15vh", animation: "fade-in 0.8s ease forwards" }}>
            <div style={{
              width: 120, height: 120, margin: "0 auto 24px", borderRadius: "50%",
              background: `radial-gradient(circle, ${C.goldBg} 0%, transparent 70%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "pulse-glow 3s ease-in-out infinite",
            }}>
              <span style={{
                fontSize: 64, filter: "drop-shadow(0 4px 16px rgba(212,168,67,0.4))",
                animation: "trophy-bounce 2.5s ease-in-out infinite",
              }}>🏆</span>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px", color: C.text, letterSpacing: -0.5 }}>
              The Spotlight Awards
            </h1>
            <p style={{ fontSize: 16, color: C.textDim, lineHeight: 1.6, margin: "0 0 8px" }}>
              The photos your class loved most
            </p>
            <p style={{ fontSize: 14, color: C.textFaint, margin: "0 0 40px" }}>
              {className} &middot; {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
            </p>
            <button
              onClick={beginCeremony}
              style={{
                background: C.gold, color: "#fff", border: "none", borderRadius: 14,
                padding: "16px 40px", fontSize: 17, fontWeight: 700, fontFamily: F,
                cursor: "pointer", letterSpacing: 0.5,
                boxShadow: "0 4px 20px rgba(212,168,67,0.4)",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
              onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.04)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(212,168,67,0.5)"; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(212,168,67,0.4)"; }}
            >
              Begin the ceremony →
            </button>
          </div>
        )}

        {/* ═══ COUNTDOWN ═══ */}
        {phase === "countdown" && currentRound && (
          <div style={{ textAlign: "center", paddingTop: "18vh" }}>
            <h2 style={{
              fontSize: 36, fontWeight: 800, margin: "0 0 6px", color: C.text,
              animation: "fade-in 0.4s ease forwards",
            }}>
              Round {currentRound.roundNumber}
            </h2>
            {isLastRound && (
              <div style={{
                fontSize: 13, color: C.gold, fontWeight: 700, letterSpacing: 1,
                textTransform: "uppercase" as const, marginBottom: 24,
                animation: "fade-in 0.4s ease 0.1s both",
              }}>
                🔔 Final Round 🔔
              </div>
            )}
            {!isLastRound && <div style={{ height: 24 }} />}
            {countdownValue > 0 ? (
              <div key={countdownValue} style={{
                fontSize: 120, fontWeight: 800, lineHeight: 1,
                color: countdownValue <= 1 ? C.countdown : C.gold,
                animation: "countdown-pop 0.7s ease forwards",
                textShadow: `0 4px 20px ${countdownValue <= 1 ? "rgba(232,93,58,0.3)" : "rgba(212,168,67,0.3)"}`,
              }}>
                {countdownValue}
              </div>
            ) : (
              <div style={{
                fontSize: 56, fontWeight: 800, color: "#5B9A4B",
                animation: "countdown-pop 0.5s ease forwards",
                textShadow: "0 4px 20px rgba(91,154,75,0.3)",
              }}>✨</div>
            )}
            <div style={{
              fontSize: 13, color: C.textFaint, marginTop: 16,
              animation: "fade-in 0.4s ease 0.2s both",
            }}>
              {currentRound.totalVoters} {currentRound.totalVoters === 1 ? "voter" : "voters"} this round
            </div>
          </div>
        )}

        {/* ═══ MEDAL SPLASH ═══ */}
        {phase === "medal-splash" && currentWinner && (
          <div key={`splash-${currentWinner.rank}`} style={{ textAlign: "center", paddingTop: "20vh" }}>
            <div style={{
              fontSize: 12, letterSpacing: 2.5, textTransform: "uppercase" as const,
              color: C.textFaint, fontWeight: 600, marginBottom: 20,
            }}>
              Round {currentRound?.roundNumber}
            </div>
            <div style={{
              fontSize: 100, lineHeight: 1,
              animation: "medal-entrance 0.6s ease forwards",
              filter: `drop-shadow(0 6px 20px ${MEDAL_COLORS[(currentWinner.rank - 1)]?.glow || "rgba(0,0,0,0.1)"})`,
            }}>
              {MEDAL[currentWinner.rank - 1]}
            </div>
            <div style={{
              fontSize: 24, fontWeight: 800, marginTop: 16,
              color: MEDAL_COLORS[(currentWinner.rank - 1)]?.accent || C.text,
              animation: "fade-in 0.4s ease 0.3s both",
            }}>
              {RANK_LABEL[currentWinner.rank - 1]}
            </div>
          </div>
        )}

        {/* ═══ CARD REVEAL ═══ */}
        {phase === "card-reveal" && currentWinner && (
          <div key={`card-${currentWinner.entryId}`} style={{ paddingTop: 20 }}>
            <div style={{
              textAlign: "center", marginBottom: 16,
              fontSize: 12, letterSpacing: 2.5, textTransform: "uppercase" as const,
              color: C.light, fontWeight: 700,
            }}>
              Round {currentRound?.roundNumber} — {RANK_LABEL[currentWinner.rank - 1]}
            </div>
            <WinnerCard entry={currentWinner} size="full" />
          </div>
        )}

        {/* ═══ PODIUM ═══ */}
        {phase === "podium" && currentRound && (
          <div style={{ paddingTop: 16, animation: "fade-in 0.5s ease forwards" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                fontSize: 12, letterSpacing: 2.5, textTransform: "uppercase" as const,
                color: C.light, fontWeight: 700,
              }}>
                Round {currentRound.roundNumber}{isLastRound ? " — Final" : ""}
              </div>
            </div>
            {sortedWinners.length > 0 ? (
              <Podium entries={sortedWinners} />
            ) : (
              <div style={{
                background: C.panelSoft, border: `1px dashed ${C.panelEdge}`,
                borderRadius: 14, padding: "24px 20px", textAlign: "center",
              }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🤷</div>
                <p style={{ fontSize: 15, color: C.textDim, lineHeight: 1.6, margin: 0 }}>
                  No clear favorite this round.
                </p>
              </div>
            )}
            <div style={{ textAlign: "center", marginTop: 28 }}>
              <button
                onClick={nextRound}
                style={{
                  background: isLastRound ? C.gold : C.light, color: "#fff", border: "none",
                  borderRadius: 12, padding: "14px 36px", fontSize: 16, fontWeight: 700,
                  fontFamily: F, cursor: "pointer", letterSpacing: 0.5,
                  boxShadow: isLastRound ? "0 4px 20px rgba(212,168,67,0.4)" : "0 4px 16px rgba(217,138,43,0.3)",
                  transition: "transform 0.15s ease",
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.04)"; }}
                onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {isLastRound ? "See the final celebration →" : "Next round →"}
              </button>
            </div>
          </div>
        )}

        {/* ═══ FINALE ═══ */}
        {phase === "finale" && (
          <div style={{ textAlign: "center", paddingTop: "8vh", animation: "fade-in 0.8s ease forwards" }}>
            <div style={{
              fontSize: 64, marginBottom: 16,
              animation: "trophy-bounce 2s ease-in-out infinite",
              filter: "drop-shadow(0 4px 16px rgba(212,168,67,0.4))",
            }}>🎉</div>
            <h2 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 8px", color: C.text }}>
              That&apos;s a wrap!
            </h2>
            <p style={{ fontSize: 15, color: C.textDim, lineHeight: 1.6, margin: "0 0 32px" }}>
              Congratulations to all the winners in <strong>{className}</strong>.
              <br />Every photo told a story — and your class picked their favorites.
            </p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 20, marginBottom: 32 }}>
              {rounds.map((round) => {
                const gold = round.topEntries.find((e) => e.rank === 1);
                const colors = MEDAL_COLORS[0];
                return (
                  <div key={round.roundNumber} style={{
                    background: colors.bg,
                    border: `2px solid ${colors.border}`,
                    borderRadius: 18, padding: "18px 20px",
                    boxShadow: `0 4px 16px ${colors.glow}`,
                    overflow: "hidden", position: "relative" as const,
                  }}>
                    {/* Shine */}
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                      background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.2) 50%, transparent 60%)",
                      animation: "shine-sweep 4s ease-in-out 1s infinite",
                      pointerEvents: "none" as const,
                    }} />

                    {/* Header */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
                    }}>
                      <span style={{ fontSize: 32, lineHeight: 1 }}>🥇</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: colors.accent }}>
                          Round {round.roundNumber}
                        </div>
                        <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}>
                          {round.noWinners
                            ? "No clear favorite"
                            : gold
                              ? `${gold.voteCount} favorite votes`
                              : "Complete"}
                        </div>
                      </div>
                    </div>

                    {/* Big photo */}
                    {gold?.photoUrl ? (
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <img src={gold.photoUrl} alt="" style={{
                          width: "100%", maxWidth: 280, aspectRatio: "1/1",
                          objectFit: "cover", borderRadius: 14,
                          border: `2px solid ${colors.border}`,
                          boxShadow: `0 4px 16px ${colors.glow}`,
                        }} />
                      </div>
                    ) : round.noWinners ? (
                      <div style={{
                        textAlign: "center", padding: "20px 0",
                        fontSize: 36,
                      }}>🤷</div>
                    ) : null}

                    {/* Description if present */}
                    {gold?.description && (
                      <p style={{
                        fontSize: 14, color: C.text, fontStyle: "italic",
                        lineHeight: 1.6, margin: "14px 0 0",
                        borderLeft: `2px solid ${colors.accent}`, paddingLeft: 12,
                        textAlign: "left" as const, wordBreak: "break-word" as const,
                      }}>
                        &quot;{gold.description}&quot;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <Link href="/student/dashboard" style={{
              display: "block", width: "100%", boxSizing: "border-box" as const,
              textAlign: "center", textDecoration: "none", padding: "14px",
              fontFamily: F, fontSize: 15, fontWeight: 700,
              background: C.light, color: "#fff", border: "none", borderRadius: 12, letterSpacing: 0.5,
            }}>
              Back to your dashboard →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
