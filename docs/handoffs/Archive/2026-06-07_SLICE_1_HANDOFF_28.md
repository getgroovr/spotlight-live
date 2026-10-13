# Slice 1 — Handoff #28
**2026-06-07 (Saturday → Sunday, ~6 hours of work)**

Smoke-test pass on #27's slot stack, layout refinement based on Mike's mobile feedback, "Replace photo" rename, and game-over polish. No new schema, no new actions — pure UX iteration on top of #27's foundation.

---

## How to work with Mike

(Carry from #27, plus one new principle added this session at the bottom.)

1. **Whole-file replacements via `present_files`.** NEVER paste code into chat. For small surgical changes, `str_replace` against the version already in outputs is fine — but the deliverable is still a downloadable file Mike can save over the existing one.
2. **Confirm before building on an unknown.** Ask to see files before guessing at their contents. If Mike says he uploaded something and you can't see it, double-check `/mnt/user-data/uploads/` with `view` before claiming it's missing.
3. **Use the `ask_user_input_v0` tappable-options tool when clarifying.** Mike is on mobile; tap > type. Save free-form questions for cases where options don't fit.
4. **Don't inflate scope.** Mike moves fast. Ship the smallest correct change. When in doubt, do less, leave a follow-up note.
5. **Sound design choices > asking.** When the right answer is obvious, do it and note the choice in chat or comments. Save questions for genuine forks.
6. **When Mike says he's tired OR running low on context, finish what's in flight and write the handoff. Don't start a new feature.** Mike can override and ask to continue — respect that, but keep changes minimal once context is tight.
7. **Mike commits at end of session, not per-file.** Don't pressure for intermediate commits. He'll do one at the end with a session-spanning message.
8. **Read the handoff BEFORE doing anything in a new session.** Verification of the previous session's work is step 1, always.
9. **NEW (#28): Search past conversations when Mike references prior design work.** He's done 27+ sessions; decisions live scattered across many chats. When he asks "do you have any reference to this?" or references a prior decision casually, use `conversation_search` BEFORE answering from speculation. This session: searching "winners top three students game end" surfaced a fully-locked design from June 3 that would have been impossible to recall otherwise.

---

## Where this session ended

The dashboard's slot stack now has a polished layout and handles all four lifecycle states cleanly (verified end-to-end except multi-class — see below):

- **Active mid-game** — filled cards use image-left + compact-metadata-right top row, with description and teacher note spanning full card width below. Mike's quote: "I think you nailed it this time."
- **Empty live round** — already worked from #27; verified.
- **Game over** — completion-aware: welcome heading swaps to "Well done, $name.", subtitle swaps to "You've completed the class.", the "Go to the game →" button hides, the "Your rounds" preamble hides, and a new "See the 3 most favorited students →" button anchors the bottom of the slot stack (routes to `/student/results`, which 404s — reveal slice is the #29 priority).
- **Past classes (multi-class history strip)** — still unverified end-to-end; deferred until teacher UI lets Mike create real second classes naturally.

The Replace-photo affordance is now called "Replace photo" (not "✕ Remove"). The underlying action still removes the entry — the empty slot then surfaces "+ Add photo" so the student can upload again. Two-step under the hood, replacement in the user's mental model.

---

## What shipped in #28

### A. Slot card layout overhaul

**File:** `src/app/student/dashboard/page.tsx` (modified)

Five iterative passes ending at a stable layout. New helper component `FilledTopSlotCard` consolidates the live + queued card markup that was previously inline.

**Final layout for filled cards in the top band:**

```
┌──────────────────────────────────────────┐
│  ┌────┐  [● LIVE pill if live]           │
│  │ IMG│  STUDENT ROUND N                 │
│  │    │  [AWAITING APPROVAL]             │
│  └────┘  Replace photo (if !isLocked)    │
│          You can replace this photo …    │
│                                          │
│  YOUR DESCRIPTION                        │
│  "..." — spans full card width           │
│                                          │
│  YOUR TEACHER SAID                       │
│  ... — spans full card width             │
└──────────────────────────────────────────┘
```

Image sizes: **120px baseline, 140px live** (Mike: "all the same... if anything the current should be a little bigger... pic by itself to the left"). Live pill moved INSIDE the metadata column rather than as a banner above the card — the green border carries the primary "live" signal, the pill reinforces.

**Why image-top + metadata-right, then full-width text below?** Mike's call: "if the students write a lot- it will take up a lot of space using only one column... maybe the round number, the waiting approval and the remove next to the pic. and the text that can get longer- namely, the description- below it." Description and teacher note get the full card width on both desktop and mobile.

**Mobile responsiveness:** the metadata column uses `minWidth: 0` (NOT 220 as in earlier passes) so it shrinks instead of triggering `flex-wrap` that kicked the image above the text on narrow viewports. `wordBreak: "break-word"` on description + teacher note prevents long unbroken strings (like Mike's "hkhljhlkhkjhjkh" test data) from blowing out the column width.

### B. Replace photo rename

**Files modified:** `src/app/student/dashboard/RemoveEntryButton.tsx`, `page.tsx`

- Button text: "✕ Remove" → "Replace photo" (dropped the ✕ since it read as a delete icon).
- `aria-label`: "Remove your Student Round N photo" → "Replace your Student Round N photo".
- Component name stays `RemoveEntryButton` and the action stays `removeEntry` — those describe what the code does. Only the user-facing label changes. Renaming the component would churn imports for no gain.
- Old footer copy "Queued for Student Round N. You can replace it until the round starts." was redundant with the SlotHeader saying "STUDENT ROUND N" three lines above. Replaced with a single small caption under the Replace button: "You can replace this photo until the round starts." Slightly smaller (fontSize 11) so it reads as a sub-caption.

### C. Game-over polish

**File:** `page.tsx`

When `isGameOver`:
- **Welcome heading** swaps to "Well done, $name."
- **Welcome subtitle** swaps to "You've completed the class."
- **"Go to the game →" button** hides entirely. `/student/play` shows "waiting on classmates" copy that's nonsensical post-completion. Hiding is interim — when the reveal slice lands, the button comes back with new copy + href.
- **"YOUR ROUNDS" h2 + "After your teacher's round..." preamble** hides. Instructional copy reads as stale once every slot is in the Completed band.
- **Game-complete dashed banner DROPPED.** The new welcome subtitle conveys the same status, and the new bottom button serves as a clear end-of-stack marker. No need for both.
- **New "See the 3 most favorited students →" full-width button** at end of stack, routing to `/student/results`. That page doesn't exist yet — it 404s. Comment in source flags the dependency on the future reveal slice.

### D. Status-only block design (CAPTURED, NOT BUILT)

Mike's call this session, recorded in `RemoveEntryButton.tsx` source comments for the implementation pass:

Once a teacher has APPROVED an entry, the student should no longer be able to replace it. Pending entries — even those with a teacher note attached — REMAIN replaceable; notes are cheap to redo, approvals are commitments. Implementation steps documented in the file header. The UI helper text ("You can replace this photo until the round starts.") was NOT updated to mention approval yet because the block isn't wired up; updating it now would be a lie.

---

## File map (delta from #27)

**Modified:**
- `src/app/student/dashboard/page.tsx` — new `FilledTopSlotCard` helper, game-over-aware header + buttons + preamble, layout restructure.
- `src/app/student/dashboard/RemoveEntryButton.tsx` — label rename, planned-status-only-block design captured in header comment.

**Schema delta:** none.

**Migrations:** none.

---

## Verification status

**Verified end-to-end** with Mike's test class:

- ✅ Empty live state (Round 3 live, no entry) — renders correctly: green border, pill, "You didn't add a photo for this round. The slot is locked now — your next chance is Student Round N+1."
- ✅ Game over state (`game_starts_at = NOW() − 7 days`, total_rounds=5, round_duration_hours=24 → currentRound = 8 > 5) — all 5 rounds in Completed band, warm-up at bottom, welcome message swaps correctly, button + preamble hide, reveal CTA appears.
- ✅ Filled-queued state with the new layout (Round 4 queued for Mike) — image-left, metadata-right, description full-width below.
- ✅ Mobile responsive at 400px viewport — image stays on left, metadata shrinks to fit, text wraps cleanly.

**Not yet verified:**

- ⚠ Multi-class history strip — deferred. Would require creating a synthetic past class via SQL (insert classes row, backfill entries, ensure `profiles.class_id` doesn't point to it). Better to verify naturally when the teacher UI lands and Mike can create a real second class. Known gap, not a regression risk.

---

## What's next — #29

**Mike's stated preference: end-of-game reveal BEFORE teacher UI.** ("I think I'd rather do the end of reveal before the teacher UI but it doesn't really matter.") Lead with reveal.

### Priority 1: End-of-game reveal (top 3 students)

**Design is FULLY LOCKED** — see June 3 conversation titled "Resolving round pointer source-of-truth" (searchable via `conversation_search` for "winners top three students").

- **Top 3 students by total favorites received across all rounds.** No per-round winners.
- **Each top-3 student gets two panels:**
  - **Panel A — Their posted pic:** the photo they submitted that was favorited most across all rounds, shown with comments from *only the classmates who favorited it* (not every comment).
  - **Panel B — Their taste:** tiered by placement.
    - Gold (1st): all 9 favorites shown, with their own comments on each, chronological by round.
    - Silver (2nd): 6 favorites.
    - Bronze (3rd): 3 favorites.
- **Interaction:** podium top-level (1st/2nd/3rd), click a student to expand both panels.
- **Route:** `/student/results` (placeholder href already wired into the dashboard's end-of-stack button).

**Data sources — all already exist:**
- `class_grand_totals` RPC for ranking top 3.
- `submissions` + `submission_favorites` for the favorited pic + filtered comments.
- `game_sessions.favorites` (jsonb) for the student's own favorites per round.
- `game_sessions.comments` (jsonb) for their own comments on those favorites.

**PREREQUISITE: completion transition.** Nothing currently flips a student from `enrollments.status='active'` to `'completed'`. The migration comment says "manual for now." That has to land before the reveal is wireable. Define what triggers completion (finishing the last round's `game_sessions` row? a teacher action? auto-flip when `currentRound > totalRounds`?) and write it.

**BLOCKER: `entries` ↔ `submissions` seam.** The reveal pulls from `submissions`. This seam is still unresolved (carry from #25/#26/#27). Resolve it as part of this slice, or land the reveal in pieces.

**`class_round_winners` RPC may be parkable** — its purpose was per-round winners, which the design rejected. Confirm before removing; costs nothing to leave dormant.

### Priority 2: Teacher UI for class timing (CARRIED from #27→#28 plan)

Today Mike configures `total_rounds`, `round_duration_hours`, `game_starts_at` via raw SQL. Teacher needs a form on the teacher dashboard. Full spec carried from #27's "What's next" — re-read that section.

- Reuse the `ActionResult` + `useActionState` pattern from #26/#27.
- New action: `setClassTiming(prevState, formData) → ActionResult`.
- **Round-duration units decision still open.** Mike's mild preference is "single canonical unit, no fractions." Settle when building the picker.
- Class name (`classes.name`) goes in the same UI.

### Priority 3: Extract round-timing helpers (CARRIED)

`computeCurrentRound` / `isRoundLocked` / `isGameOver` are still duplicated in `actions.ts` and `student-archive.ts`. Extract to `src/lib/round-timing.ts` BEFORE any further lock-math changes. ~10 minutes.

### Open issues (carry forward)

- **`entries` ↔ `submissions` seam unresolved.** Blocks the reveal and the deferred classmate-comments-under-own-photo feature.
- **`students` ↔ `profiles` seam.** Two UUIDs per student. Documented at the top of `student-archive.ts`.
- **Banner persistence papercut.** Success banners stay until next navigation.
- **Status-only replace block (NEW in #28).** Design captured in `RemoveEntryButton.tsx` header comment. When implementing: pass `entryStatus` as a prop, hide button (or show "✓ Approved — locked in") when `status === 'approved'`, update server-side `removeEntry` to also reject when approved, update helper line. Pending-with-note entries remain replaceable.
- **Classmate-comments-on-replace** — separate, deferred. Pending the entries↔submissions seam.

### Smaller follow-ups (carry from #27, still open)

- Drop `ownEntry` (singular) from `student-archive.ts` — nothing reads it.
- Drop `classes.game_ends_at` (added in #26, confirmed unused).
- "Reset this test student" teacher button.
- The history strip (`ProfileArchive`) still does single-class accordion; could use the same `<details>/<summary>` pattern used in the Completed band for consistency.
- The unconfigured "Spotlight — Back Door" class row (NULL config) — leftover test data; safe to delete or use as a fresh test class.

---

## Working notes for next-session Claude

- **READ THIS HANDOFF before doing anything.**
- **The slot card layout is at its final form per Mike** — verified at 400px responsive and at desktop. Don't restructure it without explicit Mike-direction.
- **`/student/results` 404s right now — that's CORRECT.** The dashboard button routes there in anticipation of the reveal slice. Don't add a placeholder page just because the route doesn't resolve; build the reveal properly when you build it.
- **Status-only block: full implementation plan lives in `RemoveEntryButton.tsx` header comment**, not just in this handoff. When implementing, read that comment first — it captures the rationale (pending-with-note still replaceable), the steps (prop, conditional render, server-side rejection, helper text update), and the separately-deferred classmate-comments concern.
- The round-timing helpers (`computeCurrentRound`, `isRoundLocked`, `isGameOver`) STILL live in two files. Extract before touching the lock math.
- Mike's mental model is **"two-band, current at top, completed at bottom"** — DO NOT reintroduce a middle "current" band.
- Naming (Mike's calls): "Student Round N", "Teacher's Warm-up Round", "Replace photo" (button), "Well done, $name. / You've completed the class." (game-over greeting). No "Round 1, 2, 3" in UI copy — collides with "Student Round 1."
- When Mike says something looks "kinda dumb" or "weird," that's a layout/copy concern — show him an iteration, not a long explanation. He iterates fast on visible UI.
- The "Spotlight — Back Door" class with NULL config in the database is leftover test data, not a real class. Mike's actual test class is "Spotlight — Front Door."

---

*#28 session — UX polish session built entirely on top of #27's foundation. No new schema, no new actions, no new files except this handoff. End state: dashboard handles active mid-game and game-over states cleanly; layout reads well on desktop and at 400px mobile-emulated. The reveal slice is the natural next focus per Mike's preference, with the teacher UI close behind.*
