// ─────────────────────────────────────────────────────────────────────────
// src/app/student/results/page.tsx — end-of-game celebration page.
//
// B19 fix (#44): Previously the game ended with a dead-end "game has
// ended" message. Now there's a proper celebration showing who got the
// most favorite votes in each round, whether the student's pick matched
// the class winner, and a warm wrap-up.
//
// Linked from the student dashboard (results button, visible when
// isGameOver=true) and from the game-over holding page on /student/play.
//
// Data comes from getGameResults() which tallies favorites across all
// game_sessions for the class.
//
// Round labeling (round-0 convention):
//   game_sessions round=0 is the warm-up round (teacher's starter photos).
//   game_sessions round=1+ are the student game rounds — round N = "Round N".
// The warm-up winner is shown separately at the bottom as "Warm-up Round"
// while game rounds are labeled "Round 1", "Round 2", etc.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { getGameResults, type RoundResult } from "@/lib/game-results";

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
  liveGreen: "#7A9F5C",
  liveGreenBg: "#E2EFD9",
};
const F = "'Outfit',sans-serif";

// ── Round label helper ──────────────────────────────────────────────────
// Round-0 convention:
//   game_sessions round 0 = warm-up (teacher starter photos)
//   game_sessions round 1 = Round 1 (first game round)
//   game_sessions round 2 = Round 2, etc.
function roundLabel(sessionRound: number): string {
  if (sessionRound === 0) return "Warm-up Round";
  return `Round ${sessionRound}`;
}

// ── Winner card ─────────────────────────────────────────────────────────
function WinnerCard({ result }: { result: RoundResult }) {
  const isWarmup = result.roundNumber === 0;

  return (
    <section style={{
      background: C.panel,
      border: `1px solid ${C.panelEdge}`,
      borderRadius: 20,
      padding: "24px 22px",
      marginBottom: 20,
    }}>
      {/* Round header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
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
          {result.totalVoters} {result.totalVoters === 1 ? "vote" : "votes"} cast
        </span>
      </div>

      {/* Winner photo + info */}
      <div style={{
        background: C.goldBg,
        border: `2px solid ${C.gold}`,
        borderRadius: 16,
        padding: 16,
        marginBottom: result.yourPick ? 14 : 0,
      }}>
        <div style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}>
          {/* Photo */}
          {result.winner.photoUrl ? (
            <img
              src={result.winner.photoUrl}
              alt=""
              style={{
                width: 160,
                height: 160,
                objectFit: "cover",
                borderRadius: 14,
                border: `3px solid ${C.gold}`,
                flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: 160,
              height: 160,
              borderRadius: 14,
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
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: C.gold,
              color: "#fff",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 10,
            }}>
              ★ Most favorited
            </div>

            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: C.text,
              marginBottom: 6,
            }}>
              {result.winner.studentName}
            </div>

            {result.winner.description && (
              <p style={{
                fontSize: 14,
                color: C.text,
                fontStyle: "italic",
                lineHeight: 1.6,
                margin: "0 0 10px",
                borderLeft: `2px solid ${C.gold}`,
                paddingLeft: 12,
                wordBreak: "break-word",
              }}>
                &quot;{result.winner.description}&quot;
              </p>
            )}

            <div style={{
              fontSize: 14,
              color: C.gold,
              fontWeight: 600,
            }}>
              {result.winner.voteCount} favorite {result.winner.voteCount === 1 ? "vote" : "votes"}
            </div>

            {result.youPickedWinner && (
              <div style={{
                marginTop: 10,
                fontSize: 13,
                color: C.liveGreen,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: C.liveGreenBg,
                  border: `1px solid ${C.liveGreen}`,
                  fontSize: 12,
                }}>
                  ✓
                </span>
                You picked this one!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Your pick (if different from winner) */}
      {result.yourPick && (
        <div style={{
          background: C.panelSoft,
          border: `1px solid ${C.panelEdge}`,
          borderRadius: 12,
          padding: 12,
        }}>
          <div style={{
            fontSize: 11,
            letterSpacing: 1.5,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            marginBottom: 8,
          }}>
            Your pick
          </div>
          <div style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}>
            {result.yourPick.photoUrl ? (
              <img
                src={result.yourPick.photoUrl}
                alt=""
                style={{
                  width: 70,
                  height: 70,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: `2px solid ${C.light}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div style={{
                width: 70,
                height: 70,
                borderRadius: 10,
                border: `1px dashed ${C.panelEdge}`,
                flexShrink: 0,
              }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: C.text,
                marginBottom: 4,
              }}>
                {result.yourPick.studentName}
              </div>
              {result.yourPick.description && (
                <p style={{
                  fontSize: 13,
                  color: C.textDim,
                  fontStyle: "italic",
                  lineHeight: 1.5,
                  margin: 0,
                  wordBreak: "break-word",
                }}>
                  &quot;{result.yourPick.description}&quot;
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
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

  // Stats
  const timesYouPickedWinner = rounds.filter((r) => r.youPickedWinner).length;

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

        {/* ── Game round winners ── */}
        {gameRounds.length > 0 ? (
          gameRounds.map((result) => (
            <WinnerCard key={result.roundNumber} result={result} />
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

        {/* ── Your stats ── */}
        {rounds.length > 0 && (
          <div style={{
            background: C.panelSoft,
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 16,
            padding: "18px 22px",
            textAlign: "center",
            marginBottom: 20,
          }}>
            <div style={{
              fontSize: 13,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: C.light,
              marginBottom: 10,
            }}>
              How you did
            </div>
            <div style={{
              fontSize: 28,
              fontWeight: 800,
              color: C.text,
              marginBottom: 4,
            }}>
              {timesYouPickedWinner} of {rounds.length}
            </div>
            <div style={{
              fontSize: 14,
              color: C.textDim,
            }}>
              {timesYouPickedWinner === rounds.length
                ? "You picked the winner every time!"
                : timesYouPickedWinner === 0
                ? "You went your own way — nothing wrong with that."
                : timesYouPickedWinner === 1
                ? "time your pick matched the class favorite"
                : "times your pick matched the class favorite"}
            </div>
          </div>
        )}

        {/* ── Warm-up round (collapsed, at the bottom) ── */}
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
              <span>Warm-up Round Winner</span>
              <span style={{
                fontSize: 12,
                color: C.light,
                fontWeight: 600,
              }}>
                ▸ Show
              </span>
            </summary>
            <div style={{ marginTop: 14 }}>
              <WinnerCard result={warmupRound} />
            </div>
          </details>
        )}

        {/* ── Footer nav ── */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          marginTop: 8,
        }}>
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
    </div>
  );
}
