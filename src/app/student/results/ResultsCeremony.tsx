// ─────────────────────────────────────────────────────────────────────────
// src/app/student/results/ResultsCeremony.tsx
//
// Session 99 — Student continuation CTA:
//   • Finale shows "Continue with [teacher name] →" linking to
//     /teachers/[teacherId] when the teacher has open classes.
//   • "Back to dashboard" becomes secondary (outlined) when the CTA shows.
//   • Props: teacherId, teacherName, teacherHasOpenClasses (all optional).
//
// Session 88 — Monster mascots sprinkled through the ceremony:
//   • Intro: row of 5 random monsters flanking the trophy as "audience"
//   • Countdown: random monster peeking from the corner, bobbing
//   • Podium: random monster "presenting" the round results
//   • Finale: celebration row of all 9 monsters
//
// Session 76 — Canvas fireworks on finale burst.
//
// Changes from session 70:
//   • Canvas-based fireworks show during finale-burst: black background,
//     colorful rocket launches → multi-particle explosions with trails.
//   • Finale-burst extended from 3.5s → 5s to let fireworks breathe.
//   • Text overlay styled white-on-dark to sit over the fireworks.
//   • Confetti, balloons, and ribbons still fire alongside.
//
// Previous (session 70):
//   • Progressive celebration: 3rd place modest, 2nd moderate, 1st over-
//     the-top with floating balloons, streaming ribbons, bigger confetti.
//   • Finale tie fix: shows ALL gold winners per round (was .find → now
//     .filter), so tied 1st-place entries both appear.
//   • "Back to dashboard" text link on intro page and after each round
//     podium (below the Next round button).
//
// Flow per round:
//   1. Round announcement + countdown 3-2-1
//   2. For each place (bronze → silver → gold), skip any missing:
//      a. Brief medal splash (~1.2s)
//      b. Winner card with photo + comments
//   3. After gold: confetti burst, then ALL winners shown in podium
//      with "Next round →" button + dashboard link
//
// After all rounds: finale celebration + "Back to your dashboard →"
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { MonsterCard, MONSTERS } from "@/game/monsters.jsx";

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
  /** Teacher who ran this class — used for the "Continue" CTA. */
  teacherId?: string | null;
  teacherName?: string | null;
  /** Whether the teacher has at least one other recruiting class. */
  teacherHasOpenClasses?: boolean;
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
const BALLOON_COLORS = ["#E2554A", "#D4A843", "#5B8AC9", "#6E9F5B", "#C06090", "#E8C547", "#D98A2B", "#9B59B6"];
const RIBBON_COLORS = ["#D4A843", "#E2554A", "#5B8AC9", "#C06090", "#6E9F5B", "#E8C547"];

// ── Timing constants ────────────────────────────────────────────────────
const COUNTDOWN_STEP_MS   = 800;
const MEDAL_SPLASH_MS     = 1200;
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

