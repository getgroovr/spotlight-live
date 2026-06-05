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
//
// REDIRECT-IF-ENROLLED (added in slice 1 engine-adaptation pass):
//   Visitors who have already enrolled don't belong on /play — their real
//   home is /student/dashboard, and re-entering the visitor flow would offer
//   them a stale "Resume" from a game they enrolled out of. Before loading
//   the deck, we check the session; if there's a logged-in user AND a row
//   in `students` for their email, we 307 over to /student/dashboard. The
//   `students` lookup is the truth for "is this person actually enrolled"
//   (sessions can exist without enrollment, e.g. mid-magic-link flow).
//
//   This pairs with two changes in spotlight.jsx: per-route saveKey() (so
//   /play and /student/play don't share localStorage) and clearProgress()
//   on successful enrollment (so the visitor key is wiped at the moment
//   they transition away). All three together kill the resume-stuck-on-
//   old-game bug.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import GameShell from "@/game/shell";
import { loadGenericDeck } from "@/lib/deck";

export const metadata = {
  title: "Spotlight — Play",
};

// Always render on each request — the deck shuffles per visit (pool > 9
// rotates), and signed URLs would otherwise get baked into a static prerender.
export const dynamic = "force-dynamic";

export default async function PlayPage() {
  // Step 1: if this visitor is actually an enrolled student, send them to
  // their dashboard. Safe to run on every /play visit — two cheap reads
  // when there's a session, zero when there isn't.
  const ssr = await createClient();
  if (ssr) {
    const { data: { user } } = await ssr.auth.getUser();
    if (user?.email) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        const admin = createServiceClient(supabaseUrl, serviceKey);
        const { data: student } = await admin
          .from("students")
          .select("id")
          .eq("email", user.email.toLowerCase())
          .maybeSingle();
        if (student) {
          redirect("/student/dashboard");
        }
      }
    }
  }

  // Step 2: anonymous or not-yet-enrolled — render the visitor deck as before.
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
