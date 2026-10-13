# Session 83 Handoff

Date: 2026-07-10

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

### Chunk D — Round review periods (CRITICAL — build first)

**Problem:** After each round's game phase, the teacher needs time to review and approve student photos and comments before the next round opens. Without this, rounds can advance before the teacher has reviewed anything. Also, all comments from all rounds must be approved before the awards ceremony can begin.

#### Design decisions (confirmed session 83)

**Round timing model:**
- The existing `round_duration_hours` concept is replaced by two values: **game time** and **review time**.
- Example: 22 hours game time + 2 hours review time = 24-hour round.
- Game time and review time should be the same across all rounds in a game.
- The UI for setting these goes right next to the existing round duration controls (which currently live in the game schedule section of the admin dashboard for multi-teacher, and on the teacher dashboard for solo).

**Game phase (game time):**
- Students can submit photos and comments.
- A deadline is visible to students so they know when submissions close.
- After the game phase deadline passes, students can still VIEW the round but cannot submit new entries.

**Review phase (review time):**
- Teacher reviews and approves/rejects all photos and comments submitted during the game phase.
- Students whose submissions were rejected must resubmit and get re-approved — a student cannot advance to the next round with unresolved rejections.
- Both photos AND comments must be approved before the round is considered complete.

**Auto-advance logic:**
- Once the last pending item (photo or comment) for a round is approved by the teacher, the next round opens automatically. No manual "start next round" button needed.
- The teacher's act of approving the final item IS the trigger.
- Exception: **Awards ceremony.** The awards round does NOT auto-advance. ALL comments from ALL rounds must be approved before the awards ceremony can begin. This is a final gate.

**Student blocking:**
- A student cannot advance to the next round until ALL of their submissions (photos + comments) for the current round are approved.
- If a student's photo or comment is rejected, they must resubmit before the review phase ends.
- Student sees: "Waiting for teacher review" or "Your [photo/comment] was rejected — please resubmit" as appropriate.

**Awards gate:**
- Before awards can show, every comment across every round must be approved (or rejected and resubmitted/approved).
- This prevents inappropriate comments from appearing in the awards ceremony.

#### Schema changes needed

```sql
-- Split round_duration_hours into game time and review time.
-- These apply uniformly across all rounds in a game.

-- Option A: Add columns to admin_settings (for multi-teacher mode)
ALTER TABLE admin_settings ADD COLUMN game_phase_hours numeric;
ALTER TABLE admin_settings ADD COLUMN review_phase_hours numeric;

-- Option B: Add columns to classes (for per-class control in solo mode)
ALTER TABLE classes ADD COLUMN game_phase_hours numeric;
ALTER TABLE classes ADD COLUMN review_phase_hours numeric;

-- Both may be needed: admin_settings for multi-teacher push-to-all,
-- classes for the actual per-class values (same pattern as round_duration_hours today).

-- Track round phase state
-- Currently round transitions happen via SQL scripts (JUMP TO ROUND N).
-- May need a column on games to track current phase:
ALTER TABLE games ADD COLUMN current_round_phase varchar(10) DEFAULT 'game';
-- Values: 'game' (submissions open), 'review' (submissions closed, teacher reviewing)

-- Round deadlines: computed from game start + (round_number * total_round_duration)
-- with the split: game_deadline = round_start + game_phase_hours
--                 review_deadline = game_deadline + review_phase_hours
-- These can be computed on the fly from game_starts_at + round number + phase durations,
-- OR stored explicitly. Computed is simpler if the schedule is uniform.
```

#### Sub-chunks

**D1 — Timer model + teacher review controls:**
- Replace `round_duration_hours` with `game_phase_hours` + `review_phase_hours` in the schedule UI (admin dashboard game schedule section + wherever solo-mode teachers set it).
- Schema migration.
- Compute round deadlines (game deadline, review deadline) from start time + round number.
- Teacher dashboard: show what phase the current round is in (game / review). Show count of pending items to review.
- Auto-advance trigger: when teacher approves the last pending item for a round, auto-advance to next round (or flag awards as ready).

