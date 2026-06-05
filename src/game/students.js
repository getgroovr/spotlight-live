// ═══════════════════════════════════════════════════════════════════════
// Spotlight — content layer (the one list everything reads from)
//
// This is the SHUFFLE-STOP education game, forked from the GroovR matching
// template. The engine (spotlight.jsx) reads everything from here. Add a
// student? You add ONE entry below — you never touch engine code.
//
// This file is the direct analog of the matching game's dances.js. Same
// principle (engine reads from one content list), student-centric fields.
//
// ─────────────────────────────────────────────────────────────────────────
// THE ARCHIVE MODEL  (read this before you change a student's videos)
// ─────────────────────────────────────────────────────────────────────────
// A student is NOT a single video. A student is a STACK OF ENTRIES.
//
//   entry = { primary, description, uploadedAt }
//
// where:
//   primary      the main video (the one the game plays when this student is
//                spotlighted). REQUIRED on every entry.
//   description  the student's OWN comment video about that primary — the
//                "here's what I was doing / why I filmed this" clip. OPTIONAL.
//   uploadedAt   ISO date string, for ordering + the archive shelf display.
//
// THE RULE YOU ASKED FOR (auto-archive, comment stays welded to its video):
//   • entries[0] is always the LIVE entry — its primary is what the game plays.
//   • When a new entry is uploaded, it goes to the FRONT (becomes entries[0]).
//   • The previously-live entry slides down into the archive — AND ITS
//     DESCRIPTION GOES WITH IT, as a pair. They never separate.
//   • If a new primary is uploaded with NO new description, that's fine: the
//     new live entry simply has description:null. The OLD entry (with its own
//     old description) is archived intact — the old comment is NOT lost and is
//     NOT re-associated with the new video. Each comment stays with the video
//     it describes. (This is exactly your requirement.)
//
//   Use addEntry() below to do this correctly in one call — don't hand-edit
//   the array, or you risk separating a comment from its video.
//
// ─────────────────────────────────────────────────────────────────────────
// VIDEO FIELDS — same shape as the matching game's video fields.
//   videoUrl is served from public/. A file at public/clips/maria/hike.mp4 is
//   referenced as "/clips/maria/hike.mp4". On desktop you simulate uploads by
//   dropping files in that folder; online, this becomes a storage URL.
//
//   For the PROTOTYPE we have no real video files yet, so primary/description
//   may be null — the engine shows an animated placeholder "video" stand-in so
//   the mechanic is fully playable before any filming happens. Set a real
//   videoUrl string when you have a clip and the placeholder is replaced.
// ─────────────────────────────────────────────────────────────────────────

// ── ONE fixed teacher (per the spec). The class belongs to this teacher. ──
export const TEACHER = {
  name: "Ms. Calloway",
  // Where session activity (comments + favorites) gets emailed when a student
  // who downloaded the game finishes playing. See exportSession() below and
  // the "Send to teacher" button in the engine. Change this to the real
  // teacher address before distributing the game to students.
  email: "teacher@example.edu",
  className: "ESL Conversation — Spring",
};

// ─────────────────────────────────────────────────────────────────────────
// THE STUDENTS. Nine of them (the grid is 3×3, like the matching game).
//
//   id           unique short code (used as React key + favorites key).
//   name         display name.
//   color        accent color (hex) — the student's spotlight/tile color.
//   avatar       optional path to a profile picture in public/. If absent,
//                the engine draws a colored initial placeholder.
//   bio          one short line shown on the profile reveal card.
//   entries      the stack described above. entries[0] = LIVE. REQUIRED,
//                at least one entry (its primary may be null in the proto).
//   peerComments built-in now, dormant on desktop. See PEER COMMENTS below.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// THE CREATOR DESCRIPTION  (what a student produces ALONGSIDE their video)
// ─────────────────────────────────────────────────────────────────────────
// Each entry carries not just the video, but the creator's description of it.
// The creator flow (built as data model + UI now; assembly deferred to the
// online "spotlight-social" version) is:
//
//   1. video            the content clip — plays in the shuffle game. REQUIRED.
//   2. descriptionText  the creator WRITES a description IN ENGLISH. Shown to
//                       other students (the readable blurb about the clip).
//   3. descriptionL1    DORMANT on desktop — left empty, reserved for the online
//                       version where the student writes in their OWN language
//                       and it's translated. We keep the field so this desktop
//                       app is a true TEMPLATE for the online one. No desktop
//                       translation happens (that needs a server/API).
//   4. readingAudio     an AUDIO file of the creator READING their English
//                       description aloud. TEACHER-ONLY (spoken-English practice
//                       the teacher assesses). On desktop this is a file that
//                       travels to the teacher; online it uploads.
//
// NOTE on naming: the engine's video player still calls the OPTIONAL second
// clip a "description video" (the old GroovR carryover). That is separate from
// this WRITTEN descriptionText. To avoid confusion:
//   • description     = an OPTIONAL extra VIDEO clip (legacy; may be null)
//   • descriptionText = the WRITTEN English blurb (the creator-flow field)
//   • readingAudio    = AUDIO of them reading descriptionText (teacher-only)
// ─────────────────────────────────────────────────────────────────────────

