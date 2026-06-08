// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/results/page.tsx   (REPLACES existing file)
//
// End-of-game top-three favorites reveal.
//
// v2 STRUCTURE
//   Server fetches the data; a sibling client component (RevealCeremony)
//   handles the multi-screen flow:
//
//     Bronze (if 3 winners) → Silver (if ≥2) → Gold → Finish → /dashboard
//
//   Each screen shows ONE winner with up to N of their favorited entries
//   (N = tier cap: Gold 3, Silver 2, Bronze 1). Each entry shows: photo,
//   the student's description, fav count, and every favoriter's comment +
//   attribution. The cap lives in TypeScript (TIER_CAP) so it can be
//   tuned without a DB migration.
//
// DATA SOURCE
//   class_top_three_reveal(p_class_id) RPC v2. Returns ALL favorited
//   entries per winner ordered by fav_count DESC; this file applies the
//   per-tier cap.
//
// AUTH + GATING
//   Server component. Two clients used deliberately:
//     • User's authenticated cookie client for the RPC call — the RPC's
//       is_enrolled_in() check inspects auth.uid(), which is null on the
//       service-role JWT. Calling as the user lets the check pass.
//     • Service-role admin client for storage signing (mirrors
//       student-archive.ts:365-398).
//   Page-level redirect is the first line of auth: if no session, no
//   current class, or current class isn't over yet, redirect to
//   /student/dashboard.
//
// MEDIA URLs
//   The RPC returns raw storage paths; signed here with the same 1-hour
//   TTL the rest of the app uses.
//
// EDGE CASES
//   • 0 winners            → EmptyState with a single dashboard link.
//   • 1 winner             → ceremony skips straight to Gold (only screen).
//   • 2 winners            → ceremony starts at Silver.
//   • 3 winners            → ceremony starts at Bronze.
//   • Winner with no entries (defensive — total_favorites would have to
//     be 0, which excludes them from top_three) → header only on their
//     screen with a generic message, handled in the client component.
//
// Round-timing helpers are imported from src/lib/round-timing.ts
// (handoff #30 carry-over: extraction complete).
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import RevealCeremony from "./RevealCeremony";
import type { RevealData, ResolvedWinner } from "./RevealCeremony";
import { type ClassTiming, isGameOver } from "@/lib/round-timing";

const MEDIA_BUCKET = "media";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — match student-archive.ts.

// ── Types for the RPC v2 response ───────────────────────────────────────
type CommentFromFavoriter = {
  author_id: string;
  author_name: string;
  author_screen_name: string;
  comment: string;
};

type FavoritedEntry = {
  entry_id: string;
  round: number;
  media_url: string;          // raw storage path (signed before render)
  description_text: string | null;
  fav_count: number;
  comments_from_favoriters: CommentFromFavoriter[];
};

type Winner = {
  placement: number;
  student_id: string;
  student_name: string;
  student_screen_name: string;
  total_favorites: number;
  favorited_entries: FavoritedEntry[];
};

type RevealResponse = {
  class_name: string;
  total_rounds: number;
  winners: Winner[];
};

// Tier caps — Gold sees more of their work, Bronze sees one. Sized so a
// 5-round class has a clear hierarchy without the Gold screen feeling
// crowded. Re-tune here without touching the DB.
const TIER_CAP: Record<number, number> = { 1: 3, 2: 2, 3: 1 };

// ── Color tokens for the error/empty states rendered server-side. ──────
// (Main reveal palette lives in RevealCeremony alongside the layout.)
const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
};
const F = "'Outfit',sans-serif";

export const dynamic = "force-dynamic";

// ── PAGE ────────────────────────────────────────────────────────────────

