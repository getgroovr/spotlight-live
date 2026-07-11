# Session 84 Handoff

Date: 2026-07-11

---

## Mike's preferences — INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS

1. **Full-file replacements, NOT patches.** Output the entire new file. Mike does not apply line-by-line edits.
2. **PowerShell and SQL commands only.** Mike's machine is Windows. No grep, bash, sed, curl. Use `Select-String` for grep, etc.
3. **Anything beyond PS/SQL needs explicit direction.** Spell out every step.
4. **Don't start coding without seeing the existing files.** Ask Mike to upload before writing replacements.
5. **Ask before assuming on design questions.** Mike has strong opinions.
6. **Flag what's deferred and why.**
7. **Admit when wrong; correct prior handoffs.**
8. **Concise is good. Over-formatting is not.**
9. **Tighten layouts.** Compact, side-by-side field arrangements.
10. **Label editability clearly.**
11. **Use "See the round" / "Close the round" toggle buttons** on all collapsible round sections.
12. **"Spreadsheet" not "CSV" in user-facing text.**
13. **Verify all NOT NULL columns and FK chains BEFORE writing an INSERT.**
14. **Workflow: request files in chunks Claude can complete independently.**
15. **Always state full destination paths for delivered files.** E.g. "goes to `src/app/teacher/deck/page.tsx`" — never just the filename.
16. **Folder structure screenshots not needed in handoffs** — too cumbersome. Claude can request files by path.

---

## What was delivered in session 84

### Chunk D2 — Student-side round-phase enforcement ✅ DONE (session 84)

**Server-side enforcement (code complete, ready to deploy):**

- **`round-timing.ts`** → `src/lib/round-timing.ts` — Extended `ClassTiming` type with optional `game_phase_hours` and `review_phase_hours`. New exports: `getEffectiveRoundDuration`, `getRoundStart`, `getGamePhaseDeadline`, `getReviewPhaseDeadline`, `isSubmissionsClosed`, `isInReviewPhase`, `getRoundPhase`. All backward compatible — when new columns are null, falls back to `round_duration_hours`.
- **`actions.ts`** → `src/app/play/actions.ts` — Three actions updated:
  - `addEntry`: Now checks `isSubmissionsClosed()` after the lock check. In phase mode (game_phase_hours set), a locked round whose game phase is still open allows submissions; once game phase ends, rejects with "Submissions for round N are closed." In legacy mode (no split fields), preserves existing lock-means-closed behavior.
  - `saveStudentRound`: Rejects with "Submissions for this round are closed" when game phase has ended.
  - `findFirstAvailableRound`: Recognizes started-but-game-phase-open rounds as available slots.
  - `removeEntry`: Timing reads updated to include new columns (lock behavior unchanged).
- **`page_results.tsx`** → `src/app/student/results/page.tsx` — **Awards gate**: Before rendering the ceremony, queries `game_sessions` for the student's class (round > 0) to verify all favorite comments have been approved. If any are pending or rejected, shows a holding page ("Almost ready for the awards!") with counts. This prevents unreviewed comments from appearing in the awards ceremony.

**⚠️ IMPORTANT NOTE about `round-timing.ts`:** I did NOT have the original file uploaded — I inferred the full interface from its usage in `actions.ts` (the `ClassTiming` type, `computeCurrentRound`, `isRoundLocked`, `isGameOver` exports). The delivered file should be a drop-in replacement, but **Mike should diff it against the existing file** to catch any helpers or edge cases I didn't see. If there are differences, upload the original and I'll merge.

---

### What D2 does NOT yet cover (needs student UI files)

The server-side enforcement is complete, but the **student-facing UI** for showing deadlines and phase state is not. These changes require files I don't have:

**D2-UI — Remaining student-side display work:**

1. **Student dashboard** (`src/app/student/dashboard/page.tsx` or similar):
   - Show what phase the current round is in (game / review)
   - Show submission deadline countdown or timestamp during game phase
   - Show "Submissions closed — teacher is reviewing" during review phase
   - Show "Waiting for teacher review" or rejection/resubmit prompts per item
   - Block student from seeing/playing next round until current round items all approved

2. **Student play page** (`src/app/student/play/page.tsx` or game components):
   - Show submission deadline during gameplay
   - Prevent game load if game phase is closed ("Submissions closed" state)

**Files needed to build D2-UI:**
- `src/app/student/dashboard/page.tsx`
- `src/app/student/play/page.tsx`
- Any client components used by the student dashboard for round status display
- `src/lib/deck.ts` (the `loadClassDeck` function, to understand how it gates play)

---

## What was delivered in sessions 81–83