// ── Balloons — float up from bottom for gold reveals ────────────────────
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
              position: "fixed",
              bottom: -60,
              left: `${left}%`,
              zIndex: 99,
              pointerEvents: "none" as const,
              animation: `balloon-rise ${duration}s ease-out ${delay}s forwards`,
            }}
          >
            {/* Balloon body */}
            <svg width={size} height={size * 1.3} viewBox="0 0 40 52" fill="none">
              <ellipse cx="20" cy="18" rx="16" ry="18" fill={color} opacity="0.85" />
              <ellipse cx="20" cy="18" rx="16" ry="18" fill="url(#balloonShine)" />
              <polygon points="16,35 20,42 24,35" fill={color} opacity="0.7" />
              <line x1="20" y1="42" x2="20" y2="52" stroke={color} strokeWidth="0.8" opacity="0.5" />
              <defs>
                <radialGradient id="balloonShine" cx="0.35" cy="0.3" r="0.6">
                  <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
              </defs>
            </svg>
            <style>{`
              @keyframes balloon-rise {
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

// ── Ribbons — curling streamers for gold reveals ────────────────────────
function Ribbons({ count = 8, active }: { count?: number; active: boolean }) {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 1.5;
        const duration = 4 + Math.random() * 3;
        const color = RIBBON_COLORS[i % RIBBON_COLORS.length];
        const width = 6 + Math.random() * 8;
        const curl = Math.random() > 0.5 ? 1 : -1;
        return (
          <div
            key={`ribbon-${i}`}
            style={{
              position: "fixed",
              top: -40,
              left: `${left}%`,
              width: width,
              height: 60 + Math.random() * 40,
              background: `linear-gradient(180deg, ${color} 0%, ${color}88 50%, ${color}44 100%)`,
              borderRadius: "2px 2px 4px 4px",
              zIndex: 98,
              pointerEvents: "none" as const,
              animation: `ribbon-fall ${duration}s ease-in ${delay}s forwards`,
              transformOrigin: "top center",
            }}
          >
            <style>{`
              @keyframes ribbon-fall {
                0% { transform: translateY(-10vh) rotate(${curl * 10}deg) scaleY(0.5); opacity: 0.9; }
                30% { transform: translateY(25vh) rotate(${curl * -30}deg) scaleY(1); opacity: 0.9; }
                60% { transform: translateY(55vh) rotate(${curl * 45}deg) scaleY(1.1); opacity: 0.7; }
                100% { transform: translateY(110vh) rotate(${curl * 90}deg) scaleY(0.8); opacity: 0; }
              }
            `}</style>
          </div>
        );
      })}
    </>
  );
}

// ── Fireworks — canvas-based explosions for the finale burst ────────────
function Fireworks({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<FireworkParticle[]>([]);
  const launchersRef = useRef<FireworkLauncher[]>([]);

  type FireworkParticle = {
    x: number; y: number; vx: number; vy: number;
    life: number; maxLife: number;
    color: string; size: number; trail: { x: number; y: number }[];
    gravity: number; friction: number; type: "spark" | "streamer";
  };
  type FireworkLauncher = {
    x: number; y: number; vy: number; targetY: number;
    color: string; launched: boolean; timer: number;
  };

  const FIREWORK_PALETTE = [
    "#FF4444", "#FF6B35", "#FFD700", "#44FF44", "#44DDFF",
    "#FF44FF", "#FF8888", "#88CCFF", "#FFAA00", "#FF3388",
    "#55FFAA", "#FFFF55", "#DD55FF", "#FF5555", "#55AAFF",
  ];

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(animRef.current);
      particlesRef.current = [];
      launchersRef.current = [];
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let lastLaunch = 0;
    const launchInterval = 350; // ms between launches
    let startTime = performance.now();

    const explode = (x: number, y: number, color: string) => {
      const count = 60 + Math.floor(Math.random() * 50);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 2 + Math.random() * 5;
        const life = 50 + Math.random() * 40;
        // Pick a color: mostly the main color, sometimes a neighbor
        const c = Math.random() > 0.3
          ? color
          : FIREWORK_PALETTE[Math.floor(Math.random() * FIREWORK_PALETTE.length)];
        particlesRef.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life, maxLife: life,
          color: c, size: 2 + Math.random() * 2,
          trail: [],
          gravity: 0.03 + Math.random() * 0.02,
          friction: 0.97 + Math.random() * 0.02,
          type: Math.random() > 0.8 ? "streamer" : "spark",
        });
      }
      // Secondary burst — smaller inner ring
      const innerCount = 15 + Math.floor(Math.random() * 15);
      for (let i = 0; i < innerCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 2;
        const life = 30 + Math.random() * 25;
        particlesRef.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life, maxLife: life,
          color: "#FFFFFF",
          size: 1.5 + Math.random(),
          trail: [],
          gravity: 0.02,
          friction: 0.98,
          type: "spark",
        });
      }
    };

    const animate = (now: number) => {
      if (!ctx || !canvas) return;
      const elapsed = now - startTime;

      // Semi-transparent clear for motion trails
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Launch new rockets
      if (now - lastLaunch > launchInterval && elapsed < 3200) {
        lastLaunch = now;
        const x = canvas.width * 0.15 + Math.random() * canvas.width * 0.7;
        const targetY = canvas.height * 0.1 + Math.random() * canvas.height * 0.35;
        const color = FIREWORK_PALETTE[Math.floor(Math.random() * FIREWORK_PALETTE.length)];
        launchersRef.current.push({
          x, y: canvas.height + 10, vy: -(8 + Math.random() * 4),
          targetY, color, launched: false, timer: 0,
        });
      }

      // Update & draw launchers (rising rockets)
      launchersRef.current = launchersRef.current.filter((l) => {
        l.y += l.vy;
        l.timer++;
        // Draw rocket trail
        ctx.beginPath();
        ctx.arc(l.x, l.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#FFDDAA";
        ctx.fill();
        // Faint trail sparks
        for (let s = 0; s < 3; s++) {
          const sx = l.x + (Math.random() - 0.5) * 4;
          const sy = l.y + Math.random() * 8;
          ctx.beginPath();
          ctx.arc(sx, sy, 1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,200,100,${0.3 + Math.random() * 0.4})`;
          ctx.fill();
        }
        if (l.y <= l.targetY) {
          explode(l.x, l.y, l.color);
          return false;
        }
        return true;
      });

      // Update & draw particles
      particlesRef.current = particlesRef.current.filter((p) => {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > (p.type === "streamer" ? 12 : 5)) p.trail.shift();

        p.vx *= p.friction;
        p.vy *= p.friction;
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        const alpha = Math.max(0, p.life / p.maxLife);

        // Draw trail
        if (p.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let t = 1; t < p.trail.length; t++) {
            ctx.lineTo(p.trail[t].x, p.trail[t].y);
          }
          ctx.strokeStyle = p.color + Math.floor(alpha * 80).toString(16).padStart(2, "0");
          ctx.lineWidth = p.size * 0.5 * alpha;
          ctx.stroke();
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();

        // Glowing core for streamers
        if (p.type === "streamer" && alpha > 0.4) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha * 1.8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255," + (alpha * 0.25) + ")";
          ctx.fill();
        }

        return p.life > 0;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    // Initial black fill
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        zIndex: 90, pointerEvents: "none",
      }}
    />
  );
}

