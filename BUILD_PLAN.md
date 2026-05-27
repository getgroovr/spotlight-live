# Spotlight Live — Build Plan (revised, May 2026 — corpus-first)

_Revised after the design session of 2026-05-27. Supersedes all prior
revisions. The most important change in this revision is the **opening
paragraph** — the product's purpose, which had drifted out of earlier
drafts, is restored to first place._

---

## What this product is, in one paragraph

**Spotlight Live is an English-language teaching instrument that uses a
shuffle-stop photo/video game as its language-elicitation method.** Students
play a game; the game requires them to write a comment about each item they
see; **every comment is captured, attached to the student's name, and
accumulated over time as a longitudinal record of that student's English
language production**, which the teacher reads and evaluates. The game is
the trick that makes the corpus collection feel like play instead of work.
Every other feature in this app — classes, rounds, peer comments, the future
"dance party" celebration — exists to keep students engaged enough to keep
generating language, and to give the teacher useful structure around the
collection. If a design decision serves the collection or the teacher's
evaluation of student language, it earns its place. If it doesn't, it
shouldn't be built.

This is, in your own words, "an English class — or a program, if multiple
teachers are involved." The current build is single-teacher (Mike); the
data model and architecture should not foreclose multi-teacher down the
road, but no multi-teacher features are in scope yet.

---

## Status as of this revision

Schema is **deployed** on the `groovr-creator` Supabase project (all 9
migrations live; 7 Spotlight tables + the `entries_public` view standing;
6 leftover Groovr tables dropped after a foreign-key audit; both storage
buckets provisioned). The app builds and runs locally; `.env.local` is
wired; `npm run dev` reaches Ready; the client-side game loop
(shuffle → stop → mandatory comment → archive) works end-to-end against
placeholder content. The Supabase CLI was added as a dev dependency and
pushed. **No feature code is written yet.**

See `SCHEMA_AUDIT.md` for a table-by-table read of the existing schema
against this revised model.

---

## The model

### The front door: a generic deck, always on

There is **one always-on generic deck** that anyone can play without an
account or with a fresh signup — no class membership required, no code
required. This is the public face of the app and the universal first
experience.

- The generic deck's items are seeded by the teacher (you, Mike).
- Each item is a photo with an existing description written by its author
  (you).
- The deck has a **pool** of items, not necessarily exactly nine. The
  engine plays nine at a time, but the pool can be larger; a play session
  shuffles nine from the pool, so the front door doesn't get stale on
  repeat visits.
- A new visitor signs up (or plays as a guest if we decide to allow that
  later — see open questions), is shown the deck, and must write a comment
  on every item — the mandatory-comment gate already enforces this in the
  engine.
- **Every one of those comments is saved against the student's account.**
  This is the corpus collection starting from the very first visit.

### After playing: request to join a class

After completing the generic deck (commenting on all nine items in their
play session), the student is offered the chance to **request to join a
class** by:

- completing their profile (display name, color, bio, etc.),
- submitting one of their own photos with a written description (a voice
  recording of the description is part of the schema as `reading_audio` but
  is **deferred**; photo + written description first).

The request lands in a **teacher-only holding area** — an `entries` row
with `status = 'pending'`, plus the profile updates, visible only to the
teacher. The student doesn't get into a class yet; they just wait to be
admitted.

### Admission: codes as admission letters, not signup links

When the teacher accepts a student, the teacher hands them a **class
code**. The code is the credential the student uses to enter a specific
class. Because the teacher chooses which code to send to whom, this is
how skill-level sorting happens from day one: a beginner-level student
gets the beginner code; an intermediate student gets the intermediate
code. The teacher can issue different codes for different classes.

The code is *not* publicly advertised. It's not a "join this class" link
on the homepage. It's something the teacher gives a particular student
after deciding they belong in a particular class.

A class doesn't **begin playing its own deck** until it's full — nine
students with the same code, each having submitted their media, all
admitted. During the fill period, an admitted student sees a **"Waiting
for your class to fill — 4 of 9"** page (or similar), with a **link to
replay the generic deck** as a low-stakes loop. Replaying the generic
is itself useful: it generates more language data into the student's
corpus.

### Once a class is full: rounds inside the class

When the ninth student is admitted, the class begins. The deck for Round 1
is the **nine submissions** those nine students made on the way in.
Students play the deck; the mandatory comment on every item applies as
always, and **every comment goes into the corpus**, now indexed by which
class and which round it was produced in.

Across roughly ten rounds, students keep submitting new media and the
teacher keeps approving; each round's deck is the previous round's
submissions. Between rounds, the teacher can move individual students to
a different class (the skill-sorting flow) by giving them a new code.

### What ends a round (OPEN QUESTION, parked)

Genuinely undecided as of this revision. Candidate mechanisms:

