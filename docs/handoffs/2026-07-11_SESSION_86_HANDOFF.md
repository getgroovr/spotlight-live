# Session 86 Handoff

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
15. **Always state full destination paths for delivered files.** E.g. "goes to `src/app/teacher/students/page.tsx`" — never just the filename.
16. **Folder structure screenshots not needed in handoffs** — too cumbersome. Claude can request files by path.

---

## What was decided in session 86

### 1. Standard/Multi is a deployment setting, NOT a teacher-facing toggle

The `app_mode` column on `admin_settings` is set once by whoever deploys the app. Teachers never see it, never choose it, never know the other mode exists.

- **Organizational deployment** (`app_mode = 'standard'`): A school or workshop. Teachers have assigned students. Solo game only. No rotation queue, no warmup matchmaking, no admin approval flows. The admin is a coordinator, not a gatekeeper.
- **Marketplace deployment** (`app_mode = 'multi'`): An online platform. Teachers don't have students yet. The multi-teacher warmup round is a matchmaking engine — students pick their favorite teacher's photos, then join that teacher's class. The admin (Mike or platform operator) manages the teacher pool and quality control.

**Key architectural consequence:** Chunk M3 (the teacher-facing "activate multi mode" button) is killed. Mode is admin-only. The M2 routing work should put the mode setting in the admin dashboard, not the teacher UI.

### 2. Flexible grid + monster filler cards (Chunk F)

The hard-9 grid requirement is removed. Both warmup and student game rounds support 3–9 entries. Empty grid slots are filled with monster character cards.

- **Minimum:** 3 real entries (3 teacher photos for warmup, 3 students for game rounds)
- **Grid stays 3×3** visually. Monster cards fill empty slots.
- **6 distinct monster designs** that rotate/shuffle into random positions each round so the grid looks different every time.
- **Monster cards are non-interactive** — can't be favorited or commented on. They're visual padding only.
- **No schema changes needed.** The grid renderer fills missing slots client-side.
- **Applies to both warmup and student game rounds.**

This also makes class sizes more flexible. A teacher with 27 students can split them 9/9/9. A teacher with 25 can do 9/8/8. A teacher with 7 just runs a class of 7 with 2 monster fillers. The capacity options (9/16/25) stay as defaults but the grid adapts to whatever shows up.

### 3. Teacherhood Ladder (Chunk T)

A two-step path from student to teacher, only in marketplace mode:

**Step 1:** Student wins their class game (the regular solo game). They receive a message explaining the teacher rotation and an invitation to join the next warmup round as a contributor.

**Step 2:** The winning student joins a 3-person warmup round as a contributor — alongside two other game winners from other classes. Regular students play this warmup round and vote (favorite) as usual. The contributor whose photos get the most favorites wins.

**Step 3:** The warmup winner earns the right to create their own solo class and become a teacher.

Key details:
- This repurposes the existing multi-teacher warmup infrastructure as a competition. The three candidates fill the same slots as three teachers in a trio warmup.
- Students playing the warmup don't know the difference — they're just picking favorites.
- The invitation uses the existing in-app messaging system (no email integration needed yet).
- Teacherhood is NOT the only way to become a teacher — the admin can still promote anyone via the admin dashboard. This is one path, not the only path.
- Only applies in marketplace mode. Organizational deployments don't use this.

### 4. Open Enrollment (Chunk OE)

Random students discover the game online without a teacher inviting them. This is a priority — possibly the primary way Mike uses the app.

- A public join page where students can sign up without a teacher link.
- Class assignment logic: place students into classes that have room.
- The matchmaking warmup (multi mode) is the front door — students play the warmup, pick their favorite teacher, get assigned to that teacher's class.
- In organizational mode, open enrollment could be simpler: a join code or link per class.

**This needs more design work.** Deferred to a future session for detailed spec. The flexible grid (Chunk F) is a prerequisite — it handles the case where classes start with fewer than 9 students.

### 5. Topic management in standard mode

In standard mode, the "Suggest a topic to the admin" flow becomes "Add a topic" — same action (inserts as approved), different label. Teachers can also delete topics directly. In multi mode, the suggest→approve flow is unchanged.

