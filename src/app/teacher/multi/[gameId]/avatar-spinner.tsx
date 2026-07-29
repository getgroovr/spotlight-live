// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/multi/[gameId]/avatar-spinner.tsx
//
// Session 102 — Phase 3.5: Avatar Assignment spinner.
//
// The "game before the game." Teachers spin a 3×3 monster grid to discover
// which avatar they'll play as for this round. Uses the same shuffle-stop
// mechanic as the existing warmup game (spotlight.jsx), but with monsters
// instead of photos.
//
// Props:
//   monsters      — all 9 monsters from the DB (id, monster_index, name, etc.)
//   usedMonsterIds — Set of monster IDs already assigned to this teacher in
//                    previous rounds (greyed out in 'rotating' mode)
//   roundNumber   — which round this spin is for
//   gameId        — for the spinAvatar server action
//   avatarMode    — 'single' | 'rotating' (passed from game, but teacher
//                   doesn't see the label — behavior just differs)
//   lockedMonster — if Single mode and round > 1, the monster from round 1
//                   (second spin will land on this one)
//   onAssigned    — callback after successful assignment
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MonsterAvatar, MONSTERS } from "@/game/monsters.jsx";
import { spinAvatar } from "../actions";

// ── Types ────────────────────────────────────────────────────────────────
export type MonsterRow = {
  id: string;
  monster_index: number;
  name: string;
  body_color: string;
  accent_color: string;
  belly_color: string;
  horn_color: string;
  personality: string;
};

type AvatarSpinnerProps = {
  monsters: MonsterRow[];
  usedMonsterIds: Set<string>;
  roundNumber: number;
  gameId: string;
  avatarMode: "single" | "rotating";
  lockedMonster: MonsterRow | null;
  onAssigned: (monster: MonsterRow) => void;
};