// Helper to keep the demo data readable: makes one entry.
// Backward-compatible: old entry(primary, description, date) calls still work;
// the creator fields default to empty/null and can be added per entry.
//
// mediaType (NEW): 'photo' | 'video'. The engine renders an <img> for photos
// (with a soft-timer beat before the comment card appears) and a <video> for
// videos. Defaults to 'video' so the existing in-file STUDENTS sample data —
// which is all video-shaped — keeps its meaning unchanged. The DB adapter
// always sets this explicitly from the entries.media_type column.
const entry = (primary, description, uploadedAt, extra = {}) => ({
  primary,
  description,                                   // optional extra VIDEO (legacy)
  uploadedAt,
  mediaType: extra.mediaType || "video",        // 'photo' | 'video'
  descriptionText: extra.descriptionText || "", // creator's WRITTEN English blurb
  descriptionL1: extra.descriptionL1 || "",     // DORMANT: native-language text (online translates)
  readingAudio: extra.readingAudio || null,     // TEACHER-ONLY audio of them reading the English
});

export const STUDENTS = [
  {
    id: "s1", name: "Maria", color: "#E0954A",
    bio: "Loves hiking and talking about the mountains back home.",
    entries: [
      entry(null, null, "2026-05-10", {           // live (placeholder in proto)
        descriptionText: "This is a video from my hike last weekend. I show the mountains and I talk about my home country.",
      }),
      entry(null, null, "2026-04-02"),            // older, auto-archived
    ],
    peerComments: [],
  },
  {
    id: "s2", name: "Kenji", color: "#4A90D9",
    bio: "Always has a story about food and his grandmother's recipes.",
    entries: [ entry(null, null, "2026-05-12", {
      descriptionText: "I am cooking my grandmother's recipe. It is a soup with vegetables. I explain every step slowly.",
    }) ],
    peerComments: [],
  },
  {
    id: "s3", name: "Amara", color: "#1D9E75",
    bio: "Wants to be a nurse. Practices English by describing her day.",
    entries: [ entry(null, null, "2026-05-08", {
      descriptionText: "In this video I describe my day at the hospital. I want to be a nurse, so I talk about the things I see and learn.",
    }) ],
    peerComments: [],
  },
  {
    id: "s4", name: "Diego", color: "#D4537E",
    bio: "Talks fast about football. We are working on slowing down.",
    entries: [ entry(null, null, "2026-05-11", {
      descriptionText: "I am talking about my favorite football team and the game last weekend. I am trying to speak slowly so you can understand me.",
    }) ],
    peerComments: [],
  },
  {
    id: "s5", name: "Lena", color: "#9168F5",
    bio: "Quiet but films beautiful little clips of her garden.",
    entries: [ entry(null, null, "2026-05-09", {
      descriptionText: "This is a small video of my garden. I show the flowers and the vegetables that are growing now. It is very quiet and peaceful.",
    }) ],
    peerComments: [],
  },
  {
    id: "s6", name: "Omar", color: "#E2554A",
    bio: "Building confidence. His description videos are getting longer.",
    entries: [ entry(null, null, "2026-05-13", {
      descriptionText: "This week I tried to make a longer video. I talk about my week and the new words I learned. I am getting more confident.",
    }) ],
    peerComments: [],
  },
  {
    id: "s7", name: "Priya", color: "#22B8C9",
    bio: "Explains things very clearly. A natural teacher herself.",
    entries: [ entry(null, null, "2026-05-07", {
      descriptionText: "In this video I explain something I know well, step by step. I like to teach, so I try to make every part easy to follow.",
    }) ],
    peerComments: [],
  },
  {
    id: "s8", name: "Tomas", color: "#639922",
    bio: "Films his walk to class and narrates what he sees.",
    entries: [ entry(null, null, "2026-05-12", {
      descriptionText: "I film my walk to class and I describe what I see on the way. There are shops, trees, and many people. I say the words out loud.",
    }) ],
    peerComments: [],
  },
  {
    id: "s9", name: "Yuki", color: "#BA7517",
    bio: "Favorite topic: her two cats. We have many cat videos.",
    entries: [ entry(null, null, "2026-05-10", {
      descriptionText: "This is a video of my two cats. I tell you their names and what they like to do. One is very lazy and one is very playful.",
    }) ],
    peerComments: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// THE LIVE ENTRY — convenience accessor. entries[0] is always live.
// ─────────────────────────────────────────────────────────────────────────
export function liveEntry(student) {
  return student.entries[0] || null;
}

// All archived entries (everything behind the live one), newest first.
export function archivedEntries(student) {
  return student.entries.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────
// addEntry — THE CORRECT WAY to add a new video (auto-archives the old one,
// keeping each description welded to its own primary). Returns a NEW student
// object (does not mutate), so it plays nicely with React state.
//
//   addEntry(student, { primary, description })
//
// The new entry becomes live (entries[0]); the previously-live entry — WITH
// its own description still attached — slides down into the archive. If you
// pass no description, the new live entry just has description:null; the old
// entry's old description is untouched and stays archived with its old primary.
// ─────────────────────────────────────────────────────────────────────────
export function addEntry(student, { primary, description = null, mediaType = "video" }) {
  const newEntry = {
    primary,
    description,
    mediaType,
    uploadedAt: new Date().toISOString().slice(0, 10),
  };
  return { ...student, entries: [newEntry, ...student.entries] };
}

// ─────────────────────────────────────────────────────────────────────────
// PEER COMMENTS — built now, dormant on desktop (gated by SOCIAL in engine).
//
// Online, OTHER students commenting on a video matters as much as the maker's
// own description. So the shape exists now. A peer comment:
//
//   { author, text, videoUrl, createdAt }
//
//   author     the commenting student's name (or id).
//   text        a written comment (always allowed).
//   videoUrl    OPTIONAL — a video reply (the online "video comment" idea).
//   createdAt   ISO date string.
//
// Peer comments attach to the STUDENT (whose spotlight you're commenting on),
// not to a specific entry — a comment is about "Maria's clip you just saw",
// i.e. the live entry at the time. If you later want per-entry threading,
// add an entryIndex field; the engine doesn't assume one today.
// ─────────────────────────────────────────────────────────────────────────
export function addPeerComment(student, { author, text, videoUrl = null }) {
  const c = { author, text, videoUrl, createdAt: new Date().toISOString().slice(0, 10) };
  return { ...student, peerComments: [...(student.peerComments || []), c] };
}

// ─────────────────────────────────────────────────────────────────────────
// SESSION EXPORT → CSV  (the teacher's deliverable)
//
// The student writes ONE comment per video during the game (mandatory). At the
// end, those nine comments become a single CSV the student downloads and sends
// to the teacher. The teacher stacks each student's CSV into one growing sheet
// to track progress and spot recurring grammar/language issues across the term.
//
// Columns are chosen for that accumulation: player, date, then per-row the
// student-in-the-video, which video #, the video's upload date, whether it was
// favorited, and the comment text. Sortable/filterable in Excel.
//
//   buildSessionRows(state) -> array of plain objects (one per commented video)
//   toCSV(rows)             -> RFC-4180-ish CSV string (quotes, escaping)
//   sessionFilename(state)  -> a stable, sortable filename
// ─────────────────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  "player", "session_date", "video_student", "video_number",
  "video_date", "favorited", "comment",
];

export function buildSessionRows({ playerName, favorites, myComments }) {
  const sessionDate = new Date().toISOString().slice(0, 10);
  const rows = [];
  STUDENTS.forEach((s, idx) => {
    const comment = (myComments && myComments[s.id]) || "";
    if (!comment) return; // only videos that were actually played + commented
    const live = liveEntry(s);
    rows.push({
      player: playerName || "(unnamed)",
      session_date: sessionDate,
      video_student: s.name,
      video_number: idx + 1,
      video_date: live ? live.uploadedAt : "",
      favorited: favorites && favorites[s.id] ? "yes" : "no",
      comment,
    });
  });
  return rows;
}

// One CSV field: wrap in quotes and double any inner quotes if it contains a
// comma, quote, or newline. Keeps comments with commas/quotes intact in Excel.
function csvField(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows) {
  const header = CSV_COLUMNS.join(",");
  const body = rows
    .map((r) => CSV_COLUMNS.map((c) => csvField(r[c])).join(","))
    .join("\n");
  return header + "\n" + body + "\n";
}

export function sessionFilename({ playerName }) {
  const date = new Date().toISOString().slice(0, 10);
  const safe = (playerName || "student").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  // Leading date keeps files sortable when the teacher collects many of them.
  return `spotlight_${date}_${safe}.csv`;
}

// Build the full CSV string for a session in one call.
export function buildSessionCSV(state) {
  return toCSV(buildSessionRows(state));
}