// ── Session 88: Monster mascot components ─────────────────────────────
// Each picks random monsters on mount so every visit feels different.

/** Hook: suppresses SSR render to avoid hydration mismatch from Math.random() */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Shuffle helper (Fisher–Yates) */
function shuffleIndices(count: number, total: number) {
  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}

/** Row of monsters — "audience" watching the ceremony (intro) */
function MonsterAudience({ count = 3 }: { count?: number }) {
  const mounted = useMounted();
  const picks = useMemo(
    () => (mounted ? shuffleIndices(count, MONSTERS.length) : []),
    [mounted, count],
  );

  if (!mounted) return null;

  return (
    <div style={{
      display: "flex", justifyContent: "center", gap: 16, marginBottom: 16,
      animation: "fade-in 1.2s ease 0.4s both",
    }}>
      {picks.map((mi, i) => (
        <div key={mi} style={{
          opacity: 0.65 + (i === Math.floor(count / 2) ? 0.15 : 0),
          animation: `trophy-bounce ${2 + i * 0.3}s ease-in-out ${0.5 + i * 0.15}s infinite`,
        }}>
          <MonsterCard index={mi} size={110} />
        </div>
      ))}
    </div>
  );
}

/** Scattered monsters across the countdown screen — fade in and out gently */
function MonsterScatter() {
  const mounted = useMounted();
  const picks = useMemo(
    () => (mounted ? shuffleIndices(MONSTERS.length, MONSTERS.length) : []),
    [mounted],
  );

  if (!mounted) return null;

  // Dense grid closer to center — 18 slots (monsters repeat via modulo)
  const positions = [
    { top: "6%",  left: "15%" },
    { top: "10%", left: "78%" },
    { top: "18%", left: "40%" },
    { top: "22%", left: "62%" },
    { top: "32%", left: "22%" },
    { top: "35%", left: "74%" },
    { top: "45%", left: "32%" },
    { top: "42%", left: "65%" },
    { top: "55%", left: "48%" },
    { top: "58%", left: "18%" },
    { top: "60%", left: "80%" },
    { top: "68%", left: "38%" },
    { top: "72%", left: "58%" },
    { top: "80%", left: "28%" },
    { top: "78%", left: "70%" },
    { top: "88%", left: "50%" },
    { top: "15%", left: "52%" },
    { top: "48%", left: "12%" },
  ];

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: "none" as const, zIndex: 0, overflow: "hidden",
    }}>
      {positions.map((pos, i) => {
        const mi = picks[i % picks.length];
        const dur = 1.5 + (i % 4) * 0.5;  // 1.5–3s — fast fade cycles
        const delay = i * 0.3;
        return (
          <div key={`scatter-${i}`} style={{
            position: "absolute",
            ...pos,
            opacity: 0,
            animation: `monster-ghost ${dur}s ease-in-out ${delay}s infinite`,
          }}>
            <MonsterCard index={mi} size={75} />
          </div>
        );
      })}
    </div>
  );
}

