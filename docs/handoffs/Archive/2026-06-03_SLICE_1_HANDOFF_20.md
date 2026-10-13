# SLICE 1 HANDOFF #20 — DESIGN DECIDED. Per-player progression, end-of-game reveal, tiered top-3. No new schema needed. Next: build the completion transition and the reveal RPC.

**Date written:** 2026-06-03
**Picking up from:** #19 (tally proof GREEN, state model mapped, round source-of-truth investigation opened)
**This session:** Completed the source-of-truth investigation. Made the per-player vs synchronized call. Designed the full end-of-game reveal. Confirmed schema is sufficient — no new tables or columns needed.
**Destination:** `docs/handoffs/`

---

## ✅ WHAT WAS DECIDED THIS SESSION (confirmed against actual code + schema — not inferred)

### 1. Round source-of-truth: neither pointer is maintained yet — both are frozen at 1

Investigated by reading `src/app/play/actions.ts` in full and running the SQL divergence check. Findings:

- `enrollments.round` is written exactly once: hardcoded `round: 1` in the `enrollStudent` upsert. Never read-then-incremented anywhere in the codebase.
- `game_sessions.round` is written exactly once: hardcoded `round: 1` in the `game_sessions` insert in the same action.
- The `.round` property grep across all of `src/app` + `src/lib` confirmed `actions.ts` never reads `.round` — it only stamps 1.
- SQL divergence check confirmed: all 4 rows show `enroll_round=1`, `max_session_round=1`, `open_session_round=NULL`. NULLs mean those sessions are completed (completed_at is set) but the pointer never moved.

**Conclusion:** both pointers agree not because they sync, but because round 2 has never existed. There is no source-of-truth to pick yet — that decision is made when progression is built. When you build it: **`game_sessions.round` should be the single writer.** It's where actual gameplay state lives. `enrollments.round` either mirrors it or gets dropped from the progression path. Two independent writers kept in sync by hand is the bug waiting to happen.

**Also confirmed:** the `enrollStudent` upsert overwrites `round: 1` on conflict (re-enrolling same class). Harmless today; becomes a reset-to-1 footgun once progression exists. Guard it when building the completion transition.

---

### 2. Per-player vs synchronized: DECIDED — per-player, confirmed by schema and migration

This was not actually open. Three artifacts in combination constitute a structural commitment to per-player:

- `actions.ts` header: explicitly describes "World B — one active class at a time." The lifecycle is per-student: `active` → `completed`, past classes become history.
- `20260601180000_enrollment_status.sql`: adds partial unique index `one_active_enrollment_per_student ON enrollments (student_id) WHERE status = 'active'`. This enforces at the DB level that a student has at most one active enrollment. Keyed on `student_id`, not `class_id`. That's a per-player-world structural commitment.
- Both `round` pointers are per-player rows. No class-level state exists or has ever existed.

Synchronized rounds would require adding class-level round/phase state AND contradicting the existing lifecycle design. It's not a live option without a deliberate schema revision.

**One sub-question that remains genuinely open (and is fine to defer):** within a class, does round 1 → round 2 advance per-student (each player moves when they finish) or for the whole cohort together? The between-class lifecycle is decided; the within-class round-advance is not. The end-of-game design below resolves this in practice — see section 3.

---

### 3. End-of-game reveal: FULLY DESIGNED

**No per-round winners. No round synchronization gate.** Students play at their own pace. Teacher closes the game when done. One reveal at the end.