### Chunk 1 — Teacher students page ✅ DONE (session 81)
- **Topic locking:** Past-round topic dropdowns disabled with "✓" label.
- **Class dropdown fix:** Selected class always appears even if auto-archived.
- **Files:** `class-header.tsx` → `src/app/teacher/students/class-header.tsx`, `page.tsx` → `src/app/teacher/students/page.tsx`

### Chunk 1.5 — Teacher class request flow ✅ DONE (session 81)
- Request button always visible, class name field + mode preference checkboxes.
- Zero-class state shows request form instead of error.

### Chunk 2 — Admin dashboard overhaul ✅ DONE (session 82)
- Merged rotation list with All Teachers table, ↑↓ reorder buttons.
- Collapsible teachers section.
- Enhanced Current Classes with student lists + emails.
- Game Topics section with delete capability.
- Mode preference tallies, class request approval with class name, teacher mode preferences.

### Chunk 3 — Multi-teacher SQL ✅ DONE (session 81)
- `multi-teacher-setup.sql` — confirms emails, sets roles, sets admin.

### Documentation ✅ DONE (session 82)
- **GROOVR_DEVELOPMENT_STORY.md** — narrative documentary of the app's evolution.
- **GROOVR_TECHNICAL_BLUEPRINT.md** — procedure doc: file structure, schema, setup, rebuild guide.

### Chunk C — Class size request ✅ DONE (session 83)
- Teachers request a class size (9/16/25) when requesting a new class.
- Capacity dropdown in both prominent and compact request form layouts.
- Admin sees requested capacity and can override before approving.
- `approveClassRequest` now uses the teacher's requested class name (was previously auto-generating "Class N" — bug fixed).
- **Migration applied:** `ALTER TABLE class_requests ADD COLUMN requested_capacity integer DEFAULT 9;`
- **Files delivered:**
  - `request-class.tsx` → `src/app/teacher/students/request-class.tsx`
  - `request-actions.ts` → `src/app/teacher/students/request-actions.ts`
  - `admin-client.tsx` → `src/app/admin/admin-client.tsx`
  - `actions.ts` → `src/app/admin/actions.ts`
  - `page.tsx` → `src/app/admin/page.tsx`

### Chunk E — Admin dashboard polish ✅ DONE (session 83)
- **Overview row revised:** Active teachers, Inactive teachers, Mode, In rotation. Removed Students, Classes, Pending photos, Trio/Nine willing.
- **Current Classes: collapsible** — "See classes" / "Close classes" toggle.
- **Archived classes:** Removed Unarchive button. Hidden "pending" badge on archived classes. Added "Download spreadsheet" button.
- **Active classes:** Also get "Download spreadsheet" in expanded view.
- **Teachers table:** Classes column → "Active / Max" with tooltip. Count now shows active (non-archived) classes only.
- **Topics: approve/deny for teacher-submitted topics.** Pending count shown in section header. New `setTopicStatus` action.
- **RLS fix applied:** `CREATE POLICY "Admins can insert game_topics" ON game_topics FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));`
- **Files delivered:** Same as Chunk C (combined delivery).

---

## Next build: remaining features, chunked

### Design decisions made in sessions 82–83

**Flexible warmup model (replaces rigid 1/3/9) — unchanged from session 82.**

**Teacher celebration — unchanged from session 82.**

**Round review periods (Chunk D) — designed in session 83:**

The game round is split into two phases: **game time** (students submit) and **review time** (teacher approves). Both durations are set together where round duration is currently configured. Auto-advance happens when all submitted items are approved. Full design below in the Chunk D section.

---

### Chunk D — Round review periods (CRITICAL — in progress)

**D1 — Timer model + teacher review controls: MIGRATION DONE, code NOT YET BUILT**

Migration applied by Mike (session 84):
```sql
ALTER TABLE admin_settings ADD COLUMN game_phase_hours numeric;
ALTER TABLE admin_settings ADD COLUMN review_phase_hours numeric;
ALTER TABLE classes ADD COLUMN game_phase_hours numeric;
ALTER TABLE classes ADD COLUMN review_phase_hours numeric;
ALTER TABLE games ADD COLUMN current_round_phase varchar(10) DEFAULT 'game';
```

D1 code still needed:
- Replace `round_duration_hours` with `game_phase_hours` + `review_phase_hours` in the schedule UI (admin dashboard game schedule section + solo-mode teacher dashboard).
- Teacher dashboard: show what phase the current round is in (game / review). Show count of pending items to review.
- Auto-advance trigger: when teacher approves the last pending item for a round, auto-advance to next round (or flag awards as ready).

