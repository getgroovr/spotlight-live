# SLICE 1 HANDOFF #17 — Option R chosen; pre-seed reconnaissance DONE, seed not yet written

**Date written:** 2026-06-02 (later same day as #16)
**Picking up from:** Handoff #16 (teacher moderation surface built + verified end-to-end; fork to discuss: Option R reveal-orchestration vs. Option S storage+upload).
**This session:** Mike picked **Option R**. Did the read-only reconnaissance needed before writing the tally-proof seed. Verified git, confirmed TEST cleanup, pinned `submission_favorites` columns, and discovered there are TWO public classes (not one). Short session by design — Mike is picking this up again next time.
**Going into:** Write the rigged tally-proof seed (submissions + favorites from scratch), run the three tally RPCs, prove the one-win cap. NO orchestration app code until that proof is green.
**Destination for this file:** `docs/handoffs/`

---

## TL;DR for next Claude

1. **Fork resolved: Option R (reveal / round-close orchestration).** Build the round-close logic off the moderation surface, proven bottom-up against SEEDED favorites + the three tally RPCs, before any student-facing screen. (Option S — storage + student upload — is deferred, unchanged.)
2. **#16's two verify-first items are BOTH CLOSED:**
   - **Git:** the three `teacher/social` files are committed AND pushed. Commit `75add03` on branch `slice-1a`, "3 files changed, 628 insertions(+)", `git status` = "nothing to commit, working tree clean", up to date with `origin/slice-1a`. Handoff 16 also committed. **Do not re-verify.**
   - **TEST seed cleanup:** confirmed done. Query C (approved/pending submissions in both public classes) returned ZERO rows — the approved TEST submission from #16 is gone. Open intent #2 from #16 is closed.
3. **NEW FINDING — there are TWO public classes, both owned by teacher `18f23db0-0b2f-4f30-914a-233c3a73c305`:**
   - **`d9ce91d4-793f-4ed9-81ea-201c0d15602e`** — created 2026-05-27 22:47 — the OLDER one. This is what the `is_public = true … limit 1` resolver (used by deck/play/the moderation surface) most likely lands on, so it's the one the surface has been exercising.
   - **`bac4d923-8eaa-4feb-8e68-cbbe6d0d82aa`** — created 2026-06-01 20:53 — the NEWER one (~5 days later).
   - This explains the "Mr. D appears twice" oddity from the voters query: he's enrolled (active) in one and (completed) in the other. Two different `class_id`s → `unique(student_id, class_id)` is intact. Data is NOT corrupt.
   - **Two public classes is probably unintended (test debris).** The `limit 1` resolver silently favors one — the soft spot #16 already flagged ("revisit if a teacher owns several") is now LIVE. Not next session's job to fix; just know it's there.
4. **DECISION FOR NEXT SESSION: pick ONE class as the proof target and HARDCODE its id everywhere in the seed-and-prove. NEVER use `limit 1` in the proof.** Both classes are empty (see #5), so the pick is free on data grounds. **Lean: the older `d9ce91d4…`**, since it's what the surface resolves to.
5. **BOTH public classes have ZERO submissions** (query C: "Success. No rows returned"). So the seed cannot be favorites-only — there's nothing to attach favorites to. **The seed must build the whole chain from scratch:** insert approved submissions per round FIRST, then favorites pointing at them. This is cleaner — every count is controlled, so the one-win-cap proof is unambiguous.
6. **`submission_favorites` columns are now GROUND TRUTH** (from `information_schema`): `id uuid`, `voter_student_id uuid`, `submission_id uuid`, `class_id uuid`, `round integer`, `created_at timestamptz`. ALL NOT NULL. **The voter column is `voter_student_id`, NOT `student_id`** — easy to get wrong. The table carries its OWN `class_id` + `round` that the DB does NOT force to match the parent submission (soft spot #3, still open) — so the seed must set `class_id`/`round` by hand from the parent submission, or the tally miscounts.

---

## RPC contracts (carried from #16, still ground truth — confirmed via pg_proc)

- `approve_submission(p_submission_id uuid)` / `reject_submission(p_submission_id uuid)` → return a `submissions` row.
- `approve_comment(p_comment_id uuid)` / `reject_comment(p_comment_id uuid)` → return a `submission_comments` row.
- `tally_round(p_class_id uuid, p_round integer)` → `TABLE(submission_id uuid, student_id uuid, favorite_count bigint)`.
- `class_round_winners(p_class_id uuid)` → `TABLE(round integer, submission_id uuid, student_id uuid, favorite_count bigint)`. **This is the one that applies the one-win cap + runner-up reassignment — the behavior the seed must exercise.**
- `class_grand_totals(p_class_id uuid)` → `TABLE(student_id uuid, total_favorites bigint)`.

## `students` columns (carried from #16, ground truth)

`id uuid, name text, email text, photo_url text, created_at timestamptz, screen_name text`. Display name = `name || screen_name || email`. (`photo_url` is the student avatar, NOT the submission photo.)

## Active voters available in the public class (from #16's voters query)

- Lovesick (screen_name Lovesick) — `055a4c6c-66d5-4a9d-8db7-9dfef1681c15`
- Michael Dorsten (screen_name Mike) — `470130a8-5a2e-4eed-99f1-67223d53e370`
- Mr. D (screen_name Mike D) — `d8b2c7af-5439-4f86-9ba9-83651a73a272` (the one with two enrollments across the two public classes)

NOTE: this voters list came from a query that joined on `is_public = true` WITHOUT pinning a class, so it spans both public classes. Next session: re-confirm which of these students are enrolled in the CHOSEN target class specifically before using them as voters/authors in the seed.

---

## EXACTLY where we are: ready to seed, nothing half-applied

Tonight ended cleanly. No migration is half-run, no file is uncommitted, no state is fragile. We are parked at: "reconnaissance complete, seed not yet written." The next action is purely additive (a seed script Mike runs), reversible, and against empty tables.

### The seed to write next session (the design, not yet the SQL)

Goal: prove `class_round_winners` actually exercises the **one-win cap + runner-up reassignment**, not just that the RPCs run without error. A hollow proof is one where no student wins twice, so the cap never fires.

**Rigged design:**
- Pick the target class (lean `d9ce91d4…`); hardcode its id.
- Pick two student-authors from the voters enrolled in THAT class — call them **A** and **B**.
- **Round 1:** A's submission gets the most favorites. A is the round-1 winner.
- **Round 2:** A's submission AGAIN gets the most raw favorites, with **B second**. 
- **Correct behavior:** A is capped (already won round 1), so round 2 is REASSIGNED to B (the runner-up). If the RPC instead crowns A in round 2, the cap is broken.
- Insert approved `submissions` for A and B in rounds 1 and 2 first (status `approved`, set `reviewed_by`/`reviewed_at` if the tally cares — check whether `tally_round` filters on `status = 'approved'`; likely yes).
- Then insert `submission_favorites` rows: `voter_student_id` from the three voters, `submission_id` → the seeded submission, **`class_id` + `round` copied from the parent submission** (do NOT trust defaults — soft spot #3).

**Then prove, in order:**
1. `select * from tally_round('<class>', 1);` → A's submission top.
2. `select * from tally_round('<class>', 2);` → A top raw, B second.
3. `select * from class_round_winners('<class>');` → **round 1 = A, round 2 = B** (the cap fired). THIS is the money query.
4. `select * from class_grand_totals('<class>');` → eyeball totals against the raw seeded favorite counts.

Only after this is green do we write any round-close orchestration app code.

---

## Option R — the full shape (carried from #16, for context)

"Reveal = teacher approves the FINAL comment" → fire `tally_round` → `class_round_winners` (one-win cap + runner-up reassignment) → crown the round → start the next round's 24/22/24 clock → at round 5, auto-complete (`class_grand_totals` → class winner → `enrollments.status = 'completed'`). The step-2 tally functions are the primitives. Testable now with seeded favorites, before any student-facing screen.

**Open questions to settle BEFORE writing orchestration app code (flagged in #16, still open):**
- The "24/22/24 clock" / "start the next round" implies round/timer STATE somewhere — is there a table/column for it, or is round progression tracked another way? Behavior is named in the spec but storage is not. **Find the storage before building the clock.**
- "Crown the round" — is a winner PERSISTED, or always computed-on-read via `class_round_winners`? If computed-on-read, crowning is mostly display and there's less to build than it sounds. **Check before assuming a write.**
- Round-5 auto-complete setting `enrollments.status='completed'` already exists (per #16) — that end is fine.

---

## OPEN INTENTS / soft spots (carried forward; #16's items 1–2 now CLOSED)

1. **(WAS #16 item 1 — git) CLOSED.** Three files committed + pushed (`75add03`).
2. **(WAS #16 item 2 — TEST cleanup) CLOSED.** Query C returned zero rows.
3. **NEW: Two public classes exist (likely test debris).** The `limit 1` resolver in deck/play/moderation-surface silently picks one. Not corrupt, but ambiguous. Decide later whether to delete the spurious one or make the resolver deterministic. NOT this slice's job.
4. **Soft integrity gap (app-layer, still open):** `submission_comments`/`submission_favorites` carry their own `class_id`/`round`; the DB does NOT force them to match the parent submission. Insert path (and the seed) must set them from the submission. A trigger can harden later. **This now directly affects the seed — set favorites' `class_id`/`round` from the parent by hand.**
5. **Two identity worlds = documented debt** (engine-world `profiles`/`entries` vs live-game `students`/`enrollments`). Not unified in this slice.
6. **Re-joining the SAME class after a drop** collides with `unique(student_id, class_id)` → it's an UPDATE of the dropped row back to active. Note for the drop/backfill pass.

---

## PRODUCT OBSERVATIONS Mike found while testing (carried from #16, NOT yet addressed — old engine-world flow, separate from social slice)

1. **CSV download available immediately on enroll.** Mike wants it gated until enrollment `status = 'completed'`. Need: `src/app/student/dashboard/export/route.ts` + button conditional.
2. **Editing a saved note doesn't collapse the box on save** (real bug; deck's `StarterCard` does `if (r.ok) setEditing(false)`). Need: `src/app/teacher/students/[id]/page.tsx` + its note-editor client component. Fix = mirror the deck's collapse-on-success.
3. **Magic link lands on `/play`, not `/student/dashboard`,** single-use. Testing workaround: use link once in InPrivate to set session, then navigate to `/student/dashboard` directly. Fix the landing target in `src/app/auth/callback/route.ts` (maybe `confirm/route.ts`).
4. **Next dev overlay shows "1 Issue" on `/teacher/students`** (images). Unexamined. Paste the expanded text next session before it gets buried.

---

## Working agreement (unchanged, still in force)

- Mike holds editor, Supabase dashboard, all keys, all pushes. Claude never handles real keys, never pushes.
- Whole-file artifacts as DOWNLOADABLE FILES with full destination path. New routes → new folder.
- Mike isn't fluent in JS/TS but IS confident at Supabase SQL — lean on SQL proof queries; verify before declaring done.
- **The Supabase SQL editor returns ONE result set per run.** Don't paste multiple `select`s and expect to see them all — run statements one at a time, OR fold them into a single query (as query C did with `class_id in (...)`).
- Verify-before-declaring, ESPECIALLY git: `git status` / `git show --stat HEAD` before trusting commit state.
- `supabase/migrations/` = STRUCTURAL only. App `.tsx`/`.ts` files do NOT go there.
- His asides are usually the right call — listen for them.

---

## First-message-to-next-Claude

Read this whole doc, plus #16 (the moderation surface build + the fork), and #14 (the spec) if you need the round mechanics.

**Git and TEST cleanup are already verified — do NOT re-check them.** Both classes are empty, voters and column shapes are pinned. We are ready to seed.

**FIRST decision:** confirm the target class (lean older `d9ce91d4-793f-4ed9-81ea-201c0d15602e`) and re-confirm which of the three voters are enrolled in THAT specific class. Then:

**WRITE the rigged tally-proof seed** (design in the "ready to seed" section above): approved submissions for authors A & B in rounds 1 & 2, then favorites — with `class_id`/`round` copied from the parent submission by hand. Rig it so A wins rounds 1 AND 2 on raw counts with B second in round 2, so `class_round_winners` must cap A and reassign round 2 to B.

**PROVE it** with `tally_round` (r1, r2) → `class_round_winners` (the money query: round 1 = A, round 2 = B) → `class_grand_totals` (eyeball vs raw counts).

**ONLY THEN** write round-close orchestration app code — and before that, settle the two open questions: where is round/timer state stored, and is the round winner persisted or computed-on-read.

State of the build in one line: **social-slice data + logic layers live; moderation surface (Step 2 UI) built + verified; Option R chosen; recon done (git + TEST cleanup closed, two empty public classes found, favorites columns pinned); next is the from-scratch tally-proof seed + the one-win-cap proof, no orchestration code until that's green.**
