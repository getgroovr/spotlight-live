# SLICE 1 HANDOFF #18 — Tally-proof seed APPLIED; proof blocked only on owns_class

**Date written:** 2026-06-02 (later same day as #17)
**Picking up from:** #17 (Option R chosen; recon done; draft seed written).
**This session:** finalized the seed against confirmed `submissions` columns, ran it successfully, pulled the three tally function bodies. Seed is LIVE. Proof not yet run.
**Destination:** `docs/handoffs/`

---

## TL;DR

1. **The rigged tally-proof seed is APPLIED and verified-written.** Ran clean ("Success. No rows returned" = INSERT wrote, returns nothing). It is saved as a Supabase SQL editor snippet named **"Seed submissions and favorites"** (the only named one — see housekeeping note). It inserted into the older public class `d9ce91d4-793f-4ed9-81ea-201c0d15602e`:
   - 4 approved submissions: A & B in rounds 1 and 2 (descriptions `SEED A r1`/`SEED B r1`/`SEED A r2`/`SEED B r2`).
   - 6 favorites rigged so A is top on RAW favorites in BOTH rounds, B second in round 2.
   - A = Lovesick `055a4c6c…`, B = Mike D `d8b2c7af…`, C = Michael Dorsten `470130a8…` (voter only).
2. **`submissions` columns are now CONFIRMED ground truth** (introspected, not guessed): `id uuid (default gen_random_uuid())`, `student_id uuid`, `class_id uuid`, `round int`, `media_url text NOT NULL (no default — must supply)`, `description text (default '')`, `status submission_status ENUM NOT NULL (default 'pending'; 'approved' is valid)`, `reviewed_by uuid NULL`, `reviewed_at timestamptz NULL`, `created_at timestamptz (default now())`. All NOT NULL except reviewed_by/reviewed_at.
3. **The three tally functions are understood (bodies pulled):**
   - All three are `SECURITY DEFINER` and START with `if not public.owns_class(p_class_id) then raise exception 'not authorized…'`.
   - `class_round_winners` IS where the one-win cap lives: it loops over distinct rounds **that have favorites**, picks the top submission per round EXCLUDING students already in a `won uuid[]` array (`not (s.student_id = any(won))`), requires `having count(f.id) > 0`, tie-breaks `count desc, created_at asc, id asc`. Winner is **computed-on-read, NOT persisted** — answers #17's open question: crowning is display, no winner table to write.
   - `tally_round` = all approved subs for the round + counts, ordered desc. `class_grand_totals` = favorites received per student over approved subs, desc.
4. **Expected proof results** (when the proof runs): `tally_round(…,1)` → A=2,B=1. `tally_round(…,2)` → A=2,B=1. `class_round_winners` → **round 1 = A, round 2 = B** (A capped, reassigned). `class_grand_totals` → A=4, B=2 (C absent — never submitted).

---

## THE ONE THING BLOCKING THE PROOF (first task next session)

The proof RPCs can't just be called in the SQL editor: `owns_class(p_class_id)` reads `auth.uid()`, which is **NULL when running as the `postgres` role** → the RPCs throw "not authorized for class". The seed was unaffected (plain inserts, no owns_class). To run the proof:

1. **Confirm `owns_class`'s body first** (we haven't seen it): `select pg_get_functiondef(oid) from pg_proc where proname='owns_class';`
2. Then simulate the teacher's JWT in the SAME run before calling the RPC, e.g.:
   ```sql
   select set_config('request.jwt.claims',
     '{"sub":"18f23db0-0b2f-4f30-914a-233c3a73c305","role":"authenticated"}', true);
   select * from class_round_winners('d9ce91d4-793f-4ed9-81ea-201c0d15602e');
   ```
   (Exact claim shape depends on what owns_class reads — confirm in step 1.)

Once the proof is green, THEN write round-close orchestration app code. Winner is computed-on-read (TL;DR #3), so orchestration is lighter than feared — no winner-persistence table to build; the open question left is where round/timer (24/22/24 clock) state lives.

---

## Carried forward (unchanged from #17)

- Two public classes exist (test debris); `limit 1` resolver is ambiguous — not this slice's job. Target is hardcoded `d9ce91d4…` everywhere.
- `submission_favorites` cols: `id, voter_student_id, submission_id, class_id, round, created_at` (voter col is `voter_student_id`; seed copies class_id/round from parent — soft spot, DB doesn't enforce match).
- Git for the moderation surface: committed+pushed (`75add03`), don't re-check.
- Product observations (engine-world, not addressed): CSV-gate-until-completed; note-editor doesn't collapse-on-save; magic link lands on /play not /student/dashboard; "1 Issue" overlay on /teacher/students.
- Teardown for THIS seed (in the snippet): delete favorites where submission_id in (subs where description like 'SEED % r%' and class_id = target), then delete those subs.

## Housekeeping note (Mike flagged)

Mike creates a NEW SQL editor snippet each time Claude hands over SQL — there are now hundreds, almost all unnamed. The seed this session WAS saved as "Seed submissions and favorites." Going forward: either name snippets on save, or periodically prune. Not urgent, just noise.

## Working agreement (unchanged)

Mike holds editor/dashboard/keys/pushes; Claude never pushes. SQL editor returns ONE result set per run. `supabase/migrations/` = STRUCTURAL only — seeds and proofs do NOT go there or in the repo; they live as SQL editor snippets. Verify before declaring done.

---

## First-message-to-next-Claude

Seed is LIVE and verified-written (snippet "Seed submissions and favorites"). Columns + function bodies are confirmed. **First task: confirm `owns_class`'s body, then run the four proof queries with a simulated teacher JWT (see "THE ONE THING BLOCKING THE PROOF").** Expected: round 1 = A, round 2 = B; grand totals A=4, B=2. Once green, start round-close orchestration — winner is computed-on-read (no persistence needed); next unknown is where the round/timer clock state lives.

One line: **social data + logic + moderation surface live; Option R tally-proof seed APPLIED; proof is one owns_class/JWT step from green; orchestration is next and lighter than feared (winner computed-on-read).**
