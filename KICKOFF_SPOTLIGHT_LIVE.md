# KICKOFF — Spotlight Live (the online version)

**This is the hosted "live" build of Spotlight.** Its desktop sibling is
`spotlight-shuffle` (the Vite + React template). This app is where the features
the desktop build deliberately deferred — real accounts, an upload destination,
translation, teacher-only privacy, surfaced peer comments — actually get built.

> **Status (Slice One): the game is playable in the browser.** The full
> shuffle-stop loop runs client-side with placeholder videos, no login required,
> exactly like desktop. Accounts and uploads are the next slices.

---

## What this is built on

`spotlight-live` was forked from `groovr-creator`, the earlier online app for the
dance/matching game. That game is **archived** (kept frozen on desktop; it can't
realistically go online for music-copyright reasons). What we KEPT from it is the
generic, already-working plumbing — none of it was dance-specific:

- **Next.js 16** (App Router) + **Supabase** auth.
- Email/password **login, signup** (with an 18+ gate), and the email-confirmation
  **callback** route.
- **Session proxy** (`src/proxy.ts` — Next 16 renamed "middleware" to "proxy")
  that refreshes the session and can protect routes.
- Browser/server **Supabase client factories** (`src/lib/`).

What we REPLACED is the dance identity (GroovR branding, the neon theme, the
matching framing) with the Spotlight game.

> **Heads-up for any agent working here:** this Next.js version has real breaking
> changes vs. older training data (see `AGENTS.md`). The authoritative docs are
> bundled at `node_modules/next/dist/docs/`. Read them before writing routing,
> caching, or data-fetching code. (Already learned the hard way: `middleware` →
> `proxy`; `next/font/google` fetches at build time; client components still
> prerender, so anything that throws on missing env vars breaks the build.)

---

## How to run
1. `npm install`
2. `npm run dev` → open the printed `http://localhost:3000`.
3. The landing page (`/`) has a **Play now** button → `/play` (the game).

No `.env.local` is required for Slice One. The auth pages exist and render, but
will say accounts aren't enabled until Supabase credentials are added (see
`.env.local.example`).

---

## The files
```
spotlight-live/
├── src/
│   ├── app/
│   │   ├── page.tsx              landing → /play
│   │   ├── play/page.tsx         the game route (thin server wrapper)
│   │   ├── layout.tsx            root layout (system-font fallback; Outfit loaded in-game)
│   │   ├── globals.css
│   │   └── auth/                 login / signup / callback (Supabase — plumbing, dormant)
│   ├── game/
│   │   ├── spotlight.jsx         THE ENGINE — identical to desktop + a "use client" line
│   │   ├── students.js           CONTENT LAYER — identical to desktop
│   │   └── shell.jsx             paints the tan page bg + centers the card (was desktop main.jsx)
│   ├── lib/
│   │   ├── supabase-client.ts    returns null when unconfigured (so Slice One needs no backend)
│   │   └── supabase-server.ts    same
│   └── proxy.ts                  session refresh + route protection (no protected routes yet)
└── .env.local.example            the Supabase vars the accounts slice will need
```

**Architecture principle (carried from desktop):** the engine and content are
cleanly separated. `students.js` is the one list everything reads from;
`spotlight.jsx` is the engine. Today `students.js` is a static file with
placeholder data. The online work is to make that list come from the **database**
instead — without the engine caring where the data comes from.

---

## The road ahead (the deferred seams, now in scope)

In priority order, matching the desktop kickoff's "deferred to spotlight-social":

