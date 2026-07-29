// ─────────────────────────────────────────────────────────────────────────
// src/app/play/multi/[gameId]/reveal/reveal-client.tsx
//
// Session 106 — Phase 6: Reveal Ceremony client component.
//
// Animated two-layer reveal: avatar → real teacher.
//
// Flow:
//   1. Intro — "Your results are in…" with monster audience
//   2. 3rd place reveal — avatar flip to real teacher, approved comments
//   3. 2nd place reveal — same, slightly bigger celebration
//   4. 1st place reveal — full fanfare with confetti + balloons
//   5. Honorable mentions — all other teachers shown
//   6. Summary — all teachers with scores, class links, message buttons
//
// Borrows palette and animation patterns from ResultsCeremony.tsx.
// Uses MonsterAvatar from monsters.jsx for the avatar display.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { MonsterAvatar, MONSTERS } from "@/game/monsters.jsx";
import type { RevealTeacher } from "./page";

// ── Palette (warm, matches existing ceremony) ────────────────────────────
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
  accent: "#E85D3A",
};
const F = "'Outfit',sans-serif";

const MEDAL_EMOJI = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = [
  { border: "#D4A843", bg: "#FFF8E7", accent: "#D4A843", glow: "rgba(212,168,67,0.35)" },
  { border: "#8C8C8C", bg: "#F4F4F2", accent: "#8C8C8C", glow: "rgba(140,140,140,0.2)" },
  { border: "#B87333", bg: "#FDF3E8", accent: "#B87333", glow: "rgba(184,115,51,0.25)" },
];
const RANK_LABEL = ["Your #1 Teacher", "Runner-Up", "Third Place"];
const CONFETTI_COLORS = ["#D4A843", "#D98A2B", "#E2554A", "#B87333", "#6E9F5B", "#5B8AC9", "#C06090", "#E8C547"];
const BALLOON_COLORS = ["#E2554A", "#D4A843", "#5B8AC9", "#6E9F5B", "#C06090", "#E8C547", "#D98A2B", "#9B59B6"];

type Phase =
  | "intro"
  | "reveal-3"
  | "flip-3"
  | "reveal-2"
  | "flip-2"
  | "reveal-1"
  | "flip-1"
  | "honorable"
  | "summary";

type Props = {
  gameTitle: string;
  teachers: RevealTeacher[];
};

// ── Confetti ──────────────────────────────────────────────────────────────
function Confetti({ count = 50, active }: { count?: number; active: boolean }) {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 3 + Math.random() * 3;
        const size = 8 + Math.random() * 8;
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

// ── Balloons ──────────────────────────────────────────────────────────────
function Balloons({ count = 12, active }: { count?: number; active: boolean }) {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const left = 5 + Math.random() * 90;
        const delay = Math.random() * 1.8;
        const duration = 4 + Math.random() * 3;
        const size = 28 + Math.random() * 18;
        const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
        const sway = 15 + Math.random() * 25;
        return (
          <div
            key={`balloon-${i}`}
            style={{
              position: "fixed", bottom: -60, left: `${left}%`,
              zIndex: 99, pointerEvents: "none" as const,
              animation: `balloon-rise-reveal ${duration}s ease-out ${delay}s forwards`,
            }}
          >
            <svg width={size} height={size * 1.3} viewBox="0 0 40 52" fill="none">
              <ellipse cx="20" cy="18" rx="16" ry="18" fill={color} opacity="0.85" />
              <ellipse cx="20" cy="18" rx="16" ry="18" fill="url(#bShine)" />
              <polygon points="16,35 20,42 24,35" fill={color} opacity="0.7" />
              <line x1="20" y1="42" x2="20" y2="52" stroke={color} strokeWidth="0.8" opacity="0.5" />
              <defs>
                <radialGradient id="bShine" cx="0.35" cy="0.3" r="0.6">
                  <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
              </defs>
            </svg>
            <style>{`
              @keyframes balloon-rise-reveal {
                0% { transform: translateY(0) translateX(0); opacity: 0.9; }
                25% { transform: translateY(-30vh) translateX(${sway}px); opacity: 0.9; }
                50% { transform: translateY(-60vh) translateX(-${sway * 0.5}px); opacity: 0.85; }
                75% { transform: translateY(-90vh) translateX(${sway * 0.3}px); opacity: 0.6; }
                100% { transform: translateY(-120vh) translateX(-${sway * 0.2}px); opacity: 0; }
              }
            `}</style>
          </div>
        );
      })}
    </>
  );
}