---

## What was delivered in session 86

### Chunk M1 — Standard mode teacher dashboard ✅ DONE

Four files delivered, all full replacements:

- **`actions.ts`** → `src/app/teacher/students/actions.ts`
  - New: `createClassDirect` — inserts into `classes` + creates a `games` row. No request/approval flow.
  - New: `deleteGameTopic` — deletes a topic by id.
  - `suggestTopic` unchanged (already inserts as approved). Label change is UI-only.
  - All existing actions preserved: `saveClassSettings`, `approveEntry`, `rejectEntry`, `approveFavoriteComment`, `rejectFavoriteComment`, `archiveClass`, `unarchiveClass`.

- **`request-class.tsx`** → `src/app/teacher/students/request-class.tsx`
  - New `isStandardMode` prop.
  - Standard mode: "Create class" button → calls `createClassDirect`. No mode preference checkboxes (trio/nine hidden). Success state says "Class created!" not "Request pending."
  - Multi mode: unchanged behavior (request → admin approval, mode prefs visible).

- **`class-header.tsx`** → `src/app/teacher/students/class-header.tsx`
  - New `isStandardMode` prop. New `topicOptionsWithId` prop (topics with IDs for deletion).
  - Standard mode: `effectiveReadOnly` forced to false. "Add a topic →" replaces "Suggest to admin." Delete button (✕) on each topic pill. Topic add success message says "Topic added!" not "Sent to admin."
  - Multi mode: unchanged.
  - New exported type: `TopicOption = { id: string; text: string }`.

- **`page.tsx`** → `src/app/teacher/students/page.tsx`
  - Queries `admin_settings.app_mode` (new column).
  - Derives `isStandardMode` boolean. In standard mode, forces `isMultiTeacher = false`.
  - Queries `game_topics` with `id` field (was text-only before) for `topicOptionsWithId`.
  - Passes `isStandardMode` to `RequestClassSection` and `ClassHeader`.
  - Passes `topicOptionsWithId` to `ClassHeader`.
  - All other behavior unchanged.

**⚠️ NOT YET TESTED.** Mike should deploy M1 files and test before committing. See `commit-and-deploy-m1.ps1` for the full workflow.

**Migration required:**
```sql
ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';
```

---

## What was delivered in sessions 81–85 (carried forward)

### Chunk D2 — Student-side round-phase enforcement ✅ DONE (session 84)

**Server-side enforcement (code complete, ready to deploy):**

- **`round-timing.ts`** → `src/lib/round-timing.ts` — Extended `ClassTiming` type with optional `game_phase_hours` and `review_phase_hours`. New exports: `getEffectiveRoundDuration`, `getRoundStart`, `getGamePhaseDeadline`, `getReviewPhaseDeadline`, `isSubmissionsClosed`, `isInReviewPhase`, `getRoundPhase`. All backward compatible.
- **`actions.ts`** → `src/app/play/actions.ts` — `addEntry`, `saveStudentRound`, `findFirstAvailableRound` updated with phase-aware checks. `removeEntry` timing reads updated.
- **`page_results.tsx`** → `src/app/student/results/page.tsx` — Awards gate: blocks ceremony until all favorite comments approved.

**⚠️ NOTE:** `round-timing.ts` was inferred from usage, not from the original file. Mike should diff against the existing file.

### Chunk 1 — Teacher students page ✅ DONE (session 81)
### Chunk 1.5 — Teacher class request flow ✅ DONE (session 81)
### Chunk 2 — Admin dashboard overhaul ✅ DONE (session 82)
### Chunk 3 — Multi-teacher SQL ✅ DONE (session 81)
### Documentation ✅ DONE (session 82, updated session 85)
### Chunk C — Class size request ✅ DONE (session 83)
### Chunk E — Admin dashboard polish ✅ DONE (session 83)

---

## Next build: remaining features

### Updated build order

**Phase 1 — Standard mode (in progress)**

