# SESSION 70 HANDOFF — 7/2/2026

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

## What happened in session 70

### Awards ceremony progressive celebration

Rebuilt `ResultsCeremony.tsx` with:

**Progressive celebration by rank:**
- 3rd place: 15 confetti pieces, 80px medal emoji, basic card
- 2nd place: 40 confetti + ribbons streaming down, 100px medal
- 1st place: 90 confetti + 14 balloons floating up from bottom + ribbons + pulsing gold glow on card + "✨ The crowd favorite ✨" splash text, 120px medal
- Finale: 120 confetti + 20 balloons + 14 ribbons + crown entrance animation + bouncing party popper

New CSS components: `Balloons` (SVG balloons with rise+sway animation), `Ribbons` (colored streamers with curl+fall animation).

**Tie fix in finale:** Changed `.find((e) => e.rank === 1)` to `.filter((e) => e.rank === 1)` so ALL tied gold winners per round appear in the final celebration. Each tied entry gets a "(tie — 1 of 2)" label.

**Back to dashboard links:** Added `DashboardLink` component (text link, not button: "← Back to dashboard") on the intro page (below "Begin the ceremony" button) and after each round's podium (below "Next round →" button).

### Teacher deck multi-mode photo selection

Complete rebuild of the teacher deck page (`src/app/teacher/deck/`). Instead of a single `is_active` boolean, teachers now pre-select photos for each warm-up mode independently:

**DB migration (`add-mode-selections.sql`):**
- Added three boolean columns to `entries`: `selected_solo`, `selected_trio`, `selected_full`
- Migrated existing `is_active = true` starters into `selected_solo = true`

**How it works:**
- Each photo card has three mode toggle chips: Solo (gold), Trio (green), Full (blue)
- A photo can be selected for any combination of modes — the 3 Trio picks can also be part of the 9 Solo picks, the 1 Full pick can be part of the Trio and Solo picks, etc.
- Server-side limit enforcement: Solo ≤ 9, Trio ≤ 3, Full ≤ 1 per teacher
- Status banner at top shows counts per mode with ✓ when ready
- The admin's currently active mode gets a purple "Active" badge
- `is_active` is now synced automatically: true if selected for ANY mode, false if none
- New uploads start with no mode selections (teacher explicitly picks)

**New server action:** `toggleModeSelection(entryId, mode, selected)` replaces the old single-mode `toggleStarterActive` for teacher use. Legacy `toggleStarterActive` kept for admin dashboard compatibility.

### What was NOT done

