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
//        ┌─ COMPLETED (bottom) ────────┐  ascending (1, 2, 3 …) — the
//        │  ▸ Student Round 1          │  order they were completed.
//        │  ▸ Student Round 2          │
//        │  ▸ Student Round N−1        │
//        └─────────────────────────────┘
//
//      Teacher's Warm-up Round sits at the very bottom of the page,
//      below the results button and the spreadsheet download button.
//
//      Filled cards in the top band lay out as image-LEFT + all-text-
//      stacked-RIGHT (pill if live → header + status → description →
//      teacher note → footer with Remove). Uniform 120px image baseline;
//      live card bumps to 140px to signal current without breaking the
//      shared layout grammar (#28).
//
// #34 APPROVAL UX:
//   - Approved entries (status='live'): Remove button is hidden. The
//     existing "APPROVED" badge is the only affordance — the student
//     can't replace an approved photo.
//   - Rejected entries (status='rejected'): shows the teacher's note
//     in a rejection notice box. Remove button stays so the student can
//     delete and re-upload a different photo.
//   - Pending entries: unchanged — Remove + "you can replace" text.
//
// #35 TEACHER NOTE UNIFICATION:
//   Teacher notes now come from teacher_comments (via teacherNote) for
//   both approve and reject. For backward compat with older entries that
//   have rejection_reason on the entries table, the rejection box uses
//   teacherNote || rejectionReason as a fallback chain. The normal
//   "Your teacher said" section is suppressed for rejected entries to
//   prevent double-display.
//
// #35 LAYOUT FIXES (Chunk 1):
//   L1 — Completed rounds now ascending (1, 2, 3 …) instead of descending.
//   L2 — Teacher's Warm-up Round moved to the very bottom of the page.
//   L3 — Results button text: "See who got the most favorite votes in
//         each round →".
//
// B2 (#41): CLASSMATE COMMENTS IN COMPLETED ROUNDS
//   Each completed student round now shows the entries the student
//   commented on during that round (photos + descriptions + their
//   comment text). The favorite is shown first with a small label.
//   This data comes from the new roundSessions field in the archive.
//
// B23 (#47): REJECTION/RESUBMISSION WORKFLOW
//   - "Action needed" alert at top of dashboard when any entry or
//     favorite comment has status='rejected'.
//   - Rejected entries show ResubmitEntryForm (edit photo + desc).
//   - Rejected favorite comments show ResubmitFavoriteCommentForm.
//   - B24b: "Go to the game" button shows warning when any entry
//     in the current round is rejected.
//
// B51 (Session 57): POST-GAME STATE
//   - Primary CTA switches from "Go to the game" → "🏆 See the class results"
//     when isGameOver is true. Students can relive their glory.
//   - Old results link removed from further down the page (no duplicate).
//
// Session 63:
//   B66: "your next chance is Round N+1" no longer shows Round 4 when
//        totalRounds is 3 (or null). Three-way branch: awards message if
//        on the final round, next-round message if more exist, generic
//        fallback if totalRounds is unknown.
// ─────────────────────────────────────────────────────────────────────────
import { getStudentArchive, type OwnEntry, type ClassArchive, type RoundSessionData } from "@/lib/student-archive";
import ProfileArchive from "./ProfileArchive";
import FinishJoiningForm from "./FinishJoiningForm";
import AddEntryForm from "./AddEntryForm";
import RemoveEntryButton from "./RemoveEntryButton";
import ResubmitEntryForm from "./ResubmitEntryForm";
import ResubmitFavoriteCommentForm from "./ResubmitFavoriteCommentForm";
import RequestMagicLinkForm from "./RequestMagicLinkForm";
import AutoRefresh from "./AutoRefresh";
import { StudentDashboardCsvButton } from "./csv-button";

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
  // #34 additions
  danger: "#C04030",
  dangerBg: "#FCEAE8",
};
const F = "'Outfit',sans-serif";

// ── Small server-rendered helpers ─────────────────────────────────────────

