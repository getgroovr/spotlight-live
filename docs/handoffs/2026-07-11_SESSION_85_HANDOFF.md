# Session 85 Handoff

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

## What was decided in session 85 — Standard / Multi mode architecture

### The decision

The app now has two operational modes: **Standard** and **Multi**.

**Standard mode** is the default. One teacher runs the app solo. The teacher IS the administrator — no separate admin role, no request→approval flows, no rotation queue. The teacher creates classes directly, manages topics directly, sets their own game schedule. The `/admin` route is not used. Warmup is always solo mode (one teacher, their 9 photos, their grid).

**Multi mode** is activated when multiple teachers want to coordinate a shared warmup game. One teacher activates multi mode (becoming the administrator), and the full admin infrastructure appears: rotation queue, warmup mode selection (1/3/9), class request approval, topic approval. Teachers coordinate via the existing messaging system or email.

**What doesn't change:** The student-facing code is identical in both modes. The game engine, play flow, combined screen, awards ceremony — all untouched. The changes are entirely in teacher and admin surfaces.

### Why now

1. The admin layer adds friction for the most common use case (solo teacher).
2. Testing the basic game loop currently requires multi-account setup, rotation config, and admin approval — all unnecessary for a single teacher.
3. Standard mode dramatically shortens the testing path for Chunks D, A, and B.
4. The multi-teacher features are complete and working — partitioning them behind a button preserves everything already built.

### Architecture summary

| Aspect | Standard mode | Multi mode |
|--------|--------------|------------|
| Who is admin | Teacher (automatic) | Teacher who activates multi mode |
| Class creation | Teacher creates directly | Teacher requests → admin approves |
| Topic management | Teacher adds/manages directly | Teacher suggests → admin approves |
| Game schedule | Teacher sets on their own class | Admin sets defaults, teacher can override |
| Warmup mode | Always solo (1 teacher, 9 photos) | Admin chooses 1/3/9 |
| Rotation queue | Not used | Active — ↑↓ ordering, recruiting/waiting/paused |
| `/admin` route | Not accessible (not needed) | Full admin dashboard |
| Student experience | Identical | Identical |

### Proposed schema change

```sql
-- Add mode column to admin_settings (single row, id=1)
ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';
-- Values: 'standard' or 'multi'
```

No other schema changes needed. All multi-teacher tables (`teacher_rotation`, `class_requests`, etc.) remain in place — they're simply not used in standard mode.

---

## What was delivered in sessions 81–84 (carried forward)

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

## Next build: Standard/Multi mode + remaining features

### Build order (revised for Standard/Multi)

**Phase 1 — Standard mode (do first, enables simpler testing for everything after)**

**Chunk M1 — Standard mode teacher dashboard**
Merge the controls a solo teacher needs into the teacher dashboard. In standard mode, the teacher sees:
- Direct class creation (no request flow — just a "Create class" form with name + capacity)
- Direct topic management (add/edit/delete topics, no approval queue)
- Game schedule controls (game_phase_hours, review_phase_hours, round_duration_hours)
- Round phase display + pending review count (from Chunk D1)
- Auto-advance trigger on last approval (from Chunk D1)

This chunk also absorbs the Chunk D1 teacher-side work (phase display, schedule UI, auto-advance).

**Files needed for M1:**
- `src/app/teacher/students/page.tsx`
- `src/app/teacher/students/class-header.tsx`
- `src/app/teacher/students/actions.ts`
- `src/app/teacher/students/request-class.tsx`
- Whatever file handles entry/comment approval (for auto-advance trigger)

**Estimated effort:** Large — 2-3 chunks.

**Chunk M2 — Mode toggle + routing**
- Add `app_mode` column to `admin_settings` (migration above)
- Add mode check to routing: if standard, `/admin` redirects to teacher dashboard
- In standard mode, hide request-based flows (class requests, topic approval queue)
- In multi mode, show the "Multi game" activation button