- `/play` route update: `loadGenericDeck()` in `src/lib/deck.ts` still queries `is_active` — needs to switch to the mode-specific column (`selected_solo`/`selected_trio`/`selected_full` based on `admin_settings.warmup_teacher_count`). **File needed: `src/lib/deck.ts`.**
- CSV/spreadsheet enrichment (discussed but deferred — see below)
- Messaging system (discussed — see design notes below)
- Incomplete-selection notification on teacher deck (the counts show but there's no alert/warning when selections are incomplete)

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

## Architecture decisions & open design questions

### /play route mode-aware query (BLOCKING — do next)

The `/play` route calls `loadGenericDeck()` from `src/lib/deck.ts`. Currently this queries `WHERE is_active = true`. It needs to:

1. Read `admin_settings.warmup_teacher_count` to know the current mode
2. Query the appropriate column:
   - `warmup_teacher_count = 1` → `WHERE selected_solo = true`
   - `warmup_teacher_count = 3` → `WHERE selected_trio = true`
   - `warmup_teacher_count = 9` → `WHERE selected_full = true`

**File needed from Mike:** `src/lib/deck.ts`

### Teacher deck incomplete-selection warnings

Currently the status banner shows "3 / 9 selected" per mode but doesn't actively warn the teacher. Ideas:
- Amber warning banner when the active mode has fewer than required selections
- Per-mode "⚠ Need X more" text in the status panel
- Toast/alert on page load if the active mode is under-filled

### Spreadsheet / CSV enrichment (DEFERRED)

Mike wants the student spreadsheet to capture as much student language as possible. Current state:

**Client-side CSV (`csv-button.tsx`):** 4 columns — Round, Your Photo Description, Status, Teacher Note. Very minimal.

**Server-side CSV (`route.ts`):** More fields but scoped to one student's enrollment data. Doesn't include the student's comments on other photos or classmates' comments on the student's photos.

**What a richer spreadsheet should include per student per round:**
- The student's own photo description
- The student's comments on each photo they viewed (the language they wrote)
- Which photo the student picked as favorite and their favorite comment
- Comments classmates left on the student's photo
- Teacher notes
- Warm-up photo descriptions (the teacher's descriptions students read)

**Implementation approach:** The data is all in the DB (entries, game_sessions.comments, game_sessions.favorite_comment, teacher_comments). The csv-button.tsx client component would need richer data passed down from page.tsx. Or the server-side route.ts could be expanded with more joins.

### Messaging system (DISCUSSED — not yet built)

Mike asked about messaging between students, teachers, and admin. Here are my thoughts:

**Is it necessary?** For the current use case (a classroom photo game), structured messaging is probably overkill if the admin and teachers are already communicating outside the app (email, Slack, in person). But it becomes necessary if:
- Students need to ask teachers questions about rejected photos
- Teachers need to flag issues to admin
- The app is used across multiple schools/sites where in-person isn't an option

**Simpler alternative — notification notes:**
Instead of a full inbox/outbox messaging system, consider one-way notification notes:
- Student → Teacher: a "question" field on rejected photo resubmissions (already partly there with the resubmit workflow)
- Teacher → Admin: a "flag this student" or "request help" button that creates a single note
- Admin → Teacher: notes attached to class requests or rotation changes

This avoids building a real-time chat system while still giving everyone a way to communicate within the app.

**If full messaging is wanted**, the table structure from session 69 handoff works:
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

But it also needs:
- Unread count indicators on each dashboard
- A compose UI on each dashboard
- A read/inbox view on admin
- Notification badges
- Rate limiting to prevent spam
- Consider: should students message each other? (probably not)

**Recommendation:** Start with the notification-notes approach. Add full messaging only if the simpler version proves insufficient. The rejected-photo resubmit workflow already handles the most common student→teacher communication need.

### Class request workflow (from session 69 — not yet built)

1. Teacher clicks "Request a new class" on their dashboard
2. Request appears in admin's "Requested" column
3. Admin approves or denies
4. If approved, teacher enters warm-up queue

**Needs:** `class_requests` table, teacher dashboard button, admin approval UI, server actions.

### Teacher archiving (from session 69 — not yet built)

`is_archived` boolean on profiles. Archived teachers hidden from active roster, shown in archive section. Past classes preserved.

---

## Open bugs — updated status

| # | Description | Priority | Status |
|---|---|---|---|
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | Open — Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B54 | Completed round section collapse/minimize | LOW | Open — may already be done |
| NEW | Admin page shows "no admin privileges" after re-seeding | HIGH | Fix: run `UPDATE profiles SET is_admin = true WHERE display_name LIKE '%Mike%';` |
| NEW | `/play` route still queries `is_active` instead of mode columns | MEDIUM | Needs `src/lib/deck.ts` update |

---

## Ideas list

1. **Admin dashboard** — Layout v4 delivered session 69. Needs: class request workflow, teacher archiving, archived class count, spreadsheet archiving.
2. **Student → teacher messaging** — See messaging discussion above. Recommendation: start with notification notes.
3. **Student → admin messaging** — Same.
4. **Teacher → admin messaging** — Same.
5. **Auto-class-creation** — When class hits capacity, system auto-creates next class.
6. **Teacher requests new class** — Button on teacher dashboard → admin approves → enters warm-up queue.
7. **Teacher archiving** — Archive inactive teachers, preserve their class history.
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
18. **Spreadsheet enrichment** — NEW. Richer CSV with all student language (comments, favorites, descriptions).
19. **Back-to-dashboard links on ceremony** — DONE (session 70). Text links on intro + podium pages.
20. **Incomplete mode selection warnings** — NEW. Alert teachers when their active mode doesn't have enough photos selected.

---

## NEXT SESSION (71): Suggested flow

### Priority 1: Fix /play route for mode-aware deck loading

The `/play` page calls `loadGenericDeck()` which still uses `is_active`. This needs to query the right mode column based on `admin_settings.warmup_teacher_count`.

**File needed from Mike:** `src/lib/deck.ts`

### Priority 2: Test admin ↔ teacher deck interaction

With admin access restored and mode columns in place:
- Change warm-up mode on admin dashboard (Solo/Trio/Full)
- See the teacher deck page reflect the active mode
- Verify selection limits work correctly
- Verify /play renders the right photos for the active mode

### Priority 3: Spreadsheet enrichment

Make the student spreadsheet capture all student language contributions:
- Photo descriptions per round
- Comments written on other photos
- Favorite selections and favorite comments
- Classmates' comments on student's photos
- Warm-up photo descriptions

**Files needed from Mike:**
- `src/app/student/dashboard/page.tsx` (current version — to see what data is already passed to csv-button)
- `src/app/student/dashboard/csv-button.tsx` (current)
- `src/app/student/dashboard/export/route.ts` (current)
- `src/lib/student-archive.ts` (where archive data is assembled)

### Priority 4: Messaging — design decision

Mike to decide: full inbox messaging vs. notification notes. If notification notes, we can build it quickly. If full messaging, it's a larger effort.

### Priority 5: Class request workflow

Teacher requests new class → admin approves → teacher enters queue.

---

## Files delivered in session 70

| File | Destination | Notes |
|------|-------------|--------|
| `ResultsCeremony.tsx` | `src/app/student/results/ResultsCeremony.tsx` | Progressive celebration, tie fix, dashboard links |
| `page.tsx` | `src/app/teacher/deck/page.tsx` | Multi-mode selection, reads admin_settings |
| `deck-client.tsx` | `src/app/teacher/deck/deck-client.tsx` | Mode chips per photo, status banner |
| `actions.ts` | `src/app/teacher/deck/actions.ts` | toggleModeSelection with per-mode limits |
| `add-mode-selections.sql` | Run in Supabase SQL editor | Adds selected_solo/trio/full columns |
| `2026-07-02_SESSION_70_HANDOFF.md` | Project root / handoff folder | This handoff |

---

## Files to upload at the start of next session

1. This handoff
2. `src/lib/deck.ts` (needed for /play mode-aware query)
3. `src/app/admin/page.tsx` (current)
4. `src/app/admin/admin-client.tsx` (current)
5. `src/app/admin/actions.ts` (current)
6. `src/app/student/dashboard/page.tsx` (if working on spreadsheet)
7. `src/lib/student-archive.ts` (if working on spreadsheet)
8. Screenshots of current state for reference

---

## SQL files reference (current versions)

| File | Purpose | Version |
|------|---------|---------|
| `all-in-one-setup-v5.sql` | Full reset + seed 9 students + game setup | v5 |
| `seed-teachers-v1.sql` | Seed 4 fake teacher accounts + classes + rotation | v1 |
| `add-mode-selections.sql` | Add selected_solo/trio/full columns | NEW session 70 |
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
