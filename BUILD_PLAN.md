# Spotlight Live — Build Plan (revised)

_Revised after the design + reconnaissance session. This supersedes the earlier
build plan. Where this document and older notes disagree, **this document wins** —
several earlier "locked" decisions were made against premises that have since
changed, and they are corrected below with the reasoning kept visible._

---

## Reconnaissance done this session (facts, not plans)

- **Repo:** `github.com/getgroovr/spotlight-live` — confirmed clonable. Keep it
  **public** during active build sessions (a private repo can't be cloned from
  the build environment); flip it private between stretches if desired —
  visibility is reversible and loses no work.
- **No secrets in the repo.** `.gitignore` ignores `.env*`; a full scan found no
  `.env.local`, no project URL, no Supabase keys committed anywhere. Safe public.
- **Supabase project:** `groovr-creator` (reused from the archived dance app).
  - Status **Healthy** (not paused). Idle — 0 requests across DB/auth/storage.
  - Existing tables (Groovr leftovers): `blocks`, `comments`, `favorites`,
    `follows`, `match_events`, `profiles`, `reports`, `videos`.
  - **Only `profiles` had data** — a single test row ("Mister D"), to be deleted.
    Every other table is empty.
  - **Decision: reuse this project and adapt the existing tables.** The leftover
    `profiles` shape (`display_name`, `bio`, `avatar_url`, `is_18_plus`, …) is
    already close to what Spotlight needs; the Groovr-specific tables
    (`follows`, `match_events`, `blocks`) are simply left untouched/unused.
- **No migrations exist yet** ("Last migration: No migrations"). The schema must
  be created as **SQL migration files in the repo**, not by hand-clicking the
  Table Editor. Hand edits cause code/DB drift and leave no record — avoid them.
- **`.env.local.example` does not actually exist yet** despite older docs
  referencing it. Create it as part of the first build step.

---

## Decisions (CORRECTED this session — these override the older "locked" list)

