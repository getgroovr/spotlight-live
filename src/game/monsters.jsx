// src/game/monsters.jsx
//
// Chunk F + session 88: 9 cute monster characters for flexible-grid filler cards.
//
// When a round has fewer than 9 real entries (students or teachers),
// monster cards fill the remaining 3×3 grid slots so the layout never
// looks broken. Monsters are non-interactive — can't be favorited,
// commented on, or selected by the shuffle-stop engine. They're purely
// visual padding with personality.
//
// Each monster is a self-contained SVG that renders at whatever size
// the grid cell gives it. The designs share the game's warm palette
// but are distinct enough that a grid with all 9 monsters still looks
// varied and fun.
//
// Session 88: added Nubs (#7, teal), Dottie (#8, coral), Munch (#9, mint)
// to complete the set — one unique monster per grid slot.
//
// Usage:
//   import { MonsterCard, padWithMonsters } from "./monsters.jsx";
//
//   // Pad a deck of N students up to 9 with shuffled monster fillers:
//   const fullDeck = padWithMonsters(realStudents);
//
//   // Render a single monster by index (0–8):
//   <MonsterCard index={2} />

import { useMemo } from "react";

// ── Monster palette ─────────────────────────────────────────────────────
// Each monster gets a body color, a darker accent (outlines, feet), and a
// lighter belly highlight. The colors avoid the game's primary gold/amber
// so monsters don't look like they belong to a student.
const MONSTERS = [
  { name: "Gorp",   body: "#6BBF59", accent: "#4A9A3A", belly: "#8DD67A", horn: "#D98A2B" },
  { name: "Pip",    body: "#9B6EC5", accent: "#7A4FA8", belly: "#B98EDB", horn: "#E8C547" },
  { name: "Fizz",   body: "#E8843A", accent: "#C66A25", belly: "#F0A868", horn: "#C04040" },
  { name: "Bloop",  body: "#4AADCF", accent: "#2E8AAF", belly: "#7CC8E0", horn: "#D98A2B" },
  { name: "Sprout", body: "#E06888", accent: "#C04A6A", belly: "#EE96B0", horn: "#9B6EC5" },
  { name: "Zap",    body: "#E0C840", accent: "#B8A020", belly: "#ECE080", horn: "#E8843A" },
  { name: "Nubs",   body: "#3DC5B8", accent: "#2A9A8F", belly: "#6FD9CF", horn: "#E06888" },
  { name: "Dottie", body: "#E87E6E", accent: "#C45E50", belly: "#F2A89E", horn: "#4AADCF" },
  { name: "Munch",  body: "#7EC88A", accent: "#5AA868", belly: "#A8DDB2", horn: "#9B6EC5" },
];

export { MONSTERS };

// ── Individual monster SVGs ─────────────────────────────────────────────
// All share the same viewBox (0 0 80 80) so they scale uniformly.

function Gorp({ size = 64 }) {
  const m = MONSTERS[0];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body — round blob */}
      <ellipse cx="40" cy="46" rx="28" ry="26" fill={m.body} />
      <ellipse cx="40" cy="50" rx="18" ry="14" fill={m.belly} opacity="0.5" />
      {/* Horns */}
      <path d="M22 24 Q18 12 24 10 Q28 9 26 20" fill={m.horn} />
      <path d="M58 24 Q62 12 56 10 Q52 9 54 20" fill={m.horn} />
      {/* Eyes */}
      <ellipse cx="31" cy="40" rx="6" ry="7" fill="white" />
      <ellipse cx="49" cy="40" rx="6" ry="7" fill="white" />
      <circle cx="33" cy="41" r="3.5" fill="#2A1A08" />
      <circle cx="51" cy="41" r="3.5" fill="#2A1A08" />
      <circle cx="34" cy="39.5" r="1.3" fill="white" />
      <circle cx="52" cy="39.5" r="1.3" fill="white" />
      {/* Smile */}
      <path d="M30 54 Q40 63 50 54" stroke="#2A1A08" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {/* Little fangs */}
      <path d="M34 54 L35.5 57.5 L37 54" fill="white" />
      <path d="M43 54 L44.5 57.5 L46 54" fill="white" />
      {/* Feet */}
      <ellipse cx="30" cy="70" rx="9" ry="4.5" fill={m.accent} />
      <ellipse cx="50" cy="70" rx="9" ry="4.5" fill={m.accent} />
    </svg>
  );
}

