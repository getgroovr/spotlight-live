# SESSION 66 HANDOFF — 6/29/2026

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

## What happened in sessions 65–66

### Admin system — schema + dashboard MVP (session 65)

Migration delivered and run successfully (two-part due to Postgres enum transaction limitation):

**Script 1:** `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';`

**Script 2:** Everything else — new columns, table, function, RLS policies.

**New columns on existing tables:**

| Table | Column | Type | Default | Purpose |
|-------|--------|------|---------|---------|
| `profiles` | `max_classes` | `integer NOT NULL` | `1` | Admin-set limit on how many classes a teacher can have |
| `classes` | `capacity` | `integer NOT NULL` | `9` | Max students per class (matches 3×3 grid) |
| `entries` | `is_active` | `boolean NOT NULL` | `false` | Which warm-up photos are currently in the deck |

**New table: `teacher_rotation`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `teacher_id` | `uuid NOT NULL` | FK → `profiles.id`, unique constraint |
| `sort_order` | `integer NOT NULL` | Admin controls ordering |
| `status` | `text NOT NULL` | `'recruiting'` / `'waiting'` / `'paused'` (CHECK constraint) |
| `created_at` | `timestamptz` | `now()` |

**New function:** `is_admin()` — checks `profiles.role = 'admin'`. Used in RLS policies.

**RLS policies added:**
- `teacher_rotation`: admin full access, teacher reads own row
- `classes`: admin reads all, admin updates all
- `enrollments`: admin reads all
- `profiles`: admin updates all
- `entries`: admin reads all, admin updates all

**Migration also:** back-filled `is_active = true` on all existing live starters so the current warm-up deck kept working.

### Admin dashboard MVP (session 65)

Three files delivered and deployed to `src/app/admin/`:

| File | Purpose |
|------|---------|
| `page.tsx` | Server component — auth check, data fetching, stats strip |
| `admin-client.tsx` | Client component — teacher roster, rotation queue, interactive controls |
| `actions.ts` | Server actions — updateMaxClasses, addToRotation, removeFromRotation, setRotationStatus, moveInRotation, togglePhotoActive |

Dashboard currently shows:
- Stats strip: teachers, students, classes, recruiting status
- Rotation queue: ordered list with ▲/▼, Recruit/Stop/Pause/Remove
- Teacher roster: all teachers with class count, max_classes editor, + Rotation button

### Bug bash audit (session 66)

Reviewed all Option B bugs against the actual uploaded code. **All were already implemented in prior sessions** (58–63). The handoff's bug table was stale:

| Bug | Status | Evidence |
|-----|--------|----------|
| B48 | CLOSED | `spotlight.jsx` lines 597–762: celebration screen, locked favorites |
| B49 | CLOSED | `spotlight.jsx` lines 796–854: comment locks on first save |
| B64 | CLOSED | `pending-queue.tsx` line 16: whyFavorite field not rendered |
| B41 | CLOSED | `page_-_teacher_students.tsx` lines 226–241: createSignedUrl from media bucket |
| B55 | CLOSED | `spotlight.jsx` line 735/748: "Back to your dashboard →" |
| U2 | CLOSED | `spotlight.jsx` lines 895–926: button-style "📷 Choose a photo" |
| U3 | CLOSED | `spotlight.jsx` line 897: file input hidden when preview showing |
| U1 | OPEN | Favorite confirmation text — Mike hasn't provided exact wording yet |

### Known issues discovered

1. **Dual-role problem.** Mike's account was changed from `role='teacher'` to `role='admin'`. This broke the deck page ("Teacher access only") and caused the admin dashboard to show 0 teachers. The teacher students page still works because it checks `teacher_id` against the user's classes, not the role.

2. **Admin dashboard shows 0 teachers.** Because Mike was the only teacher and his role is now 'admin'.