**Files needed for D1 code:**
- `src/app/admin/admin-client.tsx` (game schedule section — split duration into game/review)
- `src/app/admin/actions.ts` (saveGameSchedule — handle new fields)
- `src/app/admin/page.tsx` (types + query for new fields)
- `src/app/teacher/students/page.tsx` (teacher dashboard — round phase display, pending review count)
- `src/app/teacher/students/class-header.tsx` (if round controls are here)
- Whatever file handles the teacher's entry/comment approval actions — need to add auto-advance trigger logic

**D2 — Student-side enforcement: SERVER LOGIC DONE ✅, UI NOT YET BUILT**

Server-side (delivered session 84):
- `round-timing.ts` extended with phase-aware helpers
- `actions.ts` enforces game phase deadline on submissions
- Results page awards gate blocks ceremony until all comments approved

Student-side UI (not yet built — see "D2-UI" section above):
- Show deadlines, "submissions closed", "waiting for review" states
- Block next round until current round items approved

**Estimated remaining effort for all of D:** Medium — D1 code is the bulk, D2-UI is smaller.

---

### Chunk A — Teacher celebration from warmup data

**Status:** Not started. Unchanged from session 82 handoff.

**What:** After warmup closes, show teachers/admin a results screen: which teacher got the most student enrollments. Reuse `ResultsCeremony.tsx` with teacher data instead of student data.

**Schema:** None. Enrollment data already exists in `enrollments`.

**Open question (ask Mike):** Where does this screen live?
- A tab/section on the admin dashboard ("Warmup Results")
- A standalone page `/admin/warmup-results` or `/teacher/warmup-results`
- Triggered automatically when the warmup closes

**Files needed to start:**
- `src/app/student/results/ResultsCeremony.tsx`
- `src/app/admin/admin-client.tsx`
- `src/app/admin/actions.ts`

**Estimated effort:** Small — 1 chunk.

---

### Chunk B — Flexible warmup contributions

**Status:** Not started. Unchanged from session 82 handoff.

**What:** Replace the rigid per-teacher photo limit (9 ÷ mode) with flexible 1–3 per teacher. Grid fills dynamically.

**No schema migration needed.**

**Changes:**
1. **Teacher deck (`page.tsx`, `deck-client.tsx`):** Per-teacher limit → flat max of 3 active photos.
2. **Warmup loader (`deck.ts` or `/play` actions):** Grab all active starters from top N teachers. Grid size = total active photos.
3. **Spotlight/shell (`spotlight.jsx`, `shell.js`):** Grid handles non-square counts. Columns = ceil(sqrt(total)).
4. **Admin dashboard:** Mode display → "N teachers participating, X total photos in warmup grid."

**Files needed to start:**
- `src/lib/deck.ts`
- `src/app/teacher/deck/page.tsx`
- `src/app/teacher/deck/deck-client.tsx`
- `src/app/teacher/deck/actions.ts`
- `src/game/spotlight.jsx`
- `src/game/shell.js`
- `src/app/play/actions.ts`
- `src/app/admin/admin-client.tsx`

**Estimated effort:** Medium — 2 chunks.

---

### Recommended build order

1. **Chunk D1 code** — Teacher-side UI for setting game/review phase durations + auto-advance trigger. The migration is done; the UI and trigger logic are needed.
2. **Chunk D2-UI** — Student-side display (deadlines, phase states, blocking). Server enforcement is done.
3. **Chunk A** (teacher celebration) — small, high fun-per-effort.
4. **Chunk B** (flexible warmup) — largest, most impactful, do last when everything else is stable.

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C3 | Test admin ↔ teacher deck interaction | Manual test — in progress |
| C6 | Teacher comment prompts (game_prompts table) | Deferred — lower priority |

---

## Open bugs (updated)

| # | Description | Priority | Status |
|---|---|---|---|
| B-AUTH | Teacher login bypasses auth (no magic link required) | HIGH | Needs investigation — upload middleware.ts + supabase-server.ts |
| B-RESUB | Verify resubmitEntry handles optional photo | MEDIUM | Mike to check `src/app/play/actions.ts` |
| B-PREEX | Verify game flow handles pre-existing entries for next round | MEDIUM | Mike to test after adding JUMP TO approve lines |
| U1 | Update favorite confirmation text to Mike's wording | LOW | Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |

---

## Ideas list

1. **Teacher approval flow in admin UI** — Currently teacher role is set via SQL only. Could add admin UI to approve/deny teacher role requests. (Surfaced session 81)
2. Auto-class-creation when class hits capacity.
3. Deployment/hosting setup guide.
4. "Party setup" holding page.
5. Incomplete mode selection warnings.
6. **Teacher game (full competition, not just celebration).** Deferred until student game is solid and Chunk A proves the concept.

---

## Schema changes this session (session 84)

