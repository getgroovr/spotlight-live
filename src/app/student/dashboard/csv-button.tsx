"use client";

// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/dashboard/csv-button.tsx   (REPLACES)
//
// Client-side CSV generation for the student's own round history.
// Only rendered when isGameOver (parent gates the render).
//
// C2 (session 73): SPREADSHEET ENRICHMENT
//   The student's downloadable spreadsheet now captures ALL their language
//   from the game, not just their photo descriptions. Three sections:
//
//   Section 1 — YOUR PHOTO SUBMISSIONS
//     Round | Your Photo Description | Status | Teacher Note
//
//   Section 2 — YOUR GAME COMMENTS
//     Round | Photo Description | Your Comment | Favorite? | Favorite Comment
//     One row per entry the student commented on, across all rounds.
//
//   Section 3 — TEACHER'S WARM-UP ROUND
//     Teacher Comment | Your Comment | Favorite? | Favorite Comment
//
// Session 79: TOPIC SUPPORT
//   Round headers now include topic when set: "Round 1 — Nature"
//   roundTopics prop is a map from student round number string to topic text.
// ─────────────────────────────────────────────────────────────────────────

type CsvRow = {
  round: number;
  description: string;
  status: string;
  teacherNote: string;
};

// B2 / C2: shape of a classmate entry the student commented on.
type CommentEntry = {
  description_text: string | null;
  comment: string;
  isFavorite: boolean;
};

// C2: one round's worth of comment data.
type RoundCommentData = {
  roundNumber: number;
  commentedEntries: CommentEntry[];
  favoriteComment: string | null;
};

// Session 73: warm-up entry now carries teacherNote instead of
// (or in addition to) description_text.
type WarmupEntry = {
  description_text: string | null;
  comment: string;
  isFavorite: boolean;
  teacherNote: string | null;
};

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Session 79: build display label for a student round, with topic if set.
function roundLabel(
  roundNumber: number,
  roundTopics: Record<string, string | null>,
): string {
  const topic = roundTopics[String(roundNumber)];
  return topic ? `Round ${roundNumber} — ${topic}` : `Round ${roundNumber}`;
}

export function StudentDashboardCsvButton({
  studentName,
  csvRows,
  roundComments = [],
  warmupEntries = [],
  warmupFavoriteComment = null,
  warmupTeacherNotes = "",
  roundTopics = {},
}: {
  studentName: string;
  csvRows: CsvRow[];
  roundComments?: RoundCommentData[];
  warmupEntries?: WarmupEntry[];
  warmupFavoriteComment?: string | null;
  warmupTeacherNotes?: string;
  roundTopics?: Record<string, string | null>;
}) {
  const download = () => {
    const lines: string[] = [];

    // ── Section 1: Photo submissions ──
    lines.push("=== YOUR PHOTO SUBMISSIONS ===");
    lines.push(["Round", "Your Photo Description", "Status", "Teacher Note"].join(","));
    for (const r of csvRows) {
      lines.push(
        [
          escapeCsv(roundLabel(r.round, roundTopics)),
          escapeCsv(r.description),
          r.status,
          escapeCsv(r.teacherNote),
        ].join(","),
      );
    }

    // ── Section 2: Game comments ──
    if (roundComments.length > 0) {
      lines.push(""); // blank separator
      lines.push("=== YOUR GAME COMMENTS ===");
      lines.push(
        ["Round", "Photo Description", "Your Comment", "Is Your Favorite", "Your Favorite Comment"].join(","),
      );
      for (const rc of roundComments) {
        const label = rc.roundNumber === 0
          ? "Warm-up Round"
          : roundLabel(rc.roundNumber, roundTopics);
        for (const ce of rc.commentedEntries) {
          lines.push(
            [
              escapeCsv(label),
              escapeCsv(ce.description_text || ""),
              escapeCsv(ce.comment),
              ce.isFavorite ? "yes" : "",
              ce.isFavorite ? escapeCsv(rc.favoriteComment || "") : "",
            ].join(","),
          );
        }
      }
    }

    // ── Section 3: Warm-up round ──
    // Session 73: "Photo Description" replaced with "Teacher Comment".
    // Shows the teacher's note to the student for each warm-up entry,
    // or the general warm-up teacher notes if no per-entry notes exist.
    if (warmupEntries.length > 0) {
      lines.push(""); // blank separator
      lines.push("=== TEACHER'S WARM-UP ROUND ===");
      lines.push(
        ["Teacher Comment", "Your Comment", "Is Your Favorite", "Your Favorite Comment"].join(","),
      );
      for (const we of warmupEntries) {
        // Per-entry teacher note takes priority; fall back to general notes.
        const teacherComment = we.teacherNote || warmupTeacherNotes || "";
        lines.push(
          [
            escapeCsv(teacherComment),
            escapeCsv(we.comment),
            we.isFavorite ? "yes" : "",
            we.isFavorite ? escapeCsv(warmupFavoriteComment || "") : "",
          ].join(","),
        );
      }
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = studentName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    a.href = url;
    a.download = `${safeName}_spotlight.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={download}
      style={{
        background: "transparent",
        color: "#D98A2B",
        border: `1px solid #D98A2B`,
        borderRadius: 8,
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'Outfit',sans-serif",
      }}
    >
      Download your class spreadsheet
    </button>
  );
}