1. **Accounts wired into the flow.** The auth pages work; connect them to the
   game (who's playing, whose class). Reuse the same Supabase project.
2. **The upload destination — the first real problem.** A creator picks a video,
   writes the English `descriptionText`, records the `readingAudio`. These become
   rows in the database + files in storage, replacing the static `students.js`.
3. **Translation** (`descriptionL1` → English) — needs a server + a translation API.
4. **Real privacy** — teacher-only `readingAudio`, per-student visibility, enforced
   by accounts (not the desktop honor system).
5. **Roaming save/resume** — move per-machine localStorage to the account.
6. **Peer comments surfaced** — flip `SOCIAL = true` in the engine and back it with
   real data + teacher curation.

---

## First-draft data model (for the upload slice — REACT TO THIS, don't just build it)

This is a starting proposal, not a final spec. The goal is to make the static
`students.js` come from Supabase **without the engine having to change how it
thinks**. The engine already models the world as: one teacher → a class of
students → each student is a *stack of entries* (video + its description + audio)
→ plus peer comments → plus the player's own session comments (which become the
CSV). The tables below give each of those a real home.

### The shapes the engine reads today (the target we map onto)
- `TEACHER` = `{ name, email, className }`
- a **student** = `{ id, name, color, bio, entries[], peerComments[] }`
- an **entry** = `{ primary, description, uploadedAt, descriptionText, descriptionL1, readingAudio }`
  - `primary` = main video (required), `description` = optional extra video,
    `descriptionText` = written English, `descriptionL1` = native-language
    (dormant, the translation seam), `readingAudio` = teacher-only audio.
  - **The archive rule:** `entries[0]` is live; a new upload pushes to the front
    and the old entry slides into the archive **with its description still
    welded to it.** The DB must preserve this — never re-associate an old
    description with a new video.
- a **peer comment** = `{ author, text, videoUrl, createdAt }`
- the **CSV row** = `{ player, session_date, video_student, video_number,
  video_date, favorited, comment }` — this deliverable must survive online.

### Proposed tables (Supabase / Postgres)

```
profiles            one row per auth user (extends Supabase auth.users)
  id            uuid  PK, = auth.users.id
  role          text  'teacher' | 'student'
  display_name  text
  color         text  the student's accent color (engine's `color`)
  bio           text  the student's one-line bio (engine's `bio`)
  created_at    timestamptz

classes             a teacher's class (the engine's single TEACHER + className)
  id            uuid  PK
  teacher_id    uuid  FK -> profiles.id
  name          text  e.g. "ESL Conversation — Spring"
  created_at    timestamptz

class_members       which students belong to which class (many-to-many)
  class_id      uuid  FK -> classes.id
  student_id    uuid  FK -> profiles.id
  PRIMARY KEY (class_id, student_id)

entries             the heart of it: one row per uploaded video = one "entry"
  id              uuid  PK
  student_id      uuid  FK -> profiles.id   (whose video this is)
  class_id        uuid  FK -> classes.id    (which class it was made for)
  primary_url     text  storage path to the main video (was `primary`)
  description_url text  optional extra video (was `description`)
  description_text text  written English        (descriptionText)
  description_l1  text  native language, dormant (descriptionL1)
  reading_audio_url text TEACHER-ONLY audio      (readingAudio)
  uploaded_at     timestamptz                    (uploadedAt)
  is_live         boolean  exactly one TRUE per student per class = entries[0]
  -- archive rule = flip old row's is_live to false, insert new row is_live true.
  -- Each row keeps its OWN description_text forever; nothing is re-associated.

peer_comments       classmate comments (dormant until SOCIAL=true)
  id            uuid  PK
  author_id     uuid  FK -> profiles.id   (who wrote it)
  subject_id    uuid  FK -> profiles.id   (whose spotlight it's about)
  class_id      uuid  FK -> classes.id
  text          text
  video_url     text  optional video reply (the online "video comment")
  created_at    timestamptz

sessions            a player's one playthrough (replaces per-machine localStorage)
  id            uuid  PK
  player_id     uuid  FK -> profiles.id
  class_id      uuid  FK -> classes.id
  started_at    timestamptz
  finished_at   timestamptz  null until done

session_comments    the player's mandatory comment per video = the CSV rows
  id            uuid  PK
  session_id    uuid  FK -> sessions.id
  entry_id      uuid  FK -> entries.id    (which video was commented on)
  comment       text
  favorited     boolean
  created_at    timestamptz
  -- buildSessionRows() reads from here; the CSV deliverable is unchanged.
```