// #34: three-state badge — pending, approved, rejected.
function StatusBadge({ status }: { status: string }) {
  if (status === "rejected") {
    return (
      <span style={{
        fontSize: 10, letterSpacing: 1.5, fontWeight: 600,
        background: C.danger, color: "#fff",
        padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap",
      }}>
        NOT APPROVED
      </span>
    );
  }
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
// #34: approval-aware affordances:
//   - status='live' (approved) → no Remove button, badge says APPROVED
//   - status='rejected'        → shows teacher note in rejection context, Remove stays
//   - status='pending'         → Remove + "you can replace" (unchanged)
//
// #35: teacher note display unified — rejection box uses
//   teacherNote || rejectionReason (backward compat for old entries that
//   only have rejection_reason on the entries table). Normal teacher-note
//   section is suppressed for rejected entries to avoid showing the same
//   text twice.
function FilledTopSlotCard({
  entry, isLive, isLocked, imageSize,
}: {
  entry: OwnEntry;
  isLive: boolean;
  isLocked: boolean;
  imageSize: number;
}) {
  // Unified teacher feedback text — prefers teacher_comments (teacherNote),
  // falls back to entries.rejection_reason for older data.
  const rejectionFeedback = entry.teacherNote || entry.rejectionReason;

  // Layout (post Mike's "tighten and spread horizontally" pass): the card is
  // now one horizontal row — image on the left, ALL metadata (badge, header,
  // status, description, teacher note, action affordances) stacked in the
  // right column. Previously description + teacher note hung below the row
  // as full-width blocks, making the card unnecessarily tall when both the
  // photo and the description were short. With everything on the right, the
  // card's height is whichever-column-is-taller, and on a typical live tile
  // (image + 2-line description) that's roughly the image height — much
  // shorter than before.
  return (
    <section style={{
      background: C.panel,
      border: isLive
        ? `2px solid ${C.liveGreen}`
        : entry.status === "rejected"
          ? `2px solid ${C.danger}`
          : `1px solid ${C.panelEdge}`,
      borderRadius: 16, padding: "20px 22px", marginBottom: 16,
    }}>
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

        {/* RIGHT COLUMN — everything else, top to bottom */}
        <div style={{
          flex: 1, minWidth: 200,
          display: "flex", flexDirection: "column",
          alignItems: "flex-start", gap: 8,
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
          <div style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <h3 style={{
              fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
              color: C.light, margin: 0,
            }}>
              Student Round {entry.roundNumber}
            </h3>
            <StatusBadge status={entry.status} />
          </div>

          {/* DESCRIPTION — moved into the right column.
              B27 (#48): suppressed for rejected entries — description is
              rendered in the Action needed waiting room above. */}
          {entry.status !== "rejected" && entry.description_text && (
            <div style={{ marginTop: 2 }}>
              <div style={{
                fontSize: 11, letterSpacing: 1, fontWeight: 600,
                color: C.textFaint, textTransform: "uppercase", marginBottom: 4,
              }}>
                Your description
              </div>
              <p style={{
                fontSize: 13, color: C.text, fontStyle: "italic",
                lineHeight: 1.5, margin: 0,
                borderLeft: `2px solid ${C.light}`, paddingLeft: 10,
                wordBreak: "break-word",
              }}>
                &quot;{entry.description_text}&quot;
              </p>
            </div>
          )}

          {/* TEACHER NOTE — moved into the right column.
              #35: suppressed for rejected entries to avoid double-display
              (the rejection box above already shows the teacher's feedback). */}
          {entry.status !== "rejected" && entry.teacherNote && (
            <div style={{ marginTop: 2, alignSelf: "stretch" }}>
              <div style={{
                fontSize: 11, letterSpacing: 1, fontWeight: 600,
                color: C.textFaint, textTransform: "uppercase", marginBottom: 4,
              }}>
                Your teacher said
              </div>
              <p style={{
                fontSize: 13, color: C.text, lineHeight: 1.5, margin: 0,
                background: C.panelSoft, border: `1px solid ${C.panelEdge}`,
                borderRadius: 8, padding: "6px 10px",
                wordBreak: "break-word",
              }}>
                {entry.teacherNote}
              </p>
            </div>
          )}

          {/* ACTION AFFORDANCES — pointer to waiting room (rejected), or
              Remove + replace help (pending + unlocked). For approved/live
              entries: nothing — the APPROVED badge is the only affordance.
              B29 (#48): for rejected, the full resubmit context lives in
              the Action needed section above the round cards. */}
          {entry.status === "rejected" ? (
            <p style={{
              fontSize: 12, color: C.danger, fontWeight: 600,
              lineHeight: 1.5, margin: "2px 0 0",
            }}>
              ↑ Edit and resubmit in the Action needed section above.
            </p>
          ) : entry.status === "live" ? null : !isLocked ? (
            <>
              <RemoveEntryButton entryId={entry.id} roundNumber={entry.roundNumber} />
              <p style={{
                fontSize: 11, color: C.textDim, lineHeight: 1.5, margin: 0,
              }}>
                You can replace this photo until the round starts.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// Body of the Teacher's Warm-up Round dropdown that lives at the bottom
// of the page (below results + spreadsheet buttons).
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
              {/* #39: Favorite comment moderation status */}
              {a.favoriteCommentStatus && (
                <div style={{ marginTop: 10 }}>
                  <span style={{
                    fontSize: 10, letterSpacing: 1.5, fontWeight: 600,
                    color: "#fff",
                    background: a.favoriteCommentStatus === "approved"
                      ? C.liveGreen
                      : a.favoriteCommentStatus === "rejected"
                        ? C.danger
                        : C.panelEdge,
                    padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap",
                  }}>
                    {a.favoriteCommentStatus === "approved"
                      ? "APPROVED"
                      : a.favoriteCommentStatus === "rejected"
                        ? "NOT APPROVED"
                        : "AWAITING APPROVAL"}
                  </span>
                </div>
              )}
              {a.favoriteCommentStatus === "rejected" && a.favoriteCommentRejectionReason && (
                <div style={{
                  marginTop: 8,
                  background: C.dangerBg,
                  border: `1px solid ${C.danger}44`,
                  borderRadius: 8, padding: "8px 12px",
                }}>
                  <div style={{
                    fontSize: 11, letterSpacing: 1, fontWeight: 600,
                    color: C.danger, textTransform: "uppercase", marginBottom: 4,
                  }}>
                    Your teacher said
                  </div>
                  <p style={{
                    fontSize: 13, color: C.text, lineHeight: 1.5, margin: 0,
                    wordBreak: "break-word",
                  }}>
                    {a.favoriteCommentRejectionReason}
                  </p>
                </div>
              )}
              {/* B23 → #49: Resubmit form moved to the "Action needed"
                  waiting room at the top of the dashboard. Show a pointer. */}
              {a.favoriteCommentStatus === "rejected" && (
                <p style={{
                  fontSize: 12, color: C.danger, fontWeight: 600,
                  lineHeight: 1.5, margin: "8px 0 0",
                }}>
                  ↑ Edit and resubmit in the Action needed section above.
                </p>
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
    // B53: instead of redirect("/play"), show a sign-in form right here.
    // The dashboard is the single hub — handles every state including
    // "not signed in." Students who need to enroll get a link to /play.
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
        fontFamily: F, color: C.text }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🔦</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>
              Welcome to Spotlight
            </h1>
            <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: 0 }}>
              Enter the email you used to join your class and we&apos;ll send you
              a sign-in link. No password needed.
            </p>
          </div>
          <RequestMagicLinkForm />
        </div>
      </div>
    );
  }

  if ("error" in data) {
    // Session 72: teacher/admin signed in on a student route.
    if (data.error === "teacher-account") {
      return (
        <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
          fontFamily: F, color: C.text, textAlign: "center" }}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>You&apos;re signed in as a teacher</h1>
          <p style={{ color: C.textDim, maxWidth: 420, margin: "0 auto 20px" }}>
            This page is for students. You&apos;re currently signed in with your
            teacher account. To get to your teacher dashboard, use the link below.
            If you meant to sign in as a student, sign out first and use your
            student email.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <a href="/teacher/deck" style={{
              display: "inline-block",
              background: C.light, color: "#fff",
              padding: "12px 24px", borderRadius: 10,
              fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}>
              Go to teacher dashboard →
            </a>
            <a href="/login" style={{
              fontSize: 13, color: C.textDim, textDecoration: "underline",
            }}>
              Sign out and switch accounts
            </a>
          </div>
        </div>
      );
    }

    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something&apos;s off</h1>
        <p style={{ color: C.textDim }}>
          {data.error === "not-enrolled"
            ? "You're signed in, but we couldn't find your enrollment. You may need to play the warm-up round first to join a class."
            : data.error}
        </p>
        {data.error === "not-enrolled" && (
          <a href="/play" style={{
            display: "inline-block", marginTop: 16,
            background: C.light, color: "#fff",
            padding: "12px 24px", borderRadius: 10,
            fontSize: 14, fontWeight: 700, textDecoration: "none",
          }}>
            Play the warm-up round →
          </a>
        )}
      </div>
    );
  }

  const { student, classes, ownEntries, currentClassTiming, roundSessions } = data;
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

  const entryByRound = new Map<number, OwnEntry>();
  for (const e of ownEntries) entryByRound.set(e.roundNumber, e);

  // B2 (#41): map student round number → session data for classmate comments.
  const sessionByRound = new Map<number, RoundSessionData>();
  for (const s of roundSessions) sessionByRound.set(s.roundNumber, s);

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

  const topRounds: number[] = [];
  const completedRounds: number[] = [];
  for (let r = 1; r <= numSlots; r++) {
    if (currentRound > 0 && r < currentRound) {
      completedRounds.push(r);
    } else if (currentRound > 0 && r === currentRound && sessionByRound.has(r)) {
      // B61: student already played this round — treat as completed so the
      // dashboard condenses it instead of showing the full "LIVE NOW" card.
      completedRounds.push(r);
    } else {
      topRounds.push(r);
    }
  }
  // #35 L1: ascending order (1, 2, 3 …) — the order they were completed.

  const currentClass = classes.find((c) => c.isCurrent) ?? null;
  const pastClasses = classes.filter((c) => !c.isCurrent);

  // B23 (#47): detect rejected items for action-needed alert + B24b.
  const rejectedEntries = ownEntries.filter((e) => e.status === "rejected");
  const hasRejectedEntries = rejectedEntries.length > 0;
  // B73 (session 73): also detect rejected round-level favorite comments.
  const rejectedRoundFavorites = roundSessions.filter(
    (s) => s.favoriteCommentStatus === "rejected",
  );
  const hasRejectedWarmupFavorite =
    currentClass?.favoriteCommentStatus === "rejected";
  const hasRejectedFavoriteComment =
    hasRejectedWarmupFavorite || rejectedRoundFavorites.length > 0;
  const hasActionNeeded = hasRejectedEntries || hasRejectedFavoriteComment;
  // B24b: is the CURRENT round's entry rejected?
  const currentRoundEntry = currentRound > 0 ? entryByRound.get(currentRound) : null;
  const currentRoundRejected = currentRoundEntry?.status === "rejected";

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        .round-toggle .when-open { display: none; }
        .round-toggle[open] .when-closed { display: none; }
        .round-toggle[open] .when-open { display: inline; }
        .round-toggle summary { list-style: none; }
        .round-toggle summary::-webkit-details-marker { display: none; }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <AutoRefresh />

        {/* ── HEADER ── */}
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

        {/* ── ACTION NEEDED — "waiting room" for rejected items ──
             Mirrors the teacher dashboard pattern: rejected photos and
             comments are surfaced here at the top of the page in their
             own subsections, outside the round containers they belong to.
             The round cards and warm-up section below show a brief
             "see above" note instead of duplicating the resubmit forms. */}
        {hasActionNeeded && !isGameOver && (
          <div style={{
            background: C.dangerBg,
            border: `2px solid ${C.danger}`,
            borderRadius: 16,
            padding: "18px 20px",
            marginBottom: 20,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              marginBottom: 16,
            }}>
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
              <div style={{
                fontSize: 15, fontWeight: 700, color: C.danger,
              }}>
                Action needed
              </div>
            </div>

            {/* ── Rejected photo submittals ── */}
            {hasRejectedEntries && (
              <div style={{ marginBottom: hasRejectedFavoriteComment ? 18 : 0 }}>
                <div style={{
                  fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  color: C.danger, textTransform: "uppercase",
                  marginBottom: 10,
                }}>
                  Photo submittal{rejectedEntries.length > 1 ? "s" : ""} sent back ({rejectedEntries.length})
                </div>

                {rejectedEntries.map((entry) => {
                  const rejectionFeedback = entry.teacherNote || entry.rejectionReason;
                  return (
                    <div key={entry.id} style={{
                      background: "#fff",
                      border: `1px solid ${C.panelEdge}`,
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 10,
                    }}>
                      <div style={{
                        display: "flex", gap: 14, alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}>
                        {/* Thumbnail */}
                        {entry.signedUrl ? (
                          <img src={entry.signedUrl} alt="" style={{
                            width: 80, height: 80, objectFit: "cover",
                            borderRadius: 10, border: `1px solid ${C.panelEdge}`,
                            flexShrink: 0,
                          }} />
                        ) : (
                          <div style={{
                            width: 80, height: 80, borderRadius: 10,
                            border: `1px dashed ${C.panelEdge}`, flexShrink: 0,
                            display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 10,
                            color: C.textFaint,
                          }}>
                            no photo
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 700, color: C.light,
                            letterSpacing: 1, textTransform: "uppercase",
                            marginBottom: 6,
                          }}>
                            Round {entry.roundNumber}
                          </div>

                          {/* What you wrote */}
                          {entry.description_text && (
                            <p style={{
                              fontSize: 13, color: C.text, fontStyle: "italic",
                              lineHeight: 1.4, margin: "0 0 8px",
                              wordBreak: "break-word",
                            }}>
                              &quot;{entry.description_text}&quot;
                            </p>
                          )}

                          {/* Teacher feedback */}
                          {rejectionFeedback && (
                            <div style={{
                              background: C.dangerBg,
                              border: `1px solid ${C.danger}44`,
                              borderRadius: 8, padding: "6px 10px",
                              marginBottom: 8,
                            }}>
                              <div style={{
                                fontSize: 10, letterSpacing: 1, fontWeight: 600,
                                color: C.danger, textTransform: "uppercase",
                                marginBottom: 2,
                              }}>
                                Your teacher said
                              </div>
                              <p style={{
                                fontSize: 12, color: C.text, lineHeight: 1.4,
                                margin: 0, wordBreak: "break-word",
                              }}>
                                {rejectionFeedback}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Resubmit form — right here in the waiting room */}
                      <div style={{ marginTop: 8 }}>
                        <ResubmitEntryForm
                          entryId={entry.id}
                          currentDescription={entry.description_text}
                          roundNumber={entry.roundNumber}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Rejected favorite comment ── */}
            {/* ── Rejected warm-up favorite comment ── */}
            {hasRejectedWarmupFavorite && currentClass && (
              <div style={{ marginBottom: rejectedRoundFavorites.length > 0 ? 14 : 0 }}>
                <div style={{
                  fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  color: C.danger, textTransform: "uppercase",
                  marginBottom: 10,
                }}>
                  Favorite comment sent back (1)
                </div>

                <div style={{
                  background: "#fff",
                  border: `1px solid ${C.panelEdge}`,
                  borderRadius: 12,
                  padding: 14,
                }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: C.light,
                    letterSpacing: 1, textTransform: "uppercase",
                    marginBottom: 6,
                  }}>
                    Warm-up Round
                  </div>

                  {/* The comment text */}
                  {currentClass.favoriteComment && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{
                        fontSize: 10, letterSpacing: 1, fontWeight: 600,
                        color: C.textFaint, textTransform: "uppercase",
                        marginBottom: 2,
                      }}>
                        What you wrote
                      </div>
                      <p style={{
                        fontSize: 13, color: C.text, lineHeight: 1.4,
                        margin: 0, fontStyle: "italic",
                        wordBreak: "break-word",
                      }}>
                        &quot;{currentClass.favoriteComment}&quot;
                      </p>
                    </div>
                  )}

                  {/* Teacher feedback */}
                  {currentClass.favoriteCommentRejectionReason && (
                    <div style={{
                      background: C.dangerBg,
                      border: `1px solid ${C.danger}44`,
                      borderRadius: 8, padding: "6px 10px",
                      marginBottom: 8,
                    }}>
                      <div style={{
                        fontSize: 10, letterSpacing: 1, fontWeight: 600,
                        color: C.danger, textTransform: "uppercase",
                        marginBottom: 2,
                      }}>
                        Your teacher said
                      </div>
                      <p style={{
                        fontSize: 12, color: C.text, lineHeight: 1.4,
                        margin: 0, wordBreak: "break-word",
                      }}>
                        {currentClass.favoriteCommentRejectionReason}
                      </p>
                    </div>
                  )}

                  {/* Resubmit form — right here in the waiting room */}
                  {currentClass.favoriteComment && (
                    <ResubmitFavoriteCommentForm
                      currentText={currentClass.favoriteComment}
                      round={0}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── B73 (session 73): Rejected round-level favorite comments ── */}
            {rejectedRoundFavorites.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  color: C.danger, textTransform: "uppercase",
                  marginBottom: 10,
                }}>
                  Round favorite comment{rejectedRoundFavorites.length > 1 ? "s" : ""} sent back ({rejectedRoundFavorites.length})
                </div>

                {rejectedRoundFavorites.map((rs) => (
                  <div key={`rf-${rs.roundNumber}`} style={{
                    background: "#fff",
                    border: `1px solid ${C.panelEdge}`,
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                  }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: C.light,
                      letterSpacing: 1, textTransform: "uppercase",
                      marginBottom: 6,
                    }}>
                      Round {rs.roundNumber}
                    </div>

                    {/* The comment text */}
                    {rs.favoriteComment && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{
                          fontSize: 10, letterSpacing: 1, fontWeight: 600,
                          color: C.textFaint, textTransform: "uppercase",
                          marginBottom: 2,
                        }}>
                          What you wrote
                        </div>
                        <p style={{
                          fontSize: 13, color: C.text, lineHeight: 1.4,
                          margin: 0, fontStyle: "italic",
                          wordBreak: "break-word",
                        }}>
                          &quot;{rs.favoriteComment}&quot;
                        </p>
                      </div>
                    )}

                    {/* Teacher feedback */}
                    {rs.favoriteCommentRejectionReason && (
                      <div style={{
                        background: C.dangerBg,
                        border: `1px solid ${C.danger}44`,
                        borderRadius: 8, padding: "6px 10px",
                        marginBottom: 8,
                      }}>
                        <div style={{
                          fontSize: 10, letterSpacing: 1, fontWeight: 600,
                          color: C.danger, textTransform: "uppercase",
                          marginBottom: 2,
                        }}>
                          Your teacher said
                        </div>
                        <p style={{
                          fontSize: 12, color: C.text, lineHeight: 1.4,
                          margin: 0, wordBreak: "break-word",
                        }}>
                          {rs.favoriteCommentRejectionReason}
                        </p>
                      </div>
                    )}

                    {/* Resubmit form */}
                    {rs.favoriteComment && (
                      <ResubmitFavoriteCommentForm
                        currentText={rs.favoriteComment}
                        round={rs.roundNumber}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── B51: PRIMARY CTA — switches based on game state ── */}
        {/* ── B60: Round-complete gate — once the student has saved their
             comments for the current round (a game_session exists), they
             shouldn't re-enter the game. Prevents confusion from replaying
             and accidentally changing favorites/comments. ── */}
        {isGameOver ? (
          <a
            href="/student/results"
            style={{ display: "block", textAlign: "center", textDecoration: "none",
              width: "100%", boxSizing: "border-box", padding: "14px",
              fontFamily: F, fontSize: 16, fontWeight: 700,
              background: C.light,
              color: "#fff", border: "none", borderRadius: 12, letterSpacing: 0.5,
              marginBottom: 28 }}
          >
            🏆 See the class results →
          </a>
        ) : currentRound > 0 && sessionByRound.has(currentRound) ? (
          <div
            style={{ display: "block", textAlign: "center",
              width: "100%", boxSizing: "border-box", padding: "14px",
              fontFamily: F, fontSize: 15, fontWeight: 700,
              background: C.liveGreenBg,
              color: C.liveGreenText,
              border: `1px solid ${C.liveGreen}`,
              borderRadius: 12, letterSpacing: 0.5,
              marginBottom: 28 }}
          >
            {totalRounds !== null && currentRound >= totalRounds
              ? "🎉 You\u2019ve finished every round — sit tight for the awards ceremony!"
              : `✓ Round ${currentRound} complete — sit tight until the next round!`}
          </div>
        ) : (
          <>
            {currentRoundRejected && (
              <div style={{
                background: C.dangerBg,
                border: `1px solid ${C.danger}44`,
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 8,
                fontSize: 12, color: C.danger, lineHeight: 1.5,
              }}>
                Your photo for the current round was not approved. Fix your submission below before playing — the game won&apos;t include your photo until it&apos;s resubmitted and approved.
              </div>
            )}
            <a
              href="/student/play"
              style={{ display: "block", textAlign: "center", textDecoration: "none",
                width: "100%", boxSizing: "border-box", padding: "13px",
                fontFamily: F, fontSize: 15, fontWeight: 700,
                background: currentRoundRejected ? C.textDim : C.light,
                color: "#fff", border: "none", borderRadius: 12, letterSpacing: 0.5,
                marginBottom: 28 }}
            >
              Go to the game →
            </a>
          </>
        )}

        {/* ── ROUND STACK (#27) ── */}
        {currentClassTiming && (
          <>
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

            {/* ── TOP band — live + upcoming, ascending ── */}
            {topRounds.map((r) => {
              const entry = entryByRound.get(r);
              const isLocked = currentRound > 0 && r <= currentRound;
              const isLive = r === currentRound && currentRound > 0;
              const session = sessionByRound.get(r);

              if (entry) {
                return (
                  <div key={`top-${r}`}>
                    <FilledTopSlotCard
                      entry={entry}
                      isLive={isLive}
                      isLocked={isLocked}
                      imageSize={isLive ? 140 : 120}
                    />

                    {/* ── B36: live-round comments below the card ── */}
                    {session && session.commentedEntries.length > 0 && (
                      <div style={{ marginTop: -6, marginBottom: 16 }}>
                        <div style={{
                          fontSize: 12, letterSpacing: 1, fontWeight: 600,
                          color: C.textDim, textTransform: "uppercase",
                          marginBottom: 10,
                        }}>
                          Your comments this round
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {session.commentedEntries.map((ce) => (
                            <div key={ce.id} style={{
                              display: "flex", gap: 14, alignItems: "flex-start",
                              background: C.bg, border: `1px solid ${C.panelEdge}`,
                              borderRadius: 12, padding: 12,
                            }}>
                              {ce.publicUrl ? (
                                <img src={ce.publicUrl} alt=""
                                  style={{
                                    width: 70, height: 70, objectFit: "cover",
                                    borderRadius: 8, border: `1px solid ${C.panelEdge}`,
                                    flexShrink: 0,
                                  }} />
                              ) : (
                                <div style={{
                                  width: 70, height: 70, borderRadius: 8,
                                  flexShrink: 0, background: C.panel,
                                  border: `1px solid ${C.panelEdge}`,
                                }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {ce.isFavorite && (
                                  <div style={{
                                    fontSize: 10, letterSpacing: 1.5, fontWeight: 700,
                                    color: C.light, textTransform: "uppercase",
                                    marginBottom: 4,
                                  }}>
                                    ★ Your favorite
                                  </div>
                                )}
                                {ce.description_text && (
                                  <p style={{
                                    fontSize: 13, color: C.text, fontStyle: "italic",
                                    lineHeight: 1.5, margin: "0 0 8px",
                                    borderLeft: `2px solid ${C.light}`, paddingLeft: 10,
                                    wordBreak: "break-word",
                                  }}>
                                    &quot;{ce.description_text}&quot;
                                  </p>
                                )}
                                {ce.comment && (
                                  <>
                                    <div style={{
                                      fontSize: 11, letterSpacing: 1, fontWeight: 600,
                                      color: C.textFaint, textTransform: "uppercase",
                                      marginBottom: 3,
                                    }}>
                                      What you said
                                    </div>
                                    <p style={{
                                      fontSize: 14, color: C.text, lineHeight: 1.5,
                                      margin: 0, wordBreak: "break-word",
                                    }}>
                                      {ce.comment}
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* ── B72 (session 73): favorite comment text + status badge ── */}
                        {session.favoriteComment && (
                          <div style={{
                            marginTop: 10, padding: "10px 12px",
                            background: C.bg, border: `1px solid ${C.panelEdge}`,
                            borderRadius: 10,
                          }}>
                            <div style={{
                              fontSize: 11, letterSpacing: 1, fontWeight: 600,
                              color: C.textFaint, textTransform: "uppercase",
                              marginBottom: 3,
                            }}>
                              Why it was your favorite
                            </div>
                            <p style={{
                              fontSize: 13, color: C.text, lineHeight: 1.5,
                              margin: "0 0 8px", wordBreak: "break-word",
                            }}>
                              {session.favoriteComment}
                            </p>
                            {session.favoriteCommentStatus && (
                              <span style={{
                                fontSize: 10, letterSpacing: 1.5, fontWeight: 600,
                                color: "#fff",
                                background: session.favoriteCommentStatus === "approved"
                                  ? C.liveGreen
                                  : session.favoriteCommentStatus === "rejected"
                                    ? C.danger
                                    : C.panelEdge,
                                padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap",
                              }}>
                                {session.favoriteCommentStatus === "approved"
                                  ? "APPROVED"
                                  : session.favoriteCommentStatus === "rejected"
                                    ? "NOT APPROVED"
                                    : "AWAITING APPROVAL"}
                              </span>
                            )}
                            {session.favoriteCommentStatus === "rejected" && (
                              <p style={{
                                fontSize: 12, color: C.danger, fontWeight: 600,
                                lineHeight: 1.5, margin: "8px 0 0",
                              }}>
                                ↑ Edit and resubmit in the Action needed section above.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                      locked now —{" "}
                      {totalRounds !== null && r >= totalRounds
                        ? "check the class results once your teacher reveals the awards!"
                        : totalRounds !== null
                          ? `your next chance is Student Round ${r + 1}.`
                          : "check back with your teacher for what\u2019s next."}
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

            {/* ── COMPLETED band ── */}
            {completedRounds.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{
                  fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
                  color: C.textDim, marginBottom: 10,
                }}>
                  Completed rounds
                </h3>

                {completedRounds.map((r) => {
                  const entry = entryByRound.get(r);
                  const session = sessionByRound.get(r);
                  return (
                    <details key={`completed-${r}`} className="round-toggle" style={{
                      background: C.panelSoft,
                      border: `1px solid ${C.panelEdge}`,
                      borderRadius: 12, padding: "10px 14px", marginBottom: 8,
                    }}>
                      <summary style={{
                        cursor: "pointer",
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
                        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600,
                          color: C.light, background: C.light + "18",
                          border: `1px solid ${C.light}44`, borderRadius: 6,
                          padding: "3px 10px" }}>
                          <span className="when-closed">See the round</span>
                          <span className="when-open">Close the round</span>
                        </span>
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

                        {/* ── B2 (#41): Classmate comments for this round ── */}
                        {session && session.commentedEntries.length > 0 && (
                          <div style={{ marginTop: 18, paddingTop: 14,
                            borderTop: `1px solid ${C.panelEdge}` }}>
                            <div style={{
                              fontSize: 12, letterSpacing: 1, fontWeight: 600,
                              color: C.textDim, textTransform: "uppercase",
                              marginBottom: 10,
                            }}>
                              Your comments this round
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {session.commentedEntries.map((ce) => (
                                <div key={ce.id} style={{
                                  display: "flex", gap: 14, alignItems: "flex-start",
                                  background: C.bg, border: `1px solid ${C.panelEdge}`,
                                  borderRadius: 12, padding: 12,
                                }}>
                                  {ce.publicUrl ? (
                                    <img src={ce.publicUrl} alt=""
                                      style={{
                                        width: 70, height: 70, objectFit: "cover",
                                        borderRadius: 8, border: `1px solid ${C.panelEdge}`,
                                        flexShrink: 0,
                                      }} />
                                  ) : (
                                    <div style={{
                                      width: 70, height: 70, borderRadius: 8,
                                      flexShrink: 0, background: C.panel,
                                      border: `1px solid ${C.panelEdge}`,
                                    }} />
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    {ce.isFavorite && (
                                      <div style={{
                                        fontSize: 10, letterSpacing: 1.5, fontWeight: 700,
                                        color: C.light, textTransform: "uppercase",
                                        marginBottom: 4,
                                      }}>
                                        ★ Your favorite
                                      </div>
                                    )}
                                    {ce.description_text && (
                                      <p style={{
                                        fontSize: 13, color: C.text, fontStyle: "italic",
                                        lineHeight: 1.5, margin: "0 0 8px",
                                        borderLeft: `2px solid ${C.light}`, paddingLeft: 10,
                                        wordBreak: "break-word",
                                      }}>
                                        &quot;{ce.description_text}&quot;
                                      </p>
                                    )}
                                    {ce.comment && (
                                      <>
                                        <div style={{
                                          fontSize: 11, letterSpacing: 1, fontWeight: 600,
                                          color: C.textFaint, textTransform: "uppercase",
                                          marginBottom: 3,
                                        }}>
                                          What you said
                                        </div>
                                        <p style={{
                                          fontSize: 14, color: C.text, lineHeight: 1.5,
                                          margin: 0, wordBreak: "break-word",
                                        }}>
                                          {ce.comment}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* ── B72 (session 73): favorite comment text + status badge ── */}
                            {session.favoriteComment && (
                              <div style={{
                                marginTop: 10, padding: "10px 12px",
                                background: C.bg, border: `1px solid ${C.panelEdge}`,
                                borderRadius: 10,
                              }}>
                                <div style={{
                                  fontSize: 11, letterSpacing: 1, fontWeight: 600,
                                  color: C.textFaint, textTransform: "uppercase",
                                  marginBottom: 3,
                                }}>
                                  Why it was your favorite
                                </div>
                                <p style={{
                                  fontSize: 13, color: C.text, lineHeight: 1.5,
                                  margin: "0 0 8px", wordBreak: "break-word",
                                }}>
                                  {session.favoriteComment}
                                </p>
                                {session.favoriteCommentStatus && (
                                  <span style={{
                                    fontSize: 10, letterSpacing: 1.5, fontWeight: 600,
                                    color: "#fff",
                                    background: session.favoriteCommentStatus === "approved"
                                      ? C.liveGreen
                                      : session.favoriteCommentStatus === "rejected"
                                        ? C.danger
                                        : C.panelEdge,
                                    padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap",
                                  }}>
                                    {session.favoriteCommentStatus === "approved"
                                      ? "APPROVED"
                                      : session.favoriteCommentStatus === "rejected"
                                        ? "NOT APPROVED"
                                        : "AWAITING APPROVAL"}
                                  </span>
                                )}
                                {session.favoriteCommentStatus === "rejected" && (
                                  <p style={{
                                    fontSize: 12, color: C.danger, fontWeight: 600,
                                    lineHeight: 1.5, margin: "8px 0 0",
                                  }}>
                                    ↑ Edit and resubmit in the Action needed section above.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}

            {/* ── B51: Results link moved to primary CTA position above.
                 CSV download stays here for game-over state. ── */}
            {isGameOver && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <StudentDashboardCsvButton
                  studentName={displayName}
                  csvRows={ownEntries.map((e) => ({
                    round: e.roundNumber,
                    description: e.description_text || "",
                    status: e.status,
                    teacherNote: e.teacherNote || "",
                  }))}
                  roundComments={roundSessions.map((rs) => ({
                    roundNumber: rs.roundNumber,
                    commentedEntries: rs.commentedEntries.map((ce) => ({
                      description_text: ce.description_text,
                      comment: ce.comment,
                      isFavorite: ce.isFavorite,
                    })),
                    favoriteComment: rs.favoriteComment,
                  }))}
                  warmupEntries={(currentClass?.entries || []).map((we) => ({
                    description_text: we.description_text,
                    comment: we.comment,
                    isFavorite: we.isFavorite,
                    teacherNote: we.teacherNote,
                  }))}
                  warmupFavoriteComment={currentClass?.favoriteComment ?? null}
                  warmupTeacherNotes={
                    (currentClass?.generalNotes || [])
                      .map((n) => n.body)
                      .join(" | ")
                  }
                />
              </div>
            )}

            {/* ── #35 L2: Teacher's Warm-up Round — at the very bottom,
                 below results + spreadsheet buttons. ── */}
            {currentClass && currentClass.entries.length > 0 && (
              <details className="round-toggle" style={{
                background: C.panelSoft,
                border: `1px solid ${C.panelEdge}`,
                borderRadius: 12, padding: "10px 14px",
                marginTop: 20, marginBottom: 8,
              }}>
                <summary style={{
                  cursor: "pointer",
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
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600,
                    color: C.light, background: C.light + "18",
                    border: `1px solid ${C.light}44`, borderRadius: 6,
                    padding: "3px 10px" }}>
                    <span className="when-closed">See the round</span>
                    <span className="when-open">Close the round</span>
                  </span>
                </summary>
                <WarmupBody a={currentClass} />
              </details>
            )}
          </>
        )}

        {/* ── YOUR CLASSES (history strip) ── */}
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
