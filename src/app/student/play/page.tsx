// ─────────────────────────────────────────────────────────────────────────
// src/app/student/play/page.tsx — the in-class game view for a signed-in
// student.
//
// B30 (#48): currentRound + totalRounds from loadClassDeck are passed to
// GameShell for the boxing-match round splash. When a student round is
// active, GameShell shows a "Round N" splash before loading the deck.
//
// B39 (#51): loadClassDeck now returns "entry-pending" when the student's
// entry hasn't been approved yet. This page shows a friendly "waiting for
// approval" message instead of a generic error.
//
// Session 63:
//   U6: game-over text uses awards/ceremony language.
//   U7: "Go to the awards ceremony" not "See which photos…"
// ─────────────────────────────────────────────────────────────────────────
import GameShell from "@/game/shell";
import { loadClassDeck } from "@/lib/class-deck";
import Link from "next/link";

export const metadata = {
  title: "Spotlight — Your Class",
};

export const dynamic = "force-dynamic";

export default async function StudentPlayPage() {
  const deck = await loadClassDeck();

  if (deck.ok) {
    return (
      <GameShell
        initialStudents={deck.students}
        mode="student"
        warmupComplete={deck.warmupComplete}
        currentRound={deck.currentRound}
        totalRounds={deck.totalRounds}
      />
    );
  }

  return <ClassPlayHoldingPage reason={deck.reason} />;
}

function ClassPlayHoldingPage({
  reason,
}: {
  reason:
    | "no-supabase"
    | "no-session"
    | "no-class"
    | "no-entries"
    | "game-over"
    | "game-not-started"
    | "entry-pending";
}) {
  if (reason === "game-over") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#D9BE8E",
          color: "#3a2a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 12px" }}>
            The game is complete!
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" }}>
            All rounds are finished — time for the awards ceremony!
          </p>
          <Link
            href="/student/results"
            style={{
              display: "inline-block",
              background: "#D98A2B",
              color: "#fff",
              padding: "12px 28px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
              letterSpacing: 0.5,
              marginBottom: 14,
            }}
          >
            🏆 Go to the awards ceremony →
          </Link>
          <div>
            <Link
              href="/student/dashboard"
              style={{
                fontSize: 13,
                color: "#6E5536",
                textDecoration: "underline",
              }}
            >
              Back to your dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (reason === "entry-pending") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#D9BE8E",
          color: "#3a2a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 12px" }}>
            Waiting for approval
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" }}>
            Your photo is waiting for your teacher to review it.
            Once it&apos;s approved, you&apos;ll be able to play this round.
            Check back soon!
          </p>
          <Link
            href="/student/dashboard"
            style={{
              display: "inline-block",
              background: "#D98A2B",
              color: "#fff",
              padding: "12px 28px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
              letterSpacing: 0.5,
            }}
          >
            Back to your dashboard →
          </Link>
        </div>
      </div>
    );
  }

  const headline =
    reason === "no-session"
      ? "Please sign in"
      : reason === "no-class"
      ? "You're not in a class yet"
      : reason === "no-entries"
      ? "Nothing to play yet"
      : reason === "game-not-started"
      ? "Hang tight!"
      : "Your class isn't set up yet";

  const body =
    reason === "no-session"
      ? "Sign in with the magic-link email your teacher sent you, then come back to this page."
      : reason === "no-class"
      ? "Finish joining your class on your profile page first."
      : reason === "no-entries"
      ? "Add your first photo and a few words about it on your profile page — that's your entry in the game. Once it's in, you'll see it here, and your classmates' photos will appear as soon as the teacher approves them."
      : reason === "game-not-started"
      ? "Your teacher hasn't started the game yet. Once they do, you'll be able to play here. In the meantime, make sure your profile is set up and your first photo is uploaded on your dashboard."
      : "Ask your teacher to check the Spotlight setup.";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#D9BE8E",
        color: "#3a2a1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 12px" }}>
          {headline}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>{body}</p>
        {reason === "game-not-started" && (
          <Link
            href="/student/dashboard"
            style={{
              display: "inline-block",
              marginTop: 20,
              background: "#D98A2B",
              color: "#fff",
              padding: "12px 28px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
              letterSpacing: 0.5,
            }}
          >
            Go to your dashboard →
          </Link>
        )}
      </div>
    </div>
  );
}