1. **MULTIPLE teachers.** _(Overrides the old "one teacher / single teacher owns
   everything.")_ The account model has a role layer above classes: a teacher
   owns one or more classes; each class is its own deck.

2. **Each class capped at 9 students.** (The 3×3 grid is baked into the engine —
   a real invariant to enforce in the schema.)

3. **One class per student** for now (a student row carries a `class_id`; no
   many-to-many). Revisit only if multi-class membership is ever actually needed.

4. **Moderation model — adult community, teacher-gated uploads.**
   _(Overrides the old "minors-first / lock down self-signup because under-18.")_
   - Users **affirm they are adults (18+) at signup.** This affirmation is the
     primary safeguard; it removes the need for the heavier minor-protection
     apparatus the old plan assumed.
   - **Uploads require teacher approval.** When a student retires an existing
     deck video and uploads their own, the new submission enters a **`pending`**
     state and only becomes **`live`** in the deck once the teacher approves.
     This is where the moderation gate sits — at the moment new content enters
     the shared space. It composes cleanly with the existing archive rule.
   - **Comments: student report/censor + teacher resolution.** A report/flag
     path on comments, resolved by the teacher, is sufficient for an adult
     community. (Heavier pre-moderation of every comment is NOT required given
     the adult affirmation, though the `status` machinery makes it cheap to add
     later if wanted.)
   - **One state machine covers both.** Upload-approval and comment-reporting are
     both just a `status` field (`pending`|`approved`/`live`|`removed`) with the
     teacher as resolver. Build the mechanism once; it serves both. This is why
     adding moderation now is cheap, not a tax.

5. **Creator-upload slice first** (per the kickoff's "the first real problem").

6. **Reuse the existing `groovr-creator` Supabase project** (confirmed clean +
   healthy above). Wire `.env.local` at the start of the build session — by the
   project owner, on their machine. Keys never go into the repo or into chat.

7. **Photos as first-class submissions; consider photos-FIRST.**
   _(New this session.)_ A submission may be a photo, not only a video. A photo
   has no duration, so the player beat becomes "it appears → look → comment"
   rather than "watch it play → comment." Strong candidate for the **first**
   real milestone because a photo pipeline (upload→storage→display) is the
   simplest possible end-to-end proof — no length cap, no transcoding — before
   video adds complexity. **Videos stay SHORT** (suggested cap well under a
   minute; keeps files small, keeps the deck snappy, keeps the celebration tight,
   and keeps everything comfortably online — no offline mode needed).

8. **Audio scope: ONE reading-audio per student** (the student reading their own
   description aloud), routed **teacher-only**. _(Settled this session.)_ Spoken
   responses to *peers'* videos are explicitly OUT of scope for now to avoid
   audio sprawl; written peer responses are captured in text. Additive later if
   wanted — not a redesign.

---

## The product, in one breath (the spine to build toward)

A **class** is a deck of up to nine media submissions. Each **submission** is one
student's photo or short video, plus a written description (in any language the
student chooses — no in-app translator; `descriptionL1` stays a dormant seam),
plus one teacher-only audio of the student reading their description aloud.
**Teachers** create classes and may seed a new class with their own nine items;
as each student joins they upload one submission and retire one existing item to
the archive — and the new submission is **pending until the teacher approves it.**
The **game** (online, played in-browser) shuffles the deck, the player stops it,
watches/looks at a random submission, and **must write a comment before returning
to the shuffle** (the comment gate already exists). Those comments become the
teacher's **CSV deliverable** (already built). A **favorites** button feeds a
future **live celebration** ("dance party"): everyone's favorites played
back-to-back with music — the one genuinely synchronous moment; in scope, with
clean seams left, nothing built yet.

The retired items from a full class become the **seed deck for the next cohort** —
classes chain, so a teacher seeds once and each class is seeded by the graduating
echo of the previous one.

---

## What already exists and WORKS (verified in code — don't rebuild)

- **The shuffle-stop engine** (`src/game/spotlight.jsx`, ~950 lines), playable at
  `/play` with no account/backend.
- **The mandatory-comment gate** — can't return to the shuffle without commenting.
- **The archive model** — new upload pushes to front; old entry slides to archive
  **with its description welded to it**, never re-associated. (`students.js`,
  `addEntry()`.)
- **Favorites** — built; the celebration's input.
- **The CSV deliverable** — `buildSessionRows` / `buildSessionCSV` in
  `students.js`: player, video, favorited, comment text.
- **Engine reads from ONE content list** (`students.js`). The entire online job
  is "make that list come from the DB" via a thin snake_case→camelCase adapter,
  **without touching the engine.**
- **Dormant seams already in place:** `SOCIAL` master switch (peer comments,
  currently `false`), `descriptionL1` (translation), `readingAudio`
  (teacher-only). Wire these up; don't recreate them.
- **Auth plumbing** (reused from Groovr): Supabase login/signup/callback, the
  session `proxy.ts`. `PROTECTED_PREFIXES` is empty — add `/dashboard`,
  `/upload`, etc. as those land. Auth is dormant until `.env.local` is wired.

---

## Build order (the upload slice)

1. **Wire `.env.local`** to the `groovr-creator` Supabase project (owner does
   this; keys stay on the machine). Create `.env.local.example` (it's missing).
   Confirm auth activates and the auth pages stop saying "accounts not enabled."
2. **Schema as SQL migrations + RLS** (NOT hand-clicked):
   - `profiles` (adapt the existing table): add `role` (`teacher`|`student`),
     `color`, `class_id`.
   - `classes` (teacher_id FK, name).
   - `entries` — the heart: `student_id`, `class_id`, `media_url`, `media_type`
     (`photo`|`video`), `description_text`, `description_l1` (dormant),
     `reading_audio_url` (teacher-only), `uploaded_at`, **`status`
     (`pending`|`live`|`archived`)** enforcing both the archive rule and the
     upload-approval gate. Exactly one `live` per student per class.
   - `peer_comments` (dormant until SOCIAL): + `status` + `reviewed_by/at`.
   - `reports` (`reporter_id`, `target_type`, `target_id`, `reason`, resolution).
   - `sessions` + `session_comments` (the CSV's real home).
   - Storage buckets: `media` (classmate-readable) and `reading-audio`
     (teacher-only, RLS-locked).
   - **Enforce the 9-student-per-class cap.**
   - RLS per role — teacher-only stays teacher-only by policy, not by UI hiding.
3. **Teacher roster flow** — create class, invite/add students (teacher-owned).
4. **Creator-upload UI** — pick photo/short video → write description → record
   the one reading-audio → writes an `entries` row (status `pending`) + files to
   storage. (Consider photo-only for the very first end-to-end pass.)
5. **Teacher approval + dashboard** — review pending uploads (approve→`live`),
   see the class, collect the CSV/written-response data, hold the teacher-only
   audio. (This dashboard is organizationally the most important surface — a lot
   of language material flows to the teacher.)
6. **Thin adapter** — snake_case DB rows → the camelCase `STUDENTS` shape the
   engine already reads, so `spotlight.jsx` stays untouched.

Later seams (not now): flip `SOCIAL = true` for peer comments (backed by the
`status`/report machinery); the live celebration; `descriptionL1` translation
(needs a server + translation API); roaming save/resume (localStorage → account).

---

## Next.js 16 facts that bite (from the bundled docs — differ from old training)

- This is **NOT** the Next.js most training data knows. Read
  `node_modules/next/dist/docs/` before writing routing/caching/data code.
- "Middleware" is now **"Proxy"** (`src/proxy.ts`, already correct).
- **Proxy is for optimistic checks only — NOT the authz solution.** Real authz =
  **Supabase RLS + Server Actions.** Don't put permission logic in `proxy.ts`.
- Mutations/auth use **Server Actions** (`<form action={serverFn}>` +
  `useActionState`) — for both teacher roster actions and the upload write path.
- Watch the **upload body-size limit** (`proxyClientMaxBodySize`) — relevant the
  moment real media uploads start.

---

## Working agreement (how the human + Claude split this)

- **Human holds:** the editor (VS Code), the Supabase dashboard, and all keys.
  Wires `.env.local` personally; runs migrations against Supabase; performs any
  action involving live credentials. (Claude will never handle real keys.)
- **Claude holds:** the code and the design — writes migrations, RLS, Server
  Actions, the upload UI, the adapter, the dashboard; reads the repo via
  `git clone` of the public URL.
- **Per session:** start a **fresh chat** for build work; hand Claude the public
  repo URL; Claude clones the current state. This doc is the durable memory so
  decisions don't rely on chat history.
- **Housekeeping pending (human, anytime):** delete the single test row in
  `profiles` (the row only — keep the table/columns; structure changes come via
  migrations, not by hand).
