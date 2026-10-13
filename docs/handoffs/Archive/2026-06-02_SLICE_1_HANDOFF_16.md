# SLICE 1 HANDOFF #16 — Teacher MODERATION SURFACE built & VERIFIED end-to-end (Step 2 UI)

**Date written:** 2026-06-02 (later same day as #15)
**Picking up from:** Handoff #15 (social-slice DATA layer live+verified; LOGIC layer written but UNRUN; no UI). #15's first action was "run + prove the logic migration, then build the teacher approval surface."
**Going into:** Pick the next build from a clear fork (reveal orchestration vs. storage + student upload). Mike wants to DISCUSS the direction at the start of next session before building.
**Destination for this file:** `docs/handoffs/`

---

## TL;DR for next Claude

1. **#15's open #1 is RESOLVED: the logic migration was already applied.** `pg_proc` returns all 7 functions (`approve_submission`, `reject_submission`, `approve_comment`, `reject_comment`, `tally_round`, `class_round_winners`, `class_grand_totals`). All present = the whole file executed. Recorded verified-applied. Both social-slice migrations + handoffs 13–15 were committed in `0d7f94c` ("Social slice: foundation schema + logic layer migrations (verified live)"). The #12/#13 stranded-file trap is closed.
2. **This session BUILT and VERIFIED the teacher MODERATION SURFACE** — the Step 2 UI, the gating dependency for the student screen. Three app files at `src/app/teacher/social/`. It is proven end-to-end against live data, not just rendered (see proof below).
3. **Exact RPC contracts are now ground truth** (confirmed by querying `pg_proc`, not guessed):
   - `approve_submission(p_submission_id uuid)` / `reject_submission(p_submission_id uuid)` → return a `submissions` row.
   - `approve_comment(p_comment_id uuid)` / `reject_comment(p_comment_id uuid)` → return a `submission_comments` row.
   - `tally_round(p_class_id uuid, p_round integer)` → `TABLE(submission_id uuid, student_id uuid, favorite_count bigint)`.
   - `class_round_winners(p_class_id uuid)` → `TABLE(round integer, submission_id uuid, student_id uuid, favorite_count bigint)`.
   - `class_grand_totals(p_class_id uuid)` → `TABLE(student_id uuid, total_favorites bigint)`.
4. **`students` columns are ground truth:** `id uuid, name text, email text, photo_url text, created_at timestamptz, screen_name text`. Display name = `name || screen_name || email`. (`photo_url` is the student avatar, NOT the submission photo.)
5. **VERIFY FIRST next session:** (a) `git status` — confirm the three `teacher/social` files are committed; Mike was told to commit but the session ended before confirmation. (b) Confirm the two TEST seed rows were deleted (cleanup SQL was provided; deletion unconfirmed). Don't trust either as done.

---

## What this session accomplished

### Built: the teacher moderation surface (Step 2 UI) — `src/app/teacher/social/`

Three files, modeled exactly on the deck trio (`src/app/teacher/deck/{page.tsx,deck-client.tsx,actions.ts}`):

- **`page.tsx`** — Server Component. `createClient()` → null-check → `getUser()` → redirect `/auth/login` if none → `profiles.role === 'teacher'` gate → resolve class the SAME way deck/play do (`NEXT_PUBLIC_DEMO_CLASS_ID` or `is_public=true`) → ownership check (`classes.teacher_id = auth.uid()`) for a clean message → read the two pending queues → hand typed arrays to the client. `export const dynamic = "force-dynamic"`.
- **`actions.ts`** — `"use server"`. Four gates, each a thin wrapper over its RPC. Shared `requireTeacher()` perimeter (factored, unlike deck which inlines it — four near-identical preambles otherwise). The RPCs are SECURITY DEFINER and self-authorize via `owns_class()`, so class ownership is enforced in the DB even if the action layer were bypassed. A non-null returned row = success; `revalidatePath("/teacher/social")` after.
- **`social-client.tsx`** — `"use client"`. `useTransition` + two `useOptimistic` lists (submissions, comments). Approve AND reject both optimistically remove the card (either moves the item out of `pending`); on failure the optimistic state discards and the card returns with the error in a banner. Grouped by round. Approve = emerald solid, Reject = red outline.

### VERIFIED end-to-end (live, this session)

- Seeded one `pending` submission + one `pending` comment in the public class (writable-CTE seed query).
- `/teacher/social` rendered both, grouped under "Round 1", with the `(image pending storage)` placeholder behaving as designed (no storage wired — expected).
- Approved the photo → photo queue went to 0, comment stayed. Approved the comment → both queues empty. Optimistic removal worked.
- **SQL proof:** the submission row showed `status = approved`, `reviewed_by` = a real uuid, `reviewed_at = 2026-06-02 19:10:18`. The gate writes for real, with reviewer attribution.
- **The teacher-SELECT-policy risk from #15 did NOT materialize** — the cards showed, so the teacher read policy on `submissions`/`submission_comments` is fine.

### Confirmed harmless: the Supabase "Potential issue detected" RLS warning

The seed query (a writable CTE `ins_sub as (insert … returning …)`) tripped Supabase's linter, which heuristically mistook it for a `CREATE TABLE` without RLS. It creates nothing; it only inserts. "Run without RLS" = "run as written" — it does **not** disable RLS on the existing `submissions` table. RLS on all three social tables remains ON (set in the foundation migration). Confirm any time with:
`select relname, relrowsecurity from pg_class where relname in ('submissions','submission_comments','submission_favorites');` → expect `true` ×3.

---

## Design decisions made this session (hold as ground truth)

- **Route:** new folder `src/app/teacher/social/` (route-per-folder convention). Title "Moderation".
- **Class resolution mirrors deck/play:** single public/demo class, no class-picker. Fine while one public class exists; revisit if a teacher ever owns several. (Carried-forward soft spot, not this slice's job.)
- **Auth perimeter re-checked in every action** (Server Actions are POST-reachable; the screen is not authorization). The RPC's `owns_class()` is the real security line; the action checks are for clean error messages.
- **Submission image display deferred** — `media_url` is plain text; no live-game-student bucket/RLS settled. Client shows the image only if `media_url` is already a full `http(s)` URL, else `(image pending storage)`. Gate decisions don't depend on the image, so the surface is fully usable now.
- **Comment context without fragile nested embeds:** the page pulls parent-submission descriptions in one extra `.in()` query and maps `submission_id → description`, rather than a two-level PostgREST embed. The comment card shows `on a photo described as "…"`.

---

## OPEN INTENTS / known soft spots (carry forward)

1. **Git unconfirmed (VERIFY FIRST):** the three `teacher/social` files — committed? `git status`, then add+commit if not. Suggested message already given: "Teacher moderation surface: approve/reject submissions and comments (verified)". These are app files, NOT migrations — do not put them in `supabase/migrations/`.
2. **Test seed cleanup unconfirmed:** `delete from public.submission_comments where body like 'TEST pending comment%'; delete from public.submissions where description like 'TEST pending photo%';` — run if not already, so the approved test rows don't pollute the future tally.
3. **Soft integrity gap (app-layer, from #15, still open):** `submission_comments`/`submission_favorites` carry their own `class_id`/`round`; the DB does NOT force them to match the parent submission. The insert path must set them from the submission. A trigger can harden later.
4. **Two identity worlds = documented debt** (engine-world `profiles`/`entries` vs live-game `students`/`enrollments`). Not to be unified in this slice.
5. **Re-joining the SAME class after a drop** collides with `unique(student_id, class_id)` on enrollments → it's an UPDATE of the dropped row back to active. Note for the drop/backfill pass.

---

## PRODUCT OBSERVATIONS Mike found while testing (NOT yet addressed — these need the actual files)

These are in the OLD engine-world flow (`/play` → `/student/dashboard` → magic link), separate from the social slice. Triaged but not built:

1. **CSV download is available immediately on enroll.** Mike expected it to gate until the class is finished, to spare a new teacher half-complete classes. Reasonable: enable only when the student's enrollment `status = 'completed'` (round-5 auto-completion already sets this), hide/disable otherwise. **Need:** `src/app/student/dashboard/export/route.ts` + the button conditional.
2. **Editing a saved note doesn't collapse the box on save** (must click the chevron). Real bug; opposite of the deck's `StarterCard`, which does `if (r.ok) setEditing(false)`. **Need:** `src/app/teacher/students/[id]/page.tsx` + its note-editor client component. Fix = mirror the deck's collapse-on-success.
3. **Magic link lands on `/play`, not `/student/dashboard`,** and is single-use, so re-clicking confuses testing. Workaround for testing: use the link once in InPrivate to set the session, then navigate to `/student/dashboard` directly. To fix the landing target: `src/app/auth/callback/route.ts` (and maybe `confirm/route.ts`) — point the post-confirm redirect at the dashboard.
4. **Next dev overlay shows "1 Issue" on `/teacher/students`** (images). Unexamined. Paste the expanded text next session before it gets buried.

---

## DELIBERATELY NOT BUILT YET (next passes) — and the FORK to discuss

Mike wants to **discuss direction first** next session. The two live options and how they relate:

- **Option R — Reveal / round-close orchestration.** Hangs directly off the surface just built: "reveal = teacher approves the FINAL comment" → fire `tally_round` → `class_round_winners` (applies the one-win cap + runner-up reassignment) → crown the round → start the next round's 24/22/24 clock → at round 5, auto-complete (`class_grand_totals` → class winner → `enrollments.status = 'completed'`). The step-2 tally functions are the primitives. **Testable now with SEEDED favorites**, before any student-facing screen exists — same bottom-up rhythm that just worked for the surface.
- **Option S — Storage + student upload path.** Settle the bucket + RLS for submission pics (`media_url` is text today; the existing `media`-bucket policy is wired to engine-world identity `my_class_id()`/`auth.uid()` and won't authorize a live-game `students` row cleanly). Then the round-1 upload + describe screen so REAL submissions start flowing.

**Dependency note:** the reveal tally needs `submission_favorites` rows; favorites come from the student vote screen. So Option R can be built and proven against seeded favorites, then the student screens (which produce real favorites) slot in. Recommendation last session leaned R (adjacent to what's built, testable without storage), but it's Mike's call.

Remaining after the fork (from #15, unchanged order otherwise):
- Student screens: combined (vote prev round + upload next + describe), standalone round-1 upload, round-5 vote+reveal+opt-in-re-enroll. (Reveal reuses `src/game/spotlight.jsx`'s `ReviewGrid` — single-pick `favoriteId`/`onSelectFavorite` + spin→reveal phases. Confirmed this session it's the right component.)
- Miss tracking + two-consecutive-miss drop + pool/backfill.
- 18+ attestation column (one-liner; add with the enrollment screen; it's a TERMS mechanism, not a filter).

---

## Working agreement (unchanged, still in force)

- Mike holds editor, Supabase dashboard, all keys, all pushes. Claude never handles real keys, never pushes.
- Whole-file artifacts as DOWNLOADABLE FILES with full destination path. New routes → new folder.
- Mike isn't fluent in JS/TS but IS confident at Supabase SQL — lean on SQL proof queries; verify before declaring done. (This session: surface PROVEN by SQL + screenshots, so it's recorded verified. Git state of the 3 files is NOT proven — say so.)
- Verify-before-declaring, ESPECIALLY git: `git status` / `git show --stat HEAD` before trusting commit state.
- `supabase/migrations/` = STRUCTURAL only. App `.tsx`/`.ts` files do NOT go there.
- His asides are usually the right call — listen for them.

---

## First-message-to-next-Claude

Read this whole doc, plus #15 (the build state) and #14 (the spec).

**FIRST, verify the two unconfirmed things:**
1. `git status` — are `src/app/teacher/social/{page.tsx,actions.ts,social-client.tsx}` committed? If not, add + commit (message in OPEN INTENT #1). App files, not migrations.
2. Confirm the TEST seed rows were deleted (OPEN INTENT #2). If not, run the cleanup.

**THEN discuss the fork** (Option R: reveal/round-close orchestration, vs. Option S: storage + student upload). Don't start building until Mike picks. If R: build the round-close trigger off the moderation surface and prove it with seeded favorites + the three tally RPCs (signatures in TL;DR #3), bottom-up, no student UI yet. If S: settle the submission-pic bucket + RLS for `students`-keyed identity first, then the round-1 upload screen.

State of the build in one line: **social-slice data + logic layers live and verified; the teacher moderation surface (Step 2 UI) is now built AND verified end-to-end; next is the reveal-orchestration vs. storage fork, Mike to choose.**
