// /play — the playable Spotlight game route.
//
// SLICE 1A: the route reads the generic deck from the DB. The game itself
// (the shuffle-stop engine) is unchanged in behavior — it just receives the
// deck via a prop instead of importing it from a static file. Anonymous
// visitors can play; logged-in visitors can play too. Auth-gating the front
// door comes later (and may never come — see BUILD_PLAN).
//
// Three states this page renders:
//   1. Supabase configured AND public class has ≥ 9 live starters: the game.
//   2. Supabase configured but pool is < 9: a "deck being prepared" page.
//   3. Supabase not configured (local dev with no .env): falls back to the
//      static STUDENTS array via the engine's default prop, so /play stays
//      playable without a backend.
import GameShell from "@/game/shell";
import { loadGenericDeck } from "@/lib/deck";

export const metadata = {
  title: "Spotlight — Play",
};

// Always render on each request — the deck shuffles per visit (pool > 9
// rotates), and signed URLs would otherwise get baked into a static prerender.
export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const deck = await loadGenericDeck();

  if (deck.ok) {
    return <GameShell initialStudents={deck.students} />;
  }

  // Local dev with no Supabase env yet: render the engine with no deck
  // override, so it falls back to the in-file STUDENTS sample data and
  // /play stays usable without a backend.
  if (deck.reason === "no-supabase") {
    return <GameShell />;
  }

  // Supabase IS configured but the front-door deck isn't ready yet — either
  // no public class exists, or the pool isn't yet at nine. Show a small
  // holding page rather than rendering a malformed grid.
  return <DeckBeingPrepared have={deck.have} />;
}

function DeckBeingPrepared({ have }: { have: number }) {
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
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px" }}>
          The deck is being prepared
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 4px" }}>
          Spotlight needs nine photos before the front door opens.
        </p>
        <p style={{ fontSize: 13, color: "#6a4f33", margin: 0 }}>
          {have === 0
            ? "None have been added yet."
            : `${have} of 9 added so far.`}
        </p>
      </div>
    </div>
  );
}
