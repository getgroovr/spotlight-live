// ─────────────────────────────────────────────────────────────────────────
// src/app/student/results/page.tsx — awards ceremony page (server wrapper).
//
// Session 63 — U9 dramatic reveal redesign:
//   • Server component fetches game results, passes to client ceremony.
//   • Client component handles sequential round-by-round reveal with
//     countdown, 3rd→2nd→1st place animations, and confetti.
//   • U7: "See the class results" copy (not "see your results").
//   • U6: Awards/ceremony language throughout.
//   • B51: Warm-up round still excluded.
//
// Round labeling (round-0 convention):
//   game_sessions round 0 = warm-up (teacher starter photos)
//   game_sessions round 1+ = student game rounds
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { getGameResults, type RoundResult, type TopEntry } from "@/lib/game-results";
import ResultsCeremony from "./ResultsCeremony";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Spotlight — Awards Ceremony",
};

const C = {
  bg: "#FBF6EC",
  text: "#3A2A18",
  textDim: "#6E5536",
  light: "#D98A2B",
};
const F = "'Outfit',sans-serif";

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
            ? "The game needs to finish before the awards ceremony begins. Check back when all rounds are done!"
            : "We couldn't load the ceremony. Try heading back to your dashboard."}
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

  // B51: warm-up round removed from results page entirely.
  const gameRounds = rounds.filter((r: RoundResult) => r.roundNumber > 0);

  // Serialize the data for the client component.
  // RoundResult and TopEntry are already plain objects from the server query.
  const serializedRounds = gameRounds.map((r: RoundResult) => ({
    roundNumber: r.roundNumber,
    totalVoters: r.totalVoters,
    noWinners: r.noWinners,
    topEntries: r.topEntries.map((e: TopEntry) => ({
      entryId: e.entryId,
      rank: e.rank,
      voteCount: e.voteCount,
      photoUrl: e.photoUrl,
      description: e.description,
      comments: e.comments,
    })),
  }));

  return <ResultsCeremony rounds={serializedRounds} className={className} />;
}