1. **Chunk M1** ✅ DONE (session 86) — Standard mode teacher dashboard.
2. **Chunk M2 — Mode routing + admin setting** — Add mode check to routing. If standard, `/admin` redirects to teacher dashboard. Mode setting lives in admin dashboard only (not teacher UI). Hide request-based flows in standard mode. **Chunk M3 is killed** — no teacher-facing mode toggle.

**Files needed for M2:**
- `src/middleware.ts`
- `src/app/admin/page.tsx`
- `src/app/admin/admin-client.tsx`
- `src/app/admin/actions.ts`

Estimated effort: Medium — 1-2 chunks.

**Phase 2 — Flexible grid (high impact, enables future features)**

3. **Chunk F — Flexible grid + monster filler cards.** Minimum 3 entries for both warmup and student rounds. 3×3 grid with monster cards filling empty slots. 6 distinct monster designs, shuffled per round.

**Files needed for Chunk F:**
- Whatever renders the play grid (likely `src/app/play/` or `src/app/game/` — Mike to confirm path)
- Whatever renders the warmup grid
- Monster card SVGs or images (Claude can generate these as SVG)

Estimated effort: Medium — 1-2 chunks.

**Phase 3 — Remaining game features**

4. **Chunk D2-UI** — Student-side display (deadlines, phase states, blocking). Server enforcement is done.
5. **Chunk A** (teacher celebration) — small, high fun-per-effort.
6. **Chunk B** (flexible warmup) — may overlap with Chunk F work.

**Phase 4 — Marketplace features (multi mode)**

7. **Chunk OE — Open enrollment.** Public join page, class assignment, warmup as matchmaking. Needs design spec session.
8. **Chunk T — Teacherhood ladder.** Game winner → warmup contributor → warmup winner → teacher. Two-step path. Needs `teacherhood_candidates` table and awards ceremony integration.

### Recommended next session (session 87)

Two options:

**Option A (finish the mode infrastructure):** Chunk M2. Upload middleware.ts and the admin files. Gets routing clean so standard mode is fully sealed off.

**Option B (fun and visual impact):** Chunk F. Upload the play grid files. Gets monster cards in the game, makes flexible class sizes work immediately.

Mike's call.

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

1. **Teacher approval flow in admin UI** — Currently teacher role is set via SQL only. Could add admin UI to approve/deny teacher role requests. (Surfaced session 81) — *Multi mode only.*
2. Auto-class-creation when class hits capacity.
3. Deployment/hosting setup guide.
4. "Party setup" holding page.
5. Incomplete mode selection warnings.
6. **Teacher game (full competition, not just celebration).** Deferred until student game is solid and Chunk A proves the concept.
7. **Teacherhood ladder** — Student → warmup contributor → warmup winner → teacher. Two-step promotion path. Multi mode only. (Surfaced session 86, spec above.)
8. **Open enrollment** — Public join page, warmup as matchmaking front door. Needs design spec. (Surfaced session 86.)
9. **Monster card assortment** — 6 distinct monster characters for grid filler. Could become collectible/unlockable in future. (Surfaced session 86.)

---

## Architecture summary (updated session 86)

### Standard vs Multi — deployment setting, not user choice

| Aspect | Standard (organizational) | Multi (marketplace) |
|--------|--------------------------|---------------------|
| Set by | Admin, once, at deployment | Admin, once, at deployment |
| Teachers see | Solo game tools only | Rotation queue + warmup matchmaking |
| Class creation | Teacher creates directly | Teacher requests → admin approves |
| Topic management | Teacher adds/deletes directly | Teacher suggests → admin approves |
| Game schedule | Teacher sets on own class | Admin sets defaults, teacher overrides |
| Warmup mode | Always solo (1 teacher, 9 photos) | Admin chooses 1/3/9 |
| Rotation queue | Hidden | Active |
| `/admin` route | Redirects to teacher dashboard | Full admin dashboard |
| Student experience | Identical | Identical |
| Open enrollment | Join code/link per class | Warmup matchmaking |
| Teacherhood ladder | Not available | Available |

### Why this isn't two products

