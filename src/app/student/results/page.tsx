// ─────────────────────────────────────────────────────────────────────────
// src/app/student/results/page.tsx — end-of-game celebration page.
//
// Session 52C redesign: shows the top 3 most-favorited photos per round
// (gold / silver / bronze) with the comments classmates wrote about them.
// Feels like a classroom yearbook page, not a scoreboard.
//
// Round labeling (round-0 convention):
//   game_sessions round 0 = warm-up (teacher starter photos)
//   game_sessions round 1+ = student game rounds
// Warm-up shown collapsed at the bottom.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { getGameResults, type RoundResult, type TopEntry } from "@/lib/game-results";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Spotlight — Results",
};

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
};
const F = "'Outfit',sans-serif";

const MEDAL = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = [
  { border: C.gold, bg: C.goldBg, accent: C.gold },
  { border: C.silver, bg: C.silverBg, accent: C.silver },
  { border: C.bronze, bg: C.bronzeBg, accent: C.bronze },
];

function roundLabel(n: number): string {
  return n === 0 ? "Warm-up Round" : `Round ${n}`;
}

// ── Single entry card (gold = large, silver/bronze = compact) ─────────
function EntryCard({ entry }: { entry: TopEntry }) {
  const isGold = entry.rank === 1;
  const colors = MEDAL_COLORS[(entry.rank - 1)] || MEDAL_COLORS[2];
  const photoSize = isGold ? 180 : 100;

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 16,
      padding: isGold ? 18 : 14,
      marginBottom: 14,
    }}>
      {/* Photo + info row */}
      <div style={{
        display: "flex",
        gap: isGold ? 16 : 12,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}>
        {/* Photo */}
        {entry.photoUrl ? (
          <img
            src={entry.photoUrl}
            alt=""
            style={{
              width: photoSize,
              height: photoSize,
              objectFit: "cover",
              borderRadius: isGold ? 14 : 10,
              border: `3px solid ${colors.border}`,
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: photoSize,
            height: photoSize,
            borderRadius: isGold ? 14 : 10,
            border: `2px dashed ${C.panelEdge}`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: C.textFaint,
          }}>
            photo unavailable
          </div>
        )}

        {/* Info column */}
        <div style={{ flex: 1, minWidth: isGold ? 180 : 140 }}>
          {/* Medal + name */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}>
            <span style={{ fontSize: isGold ? 28 : 22, lineHeight: 1 }}>
              {MEDAL[entry.rank - 1] || ""}
            </span>
            <span style={{
              fontSize: isGold ? 18 : 15,
              fontWeight: 700,
              color: C.text,
            }}>
              {entry.studentName}
            </span>
          </div>

          {/* Description */}
          {entry.description && (
            <p style={{
              fontSize: isGold ? 14 : 13,
              color: C.text,
              fontStyle: "italic",
              lineHeight: 1.5,
              margin: "0 0 8px",
              borderLeft: `2px solid ${colors.accent}`,
              paddingLeft: 10,
              wordBreak: "break-word",
            }}>
              &quot;{entry.description}&quot;
            </p>
          )}

          {/* Vote count */}
          <div style={{
            fontSize: 13,
            color: colors.accent,
            fontWeight: 600,
          }}>
            {entry.voteCount} favorite {entry.voteCount === 1 ? "vote" : "votes"}
          </div>
        </div>
      </div>

      {/* Comments */}
      {entry.comments.length > 0 && (
        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${colors.border}44`,
        }}>
          <div style={{
            fontSize: 11,
            letterSpacing: 1.5,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            marginBottom: 8,
          }}>
            What classmates said
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entry.comments.map((c, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.6)",
                borderRadius: 8,
                padding: "8px 12px",
              }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textDim,
                  marginRight: 6,
                }}>
                  {c.studentName}:
                </span>
                <span style={{
                  fontSize: 13,
                  color: C.text,
                  lineHeight: 1.5,
                  wordBreak: "break-word",
                }}>
                  {c.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Round section ─────────────────────────────────────────────────────
function RoundSection({ result }: { result: RoundResult }) {
  return (
    <section style={{
      background: C.panel,
      border: `1px solid ${C.panelEdge}`,
      borderRadius: 20,
      padding: "24px 22px",
      marginBottom: 24,
    }}>
      {/* Round header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
        flexWrap: "wrap",
        gap: 8,
      }}>
        <h2 style={{
          fontSize: 13,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: C.light,
          margin: 0,
        }}>
          {roundLabel(result.roundNumber)}
        </h2>
        <span style={{
          fontSize: 12,
          color: C.textDim,
          background: C.goldBg,
          border: `1px solid ${C.gold}44`,
          padding: "3px 12px",
          borderRadius: 999,
        }}>
          {result.totalVoters} {result.totalVoters === 1 ? "player" : "players"}
        </span>
      </div>

      {/* Top entries */}
      {result.topEntries.map((entry) => (
        <EntryCard key={entry.entryId} entry={entry} />
      ))}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default async function ResultsPage() {
  const data = await getGameResults();

  if (!data.ok) {
    if (data.error === "no-session") redirect("/play");

    return (
      <div style={{
        background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center",
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>
          {data.error === "no-class"
            ? "You're not in a class"
            : data.error === "no-sessions" || data.error === "no-favorites"
            ? "No results yet"
            : "Something's off"}
        </h1>
        <p style={{ color: C.textDim, fontSize: 14, lineHeight: 1.6 }}>
          {data.error === "no-sessions" || data.error === "no-favorites"
            ? "The game needs to finish before results appear here. Check back when all rounds are done!"
            : "We couldn't load your results. Try heading back to your dashboard."}
        </p>
        <Link href="/student/dashboard" style={{
          display: "inline-block", marginTop: 20,
          color: C.light, fontWeight: 600, fontSize: 14,
          textDecoration: "none",
        }}>
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const { rounds, studentName, className } = data;

  // Separate warm-up (round 0) from game rounds (1+)
  const warmupRound = rounds.find((r) => r.roundNumber === 0) || null;
  const gameRounds = rounds.filter((r) => r.roundNumber > 0);

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🏆</div>
          <h1 style={{
            fontSize: 30,
            fontWeight: 800,
            margin: "0 0 8px",
            color: C.text,
          }}>
            Spotlight Winners
          </h1>
          <p style={{
            fontSize: 15,
            color: C.textDim,
            lineHeight: 1.6,
            margin: 0,
          }}>
            The photos your class loved most in <strong>{className}</strong>.
          </p>
        </div>

        {/* ── Game round results ── */}
        {gameRounds.length > 0 ? (
          gameRounds.map((result) => (
            <RoundSection key={result.roundNumber} result={result} />
          ))
        ) : (
          <div style={{
            background: C.panel,
            border: `1px dashed ${C.panelEdge}`,
            borderRadius: 16,
            padding: "32px 24px",
            textAlign: "center",
            color: C.textDim,
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 20,
          }}>
            No game round results to show yet. Check back after rounds are complete!
          </div>
        )}

        {/* ── Warm-up round (collapsed) ── */}
        {warmupRound && (
          <details style={{
            background: C.panelSoft,
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 16,
            padding: "12px 18px",
            marginBottom: 20,
          }}>
            <summary style={{
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: C.text,
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span>Warm-up Round Results</span>
              <span style={{
                fontSize: 12,
                color: C.light,
                fontWeight: 600,
              }}>
                ▸ Show
              </span>
            </summary>
            <div style={{ marginTop: 14 }}>
              <RoundSection result={warmupRound} />
            </div>
          </details>
        )}

        {/* ── Footer ── */}
        <Link
          href="/student/dashboard"
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            textAlign: "center",
            textDecoration: "none",
            padding: "13px",
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
          Back to your dashboard →
        </Link>
      </div>
    </div>
  );
}
