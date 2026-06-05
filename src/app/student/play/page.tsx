// /student/play — the in-class game view for a signed-in student.
//
// This is the "first student-led game" surface. Destination of the
// "Go to the game →" button on the finish-joining / profile page. Distinct
// from /play (visitor demo, cross-class, ≥9 photos). This view is scoped to
// the signed-in student's class (profiles.class_id) and gated only on
// "at least one entry exists" — usually the student's own.
//
// Auth: anonymous visitors get the no-session holding page (we don't redirect
// to login here yet — the dashboard's login flow is the main door).
import GameShell from "@/game/shell";
import { loadClassDeck } from "@/lib/class-deck";

export const metadata = {
  title: "Spotlight — Your Class",
};

// Signed URLs expire, and the deck shifts as entries are uploaded/approved.
// Must NEVER go static.
export const dynamic = "force-dynamic";

export default async function StudentPlayPage() {
  const deck = await loadClassDeck();

  if (deck.ok) {
    return <GameShell initialStudents={deck.students} />;
  }

  return <ClassPlayHoldingPage reason={deck.reason} />;
}

function ClassPlayHoldingPage({
  reason,
}: {
  reason: "no-supabase" | "no-session" | "no-class" | "no-entries";
}) {
  const headline =
    reason === "no-session"
      ? "Please sign in"
      : reason === "no-class"
      ? "You're not in a class yet"
      : reason === "no-entries"
      ? "Nothing to play yet"
      : "Your class isn't set up yet";

  const body =
    reason === "no-session"
      ? "Sign in with the magic-link email your teacher sent you, then come back to this page."
      : reason === "no-class"
      ? "Finish joining your class on your profile page first."
      : reason === "no-entries"
      ? "Add your first photo and a few words about it on your profile page — that's your entry in the game. Once it's in, you'll see it here, and your classmates' photos will appear as soon as the teacher approves them."
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
      </div>
    </div>
  );
}