function Pip({ size = 64 }) {
  const m = MONSTERS[1];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body — tall rounded rectangle */}
      <rect x="16" y="20" width="48" height="50" rx="22" fill={m.body} />
      <ellipse cx="40" cy="52" rx="16" ry="12" fill={m.belly} opacity="0.45" />
      {/* Single big eye */}
      <ellipse cx="40" cy="38" rx="12" ry="13" fill="white" />
      <circle cx="42" cy="39" r="7" fill="#2A1A08" />
      <circle cx="44" cy="36" r="2.5" fill="white" />
      <circle cx="39" cy="42" r="1.2" fill="white" opacity="0.6" />
      {/* Eyelid line */}
      <path d="M28 34 Q32 30 40 29 Q48 30 52 34" stroke={m.accent} strokeWidth="1.5" fill="none" />
      {/* Smile */}
      <path d="M32 56 Q40 63 48 56" stroke="#2A1A08" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Tiny arms */}
      <ellipse cx="14" cy="44" rx="5" ry="4" fill={m.body} stroke={m.accent} strokeWidth="1" />
      <ellipse cx="66" cy="44" rx="5" ry="4" fill={m.body} stroke={m.accent} strokeWidth="1" />
      {/* Feet */}
      <ellipse cx="30" cy="69" rx="8" ry="4" fill={m.accent} />
      <ellipse cx="50" cy="69" rx="8" ry="4" fill={m.accent} />
      {/* Top tuft */}
      <circle cx="40" cy="18" r="5" fill={m.horn} />
      <circle cx="34" cy="20" r="3" fill={m.horn} />
      <circle cx="46" cy="20" r="3" fill={m.horn} />
    </svg>
  );
}

function Fizz({ size = 64 }) {
  const m = MONSTERS[2];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body — wide fuzzy shape */}
      <ellipse cx="40" cy="48" rx="30" ry="24" fill={m.body} />
      <ellipse cx="40" cy="52" rx="18" ry="12" fill={m.belly} opacity="0.45" />
      {/* Fuzzy spikes on top */}
      {[24, 32, 40, 48, 56].map((x, i) => (
        <ellipse key={i} cx={x} cy={26 - (i % 2) * 3} rx="4" ry="6" fill={m.body} />
      ))}
      {/* Small horns */}
      <path d="M24 26 L20 14 L28 22" fill={m.horn} />
      <path d="M56 26 L60 14 L52 22" fill={m.horn} />
      {/* Eyes — wide and happy */}
      <ellipse cx="30" cy="42" rx="5.5" ry="6" fill="white" />
      <ellipse cx="50" cy="42" rx="5.5" ry="6" fill="white" />
      <circle cx="31.5" cy="43" r="3" fill="#2A1A08" />
      <circle cx="51.5" cy="43" r="3" fill="#2A1A08" />
      <circle cx="32.5" cy="41.5" r="1.2" fill="white" />
      <circle cx="52.5" cy="41.5" r="1.2" fill="white" />
      {/* Toothy grin */}
      <path d="M28 56 Q40 66 52 56" stroke="#2A1A08" strokeWidth="2" strokeLinecap="round" fill="none" />
      <rect x="33" y="56" width="4" height="4" rx="1" fill="white" />
      <rect x="43" y="56" width="4" height="4" rx="1" fill="white" />
      {/* Feet */}
      <ellipse cx="28" cy="70" rx="8" ry="4" fill={m.accent} />
      <ellipse cx="52" cy="70" rx="8" ry="4" fill={m.accent} />
    </svg>
  );
}

function Bloop({ size = 64 }) {
  const m = MONSTERS[3];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body — slightly boxy */}
      <rect x="14" y="22" width="52" height="46" rx="18" fill={m.body} />
      <ellipse cx="40" cy="50" rx="17" ry="11" fill={m.belly} opacity="0.45" />
      {/* Ears */}
      <ellipse cx="18" cy="24" rx="7" ry="10" fill={m.body} stroke={m.accent} strokeWidth="1" />
      <ellipse cx="62" cy="24" rx="7" ry="10" fill={m.body} stroke={m.accent} strokeWidth="1" />
      <ellipse cx="18" cy="22" rx="4" ry="6" fill={m.belly} opacity="0.4" />
      <ellipse cx="62" cy="22" rx="4" ry="6" fill={m.belly} opacity="0.4" />
      {/* Eyes — looking up */}
      <ellipse cx="32" cy="38" rx="6" ry="6.5" fill="white" />
      <ellipse cx="48" cy="38" rx="6" ry="6.5" fill="white" />
      <circle cx="33" cy="36" r="3.5" fill="#2A1A08" />
      <circle cx="49" cy="36" r="3.5" fill="#2A1A08" />
      <circle cx="34" cy="34.5" r="1.3" fill="white" />
      <circle cx="50" cy="34.5" r="1.3" fill="white" />
      {/* Big open mouth smile */}
      <ellipse cx="40" cy="54" rx="12" ry="8" fill="#2A1A08" />
      <ellipse cx="40" cy="56" rx="8" ry="4" fill="#C04040" opacity="0.7" />
      {/* Top teeth */}
      <path d="M32 48 L34 51 L36 48 L38 51 L40 48 L42 51 L44 48 L46 51 L48 48" fill="white" />
      {/* Feet */}
      <ellipse cx="28" cy="68" rx="9" ry="4" fill={m.accent} />
      <ellipse cx="52" cy="68" rx="9" ry="4" fill={m.accent} />
    </svg>
  );
}