**Why this resolves the within-class round question:** per-round winners require a synchronization gate (you can't compute a round winner until everyone has submitted their favorites). Removing per-round winners removes the reason to synchronize. Students can genuinely self-pace within a class. The per-player schema fits perfectly with no new state.

**The reveal structure — top 3 students by total favorites received across all rounds:**

Each top-3 student gets two panels:

**Panel A — Their posted pic (all three students):**
- The photo they submitted that was favorited most across all rounds
- Shown with comments from *only the classmates who favorited it* (not every student's comments — just the ones who picked it)

**Panel B — Their taste / favorites (tiered by placement):**
- Gold (1st): all 9 favorites shown, with their own comments on each, in chronological (round) order
- Silver (2nd): 6 favorites shown, with their own comments, chronological
- Bronze (3rd): 3 favorites shown, with their own comments, chronological

**Interaction model:** top-level view shows the podium (1st/2nd/3rd). Clicking a student expands both panels.

---

### 4. Schema sufficiency: confirmed — no new tables or columns needed

All data for the reveal exists today:

| Data needed | Where it lives |
|---|---|
| Total favorites received per student | `class_grand_totals` RPC (already proven in tally proof) |
| Which pic they submitted was favorited most | `submissions` + `submission_favorites` |
| Comments from classmates who favorited that pic | `submission_favorites` JOIN `game_sessions` (comments jsonb) — filter to favoriters only |
| Their own favorites per round, chronological | `game_sessions.favorites` jsonb, ordered by round |
| Their own comments on those favorites | `game_sessions.comments` jsonb, same rows |

The tally RPC family (`tally_round`, `class_round_winners`, `class_grand_totals`) already computes totals. `class_grand_totals` is directly usable for ranking top 3. `class_round_winners` (one-win cap mechanic) may be parkable entirely — its purpose was per-round winners, which are now gone. Confirm before removing; it costs nothing to leave it dormant.

---

## WHAT TO BUILD NEXT (in order)

### Step 1 — Completion transition (the missing mechanic)

Nothing currently flips a student from `active` to `completed`. The migration comment says so explicitly: "manual for now." This is the only missing write-path piece before the reveal is buildable.

Define what triggers completion: does finishing the last round's `game_sessions` row (setting `completed_at`) automatically flip `enrollments.status` to `completed`? Or does the teacher close the class manually? The per-player model suggests auto-completion (student finishes → they're done), but "teacher closes the game" for the reveal implies some teacher action exists. Probably both: student finishing marks their own session complete; teacher action publishes the reveal. Settle this before coding.

### Step 2 — Reveal RPC(s)

Two queries needed (can be one RPC or two):

1. **Top 3 ranking:** `class_grand_totals` already gives this — just `ORDER BY total DESC LIMIT 3`. May need `student_id` → `screen_name` join. Verify `class_grand_totals` returns `student_id`; if so, join `students.screen_name`.

2. **Per-student reveal data:** given a `student_id` + `class_id`, return:
   - Their most-favorited submission (join `submissions` + count `submission_favorites`)
   - Comments from only the students who favorited that submission (requires knowing favoriters, then pulling their `game_sessions.comments` for the entry)
   - Their own favorites + comments by round (`game_sessions` rows ordered by `round`, extract from jsonb)

The jsonb extraction (favorites/comments) is the only tricky part — it's a known Postgres pattern (`jsonb_each`, `jsonb_object_keys`) but worth prototyping in the SQL editor before writing the RPC.

### Step 3 — Teacher "close game" action

A server action that:
- Flips all `active` enrollments for a class to `completed` (or marks a class-level flag — but no class-level state exists, so enrollment-level is the natural place)
- Triggers the reveal to be visible on the teacher surface

Note: the partial unique index (`one_active_enrollment_per_student`) enforces one active enrollment per student globally. Flipping a class to completed frees the student's slot for a future class. Make sure bulk-completing a class doesn't race against a student mid-enrollment.

---

## OPEN / PARKED (unchanged from #19 unless noted)

- **`bac4d923` single-vs-multi-cohort:** still open, still low-stakes, still all test data. `/play` unions all public classes. Un-publishing removes its entries from the deck. Mike's call, no rush.
- **`class_round_winners` RPC:** was built for per-round winners. Now parked — per-round winners are removed from the design. Leave dormant for now; revisit if the design ever changes.
- **`saveProfile` session-targeting ambiguity:** attaches `favorite_comment` to most-recent session by `completed_at`. Fine at one session; could mis-target once multiple rounds exist. Low priority, flag when building multi-round.
- **Product observations (engine-world, unaddressed):** CSV gate-until-completed; note-editor collapse-on-save bug; magic link lands `/play` not `/student/dashboard`; "1 Issue" overlay on `/teacher/students`.
- **`sessions` / `session_comments` tables:** 0 rows, confirmed dead legacy. Ignore; cleanup candidate someday.

---

## Working agreement (unchanged)

Mike holds editor/dashboard/keys/pushes. SQL editor = one result set per run. `supabase/migrations/` = STRUCTURAL only; seeds/proofs/diagnostics live as snippets, not in the repo. Verify before declaring done. Mike's confident at SQL, less so JS/TS — lean on SQL proofs.

---

## First-message-to-next-Claude

**Design is fully decided — do not re-open it without a deliberate reason.**

Per-player progression (confirmed by schema + migration, not a preference). End-of-game top-3 reveal (no per-round winners, no synchronization gate). Tiered favorites reveal: Gold=9, Silver=6, Bronze=3, chronological, with own comments. Panel A (their most-favorited posted pic + comments from favoriters only) for all three. No new schema needed.

**The one genuine open question before coding:** what triggers completion? Student finishing their last round auto-flips `enrollments.status → completed`? Or teacher closes manually? Probably both (student auto-completes their session; teacher publishes the reveal). Settle this first, then build in order: (1) completion transition, (2) reveal RPCs, (3) teacher close-game action.

**Key confirmed facts:**
- `enrollments.round` and `game_sessions.round` both frozen at 1 — neither is a maintained source of truth yet. `game_sessions.round` should be the single writer when progression is built.
- `class_grand_totals` RPC already ranks by total favorites — usable directly for top-3, may just need a `students.screen_name` join.
- All reveal data exists in current schema: `submissions`, `submission_favorites`, `game_sessions.favorites` (jsonb), `game_sessions.comments` (jsonb).
- Upsert re-enroll resets `round` to 1 — guard this when building the completion transition.
- `class_round_winners` RPC is dormant/parked (was for per-round winners, now removed from design).