Multi mode contains solo mode. After warmup matchmaking pairs teachers with students, every teacher runs the exact same solo game. Forking the codebase means maintaining two copies of the game engine, student flow, approval queue, awards ceremony. The `app_mode` column on `admin_settings` handles the separation cleanly — one codebase, two configurations.

---

## Schema changes this session (session 86)

```sql
-- Applied (required for M1):
ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';
```

### Prior session schema changes still in effect

```sql
-- D1 migration (applied session 84):
ALTER TABLE admin_settings ADD COLUMN game_phase_hours numeric;
ALTER TABLE admin_settings ADD COLUMN review_phase_hours numeric;
ALTER TABLE classes ADD COLUMN game_phase_hours numeric;
ALTER TABLE classes ADD COLUMN review_phase_hours numeric;
ALTER TABLE games ADD COLUMN current_round_phase varchar(10) DEFAULT 'game';
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
| `teacher_rotation` | teacher_id (unique), sort_order, status, willing_trio, willing_nine | Multi mode only. status: recruiting/waiting/paused. |
| `admin_settings` | id=1, warmup_teacher_count, game_phase_hours, review_phase_hours, app_mode | app_mode: 'standard' or 'multi'. |
| `classes` | id, teacher_id, name, capacity, round_topics, is_archived, archived_at, game_phase_hours, review_phase_hours | capacity default 9. |
| `class_requests` | id, teacher_id, status, class_name, requested_capacity, requested_at, reviewed_by, reviewed_at, created_class_id | Multi mode only. |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | selected_* may simplify under Chunk B. |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count, current_round_phase | status: pending/active/complete. current_round_phase: game/review. |
| `game_topics` | id, topic_text, status, suggested_by, created_at | Standard mode: status always 'approved' (teacher adds directly). Multi mode: pending→approved flow. |
| `messages` | id, sender_id, recipient_id, body, is_read, created_at | Used in both modes. |

---

## Multi-teacher testing setup (Multi mode only)

Test emails: `getgroovr@yahoo.com` (admin + teacher), `getgroovr-1@yahoo.com` (teacher), `getgroovr-2@yahoo.com` (teacher).

**Setup flow (no real email needed):**
1. Sign up each email at `localhost:3000/auth/signup` with any password
2. Run `multi-teacher-setup.sql` in Supabase SQL Editor (confirms emails + sets roles)
3. Log in at `localhost:3000/auth/login`

Use separate browsers or incognito for simultaneous sessions.

---

## Standard mode testing setup (simpler)

1. Sign up one teacher account at `localhost:3000/auth/signup`
2. Confirm email + set role via SQL: `UPDATE profiles SET role = 'teacher', is_admin = true WHERE email = 'your@email.com';`
3. Verify `admin_settings.app_mode = 'standard'` (default after migration)
4. Log in — teacher dashboard has everything needed (class creation, topics, schedule)
5. No multi-teacher SQL, no rotation queue, no admin dashboard needed

---

## Test workflow with v8 (step by step)

1. Run `all-in-one-setup-v8.sql` (creates everything fresh)
2. Run `game-topics-migration.sql` (session 78)
3. Run class archiving migration: `ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false; ALTER TABLE classes ADD COLUMN archived_at timestamptz;` (session 79)
4. Run Chunk 1.5 migration (session 81): `ALTER TABLE class_requests ADD COLUMN class_name varchar(100); ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false; ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;`
5. Run Chunk C migration (session 83): `ALTER TABLE class_requests ADD COLUMN requested_capacity integer DEFAULT 9;`
6. Run RLS fix (session 83): `CREATE POLICY "Admins can insert game_topics" ON game_topics FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));`
7. Run D1 migration (session 84): see prior session schema changes above
8. Run app_mode migration (session 86): `ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';`
9. Run `populate-seed-voter-sessions.sql`
10. Run JUMP TO ROUND 1 (**with the approve line added**)
11. Play as Casper2 through round 1 — submit photo + favorite comment
12. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
13. Teacher approves round 1 favorite comment
14. Run JUMP TO ROUND 2 (**with the approve line added**)
15. Play as Casper2 through round 2
16. Repeat for round 3 / awards
