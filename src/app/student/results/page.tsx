// ─────────────────────────────────────────────────────────────────────────
// src/app/student/results/page.tsx — Round-by-round favorites reveal.
//
// Replaces the old top-3-students ceremony. New design:
//   - For each round, shows the photo(s) that received the most favorites.
//   - Ties: if 2+ photos share the top count, all appear.
//   - Comments: only from students who chose that photo as their favorite.
//   - Anonymous throughout — no student names shown.
//
// Auth: gated on game-over. Resolves class via profiles.class_id (matches
// the rest of the student app). Redirects to dashboard if not enrolled,
// not configured, or game not over yet.
//
// RevealCeremony.tsx is NO LONGER NEEDED — this is a single server-
// rendered page. Delete RevealCeremony.tsx from the folder.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { type ClassTiming, isGameOver } from "@/lib/round-timing";

export const dynamic = "force-dynamic";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
};
const F = "'Outfit',sans-serif";

const STARTER_BUCKET = "teacher-deck";

type WinningPhoto = {
  entryId: string;
  publicUrl: string | null;
  description: string | null;
  favoriteCount: number;
  comments: string[];
};

type RoundResult = {
  round: number;
  winners: WinningPhoto[];
};

async function getResults() {
  const supabase = await createClient();
  if (!supabase) return { error: "config" as const };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "no-session" as const };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { error: "config" as const };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Resolve class via profiles.class_id (matches the rest of the student app)
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id ?? null;
  if (!classId) return { error: "not-enrolled" as const };

  // Get class info + timing
  const { data: classRow } = await admin
    .from("classes")
    .select("name, total_rounds, game_starts_at, round_duration_hours")
    .eq("id", classId)
    .single();
  if (!classRow || !classRow.total_rounds) {
    return { error: "not-configured" as const };
  }

  // Gate on game-over
  const timing: ClassTiming = {
    total_rounds: classRow.total_rounds,
    game_starts_at: classRow.game_starts_at,
    round_duration_hours: classRow.round_duration_hours,
  };
  if (!isGameOver(timing)) {
    return { error: "not-over" as const };
  }

  // Get ALL game sessions for this class (all students, all rounds)
  const { data: sessions } = await admin
    .from("game_sessions")
    .select("student_id, round, favorites, comments")
    .eq("class_id", classId);

  if (!sessions || sessions.length === 0) {
    return { error: "no-data" as const };
  }

  // Group sessions by round
  const sessionsByRound = new Map<number, typeof sessions>();
  for (const s of sessions) {
    if (!s.round) continue;
    const arr = sessionsByRound.get(s.round) || [];
    arr.push(s);
    sessionsByRound.set(s.round, arr);
  }

  // For each round, count favorites per entry_id and find the winner(s)
  const allEntryIds = new Set<string>();
  const roundResults: RoundResult[] = [];

  for (let r = 1; r <= classRow.total_rounds; r++) {
    const roundSessions = sessionsByRound.get(r) || [];
    if (roundSessions.length === 0) continue;

    // Count favorites: how many students favorited each entry
    const favCounts = new Map<string, number>();
    // Track comments from students who favorited each entry
    const favoriters = new Map<string, string[]>();

    for (const s of roundSessions) {
      const favs = s.favorites as Record<string, boolean> | null;
      const comments = s.comments as Record<string, string> | null;
      if (!favs) continue;

      for (const [entryId, isFav] of Object.entries(favs)) {
        if (!isFav) continue;
        favCounts.set(entryId, (favCounts.get(entryId) || 0) + 1);
        allEntryIds.add(entryId);

        const comment = comments?.[entryId] || "";
        if (comment) {
          const arr = favoriters.get(entryId) || [];
          arr.push(comment);
          favoriters.set(entryId, arr);
        }
      }
    }

    if (favCounts.size === 0) continue;

    // Find max favorite count
    const maxFavs = Math.max(...favCounts.values());

    // Collect all entries that tied for the top
    const winnerIds = [...favCounts.entries()]
      .filter(([, count]) => count === maxFavs)
      .map(([id]) => id);

    const winners: WinningPhoto[] = winnerIds.map((id) => ({
      entryId: id,
      publicUrl: null,
      description: null,
      favoriteCount: maxFavs,
      comments: favoriters.get(id) || [],
    }));

    roundResults.push({ round: r, winners });
  }

  // Batch-fetch all entry details
  if (allEntryIds.size > 0) {
    const { data: entryRows } = await admin
      .from("entries")
      .select("id, media_url, description_text")
      .in("id", Array.from(allEntryIds));

    const entryMap = new Map<string, { publicUrl: string | null; description: string | null }>();
    for (const e of entryRows || []) {
      let publicUrl: string | null = null;
      if (e.media_url) {
        try {
          const { data } = admin.storage.from(STARTER_BUCKET).getPublicUrl(e.media_url);
          publicUrl = data?.publicUrl ?? null;
        } catch {}
      }
      entryMap.set(e.id, { publicUrl, description: e.description_text });
    }

    for (const rr of roundResults) {
      for (const w of rr.winners) {
        const entry = entryMap.get(w.entryId);
        if (entry) {
          w.publicUrl = entry.publicUrl;
          w.description = entry.description;
        }
      }
    }
  }

  return {
    className: classRow.name,
    totalRounds: classRow.total_rounds,
    roundResults,
  };
}