/** Two monsters flanking the "Next round" button on the podium */
function MonsterButtonGuards({ seed = 0 }: { seed?: number }) {
  const mounted = useMounted();
  const picks = useMemo(
    () => (mounted ? shuffleIndices(2, MONSTERS.length) : []),
    [mounted, seed],
  );

  if (!mounted) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 16, marginTop: 32, marginBottom: 4,
    }}>
      <div style={{
        animation: "trophy-bounce 2s ease-in-out infinite",
        opacity: 0.65, transform: "scaleX(-1)",
      }}>
        <MonsterCard index={picks[0]} size={80} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center" }} />
      <div style={{
        animation: "trophy-bounce 2.3s ease-in-out 0.3s infinite",
        opacity: 0.65,
      }}>
        <MonsterCard index={picks[1]} size={80} />
      </div>
    </div>
  );
}

/** Monsters celebrating — single row of 4 in the finale footer */
function MonsterCelebration() {
  const mounted = useMounted();
  const order = useMemo(
    () => (mounted ? shuffleIndices(4, MONSTERS.length) : []),
    [mounted],
  );

  if (!mounted) return null;

  return (
    <div style={{
      display: "flex", justifyContent: "center", gap: 14,
      margin: "24px auto 8px",
      animation: "fade-in 0.8s ease 0.6s both",
    }}>
      {order.map((mi, i) => (
        <div key={mi} style={{
          animation: `trophy-bounce ${1.6 + (i % 3) * 0.4}s ease-in-out ${0.1 * i}s infinite`,
          opacity: 0.65,
        }}>
          <MonsterCard index={mi} size={100} />
        </div>
      ))}
    </div>
  );
}

/**
 * Finale monster show — all 9 monsters rise along the LEFT and RIGHT edges
 * of the screen (well outside the center card area), slowly drift upward,
 * swell, and explode. One at a time, alternating sides. Continuous loop.
 * Speed: ~10s per monster, staggered ~5s apart so 2 are visible at once.
 */
