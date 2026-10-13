# SLICE 1 HANDOFF #15 — Social slice STEP 1 (schema) BUILT & VERIFIED; STEP 2 (logic layer) DELIVERED but UNRUN

**Date written:** 2026-06-02 (later same day as #14)
**Picking up from:** Handoff #14 (social slice fully SPEC'd — 5 rounds, spotlight every round, one-win cap, grand-total class winner, two approval gates, 24/22/24 clock, adults-only; nothing built)
**Going into:** Continue the BUILD. First action next session: RUN + PROVE the logic migration (it was written but never run — we timed out). Then build the teacher approval SURFACE.
**Destination for this file:** `docs/handoffs/`

---

## TL;DR for next Claude

1. **This was a BUILD session and it produced real, verified schema.** #14 was spec-only; this session wrote and (for step 1) verified the foundation in the database.
2. **A key fork was decided: OPTION A.** The social slice is built in the **live-game identity world** (`students` / `enrollments` / `game_sessions`, email-keyed), NOT the engine world (`profiles` / `entries`, `auth.uid()`-keyed). Reason below — it's the world where rounds, enrollment status, and the entry-round favoriting already live.
3. **OPEN INTENT #2 (from #14) is RESOLVED against code: NO stored per-pic student description ever existed** in the live-game world. `game_sessions` holds comments/favorites as jsonb keyed by a teacher entryId + a `favorite_comment` ("why I liked that teacher pic"). So `description` is genuinely a new field. Recorded as confirmed-NO.
4. **TWO migration files were produced this session:**
   - `20260602120000_social_slice_foundation.sql` — **RAN + VERIFIED LIVE.** Tables, enum, helper, `dropped` status.
   - `20260602130000_social_slice_logic.sql` — **WRITTEN + DELIVERED, NOT YET RUN.** The approve/reject RPCs + tally/winner reads. **This is the first thing to do next session** (run in SQL Editor, then the proof queries at the bottom of the file).
5. **The schema-location decision: stay in `public`, plain names, rules-in-code. No `spotlight` schema.** Driven by Mike's stated future plan ("if a new game comes, copy the whole project and re-skin it"). If you copy everything anyway, a schema namespace buys nothing and adds Supabase API friction. The cheap separation we DID take: tables store neutral facts, game rules (5 rounds, the cap, grand-total winner) live in server actions / SQL functions, not in column names.

---

## What this session accomplished

### The fork (settled): OPTION A — build in the live-game world

Reading the actual migrations surfaced something #14 couldn't see: the DB has **two parallel, barely-connected identity worlds**, bridged only by `is_enrolled_in()` matching `students.email` to `auth.users.email`:

- **Engine world** — `profiles` + `entries` + `peer_comments`, keyed on `auth.uid()`. Crucially, `entries` is ALREADY a student-pic upload table with `media_url`, `description_text`, a `pending → live → archived` approval state machine, the `approve_entry()` RPC, and a one-live-per-student index. `peer_comments` already has a `pending/approved/removed` state. Much of what #14 called "net-new" exists here in skeleton — but wired to the wrong identity model.
- **Live-game world** — `students` + `enrollments` + `game_sessions` + `teacher_comments`, keyed on `auth.email()`. This is where rounds, `enrollments.status`, and the entry-round favoriting actually run. It had NONE of the approval machinery. `entries` doesn't even have a `round` column (it has `pod_number`).

**Decision: OPTION A — build the social slice in the live-game world**, mirroring the engine world's approval pattern as a REFERENCE design, not depending on it. Rationale: it keeps the build BESIDE the live game (which has verified users) rather than retrofitting the running game's identity onto `profiles` — the exact "retrofit onto a live thing" direction #13/#14 warn is the dangerous one. **Unifying the two identity worlds is now documented debt, not this slice's job.** (Teacher identity stays engine-world: a teacher is a `profiles` row, owns classes via `classes.teacher_id = auth.uid()`, which is why `reviewed_by → profiles` and teacher policies reuse `owns_class()`.)

### STEP 1 — schema foundation (`20260602120000_social_slice_foundation.sql`) — RAN + VERIFIED

Adds (all in `public`):
- `submission_status` enum — `pending | approved | rejected`.
- `public.submissions` — per-round student pic + `description` + upload-gate `status`. `unique(student_id, class_id, round)` (one pic per student per round; a rejected pic is RESUBMITTED by updating the same row back to pending).
- `public.submission_comments` — peer comments on a submission + comment-gate `status` (default `pending`; the reveal reads `approved` only). Kept as a SEPARATE object from `teacher_comments` per #14.
- `public.submission_favorites` — one favorite per student per round, FK to a submission. The cross-student tally SUBSTRATE. `unique(voter_student_id, class_id, round)`.
- `public.my_student_id()` — RLS helper (caller's `students.id`, via `auth.uid() → users.email → students.email`), parallel to `my_class_id()`.
- `enrollments.status` CHECK widened to `active | completed | dropped`.
- RLS on all three new tables (student reads own + approved-in-enrolled-class; teacher moderates own class via `owns_class()`).

**Verified live (in the Supabase SQL Editor, this session):**
- Ran clean ("Success. No rows returned").
- `relrowsecurity = true` for `submissions`, `submission_comments`, `submission_favorites` (screenshot-confirmed).
- Policy counts: `submissions` = 4, `submission_comments` = 3, `submission_favorites` = 3 (screenshot-confirmed).
- (The `enrollments_status_check` / one-active-index proof queries were in the batch but their output scrolled off; the partial index `one_active_enrollment_per_student` is `WHERE status='active'`, so `dropped` is excluded by construction — a dropped student can hold a new active enrollment elsewhere. Re-eyeball the CHECK next session if you want belt-and-suspenders: `select pg_get_constraintdef(oid) from pg_constraint where conname='enrollments_status_check';` — expect `dropped` present.)

### STEP 2 (logic layer) — `20260602130000_social_slice_logic.sql` — DELIVERED, **NOT RUN**

All SQL, teacher-verifiable, no front-end. SECURITY DEFINER + self-authorizing via `owns_class()`. Mirrors `approve_entry()`'s style; no archive dance (one pic per student per round, nothing to displace).

- GATES (writes): `approve_submission(uuid)` / `reject_submission(uuid)`; `approve_comment(uuid)` / `reject_comment(uuid)`.
- TALLY (pure reads): `tally_round(class, round)` raw counts; `class_round_winners(class)` round winners WITH the one-win-per-student cap + runner-up reassignment (the RULE, recomputed from favorites, nothing stored); `class_grand_totals(class)` favorites per student across all rounds (top row = class winner, no exclusions).
- Tie-breaks are simple placeholders, in code: round-winner ties → earliest submission then id; grand-total ties → student id. Change freely.

**Status: written and handed to Mike as a file. We TIMED OUT before it was run.** Do NOT record it as done. **First action next session: run it in the SQL Editor, then run the proof queries at the bottom** (expect 7 functions; the three reads run and return 0 rows on empty data; the auth guard raises for a non-owner).

---

## Schema truths to hold as ground truth (additions this session)

- New tables `submissions`, `submission_comments`, `submission_favorites` exist in `public`, RLS on. Enum `submission_status` = pending/approved/rejected.
- `submissions`: `(id, student_id→students, class_id→classes, round, media_url, description default '', status, reviewed_by→profiles, reviewed_at, created_at)`, `unique(student_id,class_id,round)`.
- `submission_comments`: `(id, submission_id→submissions, author_student_id→students, class_id→classes, round, body, status default 'pending', reviewed_by→profiles, reviewed_at, created_at)`.
- `submission_favorites`: `(id, voter_student_id→students, submission_id→submissions, class_id→classes, round, created_at)`, `unique(voter_student_id,class_id,round)`.
- `enrollments.status` now `active|completed|dropped`; one-active partial index unchanged (excludes dropped by construction).
- `my_student_id()` exists alongside `my_class_id()` / `is_enrolled_in()` / `owns_class()`.
- (Unverified until step-2 migration runs) the 7 functions above.

---

## OPEN INTENTS / known soft spots (carry forward)

1. **Logic migration unverified** — run + prove it first thing. (See above.)
2. **Soft integrity gap (app-layer):** `submission_comments` and `submission_favorites` each carry their own `class_id`/`round`; the DB does NOT force them to match the parent submission's. The insert path must set them from the submission. A trigger can harden later — not done (kept basic).
3. **Re-joining the SAME class after a drop** collides with `unique(student_id, class_id)` on enrollments → it's an UPDATE of the dropped row back to active, not a new insert. Note for the drop/backfill pass.
4. **Two identity worlds = documented debt.** Not to be unified in this slice.

---

## DELIBERATELY NOT BUILT YET (next passes, in order)

- **Teacher approval SURFACE (Step 2 UI — the next build).** The screen that calls `approve_submission` / `approve_comment` and closes a round. The gating dependency for the student screen. **Needs the repo tree + existing teacher-side code so it matches conventions.**
- **The round STATE MACHINE + reveal orchestration:** "reveal = teacher approves the FINAL comment" → fires the tally, crowns the round, starts the next round's clock. Plus the 24/22/24 daily clock and auto-completion at round 5 (→ `class_grand_totals` → class winner → `enrollments.status = completed`). The step-2 functions are the primitives this will call.
- **Combined student screen** (vote prev round + upload next + describe), the standalone round-1 upload screen, and the round-5 vote+reveal+opt-in-re-enroll screen. (Four screen shapes per #14.)
- **Miss tracking + two-consecutive-miss drop + pool/backfill.**
- **Storage** path + RLS for submission pics. `media_url` is just text today; the existing `media`-bucket policy is wired to engine-world identity (`my_class_id()`/`auth.uid()`) and won't authorize a live-game student cleanly. Settle when building the upload screen.
- **18+ attestation** column (one-liner; add with the enrollment screen). Per #14 it's a TERMS mechanism, not a filter — keep that caveat attached.

---

## Working agreement (unchanged, still in force)

- Mike holds editor, Supabase dashboard, all keys, all pushes. Claude never handles real keys, never pushes.
- Whole-file artifacts as DOWNLOADABLE FILES with full destination path. New routes → new folder.
- Mike isn't fluent in JS/TS but IS confident at Supabase SQL — lean on SQL proof queries; verify before declaring done. (This session: schema proven by SQL; logic NOT yet proven — say so.)
- Verify-before-declaring, ESPECIALLY git: `git status` / `git show --stat HEAD` before trusting commit state.
- Migrations folder = STRUCTURAL only. Run-in-dashboard AND save to `supabase/migrations/` for every structural change. **Both files this session belong there once run.**
- His asides are usually the right call — listen for them. (This session his "keep things separate / I might make a different game" aside set the public-schema + rules-in-code direction.)

---

## First-message-to-next-Claude

Read this whole doc, plus #14 (the spec) and #13.

**FIRST, verify git + run the logic migration.**
1. `git status` / `git show --stat HEAD` — confirm `supabase/migrations/20260602120000_social_slice_foundation.sql` is committed (it ran live; make sure the file is actually in the repo, not stranded on the desktop — the #12/#13 trap).
2. Run `supabase/migrations/20260602130000_social_slice_logic.sql` in the SQL Editor, then its proof queries. Expect 7 functions; the three reads run (0 rows on empty data); the `owns_class` guard raises for a non-owner. Only then record the logic layer as verified.

**THEN build Step 2 — the teacher approval surface.** It's the gating dependency for the student screen and where round-closing/reveal will live. Ask Mike for the repo tree and the existing teacher-side code (and the entry-round favoriting component) so the screen matches conventions and reuses the favoriting UI. Build bottom-up; do not start with the pretty student screen.

State of the build in one line: **social-slice DATA layer is live and verified; LOGIC layer is written and waiting to be run; no UI yet.** Option A (live-game world, public schema, rules-in-code) is the spine — keep building beside the live game, not under it.
