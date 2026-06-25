// ─────────────────────────────────────────────────────────────────────────
// src/app/student/results/page.tsx — end-of-game celebration page.
//
// Session 54 redesign (B45):
//   • Fully anonymous — no student names on photos or comments.
//   • Only shows comments from students who favorited that entry.
//   • Bigger medal emphasis with confetti animation.
//   • Feels like a celebration, not a report.
//
// Session 57 — B50 + B51:
//   • B50: Rounds with no entries meeting minimum vote threshold (>1)
//     show a "No clear favorite this round" message instead of false winners.
//   • B51: Warm-up round removed from this page entirely.
//     Students can still see their warm-up in the dashboard.
//
// Round labeling (round-0 convention):
//   game_sessions round 0 = warm-up (teacher starter photos)
//   game_sessions round 1+ = student game rounds
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
  { border: C.gold, bg: C.goldBg, accent: C.gold, glow: "rgba(212,168,67,0.35)" },
  { border: C.silver, bg: C.silverBg, accent: C.silver, glow: "rgba(140,140,140,0.2)" },
  { border: C.bronze, bg: C.bronzeBg, accent: C.bronze, glow: "rgba(184,115,51,0.25)" },
];

const RANK_LABEL = ["1st Place", "2nd Place", "3rd Place"];

function roundLabel(n: number): string {
  return n === 0 ? "Warm-up Round" : `Round ${n}`;
}

// ── Confetti CSS (runs once on page load) ─────────────────────────────
function ConfettiStyles() {
  // 40 confetti pieces with random positions, colors, rotation, and delay.
  const colors = ["#D4A843", "#D98A2B", "#E2554A", "#B87333", "#6E9F5B", "#5B8AC9", "#C06090"];
  let keyframes = `
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
  `;

  const pieces = Array.from({ length: 40 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 3;
    const duration = 3.5 + Math.random() * 3;
    const size = 6 + Math.random() * 6;
    const color = colors[i % colors.length];
    const shape = i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0";
    return `.confetti-${i} {
      position: fixed; top: -20px; left: ${left}%;
      width: ${size}px; height: ${size * (0.6 + Math.random() * 0.8)}px;
      background: ${color}; border-radius: ${shape};
      animation: confetti-fall ${duration}s ease-in ${delay}s forwards,
                 confetti-sway ${1.5 + Math.random()}s ease-in-out ${delay}s ${Math.ceil(duration / 1.5)};
      pointer-events: none; z-index: 50;
    }`;
  }).join("\n");

  return <style>{keyframes + pieces}</style>;
}

function ConfettiPieces() {
  return (
    <>
      {Array.from({ length: 40 }, (_, i) => (
        <div key={i} className={`confetti-${i}`} />
      ))}
    </>
  );
}