**Files needed for M2:**
- `src/middleware.ts`
- `src/app/admin/page.tsx`
- `src/app/admin/admin-client.tsx`
- `src/app/admin/actions.ts`
- `src/app/teacher/students/page.tsx` (to conditionally show/hide request vs. direct-create)

**Estimated effort:** Medium — 1-2 chunks.

**Chunk M3 — Multi mode activation**
The "Multi game" button. When a teacher activates multi mode:
- `admin_settings.app_mode` flips to `'multi'`
- That teacher's `is_admin` is set to true
- The full admin dashboard becomes accessible
- Other teachers see the request-based flows (class requests, topic suggestions)
- Deactivating multi mode flips back to standard and clears the rotation queue state

**Files needed for M3:**
- `src/app/teacher/students/page.tsx` (multi mode button)
- `src/app/admin/admin-client.tsx`
- `src/app/admin/actions.ts`
- New action: `activateMultiMode` / `deactivateMultiMode`

**Estimated effort:** Medium — 1 chunk.

**Phase 2 — Remaining features (built on standard mode, tested easily)**

4. **Chunk D1 code** — Now merged into M1 (teacher-side phase controls + auto-advance).
5. **Chunk D2-UI** — Student-side display (deadlines, phase states, blocking). Server enforcement is done.
6. **Chunk A** (teacher celebration) — small, high fun-per-effort.
7. **Chunk B** (flexible warmup) — largest, most impactful, do last.

### Recommended first session (session 86)

Start with **Chunk M1**. Upload these files:
- `src/app/teacher/students/page.tsx`
- `src/app/teacher/students/class-header.tsx`
- `src/app/teacher/students/actions.ts`
- `src/app/teacher/students/request-class.tsx`

Tell the next Claude: "We're building Standard mode. The teacher dashboard needs direct class creation, direct topic management, and game schedule controls. The admin approval flows stay in the codebase but are bypassed in standard mode. See the handoff for the full architecture."

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

1. **Teacher approval flow in admin UI** — Currently teacher role is set via SQL only. Could add admin UI to approve/deny teacher role requests. (Surfaced session 81) — *Note: in multi mode only.*
2. Auto-class-creation when class hits capacity.
3. Deployment/hosting setup guide.
4. "Party setup" holding page.
5. Incomplete mode selection warnings.
6. **Teacher game (full competition, not just celebration).** Deferred until student game is solid and Chunk A proves the concept.

---

## Schema changes this session (session 85)

```sql
-- Proposed (not yet applied):
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
| `admin_settings` | id=1, warmup_teacher_count, game_phase_hours, review_phase_hours, app_mode | app_mode: 'standard' or 'multi' (proposed). |
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
3. Log in — teacher dashboard has everything needed (class creation, topics, schedule)
4. No multi-teacher SQL, no rotation queue, no admin dashboard needed

---

## Test workflow with v8 (step by step)

1. Run `all-in-one-setup-v8.sql` (creates everything fresh)
2. Run `game-topics-migration.sql` (session 78)
3. Run class archiving migration: `ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false; ALTER TABLE classes ADD COLUMN archived_at timestamptz;` (session 79)
4. Run Chunk 1.5 migration (session 81): `ALTER TABLE class_requests ADD COLUMN class_name varchar(100); ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false; ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;`
5. Run Chunk C migration (session 83): `ALTER TABLE class_requests ADD COLUMN requested_capacity integer DEFAULT 9;`
6. Run RLS fix (session 83): `CREATE POLICY "Admins can insert game_topics" ON game_topics FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));`
7. Run D1 migration (session 84): see prior session schema changes above
8. Run app_mode migration (session 85): `ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';`
9. Run `populate-seed-voter-sessions.sql`
10. Run JUMP TO ROUND 1 (**with the approve line added**)
11. Play as Casper2 through round 1 — submit photo + favorite comment
12. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
13. Teacher approves round 1 favorite comment
14. Run JUMP TO ROUND 2 (**with the approve line added**)
15. Play as Casper2 through round 2
16. Repeat for round 3 / awards