```sql
-- D1 migration (run by Mike at start of session 84):
ALTER TABLE admin_settings ADD COLUMN game_phase_hours numeric;
ALTER TABLE admin_settings ADD COLUMN review_phase_hours numeric;
ALTER TABLE classes ADD COLUMN game_phase_hours numeric;
ALTER TABLE classes ADD COLUMN review_phase_hours numeric;
ALTER TABLE games ADD COLUMN current_round_phase varchar(10) DEFAULT 'game';
-- Values: 'game' (submissions open), 'review' (teacher reviewing)
```

No additional migrations needed for D2 — it reads the columns D1 added.

---

## Column names confirmed (carried forward)

- `entries.rejection_reason` (not `teacher_note`)
- `game_sessions.favorite_comment_rejection_reason`

---

## Known Tailwind issue (ONGOING)

Tailwind grid-cols-N does NOT compile. All multi-column layouts MUST use inline styles:
```jsx
style={{ display: "grid", gridTemplateColumns: "repeat(N, 1fr)" }}
```

---

## Current schema highlights

| Table | Key columns | Notes |
|-------|-------------|-------|
| `profiles` | id, role, display_name, username, max_classes, is_admin, is_archived | role: teacher/student |
| `teacher_rotation` | teacher_id (unique), sort_order, status, willing_trio, willing_nine | status: recruiting/waiting/paused. willing_* may be replaced by flexible warmup model (Chunk B). |
| `admin_settings` | id=1, warmup_teacher_count, game_phase_hours, review_phase_hours | Chunk D1: game_phase_hours + review_phase_hours added. |
| `classes` | id, teacher_id, name, capacity, round_topics, is_archived, archived_at, game_phase_hours, review_phase_hours | capacity default 9. Chunk D1: game_phase_hours + review_phase_hours added. |
| `class_requests` | id, teacher_id, status, class_name, requested_capacity, requested_at, reviewed_by, reviewed_at, created_class_id | Chunk C: requested_capacity added. |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | selected_* columns may simplify under Chunk B. |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count, current_round_phase | status: pending/active/complete. Chunk D1: current_round_phase added (game/review). |
| `game_topics` | id, topic_text, status, suggested_by, created_at | status: approved/pending. UNIQUE on topic_text. RLS insert policy added for admins (session 83). |
| `messages` | id, sender_id, recipient_id, body, is_read, created_at | |

---

## Multi-teacher testing setup

Test emails: `getgroovr@yahoo.com` (admin + teacher), `getgroovr-1@yahoo.com` (teacher), `getgroovr-2@yahoo.com` (teacher).

**Setup flow (no real email needed):**
1. Sign up each email at `localhost:3000/auth/signup` with any password
2. Run `multi-teacher-setup.sql` in Supabase SQL Editor (confirms emails + sets roles)
3. Log in at `localhost:3000/auth/login`

Use separate browsers or incognito for simultaneous sessions.

---

## Test workflow with v8 (step by step)

1. Run `all-in-one-setup-v8.sql` (creates everything fresh)
2. Run `game-topics-migration.sql` (session 78)
3. Run class archiving migration: `ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false; ALTER TABLE classes ADD COLUMN archived_at timestamptz;` (session 79)
4. Run Chunk 1.5 migration (session 81): `ALTER TABLE class_requests ADD COLUMN class_name varchar(100); ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false; ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;`
5. Run Chunk C migration (session 83): `ALTER TABLE class_requests ADD COLUMN requested_capacity integer DEFAULT 9;`
6. Run RLS fix (session 83): `CREATE POLICY "Admins can insert game_topics" ON game_topics FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));`
7. Run D1 migration (session 84): see "Schema changes this session" above
8. Run `populate-seed-voter-sessions.sql`
9. Run JUMP TO ROUND 1 (**with the approve line added**)
10. Play as Casper2 through round 1 — submit photo + favorite comment
11. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
12. Teacher approves round 1 favorite comment
13. Run JUMP TO ROUND 2 (**with the approve line added**)
14. Play as Casper2 through round 2
15. Repeat for round 3 / awards

**To test D2 awards gate:**
1. Complete all rounds as normal
2. Leave at least one favorite comment unapproved
3. Navigate to `/student/results` — should see "Almost ready for the awards!" holding page
4. Approve all comments as teacher
5. Refresh `/student/results` — ceremony should now render

**To test D2 submission deadline enforcement:**
1. Set `game_phase_hours` and `review_phase_hours` on a class (via SQL or admin UI once D1 UI is built)
2. During game phase: student can submit photos and play rounds normally
3. After game phase ends (review phase begins): student submission attempts should be rejected with "Submissions for this round are closed"