export default async function ResultsPage() {
  // ── Auth + admin client ──
  const supabase = await createClient();
  if (!supabase) redirect("/student/dashboard");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/student/dashboard");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) redirect("/student/dashboard");
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Resolve current class via profiles.class_id ──
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id ?? null;
  if (!classId) redirect("/student/dashboard");

  // ── Gate on game-over computed from class timing ──
  const { data: classRow } = await admin
    .from("classes")
    .select("total_rounds, game_starts_at, round_duration_hours")
    .eq("id", classId)
    .maybeSingle();
  const timing: ClassTiming = {
    total_rounds: classRow?.total_rounds ?? null,
    game_starts_at: classRow?.game_starts_at ?? null,
    round_duration_hours: classRow?.round_duration_hours ?? null,
  };
  if (!isGameOver(timing)) redirect("/student/dashboard");

  // ── Fetch the reveal data via RPC (user client, NOT admin — see top) ──
  const { data, error } = await supabase.rpc("class_top_three_reveal", {
    p_class_id: classId,
  });
  if (error || !data) {
    console.error("[results] class_top_three_reveal failed", error);
    return <ErrorState />;
  }
  const reveal = data as RevealResponse;

  // ── Sign all media_url paths and apply the tier cap ──
  async function sign(path: string | null): Promise<string | null> {
    if (!path) return null;
    try {
      const { data, error } = await admin.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) {
        console.error(`[results] createSignedUrl failed for ${path}`, error);
        return null;
      }
      return data?.signedUrl ?? null;
    } catch (e) {
      console.error(`[results] createSignedUrl threw for ${path}`, e);
      return null;
    }
  }

  const resolvedWinners: ResolvedWinner[] = await Promise.all(
    reveal.winners.map(async (w) => {
      const cap = TIER_CAP[w.placement] ?? 1;
      const cappedEntries = w.favorited_entries.slice(0, cap);
      const resolvedEntries = await Promise.all(
        cappedEntries.map(async (e) => ({
          entry_id: e.entry_id,
          round: e.round,
          description_text: e.description_text,
          fav_count: e.fav_count,
          comments_from_favoriters: e.comments_from_favoriters,
          signedUrl: await sign(e.media_url),
        })),
      );
      return {
        placement: w.placement,
        student_id: w.student_id,
        student_name: w.student_name,
        student_screen_name: w.student_screen_name,
        total_favorites: w.total_favorites,
        favorited_entries: resolvedEntries,
        truncated: w.favorited_entries.length > cappedEntries.length,
      };
    }),
  );

  if (resolvedWinners.length === 0) {
    return <EmptyState className={reveal.class_name} />;
  }

  const revealData: RevealData = {
    className: reveal.class_name,
    totalRounds: reveal.total_rounds,
    winners: resolvedWinners,
  };

  return <RevealCeremony data={revealData} />;
}

// ── EMPTY + ERROR STATES (server-rendered; no interactivity needed) ────

function EmptyState({ className }: { className: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: F,
        padding: "48px 18px",
      }}
    >
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            fontSize: 12,
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
            fontSize: 26,
            fontWeight: 800,
            margin: "0 0 18px",
            lineHeight: 1.2,
          }}
        >
          {className}
        </h1>
        <section
          style={{
            background: C.panel,
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 16,
            padding: "28px 22px",
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: C.text,
              margin: "0 0 8px",
            }}
          >
            No favorites were recorded this season
          </h2>
          <p
            style={{
              fontSize: 14,
              color: C.textDim,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Once students start favoriting each other&apos;s posts, the top
            three will appear here.
          </p>
        </section>
        <a
          href="/student/dashboard"
          style={{
            fontSize: 14,
            color: C.textDim,
            textDecoration: "none",
            borderBottom: `1px solid ${C.panelEdge}`,
            paddingBottom: 2,
          }}
        >
          ← Back to your dashboard
        </a>
      </div>
    </main>
  );
}

function ErrorState() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: F,
        padding: "48px 18px",
      }}
    >
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: 14,
            color: C.textDim,
            margin: "0 0 24px",
            lineHeight: 1.6,
          }}
        >
          We couldn&apos;t load the results right now. Please try again in a
          moment.
        </p>
        <a
          href="/student/dashboard"
          style={{
            fontSize: 14,
            color: C.textDim,
            textDecoration: "none",
            borderBottom: `1px solid ${C.panelEdge}`,
            paddingBottom: 2,
          }}
        >
          ← Back to your dashboard
        </a>
      </div>
    </main>
  );
}
