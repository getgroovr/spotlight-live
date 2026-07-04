# Session 71 Handoff — Admin Polish + Teacher Archiving

Date: 2026-07-02

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT SESSION" section for the suggested flow.

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

---

## What happened in session 71

### Priority 1: Admin dashboard polish

**StatItem order flip** — The overview row now reads label-first:
`Teachers 5 · Students 9 · Classes 5 · Mode Solo`
instead of the old `5 Teachers · 9 Students · …` layout.

Change: swap the `<span>` order in the `StatItem` component (label before value).

### Priority 3: Teacher archiving

Full implementation across three layers:

**A. Migration** (`20260702130000_teacher_archiving.sql`)
- Adds `is_archived boolean NOT NULL DEFAULT false` to `profiles`
- Partial index on `is_archived = true` for fast archive-section queries
- Safe on existing data (all teachers default to active)

**B. Server actions** (append to `src/app/admin/actions.ts`)
- `archiveTeacher(teacherId)` — sets `is_archived = true` AND removes teacher from `teacher_rotation` queue (so they can't recruit while archived)
- `unarchiveTeacher(teacherId)` — sets `is_archived = false` but does NOT re-add to rotation (admin does that manually when ready)

**C. Admin dashboard UI**
- `TeacherRow` type gains `is_archived: boolean`
- `page.tsx` profiles query gains `is_archived` in the select
- Teacher roster splits into `activeTeachers` (shown in the main table) and `archivedTeachers` (shown in the archive section)
- Each active teacher row gets an "Archive" pill button (red variant) next to Pause/Add-to-queue
- Archive section replaces the placeholder with a real table: Teacher | Classes | Action (Restore button)
- Restoring sets `is_archived = false` and the teacher reappears in the active roster

### Warm-up discussion (confirmed)

Stopping the warm-up (setting all rotation statuses to paused / removing all from rotation) **does** prevent new students from playing and forming classes. `loadGenericDeck()` in `deck.ts` queries `teacher_rotation` for `status IN ('recruiting', 'waiting')`. Zero rows → `{ ok: false, reason: "no-class" }` → no game renders on `/play`. The warm-up IS the front door to class formation; stopping it closes that door.

---

## Files delivered in session 71

| File | Destination | Notes |
|------|-------------|-------|
| `20260702130000_teacher_archiving.sql` | `supabase/migrations/` | Migration for is_archived |
| `archive-actions.ts` | APPEND to `src/app/admin/actions.ts` | archiveTeacher + unarchiveTeacher |
| `admin-client-patches.md` | Reference — apply to `src/app/admin/admin-client.tsx` | 7 targeted patches |

---

## How to apply session 71

1. **Run the migration** in Supabase SQL editor (or place in migrations folder)
2. **Append** the two functions from `archive-actions.ts` to your existing `actions.ts`
3. **Apply patches 1–7** from `admin-client-patches.md` to `admin-client.tsx`
4. **Update `page.tsx`** per patch 7: add `is_archived` to the profiles select and TeacherRow type

---

## Git commands for pending session 70 changes

```powershell
# Stage everything remaining
git add -A

# Commit
git commit -m "Session 70 cleanup: remaining admin, engine, deck, dashboard changes"
```

Or, for selective commits:

```powershell
# Admin dashboard
git add src/app/admin/page.tsx src/app/admin/admin-client.tsx
git commit -m "Session 70: admin dashboard layout updates"

# Game engine
git add src/game/shell.jsx src/game/spotlight.jsx
git commit -m "Session 70: spotlight and shell engine updates"

# Lib + student dashboard + docs
git add src/lib/ src/app/student/dashboard/ docs/ splash-history.txt
git commit -m "Session 70: deck, student dashboard, docs"
```

---

## What's still open (carried from session 70)

These priorities from session 70 were NOT done in session 71:

### STILL OPEN — /play route mode-aware deck loading

The `/play` page calls `loadGenericDeck()` which still uses `is_active`. This needs to query the right mode column based on `admin_settings.warmup_teacher_count`:
- `warmup_teacher_count = 1` → `WHERE selected_solo = true`
- `warmup_teacher_count = 3` → `WHERE selected_trio = true`
- `warmup_teacher_count = 9` → `WHERE selected_full = true`

**File needed from Mike:** `src/lib/deck.ts`

### STILL OPEN — Spreadsheet enrichment

The student spreadsheet is too thin. Current state:

**Client-side CSV (`csv-button.tsx`):** 4 columns — Round, Your Photo Description, Status, Teacher Note. Built from `ownEntries` only. Doesn't capture any of the student's language from the game itself.

**Server-side CSV (`route.ts`):** More fields but scoped to one student's enrollment metadata. Doesn't include the student's comments on other photos or classmates' comments on the student's photos.

**What a richer spreadsheet should include per student per round:**
- The student's own photo description
- The student's comments on each photo they viewed (the language they wrote)
- Which photo the student picked as favorite and their favorite comment
- Comments classmates left on the student's photo
- Teacher notes
- Warm-up photo descriptions (the teacher's descriptions students read)

**The data exists.** `student-archive.ts` already assembles `roundSessions` with `commentedEntries` (per-round, with comment text, description_text, isFavorite). The `ClassArchive` has `entries` (warm-up round data) and `generalNotes`. The `page.tsx` currently passes only `ownEntries` to `csv-button.tsx` — it needs to also pass `roundSessions` and possibly the warm-up entries.

**Implementation path:** Expand `csv-button.tsx` to accept `roundSessions` from the archive and build a richer spreadsheet. OR expand `route.ts` server-side with the same joins `student-archive.ts` already does. Client-side is simpler since the data is already assembled.

---

## NEXT SESSION (72): Suggested flow

### Priority 1: Fix /play route for mode-aware deck loading

**What:** `loadGenericDeck()` in `src/lib/deck.ts` queries `WHERE is_active = true`. Needs to read `admin_settings.warmup_teacher_count` and query the matching column (`selected_solo` / `selected_trio` / `selected_full`).

**File needed from Mike:** `src/lib/deck.ts`

**Scope:** Small — one query change + one admin_settings read. Should take <15 min.

### Priority 2: Spreadsheet enrichment

**What:** Make the student's downloadable spreadsheet capture all their language from the game, not just their photo descriptions.

**Files needed from Mike (all 4 already uploaded in session 71):**
- `src/app/student/dashboard/page.tsx` → already have it
- `src/app/student/dashboard/csv-button.tsx` → already have it
- `src/app/student/dashboard/export/route.ts` → already have it
- `src/lib/student-archive.ts` → already have it

**Approach — client-side (recommended):**
1. `page.tsx` already has `roundSessions` from `getStudentArchive()`. It currently passes only `ownEntries` to `StudentDashboardCsvButton`. Change it to also pass `roundSessions` and the warm-up `entries` from the current class.
2. `csv-button.tsx` gains new sections in the CSV:
   - Per student round: the student's comments on each photo they saw (description + their comment + whether it was their favorite)
   - Warm-up round: the teacher photos + descriptions + student's comments on those
3. The CSV goes from 4 columns to something like: Round | Photo Owner | Photo Description | Your Comment | Is Your Favorite | Teacher Note — one row per entry the student interacted with, grouped by round.

**Scope:** Medium — mostly wiring data that's already assembled into a richer CSV format.

### Priority 3: Test admin ↔ teacher deck interaction

With admin access restored, mode columns in place, and archiving added:
- Change warm-up mode on admin dashboard (Solo/Trio/Full)
- See the teacher deck page reflect the active mode
- Verify selection limits work correctly
- Test archiving and restoring a teacher

### Priority 4: Class request workflow

Teacher clicks "Request a new class" on their dashboard → request appears in admin → admin approves → teacher enters warm-up queue.

**Needs:** `class_requests` table, teacher dashboard button, admin approval UI, server actions.

**Files needed from Mike:**
- `src/app/teacher/page.tsx` (teacher dashboard)
- `src/app/admin/admin-client.tsx` (current, after session 71 patches)
- `src/app/admin/actions.ts` (current, after session 71 append)

### Priority 5: Messaging — design decision

Mike to decide: full inbox messaging vs. notification notes. If notification notes, we can build it quickly. If full messaging, it's a larger effort.

---

## Open bugs — updated status

| # | Description | Priority | Status |
|---|---|---|---|
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | Open — Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B54 | Completed round section collapse/minimize | LOW | Open — may already be done |
| NEW | `/play` route still queries `is_active` instead of mode columns | MEDIUM | Needs `src/lib/deck.ts` update |

---

## Ideas list

1. **Admin dashboard** — Layout v4 delivered session 69. Session 71 adds teacher archiving. Still needs: class request workflow, archived class count, spreadsheet archiving.
2. **Student → teacher messaging** — See messaging discussion in session 70 handoff. Recommendation: start with notification notes.
3. **Student → admin messaging** — Same.
4. **Teacher → admin messaging** — Same.
5. **Auto-class-creation** — When class hits capacity, system auto-creates next class.
6. **Teacher requests new class** — Button on teacher dashboard → admin approves → enters warm-up queue.
7. **Teacher archiving** — DONE (session 71). Archive inactive teachers, preserve their class history.
8. **Teacher deck photo selection** — DONE (session 70). Multi-mode selection with Solo/Trio/Full chips.
9. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough.
10. **Round gap timing UI** — Student-facing countdown; teacher-facing review window.
11. **"Party setup" holding page** — After final round, countdown to results reveal.
12. **Tie-handling in awards** — DONE (session 70). Tied 1st-place entries all show in finale.
13. **Awards ceremony timing polish** — DONE (session 70). Progressive celebration with balloons/ribbons.
14. **Multi-teacher warm-up game** — Part of admin dashboard. 1/3/9 teachers in warm-up.
15. **Teacher rotation system** — Part of admin dashboard. Admin-controlled queue.
16. **Spreadsheet archiving** — Archive class spreadsheet with class metadata.
17. **Round timing on admin** — Show/archive round timing info. Low priority.
18. **Spreadsheet enrichment** — Richer spreadsheet with all student language (comments, favorites, descriptions). Files uploaded; ready to build.
19. **Back-to-dashboard links on ceremony** — DONE (session 70). Text links on intro + podium pages.
20. **Incomplete mode selection warnings** — Alert teachers when their active mode doesn't have enough photos selected.

---

## Files to upload at the start of next session

1. This handoff
2. `src/lib/deck.ts` (needed for /play mode-aware query — Priority 1)
3. For spreadsheet enrichment (Priority 2) — all 4 already uploaded in session 71:
   - `src/app/student/dashboard/page.tsx`
   - `src/app/student/dashboard/csv-button.tsx`
   - `src/app/student/dashboard/export/route.ts`
   - `src/lib/student-archive.ts`
4. For class request workflow (Priority 4):
   - `src/app/teacher/page.tsx`
   - `src/app/admin/admin-client.tsx` (post-session-71 version)
   - `src/app/admin/actions.ts` (post-session-71 version)

---

## Current schema highlights

### Tables relevant to admin

| Table | Key columns | Notes |
|-------|-------------|-------|
| `profiles` | id, role, display_name, username, max_classes, is_admin, is_archived | `role` = 'teacher'/'student', `is_admin` boolean overlay, `is_archived` added session 71 |
| `teacher_rotation` | teacher_id (unique), sort_order, status | status: 'recruiting'/'waiting'/'paused' |
| `admin_settings` | id=1 (singleton), warmup_teacher_count | 1/3/9 |
| `classes` | id, teacher_id, name, capacity | capacity default 9 |
| `enrollments` | student_id, class_id, status | status: 'active' |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo, selected_trio, selected_full, description_text | is_starter=true for warm-up deck photos; mode selection columns added session 70 |
| `games` | id, class_id, name, status, round_count | status: 'pending'/'active'/'complete' |

### Admin server actions (`src/app/admin/actions.ts`)

| Action | Purpose |
|--------|---------|
| `updateMaxClasses(teacherId, max)` | Set teacher's max_classes limit |
| `addToRotation(teacherId)` | Add teacher to warm-up queue |
| `removeFromRotation(teacherId)` | Remove teacher from queue |
| `setRotationStatus(teacherId, status)` | Set recruiting/waiting/paused |
| `moveInRotation(teacherId, direction)` | Reorder queue up/down |
| `togglePhotoActive(entryId, active)` | Toggle warm-up photo on/off |
| `updateWarmupMode(count)` | Set 1/3/9 teacher warm-up mode |
| `archiveTeacher(teacherId)` | Set is_archived=true + remove from rotation (session 71) |
| `unarchiveTeacher(teacherId)` | Set is_archived=false, does NOT re-add to rotation (session 71) |

### Teacher deck server actions (`src/app/teacher/deck/actions.ts`)

| Action | Purpose |
|--------|---------|
| `uploadStarter(formData)` | Add photo + description (starts unselected) |
| `deleteStarter(entryId)` | Remove starter (DB + storage) |
| `updateStarterDescription(entryId, text)` | Edit description |
| `toggleModeSelection(entryId, mode, selected)` | Toggle solo/trio/full selection (enforces limits) |
| `toggleStarterActive(entryId, active)` | Legacy — kept for admin dashboard |
| `saveDisplayName(name)` | Write profiles.display_name |

---

## SQL files reference (current versions)

| File | Purpose | Version |
|------|---------|---------|
| `all-in-one-setup-v5.sql` | Full reset + seed 9 students + game setup | v5 |
| `seed-teachers-v1.sql` | Seed 4 fake teacher accounts + classes + rotation | v1 |
| `add-mode-selections.sql` | Add selected_solo/trio/full columns | Session 70 |
| `20260702130000_teacher_archiving.sql` | Add is_archived to profiles | Session 71 |
| `jump-to-round-1-v5.sql` | Approve + start game at round 1 | v5 |
| `jump-to-round-2-v5.sql` | Simulate round 1, advance to round 2 | v5 |
| `jump-to-round-3-v5.sql` | Simulate rounds 1–2, advance to round 3 | v5 |
| `fast-path-results-v5.sql` | Simulate all rounds, end game | v5 |
| `testing-walkthrough-v11.sql` | Test plan + verification queries | v11 |

---

## Known Tailwind issue (ONGOING)

This project's Tailwind build does NOT compile `grid-cols-2`, `grid-cols-3`, `grid-cols-4` etc. into actual CSS. All multi-column layouts MUST use inline styles:
```jsx
style={{ display: "flex" }}          // with flex: 1 children
style={{ display: "grid", gridTemplateColumns: "repeat(N, 1fr)" }}
```
This applies to ALL files. Any future file that needs columns should use inline styles, not Tailwind grid classes.