export default async function ResultsPage() {
  const data = await getResults();

  if ("error" in data) {
    if (data.error === "no-session" || data.error === "not-enrolled" ||
        data.error === "not-over" || data.error === "not-configured") {
      redirect("/student/dashboard");
    }

    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>No results yet</h1>
        <p style={{ color: C.textDim }}>
          Nobody has played yet — check back after the first round.
        </p>
        <Link href="/student/dashboard" style={{ color: C.light, fontSize: 14 }}>
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const { className, roundResults } = data;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <Link href="/student/dashboard"
          style={{ fontSize: 13, color: C.textDim, textDecoration: "underline" }}>
          ← Back to dashboard
        </Link>

        <div style={{ textAlign: "center", margin: "24px 0 36px" }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 6px" }}>
            Spotlight Favorites
          </h1>
          <p style={{ fontSize: 14, color: C.textDim, margin: 0 }}>
            The most loved photos from each round of {className}.
          </p>
        </div>

        {roundResults.length === 0 ? (
          <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`,
            borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: C.textDim, margin: 0 }}>
              No favorites have been cast yet. Check back after a round completes.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {roundResults.map((rr) => (
              <section key={rr.round}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {rr.winners.map((w) => (
                    <div key={w.entryId} style={{
                      background: C.panel,
                      border: `1px solid ${C.panelEdge}`,
                      borderRadius: 16, overflow: "hidden",
                      display: "flex", alignItems: "stretch",
                      flexWrap: "wrap",
                      position: "relative",
                    }}>
                      {/* Round label — upper right corner */}
                      <div style={{ position: "absolute", top: 10, right: 14,
                        fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
                        color: C.light, fontWeight: 700 }}>
                        Round {rr.round}
                        {rr.winners.length > 1 && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: C.textFaint,
                            letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>
                            {rr.winners.length}-way tie
                          </span>
                        )}
                      </div>
                      {/* Left column — photo + description (1/3) */}
                      <div style={{ flex: "0 0 33%", minWidth: 200, display: "flex",
                        flexDirection: "column" }}>
                        {w.publicUrl && (
                          <div style={{ display: "flex", justifyContent: "center",
                            padding: "12px 12px 0" }}>
                            <img src={w.publicUrl} alt=""
                              style={{ width: "70%", maxWidth: 120, aspectRatio: "1",
                                objectFit: "cover", borderRadius: 10,
                                display: "block" }} />
                          </div>
                        )}
                        <div style={{ padding: "12px 14px", flex: 1 }}>
                          {w.description && (
                            <p style={{ fontSize: 13, color: C.text, fontStyle: "italic",
                              lineHeight: 1.5, margin: "0 0 8px",
                              borderLeft: `3px solid ${C.light}`, paddingLeft: 10 }}>
                              &ldquo;{w.description}&rdquo;
                            </p>
                          )}
                          <div style={{ fontSize: 13, color: C.light, fontWeight: 700 }}>
                            ★ {w.favoriteCount} {w.favoriteCount === 1 ? "favorite" : "favorites"}
                          </div>
                        </div>
                      </div>

                      {/* Right column — comments from favoriters (2/3) */}
                      <div style={{ flex: "1 1 0", minWidth: 260, padding: "16px 18px",
                        display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        {w.comments.length > 0 ? (
                          <>
                            <div style={{ fontSize: 11, letterSpacing: 1, fontWeight: 600,
                              color: C.textFaint, textTransform: "uppercase", marginBottom: 8 }}>
                              What they said
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {w.comments.map((comment, i) => (
                                <div key={i} style={{
                                  background: C.bg,
                                  border: `1px solid ${C.panelEdge}`,
                                  borderRadius: 10, padding: "10px 14px",
                                }}>
                                  <p style={{ fontSize: 14, color: C.text, lineHeight: 1.5,
                                    margin: 0 }}>
                                    {comment}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p style={{ fontSize: 13, color: C.textFaint, margin: 0,
                            fontStyle: "italic" }}>
                            Favorited without a comment.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
