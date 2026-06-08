// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/page.tsx — the student profile.
//
// Landing page after the magic link. Two states:
//
//   1. INCOMPLETE — they've just clicked the link but haven't finished
//      joining. Shows the finish-joining form: real name, screen name, an
//      OPTIONAL self-photo, the "why was this your favorite?" note, and the
//      REQUIRED first game entry (a photo of their own + a description) that
//      becomes their first `entries` row at round_number = 1.  Unchanged
//      from #26 — FinishJoiningForm wraps saveProfile via useActionState.
//
//   2. COMPLETE — shows the TWO-BAND ROUND STACK (#27, refined #28)
//      followed by the "Your classes" history strip. The stack replaces
//      the old single "Your photo" card with one slot per Student Round:
//
//        ┌─ LIVE + UPCOMING (top) ─────┐  ascending; the live (current)
//        │  Student Round N  ← live    │  round sits at the TOP of this
//        │  Student Round N+1          │  band so the queue reads top-to-
//        │  Student Round N+2          │  bottom and a round transitioning
//        │  Student Round N+3          │  from upcoming → in-progress
//        └─────────────────────────────┘  doesn't visually jump bands.
//        ┌─ COMPLETED (bottom) ────────┐  condensed <details>; descending
//        │  ▸ Student Round N−1        │  (newest-completed at top of
//        │  ▸ Student Round N−2        │  band); click to expand;
//        │  ▸ Student Round 1          │  Teacher's Warm-up Round always
//        │  ▸ Teacher's Warm-up Round  │  last (the chronological origin).
//        └─────────────────────────────┘
//
//      Filled cards in the top band lay out as image-LEFT + all-text-
//      stacked-RIGHT (pill if live → header + status → description →
//      teacher note → footer with Remove). Uniform 120px image baseline;
//      live card bumps to 140px to signal current without breaking the
//      shared layout grammar (#28, Mike: "all the same... if anything
//      the current should be a little bigger... pic by itself to the
//      left").
//
// "Teacher's Round" is implicit: the teacher's starter content lives in
// the game (accessed via "Go to the game →"). The dashboard explicitly
// labels student rounds as "Student Round N" to make the numbering frame
// obvious. A small intro line above the stack reminds them.
//
// EDGE CASES:
//   • No current class (currentClassTiming == null): skip the stack
//     entirely and show only the history strip.  Rare — should only
//     happen if profiles.class_id got cleared.
//   • Game NOT configured (totalRounds == null): render a single faded
//     "Student Round 1" placeholder.  If the student already has a
//     pre-existing round-1 entry (from finish-joining), show it queued
//     with copy explaining we're waiting for the teacher to set rounds.
//   • Pre-game (configured, but game_starts_at is null or in the future):
//     currentRound == 0 → every slot is in the Upcoming band.  The
//     student can stage their full queue ahead of time.
//   • Game over (currentRound > totalRounds): no Upcoming, no Current;
//     every slot is in Completed (condensed).
//
// SHAPE NOTES (from student-archive.ts):
//   • ownEntries: one entry per Student Round (deduped — most recent
//     upload wins when duplicates exist from pre-#27 data).  Sorted
//     ascending by roundNumber.
//   • currentClassTiming: snapshot with totalRounds, gameStartsAt,
//     roundDurationHours, plus pre-computed currentRound and isGameOver.
//   • OwnEntry now carries teacherNote (#27) so each slot can render the
//     teacher's response inline without a second fetch.
//
// What was removed in #27:
//   • The "Your photo" single-card section (replaced by the slot stack).
//   • The "Add another photo" form under it (each empty Upcoming slot
//     now has its own AddEntryForm scoped to that slot's round).
//   • The "What happens next" footer copy — the new slot stack
//     communicates state on its own; that copy was largely redundant.
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { getStudentArchive, type OwnEntry, type ClassArchive } from "@/lib/student-archive";
import ProfileArchive from "./ProfileArchive";
import FinishJoiningForm from "./FinishJoiningForm";
import AddEntryForm from "./AddEntryForm";
import RemoveEntryButton from "./RemoveEntryButton";

export const dynamic = "force-dynamic";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  // #27 additions
  faded: "#E5DDC8",
  fadedBg: "#F7F0DE",
  liveGreen: "#7A9F5C",
  liveGreenBg: "#E2EFD9",
  liveGreenText: "#3D5A1F",
};
const F = "'Outfit',sans-serif";