### Storage
Two buckets, because privacy differs:
- `videos` — primary + description clips. Readable by classmates (it's the game).
- `reading-audio` — TEACHER-ONLY. Locked down by RLS so only the class's teacher
  (and the owning student) can read. This is the desktop "honor-system privacy"
  finally made real.

### Why this shape
- **Engine compatibility:** a query of "all students in class X, each with their
  entries newest-first" reconstructs the exact `STUDENTS` array the engine wants.
  A thin adapter maps snake_case columns → the camelCase fields above, so
  `spotlight.jsx` stays untouched.
- **The archive rule becomes a DB invariant** (`is_live`), not a hand-edited
  array — which is exactly what the desktop `addEntry()` comment warned to protect.
- **Privacy is real**, enforced by Row-Level Security per role, not by hiding
  things in the UI.
- **The CSV survives**: `session_comments` carries every column the teacher's
  deliverable needs.

### Open questions for the next chat to settle
1. **One teacher or many?** Desktop assumed a single fixed teacher. The model
   above allows many teachers/classes — confirm that's wanted, or simplify.
2. **Can a student be in more than one class?** (The model allows it; maybe not needed.)
3. **Upload slice scope:** build the *creator upload UI* first (student records +
   uploads), or the *teacher view* first (see/collect the class)? The desktop
   kickoff calls the upload destination "the first real problem," suggesting
   creator-upload first.
4. **Reuse the existing Supabase project** (your stated preference) — confirm and
   wire `.env.local` when starting.
5. **Account model for minors** (see Safety & moderation): open self-signup vs.
   teacher-created/invited student accounts. A classroom tool with under-18
   students likely wants the teacher to own the roster — settle this before
   building signup into the flow.

---

---

## Safety & moderation (FIRST-CLASS — design in, don't bolt on)

Spotlight involves **students — some likely minors — uploading videos and
commenting on each other.** That makes safety a core design concern from the
first online slice, not a later add-on. Retrofitting moderation after content and
comments already flow is far harder than building the seams now.

Principles for the upload and social slices:

- **The teacher is the moderation hub.** This matches the desktop design (teacher
  as assembler/curator) and is the natural safety model for a classroom tool: a
  trusted adult reviews/curates, students don't have unmediated reach to each other.
- **Peer comments are gated, not live.** When `SOCIAL` turns on, classmate
  comments should default to **teacher-reviewed before they're visible to other
  students**, not posted instantly. The `peer_comments` table should carry a
  `status` (`pending` | `approved` | `removed`) and a `reviewed_by` / `reviewed_at`.
- **Reporting/flagging from day one.** Add a `reports` table when comments go live:
  `{ id, reporter_id, target_type ('comment'|'video'|'profile'), target_id,
  reason, created_at, resolved_at, resolved_by }`. A student (or teacher) can flag
  content; the teacher resolves. Don't ship student-visible peer content without
  this in place.
- **Teacher-only stays teacher-only, enforced by RLS.** `reading_audio` and any
  review/report tables must be locked by Row-Level Security per role — not hidden
  in the UI. (The desktop "honor-system privacy" becomes real here.)
- **Account/age reality.** The signup page already has an "18 or older" gate, but
  a *classroom* tool will have under-18 students. The next chat must decide the
  real model: likely **teacher-created/invited student accounts** (teacher owns
  the class roster) rather than open self-signup, so minors aren't self-registering
  into a public system. This is an open question to settle, flagged below.
- **Minimal data on minors.** Collect only what the game needs (display name,
  color, bio, their own clips). No unnecessary PII.

These belong in the data model above: `peer_comments.status`, a `reports` table,
and RLS policies are the concrete artifacts. Treat "can a student see another
student's comment" as a *permission* question answered by the teacher, not a
default.

---

## What Slice One deliberately did NOT change
The shuffle-stop engine and the content data model are byte-identical to the
desktop build. The mechanic, the mandatory-comment gate, the CSV deliverable, the
archive model, and the dormant online seams (`SOCIAL`, `descriptionL1`,
`readingAudio`, `peerComments`) all carried over untouched — so the online build
inherits exactly the template the desktop app was designed to be.