function Sprout({ size = 64 }) {
  const m = MONSTERS[4];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Antennae */}
      <line x1="30" y1="28" x2="24" y2="12" stroke={m.accent} strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="28" x2="56" y2="12" stroke={m.accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="10" r="4" fill={m.horn} />
      <circle cx="56" cy="10" r="4" fill={m.horn} />
      {/* Body — pear-shaped */}
      <ellipse cx="40" cy="52" rx="26" ry="22" fill={m.body} />
      <ellipse cx="40" cy="38" rx="18" ry="16" fill={m.body} />
      <ellipse cx="40" cy="54" rx="16" ry="12" fill={m.belly} opacity="0.45" />
      {/* Eyes — cute half-moon happy */}
      <path d="M26 40 Q32 34 38 40" stroke="#2A1A08" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M42 40 Q48 34 54 40" stroke="#2A1A08" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Blush spots */}
      <ellipse cx="24" cy="44" rx="5" ry="3" fill={m.accent} opacity="0.3" />
      <ellipse cx="56" cy="44" rx="5" ry="3" fill={m.accent} opacity="0.3" />
      {/* Little mouth */}
      <ellipse cx="40" cy="48" rx="4" ry="3" fill="#2A1A08" />
      <ellipse cx="40" cy="47" rx="2.5" ry="1.5" fill="white" opacity="0.5" />
      {/* Tiny arms waving */}
      <path d="M14 46 Q8 38 12 34" stroke={m.accent} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M66 46 Q72 38 68 34" stroke={m.accent} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Feet */}
      <ellipse cx="30" cy="72" rx="8" ry="4" fill={m.accent} />
      <ellipse cx="50" cy="72" rx="8" ry="4" fill={m.accent} />
    </svg>
  );
}

function Zap({ size = 64 }) {
  const m = MONSTERS[5];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body — star/spiky blob */}
      <path
        d="M40 10 L48 28 L68 28 L52 40 L58 58 L40 48 L22 58 L28 40 L12 28 L32 28 Z"
        fill={m.body}
      />
      {/* Rounder center mass to soften the star */}
      <circle cx="40" cy="38" r="18" fill={m.body} />
      <circle cx="40" cy="40" r="12" fill={m.belly} opacity="0.45" />
      {/* Eyes — excited wide */}
      <ellipse cx="34" cy="36" rx="5" ry="6" fill="white" />
      <ellipse cx="46" cy="36" rx="5" ry="6" fill="white" />
      <circle cx="35" cy="37" r="3" fill="#2A1A08" />
      <circle cx="47" cy="37" r="3" fill="#2A1A08" />
      <circle cx="36" cy="35.5" r="1.2" fill="white" />
      <circle cx="48" cy="35.5" r="1.2" fill="white" />
      {/* Excited open mouth */}
      <ellipse cx="40" cy="47" rx="6" ry="5" fill="#2A1A08" />
      <ellipse cx="40" cy="49" rx="4" ry="2.5" fill="#C04040" opacity="0.6" />
      {/* Lightning bolt mark on forehead */}
      <path d="M38 24 L40 28 L36 28 L39 32" stroke={m.horn} strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Feet */}
      <ellipse cx="32" cy="58" rx="7" ry="3.5" fill={m.accent} />
      <ellipse cx="48" cy="58" rx="7" ry="3.5" fill={m.accent} />
    </svg>
  );
}

// ── NEW SESSION 88 MONSTERS ─────────────────────────────────────────────

