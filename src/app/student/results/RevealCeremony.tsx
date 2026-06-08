// ─────────────────────────────────────────────────────────────────────────
// src/app/student/results/RevealCeremony.tsx — multi-screen reveal flow.
//
// Client component invoked by page.tsx after server-side auth + data fetch.
// Renders ONE winner per screen, advancing from worst placement to best:
//
//     Bronze (if 3 winners) → Silver (if ≥2) → Gold → Finish → /dashboard
//
// Per-screen content:
//   • Header with class name and a small dots-progress indicator
//   • Placement badge (#3 / #2 / #1) + tier label (Bronze / Silver / Gold)
//   • Winner's name + total-favorites count
//   • One block per favorited entry (already capped server-side):
//       photo · description · fav count · classmates' comments
//   • Advance button: "Reveal silver →" / "Reveal gold →" / "Finish →"
//
// EDGE CASES
//   • 1 winner → ceremony renders the Gold screen only.
//   • 2 winners → starts at Silver (skips Bronze).
//   • 0 winners is handled in page.tsx, not here.
//
// SIZE PASS
//   v1's per-section padding was generous; v2 tightens it because each
//   screen is the focal point — no need to leave room above/below for
//   the next winner's section.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// ── Types (re-exported via page.tsx's import) ──────────────────────────

export type CommentFromFavoriter = {
  author_id: string;
  author_name: string;
  author_screen_name: string;
  comment: string;
};

export type ResolvedEntry = {
  entry_id: string;
  round: number;
  description_text: string | null;
  fav_count: number;
  comments_from_favoriters: CommentFromFavoriter[];
  signedUrl: string | null;
};

export type ResolvedWinner = {
  placement: number;          // 1, 2, or 3
  student_id: string;
  student_name: string;
  student_screen_name: string;
  total_favorites: number;
  favorited_entries: ResolvedEntry[];   // already tier-capped server-side
  truncated: boolean;                   // true if more entries existed than cap
};

export type RevealData = {
  className: string;
  totalRounds: number;
  winners: ResolvedWinner[];
};

// ── Visual tokens ──────────────────────────────────────────────────────
// Copied from student/dashboard/page.tsx (lines 82-98) so the reveal reads
// as the same product.

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
};
const F = "'Outfit',sans-serif";

// Tier accent — warm metallic-leaning variants of brand orange so the
// hierarchy reads without leaving the palette.
const TIER: Record<number, { label: string; accent: string }> = {
  1: { label: "Gold",   accent: "#D98A2B" },
  2: { label: "Silver", accent: "#A88B5C" },
  3: { label: "Bronze", accent: "#8B6A3F" },
};

const placeOrdinal = (p: number) =>
  p === 1 ? "1st" : p === 2 ? "2nd" : "3rd";

// ── REVEAL CEREMONY (default export) ───────────────────────────────────