// ── Small server-rendered helpers ─────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const pending = status === "pending";
  return (
    <span style={{
      fontSize: 10, letterSpacing: 1.5, fontWeight: 600,
      background: pending ? C.panelEdge : C.liveGreen, color: "#fff",
      padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      {pending ? "AWAITING APPROVAL" : "APPROVED"}
    </span>
  );
}

function SlotHeader({
  roundNumber, status, sideNote,
}: {
  roundNumber: number;
  status?: string;
  sideNote?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      marginBottom: 12,
    }}>
      <h3 style={{
        fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
        color: C.light, margin: 0,
      }}>
        Student Round {roundNumber}
      </h3>
      {status && <StatusBadge status={status} />}
      {sideNote && (
        <span style={{ fontSize: 11, color: C.textDim, letterSpacing: 0.5 }}>
          {sideNote}
        </span>
      )}
    </div>
  );
}

// Block that renders one entry's media + description + (optional) teacher
// note. Reused across all variants (upcoming-filled, current, completed-
// expanded). The "imageSize" prop adjusts thumbnail size for context.
function EntryBody({
  entry, imageSize = 140,
}: {
  entry: OwnEntry;
  imageSize?: number;
}) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {entry.signedUrl ? (
        <img
          src={entry.signedUrl}
          alt=""
          style={{
            width: imageSize, height: imageSize, objectFit: "cover",
            borderRadius: 12, border: `2px solid ${C.light}`, flexShrink: 0,
          }}
        />
      ) : (
        <div style={{
          width: imageSize, height: imageSize, borderRadius: 12,
          border: `2px dashed ${C.panelEdge}`, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, color: C.textFaint, textAlign: "center", padding: 8,
        }}>
          photo unavailable
        </div>
      )}
      <div style={{ flex: 1, minWidth: 220 }}>
        {entry.description_text && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 11, letterSpacing: 1, fontWeight: 600,
              color: C.textFaint, textTransform: "uppercase", marginBottom: 4,
            }}>
              Your description
            </div>
            <p style={{
              fontSize: 14, color: C.text, fontStyle: "italic",
              lineHeight: 1.6, margin: 0,
              borderLeft: `2px solid ${C.light}`, paddingLeft: 12,
            }}>
              &quot;{entry.description_text}&quot;
            </p>
          </div>
        )}
        {entry.teacherNote && (
          <div>
            <div style={{
              fontSize: 11, letterSpacing: 1, fontWeight: 600,
              color: C.textFaint, textTransform: "uppercase", marginBottom: 4,
            }}>
              Your teacher said
            </div>
            <p style={{
              fontSize: 14, color: C.text, lineHeight: 1.6, margin: 0,
              background: C.panelSoft, border: `1px solid ${C.panelEdge}`,
              borderRadius: 8, padding: "8px 12px",
            }}>
              {entry.teacherNote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Outer card chrome shared by Upcoming + Current slots (full-size).
function FullSlotCard({
  children, faded = false,
}: {
  children: React.ReactNode;
  faded?: boolean;
}) {
  return (
    <section style={{
      background: faded ? C.fadedBg : C.panel,
      border: `1px ${faded ? "dashed" : "solid"} ${faded ? C.faded : C.panelEdge}`,
      borderRadius: 16, padding: "20px 22px", marginBottom: 16,
      opacity: faded ? 0.85 : 1,
    }}>
      {children}
    </section>
  );
}

// Filled card for the TOP band (live or queued-upcoming).
//
// Layout (#28 pass 5, Mike's call):
//   ┌──────────────────────────────────────────┐
//   │  ┌────┐  [● LIVE pill if live]           │
//   │  │ IMG│  STUDENT ROUND N                 │
//   │  │    │  [AWAITING APPROVAL]             │
//   │  └────┘  ✕ Remove (if !isLocked)         │
//   │          You can replace this photo …    │
//   │                                          │
//   │  YOUR DESCRIPTION                        │
//   │  "..." — spans full card width           │
//   │                                          │
//   │  YOUR TEACHER SAID                       │
//   │  ... — spans full card width             │
//   └──────────────────────────────────────────┘
//
// The top row pairs the image with COMPACT metadata only (round number,
// status badge, Remove, plus the live pill when applicable) — all short
// fixed-size items that fit in the narrow column next to the image.
// VARIABLE-LENGTH content (description, teacher note) drops below the
// top row and takes the full card width — so long descriptions/notes
// don't get squeezed into a 150-200px column on mobile.  Mike: "if the
// students write a lot- it will take up a lot of space using only one
// column... maybe the round number, the waiting approval and the
// remove next to the pic. and the text that can get longer- namely,
// the description- below it."
//
// Uniform 120px image baseline; live card bumps to 140px to signal
// current without breaking the shared layout grammar.  Completed-
// expanded keeps EntryBody at 120 so the baseline stays uniform.
//
// The pill lives INSIDE the metadata column (rather than as a banner
// above the whole card) so it fills the vertical space next to the
// image instead of adding an extra row of padding.  The green card
// border carries the primary "live" signal; the pill reinforces.
function FilledTopSlotCard({
  entry, isLive, isLocked, imageSize,
}: {
  entry: OwnEntry;
  isLive: boolean;
  isLocked: boolean;
  imageSize: number;
}) {
  return (
    <section style={{
      background: C.panel,
      border: isLive
        ? `2px solid ${C.liveGreen}`
        : `1px solid ${C.panelEdge}`,
      borderRadius: 16, padding: "20px 22px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* TOP ROW — image + compact metadata column */}
        <div style={{
          display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap",
        }}>
          {/* IMAGE */}
          {entry.signedUrl ? (
            <img
              src={entry.signedUrl}
              alt=""
              style={{
                width: imageSize, height: imageSize, objectFit: "cover",
                borderRadius: 12, border: `2px solid ${C.light}`, flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: imageSize, height: imageSize, borderRadius: 12,
              border: `2px dashed ${C.panelEdge}`, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: C.textFaint, textAlign: "center", padding: 8,
            }}>
              photo unavailable
            </div>
          )}

          {/* METADATA COLUMN — pill, round number, badge, remove. All
              short items, stack vertically next to the image. */}
          <div style={{
            flex: 1, minWidth: 0,
            display: "flex", flexDirection: "column",
            alignItems: "flex-start", gap: 10,
          }}>
            {isLive && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: C.liveGreenBg,
                color: C.liveGreenText,
                border: `1px solid ${C.liveGreen}`,
                padding: "4px 12px", borderRadius: 999,
                fontSize: 11, letterSpacing: 2, fontWeight: 700,
                textTransform: "uppercase",
              }}>
                ● Current round — live now
              </div>
            )}
            <h3 style={{
              fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
              color: C.light, margin: 0,
            }}>
              Student Round {entry.roundNumber}
            </h3>
            <StatusBadge status={entry.status} />
            {!isLocked && (
              <>
                <RemoveEntryButton entryId={entry.id} roundNumber={entry.roundNumber} />
                <p style={{
                  fontSize: 11, color: C.textDim, lineHeight: 1.5, margin: 0,
                }}>
                  You can replace this photo until the round starts.
                </p>
              </>
            )}
          </div>
        </div>

        {/* DESCRIPTION — full card width below the top row */}
        {entry.description_text && (
          <div>
            <div style={{
              fontSize: 11, letterSpacing: 1, fontWeight: 600,
              color: C.textFaint, textTransform: "uppercase", marginBottom: 4,
            }}>
              Your description
            </div>
            <p style={{
              fontSize: 14, color: C.text, fontStyle: "italic",
              lineHeight: 1.6, margin: 0,
              borderLeft: `2px solid ${C.light}`, paddingLeft: 12,
              wordBreak: "break-word",
            }}>
              &quot;{entry.description_text}&quot;
            </p>
          </div>
        )}

        {/* TEACHER NOTE — full card width below the description */}
        {entry.teacherNote && (
          <div>
            <div style={{
              fontSize: 11, letterSpacing: 1, fontWeight: 600,
              color: C.textFaint, textTransform: "uppercase", marginBottom: 4,
            }}>
              Your teacher said
            </div>
            <p style={{
              fontSize: 14, color: C.text, lineHeight: 1.6, margin: 0,
              background: C.panelSoft, border: `1px solid ${C.panelEdge}`,
              borderRadius: 8, padding: "8px 12px",
              wordBreak: "break-word",
            }}>
              {entry.teacherNote}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// Body of the Teacher's Warm-up Round dropdown that lives at the bottom
// of the completed band.  Mirrors what ProfileArchive used to show for
// the current class (favorite block + "Your other comments" list), now
// inlined here so all archived rounds for the current class — student
// rounds AND the warm-up — live in one place at the bottom of the slot
// stack.  Past CLASSES still appear in the history strip below.
function WarmupBody({ a }: { a: ClassArchive }) {
  const favorite = a.entries.find((e) => e.isFavorite) || null;
  const others = a.entries.filter((e) => !e.isFavorite);

  return (
    <div style={{ marginTop: 12, paddingTop: 12,
      borderTop: `1px solid ${C.panelEdge}` }}>
      {a.completedAt && (
        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14 }}>
          Completed {new Date(a.completedAt).toLocaleDateString()}
        </div>
      )}

      {favorite && (
        <section style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>
            Your favorite
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start",
            background: C.bg, border: `1px solid ${C.panelEdge}`,
            borderRadius: 12, padding: 12, flexWrap: "wrap" }}>
            {favorite.publicUrl && (
              <img src={favorite.publicUrl} alt=""
                style={{ width: 140, height: 140, objectFit: "cover",
                  borderRadius: 10, border: `2px solid ${C.light}`,
                  flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              {favorite.description_text && (
                <p style={{ fontSize: 13, color: C.text, fontStyle: "italic",
                  margin: "0 0 10px", lineHeight: 1.5,
                  borderLeft: `2px solid ${C.light}`, paddingLeft: 10 }}>
                  &quot;{favorite.description_text}&quot;
                </p>
              )}
              {favorite.comment && (
                <>
                  <div style={{ fontSize: 11, letterSpacing: 1, fontWeight: 600,
                    color: C.textFaint, textTransform: "uppercase",
                    marginBottom: 3 }}>
                    What you said during the game
                  </div>
                  <p style={{ fontSize: 14, color: C.text, margin: "0 0 10px",
                    lineHeight: 1.5 }}>
                    {favorite.comment}
                  </p>
                </>
              )}
              {a.favoriteComment && (
                <>
                  <div style={{ fontSize: 11, letterSpacing: 1, fontWeight: 600,
                    color: C.textFaint, textTransform: "uppercase",
                    marginBottom: 3 }}>
                    Why it was your favorite
                  </div>
                  <p style={{ fontSize: 14, color: C.text, margin: 0,
                    lineHeight: 1.5 }}>
                    {a.favoriteComment}
                  </p>
                </>
              )}
              {favorite.teacherNote && (
                <div style={{ marginTop: 10, paddingTop: 10,
                  borderTop: `1px solid ${C.panelEdge}` }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, fontWeight: 600,
                    color: C.light, textTransform: "uppercase",
                    marginBottom: 3 }}>
                    From your teacher
                  </div>
                  <p style={{ fontSize: 13, color: C.text, margin: 0,
                    lineHeight: 1.5 }}>
                    {favorite.teacherNote}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>
            Your other comments
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {others.map((e) => (
              <div key={e.id} style={{
                display: "flex", gap: 14, alignItems: "flex-start",
                background: C.bg, border: `1px solid ${C.panelEdge}`,
                borderRadius: 12, padding: 12,
              }}>
                {e.publicUrl ? (
                  <img src={e.publicUrl} alt=""
                    style={{
                      width: 70, height: 70, objectFit: "cover",
                      borderRadius: 8, border: `1px solid ${C.panelEdge}`,
                      flexShrink: 0,
                    }} />
                ) : (
                  <div style={{ width: 70, height: 70, borderRadius: 8,
                    flexShrink: 0, background: C.panel,
                    border: `1px solid ${C.panelEdge}` }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {e.description_text && (
                    <p style={{
                      fontSize: 13, color: C.text, fontStyle: "italic",
                      lineHeight: 1.5, margin: "0 0 8px",
                      borderLeft: `2px solid ${C.light}`, paddingLeft: 10,
                      wordBreak: "break-word",
                    }}>
                      &quot;{e.description_text}&quot;
                    </p>
                  )}
                  {e.comment && (
                    <>
                      <div style={{
                        fontSize: 11, letterSpacing: 1, fontWeight: 600,
                        color: C.textFaint, textTransform: "uppercase",
                        marginBottom: 3,
                      }}>
                        What you said during the game
                      </div>
                      <p style={{
                        fontSize: 14, color: C.text, lineHeight: 1.5,
                        margin: 0, wordBreak: "break-word",
                      }}>
                        {e.comment}
                      </p>
                    </>
                  )}
                  {e.teacherNote && (
                    <div style={{
                      marginTop: 10, paddingTop: 10,
                      borderTop: `1px solid ${C.panelEdge}`,
                    }}>
                      <div style={{
                        fontSize: 11, letterSpacing: 1, fontWeight: 600,
                        color: C.light, textTransform: "uppercase",
                        marginBottom: 3,
                      }}>
                        From your teacher
                      </div>
                      <p style={{
                        fontSize: 13, color: C.text, lineHeight: 1.5, margin: 0,
                        wordBreak: "break-word",
                      }}>
                        {e.teacherNote}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function StudentProfile() {
  const data = await getStudentArchive();

  if ("error" in data && data.error === "no-session") {
    redirect("/play");
  }

  if ("error" in data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something&apos;s off</h1>
        <p style={{ color: C.textDim }}>
          {data.error === "not-enrolled"
            ? "We couldn't find your enrollment. Try playing again at /play."
            : data.error}
        </p>
      </div>
    );
  }

  const { student, classes, ownEntries, currentClassTiming } = data;
  const displayName = student.screen_name || student.name || "there";

  const newest = classes[0] || null;
  const newestFavorite = newest?.entries.find((e) => e.isFavorite) || null;

  const isComplete = !!(student.name && student.screen_name && newest?.favoriteComment);

  // ── INCOMPLETE: finish-joining form ──────────────────────────────────
  if (!isComplete) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
        fontFamily: F, color: C.text }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>
            Finish joining
          </h1>
          <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: "0 0 24px" }}>
            You&apos;re almost in. This is your profile — the home base for the class.
            Each round you&apos;ll look at a set of photos, write about them, and add one
            of your own; everything you and your teacher write stacks up here over
            time. First, a couple of things:
          </p>

          <FinishJoiningForm
            studentName={student.name}
            studentScreenName={student.screen_name}
            newestFavorite={newestFavorite ? {
              publicUrl: newestFavorite.publicUrl,
              description_text: newestFavorite.description_text,
            } : null}
          />
        </div>
      </div>
    );
  }

  // ── COMPLETE: three-band slot stack ──────────────────────────────────

  // Index entries by round for O(1) lookup while we partition slots.
  const entryByRound = new Map<number, OwnEntry>();
  for (const e of ownEntries) entryByRound.set(e.roundNumber, e);

  // Number of slots to render in the stack.
  //   • If totalRounds is set: that many, OR however many filled rounds
  //     the student has (whichever is greater). The "greater" branch covers
  //     OVERAGE — e.g. student staged 7 entries in unconfigured state, then
  //     teacher set total_rounds = 5; we still render slots 6 and 7 so the
  //     student doesn't lose visual track of their photos. addEntry still
  //     rejects new uploads beyond total_rounds.
  //   • If totalRounds is null (unconfigured): render existing filled
  //     rounds plus ONE empty upload slot at the end, so the student can
  //     keep staging entries while waiting for the teacher to configure.
  const totalRounds = currentClassTiming?.totalRounds ?? null;
  const currentRound = currentClassTiming?.currentRound ?? 0;
  const isGameOver = currentClassTiming?.isGameOver ?? false;
  const isUnconfigured = currentClassTiming !== null && totalRounds === null;
  const maxFilledRound = ownEntries.length > 0
    ? Math.max(...ownEntries.map((e) => e.roundNumber))
    : 0;
  const numSlots = totalRounds !== null
    ? Math.max(totalRounds, maxFilledRound)
    : Math.max(1, maxFilledRound + 1);

  // Partition rounds into TOP (live + upcoming) and BOTTOM (completed).
  // #27 layout pass 2 (Mike's call): the LIVE round stays at the top
  // alongside upcoming rounds, in ascending order — so the queue reads
  // top-to-bottom and a round transitioning from upcoming → in-progress
  // doesn't visually jump to a middle band.  Rounds only fall to the
  // bottom band once they're FULLY complete (the next round has started).
  // Newest-completed nearest the top of the bottom band.
  const topRounds: number[] = [];
  const completedRounds: number[] = [];
  for (let r = 1; r <= numSlots; r++) {
    if (currentRound > 0 && r < currentRound) {
      completedRounds.push(r);
    } else {
      topRounds.push(r);
    }
  }
  completedRounds.reverse();

  // Locate the current class's archive (for the Teacher's Warm-up Round
  // entry at the bottom of the completed band) and the past classes set
  // (passed to the history strip).  Filtering the current class OUT of
  // ProfileArchive avoids duplicating warm-up content — it lives in the
  // slot stack's completed band now.
  const currentClass = classes.find((c) => c.isCurrent) ?? null;
  const pastClasses = classes.filter((c) => !c.isCurrent);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* ── HEADER ──
            Greeting + status line both swap to a completion message when
            the game is over.  "Well done" + "You've completed the class"
            is the right tone for a wrap-up moment — the student finished
            a multi-day classroom game; treat it like an accomplishment,
            not just a state change. */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%",
            background: C.panelEdge, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 28, color: "#fff" }}>
            {displayName[0]?.toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px" }}>
              {isGameOver
                ? `Well done, ${displayName}.`
                : `Welcome, ${displayName}.`}
            </h1>
            <div style={{ fontSize: 13, color: C.textDim }}>
              {isGameOver
                ? "You've completed the class."
                : (classes.length > 1
                    ? `You're in ${classes.length} classes.`
                    : "You're in the class.")}
            </div>
          </div>
        </div>

        {/* ── GO TO THE GAME ──
            Hidden once the game is over.  /student/play shows "waiting on
            classmates" copy that's nonsensical post-completion; the right
            destination at game-end is a results/reveal page, but that
            doesn't exist yet (see end-of-game-reveal design — separate
            future slice).  Hiding entirely is the cleanest interim.  When
            the reveal lands, this button comes back with new copy + href
            (e.g. "See final results →" → /student/results). */}
        {!isGameOver && (
          <a
            href="/student/play"
            style={{ display: "block", textAlign: "center", textDecoration: "none",
              width: "100%", boxSizing: "border-box", padding: "13px",
              fontFamily: F, fontSize: 15, fontWeight: 700, background: C.light,
              color: "#fff", border: "none", borderRadius: 12, letterSpacing: 0.5,
              marginBottom: 28 }}
          >
            Go to the game →
          </a>
        )}

        {/* ── ROUND STACK (#27) ──
            Only rendered when the student has a current class. The teacher's
            round is implicit — accessed via the "Go to the game →" button
            above. */}
        {currentClassTiming && (
          <>
            {/* "Your rounds" header + preamble is instructional copy for
                ACTIVE play — explains the slot mechanics to a student who
                still has rounds to play.  When the game is OVER, every
                slot is in the Completed band (which has its own header
                below) and the game-complete banner at the bottom of the
                stack provides closure.  Showing "After your teacher's
                round, these are yours. Add a photo..." post-completion
                reads as stale instructions.  Hide both header and copy. */}
            {!isGameOver && (
              <>
                <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
                  color: C.light, marginBottom: 6 }}>
                  Your rounds
                </h2>
                <p style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6,
                  margin: "0 0 18px" }}>
                  After your teacher&apos;s round, these are yours. Add a photo to each
                  slot before its round starts — once a round begins, that slot is
                  locked in.
                </p>
              </>
            )}

            {/* Unconfigured notice — sits ABOVE the regular slot stack.
                The slots themselves render via the Upcoming band below;
                in unconfigured state, currentRound is 0 (no game_starts_at),
                so every slot is Upcoming. The student can keep staging
                uploads via the trailing empty slot. */}
            {isUnconfigured && (
              <div style={{
                background: C.fadedBg,
                border: `1px dashed ${C.faded}`,
                borderRadius: 12, padding: "12px 16px", marginBottom: 14,
                fontSize: 13, color: C.textDim, lineHeight: 1.6,
              }}>
                Your teacher hasn&apos;t set the rounds yet. You can keep
                adding photos here — they&apos;ll line up with your Student
                Rounds once the teacher configures the game.
              </div>
            )}

            {/* ── TOP band — live + upcoming, ascending ──
                The live (current) round, if any, sits at the top alongside
                upcoming rounds rather than in a middle band of its own,
                so the queue reads top-to-bottom and a round transitioning
                from upcoming → in-progress doesn't visually jump.
                  • Filled + unlocked → full card with image + description
                    + ✕ Remove.
                  • Filled + live (locked) → full card with image +
                    description + teacher note + prominent CURRENT ROUND
                    indicator; no remove.
                  • Empty + live (locked) → full card with "you didn't add
                    a photo" notice.
                  • Empty + unlocked → COMPACT collapsed <details> showing
                    just "Student Round N — + Add photo".  Click to reveal
                    the AddEntryForm inline.  All empty unlocked slots
                    collapse so the dashboard stays scannable when many
                    rounds are open at once. */}
            {topRounds.map((r) => {
              const entry = entryByRound.get(r);
              const isLocked = currentRound > 0 && r <= currentRound;
              const isLive = r === currentRound && currentRound > 0;

              if (entry) {
                return (
                  <FilledTopSlotCard
                    key={`top-${r}`}
                    entry={entry}
                    isLive={isLive}
                    isLocked={isLocked}
                    imageSize={isLive ? 140 : 120}
                  />
                );
              }

              if (isLive) {
                return (
                  <section
                    key={`top-${r}`}
                    style={{
                      background: C.panel,
                      border: `2px solid ${C.liveGreen}`,
                      borderRadius: 16, padding: "20px 22px", marginBottom: 16,
                    }}
                  >
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      background: C.liveGreenBg,
                      color: C.liveGreenText,
                      border: `1px solid ${C.liveGreen}`,
                      padding: "4px 12px", borderRadius: 999,
                      fontSize: 11, letterSpacing: 2, fontWeight: 700,
                      textTransform: "uppercase", marginBottom: 12,
                    }}>
                      ● Current round — live now
                    </div>
                    <SlotHeader roundNumber={r} />
                    <p style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6,
                      margin: 0 }}>
                      You didn&apos;t add a photo for this round. The slot is
                      locked now — your next chance is Student Round {r + 1}.
                    </p>
                  </section>
                );
              }

              // Empty + unlocked → compact collapsed dropdown.
              return (
                <details key={`top-${r}`} style={{
                  background: C.panel,
                  border: `1px solid ${C.panelEdge}`,
                  borderRadius: 12, marginBottom: 10,
                }}>
                  <summary style={{
                    cursor: "pointer", listStyle: "none",
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px",
                  }}>
                    <span style={{
                      fontSize: 12, letterSpacing: 1.5,
                      textTransform: "uppercase",
                      fontWeight: 700, color: C.light,
                    }}>
                      Student Round {r}
                    </span>
                    <span style={{ fontSize: 13, color: C.textDim, flex: 1 }}>
                      + Add photo
                    </span>
                    <span style={{ fontSize: 14, color: C.textDim }}>▸</span>
                  </summary>
                  <div style={{ padding: "0 16px 16px" }}>
                    <AddEntryForm roundNumber={r} />
                  </div>
                </details>
              );
            })}

            {/* ── COMPLETED band ──
                Condensed dropdowns for fully-completed Student Rounds
                (newest-first, nearest the top of the band), plus the
                Teacher's Warm-up Round at the very bottom — the warm-up
                is chronologically the FIRST archived event but sits below
                the student rounds so the band reads "most recent ↓
                older ↓ origin."  The warm-up moved here from the history
                strip; past CLASSES still appear in the strip below. */}
            {(completedRounds.length > 0 ||
              (currentClass && currentClass.entries.length > 0)) && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{
                  fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
                  color: C.textDim, marginBottom: 10,
                }}>
                  Completed rounds
                </h3>

                {completedRounds.map((r) => {
                  const entry = entryByRound.get(r);
                  return (
                    <details key={`completed-${r}`} style={{
                      background: C.panelSoft,
                      border: `1px solid ${C.panelEdge}`,
                      borderRadius: 12, padding: "10px 14px", marginBottom: 8,
                    }}>
                      <summary style={{
                        cursor: "pointer", listStyle: "revert",
                        display: "flex", alignItems: "center", gap: 12,
                        flexWrap: "wrap",
                      }}>
                        {entry?.signedUrl ? (
                          <img src={entry.signedUrl} alt=""
                            style={{
                              width: 44, height: 44, objectFit: "cover",
                              borderRadius: 8,
                              border: `1px solid ${C.panelEdge}`,
                              flexShrink: 0,
                            }} />
                        ) : (
                          <div style={{
                            width: 44, height: 44, borderRadius: 8,
                            border: `1px dashed ${C.panelEdge}`, flexShrink: 0,
                            display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 10,
                            color: C.textFaint, textAlign: "center",
                          }}>
                            no pic
                          </div>
                        )}
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: C.text,
                        }}>
                          Student Round {r}
                        </span>
                        {entry && <StatusBadge status={entry.status} />}
                        {!entry && (
                          <span style={{ fontSize: 11, color: C.textFaint,
                            letterSpacing: 0.5 }}>
                            no photo submitted
                          </span>
                        )}
                      </summary>
                      <div style={{ marginTop: 12, paddingTop: 12,
                        borderTop: `1px solid ${C.panelEdge}` }}>
                        {entry ? (
                          <EntryBody entry={entry} imageSize={120} />
                        ) : (
                          <p style={{ fontSize: 12, color: C.textDim,
                            lineHeight: 1.6, margin: 0 }}>
                            No photo was submitted for this round.
                          </p>
                        )}
                      </div>
                    </details>
                  );
                })}

                {/* Teacher's Warm-up Round — at the very bottom. */}
                {currentClass && currentClass.entries.length > 0 && (
                  <details style={{
                    background: C.panelSoft,
                    border: `1px solid ${C.panelEdge}`,
                    borderRadius: 12, padding: "10px 14px", marginBottom: 8,
                  }}>
                    <summary style={{
                      cursor: "pointer", listStyle: "revert",
                      display: "flex", alignItems: "center", gap: 12,
                      flexWrap: "wrap",
                    }}>
                      {currentClass.favoriteThumb ? (
                        <img src={currentClass.favoriteThumb} alt=""
                          style={{
                            width: 44, height: 44, objectFit: "cover",
                            borderRadius: 8,
                            border: `1px solid ${C.panelEdge}`,
                            flexShrink: 0,
                          }} />
                      ) : (
                        <div style={{
                          width: 44, height: 44, borderRadius: 8,
                          background: C.panelEdge, flexShrink: 0,
                        }} />
                      )}
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: C.text,
                      }}>
                        Teacher&apos;s Warm-up Round
                      </span>
                    </summary>
                    <WarmupBody a={currentClass} />
                  </details>
                )}
              </div>
            )}

            {/* End-of-game CTA — routes to the top-3 favorites reveal.
                The reveal page itself is a separate future slice (full
                design is locked: top 3 students by total favorites
                received, with podium + per-student panels for posted pic
                and own taste).  /student/results will 404 until that
                slice lands.  Comment retained to make the dependency
                explicit so it doesn't get lost.
                The "game is complete" status banner was dropped here —
                the new "You've completed the class" subtitle at the top
                conveys the same status, and the button itself serves as
                a clear end-of-stack marker. */}
            {isGameOver && (
              <a
                href="/student/results"
                style={{ display: "block", textAlign: "center", textDecoration: "none",
                  width: "100%", boxSizing: "border-box", padding: "13px",
                  fontFamily: F, fontSize: 15, fontWeight: 700, background: C.light,
                  color: "#fff", border: "none", borderRadius: 12, letterSpacing: 0.5,
                  marginTop: 18 }}
              >
                See the 3 most favorited students →
              </a>
            )}
          </>
        )}

        {/* ── YOUR CLASSES (history strip) ──
            Past classes only.  The current class's warm-up content moved
            to the slot stack's Completed band (Teacher's Warm-up Round
            button) so all archived rounds for the current class live in
            one place.  If there are no past classes, this section hides
            entirely. */}
        {pastClasses.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
              color: C.light, marginBottom: 12 }}>
              {pastClasses.length > 1 ? "Past classes" : "Past class"}
            </h2>
            <ProfileArchive classes={pastClasses} />
          </div>
        )}
      </div>
    </div>
  );
}