function Nubs({ size = 64 }) {
  const m = MONSTERS[6];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body — squat wide bean, very round */}
      <ellipse cx="40" cy="48" rx="30" ry="22" fill={m.body} />
      <ellipse cx="40" cy="52" rx="20" ry="13" fill={m.belly} opacity="0.45" />
      {/* Stubby nub horns — three little bumps on top */}
      <circle cx="30" cy="28" r="6" fill={m.body} />
      <circle cx="40" cy="24" r="7" fill={m.body} />
      <circle cx="50" cy="28" r="6" fill={m.body} />
      {/* Horn tips on the bumps */}
      <circle cx="40" cy="18" r="3.5" fill={m.horn} />
      <circle cx="30" cy="23" r="2.5" fill={m.horn} />
      <circle cx="50" cy="23" r="2.5" fill={m.horn} />
      {/* Eyes — wide set, cheerful */}
      <ellipse cx="28" cy="44" rx="6" ry="6.5" fill="white" />
      <ellipse cx="52" cy="44" rx="6" ry="6.5" fill="white" />
      <circle cx="30" cy="45" r="3.5" fill="#2A1A08" />
      <circle cx="54" cy="45" r="3.5" fill="#2A1A08" />
      <circle cx="31" cy="43" r="1.3" fill="white" />
      <circle cx="55" cy="43" r="1.3" fill="white" />
      {/* Big cheeks */}
      <ellipse cx="20" cy="50" rx="6" ry="4" fill={m.horn} opacity="0.25" />
      <ellipse cx="60" cy="50" rx="6" ry="4" fill={m.horn} opacity="0.25" />
      {/* Wide happy mouth */}
      <path d="M28 56 Q34 64 40 62 Q46 64 52 56" stroke="#2A1A08" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Tongue peeking out */}
      <ellipse cx="40" cy="60" rx="5" ry="3" fill="#C04040" opacity="0.5" />
      {/* Stubby little feet */}
      <ellipse cx="26" cy="68" rx="7" ry="4" fill={m.accent} />
      <ellipse cx="40" cy="70" rx="6" ry="3.5" fill={m.accent} />
      <ellipse cx="54" cy="68" rx="7" ry="4" fill={m.accent} />
    </svg>
  );
}

function Dottie({ size = 64 }) {
  const m = MONSTERS[7];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body — tall oval */}
      <ellipse cx="40" cy="46" rx="24" ry="28" fill={m.body} />
      <ellipse cx="40" cy="52" rx="15" ry="14" fill={m.belly} opacity="0.45" />
      {/* Polka dots on body */}
      <circle cx="24" cy="38" r="3" fill={m.accent} opacity="0.35" />
      <circle cx="56" cy="42" r="2.5" fill={m.accent} opacity="0.35" />
      <circle cx="28" cy="56" r="2" fill={m.accent} opacity="0.3" />
      <circle cx="52" cy="54" r="2.5" fill={m.accent} opacity="0.3" />
      <circle cx="34" cy="30" r="2" fill={m.accent} opacity="0.3" />
      <circle cx="48" cy="32" r="2.5" fill={m.accent} opacity="0.35" />
      {/* Floppy ears */}
      <ellipse cx="18" cy="32" rx="8" ry="5" fill={m.body} transform="rotate(-20 18 32)" />
      <ellipse cx="62" cy="32" rx="8" ry="5" fill={m.body} transform="rotate(20 62 32)" />
      <ellipse cx="17" cy="31" rx="5" ry="3" fill={m.belly} opacity="0.4" transform="rotate(-20 17 31)" />
      <ellipse cx="63" cy="31" rx="5" ry="3" fill={m.belly} opacity="0.4" transform="rotate(20 63 31)" />
      {/* Bow/tuft on top */}
      <circle cx="40" cy="18" r="4" fill={m.horn} />
      <ellipse cx="34" cy="17" rx="5" ry="3.5" fill={m.horn} transform="rotate(-15 34 17)" />
      <ellipse cx="46" cy="17" rx="5" ry="3.5" fill={m.horn} transform="rotate(15 46 17)" />
      {/* Eyes — round and sparkly */}
      <ellipse cx="33" cy="40" rx="5.5" ry="6" fill="white" />
      <ellipse cx="47" cy="40" rx="5.5" ry="6" fill="white" />
      <circle cx="34" cy="41" r="3.5" fill="#2A1A08" />
      <circle cx="48" cy="41" r="3.5" fill="#2A1A08" />
      <circle cx="35.5" cy="39" r="1.5" fill="white" />
      <circle cx="49.5" cy="39" r="1.5" fill="white" />
      <circle cx="33" cy="42.5" r="0.8" fill="white" opacity="0.5" />
      <circle cx="47" cy="42.5" r="0.8" fill="white" opacity="0.5" />
      {/* Cute small smile */}
      <path d="M35 52 Q40 57 45 52" stroke="#2A1A08" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Feet */}
      <ellipse cx="32" cy="72" rx="8" ry="4" fill={m.accent} />
      <ellipse cx="48" cy="72" rx="8" ry="4" fill={m.accent} />
    </svg>
  );
}

