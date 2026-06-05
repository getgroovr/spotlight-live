# SLICE 1 HANDOFF #19 — [CORRECTED 06-03] TALLY PROOF GREEN (one-win cap verified). Resolver was never limit-1 (/play unions all public classes). Next: map the state model — there is NO server-side round clock; redefine "round-close" before coding.

**Date written:** 2026-06-02 (later same day as #18)
**Picking up from:** #18 (tally-proof seed applied; proof blocked on owns_class). Then investigated the two-public-class situation.
**This session add-on:** ran diagnostics on the two public classes. Found BOTH have real enrollments — this is a genuine decision, not cleanup. Deferred deliberately.
**Destination:** `docs/handoffs/`

---

## ✅ 2026-06-03 — TALLY PROOF IS GREEN (one-win cap verified) + STATE-MODEL FINDING

**The proof passed end to end under the simulated teacher JWT. The one-win cap is verified.** Results matched expectations exactly:
- `tally_round` r1 → A=2, B=1; r2 → A=2, B=1
- `class_round_winners` → r1=A (Lovesick `055a4c6c…`), r2=B (Mike D `d8b2c7af…`). A was top on RAW favorites in BOTH rounds; the cap excluded A from r2 and reassigned it to B. That reassignment IS the mechanic — it fired correctly.
- `class_grand_totals` → A=4, B=2 (C absent).

`owns_class` body confirmed: `select exists (select 1 from public.classes c where c.id = cid and c.teacher_id = auth.uid())`. Reads `auth.uid()` (= JWT `sub`) vs `teacher_id`; does NOT check role. Param is named **`cid`** (notes guessed `p_class_id` — we passed positionally, so moot). Working JWT sim: `set_config('request.jwt.claims','{"sub":"18f23db0-0b2f-4f30-914a-233c3a73c305"}', false)` then call the RPC. Saved snippets: "JWT Claim Setup and Tally Round Invocation", "Run Second Tally Round", "Class Round Winners Invocation", "Class Grand Totals Proof Run 4". (Running owns_class's inner line standalone errors `column "cid" does not exist` — expected, `cid` is the param, not a column. Does not affect the proof.)

**STATE-MODEL FINDING — reframes round-close orchestration (another handoff assumption the schema doesn't support):**
Introspected all round/timer/phase/status/session columns AND ran full-column + row-count diagnostics (2026-06-03, CONFIRMED — not inferred):

- **No server-side round clock — CONFIRMED.** `classes` has exactly 5 columns: `id, teacher_id, name, created_at, is_public`. No `current_round`, `phase`, `timer`, `deadline`, `status`. There is nothing class-level to "advance." So "round-close" cannot mean "advance the class's round."
- **"Round" lives as two PER-PLAYER pointers:** `enrollments.round` and `game_sessions.round` (both NOT NULL). **OPEN QUESTION for orchestration: which is the source of truth, and are they kept in sync?** Settle this before writing progression logic. (`round` also appears as per-row content tags on `submissions`/`submission_favorites`/`submission_comments`/`teacher_comments` — those are just labels, not state.)
- **A player's gameplay state = `game_sessions`:** `student_id, class_id, round, comments(jsonb), favorites(jsonb), completed_at(null), favorite_comment(null)`. `completed_at` marks finish.
- **SCHEMA DRIFT RESOLVED by row counts:**
  - LIVE: `game_sessions`=4, `submissions`=4, `submission_favorites`=6 (exactly the seed) — this is the family the tally proof validated. `entries`=18 is the separate deck content `/play` reads via `entries_public`.
  - DEAD: `sessions`=0, `session_comments`=0 — empty legacy cluster (`sessions` uses `player_id`). **Ignore for orchestration; cleanup candidate someday, not now.**
- **"24/22/24" is NOT in the DB** and doesn't match `entries`=18 either → it's client-side/UI, not persisted state. Don't block on it; locating it is a code-grep errand if it ever matters.
- **THE REAL NEXT-SESSION DECISION (design, may need new schema):** Is a round **per-player** (each plays at own pace; round bumps emergently as they finish) or **synchronized** (teacher closes a round for everyone)? The schema today supports ONLY per-player. Synchronized would require NEW class-level state. This decision determines whether any new schema/orchestrator is built at all — winner is already computed-on-read, so the read side needs nothing.
- **enrollments full shape (FYI):** `id, student_id, class_id, round, enrolled_at(null), status`. Confirms the earlier "no created_at" note — it's `enrolled_at` instead. `unique(student_id, class_id)` still holds.

---

## ⚠️ RESOLVER CORRECTION (2026-06-03) — supersedes the "limit 1 resolver" framing in #17/#18/#19

Read this BEFORE the TL;DR below. The notes' central assumption was wrong, verified against the actual code (grep of `src/`):

- **There is NO single-class resolver for `/play`, and no `limit 1`.** `src/lib/deck.ts` (`loadGenericDeck`) deliberately resolves **every** public class (`.eq("is_public", true)`, no limit) and **unions their starter entries**. The code comment says this is intentional — to support the favorite-drops-you-into-a-cohort mechanic across multiple cohorts — and that the env-var pin "is no longer load-bearing for `/play`." So the "silent flip" risk that #17–#19 worried about never existed; nothing picks one class.
- **The env var pin is still live for TEACHER surfaces only.** `NEXT_PUBLIC_DEMO_CLASS_ID` (= `d9ce91d4-793f-4ed9-81ea-201c0d15602e`, confirmed in `.env.local`) is read as `pinnedId` in `teacher/deck/actions.ts`, `teacher/deck/page.tsx`, `teacher/social/page.tsx`, and `lib/deck.ts`. So teacher deck/moderation operate ONLY on `d9ce91d4`, while `/play` sees BOTH classes. That asymmetry is a latent inconsistency (entries in `bac4d923` render in `/play` but never pass a pinned teacher surface) — parked, it's test data.
- **Consequences:**
  1. **The proof is NOT blocked by the class decision.** Tally RPCs are class-scoped to `d9ce91d4`, `owns_class` checks ownership not public status, and the seed lives in `d9ce91d4`. Run the proof now; the `bac4d923` question is independent. The #17–#19 "clean up first, then prove" ordering was an artifact of the (nonexistent) flip risk.
  2. **Un-publishing `bac4d923` is NOT a determinism fix and NOT free cleanup.** It is a behavior change: it removes `bac4d923`'s entries from the `/play` union. The real question is a product preference — single-cohort `/play` (un-publish `bac4d923`) vs. multi-cohort union (`/play` exercises both). Both reversible (just an `is_public` flag). All test data, so low-stakes either way — but it is a choice, not a chore. No `order by created_at` and no partial unique index are needed.
- **Provenance of the duplicate:** two manual class creations by the same teacher (5/27 setup → `d9ce91d4`; 6/01 → `bac4d923`). The `unique(student_id, class_id)` constraint is intact and working — "Mr. D twice" = enrolled once in each of two classes, NOT a double-enroll. No enrollment bug exists.

**Everything below this line predates the correction. Where it says "limit 1 resolver" or "the app's resolver already points here" or treats cleanup as a determinism fix, it is WRONG — trust this section instead.**

---

## TL;DR

1. **Everything in #18 still stands** — tally seed is live in `d9ce91d4…`; proof is one owns_class/JWT step away. Read #18 for that.
2. **The duplicate public class is NOT throwaway debris. Do NOT un-publish either one without a real decision.** Diagnostics (Section 1 of the "resolve_duplicate_public_class" snippet) showed:

   | metric | `d9ce91d4…` (older, 2026-05-27) | `bac4d923…` (newer, 2026-06-01) |
   |---|---|---|
   | enroll total | 2 | 2 |
   | active | 2 | 1 |
   | completed | 0 | **1** |
   | dropped | 0 | 0 |
   | submissions | 4 *(today's seed only)* | 0 |
   | favorites | 6 *(today's seed only)* | 0 |
   | comments | 0 | 0 |

3. **RESOLVED — Section 2 ran; the enrollees are ALL Mike's own test identities, and the two classes are SEPARATE test sessions, not a duplicate of one game:**
   - `bac4d923` (newer): Lovesick (active), Mr. D / Mike D (**completed**)
   - `d9ce91d4` (older): Michael Dorsten / Mike (active), Mr. D / Mike D (active)
   - Lovesick, Michael Dorsten, Mr. D are all Mike's test accounts. The "completed game" in `bac4d923` is Mike's own test play-through, NOT a real user's history.
   - Only Mr. D (`d8b2c7af…`) overlaps both — that's why he appeared twice in the very first voters query. Different rosters otherwise → these are two distinct stale test classes from different days, not an accidental copy.
4. **This LOWERS the stakes a lot.** There's no real user data to protect in either class — both are Mike's test debris. So cleanup is low-risk whenever it happens; the only reason it's still deferred is "decide deliberately, not at the end of a low-data session," not "danger."
5. **Reframed end state:** not "pick the real one, kill the dupe." More like "two stale test classes, both public, both mine." Cleanest target is probably ONE canonical test class. Options: keep whichever you prefer testing in and un-publish the other; or un-publish both and stand up a single fresh public class. Either is fine — nothing to lose.

---

## THE DECISION TO MAKE NEXT SESSION (now low-stakes — all test data)

Section 2 already ran (results in TL;DR #3): all four enrollees are Mike's own test accounts; both public classes are stale test sessions, nothing real to protect. So this is a cheap cleanup decision, not a risky one. Pick ONE of:

- **Keep `d9ce91d4` (older) as canonical, un-publish `bac4d923`.** Simplest — the app's `limit 1` resolver already points here and the tally seed already lives here, so the proof proceeds untouched. Use Section 3 of the resolve snippet (reversible). Mike's own "completed" test game in `bac4d923` just gets hidden, not deleted.
- **Un-publish BOTH and stand up one fresh public class.** Cleanest long-term if you want a known-good single test class — but then re-seed the tally proof into the new one (teardown old seed first; snippet has it) and re-enroll test students.
- **Keep `bac4d923` (newer).** Least convenient (re-point resolver + re-seed); little reason to, given its only extra content is a test play-through.

Recommendation: keep the older `d9ce91d4` and un-publish the newer — least churn, proof stays valid, fully reversible. Then make the resolver deterministic so it can't silently flip (un-publishing the loser already achieves this; optional belt-and-suspenders is `order by created_at` in the resolver, or a partial unique index — but the index bakes in "one public class forever," noted as conflicting with the someday-multiple-classes case).

**`enrollments` columns to remember:** `class_id`, `student_id`, `status` (active/completed/dropped), `unique(student_id, class_id)`. NO `created_at`.

---

## Carried forward (condensed; full detail in #18/#17)

- Proof blocker: all tally RPCs call `owns_class(p_class_id)` → reads `auth.uid()` → NULL as postgres role → "not authorized". Confirm `owns_class` body, then simulate teacher JWT (`set_config('request.jwt.claims', '{"sub":"18f23db0…","role":"authenticated"}', true)`) in the same run. THIS is next session's first technical task after the class decision.
- Winner is computed-on-read, not persisted (from `class_round_winners` body) → orchestration is lighter; remaining unknown is where round/timer (24/22/24) state lives.
- Tally seed expected results once proof runs: tally_round r1/r2 → A=2,B=1 each; class_round_winners → r1=A, r2=B (cap fired); grand_totals → A=4,B=2. A=Lovesick, B=Mike D, C=Michael Dorsten (voter only). Seed saved as SQL snippet "Seed submissions and favorites".
- Moderation surface committed+pushed (`75add03`) — don't re-check.
- Product observations (engine-world, unaddressed): CSV gate-until-completed; note-editor collapse-on-save bug; magic link lands /play not /student/dashboard; "1 Issue" overlay on /teacher/students.
- SQL snippet sprawl: hundreds of unnamed snippets accumulating. Name the ones that matter; ignore the rest.

## Working agreement (unchanged)

Mike holds editor/dashboard/keys/pushes. SQL editor = one result set per run. `supabase/migrations/` = STRUCTURAL only; seeds/proofs/diagnostics live as snippets, not in the repo. Verify before declaring done. Mike's confident at SQL, less so JS/TS — lean on SQL proofs.

---

## First-message-to-next-Claude

**The tally proof is GREEN — that blocker is closed (see the ✅ section up top). Do NOT re-run it.** What's ahead:

1. **State model is now MAPPED (diagnostics done — don't re-run).** No server-side round clock; `classes` is just id/teacher/name/created_at/is_public. Round lives in two per-player pointers: `enrollments.round` and `game_sessions.round`. LIVE family = `game_sessions`/`submissions`/`submission_favorites` (+ `entries` deck); DEAD = `sessions`/`session_comments` (0 rows, ignore). **First task: determine which round pointer (`enrollments.round` vs `game_sessions.round`) is source-of-truth and whether they sync** — read the app code that writes them (grep `game_sessions` / `enrollments` writes in `src/app/play/actions.ts` and `src/lib`).
2. **Then make the design call before any orchestration code: per-player rounds vs synchronized rounds.** Schema supports only per-player today; synchronized needs NEW class-level state. Winner is computed-on-read, so the read side needs nothing — the only question is whether/how rounds advance.
3. **Still open (independent, low-stakes): the `bac4d923` product choice.** `/play` unions all public classes, so un-publishing it removes its entries from the `/play` deck — single-cohort vs multi-cohort `/play`. All test data, fully reversible. Not a determinism fix. Mike's call; no rush.

One line: **tally proof GREEN, one-win cap verified (r1=A, r2=B; totals A=4,B=2); `owns_class` = `auth.uid()` vs `teacher_id`, param `cid`; NEXT is mapping the state model (no server-side round clock; two-session-table drift — confirm which family is live) and redefining "round-close" before any orchestration code; `bac4d923` single-vs-multi-cohort decision still open and independent.**
