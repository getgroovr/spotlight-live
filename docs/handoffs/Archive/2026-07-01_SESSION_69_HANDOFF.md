# SESSION 69 HANDOFF — 7/1/2026

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

---

## What happened in sessions 67–69

### Session 67: Dual-role migration + admin settings

1. **`is_admin` boolean migration** — Added `is_admin` boolean column to profiles. Changed Mike back to `role = 'teacher'` with `is_admin = true`. Updated `is_admin()` Postgres function to check the boolean instead of `role = 'admin'`. This fixed the deck page ("Teacher access only" error) and made teachers show up in the admin dashboard.

2. **`admin_settings` table** — Created singleton table with `warmup_teacher_count` (1/3/9) for controlling warm-up mode. Solo = 1 teacher gets all 9 photo slots, Trio = 3 teachers get 3 each, Full = 9 teachers get 1 each.

3. **Teacher seeding SQL** — `seed-teachers-v1.sql` creates 4 fake teacher accounts (Mr. Chen, Mr. Petrov, Ms. Okafor, Ms. Rivera) with profiles, classes, and rotation queue entries.

4. **`updateWarmupMode` server action** added to actions.ts.

### Session 68: Admin dashboard rebuild

Rebuilt `page.tsx`, `admin-client.tsx`, and `actions.ts` with:
- Three-layer layout: program overview, teacher details, archive
- Stats strip, warm-up control with mode selector + rotation queue
- Teacher roster with expandable detail panel (deck/classes/students tabs)
- All at 440px max-width (matching other dashboards)

### Session 69: Layout redesign (this session)

Mike requested layout changes to the admin dashboard:

