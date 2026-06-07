# Slice 1 — Handoff #27
**2026-06-06 (Saturday, ~6 hours of work)**

Round-assignment foundation + full dashboard rewrite around a slot stack.

---

## How to work with Mike

(Carry from #26, lightly refined this session.)

1. **Whole-file replacements via `present_files`.** NEVER paste code into chat. For small surgical changes, `str_replace` against the version already in outputs is fine — but the deliverable is still a downloadable file Mike can save over the existing one.
2. **Confirm before building on an unknown.** Ask to see files before guessing at their contents. If Mike says he uploaded something and you can't see it, double-check `/mnt/user-data/uploads/` with `view` before claiming it's missing.
3. **Use the `ask_user_input_v0` tappable-options tool when clarifying.** Mike is on mobile; tap > type. Save free-form questions for cases where options don't fit.
4. **Don't inflate scope.** Mike moves fast. Ship the smallest correct change. When in doubt, do less, leave a follow-up note.
5. **Sound design choices > asking.** When the right answer is obvious, do it and note the choice in chat or comments. Save questions for genuine forks.
6. **When Mike says he's tired OR running low on context, finish what's in flight and write the handoff. Don't start a new feature.** Mike can override and ask to continue — respect that, but keep changes minimal once context is tight.
7. **Mike commits at end of session, not per-file.** Don't pressure for intermediate commits. He'll do one at the end with a session-spanning message.
8. **Read the handoff BEFORE doing anything in a new session.** Verification of the previous session's work is step 1, always.

---

## Where this session ended

The dashboard's "Your rounds" surface is a clean two-band slot stack, verified working end-to-end with Mike's test class (`total_rounds=5`, `round_duration_hours=24`, `game_starts_at = now − 36 hours` → currentRound = 2).

What renders, in order:

1. **Header** — avatar + "Welcome, Mike."
2. **Go to the game →** button.
3. **Your rounds** section:
   - **Live + upcoming band** (top, ascending) —
     - Live round (currentRound): full card with a **green 2px border**, prominent green "● CURRENT ROUND — LIVE NOW" pill above the slot header, **100px image** (smaller than queued rounds to tighten the layout per Mike's request).
     - Queued upcoming rounds: full card with 140px image, status badge, "Queued for Student Round N" copy, ✕ Remove link.
     - Empty unlocked rounds: **collapsed `<details>` button** showing "STUDENT ROUND N — + Add photo ▸". Click to reveal the AddEntryForm inline.
   - **Completed rounds band** (bottom, condensed) —
     - One `<details>` button per completed Student Round, newest-completed nearest the top of the band: 44px thumbnail + "Student Round N" + status badge. Click to expand → image + description + teacher note.
     - **Teacher's Warm-up Round** at the very bottom (always last). Same condensed-button chrome. Click to expand → favorite block (image + quote + "What you said during the game" + "Why it was your favorite" + teacher note) followed by "Your other comments" vertical list.
4. **Past classes** (history strip) — hidden if there are none. Past classes only; the current class's warm-up moved into the slot stack's Completed band.

Mike's quote: "wow! this looks great! so easy to see everything and only the current stuff super visible." Solid signal the layout is landing.

---

## What shipped in #27

### A. Round-assignment migration
**File:** `supabase/migrations/20260606122000_add_round_assignment.sql` (applied + committed)

- `classes.total_rounds int` (NULL allowed; `CHECK total_rounds > 0 AND total_rounds <= 100`). Teacher sets this before the game begins. NULL = unconfigured.
- `entries.round_number int NOT NULL` (all pre-#27 rows backfilled to 1; `CHECK round_number > 0`).
- Index `entries_student_round_idx on entries (student_id, round_number)` for per-student per-round queries.

**Design decision** (Mike's call): round count lives on `classes.total_rounds` as a teacher setting. `classes.game_ends_at` from #26 is unused going forward — the game ends when the last round's lock-time passes; no separate end timestamp. #26's column kept (nullable) to avoid migration churn; safe to drop later.

**Lock semantics** (Mike's call): Round N is LOCKED the moment round N STARTS:
```
now >= game_starts_at + (N - 1) * round_duration_hours
```
Equivalently: N is locked iff N ≤ currentRound, where `currentRound = floor((now − game_starts_at) / round_duration_hours) + 1`, or 0 pre-game.

### B. Server actions (`src/app/play/actions.ts`)

- `saveProfile`: entry insert sets `round_number = 1`. Finish-joining is by definition pre-game.
- `addEntry`: accepts optional `round_number` from form; if absent, auto-resolves to the lowest unlocked + unfilled slot. Validates positive, ≤ `total_rounds` (when set), not locked, not already filled by this student. Returns `ActionResult` with friendly errors.
- `removeEntry` (**new**): takes `entry_id`, validates ownership + lock state, removes storage object (soft-fail) + entries row.
- **Mid-session fix:** when `total_rounds IS NULL`, `findFirstAvailableRound` caps `maxRound` at 100 (the schema CHECK), not 1. This lets students keep staging uploads before the teacher configures the game — each goes to round N+1 sequentially.
- Round-timing helpers (`computeCurrentRound`, `isRoundLocked`, `isGameOver`) inline at module top. **Duplicated in `student-archive.ts`** — extract to `src/lib/round-timing.ts` as cleanup in #28.

### C. Read layer (`src/lib/student-archive.ts`)

- `OwnEntry` now includes `roundNumber: number` and `teacherNote: string | null`.
- Returns `ownEntries: OwnEntry[]` (one per round, deduped most-recent-wins per round) sorted ascending by `roundNumber`.
- Returns `currentClassTiming: CurrentClassTiming | null` with `totalRounds`, `gameStartsAt`, `roundDurationHours`, pre-computed `currentRound`, `isGameOver`.
- Keeps `ownEntry: OwnEntry | null` for back-compat — definition shifted to "highest-round filled slot." Nothing reads it after #27; safe to remove in cleanup.
- Round-timing helpers duplicated from `actions.ts` (extract to `src/lib/round-timing.ts`).

### D. Dashboard rewrite (page.tsx + new component)

**Files:**
- `src/app/student/dashboard/page.tsx` — full rewrite.
- `src/app/student/dashboard/AddEntryForm.tsx` — now **requires** a `roundNumber` prop. Emits hidden `round_number` input. Slot-aware success copy ("Added to the queue ✓ Your teacher will review your Student Round N photo").
- `src/app/student/dashboard/RemoveEntryButton.tsx` (**new**) — small client wrapper around `removeEntry` with `useActionState`.
- `src/app/student/dashboard/ProfileArchive.tsx` — comments grid → vertical list matching the teacher dashboard's "Everything they wrote" layout. Round label renamed to "Teacher's Warm-up Round". Favorite filtered out of the list (it's already shown above in the pulled-out favorite block); section renamed "Your other comments." Current class now filtered OUT of `ProfileArchive` by the page (warm-up lives in the slot stack now).

**Layout pivots that happened mid-session, in order:**

1. **Three-band (Upcoming / Current / Completed)** → **two-band (Top: live + upcoming / Bottom: completed)**. The middle "Current" band caused a visual jump when a round transitioned from upcoming → in-progress. Folding live into the top band keeps the queue reading top-to-bottom.
2. **Empty unlocked slots: full forms → collapsed `<details>` buttons.** Multiple empty rounds × full AddEntryForm = too much vertical space. Mike: "doesn't take up so much space."
3. **Teacher's Warm-up Round moved from history strip → bottom of Completed band.** Now all archived rounds for the current class (student + warm-up) live in one place. The history strip ("Past classes") shows past classes only and hides entirely when there are none.
4. **Comments grid → vertical list** in the warm-up expansion (matches teacher dashboard layout grammar).
5. **Live slot image: 140px → 100px.** Mike: "the pic a little smaller and to the far left- text to the right of it- a little tighter." Other filled slots stay at 140px.

**Removed in #27:**
- The old "Your photo" single-card section.
- The old standalone "Add another photo" form.
- The "What happens next" footer copy (the slot stack communicates state on its own).

### E. Naming (Mike's call)
- UI labels rounds as "Student Round 1, 2, 3…". "Teacher's Warm-up Round" is the labeled name for the pre-Student-rounds game session (commenting on the teacher's starter content + picking a favorite).
- Schema is unchanged — `round_number` in data is the student's round. The "warm-up" concept is purely a UI label.

---

## File map (delta from #26)

**New:**
- `supabase/migrations/20260606122000_add_round_assignment.sql`
- `src/app/student/dashboard/RemoveEntryButton.tsx`

**Modified:**
- `src/app/play/actions.ts` — addEntry rewrite, saveProfile fix, removeEntry, timing helpers, unconfigured-state allow.
- `src/lib/student-archive.ts` — ownEntries[], currentClassTiming, teacherNote on OwnEntry, timing helpers (duplicated).
- `src/app/student/dashboard/page.tsx` — two-band slot stack + WarmupBody helper + collapsed empty slots + live styling.
- `src/app/student/dashboard/AddEntryForm.tsx` — required `roundNumber` prop.
- `src/app/student/dashboard/ProfileArchive.tsx` — vertical comments list, warm-up rename, favorite filtered from list, current class filtered at the page level.

**Schema delta:**
- `classes.total_rounds` int (NULL allowed, CHECK > 0 AND ≤ 100)
- `entries.round_number` int NOT NULL (CHECK > 0)
- index `entries_student_round_idx` on `entries (student_id, round_number)`

---

## Verification status

**Verified end-to-end** with Mike's test class:

- ✅ Migration applied; schema introspection returned both new columns correctly.
- ✅ Finish-joining flow → first entry lands at round 1.
- ✅ Pre-config state (`total_rounds IS NULL`) → student can stage uploads to round 1, 2, 3… sequentially.
- ✅ Configured state (`total_rounds=5, round_duration_hours=24`):
  - Pre-game → 5 collapsed Upcoming slots; uploads land at correct rounds; remove works on filled unlocked slots.
  - Time-traveled (`game_starts_at = now − 36 hours`, currentRound = 2) → Round 1 in Completed band (condensed), Round 2 live with green styling at top, Rounds 3-5 collapsed Upcoming, Teacher's Warm-up Round at bottom of Completed band.
- ✅ Warm-up dropdown expansion → favorite block + "Your other comments" vertical list, all data correctly populated.
- ✅ "AWAITING APPROVAL" badge on pending entries.

**Not yet verified:**

- ⚠ Empty live state (round started, student never uploaded) — code path exists but no test data hit it.
- ⚠ Game over state (currentRound > totalRounds) — code path exists but not tested.
- ⚠ Multi-class history strip (no past classes to test with).
- ⚠ The live slot's 100px image shrink (last change of the session, applied just before this handoff).

---

## What's next — #28

### Priority 1: Teacher UI for class timing

Today Mike configures `total_rounds`, `round_duration_hours`, and `game_starts_at` via raw SQL in the Supabase editor. **Teacher needs a form on the teacher dashboard** to set these. Per Mike: location on the teacher dashboard, near or above the student list (alongside original-pic management).

- Reuse the `ActionResult` + `useActionState` client wrapper pattern from #26/#27.
- New action: `setClassTiming(prevState, formData) → ActionResult`. Inputs: `total_rounds`, `round_duration_hours`, `game_starts_at`. Validate `total_rounds > 0`, `game_starts_at` in the future when set fresh. Warn (don't reject) when editing after game has started — locked rounds don't unlock.
- **Round-duration units decision** Mike deferred: store as minutes internally with a friendly preset picker (15 min / 1 hour / 1 day / 1 week), OR keep `round_duration_hours` numeric and allow fractions, OR two columns with exclusivity CHECK. Mike's mild preference seemed to be "single canonical unit, no fractions." Settle this when building the picker UI.

### Priority 2: Class-name + small dashboard touch-ups

- Class name (`classes.name`) is currently set by SQL. Teacher should set it in the same teacher UI work.
- Mike said "current class" badge on the history-strip tile is mostly decorative now (you only have one current class at a time). Consider removing it OR replacing with a "You're on Student Round N" status line at the top of the dashboard (right under the welcome). Quick add once teacher UI exists.

### Priority 3: Extract round-timing helpers

`computeCurrentRound` / `isRoundLocked` / `isGameOver` are duplicated in `actions.ts` and `student-archive.ts`. Extract to `src/lib/round-timing.ts` (server-only, pure functions) and import from both. ~10 minutes. Do this BEFORE any further changes to the lock math so you change it in one place.

### Open issues (carry from #25 / #26 / #27)

- **`entries` ↔ `submissions` seam unresolved.** Becomes blocking when:
  - Surfacing **classmate comments under the student's own photo** on the dashboard slot (Mike flagged this as a want in #27, deferred until the seam is resolved).
  - The reveal step lands.
- **`students` ↔ `profiles` seam.** Two UUIDs per student; entries-track uses `profiles.id`, sessions-track uses `students.id`. Documented at the top of `student-archive.ts` — preserve that comment.
- **Banner persistence papercut.** Success banners stay until next navigation. Consider auto-dismiss after ~4s or on next form interaction.

### Smaller follow-ups

- Drop `ownEntry` (singular) from `student-archive.ts` — nothing reads it after #27.
- Drop `classes.game_ends_at` (added in #26, confirmed unused).
- "Reset this test student" teacher button (or Gmail plus-addressing workaround — Mike's been using `mike+N@…` style aliases).
- Verify game-over state renders cleanly.
- Verify empty-live state renders cleanly.
- The history strip (`ProfileArchive`) still does single-class-at-a-time accordion; could use the same `<details>/<summary>` no-JS pattern used in the Completed band for consistency.
- Live slot — image-on-left + text-on-right with the 100px size: visually verify it doesn't crowd on mobile. Adjust if needed.
- The "current round" green pill — visually heavy. If it competes with the rest of the slot, consider folding into the SlotHeader as an inline badge instead of a full pill above.

---

## Working notes for next-session Claude

- **READ THIS HANDOFF before doing anything.** Then go through the "Not yet verified" list above as a smoke test before writing new code.
- The round-timing helpers (`computeCurrentRound`, `isRoundLocked`, `isGameOver`) live in **TWO files** (`actions.ts` and `student-archive.ts`). If you touch the lock math, change BOTH or extract to `src/lib/round-timing.ts` first.
- `ownEntry` (singular) is dead code after #27. Safe to remove.
- The slot UI uses `<details>/<summary>` for completed-band dropdowns AND for empty unlocked slots in the top band — no client JS state, server-renders cleanly. Don't replace with custom expand/collapse unless there's a strong reason.
- `AddEntryForm` requires a `roundNumber` prop. The old prop-less usage won't compile.
- Mike configures class timing via raw SQL because no teacher UI exists. **Every test scenario requires SQL editor work** until the teacher UI (#28 priority) lands.
- Mike flagged but deferred: classmate comments under the student's own slot photo. Needs the `entries` ↔ `submissions` seam resolved first. Don't pretend the data is there.
- Mike's mental model is "two-band, current at top, completed at bottom" — DO NOT reintroduce a middle "current" band. He explicitly chose against it after seeing both.
- Naming: "Student Round N" + "Teacher's Warm-up Round". No "Round 1, 2, 3" in UI copy — that label collides with "Student Round 1."
- When a layout question feels ambiguous, build the simplest version first and let Mike see it. He iterates fast on visible UI and slowly on speculative design.

---

*#27 session — long but productive. Migration shipped, dashboard rewritten, slot stack landed, layout refined three times based on Mike's feedback. End state is verified-working for the primary configured-mid-game scenario. The teacher UI to set timing is the #28 blocker.*