- **All-nine trigger:** round ends when 9 new submissions are approved and
  every student has commented on every other student's media.
- **Six-or-more trigger:** ends when 6 (or 7, 8) students have completed
  commenting + submission; the new deck mixes new submissions with
  held-over items.
- **Teacher manual:** the teacher declares a round over and rolls the
  deck.

This is best decided after the first version is in real use. For now,
**build round mechanics without auto-advance** — the teacher can manually
roll the deck once they've approved nine submissions.

### Deferred features (real, just not now)

- The 24-hour timeout + dropout-replacement rule.
- The round-advance mechanism (the open question above).
- The final celebration ("dance party") — favorites played back-to-back
  with music; the synchronous moment.
- Reading audio (teacher-only voice recording of the student's
  description). Schema seam present.
- Translation (`description_l1` → English). Schema seam present.
- Video submissions (photo first; schema already supports video).
- Email notifications (provider TBD).
- Multi-teacher / program-level features.

---

## The corpus collection — what it is, where it lives, what the teacher sees

This section deserves to be a section, because the corpus *is* the
product.

**Per-student data accumulated by the app:**

- Every comment the student writes during a play session, attached to:
  - the exact `entries` row they were commenting on (so the prompt is
    preserved alongside the response, not just the response in isolation),
  - the timestamp,
  - the session (generic vs. a specific class round),
  - whether they favorited the item.
- The student's own submitted descriptions (written, and later voice).
- The student's own peer comments to classmates' media (once peer
  comments are enabled — currently dormant).

The schema's `session_comments` table already stores comments with
`(session_id, entry_id, comment, favorited, created_at)` and a unique
constraint that means re-commenting updates the same row. Joined against
`sessions` (which carries `player_id` and `class_id`) and `entries`
(which carries the prompt's `description_text`, `student_id`, and
`uploaded_at`), the corpus is fully reconstructible per student.

**Does the student see or build a spreadsheet themselves?**

No. The student just plays the game and writes comments; the **app**
silently builds the language record on the teacher's side. The student
doesn't manage the corpus, doesn't send anything, doesn't see a
spreadsheet view of their own output. The invisibility is what makes
this work as a language-elicitation method — the student is engaged in
play, not in documentation. The CSV export
(`buildSessionRows` / `buildSessionCSV` in `students.js`) is the teacher's
take-home of this data.

**The teacher's view of the corpus is the most important surface in the
app.** It is not an admin panel decorated with student data. It is a
research instrument: per-student, every comment that student has ever
produced, in chronological order, alongside the prompts that elicited
them, exportable to CSV. This view is what makes the teacher's job
possible. Slice 1A in the build order below does not yet build it, but
the *next* slice after that absolutely should.

---

## What already exists and WORKS (don't rebuild)

- **The shuffle-stop engine** (`src/game/spotlight.jsx`, ~950 lines),
  playable at `/play` with no account.
- **The mandatory-comment gate** — can't return to the shuffle without
  commenting. (This gate is what makes corpus collection possible.)
- **The archive model** — new live entry displaces old, with the old
  entry's description welded to it. (`students.js addEntry()`; mirrored
  in DB by `approve_entry()`.)
- **Favorites** — the future celebration's input.
- **The CSV deliverable** — `buildSessionRows` / `buildSessionCSV` in
  `students.js`. **This is the corpus-export shape.**
- **Engine reads from ONE content list** (`students.js`). The online job
  is "make that list come from the DB" via a thin snake_case→camelCase
  adapter, without touching the engine.
- **Auth plumbing:** Supabase login/signup/callback; `src/proxy.ts`
  session refresh. `PROTECTED_PREFIXES` empty — add as routes land.
- **Dormant seams in code:** `SOCIAL` master switch (peer comments,
  currently false), `descriptionL1` (translation), `readingAudio`
  (teacher-only).
- **The entire database schema** — 9 migrations live, all RLS, storage
  buckets, the `entries_public` view, the `approve_entry` and
  `assign_student_to_class` RPCs. See `SCHEMA_AUDIT.md`.

---

## Build order

Slices are organized so each one produces something **demonstrable in
isolation**, and each one is a step toward "every comment a student
writes is sitting in the teacher's corpus view, attached to that
student's name."

### Slice 1 — First comments into the corpus

The smallest possible end-to-end loop that proves the product's actual
purpose. Three sub-slices.

**1A. Generic deck on the front door, reading from the DB.**

- Seed the generic deck: nine `entries` rows owned by the teacher (you),
  with photos uploaded to the `media` bucket under
  `media/<demo_class_id>/<teacher_id>/...`. Mechanically: the "demo
  deck" is a real `classes` row that the teacher owns, with nine live
  entries. Path of least resistance — no schema change required.
- A thin snake_case→camelCase adapter shapes `entries_public` rows into
  the `STUDENTS` array the engine wants. The engine itself is not
  touched.
