# Slice 1 — Handoff #26
**2026-06-05**

This session: round-timing schema migration + error surfacing for saveProfile/addEntry + success-banner polish.

---

## How to work with Mike

1. **Whole-file replacements via `present_files`.** NEVER paste code into chat. Mike copies code out of the file panel, not the message body. If a file is more than a few lines changed, ship the whole file as a downloadable.
2. **One copy-clip = one command.** Each fenced block in chat is something Mike will paste into a terminal or SQL editor. Don't split a command across blocks. Don't pile multiple commands into one block unless they're meant to run as one paste.
3. **Mike runs SQL in the Supabase editor + PowerShell in the VS Code terminal.** SQL gives him one result set per run. PowerShell syntax matters (use `Get-ChildItem`, not `ls -la`; backslash paths; PS-style flags).
4. **Read his screenshots.** When Mike sends an image, look at it. Don't ask for the same info in text. Most of his back-and-forth is screenshot → next step.
5. **Don't inflate scope.** If a task is small, say it's small. If it can land in 20 minutes, don't bundle it with three other things.
6. **Confirm before building on an unknown.** Ask to see files before guessing at their contents. The handoff's file map gives you the structure; the actual code lives in the repo.
7. **Two-track student IDs — do not conflate.**
    - `students.id` is the **students track**. Used by `enrollments`, by `students` itself, by `game_sessions.student_id`.
    - `profiles.id` = `auth.users.id` is the **profiles track**. Used by `entries.student_id` (the column is named `student_id` but it FKs to `profiles`). Class membership on this track lives on `profiles.class_id`.
    - When in doubt: entries are on the profiles track; everything else students-related is on the students track. Confusing this seam has bitten us at least three times.
8. **Don't `DELETE FROM students` to reset.** Cascade chain wipes things you don't want gone. Use targeted deletes; Mike has SQL snippets saved for the common reset paths.
9. **When Mike says he's running out of context (data plan/session, not stamina), finish what's in flight.** Don't start a new feature. Ship what's mid-flight, write the handoff, stop. Same applies when Mike says he's tired — finish, don't extend.
10. **`supabase/migrations/` = STRUCTURAL ONLY.** Seeds, proofs, diagnostics are snippets in chat — not committed migration files. Migration filenames use `YYYYMMDDHHMMSS_description.sql` (14 digits).
11. **Working agreement.** Mike holds editor/dashboard/keys/pushes. Claude designs, drafts whole files, hands them over. Mike applies, commits, pushes.
12. **Mike's stack at #26:** Next.js 16.2.6, React 19. `useFormState` from `react-dom` is no longer available — use `useActionState` from `"react"`. Same signature; ignore the third tuple element (`isPending`).

---

## What shipped in #26

### A. Round-timing schema migration

**File:** `supabase/migrations/20260605143000_add_round_timing_to_classes.sql` (applied + committed)

Added three nullable columns to `classes`:

| column | type | constraint |
|---|---|---|
| `round_duration_hours` | int | NULL allowed; CHECK `IN (1, 24, 168)` — 1hr / 1 day / 1 week |
| `game_starts_at` | timestamptz | NULL allowed |
| `game_ends_at` | timestamptz | NULL allowed; CHECK `> game_starts_at` when both set |

Plus index `classes_game_starts_at_idx` for "is this class currently running?" reads.