function Munch({ size = 64 }) {
  const m = MONSTERS[8];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body — chubby square-ish with rounded corners */}
      <rect x="12" y="24" width="56" height="44" rx="20" fill={m.body} />
      <ellipse cx="40" cy="50" rx="18" ry="12" fill={m.belly} opacity="0.45" />
      {/* Little round ears on top */}
      <circle cx="22" cy="24" r="8" fill={m.body} />
      <circle cx="58" cy="24" r="8" fill={m.body} />
      <circle cx="22" cy="22" r="4.5" fill={m.belly} opacity="0.4" />
      <circle cx="58" cy="22" r="4.5" fill={m.belly} opacity="0.4" />
      {/* Eyes — half-closed happy (upside-down arcs) */}
      <path d="M26 42 Q31 36 36 42" stroke="#2A1A08" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M44 42 Q49 36 54 42" stroke="#2A1A08" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Blush */}
      <ellipse cx="22" cy="46" rx="5" ry="3" fill={m.horn} opacity="0.25" />
      <ellipse cx="58" cy="46" rx="5" ry="3" fill={m.horn} opacity="0.25" />
      {/* Big open mouth — the "munch" */}
      <ellipse cx="40" cy="55" rx="10" ry="8" fill="#2A1A08" />
      <ellipse cx="40" cy="57" rx="7" ry="4" fill="#C04040" opacity="0.6" />
      {/* Top teeth */}
      <rect x="34" y="48" width="5" height="4" rx="1.5" fill="white" />
      <rect x="41" y="48" width="5" height="4" rx="1.5" fill="white" />
      {/* Bottom teeth */}
      <rect x="36" y="59" width="4" height="3" rx="1" fill="white" />
      <rect x="42" y="59" width="4" height="3" rx="1" fill="white" />
      {/* Tiny stubby arms */}
      <ellipse cx="10" cy="46" rx="5" ry="4" fill={m.body} stroke={m.accent} strokeWidth="1" />
      <ellipse cx="70" cy="46" rx="5" ry="4" fill={m.body} stroke={m.accent} strokeWidth="1" />
      {/* Feet */}
      <ellipse cx="28" cy="68" rx="9" ry="4" fill={m.accent} />
      <ellipse cx="52" cy="68" rx="9" ry="4" fill={m.accent} />
    </svg>
  );
}

// ── Monster card component ──────────────────────────────────────────────
// Used by StageGrid and ReviewGrid to render a filler slot.
const MONSTER_COMPONENTS = [Gorp, Pip, Fizz, Bloop, Sprout, Zap, Nubs, Dottie, Munch];

export function MonsterCard({ index, size = 56 }) {
  const MonsterSvg = MONSTER_COMPONENTS[index % MONSTER_COMPONENTS.length];
  return <MonsterSvg size={size} />;
}

// ── Pad a deck with monster fillers ─────────────────────────────────────
// Takes an array of real student objects and returns a 9-element array
// with monster fillers shuffled into random positions. Each monster filler
// is a pseudo-student object with `isMonster: true` and a unique id.
//
// With 9 monsters in the pool, every filler slot gets a unique design —
// no repeats unless the deck somehow needs more than 9 fillers (it won't
// in the 3×3 grid).
//
// The monster selection is stable per call but randomised — a round with
// 5 real students gets 4 different monsters from the pool of 9, placed in
// random grid slots.
export function padWithMonsters(students) {
  if (!students || students.length >= 9) return students || [];

  const needed = 9 - students.length;

  // Pick `needed` monsters from the pool. Shuffle the indices 0–8 and take
  // the first `needed` so we get distinct designs (always possible now
  // since pool size = grid size = 9).
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const fillers = [];
  for (let i = 0; i < needed; i++) {
    const mi = indices[i % indices.length];
    const m = MONSTERS[mi];
    fillers.push({
      id: `monster-${mi}-${i}`,
      name: m.name,
      color: m.body,
      isMonster: true,
      monsterIndex: mi,
      // These flags make the engine skip monsters in shuffle/stop and
      // mark them non-interactive in the review grid. The isPlaceholder
      // flag is already handled by the existing stop() filter.
      isPlaceholder: true,
      entries: [],
    });
  }

  // Merge real students + fillers, then shuffle positions so monsters
  // aren't always at the end.
  const merged = [...students, ...fillers];
  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]];
  }

  return merged;
}
