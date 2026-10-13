# Slice 1 — Handoff #29
**2026-06-07 (Sunday, ~2 hours of work after #28)**

Started the end-of-game reveal slice (handoff #28's Priority 1). Resolved the `entries`↔`submissions` seam by ripping the dormant social-slice surface. Reveal RPC written and applied to the DB. Page not yet built — stopped before it to keep context fresh for next-session Claude.

---

## How to work with Mike

(Carry from #28 in full. Highlights worth re-reading:)

1. Whole-file replacements via `present_files`. Never paste code in chat.
2. **#28's new principle: search past conversations when Mike references prior design.** Critical this session — the locked reveal design lives in the 2026-06-03 "Resolving round pointer source-of-truth" conversation, and the handoff alone described data sources that turned out wrong (it pointed at empty social-slice tables instead of the legacy stack where data actually lives).
3. Mike's "if we know what's right, just do it" principle applies to architecture decisions, not just UI. This session that meant agreeing to rip the social-slice surface in the same slice as building the reveal, instead of leaving dead code as documented debt.
4. When uncertain about scope, ASK with tappable options — but verify code state before agreeing to a course of action. This session: I initially recommended Option C ("rip the social slice") based on the handoff's framing, then walked it back when I saw `src/app/teacher/social/` was a real UI built on those tables, then re-confirmed C after reading those files and finding the UI was load-bearing only on a stack that never received data.
5. **NEW (#29): The Supabase SQL editor truncates UNION ALL results to the last statement.** If you ask Mike to run a multi-statement count query, structure it as one SELECT with multiple subquery columns, not a UNION ALL — otherwise the screenshot only shows the last result set and you'll think the others returned 0 when they may not have.

---

## Where this session ended

The reveal data layer is in place; the page is not built.

- **Drop migration applied.** Social-slice surface (`submissions`, `submission_comments`, `submission_favorites`, `submission_status` enum, `my_student_id()`, and the 7 RPCs `approve_submission` / `reject_submission` / `approve_comment` / `reject_comment` / `tally_round` / `class_round_winners` / `class_grand_totals`) is gone. `enrollments.status='dropped'` was preserved on purpose. Proof queries all passed.
- **Reveal RPC applied.** `class_top_three_reveal(p_class_id uuid) returns jsonb` exists, granted to `authenticated`, self-authorizes via `is_enrolled_in()`.
- **Data layer verified.** Smoke test of the RPC via SQL editor errored on `not authorized for class ...` — which is the RPC working correctly (the SQL editor connects as `postgres`, not as an enrolled student, so `is_enrolled_in()` rejects). To verify the data layer separately, ran the RPC's CTE body inline. Results: 1 favorite act in the test class "Spotlight — Front Door", 0 resolved into the ranking. Diagnostic with LEFT JOINs and no starter filter confirmed why: the single favorite is on Mike's own teacher starter (`is_starter = true`), correctly excluded by design. **The cross-identity-world bridge works** — Mike has both a teacher `profiles` row and a `students` row keyed by the same email (`getgroovr@yahoo.com`), and the email-bridge join resolved them. To actually populate the reveal, the test class needs at least one student-favoriting-a-student's-entry. Until then `winners` returns `[]`, which is correct.
- **`src/app/teacher/social/` deletion.** Mike said he'd delete the 3 files (`page.tsx`, `actions.ts`, `social-client.tsx`) in parallel during this session. Status: assumed done but NOT visually verified. Until deleted, the next `tsc` or build will fail (those files reference now-missing RPCs and tables). First check in next session.

---

## What shipped in #29

### A. Drop migration — `supabase/migrations/20260607120000_drop_social_slice.sql`

Surgical drop of the social-slice surface introduced by the two 2026-06-02 migrations. Has a safety-check block at the top that counts rows in all three tables and `RAISE`s if any are non-zero — permanent guard against accidentally dropping populated tables.

Order: 7 RPCs → 3 tables (children first, FK cascade order) → `my_student_id()` helper → `submission_status` enum. Each with `IF EXISTS` so re-running is safe.

Explicitly KEEPS `enrollments.status` widening to include `'dropped'` — it was added by the social-slice foundation migration but is independent of the tables and supports future two-consecutive-miss drop logic.

**One thing the safety check caught:** when Mike first ran it, `submissions` had 2 rows (`"SEED A r1"` and `"SEED A r2"`, both created 2026-06-02 — manual seed inserts from when the social slice was first scaffolded). The drop aborted cleanly. Mike cleared them with `DELETE FROM submission_favorites; DELETE FROM submission_comments; DELETE FROM submissions;` and the drop re-ran cleanly.

### B. Reveal RPC migration — `supabase/migrations/20260607130000_reveal_rpc.sql`

Single function `class_top_three_reveal(p_class_id uuid) RETURNS jsonb`. SECURITY DEFINER, STABLE, search_path locked. Self-authorizes via `is_enrolled_in()`.

**Returns a single jsonb object** with shape:
```json
{
  "class_name": "...",
  "total_rounds": 5,
  "winners": [
    {
      "placement": 1,
      "student_id": "...",
      "student_name": "...",
      "student_screen_name": "...",
      "total_favorites": 7,
      "panel_a": {
        "entry_id": "...",
        "round": 3,
        "media_url": "<storage path, NOT signed>",
        "description_text": "...",
        "fav_count": 4,
        "comments_from_favoriters": [
          { "author_id": "...", "author_name": "...", "author_screen_name": "...", "comment": "..." }
        ]
      },
      "panel_b": {
        "favorites": [
          { "round": 1, "entry_id": "...", "media_url": "...", "description_text": "...",
            "owner_name": "...", "owner_screen_name": "...", "own_comment": "..." }
        ]
      }
    }
  ]
}
```

**Data flow inside the function** (read the file header for full prose; this is the structural skeleton):

1. `favorites_given` CTE: `jsonb_each(gs.favorites)` lateral over `game_sessions`, filtering to `value::text = 'true'`. One row per favorite act: `(voter_student_id, round_num, favorited_entry_id)`.
2. `favorites_resolved` CTE: join to `entries` (filtering `is_starter = false`), then bridge to the owning student via `auth.users` on email. This is the centralized cross-identity-world bridge — same bridge the now-dropped `my_student_id()` used.
3. `entry_fav_counts`: count per entry (used by Panel A).
4. `top_three`: group by owner, count, `ORDER BY count DESC, owner_student_id ASC LIMIT 3`. `row_number()` for placement.
5. `panel_a_entries`: `DISTINCT ON (owner)` ordered by `fav_count DESC` → one entry per winner = their best.
6. `panel_a_comments`: comments from favoriters, looking up `gs.comments ->> entry_id` for each favoriter in the round they favorited.
7. `panel_b_favorites`: the winner's own favorites (where they're the voter), with their own comments.
8. Aggregate into the final `jsonb_build_object`.

**Design decisions made (per Mike's "just do it" principle):**

- **No tier-truncation in the RPC.** Original spec said gold=9/silver=6/bronze=3, assuming 9 rounds. With variable `total_rounds` that breaks. RPC returns ALL favorites per winner; UI decides truncation by placement. Lets the gradient be tuned without DB change.
- **No game-over check in the RPC.** Page is responsible for gating on computed `isGameOver`. Adding a SQL-side check would mean a 3rd copy of `computeIsGameOver` (already duplicated in `actions.ts` and `student-archive.ts` — handoff #28's Priority 3 of extracting these helpers still stands).
- **Starters excluded.** `entries.is_starter = false` filter in `favorites_resolved`. Otherwise teacher's own photos count toward the leaderboard. Wrong.
- **media_url returned as raw storage path, not signed URL.** Page signs URLs after fetching (same pattern as `student-archive.ts` does for own-entries).

**Tie-breakers (placeholder, refine if it matters):**
- Top-3: `total_favorites DESC, owner_student_id ASC`.
- Panel A entry: `fav_count DESC, entry_id ASC`.

---

## File map (delta from #28)

**New SQL migrations:**
- `supabase/migrations/20260607120000_drop_social_slice.sql`
- `supabase/migrations/20260607130000_reveal_rpc.sql`

**Deleted (Mike, in parallel — verify next session):**
- `src/app/teacher/social/page.tsx`
- `src/app/teacher/social/actions.ts`
- `src/app/teacher/social/social-client.tsx`

**Schema delta:**
- DROPPED: 3 tables, 1 enum, 1 helper function, 7 RPCs (all from the 2026-06-02 social slice)
- KEPT: `enrollments.status` widening to include `'dropped'` (independent of the rest)
- ADDED: `class_top_three_reveal(uuid)` RPC

**No app-code changes** (no `page.tsx`, no `actions.ts`, no `student-archive.ts` edits).

---

## Verification status

**Verified:**
- ✅ Drop migration ran cleanly after the safety-check / seed-data round trip.
- ✅ Post-drop proof queries: `tables_remaining=0`, `enum_remaining=0`, `rpcs_remaining=0`, `enrollments_status_check` has `'dropped'`, `one_active_enrollment_per_student` index intact.
- ✅ Reveal RPC migration ran cleanly. `class_top_three_reveal` exists in `pg_proc`.
- ✅ **Reveal RPC data layer verified.** The CTE body executed inline produces correct output (1 favorite, on a starter, correctly excluded from ranking). Email-bridge between `entries.student_id` → `auth.users.id` → `students.id` works. The function itself errors on calls from `postgres` role (correct — `is_enrolled_in()` rejects); will work for student callers.

**NOT verified (Priority 1 for next session):**
- ⚠ That the deletion of `src/app/teacher/social/` actually happened. If not done, `tsc` will fail on a build because those files import RPCs that no longer exist.
- ⚠ The RPC's behavior with populated data. Test class currently has 1 favorite, and it's on a starter so `winners` is empty `[]` (correct behavior). When student-to-student favorites exist, the winners will populate. Could verify with manual `INSERT`s into `game_sessions.favorites` or by playing through a real game.

---

## What's next — #30

### Priority 1: Verify `src/app/teacher/social/` is gone

```bash
ls src/app/teacher/social/  # expect "No such file or directory"
```

If the directory still exists, delete the 3 files. The build will fail until then. Mike said he'd do it in #29 but I never visually confirmed.

### Priority 2: Build `src/app/student/results/page.tsx`

Once the RPC is producing data:

**Sketch of the page** (full plan, but Mike likes to iterate on UI so don't over-engineer the first pass):

1. **Server-side data fetch.** Use the admin client (mirror `student-archive.ts` pattern). Steps:
   - `supabase.auth.getUser()` → get user email
   - Look up `students.id` by email (same as `student-archive.ts` line 181-186)
   - Read `profiles.class_id` to find current class
   - Read `classes` timing to compute `isGameOver`; if false, `redirect('/student/dashboard')`
   - Call `admin.rpc('class_top_three_reveal', { p_class_id: classId })` — NOTE: as admin, the `is_enrolled_in` check passes trivially because admin bypasses RLS. The auth check is the redirect above.
   - For each winner's `panel_a.media_url` and each `panel_b.favorites[i].media_url`, call `admin.storage.from('media').createSignedUrl(path, 3600)` and replace the path with the signed URL. Same TTL as elsewhere.
2. **Visual treatment.** Use the same color/font tokens as the dashboard (`C` and `F` constants in `student/dashboard/page.tsx` lines 82-98). Tiers:
   - Gold (1st): bigger, full panel B
   - Silver (2nd): medium, ~2/3 of panel B's favorites (chronological, take first N)
   - Bronze (3rd): smaller, ~1/3 of panel B's favorites
   - Specific tier counts: Mike's call. Default I'd ship: `Math.ceil(N * 1.0)` / `Math.ceil(N * 2/3)` / `Math.ceil(N * 1/3)` where N = total_rounds. For 5 rounds that's 5/4/2; for 9 rounds 9/6/3 (matches the original spec).
3. **Interaction model from the locked design:** podium at top (1st/2nd/3rd as compact cards), click to expand both panels. First pass can show everything expanded — interaction comes second.
4. **Edge cases the page must handle:**
   - `winners` array has 0 entries → "No favorites were recorded this round" copy + link back to dashboard.
   - `winners` has 1 or 2 entries → render what's there, no placeholder for the missing slots.
   - A winner's `panel_a` is null → render the winner's name and total, omit the panel.
   - A winner's `panel_b.favorites` is empty → omit the panel.

### Priority 3 (carried from #28): Teacher UI for class timing

Today Mike configures `total_rounds`, `round_duration_hours`, `game_starts_at` via raw SQL. Teacher needs a form. Full spec in #27's "What's next."

### Priority 4 (carried from #28): Extract round-timing helpers

`computeCurrentRound` / `isRoundLocked` / `isGameOver` are duplicated in `actions.ts` and `student-archive.ts`. Now ALSO conceptually in the reveal RPC's gating decision (though the RPC chose not to recompute). Extract to `src/lib/round-timing.ts` BEFORE any further lock-math changes. ~10 minutes.

### Open issues (carry forward)

- **`students` ↔ `profiles` seam** still two UUIDs per student. The reveal RPC adds a third internal use of the email-bridge join. Documented at the top of `student-archive.ts` and now also in the reveal RPC header.
- **Completion transition.** `enrollments.status` `active`→`completed` still has no trigger. Reveal RPC doesn't need it (uses computed `isGameOver` indirectly via the page-level gate). But the broader question (does finishing the last `game_sessions` row auto-flip? teacher action? auto-derive?) is unresolved. Will become live when "what makes a class show up as past vs current in the history strip" matters.
- **Status-only replace block** (carry from #28). When implementing: pass `entryStatus` as a prop, hide button when `status === 'approved'`, update server-side `removeEntry` to reject when approved. Pending-with-note still replaceable.
- **Banner persistence papercut** (carry from #28).
- **Multi-class history strip unverified** (carry from #28).

### Smaller follow-ups (carry from #28, still open)

- Drop `ownEntry` (singular) from `student-archive.ts`.
- Drop `classes.game_ends_at`.
- "Reset this test student" teacher button.
- The history strip (`ProfileArchive`) `<details>/<summary>` consistency.
- The unconfigured "Spotlight — Back Door" class row (NULL config) — delete or repurpose.

---

## Working notes for next-session Claude

- **READ THIS HANDOFF before doing anything.** Always.
- **First action: verify `src/app/teacher/social/` is deleted.** If not, the next build breaks (those files import the RPCs we dropped). Mike said he'd handle this in #29 but it wasn't visually confirmed.
- **Second action: build the reveal page.** Data layer is verified working (RPC + bridge). To see populated `winners` in any test, the test class needs student-to-student favorites in `game_sessions.favorites`. If you want to see real data flow through the page before sending it to Mike for review, seed a couple of favorites manually first.
- **The reveal RPC returns storage PATHS, not signed URLs.** The page must sign them after fetching — mirror the pattern in `student-archive.ts` lines 365-398 (createSignedUrl with `SIGNED_URL_TTL_SECONDS`).
- **The bridge across the two identity worlds (entries.student_id=profiles.id, game_sessions.student_id=students.id) lives INSIDE the reveal RPC.** The page consumes already-resolved students.id values. Don't redo the bridge on the page side.
- **Mike's existing color/font tokens are in `student/dashboard/page.tsx` lines 82-98** (`const C = {...}`, `const F = "'Outfit',sans-serif"`). Use these for visual consistency with the dashboard.
- **The locked reveal design is from 2026-06-03** — search conversations for "winners top three students" if you need the original framing. Handoff #28 also summarized it. Don't redesign it.
- **No per-round winners.** Only the top 3 by total favorites. The dropped `class_round_winners` RPC was deleted intentionally — don't try to revive it.
- **Mike's tier-truncation preference is not yet pinned down.** Default rule I'd ship (5 rounds → 5/4/2; 9 rounds → 9/6/3, matching the original spec): `Math.ceil(N * 1.0)` / `Math.ceil(N * 2/3)` / `Math.ceil(N * 1/3)`. Implement, show Mike, iterate.
- **Don't pre-build the `/student/results` placeholder.** The dashboard's button already routes there with a deliberate 404 if you navigate before the page exists. Build the page properly when you build it.

---

*#29 session — half-slice. Data layer for the reveal is in place; the page is the next session's top item. The big architectural call was ripping the social-slice scaffolding (a 2026-06-02 parallel stack that never got wired up) rather than building the reveal on top of it. Net schema is now leaner by 3 tables, 1 enum, 1 helper, 7 RPCs. The added `class_top_three_reveal` RPC reads from the legacy stack where data actually lives.*