**Done:**
- Widened layout from 440px → 660px
- Removed subtitle under Admin header
- Added "Overview" section label above stats; stats in compact horizontal strip
- Added Messages section placeholder (two columns side by side: from teachers / from students)
- Warm-up control: mode + in warm-up + next on one row; two side-by-side columns ("Wanting classes" vs "Not wanting classes"); no ✕ in queue (removal via teacher table's Pause button)
- Teacher roster: proper HTML `<table>` with column headers (Teacher | Classes | Archived | Requested | Queue)
- Renamed "Teacher details" → "Current classes"
- Deck tab: 4-column grid, description_text shown under each photo with 2-line clamp
- **Fixed broken images**: page.tsx now generates signed URLs for Supabase storage photos. External URLs (placehold.co) pass through unchanged.
- **Fixed multi-column layouts**: Tailwind `grid-cols-N` classes don't render in this project's build. All side-by-side layouts now use inline `style={{ display: "flex" }}` or `style={{ display: "grid", gridTemplateColumns: "repeat(N, 1fr)" }}`.

**Placeholders / not yet functional:**
- "Archived" column shows 0 for all teachers (needs DB query for completed classes)
- "Requested" column shows — (needs `class_requests` table + teacher dashboard button)
- Messages section is empty placeholder (needs `messages` table + teacher/student UI)

**Known Tailwind issue:** This project's Tailwind build does not compile `grid-cols-2`, `grid-cols-3`, `grid-cols-4` etc. into actual CSS. All multi-column layouts MUST use inline styles. This applies to all files, not just admin. Any future file that needs columns should use `style={{ display: "flex" }}` with `style={{ flex: 1 }}` children, or `style={{ display: "grid", gridTemplateColumns: "repeat(N, 1fr)" }}`.

---

## Current schema highlights

### Tables relevant to admin

| Table | Key columns | Notes |
|-------|-------------|-------|
| `profiles` | id, role, display_name, username, max_classes, is_admin | `role` = 'teacher'/'student', `is_admin` boolean overlay |
| `teacher_rotation` | teacher_id (unique), sort_order, status | status: 'recruiting'/'waiting'/'paused' |
| `admin_settings` | id=1 (singleton), warmup_teacher_count | 1/3/9 |
| `classes` | id, teacher_id, name, capacity | capacity default 9 |
| `enrollments` | student_id, class_id, status | status: 'active' |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, description_text | is_starter=true for warm-up deck photos |
| `games` | id, class_id, name, status, round_count | status: 'pending'/'active'/'complete' |

### Admin server actions (actions.ts)

| Action | Purpose |
|--------|---------|
| `updateMaxClasses(teacherId, max)` | Set teacher's max_classes limit |
| `addToRotation(teacherId)` | Add teacher to warm-up queue |
| `removeFromRotation(teacherId)` | Remove teacher from queue |
| `setRotationStatus(teacherId, status)` | Set recruiting/waiting/paused |
| `moveInRotation(teacherId, direction)` | Reorder queue up/down |
| `togglePhotoActive(entryId, active)` | Toggle warm-up photo on/off |
| `updateWarmupMode(count)` | Set 1/3/9 teacher warm-up mode |

**Admin UI controls (client-side, using existing actions):**
- Start/Stop warm-up toggle: sets first waiting teacher to "recruiting" (start) or sets recruiting teacher back to "waiting" (stop)

---

## Architecture decisions & open design questions

### Class request workflow (NEW — not yet built)

Mike's vision for how teachers get new classes:

1. Teacher clicks "Request a new class" on their dashboard
2. Request appears in admin's "Requested" column (count)
3. Admin approves or denies
4. If approved, teacher enters warm-up queue (wanting classes list)
5. When teacher reaches top of queue, warm-up starts, students join
6. When class fills, teacher auto-rotates out (or moves to next slot)

**Needs:**
- `class_requests` table: teacher_id, status ('pending'/'approved'/'denied'), created_at
- Teacher dashboard: "Request a new class" button + request status display
- Admin dashboard: request count in table, approval UI
- Server actions: approveClassRequest, denyClassRequest

### Teacher archiving (NEW — discussed, not built)

Teachers who are no longer active need to be archivable so they don't clutter the roster. Options:
- `is_archived` boolean on profiles (simplest)
- Archived teachers hidden from active roster, shown in archive section
- Their past classes + spreadsheets preserved in archive

### Teacher deck photo selection (NEW — discussed, not built)

Teachers need to choose which photos appear in the warm-up deck based on the game mode:
- **Solo mode (1 teacher):** Teacher selects 9 photos for the 3×3 grid
- **Trio mode (3 teachers):** Each teacher selects 3 photos
- **Full mode (9 teachers):** Each teacher selects 1 photo

This means the teacher deck page needs a mode-aware selection UI. The teacher picks from their uploaded photos and marks which ones to use. The admin's mode setting determines how many each teacher gets to pick.

**Needs:**
- Teacher deck page rebuild (photo selection UI with mode awareness)
- Possibly a `deck_selections` table or use the existing `is_active` flag with a count limit
- Teacher dashboard awareness of current warm-up mode

### Messages system (NEW — placeholder only)

Two-way messaging between:
- Student → Teacher (on student dashboard)
- Student → Admin (on student dashboard)
- Teacher → Admin (on teacher dashboard)
- Admin sees all incoming in admin dashboard Messages section

**Needs:**
- `messages` table: sender_id, recipient_id, body, created_at, read_at
- Student dashboard: two message buttons (to teacher, to admin)
- Teacher dashboard: message button (to admin)
- Admin dashboard: message inbox (already has placeholder)
- Notification indicators on all dashboards

### Round timing visibility

Mike raised whether round start time and duration should be visible on admin dashboard. Current thinking: probably not critical for admin since it doesn't affect warm-up mechanics. Could show it as metadata on the class detail and archive it with the class. **Deferred — discuss with Mike.**

### Spreadsheet archiving with class metadata

When a class completes, the class spreadsheet (game results) should be archived alongside class metadata (teacher, dates, rounds, student count). This would live in the Archive section. **Deferred — discuss with Mike.**

### Deck photo issues (fixed in session 69)

- **Broken real images**: The `media_url` field stores Supabase storage paths (not full URLs). The admin dashboard was rendering `<img src={path}>` which doesn't work — storage paths need signed URLs. Fixed: `page.tsx` now calls `supabase.storage.from("media").createSignedUrl()` for non-HTTP paths before passing to the client. URLs that start with `http` (like placehold.co placeholders) pass through unchanged.
- **R2/R3 placeholders**: These are placehold.co URLs from seed data. They render fine but show orange placeholder images, not real photos. Their `description_text` values are "My round 2 photo" / "My round 3 photo".
- **Tailwind grid broken**: Photo grid was using `grid-cols-4` which doesn't compile in this project. Fixed with inline `style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}`.

---

## Open bugs — updated status

| # | Description | Priority | Status |
|---|---|---|---|
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | Open — Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B54 | Completed round section collapse/minimize | LOW | Open — may already be done |

---

## Ideas list

1. **Admin dashboard** — IN PROGRESS. Layout v4 delivered session 69. Needs: class request workflow, teacher archiving, archived class count, spreadsheet archiving.
2. **Student → teacher messaging** — Part of messages system. Button on student dashboard.
3. **Student → admin messaging** — Part of messages system. Separate button on student dashboard.
4. **Teacher → admin messaging** — Part of messages system. Button on teacher dashboard.
5. **Auto-class-creation** — When class hits capacity, system auto-creates next class. Ties into rotation.
6. **Teacher requests new class** — Button on teacher dashboard → admin approves → enters warm-up queue.
7. **Teacher archiving** — Archive inactive teachers, preserve their class history.
8. **Teacher deck photo selection** — NEW. Teacher picks which photos to show based on mode (1/3/9). Rebuild teacher deck page.
9. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough.
10. **Round gap timing UI** — Student-facing countdown; teacher-facing review window.
11. **"Party setup" holding page** — After final round, countdown to results reveal.
12. **Tie-handling in awards** — With 9 students, ties common. Shared gold or tie-breaking.
13. **Awards ceremony timing polish** — Adjust reveal durations, podium sizing, sound effects.
14. **Multi-teacher warm-up game** — Part of admin dashboard. 1/3/9 teachers in warm-up.
15. **Teacher rotation system** — Part of admin dashboard. Admin-controlled queue.
16. **Spreadsheet archiving** — Archive class spreadsheet with class metadata.
17. **Round timing on admin** — Show/archive round timing info. Low priority.

---

## NEXT SESSION (70): Suggested flow

Mike is ready to move past layout iteration and see things work. Prioritize functional features.

### Priority 1: Teacher deck page rebuild

Teacher needs to select which photos appear in the warm-up deck based on mode:
- Solo: pick 9 photos
- Trio: pick 3 photos
- Full: pick 1 photo

This requires the teacher deck page (`src/app/teacher/deck/`) to be mode-aware. The admin's `warmup_teacher_count` setting determines how many photos each teacher selects.

**Files needed:**
- `src/app/teacher/deck/page.tsx`
- `src/app/teacher/deck/deck-client.tsx`
- `src/app/teacher/deck/actions.ts`
- This handoff

### Priority 2: Messages table + basic UI

Create the messages table and add send/receive UI to:
- Student dashboard (message teacher + message admin buttons)
- Teacher dashboard (message admin button)
- Admin dashboard (inbox already has placeholder)

**Migration:**
```sql
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES profiles(id),
  recipient_id uuid NOT NULL REFERENCES profiles(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
```

**Files needed:**
- Student dashboard files
- Teacher dashboard files
- Admin dashboard files (already have placeholder)
- This handoff

### Priority 3: Class request workflow

Teacher requests new class → admin approves/denies → teacher enters queue.

### Priority 4: Archived class count + teacher archiving

Wire up the "Archived" column and add archive/unarchive for teachers.

---

## Files delivered in session 69

| File | Destination | Notes |
|------|-------------|--------|
| `page.tsx` | `src/app/admin/page.tsx` | Widened to 660px + signed URL generation for starter photos |
| `admin-client.tsx` | `src/app/admin/admin-client.tsx` | Redesigned layout, all multi-column via inline styles |
| `2026-07-01_SESSION_69_HANDOFF.md` | Project root / handoff folder | This handoff |

---

## Files to upload at the start of next session

1. This handoff
2. `src/app/admin/page.tsx` (current)
3. `src/app/admin/admin-client.tsx` (current)
4. `src/app/admin/actions.ts` (unchanged from session 68)
5. Screenshots of current state for reference
6. If working on class requests: `src/app/teacher/dashboard/` files (page.tsx, actions.ts, client component)

---

## SQL files reference (current versions)

| File | Purpose | Version |
|------|---------|---------|
| `all-in-one-setup-v5.sql` | Full reset + seed 9 students + game setup | v5 |
| `seed-teachers-v1.sql` | Seed 4 fake teacher accounts + classes + rotation | v1 |
| `jump-to-round-1-v5.sql` | Approve + start game at round 1 | v5 |
| `jump-to-round-2-v5.sql` | Simulate round 1, advance to round 2 | v5 |
| `jump-to-round-3-v5.sql` | Simulate rounds 1–2, advance to round 3 | v5 |
| `fast-path-results-v5.sql` | Simulate all rounds, end game | v5 |
| `testing-walkthrough-v11.sql` | Test plan + verification queries | v11 |
