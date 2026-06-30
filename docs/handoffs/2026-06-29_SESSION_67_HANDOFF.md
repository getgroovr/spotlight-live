# SESSION 67 HANDOFF — 6/29/2026

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

## What happened in session 67

### Step 1: Dual-role migration (migration-session67.sql)

Added `is_admin` boolean to profiles. Changed Mike from `role='admin'` back to `role='teacher'` with `is_admin=true`. Updated the `is_admin()` Postgres function to check the boolean instead of the enum. The `'admin'` role enum value is retired — boolean is source of truth.

This fixes two bugs from session 65:
- Deck page no longer says "Teacher access only" for Mike
- Admin dashboard no longer shows 0 teachers (Mike's teacher row is back)

### Step 2: Admin settings table (same migration file)

Created `admin_settings` singleton table with `warmup_teacher_count` (1, 3, or 9). CHECK constraint enforces valid values. RLS: admin full access, authenticated users can read (deck/play pages need the config). Seeded with default value of 1 (Solo mode).

### Step 3: Seed teachers (seed-teachers-v1.sql)

Created 4 fake teacher accounts:

| Teacher | Email | Class | Starters | Rotation |
|---------|-------|-------|----------|----------|
| Ms. Rivera | seed-teacher-1@test.local | Rivera's Art Class | 3 photos | waiting (pos 0) |
| Mr. Chen | seed-teacher-2@test.local | Chen's Studio | 3 photos | waiting (pos 1) |
| Ms. Okafor | seed-teacher-3@test.local | Okafor's Gallery | 2 photos | not in queue |
| Mr. Petrov | seed-teacher-4@test.local | Petrov's Workshop | 2 photos | not in queue |

Each has auth.users + profiles + 1 class + starter entries using photos from the existing seed-photos bucket. Run after all-in-one-setup-v5.sql. Idempotent (ON CONFLICT handling).

### Step 4: Admin dashboard rebuild

Three files delivered to `src/app/admin/`:

**page.tsx** — Server component. Auth now checks `is_admin` boolean instead of `role='admin'`. Fetches nested data: teachers → classes → students, starters, games, rotation, admin_settings. Passes everything to AdminClient.

**admin-client.tsx** — Client component. New teacher-centric layout:
- Teacher dropdown selector at top (★ marks admin)
- Selected teacher detail panel: info header with max_classes editor, rotation status
- Three tabs: Classes (expandable class list with student names, game status), Deck (photo grid with active/inactive toggles), Archive (placeholder)
- Warm-up mode selector: Solo (1) / Trio (3) / Full (9) buttons
- Rotation queue: ordered list with ▲/▼, Recruit/Stop/Pause/Unpause/Remove
- All teachers roster: compact cards with Inspect button

**actions.ts** — Server actions. `requireAdmin()` updated to check `is_admin` boolean. All existing actions preserved. New `updateWarmupMode(count)` action for the Solo/Trio/Full selector.

### Step 5: Deck page rebuild

Three files delivered to `src/app/teacher/deck/`:

**page.tsx** — Removed `NEXT_PUBLIC_DEMO_CLASS_ID` and `is_public` class lookup. Each teacher now sees their own starters via `student_id = user.id` (no class pinning). Handles both full URLs (seed photos) and storage paths (teacher-deck uploads) for image display. Shows active/total photo count in pool status. Passes `canUpload` flag (teacher needs at least one class).

**deck-client.tsx** — Added active/inactive toggle strip below each photo. Inactive photos visually dim. Upload form hidden with message if teacher has no class. Everything else preserved: preview, edit, delete, display name, optimistic deletes.

**actions.ts** — Removed DEMO_CLASS_ID/is_public dependency. `uploadStarter` now finds the teacher's first class via `classes.teacher_id = user.id`. New `toggleStarterActive(entryId, active)` action. Shared `requireTeacher()` auth helper. Storage cleanup skips full URLs (seed photos live in a different bucket).

### Testing walkthrough v12

Updated `testing-walkthrough-v12.sql` with:
- Test 0: migration verification (dual-role, admin_settings)
- Test 0B: teacher seeding verification
- Tests 9–11: admin dashboard (teacher management, warmup mode, rotation queue)
- Test 12: combined admin + game flow (proves dual-role works end-to-end)
- Updated bug list (all B48/B49/B55/B64/B41/U2/U3 confirmed closed)
- Updated quick reference with seed teacher accounts

---

## Known issues

| # | Description | Priority | Status |
|---|---|---|---|
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | Open — Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B54 | Completed round section on dashboard should collapse/minimize | LOW | Open |
| K1 | Admin dashboard photo URLs break for teacher-deck uploads | MEDIUM | NEW — see below |
| K2 | /play warm-up deck ignores warmup_teacher_count setting | HIGH | NEW — next build |

**K1 detail:** The admin dashboard's Deck tab uses `starter.media_url` as the `<img src>`. Seed photos work because their `media_url` is a full URL. But photos uploaded through the teacher deck have a storage path (e.g. `classId/teacherId/timestamp.jpg`) which won't render as an image. Fix: resolve URLs in admin `page.tsx` the same way the deck `page.tsx` does (check if full URL, otherwise call `getPublicUrl`). This doesn't affect testing until someone uploads a photo through the teacher deck page — all current starters are seed photos with full URLs.

**K2 detail:** The warm-up deck at `/play` still uses the old logic (hardcoded class or `is_public`). It doesn't read `admin_settings.warmup_teacher_count` yet. This is the next major build piece — see "Chat B" below.

---

## Architecture: how multi-teacher warm-up will work

The admin sets `warmup_teacher_count` (1, 3, or 9). The `/play` route reads this and builds the 3×3 grid:

| Mode | Teachers | Photos/teacher | How student picks teacher |
|------|----------|---------------|--------------------------|
| Solo (1) | 1 (recruiting) | 9 | Auto-joins only teacher |
| Trio (3) | Top 3 in rotation | 3 each | Favorites a photo → assigned to that teacher |
| Full (9) | Top 9 in rotation | 1 each | Favorites a photo → assigned to that teacher |

The `/play` route needs to:
1. Read `warmup_teacher_count` from `admin_settings`
2. Find the active teachers: recruiting teacher first, then top N from rotation queue (status = 'recruiting' or 'waiting')
3. For each teacher, pick N active starters (is_active = true, is_starter = true)
4. Shuffle and present the 9-photo grid
5. After student favorites + submits: create enrollment in the favorited teacher's class

**Student → teacher assignment** happens when the warm-up completes. The favorited photo's `student_id` (= teacher_id on starters) tells us which teacher to assign. We find that teacher's class with capacity, create the enrollment.

---

## Open bugs — updated status

| # | Description | Closed in |
|---|---|---|
| B48 | Lock favorites after next-round photo upload | Session 58 |
| B49 | Comment editing rules — favorite locks on submit | Session 58 |
| B64 | Remove "WHY IT'S MY FAVORITE" from teacher review card | Pre-session 65 |
| B41 | Photo preview in teacher review card | Session 63 |
| B55 | After replaying completed round → "Back to dashboard" | Session 58 |
| U2 | Upload button more prominent | Session 58 |
| U3 | Hide raw filename once preview showing | Session 58 |

---

## Ideas list

1. **Admin dashboard** — DELIVERED (session 67). Polish based on Mike's feedback.
2. **Multi-teacher warm-up** — Architecture decided. /play route rebuild is next.
3. **Student → teacher assignment** — Part of warm-up rebuild. Favorite = teacher pick.
4. **Auto-class-creation** — When class hits capacity, system auto-creates next class.
5. **Teacher sets desired number of classes** — "I want 4 classes" → admin approves limit → rotation fills sequentially.
6. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough.
7. **Round gap timing UI** — student-facing countdown for submission deadline; teacher-facing review window.
8. **"Party setup" holding page** — after final round, students see countdown to results reveal.
9. **Tie-handling in awards** — with 9 students, ties are common.
10. **Awards ceremony timing polish** — reveal durations, podium sizing, sound effects.
11. **Student → teacher messaging** — button in student profile to message the teacher.
12. **Student → admin messaging** — separate button to message admin/support.

---

## NEXT SESSIONS: organized by file groups

### Chat A: Test + fix session 67 deliverables

**What:** Run migration, seed teachers, deploy admin dashboard and deck rebuild. Test everything per testing-walkthrough-v12.sql. Fix any issues found.

**Run order:**
1. Run `migration-session67.sql` in Supabase SQL Editor
2. Run `all-in-one-setup-v5.sql` (fresh reset)
3. Run `seed-teachers-v1.sql`
4. Deploy the 6 files (3 admin, 3 deck)
5. Test per walkthrough Tests 0, 0B, 9, 10, 11, 12
6. Also test game flow (Tests 1–5, 7, 8) to confirm nothing broke

**Files needed:** This handoff only. All code was delivered in session 67.

**Known fix needed:** K1 (admin photo URLs) — if Mike uploads a photo through the deck page and it shows broken in the admin dashboard, upload admin `page.tsx` and I'll add the URL resolution.

---

### Chat B: /play warm-up deck update (multi-teacher support)

**What:** Update the `/play` route to read `warmup_teacher_count` from `admin_settings` and build the 3×3 grid from the correct teachers' active photos. In Solo mode, use the recruiting teacher. In Trio/Full, use top N teachers from rotation.

**Files needed:**
1. This handoff
2. The `/play` route files — likely:
   - `src/app/play/page.tsx`
   - `src/app/play/play-client.tsx` (or similar)
   - Any `loadGenericDeck` or deck-loading utility
   - `src/app/play/actions.ts` (if exists)
3. Schema dump after migration: `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`

**This is the highest-priority build** because the warmup mode selector in the admin dashboard doesn't do anything visible until /play respects it.

---

### Chat C: Student → teacher assignment

**What:** When a student completes the warm-up (favorites a photo + submits), assign them to the teacher who owns that photo. Create enrollment in that teacher's next available class. Handle capacity checks.

**Files needed:**
1. This handoff
2. Whatever file handles warm-up completion / enrollment creation — likely:
   - `src/app/student/play/` files or `spotlight.jsx`
   - Any enrollment creation logic
3. Schema dump (same as Chat B)

**Depends on Chat B** — the /play route needs to know which teacher owns which photo before we can do assignment.

---

### Chat D: Class management + auto-creation

**What:** When a class hits capacity, the system auto-creates the next class for that teacher. Admin can also manually create classes. Teacher's `max_classes` limit is enforced.

**Files needed:**
1. This handoff
2. Admin dashboard files (if class creation UI goes in the admin panel)
3. Schema dump
4. Whatever handles enrollment creation (ties into Chat C)

**Depends on Chat C** — auto-creation triggers when an enrollment would exceed capacity.

---

### Chat E: Admin dashboard polish (after Mike's feedback)

**What:** Any layout, UX, or feature changes Mike wants after testing the admin dashboard. Could include: better photo display, class detail improvements, archive tab implementation, spreadsheet download, stats refinements.

**Files needed:**
1. This handoff
2. `src/app/admin/page.tsx`
3. `src/app/admin/admin-client.tsx`
4. `src/app/admin/actions.ts`

---

### Recommended order

**Chat A** (testing) → **Chat B** (/play update) → **Chat C** (student assignment) → **Chat D** (class management). Chat E (admin polish) can happen anytime after Chat A based on Mike's feedback.

Chats B and C could potentially be combined into one session if the /play files aren't too large. Chat D is a natural follow-on once enrollment works.

---

## Files delivered in session 67

| File | Destination | Status |
|------|-------------|--------|
| `migration-session67.sql` | Run in Supabase SQL Editor | NEW — run once |
| `seed-teachers-v1.sql` | Run in Supabase SQL Editor | NEW — run after setup |
| `page.tsx` (admin) | `src/app/admin/page.tsx` | REPLACE |
| `admin-client.tsx` | `src/app/admin/admin-client.tsx` | REPLACE |
| `actions.ts` (admin) | `src/app/admin/actions.ts` | REPLACE |
| `page.tsx` (deck) | `src/app/teacher/deck/page.tsx` | REPLACE |
| `deck-client.tsx` | `src/app/teacher/deck/deck-client.tsx` | REPLACE |
| `actions.ts` (deck) | `src/app/teacher/deck/actions.ts` | REPLACE |
| `testing-walkthrough-v12.sql` | `sql/testing-walkthrough-v12.sql` | REPLACE |

---

## SQL files reference (current versions)

| File | Purpose | Version |
|------|---------|---------|
| `all-in-one-setup-v5.sql` | Full reset + seed 9 students + game setup | v5 |
| `seed-teachers-v1.sql` | Create 4 test teachers + classes + photos | v1 (NEW) |
| `migration-session67.sql` | Dual-role + admin_settings | NEW (run once) |
| `jump-to-round-1-v5.sql` | Approve + start game at round 1 | v5 |
| `jump-to-round-2-v5.sql` | Simulate round 1, advance to round 2 | v5 |
| `jump-to-round-3-v5.sql` | Simulate rounds 1–2, advance to round 3 | v5 |
| `fast-path-results-v5.sql` | Simulate all rounds, end game | v5 |
| `testing-walkthrough-v12.sql` | Test plan + verification queries | v12 (NEW) |