// ── Single entry card ─────────────────────────────────────────────────
function EntryCard({ entry }: { entry: TopEntry }) {
  const isGold = entry.rank === 1;
  const colors = MEDAL_COLORS[(entry.rank - 1)] || MEDAL_COLORS[2];
  const photoSize = isGold ? 220 : 140;

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 20,
      padding: isGold ? 22 : 16,
      marginBottom: 16,
      boxShadow: isGold
        ? `0 4px 24px ${colors.glow}, 0 0 0 1px ${colors.border}22`
        : `0 2px 12px ${colors.glow}`,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Shine sweep on gold */}
      {isGold && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)",
          animation: "shine-sweep 4s ease-in-out 1s infinite",
          pointerEvents: "none",
        }} />
      )}

      {/* Medal + rank header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: isGold ? 16 : 12,
      }}>
        <span style={{
          fontSize: isGold ? 42 : 30,
          lineHeight: 1,
          filter: isGold ? "drop-shadow(0 2px 8px rgba(212,168,67,0.5))" : "none",
        }}>
          {MEDAL[entry.rank - 1] || ""}
        </span>
        <div>
          <div style={{
            fontSize: isGold ? 20 : 16,
            fontWeight: 800,
            color: colors.accent,
            letterSpacing: 0.5,
          }}>
            {RANK_LABEL[entry.rank - 1] || `${entry.rank}th Place`}
          </div>
          <div style={{
            fontSize: 13,
            color: C.textDim,
            fontWeight: 600,
          }}>
            {entry.voteCount} favorite {entry.voteCount === 1 ? "vote" : "votes"}
          </div>
        </div>
      </div>

      {/* Photo centered */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: entry.description || entry.comments.length > 0 ? 16 : 0,
      }}>
        {entry.photoUrl ? (
          <img
            src={entry.photoUrl}
            alt=""
            style={{
              width: "100%",
              maxWidth: photoSize,
              aspectRatio: "1/1",
              objectFit: "cover",
              borderRadius: isGold ? 16 : 12,
              border: `3px solid ${colors.border}`,
              boxShadow: isGold
                ? `0 4px 20px ${colors.glow}`
                : `0 2px 10px ${colors.glow}`,
            }}
          />
        ) : (
          <div style={{
            width: photoSize,
            height: photoSize,
            borderRadius: isGold ? 16 : 12,
            border: `2px dashed ${C.panelEdge}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: C.textFaint,
          }}>
            photo unavailable
          </div>
        )}
      </div>

      {/* Description */}
      {entry.description && (
        <p style={{
          fontSize: isGold ? 14 : 13,
          color: C.text,
          fontStyle: "italic",
          lineHeight: 1.6,
          margin: "0 0 12px",
          borderLeft: `2px solid ${colors.accent}`,
          paddingLeft: 12,
          wordBreak: "break-word",
          textAlign: "left",
        }}>
          &quot;{entry.description}&quot;
        </p>
      )}

      {/* Comments (only from students who favorited) */}
      {entry.comments.length > 0 && (
        <div style={{
          paddingTop: 14,
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
            Why classmates picked this one
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entry.comments.map((text, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.6)",
                borderRadius: 10,
                padding: "9px 14px",
                textAlign: "left",
              }}>
                <span style={{
                  fontSize: 13,
                  color: C.text,
                  lineHeight: 1.55,
                  wordBreak: "break-word",
                }}>
                  &quot;{text}&quot;
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
      borderRadius: 22,
      padding: "26px 22px",
      marginBottom: 26,
      boxShadow: "0 4px 16px rgba(122,90,58,0.1)",
    }}>
      {/* Round header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        flexWrap: "wrap",
        gap: 8,
      }}>
        <h2 style={{
          fontSize: 14,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          color: C.light,
          margin: 0,
          fontWeight: 700,
        }}>
          {roundLabel(result.roundNumber)}
        </h2>
        <span style={{
          fontSize: 12,
          color: C.textDim,
          background: C.goldBg,
          border: `1px solid ${C.gold}44`,
          padding: "4px 14px",
          borderRadius: 999,
          fontWeight: 600,
        }}>
          {result.totalVoters} {result.totalVoters === 1 ? "voter" : "voters"}
        </span>
      </div>

      {/* Top entries */}
      {result.noWinners ? (
        <div style={{
          background: C.panelSoft,
          border: `1px dashed ${C.panelEdge}`,
          borderRadius: 14,
          padding: "20px 18px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🤷</div>
          <p style={{
            fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: 0,
          }}>
            No clear favorite this round — no photo got more than one vote.
          </p>
        </div>
      ) : (
        result.topEntries.map((entry) => (
          <EntryCard key={entry.entryId} entry={entry} />
        ))
      )}
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

  const { rounds, className } = data;

  // Separate warm-up (round 0) from game rounds (1+)
  // B51: warm-up round removed from results page entirely.
  const gameRounds = rounds.filter((r) => r.roundNumber > 0);

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
      <ConfettiStyles />
      <ConfettiPieces />

      <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            fontSize: 68,
            marginBottom: 8,
            animation: "trophy-bounce 2s ease-in-out infinite",
            filter: "drop-shadow(0 4px 12px rgba(212,168,67,0.4))",
          }}>
            🏆
          </div>
          <h1 style={{
            fontSize: 34,
            fontWeight: 800,
            margin: "0 0 10px",
            color: C.text,
            letterSpacing: -0.5,
          }}>
            Spotlight Winners
          </h1>
          <p style={{
            fontSize: 16,
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

        {/* ── B51: Warm-up round removed from results page.
               Students can still see warm-up in their dashboard. ── */}

        {/* ── B50: "No clear favorite" message for rounds where nobody
               met the minimum vote threshold ── */}
        {gameRounds.some((r) => r.noWinners) && (
          <div style={{
            background: C.panelSoft,
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 16,
            padding: "18px 22px",
            textAlign: "center",
            marginBottom: 24,
          }}>
            <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: 0 }}>
              Some rounds didn&apos;t have a clear favorite — a photo needs more than
              one vote to earn a spot on the podium.
            </p>
          </div>
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
          Back to your dashboard →
        </Link>
      </div>
    </div>
  );
}