- The `/play` route, today static, switches to reading from the DB via
  the adapter. Anonymous visitors can still play (a guest session is
  fine for the first visit; we'll add signup-on-the-way-out).

**1B. Sessions and comments persisted under the player's account.**

- When a logged-in user plays, write a `sessions` row at the start and
  `session_comments` rows as they comment. The unique
  `(session_id, entry_id)` constraint already means re-commenting
  updates the same row, matching the engine's behavior.
- For not-yet-signed-up visitors: hold their comments in browser memory
  through the play session, then prompt them to sign up at the end and
  hydrate their session into the DB on signup. (Or: require signup
  before playing. Decide in 1B.)

**1C. The teacher's first view of the corpus.**

- A `/teacher/students/[id]` page showing every comment that student has
  produced, with the prompt (the entry's `description_text` and the
  photo) alongside each comment, in chronological order.
- A `/teacher/dashboard` with a list of students who've played, ordered
  by most-recent activity.
- This view is the **first deliverable that exercises the product's
  actual purpose.** Everything before this is plumbing.

**What ends Slice 1:** a new visitor plays the generic deck, signs up,
and the teacher (Mike) can log in and read every comment that visitor
wrote, attached to their name, in a usable per-student view. *No
classes, no codes, no rounds yet. Just: a student played, and their
language is in the teacher's hands.*

### Slice 2 — Class formation and admission

- Profile completion + submission UI (the "request to join a class"
  flow at the end of a generic playthrough).
- Teacher's holding area: see pending requests, approve some, reject
  others.
- Class creation: a teacher creates a class and gets a class code
  (`SCHEMA_AUDIT.md` GAP 1 — small migration first).
- Code redemption: a `join_class_by_code` RPC; an admitted student
  enters their code and is placed in the matching class.
- The "Waiting for your class to fill — N of 9" page; the
  replay-the-generic link.

### Slice 3 — Class rounds (manual advance)

- A full class begins playing its deck (the nine admitted students'
  submissions).
- Sessions and comments accumulate in the corpus, now indexed by class
  and (eventually) round.
- The teacher can manually roll the deck once nine new submissions are
  approved.

### Slice 4 and beyond

In rough order, depending on what the first three slices teach us:

- The round-advance mechanism (resolve the open question).
- Peer comments live (flip `SOCIAL = true`); reports + teacher resolves.
- Class-code-based reassignment between rounds.
- 24-hour timeout + dropout replacement.
- Email notifications.
- Reading audio (teacher-only voice recording).
- Video submissions.
- Translation (`descriptionL1`).
- The celebration.
- Multi-teacher / program-level admin.

---

## Next.js 16 facts that bite (different from training)

- This is **NOT** the Next.js most training data knows. Read
  `node_modules/next/dist/docs/` before writing routing, caching, or
  data-fetching code. `AGENTS.md` is explicit about this.
- "Middleware" is now **"Proxy"** (`src/proxy.ts`).
- **Proxy is for optimistic checks only — NOT the authz solution.** Real
  authz = Supabase RLS + Server Actions.
- Mutations/auth use **Server Actions** (`<form action={serverFn}>` +
  `useActionState`).
- Watch the **upload body-size limit** (`proxyClientMaxBodySize`) when
  the upload UI lands.

---

## Working agreement

- **Mike holds:** the editor (VS Code), the Supabase dashboard, all keys.
  Personally wires `.env.local`; runs migrations against Supabase; performs
  any action involving live credentials or pushing to the live repo.
  Claude never handles real keys and never pushes on Mike's behalf.
- **Claude holds:** the code and the design — writes migrations, RLS,
  Server Actions, UI, the adapter, the teacher's corpus view. Reads the
  repo via `git clone` of the public URL.
- **Per session:** start a fresh chat for build work; hand Claude the
  public repo URL; Claude clones the current state. This doc +
  `SCHEMA_AUDIT.md` are the durable memory across sessions.
- **Pacing:** build in named slices; Mike reviews every commit in Source
  Control before pushing.

---

## Where to start next session (one paragraph for next-Claude)

The schema is deployed; this build plan + `SCHEMA_AUDIT.md` reflect the
current model. **Begin Slice 1A:** seed the generic deck (nine teacher-
owned entries in a designated "demo" class) and switch the `/play` route
to read from the DB via a thin snake_case→camelCase adapter. The engine
itself does not need to change. Before writing any code, read
`node_modules/next/dist/docs/` for Server Actions, data fetching, and
file uploads — the training-data version of Next.js 16 is wrong here.
The opening section of this document — **the product is an English-
teaching instrument whose purpose is to collect each student's language
production for teacher evaluation** — is the lens to hold every design
decision against. If a feature serves the corpus or the teacher's
evaluation of it, build it. If it just decorates the game, defer.