3. **No teacher seeding.** The current test SQL seeds 9 students but only 1 teacher (Mike's real account). For multi-teacher testing, we need seed teachers.

---

## Architecture decision: dual role (admin + teacher)

### The problem

Right now `profiles.role` is an enum with one value per user: `'student'`, `'teacher'`, or `'admin'`. Changing Mike to admin broke all teacher-facing pages that check `role = 'teacher'`. We need people who are BOTH admin AND teacher.

### The fix: `is_admin` boolean overlay

Instead of using the `'admin'` enum value, add a boolean `is_admin` column to profiles. This way:
- Mike stays `role = 'teacher'` — all teacher checks keep working
- `is_admin = true` gives admin privileges on top
- The `is_admin()` Postgres function gets updated to check the boolean instead of the role
- No need to update any teacher-facing pages — they already work
- Admin-only pages check `is_admin()` which reads the new boolean

**Migration needed:**

```sql
-- Add the boolean column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Change Mike back to teacher + flip the admin flag
UPDATE profiles SET role = 'teacher', is_admin = true
WHERE role = 'admin';

-- Update the is_admin() function to use the boolean
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_admin = true
  );
$$;
```

After this, `role = 'admin'` is effectively retired — we won't use the enum value going forward. The boolean is the source of truth.

---

## Admin dashboard — full design

### Layout: teacher-centric view

The admin dashboard should be a teacher-focused management panel:

**Top bar:** Stats strip (total teachers, total students, total classes, active warm-up config)

**Main area — two panels:**

1. **Teacher selector** (dropdown at top) — pick a teacher to inspect/manage
2. **Selected teacher detail** — everything about that teacher:
   - Display name, max_classes setting (editable), rotation status
   - **Classes tab:** dropdown to pick a class → class info (name, rounds, duration, capacity, student count, game status) → student list for that class
   - **Deck tab:** teacher's warm-up photos with active/inactive toggles, photo count
   - **Archive tab:** past/completed classes with summary info + spreadsheet download

**Sidebar or bottom section — warm-up controls:**

- Current warm-up config: 1 / 3 / 9 teachers
- Which teacher(s) are active in the warm-up right now
- Rotation queue with ordering

### Multi-teacher warm-up config

The admin sets the warm-up mode. This determines how the 3×3 grid fills:

| Mode | Teachers in grid | Photos per teacher | Student picks teacher by |
|------|------------------|--------------------|--------------------------|
| Solo (1) | 1 | 9 | Auto-joins (only one teacher) |
| Trio (3) | 3 | 3 each | Favoriting one of the teacher's photos |
| Full (9) | 9 | 1 each | Favoriting the teacher's photo |

**Database:** Add a `warmup_config` row to a new settings table (or a single-row `admin_settings` table):

```
admin_settings:
  id: 1 (singleton)
  warmup_teacher_count: 1 | 3 | 9
  updated_at: timestamptz
```

The system uses `warmup_teacher_count` to decide how many teachers' photos to activate and how many photos each teacher gets. In Solo mode (MVP), the recruiting teacher gets all 9 active slots. In Trio mode, the top 3 teachers in rotation each get 3. In Full mode, 9 teachers each get 1.

### Teacher seeding

Need to create 3–9 fake teacher accounts for testing. Pattern mirrors student seeding:
- Create auth users (via `admin.auth.admin.createUser` or direct `auth.users` inserts)
- Create profiles with `role = 'teacher'`
- Create classes for each teacher
- Upload starter photos for each teacher
- Add some to the rotation queue

This should be a standalone SQL file (`seed-teachers-v1.sql`) that can run after `all-in-one-setup-v5.sql`.

---

## Open bugs — updated status

| # | Description | Priority | Status |
|---|---|---|---|
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | Open — Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B54 | Completed round section on dashboard should collapse/minimize | LOW | Open — may already be done (uses `<details>`) |

### Closed since session 64

| # | Description | Closed in |
|---|---|---|
| B48 | Lock favorites after next-round photo upload | Session 58 |
| B49 | Comment editing rules — favorite locks on submit | Session 58 |
| B64 | Remove "WHY IT'S MY FAVORITE" from teacher review card | Pre-session 65 |
| B41 | Photo preview in teacher review card | Session 63 (#34 FIX) |
| B55 | After replaying completed round → "Back to dashboard" | Session 58 |
| U2 | Upload button more prominent | Session 58 |
| U3 | Hide raw filename once preview showing | Session 58 |

---

## Ideas list

1. **Admin dashboard** — IN PROGRESS. See "Admin dashboard — full design" above.
2. **Student → teacher messaging** — button in student profile to message the teacher
3. **Student → admin messaging** — separate button to message the admin/support
4. **Auto-class-creation** — when class hits capacity, system auto-creates next class. TIES INTO admin rotation system.
5. **Teacher sets desired number of classes** — "I want 4 classes" → admin approves limit → rotation fills sequentially
6. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough
7. **Round gap timing UI** — student-facing countdown for submission deadline; teacher-facing review window
8. **"Party setup" holding page** — after final round, students see countdown to results reveal
9. **Tie-handling in awards** — with 9 students, ties are common. May need tie-breaking or "shared gold" display.
10. **Awards ceremony timing polish** — Mike may want to adjust reveal durations, podium sizing, or add sound effects after live testing.
11. **Multi-teacher warm-up game** — NOW PART OF ADMIN DASHBOARD DESIGN. 1/3/9 teachers in one warm-up round, students pick their teacher by favoriting.
12. **Teacher rotation system** — NOW PART OF ADMIN DASHBOARD DESIGN. Admin-controlled ordered list with auto-rotation on class fill.

---

## NEXT SESSION (67): Admin Dashboard Build-Out

### Step 1: Dual-role migration (small, do first)

Run the migration to add `is_admin` boolean, change Mike back to teacher, update `is_admin()` function. This unblocks the deck page and makes the teacher show up in the admin dashboard.

**Files needed:** Just this handoff. Migration SQL will be provided.

### Step 2: Teacher seeding SQL

Write `seed-teachers-v1.sql` that creates 3–4 fake teacher accounts with profiles, classes, and starter photos. Runs after `all-in-one-setup-v5.sql`. May need to update the all-in-one script to be aware of multiple teachers, or keep it as a separate additive script.

**Files needed:** This handoff + `all-in-one-setup-v5.sql` (for reference on the seeding pattern).

### Step 3: Admin settings table + warmup config

Create `admin_settings` table with `warmup_teacher_count` (1/3/9). Write the migration. This feeds the dashboard UI for selecting warmup mode.

**Files needed:** Just this handoff.

### Step 4: Admin dashboard rebuild

Rebuild the admin dashboard with the teacher-centric layout:
- Teacher dropdown selector
- Selected teacher detail panel (classes, deck photos, archive)
- Warm-up controls (mode selector, active teacher(s), rotation queue)
- Class detail view with student list and game info

**Files needed:**
1. This handoff
2. `src/app/admin/page.tsx` (current — will be replaced)
3. `src/app/admin/admin-client.tsx` (current — will be replaced)
4. `src/app/admin/actions.ts` (current — will be replaced)

### Step 5: Deck page rebuild (if time)

Replace the hardcoded `DEMO_CLASS_ID` / `is_public` logic in the teacher deck. Each teacher manages their own photo pool. Active/inactive toggle per photo. The warm-up deck pulls active photos based on admin's warmup config.

**Files needed:**
1. This handoff
2. `src/app/teacher/deck/page.tsx`
3. `src/app/teacher/deck/actions.ts`
4. `src/app/teacher/deck/deck-client.tsx`

### Recommended flow

Steps 1–3 are quick migrations (one session). Step 4 is the bulk of the work. Step 5 can be deferred to session 68 if the dashboard takes the full session. Steps 1–3 should be done first because they unblock testing.

---

## Files delivered in sessions 65–66

| File | Destination | Action |
|------|-------------|--------|
| `migration_admin_system.sql` | Run in Supabase SQL Editor (two parts) | DONE |
| `admin-page.tsx` | `src/app/admin/page.tsx` | DONE — will be rebuilt |
| `admin-client.tsx` | `src/app/admin/admin-client.tsx` | DONE — will be rebuilt |
| `admin-actions.ts` | `src/app/admin/actions.ts` | DONE — will be rebuilt |

---

## Files to upload at the start of next session

1. This handoff
2. `all-in-one-setup-v5.sql` (for teacher seeding reference)
3. `src/app/admin/page.tsx` (current version to rebuild)
4. `src/app/admin/admin-client.tsx` (current version to rebuild)
5. `src/app/admin/actions.ts` (current version to rebuild)
6. Schema dump (re-run after dual-role migration): `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`

---

## SQL files reference (current versions)

| File | Purpose | Version |
|------|---------|---------|
| `all-in-one-setup-v5.sql` | Full reset + seed 9 students + game setup | v5 |
| `jump-to-round-1-v5.sql` | Approve + start game at round 1 | v5 |
| `jump-to-round-2-v5.sql` | Simulate round 1, advance to round 2 | v5 |
| `jump-to-round-3-v5.sql` | Simulate rounds 1–2, advance to round 3 | v5 |
| `fast-path-results-v5.sql` | Simulate all rounds, end game | v5 |
| `testing-walkthrough-v11.sql` | Test plan + verification queries | v11 |
| `seed-teachers-v1.sql` | **NEW — to be written** | — |
