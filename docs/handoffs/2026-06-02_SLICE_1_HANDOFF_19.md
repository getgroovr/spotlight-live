# SLICE 1 HANDOFF #19 — Duplicate public class is NOT trivial debris; canonical-class decision deferred

**Date written:** 2026-06-02 (later same day as #18)
**Picking up from:** #18 (tally-proof seed applied; proof blocked on owns_class). Then investigated the two-public-class situation.
**This session add-on:** ran diagnostics on the two public classes. Found BOTH have real enrollments — this is a genuine decision, not cleanup. Deferred deliberately.
**Destination:** `docs/handoffs/`

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

Two things sit ahead, in order:
1. **Clean up the duplicate public class (low-stakes — all Mike's test data).** Both public classes are stale test sessions; nothing real to lose. Recommended: keep older `d9ce91d4` (resolver + seed already point here), un-publish newer `bac4d923` via the resolve snippet's Section 3 (reversible). Then the resolver is deterministic. ~2-minute opener.
2. **Then unblock + run the tally proof:** confirm `owns_class` body, simulate teacher JWT, run the four proof queries (expect r1=A, r2=B; totals A=4, B=2). Once green, start round-close orchestration (winner is computed-on-read, so lighter than feared).

One line: **tally seed live in older public class `d9ce91d4`; proof one owns_class/JWT step away; the two public classes are both Mike's stale test data (newer holds a test play-through, not real history) → low-stakes cleanup, recommend keep-older/un-publish-newer; then run the proof.**