**Design decision (Mike's call):** Option A (uniform duration on `classes`) rather than Option B (per-round `rounds` table). Three nullable columns, no new table. Tradeoff accepted: can't have round 1 = 1 hour and round 2 = 1 week. If that need shows up, add a `rounds` table later.

**Verified in-session:** column query returned 8 rows (original 5 + the three new ones), all matching spec.

**What's intentionally NOT in this migration:**
- `entries.round_number` denormalization. See "Round assignment for new uploads" below in *What's next* — this is now a primary #27 concern.
- Any teacher UI to SET the values. #27.
- Any dashboard countdown or agree-gate read. #27.

The schema is live but unused. Every existing class still has all three columns NULL and behaves exactly as before.

### B. Error surfacing for saveProfile + addEntry

**Files changed:**
- `src/app/play/actions.ts` (modified — `enrollStudent` untouched)
- `src/app/student/dashboard/page.tsx` (modified — inline forms removed)

**Files added:**
- `src/app/student/dashboard/FinishJoiningForm.tsx` (client component)
- `src/app/student/dashboard/AddEntryForm.tsx` (client component)

**The problem:** Both server actions were `Promise<void>` and any failure (no class, upload failed, insert failed) was `console.error` + silent return. Student hit submit; nothing happened; no idea why.

**The fix:** Both actions now return `ActionResult = { ok: true } | { ok: false; error: string }`. Signature takes a leading `prevState` arg (ignored) per the `useActionState` contract:
```ts
saveProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult>
addEntry(_prev: ActionResult | null, formData: FormData): Promise<ActionResult>
```

The dashboard page used to render `<form action={saveProfile}>` and `<form action={addEntry}>` inline. Those are now `<FinishJoiningForm ... />` and `<AddEntryForm />` — client components that call `useActionState` against the corresponding action and render a red error banner above the submit button when `state.error` is set.

**Hard vs. soft fail decisions:**
- **HARD** (returns error, blocks the save): missing class, entry upload failure, entry insert failure, env not configured, expired session, missing required fields.
- **SOFT** (logs and continues): self-photo upload failure inside saveProfile (it's optional anyway), the favorite_comment session update at the end of saveProfile, the magic-link send inside enrollStudent.

**React/Next note (important):** First swing used `useFormState` from `react-dom`. On Next 16.2.6 / React 19 (Mike's stack), this is no longer available — produces a hard dev-time error ("ReactDOM.useFormState has been renamed to React.useActionState"). Fixed by switching to `useActionState` from `"react"`, aliased locally to `useFormState` to keep the existing names in the components:
```ts
import { useActionState as useFormState } from "react";
```
Same signature, three-tuple return (`[state, dispatch, isPending]`) — destructure ignores the third element. Future Claudes: just use `useActionState` directly.

### C. Success-banner polish (follow-up to B)

Same two form files, second pass:

- Green success banner above the submit button on `state.ok === true`. AddEntry copy: *"Submitted ✓ Your teacher will review this. Add another whenever you'd like."* FinishJoining copy is shorter since the page transitions on success and the banner rarely renders in practice.
- Form-reset trick on successful submit. Wrapped the form contents in `<div key={submitId}>` where `submitId` is bumped by a `useEffect` watching `state.ok`. On success, React unmounts and remounts the subtree — which resets `PhotoField`'s internal preview thumbnail along with the native input/textarea values. Banners live OUTSIDE the keyed wrapper so they persist across the reset.
- Reason for the polish: before this, a successful AddEntry submit cleared the textarea and file input but left PhotoField's preview thumbnail visible, with no success indicator anywhere. Read as ambiguous — "did it actually submit?"

---

## Testing — what to look for

### Migration (verified this session) ✓
- 8 rows from `information_schema.columns` query on `classes`, three new at the bottom.

### Error surfacing — full walkthrough

**1. Happy path smoke test (nothing visible should change beyond the new success banner)**

Restart dev server after pulling the new files (`npm run dev`).

- Go through the full join flow at `/play` → finish-joining → dashboard.
- ✅ Expected: dashboard reloads in COMPLETE state, "Your photo" section shows the uploaded photo with `AWAITING APPROVAL` badge.
- In "Add another photo", upload + describe + submit.
- ✅ Expected: green banner reading "Submitted ✓ Your teacher will review this." PhotoField thumbnail GONE. Textarea empty. File input back to "No file chosen." "Your photo" section above shows the new pic.

**2. Forced-failure test — SKIPPED in #26.** Supabase doesn't allow renaming buckets ("Cannot be changed after creation"). Alternative path for next session: DevTools → Network tab → Offline toggle should force a different upload failure path. Mike's call whether to verify or trust the code path.

**3. Regression check — what should NOT have changed**
- Layout, spacing, colors, font sizes, button copy on both forms: identical.
- `enrollStudent` behavior at `/play`: untouched, still returns `EnrollResult` as before.
- The "Your photo" card, the history strip, the "What happens next" copy: all unchanged.

---

## What's next — and the ordering matters

### Round assignment for new uploads — THE big #27 design question

This came up at the end of #26 and is the most important thing to figure out before more code lands. Mike's mental model when he was testing: *new photos a student uploads should be queued for FUTURE rounds, not the current one.* Current behavior: every new entry replaces the previous one on the dashboard ("Your photo" only shows the most-recent), and there's no per-round assignment. So if a student uploads photo A in round 1 and photo B halfway through round 1, photo B replaces A — both for the dashboard view and (once approved) for what classmates see.

**Why this matters:** the engine adaptation (#25) made uploads possible anytime, but the round-assignment semantics weren't built. Without them, students upload-and-replace, and the "stack of own entries over time" the product is supposed to show doesn't exist.

**What needs to be designed (start of #27):**
1. **The product question first.** When a student uploads while round N is live, does the photo go to:
    - **(a) Next available round** — round N+1, queued. Student's round-N photo is locked in once round N starts. Re-uploads while N is live go to N+1. This matches Mike's intuition and the rounds metaphor.
    - **(b) Current round, replace previous** — student can keep refining their submission while the round is live; whatever's in at round end is what counts. Simpler implementation but doesn't match "rounds as ordered submissions."
    - **(c) Current round if not yet submitted, else next round** — first upload of the round goes to current round, subsequent uploads go to next. Hybrid.
    - Recommended: (a) — matches the product story, and the dashboard becomes a real timeline of contributions over rounds.
2. **Schema:** denormalize `round_number` onto `entries`. Computed at insert time from the class's timing fields:
    - If no game_starts_at or before game_starts_at → round_number = 1 (pre-game uploads count for round 1)
    - If during round N → round_number = N+1 if student already has an entry for round N, else N
    - If after game_ends_at → reject the upload (game's over)
   This is a follow-up migration: `alter table entries add column round_number int;` plus a backfill UPDATE for existing rows (all currently round 1).
3. **`getStudentArchive`:** change `ownEntry: OwnEntry | null` → `ownEntries: OwnEntry[]` grouped/sorted by round_number. The "Your photo" dashboard section becomes "Your photos" with a per-round breakdown.
4. **`addEntry` write path:** compute target round at insert time using the rules above; reject with a friendly error if the game is over.
5. **Dashboard UI:** "Your photos by round" — Round 1 submission, Round 2 submission (queued), etc. With `AWAITING APPROVAL` per entry.

This is now coupled with what was previously listed as #27's *(a) round-timing UI* and *(b) upload V2 — full stack of own entries on the dashboard*. They're the same feature when you trace it through.

### Round-timing UI (still in #27 scope)
- Teacher settings UI to set `round_duration_hours`, `game_starts_at`, `game_ends_at` on a class. Reuse the `ActionResult` pattern with a new server action `setClassTiming`.
- Dashboard countdown when timing is set: "Round N ends in HH:MM:SS" above "Your photos."
- Agree-gate on "Go to the game →" once `now() > game_ends_at` ("Game complete" + link to reveal once it exists).
- "What happens next" copy revision once timing is live.

### Small follow-ups (not blockers — pick up as warm-up tasks)
- **Banner persistence papercut.** Success banner stays green until the next submit completes. Better UX: dismiss when the user interacts with the form again (onChange on file input or textarea clears the banner). Or auto-dismiss after ~4s. Either is a 5-min component-local change.
- **History strip collapse** — collapse past rounds into buttons.
- **Reduce thumbnail size in history grid** — pure CSS in ProfileArchive.
- **Classmate comments under own photo** — once approved, show `submission_comments` keyed to the entry under the dashboard card.
- **"Reset this test student" teacher button** — or fix Gmail plus-addressing workaround instead. Lower priority.
- **Student profile look more like teacher's view** — design pass, scope TBD.

---

## Open issues (carry from #25)

- **entries-vs-submissions mismatch** — needs resolution before reveal lands. Reveal RPCs reference `submissions` / `submission_favorites`; the actual writes go to `entries`. Two-track mismatch.
- **students↔profiles seam** — also needs resolution before reveal. See HOW TO WORK WITH MIKE #7.

Neither blocks the #27 round-assignment work above — those uploads stay on the entries/profiles track.

---

## File map (delta from #25)

**New:**
- `supabase/migrations/20260605143000_add_round_timing_to_classes.sql`
- `src/app/student/dashboard/FinishJoiningForm.tsx`
- `src/app/student/dashboard/AddEntryForm.tsx`

**Modified:**
- `src/app/play/actions.ts` — `ActionResult` type added; `saveProfile` and `addEntry` now return `ActionResult`; `enrollStudent` unchanged
- `src/app/student/dashboard/page.tsx` — inline forms replaced with imports of the two new components

**Schema delta:**
- `classes` table gained `round_duration_hours`, `game_starts_at`, `game_ends_at` (all NULL-allowed); index `classes_game_starts_at_idx`; CHECK constraints `classes_round_duration_hours_check` and `classes_game_window_check`.

---

## Working notes for next-session Claude

- **Start the next session by asking Mike to confirm the round-assignment design choice** (a, b, or c above). Don't write code until that decision is made; it's the foundation for the schema follow-up and `addEntry` rewrite.
- The `ActionResult` + `useActionState` client wrapper + colored banner pattern is now the established pattern for server-action forms. Reuse it for `setClassTiming` and any other action that takes user input.
- The migration timestamp convention is `YYYYMMDDHHMMSS_description.sql`. Don't deviate.
- Mike applied #26's migration via the Supabase SQL editor (he doesn't have the `supabase` CLI installed locally). The file in `supabase/migrations/` is the repo record. Both are in sync. If a future session needs CLI workflows, install it first.
- Mike's React 19 / Next 16.2.6 means: `useActionState` from `"react"`, not `useFormState` from `react-dom`. Document for next time.
- The CHECK constraint on `round_duration_hours IN (1, 24, 168)` is intentional but loosenable in a 3-line follow-up migration if a 30-min or 3-day duration use-case comes up.