// ── Colors (match game-detail-client) ────────────────────────────────────
const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  success: "#2B8A3E",
  error: "#C53030",
};

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// ═══════════════════════════════════════════════════════════════════════════
// AvatarSpinner
// ═══════════════════════════════════════════════════════════════════════════
export function AvatarSpinner({
  monsters,
  usedMonsterIds,
  roundNumber,
  gameId,
  avatarMode,
  lockedMonster,
  onAssigned,
}: AvatarSpinnerProps) {
  // Grid order — shuffled positions of all 9 monsters
  const [order, setOrder] = useState(() => shuffle(monsters));
  // Phase: idle → running → revealed → saving → done
  const [phase, setPhase] = useState<"idle" | "running" | "revealed" | "saving" | "done">("idle");
  const [selected, setSelected] = useState<MonsterRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrambleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scramble effect — same 180ms interval as spotlight.jsx
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

  const startScramble = useCallback(() => {
    setSelected(null);
    setError(null);
    setPhase("running");
  }, []);

  const stop = useCallback(() => {
    if (phase !== "running") return;

    let pick: MonsterRow;

    if (avatarMode === "single" && lockedMonster && roundNumber > 1) {
      // Single Avatar mode, round 2+: always land on the locked monster
      pick = lockedMonster;
    } else if (avatarMode === "rotating") {
      // Rotating mode: pick from monsters not already used by this teacher
      const available = monsters.filter((m) => !usedMonsterIds.has(m.id));
      pick = available[Math.floor(Math.random() * available.length)];
    } else {
      // Single mode, round 1: pick any monster
      const pool = monsters;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }

    setSelected(pick);
    setPhase("revealed");
  }, [phase, monsters, usedMonsterIds, avatarMode, lockedMonster, roundNumber]);

  const confirmAssignment = useCallback(async () => {
    if (!selected) return;
    setPhase("saving");
    setError(null);

    const result = await spinAvatar(gameId, roundNumber, selected.id);
    if (!result.ok) {
      setError(result.error);
      setPhase("revealed");
      return;
    }

    setPhase("done");
    onAssigned(selected);
  }, [selected, gameId, roundNumber, onAssigned]);

  // Is this monster greyed out? (rotating mode — already assigned)
  const isGreyed = (m: MonsterRow) => {
    if (avatarMode !== "rotating") return false;
    return usedMonsterIds.has(m.id);
  };

  // ── Reveal screen ──────────────────────────────────────────────────────
  if (phase === "revealed" || phase === "saving") {
    const isSingleRepeat = avatarMode === "single" && lockedMonster && roundNumber > 1;
    return (
      <div style={{
        background: "#fff",
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 14,
        padding: "24px 20px",
        textAlign: "center",
      }}>
        <style>{`@keyframes popIn{from{transform:scale(0.7);opacity:0}to{transform:scale(1);opacity:1}}`}</style>

        <div style={{ animation: "popIn 0.4s ease", marginBottom: 16 }}>
          <MonsterAvatar
            index={selected!.monster_index}
            size={100}
            showName
            ring
          />
        </div>

        <h3 style={{
          fontSize: 18, fontWeight: 800, color: C.text,
          margin: "0 0 4px",
        }}>
          {isSingleRepeat ? `You're ${selected!.name} again!` : `Meet ${selected!.name}!`}
        </h3>

        <p style={{
          fontSize: 13, color: C.textDim, lineHeight: 1.6,
          maxWidth: 340, margin: "8px auto 20px",
          fontStyle: "italic",
        }}>
          "{selected!.personality}"
        </p>

        {isSingleRepeat && (
          <p style={{
            fontSize: 12, color: C.light, fontWeight: 600,
            margin: "0 0 16px",
          }}>
            Your avatar is locked for the rest of this game.
          </p>
        )}

        <button
          type="button"
          onClick={confirmAssignment}
          disabled={phase === "saving"}
          style={{
            background: C.light,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "10px 32px",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: phase === "saving" ? "default" : "pointer",
            opacity: phase === "saving" ? 0.6 : 1,
            letterSpacing: 0.5,
          }}
        >
          {phase === "saving" ? "Assigning…" : `Play as ${selected!.name}`}
        </button>

        {error && (
          <p style={{ fontSize: 12, color: C.error, marginTop: 10 }}>{error}</p>
        )}
      </div>
    );
  }

  // ── Done screen (brief — parent will swap to upload form) ──────────────
  if (phase === "done" && selected) {
    return (
      <div style={{
        background: C.success + "10",
        border: `1px solid ${C.success}44`,
        borderRadius: 14,
        padding: "20px",
        textAlign: "center",
      }}>
        <MonsterAvatar index={selected.monster_index} size={64} showName ring />
        <p style={{ fontSize: 13, color: C.success, fontWeight: 600, marginTop: 10 }}>
          You're playing as {selected.name} for Round {roundNumber}!
        </p>
      </div>
    );
  }

  // ── Grid + Spin/Stop ───────────────────────────────────────────────────
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${C.panelEdge}`,
      borderRadius: 14,
      padding: "20px",
    }}>
      <h3 style={{
        fontSize: 15, fontWeight: 700, color: C.text,
        margin: "0 0 4px", textAlign: "center",
      }}>
        Discover your avatar
      </h3>
      <p style={{
        fontSize: 12, color: C.textDim, textAlign: "center",
        margin: "0 0 16px",
      }}>
        Spin the grid to find out which monster you'll play as for Round {roundNumber}.
      </p>

      {/* 3×3 monster grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 6,
        maxWidth: 340,
        margin: "0 auto 20px",
      }}>
        {order.map((m) => {
          const greyed = isGreyed(m);
          return (
            <div
              key={m.id}
              style={{
                background: greyed ? "#f5f0eb" : m.belly_color + "30",
                border: `2px solid ${greyed ? "#ddd" : m.body_color + "55"}`,
                borderRadius: 12,
                padding: "10px 4px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                transition: phase === "running" ? "all 0.18s ease" : "all 0.3s ease",
                position: "relative",
              }}
            >
              <MonsterAvatar
                index={m.monster_index}
                size={56}
                showName
                greyed={greyed}
              />
              {greyed && (
                <div style={{
                  position: "absolute",
                  top: 4,
                  right: 6,
                  fontSize: 9,
                  color: C.textFaint,
                  fontWeight: 600,
                }}>
                  used
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Spin / Stop button */}
      <div style={{ textAlign: "center" }}>
        {phase === "idle" ? (
          <button
            type="button"
            onClick={startScramble}
            style={{
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 700,
              padding: "12px 44px",
              background: C.light,
              color: "#fff",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              letterSpacing: 1,
              boxShadow: `0 6px 24px ${C.light}44`,
            }}
          >
            🎰 Spin
          </button>
        ) : phase === "running" ? (
          <button
            type="button"
            onClick={stop}
            style={{
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 700,
              padding: "12px 48px",
              background: "#E2554A",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              letterSpacing: 2,
              boxShadow: "0 6px 24px #E2554A55",
            }}
          >
            STOP
          </button>
        ) : null}
      </div>
    </div>
  );
}
