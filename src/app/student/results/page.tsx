// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/results/page.tsx   (REPLACES existing file)
//
// Session 63 — U9 dramatic reveal redesign:
//   • Server component fetches game results, passes to client ceremony.
//   • Client component handles sequential round-by-round reveal with
//     countdown, 3rd→2nd→1st place animations, and confetti.
//   • U7: "See the class results" copy (not "see your results").
//   • U6: Awards/ceremony language throughout.
//   • B51: Warm-up round still excluded.
//
// Session 99 — Student continuation CTA:
//   • After the awards gate passes, resolves the teacher who runs this
//     class (teacher_id → profile display_name) and checks whether they
//     have any OTHER recruiting classes. Passes teacherId, teacherName,
//     and teacherHasOpenClasses to ResultsCeremony so the finale can
//     show a "Continue with [teacher] →" button.
//
// D2 (session 84) — Awards gate:
//   • Before rendering the ceremony, checks that ALL favorite comments
//     across ALL rounds for this class have been approved.
//   • If any comments are still pending or rejected, shows a "waiting"
//     page instead of the ceremony. This prevents inappropriate or
//     unreviewed comments from appearing in the awards.
//   • Uses a service-role query to check game_sessions in the student's
//     class for any non-approved favorite_comment_status values.
//
// Round labeling (round-0 convention):
//   game_sessions round 0 = warm-up (teacher starter photos)
//   game_sessions round 1+ = student game rounds
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
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

  // ── D2: Awards gate — all favorite comments must be approved ─────────
  // Before showing the ceremony, verify that every favorite comment across
  // every round in this class has been approved. If any are pending or
  // rejected, the teacher hasn't finished reviewing and the awards can't
  // be shown yet (to prevent unreviewed/inappropriate comments from
  // appearing in the ceremony).
  const awardsGateResult = await checkAwardsGate();
  if (awardsGateResult && !awardsGateResult.clear) {
    return (
      <div style={{
        background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center",
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>
          Almost ready for the awards!
        </h1>
        <p style={{ color: C.textDim, fontSize: 14, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 8px" }}>
          Your teacher is still reviewing comments. The awards ceremony will open once all comments have been approved.
        </p>
        {awardsGateResult.pendingCount > 0 && (
          <p style={{ color: C.textDim, fontSize: 13, margin: "0 0 4px" }}>
            {awardsGateResult.pendingCount} comment{awardsGateResult.pendingCount === 1 ? "" : "s"} awaiting review
          </p>
        )}
        {awardsGateResult.rejectedCount > 0 && (
          <p style={{ color: "#C0392B", fontSize: 13, margin: "0 0 4px" }}>
            {awardsGateResult.rejectedCount} comment{awardsGateResult.rejectedCount === 1 ? "" : "s"} need{awardsGateResult.rejectedCount === 1 ? "s" : ""} resubmission
          </p>
        )}
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

  // ── Session 99: Resolve teacher info for the continuation CTA ────────
  // Find the teacher who runs the student's class, and check whether they
  // have any other recruiting classes the student could continue with.
  const teacherInfo = await resolveTeacherForContinuation();

  return (
    <ResultsCeremony
      rounds={serializedRounds}
      className={className}
      teacherId={teacherInfo?.teacherId ?? null}
      teacherName={teacherInfo?.teacherName ?? null}
      teacherHasOpenClasses={teacherInfo?.hasOpenClasses ?? false}
    />
  );
}

// ── D2: Awards gate — check all favorite comments are approved ────────
// Returns null if Supabase isn't configured or the student isn't logged
// in (let the existing flow handle those). Otherwise returns counts of
// pending/rejected comments. The ceremony only renders when clear=true.
//
// Checks ALL game_sessions with round > 0 (student rounds only — B51)
// in the student's class. A comment is "not clear" if its status is
// 'pending' or 'rejected'. Sessions with no favorite_comment (null) are
// ignored — not every session has one.
async function checkAwardsGate(): Promise<{
  clear: boolean;
  pendingCount: number;
  rejectedCount: number;
} | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const ssr = await createClient();
  if (!ssr) return null;
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return null;

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Resolve the student's class.
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id ?? null;
  if (!classId) return null;

  // Count game_sessions in this class (round > 0) where a favorite
  // comment exists but hasn't been approved yet.
  const { data: sessions } = await admin
    .from("game_sessions")
    .select("favorite_comment_status")
    .eq("class_id", classId)
    .gt("round", 0)
    .not("favorite_comment", "is", null);

  if (!sessions || sessions.length === 0) {
    // No favorite comments at all — gate is clear (nothing to review).
    return { clear: true, pendingCount: 0, rejectedCount: 0 };
  }

  let pendingCount = 0;
  let rejectedCount = 0;
  for (const s of sessions) {
    if (s.favorite_comment_status === "pending") pendingCount++;
    if (s.favorite_comment_status === "rejected") rejectedCount++;
  }

  return {
    clear: pendingCount === 0 && rejectedCount === 0,
    pendingCount,
    rejectedCount,
  };
}

// ── Session 99: Resolve teacher info for the "Continue" CTA ───────────
// Finds the teacher who runs the student's current class, looks up their
// display name, and checks whether they have at least one OTHER class
// that is currently recruiting (so there's somewhere for the student to
// continue). Returns null if anything can't be resolved (Supabase not
// configured, student not logged in, etc.) — the CTA simply won't show.
async function resolveTeacherForContinuation(): Promise<{
  teacherId: string;
  teacherName: string;
  hasOpenClasses: boolean;
} | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const ssr = await createClient();
  if (!ssr) return null;
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return null;

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Get the student's current class
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id ?? null;
  if (!classId) return null;

  // Get the teacher who owns this class
  const { data: cls } = await admin
    .from("classes")
    .select("teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!cls?.teacher_id) return null;

  // Get the teacher's display name
  const { data: teacherProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", cls.teacher_id)
    .maybeSingle();
  const teacherName = teacherProfile?.display_name || "your teacher";

  // Check if the teacher has any recruiting classes (could be at the same
  // or a different level — the student will see options on the profile page)
  const { data: recruitingClasses } = await admin
    .from("classes")
    .select("id")
    .eq("teacher_id", cls.teacher_id)
    .eq("is_recruiting", true)
    .limit(1);
  const hasOpenClasses = (recruitingClasses?.length ?? 0) > 0;

  return {
    teacherId: cls.teacher_id,
    teacherName,
    hasOpenClasses,
  };
}