**D2 — Student-side enforcement:**
- Show submission deadline (countdown or timestamp) to students during game phase.
- After game phase deadline: student can view but not submit. Show "Submissions closed" state.
- During review phase: show "Waiting for teacher review" or rejection/resubmit prompts.
- Block student from seeing next round until their current round items are all approved.
- Awards gate: check all comments across all rounds are approved before showing awards.

**Files needed for D1:**
- `src/app/admin/admin-client.tsx` (game schedule section — split duration into game/review)
- `src/app/admin/actions.ts` (saveGameSchedule — handle new fields)
- `src/app/admin/page.tsx` (types + query for new fields)
- `src/app/teacher/students/page.tsx` (teacher dashboard — round phase display, pending review count)
- `src/app/teacher/students/class-header.tsx` (if round controls are here)
- Whatever file handles the teacher's entry/comment approval actions — need to add auto-advance trigger logic

**Files needed for D2:**
- `src/app/play/actions.ts` (student submission — enforce deadline check)
- `src/app/play/page.tsx` or game flow components (show deadline, locked state, "waiting for review")
- `src/app/student/results/` components (awards gate check)
- Game state/round transition logic

**Estimated effort:** Medium-Large — 2 sub-chunks as described above.

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

1. **Chunk D** (round review periods) — CRITICAL. The game flow has a fundamental gap without this. Build first.
2. **Chunk A** (teacher celebration) — small, high fun-per-effort.
3. **Chunk B** (flexible warmup) — largest, most impactful, do last when everything else is stable.

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

## Schema changes this session (session 83 — already applied)

```sql
-- Chunk C: class size request
ALTER TABLE class_requests ADD COLUMN requested_capacity integer DEFAULT 9;

-- Chunk E: RLS fix for game_topics admin insert
CREATE POLICY "Admins can insert game_topics"
  ON game_topics FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
```

**Pending migrations for next build:**
```sql
-- Chunk D1: round phase timing
ALTER TABLE admin_settings ADD COLUMN game_phase_hours numeric;
ALTER TABLE admin_settings ADD COLUMN review_phase_hours numeric;
ALTER TABLE classes ADD COLUMN game_phase_hours numeric;
ALTER TABLE classes ADD COLUMN review_phase_hours numeric;
ALTER TABLE games ADD COLUMN current_round_phase varchar(10) DEFAULT 'game';
-- Values: 'game' (submissions open), 'review' (teacher reviewing)
```

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
| `admin_settings` | id=1, warmup_teacher_count | Currently 1/3/9. Chunk B keeps this as "how many teachers" but removes per-teacher photo computation. Chunk D adds game_phase_hours, review_phase_hours. |
| `classes` | id, teacher_id, name, capacity, round_topics, is_archived, archived_at | capacity default 9. Chunk C adds 16/25 options via class_requests. Chunk D adds game_phase_hours, review_phase_hours. |
| `class_requests` | id, teacher_id, status, class_name, requested_capacity, requested_at, reviewed_by, reviewed_at, created_class_id | Chunk C: requested_capacity added. |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | selected_* columns may simplify under Chunk B. |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete. Chunk D adds current_round_phase. |
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
7. Run `populate-seed-voter-sessions.sql`
8. Run JUMP TO ROUND 1 (**with the approve line added**)
9. Play as Casper2 through round 1 — submit photo + favorite comment
10. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
11. Teacher approves round 1 favorite comment
12. Run JUMP TO ROUND 2 (**with the approve line added**)
13. Play as Casper2 through round 2
14. Repeat for round 3 / awards

**To test Chunk C (class size request):**
1. Log in as a teacher
2. Click "Request new class" — verify class size dropdown (9/16/25) appears
3. Submit a request with size 16
4. Log in as admin → See teachers → verify the request shows "16 seats" dropdown
5. Change to 25 if desired, click Approve
6. Verify the created class has capacity 25

**To test Chunk E (admin dashboard polish):**
1. Log in as admin
2. Verify overview row shows: Active teachers, Inactive teachers, Mode, In rotation
3. Verify Current Classes section is collapsible (See classes / Close classes)
4. Expand a class → verify "Download spreadsheet" button works
5. Verify archived classes have no Unarchive button, no pending badge
6. Open Game Topics → verify teacher-submitted topics show Approve/Deny buttons
7. Add a new starter topic — verify no RLS error