function MonsterParade() {
  const mounted = useMounted();
  const order = useMemo(
    () => (mounted ? shuffleIndices(MONSTERS.length, MONSTERS.length) : []),
    [mounted],
  );

  // Give each monster a slightly different animation duration for
  // randomised explosion timing (8–12s range).
  // MUST be before the early return so hooks always run in the same order.
  const durations = useMemo(
    () => order.map(() => 8 + Math.random() * 4),
    [order],
  );

  if (!mounted || order.length === 0) return null;

  // Slow stagger: each monster starts 5s after the previous
  const stagger = 5;

  // Spread 9 monsters evenly across the full screen width.
  // Each position uses translateX(-50%) so the monster is centered on that %.
  // Includes center and edges — no clustering.
  const spreadPositions = [10, 22, 35, 48, 60, 72, 78, 18, 55];

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: "none" as const, zIndex: 70, overflow: "hidden",
    }}>
      {order.map((mi, i) => {
        const xPos = spreadPositions[i % spreadPositions.length];
        const delay = i * stagger;
        const dur = durations[i];
        const flipDir = i % 2 === 0;

        return (
          <div
            key={`parade-${mi}-${i}`}
            style={{
              position: "absolute",
              bottom: -180,
              left: `${xPos}%`,
              transform: flipDir ? "translateX(-50%)" : "translateX(-50%) scaleX(-1)",
              animation: `monster-side-rise ${dur}s ease-in-out ${delay}s infinite`,
            }}
          >
            <MonsterCard index={mi} size={120} />
          </div>
        );
      })}
      <style>{`
        @keyframes monster-side-rise {
          0% {
            transform: translateY(0) scale(0.5);
            opacity: 0;
          }
          3% {
            opacity: 0.65;
          }
          12% {
            transform: translateY(-20vh) scale(0.8);
            opacity: 0.7;
          }
          24% {
            transform: translateY(-40vh) scale(0.85);
            opacity: 0.7;
          }
          36% {
            transform: translateY(-60vh) scale(0.9);
            opacity: 0.7;
          }
          48% {
            transform: translateY(-80vh) scale(0.95);
            opacity: 0.7;
          }
          56% {
            transform: translateY(-92vh) scale(1.0);
            opacity: 0.7;
          }
          62% {
            transform: translateY(-100vh) scale(1.1);
            opacity: 0.7;
          }
          68% {
            transform: translateY(-105vh) scale(1.3);
            opacity: 0.7;
            filter: brightness(1.1);
          }
          74% {
            transform: translateY(-108vh) scale(1.6);
            opacity: 0.65;
            filter: brightness(1.3);
          }
          80% {
            transform: translateY(-110vh) scale(2.0);
            opacity: 0.5;
            filter: brightness(1.6);
          }
          86% {
            transform: translateY(-112vh) scale(2.6);
            opacity: 0.15;
            filter: brightness(2.2);
          }
          90% {
            transform: translateY(-112vh) scale(0);
            opacity: 0;
          }
          100% {
            transform: translateY(-112vh) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

// ── Dashboard link (text, not button) ───────────────────────────────────
function DashboardLink() {
  return (
    <Link
      href="/student/dashboard"
      style={{
        display: "block",
        textAlign: "center",
        marginTop: 16,
        fontSize: 13,
        color: C.textFaint,
        textDecoration: "none",
        fontFamily: F,
        fontWeight: 600,
      }}
    >
      ← Back to dashboard
    </Link>
  );
}

// ── Winner card (single) ────────────────────────────────────────────────
function WinnerCard({ entry, size = "full" }: { entry: TopEntry; size?: "full" | "podium" }) {
  const isGold = entry.rank === 1;
  const isSilver = entry.rank === 2;
  const colors = MEDAL_COLORS[(entry.rank - 1)] || MEDAL_COLORS[2];
  const photoSize = isGold ? 180 : 150;

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: isGold ? 20 : 16,
      padding: isGold ? 18 : 14,
      boxShadow: isGold
        ? `0 8px 32px ${colors.glow}, 0 0 0 1px ${colors.border}22`
        : isSilver
          ? `0 4px 16px ${colors.glow}`
          : `0 2px 12px ${colors.glow}`,
      position: "relative" as const,
      overflow: "hidden",
      animation: "fade-in-scale 0.5s ease forwards",
    }}>
      {/* Gold shimmer sweep */}
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
          fontSize: isGold ? 34 : isSilver ? 28 : 24,
          lineHeight: 1,
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
  | "finale-burst"
  | "finale";

export default function ResultsCeremony({ rounds, className, teacherId, teacherName, teacherHasOpenClasses }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [roundIndex, setRoundIndex] = useState(0);
  const [countdownValue, setCountdownValue] = useState(3);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [confettiCount, setConfettiCount] = useState(0);
  const [showBalloons, setShowBalloons] = useState(false);
  const [showRibbons, setShowRibbons] = useState(false);
  const [finaleConfetti, setFinaleConfetti] = useState(false);
  const [finaleBalloons, setFinaleBalloons] = useState(false);
  const [finaleRibbons, setFinaleRibbons] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
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
        // Progressive celebration: more for higher ranks
        if (currentWinner.rank === 1) {
          setConfettiCount(90);
          setShowBalloons(true);
          setShowRibbons(true);
        } else if (currentWinner.rank === 2) {
          setConfettiCount(40);
          setShowBalloons(false);
          setShowRibbons(true);
        } else {
          // P12: 3rd place matches 2nd place (confetti + ribbons)
          setConfettiCount(40);
          setShowBalloons(false);
          setShowRibbons(true);
        }
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
      setShowBalloons(false);
      setShowRibbons(false);
      if (isLast) {
        setPhase("podium");
      } else {
        setRevealIndex((i) => i + 1);
        setPhase("medal-splash");
      }
    }, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, revealIndex, sortedWinners.length, currentWinner]);

  // ── P11: Finale burst → finale (dramatic pause with fireworks) ────
  useEffect(() => {
    if (phase !== "finale-burst") return;
    timerRef.current = setTimeout(() => {
      setShowFireworks(false);
      setPhase("finale");
    }, 5000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase]);

  const beginCeremony = useCallback(() => {
    if (rounds.length === 0) { setPhase("finale"); return; }
    setRoundIndex(0);
    setRevealIndex(-1);
    setCountdownValue(3);
    setPhase("countdown");
  }, [rounds.length]);

  const nextRound = useCallback(() => {
    if (isLastRound) {
      // P11: dramatic fireworks burst BEFORE the finale winners page.
      // Clear per-round celebrations first, then blast the big ones.
      setConfettiCount(0);
      setShowBalloons(false);
      setShowRibbons(false);
      setShowFireworks(true);
      setFinaleConfetti(true);
      setFinaleBalloons(true);
      setFinaleRibbons(true);
      setPhase("finale-burst");
      return;
    }
    setRoundIndex((i) => i + 1);
    setRevealIndex(-1);
    setCountdownValue(3);
    setConfettiCount(0);
    setShowBalloons(false);
    setShowRibbons(false);
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
        @keyframes gold-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(212,168,67,0.3), 0 8px 32px rgba(212,168,67,0.2); }
          50% { box-shadow: 0 0 40px rgba(212,168,67,0.6), 0 12px 48px rgba(212,168,67,0.4); }
        }
        @keyframes star-burst {
          0% { transform: scale(0) rotate(0deg); opacity: 1; }
          50% { transform: scale(1.2) rotate(180deg); opacity: 0.8; }
          100% { transform: scale(0) rotate(360deg); opacity: 0; }
        }
        @keyframes fireworks-text-in {
          0% { opacity: 0; transform: scale(0.8); }
          60% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes monster-ghost {
          0%, 100% { opacity: 0; transform: scale(0.85); }
          15% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.05); }
          85% { opacity: 0.45; transform: scale(1); }
        }
        @keyframes finale-crown {
          0% { transform: translateY(-30px) scale(0.5); opacity: 0; }
          60% { transform: translateY(5px) scale(1.1); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>

      <Fireworks active={showFireworks} />
      <Confetti active={confettiCount > 0} count={confettiCount} />
      <Confetti active={finaleConfetti} count={180} />
      <Balloons active={showBalloons} count={14} />
      <Balloons active={finaleBalloons} count={24} />
      <Ribbons active={showRibbons} count={10} />
      <Ribbons active={finaleRibbons} count={18} />

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
            <MonsterAudience count={5} />
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
            <DashboardLink />
          </div>
        )}

        {/* ═══ COUNTDOWN ═══ */}
        {phase === "countdown" && currentRound && (
          <div style={{ textAlign: "center", paddingTop: "18vh", position: "relative" }}>
            <MonsterScatter />
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
                textShadow: "0 0 20px rgba(91,154,75,0.3)",
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
          <div key={`splash-${currentWinner.rank}-${revealIndex}`} style={{ textAlign: "center", paddingTop: "20vh" }}>
            <div style={{
              fontSize: 12, letterSpacing: 2.5, textTransform: "uppercase" as const,
              color: C.textFaint, fontWeight: 600, marginBottom: 20,
            }}>
              Round {currentRound?.roundNumber}
            </div>
            <div style={{
              fontSize: currentWinner.rank === 1 ? 120 : currentWinner.rank === 2 ? 100 : 80,
              lineHeight: 1,
              animation: "medal-entrance 0.6s ease forwards",
              filter: `drop-shadow(0 6px 20px ${MEDAL_COLORS[(currentWinner.rank - 1)]?.glow || "rgba(0,0,0,0.1)"})`,
            }}>
              {MEDAL[currentWinner.rank - 1]}
            </div>
            <div style={{
              fontSize: currentWinner.rank === 1 ? 28 : 24,
              fontWeight: 800, marginTop: 16,
              color: MEDAL_COLORS[(currentWinner.rank - 1)]?.accent || C.text,
              animation: "fade-in 0.4s ease 0.3s both",
            }}>
              {RANK_LABEL[currentWinner.rank - 1]}
            </div>
            {/* Gold gets extra sparkle text */}
            {currentWinner.rank === 1 && (
              <div style={{
                fontSize: 14, color: C.gold, marginTop: 8, fontWeight: 600,
                animation: "fade-in 0.4s ease 0.5s both",
                letterSpacing: 2,
              }}>
                ✨ The crowd favorite ✨
              </div>
            )}
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
            {/* Gold card gets a pulsing glow wrapper */}
            {currentWinner.rank === 1 ? (
              <div style={{ animation: "gold-pulse 2.5s ease-in-out infinite", borderRadius: 22 }}>
                <WinnerCard entry={currentWinner} size="full" />
              </div>
            ) : (
              <WinnerCard entry={currentWinner} size="full" />
            )}
          </div>
        )}

        {/* ═══ PODIUM ═══ */}
        {phase === "podium" && currentRound && (
          <div style={{ paddingTop: 16, animation: "fade-in 0.5s ease forwards", position: "relative" }}>
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
            {/* Monsters flanking the button */}
            <MonsterButtonGuards seed={roundIndex} />
            <div style={{ textAlign: "center", marginTop: 4 }}>
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
              <DashboardLink />
            </div>
          </div>
        )}

        {/* ═══ P11: FINALE BURST — dramatic fireworks before winners ═══ */}
        {phase === "finale-burst" && (
          <>
            {/* Black overlay behind the fireworks canvas */}
            <div style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "#000", zIndex: 89, pointerEvents: "none",
            }} />
            <div style={{
              textAlign: "center", paddingTop: "30vh",
              animation: "fireworks-text-in 1s ease 1.5s both",
              position: "relative", zIndex: 95,
            }}>
              <h2 style={{
                fontSize: 36, fontWeight: 800, color: "#FFFFFF",
                margin: "0 0 10px", letterSpacing: 1,
                textShadow: "0 0 30px rgba(212,168,67,0.8), 0 0 60px rgba(212,168,67,0.4)",
              }}>
                And the winners are&hellip;
              </h2>
              <p style={{
                fontSize: 16, color: "rgba(255,255,255,0.7)", margin: 0,
                animation: "fireworks-text-in 0.8s ease 2s both",
                letterSpacing: 0.5,
              }}>
                The photos your class loved most
              </p>
            </div>
          </>
        )}

        {/* ═══ FINALE ═══ */}
        {phase === "finale" && (
          <div style={{ textAlign: "center", paddingTop: "6vh", animation: "fade-in 0.8s ease forwards" }}>
            {/* Monster parade — all 9 rise from bottom, swell & explode */}
            <MonsterParade />

            {/* Crown + party popper */}
            <div style={{ marginBottom: 16 }}>
              <span style={{
                fontSize: 48, display: "inline-block",
                animation: "finale-crown 0.8s ease forwards",
                filter: "drop-shadow(0 4px 12px rgba(212,168,67,0.4))",
              }}>👑</span>
            </div>
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

            {/* ── Per-round gold winners (FIXED: shows ALL tied 1st place) ── */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 28, marginBottom: 32, position: "relative" as const, zIndex: 60 }}>
              {rounds.map((round) => {
                const goldEntries = round.topEntries.filter((e) => e.rank === 1);
                const colors = MEDAL_COLORS[0];

                if (round.noWinners || goldEntries.length === 0) {
                  return (
                    <div key={round.roundNumber} style={{
                      background: C.panelSoft,
                      border: `1px dashed ${C.panelEdge}`,
                      borderRadius: 18, padding: "18px 20px",
                      textAlign: "center",
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 10, marginBottom: 8,
                      }}>
                        <span style={{ fontSize: 24 }}>🤷</span>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.textDim }}>
                          Round {round.roundNumber}
                        </div>
                      </div>
                      <p style={{ fontSize: 13, color: C.textFaint, margin: 0 }}>
                        No clear favorite
                      </p>
                    </div>
                  );
                }

                return goldEntries.map((gold, goldIdx) => (
                  <div key={`${round.roundNumber}-${gold.entryId}`} style={{
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
                          {goldEntries.length > 1 && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.textDim, marginLeft: 6 }}>
                              (tie — {goldIdx + 1} of {goldEntries.length})
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}>
                          {gold.voteCount} favorite {gold.voteCount === 1 ? "vote" : "votes"}
                        </div>
                      </div>
                    </div>

                    {/* Big photo */}
                    {gold.photoUrl ? (
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <img src={gold.photoUrl} alt="" style={{
                          width: "100%", maxWidth: 280, aspectRatio: "1/1",
                          objectFit: "cover", borderRadius: 14,
                          border: `2px solid ${colors.border}`,
                          boxShadow: `0 4px 16px ${colors.glow}`,
                        }} />
                      </div>
                    ) : null}

                    {/* Description if present */}
                    {gold.description && (
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
                ));
              })}
            </div>

            <MonsterCelebration />

            {/* ── Session 99: Continue with this teacher CTA ─────────── */}
            {teacherId && teacherHasOpenClasses && (
              <Link href={`/teachers/${teacherId}`} style={{
                display: "block", width: "100%", boxSizing: "border-box" as const,
                textAlign: "center", textDecoration: "none", padding: "14px",
                fontFamily: F, fontSize: 16, fontWeight: 700,
                background: C.gold, color: "#fff", border: "none", borderRadius: 12, letterSpacing: 0.5,
                position: "relative" as const, zIndex: 60,
                boxShadow: "0 4px 20px rgba(212,168,67,0.4)",
                marginBottom: 12,
              }}>
                Continue with {teacherName || "your teacher"} →
              </Link>
            )}

            <Link href="/student/dashboard" style={{
              display: "block", width: "100%", boxSizing: "border-box" as const,
              textAlign: "center", textDecoration: "none", padding: "14px",
              fontFamily: F, fontSize: 15, fontWeight: 700,
              background: teacherId && teacherHasOpenClasses ? "transparent" : C.light,
              color: teacherId && teacherHasOpenClasses ? C.textDim : "#fff",
              border: teacherId && teacherHasOpenClasses ? `1px solid ${C.panelEdge}` : "none",
              borderRadius: 12, letterSpacing: 0.5,
              position: "relative" as const, zIndex: 60,
            }}>
              Back to your dashboard →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