export default function RevealCeremony({ data }: { data: RevealData }) {
  const router = useRouter();

  // Build the screen order: worst placement first, best (gold) last.
  // E.g. 3 winners → [3rd, 2nd, 1st]; 2 winners → [2nd, 1st]; 1 → [1st].
  const stages = useMemo(
    () => [...data.winners].sort((a, b) => b.placement - a.placement),
    [data.winners],
  );

  const [stageIndex, setStageIndex] = useState(0);
  const currentWinner = stages[stageIndex];
  const isLast = stageIndex === stages.length - 1;
  const nextWinner = isLast ? null : stages[stageIndex + 1];

  const advance = () => {
    if (isLast) {
      router.push("/student/dashboard");
    } else {
      setStageIndex((i) => i + 1);
      // Scroll to top so the next screen starts at the header.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    }
  };

  const buttonLabel = isLast
    ? "Finish the game →"
    : nextWinner?.placement === 1
      ? "Reveal gold →"
      : "Reveal silver →";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: F,
        padding: "32px 18px 48px",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <CeremonyHeader
          className={data.className}
          stages={stages}
          currentIndex={stageIndex}
        />
        <WinnerScreen winner={currentWinner} />
        <div style={{ marginTop: 28, textAlign: "center" }}>
          <button
            onClick={advance}
            style={{
              fontFamily: F,
              fontSize: 16,
              fontWeight: 700,
              color: "#fff",
              background: C.light,
              border: "none",
              borderRadius: 999,
              padding: "14px 32px",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </main>
  );
}

// ── CEREMONY HEADER (class name + progress dots) ───────────────────────

function CeremonyHeader({
  className,
  stages,
  currentIndex,
}: {
  className: string;
  stages: ResolvedWinner[];
  currentIndex: number;
}) {
  return (
    <header style={{ marginBottom: 22, textAlign: "center" }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: C.light,
          marginBottom: 6,
        }}
      >
        End of the season
      </div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: C.text,
          margin: "0 0 14px",
          letterSpacing: -0.5,
          lineHeight: 1.2,
        }}
      >
        {className}
      </h1>

      {/* Progress dots — only shown when there's more than one stage. */}
      {stages.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {stages.map((s, i) => {
            const tier = TIER[s.placement];
            const isCurrent = i === currentIndex;
            const isPast = i < currentIndex;
            return (
              <div
                key={s.student_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: isPast ? 0.5 : 1,
                }}
              >
                <span
                  style={{
                    width: isCurrent ? 10 : 7,
                    height: isCurrent ? 10 : 7,
                    borderRadius: 999,
                    background: isCurrent ? tier.accent : "transparent",
                    border: `1.5px solid ${tier.accent}`,
                    display: "inline-block",
                    transition: "all 0.2s",
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    color: isCurrent ? tier.accent : C.textFaint,
                    fontWeight: isCurrent ? 700 : 500,
                  }}
                >
                  {tier.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}

// ── WINNER SCREEN ──────────────────────────────────────────────────────

function WinnerScreen({ winner }: { winner: ResolvedWinner }) {
  const tier = TIER[winner.placement];
  const realName = winner.student_name?.trim() || null;
  const screenName = winner.student_screen_name?.trim() || null;
  const showBothNames =
    realName && screenName && realName !== screenName;

  return (
    <section
      style={{
        background: C.panel,
        border: `2px solid ${tier.accent}`,
        borderRadius: 18,
        padding: "22px 22px 18px",
      }}
    >
      {/* ── Per-winner header ── */}
      <header style={{ marginBottom: 18, textAlign: "center" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2,
            fontWeight: 700,
            color: tier.accent,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          {placeOrdinal(winner.placement)} place · {tier.label}
        </div>
        <h2
          style={{
            fontSize: winner.placement === 1 ? 28 : 22,
            fontWeight: 800,
            color: C.text,
            margin: "0 0 4px",
            wordBreak: "break-word",
            lineHeight: 1.2,
          }}
        >
          {realName || screenName || "Anonymous"}
          {showBothNames && (
            <span
              style={{
                fontSize: "0.65em",
                color: C.textDim,
                fontWeight: 500,
                marginLeft: 8,
              }}
            >
              ({screenName})
            </span>
          )}
        </h2>
        <div style={{ fontSize: 13, color: C.textDim }}>
          {winner.total_favorites}{" "}
          {winner.total_favorites === 1 ? "favorite" : "favorites"} this season
        </div>
      </header>

      {/* ── Entries ── */}
      {winner.favorited_entries.length === 0 ? (
        <NoEntriesNote />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {winner.favorited_entries.map((entry, i) => (
            <EntryBlock
              key={entry.entry_id}
              entry={entry}
              tier={tier}
              showDividerAbove={i > 0}
            />
          ))}
        </div>
      )}

      {winner.truncated && (
        <div
          style={{
            marginTop: 14,
            fontSize: 11,
            color: C.textFaint,
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          (showing this student&apos;s top {winner.favorited_entries.length})
        </div>
      )}
    </section>
  );
}

// ── ENTRY BLOCK ────────────────────────────────────────────────────────
// One favorited entry: round label · photo · description · fav count ·
// classmates' comments.

function EntryBlock({
  entry,
  tier,
  showDividerAbove,
}: {
  entry: ResolvedEntry;
  tier: typeof TIER[1];
  showDividerAbove: boolean;
}) {
  return (
    <div>
      {showDividerAbove && (
        <div
          style={{
            borderTop: `1px dashed ${C.panelEdge}`,
            marginBottom: 18,
          }}
        />
      )}

      {/* Round + fav count, as the eyebrow. */}
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1.5,
          fontWeight: 700,
          color: tier.accent,
          textTransform: "uppercase",
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        Round {entry.round} · {entry.fav_count}{" "}
        {entry.fav_count === 1 ? "person" : "people"} favorited this
      </div>

      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "flex-start",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {entry.signedUrl ? (
          <img
            src={entry.signedUrl}
            alt=""
            style={{
              width: 220,
              height: 220,
              objectFit: "cover",
              borderRadius: 12,
              border: `2px solid ${tier.accent}`,
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: 12,
              border: `2px dashed ${C.panelEdge}`,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              color: C.textFaint,
            }}
          >
            photo unavailable
          </div>
        )}

        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          {entry.description_text && (
            <p
              style={{
                fontSize: 14,
                color: C.text,
                fontStyle: "italic",
                margin: "0 0 16px",
                lineHeight: 1.5,
                borderLeft: `2px solid ${tier.accent}`,
                paddingLeft: 10,
              }}
            >
              &quot;{entry.description_text}&quot;
            </p>
          )}

          {entry.comments_from_favoriters.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1,
                  fontWeight: 600,
                  color: C.textFaint,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                What classmates said
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {entry.comments_from_favoriters.map((c, i) => (
                  <li key={`${c.author_id}-${i}`}>
                    <p
                      style={{
                        fontSize: 14,
                        color: C.text,
                        margin: "0 0 2px",
                        lineHeight: 1.45,
                        fontStyle: "italic",
                      }}
                    >
                      &quot;{c.comment}&quot;
                    </p>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.textFaint,
                        paddingLeft: 2,
                      }}
                    >
                      — {c.author_screen_name || c.author_name || "Anonymous"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DEFENSIVE: winner present but no entries (shouldn't happen given the
// RPC logic, but render gracefully if it ever does) ────────────────────

function NoEntriesNote() {
  return (
    <div
      style={{
        background: C.bg,
        border: `1px dashed ${C.panelEdge}`,
        borderRadius: 12,
        padding: "20px 16px",
        textAlign: "center",
        fontSize: 13,
        color: C.textDim,
        lineHeight: 1.5,
      }}
    >
      Their favorited entries aren&apos;t available to show right now.
    </div>
  );
}