// ── Avatar-to-profile flip card ──────────────────────────────────────────
function FlipCard({
  teacher,
  flipped,
  size = 160,
}: {
  teacher: RevealTeacher;
  flipped: boolean;
  size?: number;
}) {
  const monsterIdx = teacher.monsterIndices[0] ?? 0;
  const m = MONSTERS[monsterIdx] ?? MONSTERS[0];

  return (
    <div style={{
      perspective: 800,
      width: size + 16,
      height: size + 16,
      margin: "0 auto",
    }}>
      <div style={{
        width: "100%",
        height: "100%",
        position: "relative",
        transformStyle: "preserve-3d" as const,
        transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: flipped ? "rotateY(180deg)" : "rotateY(0)",
      }}>
        {/* Front — monster avatar */}
        <div style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          backfaceVisibility: "hidden" as const,
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          background: `${m.belly}40`,
          border: `4px solid ${m.body}`,
          boxShadow: `0 6px 24px ${m.body}30`,
        }}>
          <MonsterAvatar index={monsterIdx} size={size - 32} showName={false} />
        </div>
        {/* Back — real teacher photo */}
        <div style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          backfaceVisibility: "hidden" as const,
          transform: "rotateY(180deg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          overflow: "hidden",
          border: `4px solid ${C.gold}`,
          boxShadow: `0 6px 24px rgba(212,168,67,0.3)`,
          background: C.panelSoft,
        }}>
          {teacher.avatarUrl ? (
            <img
              src={teacher.avatarUrl}
              alt={teacher.displayName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div style={{
              fontSize: size * 0.35,
              fontWeight: 800,
              color: C.textDim,
              fontFamily: F,
            }}>
              {teacher.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Teacher reveal card (shown after flip) ───────────────────────────────
function TeacherRevealCard({
  teacher,
  rankIndex,
  flipped,
}: {
  teacher: RevealTeacher;
  rankIndex: number; // 0=gold, 1=silver, 2=bronze
  flipped: boolean;
}) {
  const colors = MEDAL_COLORS[rankIndex] ?? MEDAL_COLORS[2];
  const isGold = rankIndex === 0;
  const monsterIdx = teacher.monsterIndices[0] ?? 0;
  const monsterName = MONSTERS[monsterIdx]?.name ?? "???";

  return (
    <div style={{
      animation: "fade-in 0.6s ease forwards",
      maxWidth: 420,
      margin: "0 auto",
    }}>
      {/* Medal + rank */}
      <div style={{
        textAlign: "center",
        marginBottom: 16,
        animation: isGold ? "trophy-bounce 2s ease-in-out infinite" : "none",
      }}>
        <span style={{ fontSize: isGold ? 48 : 36, lineHeight: 1 }}>
          {MEDAL_EMOJI[rankIndex] ?? "⭐"}
        </span>
        <h2 style={{
          fontSize: isGold ? 26 : 22,
          fontWeight: 800,
          color: colors.accent,
          margin: "8px 0 4px",
          fontFamily: F,
          letterSpacing: 0.5,
        }}>
          {RANK_LABEL[rankIndex] ?? "Honorable Mention"}
        </h2>
        <p style={{
          fontSize: 14,
          color: C.textDim,
          margin: 0,
          fontFamily: F,
        }}>
          {teacher.totalPoints} {teacher.totalPoints === 1 ? "point" : "points"} across your votes
        </p>
      </div>

      {/* Flip card */}
      <div style={{ marginBottom: 20 }}>
        <FlipCard teacher={teacher} flipped={flipped} size={isGold ? 176 : 148} />
      </div>

      {/* Monster reveal text (before flip) */}
      {!flipped && (
        <div style={{
          textAlign: "center",
          animation: "fade-in 0.5s ease 0.3s both",
        }}>
          <p style={{
            fontSize: 18,
            fontWeight: 700,
            color: C.text,
            margin: "0 0 4px",
            fontFamily: F,
          }}>
            It&apos;s {monsterName}!
          </p>
          <p style={{
            fontSize: 13,
            color: C.textFaint,
            margin: 0,
            fontFamily: F,
          }}>
            But who&apos;s behind the avatar?
          </p>
        </div>
      )}

      {/* Real teacher info (after flip) */}
      {flipped && (
        <div style={{
          textAlign: "center",
          animation: "fade-in-scale 0.5s ease forwards",
        }}>
          <h3 style={{
            fontSize: 22,
            fontWeight: 800,
            color: C.text,
            margin: "0 0 4px",
            fontFamily: F,
          }}>
            {teacher.displayName}
          </h3>
          <p style={{
            fontSize: 13,
            color: C.textFaint,
            margin: "0 0 8px",
            fontFamily: F,
          }}>
            was playing as {monsterName}
          </p>

          {/* Bio */}
          {teacher.bio && (
            <p style={{
              fontSize: 14,
              color: C.textDim,
              lineHeight: 1.6,
              margin: "0 0 8px",
              fontFamily: F,
              fontStyle: "italic",
            }}>
              {teacher.bio}
            </p>
          )}

          {/* Teaching style */}
          {teacher.teachingStyle && (
            <div style={{
              display: "inline-block",
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: colors.accent,
              fontFamily: F,
              marginBottom: 12,
            }}>
              {teacher.teachingStyle}
            </div>
          )}

          {/* Approved comments */}
          {teacher.approvedComments.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.textFaint,
                textTransform: "uppercase" as const,
                letterSpacing: 1,
                margin: "0 0 8px",
                fontFamily: F,
              }}>
                Your comments
              </p>
              {teacher.approvedComments.map((comment, ci) => (
                <div key={ci} style={{
                  background: C.panelSoft,
                  border: `1px solid ${C.panelEdge}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  marginBottom: 8,
                  textAlign: "left" as const,
                }}>
                  <p style={{
                    fontSize: 14,
                    color: C.text,
                    margin: 0,
                    lineHeight: 1.5,
                    fontFamily: F,
                    wordBreak: "break-word" as const,
                  }}>
                    &ldquo;{comment.body}&rdquo;
                  </p>
                  <p style={{
                    fontSize: 11,
                    color: C.textFaint,
                    margin: "4px 0 0",
                    fontFamily: F,
                  }}>
                    Round {comment.roundNumber} &middot; Your #{comment.rank} pick
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Honorable mention mini-card ──────────────────────────────────────────
function HonorableMentionCard({ teacher }: { teacher: RevealTeacher }) {
  const monsterIdx = teacher.monsterIndices[0] ?? 0;

  return (
    <div style={{
      background: C.panelSoft,
      border: `1px solid ${C.panelEdge}`,
      borderRadius: 14,
      padding: 16,
      display: "flex",
      gap: 14,
      alignItems: "center",
      animation: "fade-in 0.5s ease forwards",
    }}>
      {/* Photo or initial */}
      <div style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        overflow: "hidden",
        border: `2px solid ${C.panelEdge}`,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.panel,
      }}>
        {teacher.avatarUrl ? (
          <img
            src={teacher.avatarUrl}
            alt={teacher.displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{
            fontSize: 22,
            fontWeight: 800,
            color: C.textDim,
            fontFamily: F,
          }}>
            {teacher.displayName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 15,
          fontWeight: 700,
          color: C.text,
          margin: "0 0 2px",
          fontFamily: F,
        }}>
          {teacher.displayName}
        </p>
        <p style={{
          fontSize: 12,
          color: C.textFaint,
          margin: 0,
          fontFamily: F,
        }}>
          Played as {MONSTERS[monsterIdx]?.name ?? "???"}
          {teacher.teachingStyle && ` · ${teacher.teachingStyle}`}
        </p>
      </div>

      <Link
        href={`/teachers/${teacher.teacherId}`}
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: C.light,
          textDecoration: "none",
          fontFamily: F,
          whiteSpace: "nowrap" as const,
        }}
      >
        View →
      </Link>
    </div>
  );
}

// ── Summary teacher row ──────────────────────────────────────────────────
function SummaryTeacherRow({ teacher }: { teacher: RevealTeacher }) {
  const monsterIdx = teacher.monsterIndices[0] ?? 0;
  const colors =
    teacher.personalRank >= 1 && teacher.personalRank <= 3
      ? MEDAL_COLORS[teacher.personalRank - 1]
      : { border: C.panelEdge, bg: C.panelSoft, accent: C.textDim, glow: "transparent" };
  const recruitingClasses = teacher.classes.filter((c) => c.isRecruiting);

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 16,
      padding: 16,
      position: "relative" as const,
      overflow: "hidden",
    }}>
      {/* Shimmer on gold */}
      {teacher.personalRank === 1 && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.2) 50%, transparent 60%)",
          animation: "shine-sweep 4s ease-in-out 1s infinite",
          pointerEvents: "none" as const,
        }} />
      )}

      <div style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        marginBottom: 12,
      }}>
        {/* Medal or avatar */}
        <div style={{ flexShrink: 0 }}>
          {teacher.personalRank >= 1 && teacher.personalRank <= 3 ? (
            <span style={{ fontSize: 28, lineHeight: 1 }}>
              {MEDAL_EMOJI[teacher.personalRank - 1]}
            </span>
          ) : (
            <MonsterAvatar index={monsterIdx} size={36} />
          )}
        </div>

        {/* Photo + name */}
        <div style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          overflow: "hidden",
          border: `2px solid ${colors.border}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.panel,
        }}>
          {teacher.avatarUrl ? (
            <img
              src={teacher.avatarUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{
              fontSize: 18,
              fontWeight: 800,
              color: C.textDim,
              fontFamily: F,
            }}>
              {teacher.displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 15,
            fontWeight: 700,
            color: C.text,
            margin: "0 0 2px",
            fontFamily: F,
          }}>
            {teacher.displayName}
          </p>
          <p style={{
            fontSize: 12,
            color: C.textFaint,
            margin: 0,
            fontFamily: F,
          }}>
            {teacher.totalPoints} pts &middot; {MONSTERS[monsterIdx]?.name ?? "???"}
          </p>
        </div>
      </div>

      {/* Class links + message */}
      <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap" as const,
      }}>
        <Link
          href={`/teachers/${teacher.teacherId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            background: colors.accent,
            borderRadius: 8,
            textDecoration: "none",
            fontFamily: F,
          }}
        >
          View Profile
        </Link>

        {recruitingClasses.length > 0 && (
          <Link
            href={`/teachers/${teacher.teacherId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: colors.accent,
              background: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              textDecoration: "none",
              fontFamily: F,
            }}
          >
            {recruitingClasses.length} open {recruitingClasses.length === 1 ? "class" : "classes"}
          </Link>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════
export default function RevealClient({ gameTitle, teachers }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [flipState, setFlipState] = useState<Record<string, boolean>>({});

  // Split teachers into podium (ranked 1–3) and honorable mentions
  const podium = useMemo(
    () =>
      teachers
        .filter((t) => t.personalRank >= 1 && t.personalRank <= 3)
        .sort((a, b) => a.personalRank - b.personalRank),
    [teachers],
  );

  const honorable = useMemo(
    () => teachers.filter((t) => t.personalRank === 0),
    [teachers],
  );

  // Get teachers by reveal order: 3rd → 2nd → 1st
  const third = podium.find((t) => t.personalRank === 3) ?? null;
  const second = podium.find((t) => t.personalRank === 2) ?? null;
  const first = podium.find((t) => t.personalRank === 1) ?? null;

  // Auto-flip after showing the avatar
  useEffect(() => {
    if (phase === "reveal-3" && third) {
      const timer = setTimeout(() => {
        setFlipState((s) => ({ ...s, [third.teacherId]: true }));
        setPhase("flip-3");
      }, 2200);
      return () => clearTimeout(timer);
    }
    if (phase === "reveal-2" && second) {
      const timer = setTimeout(() => {
        setFlipState((s) => ({ ...s, [second.teacherId]: true }));
        setPhase("flip-2");
      }, 2200);
      return () => clearTimeout(timer);
    }
    if (phase === "reveal-1" && first) {
      const timer = setTimeout(() => {
        setFlipState((s) => ({ ...s, [first.teacherId]: true }));
        setPhase("flip-1");
      }, 2800);
      return () => clearTimeout(timer);
    }
  }, [phase, first, second, third]);

  const advance = () => {
    switch (phase) {
      case "intro":
        setPhase(third ? "reveal-3" : second ? "reveal-2" : first ? "reveal-1" : "honorable");
        break;
      case "flip-3":
        setPhase(second ? "reveal-2" : first ? "reveal-1" : "honorable");
        break;
      case "flip-2":
        setPhase(first ? "reveal-1" : "honorable");
        break;
      case "flip-1":
        setPhase(honorable.length > 0 ? "honorable" : "summary");
        break;
      case "honorable":
        setPhase("summary");
        break;
      default:
        break;
    }
  };

  const isFlipped = (teacherId: string) => !!flipState[teacherId];
  const showConfetti = phase === "flip-1";
  const showBalloons = phase === "flip-1";

  return (
    <div style={{
      minHeight: "100dvh",
      background: C.bg,
      fontFamily: F,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* ── Global keyframes ─────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fade-in-scale {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes trophy-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes confetti-sway {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(${15 + Math.random() * 20}px); }
        }
        @keyframes shine-sweep {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(212,168,67,0.2); }
          50% { box-shadow: 0 0 40px rgba(212,168,67,0.4); }
        }
        @keyframes slide-in-stagger {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <Confetti count={60} active={showConfetti} />
      <Balloons count={14} active={showBalloons} />

      {/* ── Content area ─────────────────────────────────────────────── */}
      <div style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "40px 20px 60px",
        position: "relative",
        zIndex: 10,
      }}>
        {/* ═══ INTRO ═══ */}
        {phase === "intro" && (
          <div style={{
            textAlign: "center",
            paddingTop: "12vh",
            animation: "fade-in 0.8s ease forwards",
          }}>
            {/* Monster audience */}
            <div style={{
              display: "flex",
              justifyContent: "center",
              gap: 10,
              marginBottom: 24,
              animation: "fade-in 1s ease 0.3s both",
            }}>
              {[0, 3, 6].map((mi, i) => (
                <div key={mi} style={{
                  opacity: 0.7,
                  animation: `trophy-bounce ${2 + i * 0.3}s ease-in-out ${0.5 + i * 0.15}s infinite`,
                }}>
                  <MonsterAvatar index={mi} size={52} />
                </div>
              ))}
            </div>

            <div style={{
              fontSize: 48,
              marginBottom: 16,
              animation: "trophy-bounce 2s ease-in-out infinite",
              filter: "drop-shadow(0 4px 12px rgba(212,168,67,0.4))",
            }}>
              🏆
            </div>

            <h1 style={{
              fontSize: 28,
              fontWeight: 800,
              color: C.text,
              margin: "0 0 8px",
              letterSpacing: -0.5,
            }}>
              Your Results Are In
            </h1>

            <p style={{
              fontSize: 15,
              color: C.textDim,
              lineHeight: 1.6,
              margin: "0 0 8px",
            }}>
              {gameTitle}
            </p>

            <p style={{
              fontSize: 13,
              color: C.textFaint,
              lineHeight: 1.5,
              margin: "0 0 36px",
            }}>
              Based on your votes across all rounds, we&apos;ve ranked the
              teachers whose photos you loved most. Time to find out who
              was behind each avatar&hellip;
            </p>

            <button
              onClick={advance}
              style={{
                padding: "14px 32px",
                fontSize: 16,
                fontWeight: 700,
                fontFamily: F,
                color: "#fff",
                background: C.light,
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                letterSpacing: 0.5,
                boxShadow: "0 4px 16px rgba(217,138,43,0.3)",
                animation: "pulse-glow 2s ease-in-out infinite",
              }}
            >
              Start the Reveal →
            </button>
          </div>
        )}

        {/* ═══ 3rd PLACE REVEAL ═══ */}
        {(phase === "reveal-3" || phase === "flip-3") && third && (
          <div style={{ animation: "fade-in-up 0.6s ease forwards" }}>
            <TeacherRevealCard
              teacher={third}
              rankIndex={2}
              flipped={isFlipped(third.teacherId)}
            />
            {phase === "flip-3" && (
              <div style={{
                textAlign: "center",
                marginTop: 28,
                animation: "fade-in 0.5s ease 0.6s both",
              }}>
                <button
                  onClick={advance}
                  style={{
                    padding: "12px 28px",
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: F,
                    color: "#fff",
                    background: C.bronze,
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    letterSpacing: 0.5,
                  }}
                >
                  {second ? "Next reveal →" : first ? "Next reveal →" : "Continue →"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ 2nd PLACE REVEAL ═══ */}
        {(phase === "reveal-2" || phase === "flip-2") && second && (
          <div style={{ animation: "fade-in-up 0.6s ease forwards" }}>
            <TeacherRevealCard
              teacher={second}
              rankIndex={1}
              flipped={isFlipped(second.teacherId)}
            />
            {phase === "flip-2" && (
              <div style={{
                textAlign: "center",
                marginTop: 28,
                animation: "fade-in 0.5s ease 0.6s both",
              }}>
                <Confetti count={25} active />
                <button
                  onClick={advance}
                  style={{
                    padding: "12px 28px",
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: F,
                    color: "#fff",
                    background: C.silver,
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    letterSpacing: 0.5,
                  }}
                >
                  {first ? "And your #1 teacher is… →" : "Continue →"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ 1st PLACE REVEAL ═══ */}
        {(phase === "reveal-1" || phase === "flip-1") && first && (
          <div style={{ animation: "fade-in-up 0.6s ease forwards" }}>
            <TeacherRevealCard
              teacher={first}
              rankIndex={0}
              flipped={isFlipped(first.teacherId)}
            />
            {phase === "flip-1" && (
              <div style={{
                textAlign: "center",
                marginTop: 28,
                animation: "fade-in 0.5s ease 1s both",
              }}>
                <button
                  onClick={advance}
                  style={{
                    padding: "14px 32px",
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: F,
                    color: "#fff",
                    background: C.gold,
                    border: "none",
                    borderRadius: 12,
                    cursor: "pointer",
                    letterSpacing: 0.5,
                    boxShadow: "0 4px 20px rgba(212,168,67,0.4)",
                  }}
                >
                  {honorable.length > 0 ? "See all teachers →" : "View summary →"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ HONORABLE MENTIONS ═══ */}
        {phase === "honorable" && (
          <div style={{ animation: "fade-in 0.6s ease forwards" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 32 }}>🌟</span>
              <h2 style={{
                fontSize: 22,
                fontWeight: 800,
                color: C.text,
                margin: "8px 0 4px",
              }}>
                Honorable Mentions
              </h2>
              <p style={{
                fontSize: 14,
                color: C.textDim,
                margin: "0 0 20px",
                lineHeight: 1.5,
              }}>
                Other talented teachers who participated
              </p>
            </div>

            <div style={{
              display: "flex",
              flexDirection: "column" as const,
              gap: 10,
            }}>
              {honorable.map((t, i) => (
                <div key={t.teacherId} style={{
                  animation: `slide-in-stagger 0.4s ease ${i * 0.1}s both`,
                }}>
                  <HonorableMentionCard teacher={t} />
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", marginTop: 28 }}>
              <button
                onClick={advance}
                style={{
                  padding: "12px 28px",
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: F,
                  color: "#fff",
                  background: C.light,
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  letterSpacing: 0.5,
                }}
              >
                View full summary →
              </button>
            </div>
          </div>
        )}

        {/* ═══ SUMMARY ═══ */}
        {phase === "summary" && (
          <div style={{ animation: "fade-in 0.6s ease forwards" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <span style={{ fontSize: 40 }}>🎉</span>
              <h2 style={{
                fontSize: 24,
                fontWeight: 800,
                color: C.text,
                margin: "8px 0 4px",
              }}>
                {gameTitle}
              </h2>
              <p style={{
                fontSize: 14,
                color: C.textDim,
                margin: "0 0 4px",
                lineHeight: 1.5,
              }}>
                Your personal results, all in one place
              </p>
            </div>

            <div style={{
              display: "flex",
              flexDirection: "column" as const,
              gap: 14,
            }}>
              {/* Podium teachers first, then honorable */}
              {[...podium, ...honorable].map((t, i) => (
                <div key={t.teacherId} style={{
                  animation: `fade-in-up 0.4s ease ${i * 0.08}s both`,
                }}>
                  <SummaryTeacherRow teacher={t} />
                </div>
              ))}
            </div>

            {/* Back to browse */}
            <div style={{
              textAlign: "center",
              marginTop: 32,
            }}>
              <Link
                href="/play"
                style={{
                  display: "block",
                  width: "100%",
                  boxSizing: "border-box" as const,
                  textAlign: "center",
                  textDecoration: "none",
                  padding: "14px",
                  fontFamily: F,
                  fontSize: 15,
                  fontWeight: 700,
                  background: C.light,
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  letterSpacing: 0.5,
                }}
              >
                Browse more games →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
