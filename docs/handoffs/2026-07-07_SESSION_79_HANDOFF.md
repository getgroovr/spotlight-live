# Session 79 Handoff

Date: 2026-07-07

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

## What was delivered in session 79

### Teacher spreadsheet — comprehensive overhaul ✅ DONE

Rebuilt `route.ts` from the lean 2-column "language review" format into a full language record matching student spreadsheet completeness. Now includes:

- Teacher's warm-up photos section (photo descriptions)
- Per-student photo submissions with status + teacher note (rejection_reason)
- Per-student game comments with favorites + favorite comments
- Favorite comment status + rejection reason when not approved
- Topics on round headers ("Round 1 — Nature")
- Reads `classes.round_topics` jsonb for topic display
- 5 columns instead of 2

**File delivered:** `route.ts` → goes to `src/app/teacher/students/export/route.ts` (REPLACES)

### Student spreadsheet — topic support ✅ DONE

Added `roundTopics` prop to csv-button. Round headers now show topic when set ("Round 1 — Nature"). Backward compatible — prop defaults to empty object.

**Files delivered:**
- `csv-button.tsx` → goes to `src/app/student/dashboard/csv-button.tsx` (REPLACES)
- `page-dash.tsx` → goes to `src/app/student/dashboard/page.tsx` (REPLACES)

### Class archiving — schema + teacher + admin UI ✅ DONE

Schema migration run by Mike in Supabase SQL editor:
```sql
ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE classes ADD COLUMN archived_at timestamptz;
```

Teacher side: active classes show in class tabs. Below the class settings header: "Download class spreadsheet" link + "Archive this class" link (with confirmation). Archived classes appear at bottom in collapsible "Archived classes" section with download spreadsheet link + Unarchive button.

Admin side: Classes tab splits active/archived with divider. Each class has Archive/Unarchive button in expanded detail view. Archived classes show "archived" badge and dimmed styling.

**Files delivered:**
- `page_teach_ss.tsx` → goes to `src/app/teacher/students/page.tsx` (REPLACES)
- `actions_teacher_ss.ts` → goes to `src/app/teacher/students/actions.ts` (REPLACES)
- `archive-class-button.tsx` → goes to `src/app/teacher/students/archive-class-button.tsx` (NEW)
- `actions_admin.ts` → goes to `src/app/admin/actions.ts` (REPLACES)
- `admin-client.tsx` → goes to `src/app/admin/admin-client.tsx` (REPLACES)
- `page_admin.tsx` → goes to `src/app/admin/page.tsx` (REPLACES)

### Admin setup — confirmed from handoff

Setting admin role is done via SQL after the user signs in via magic link:

```sql
UPDATE profiles SET is_admin = true WHERE id = (
  SELECT id FROM auth.users WHERE email = 'getgroovr@yahoo.com'
);
```

Teacher roles set the same way:

```sql
UPDATE profiles SET role = 'teacher' WHERE id = (
  SELECT id FROM auth.users WHERE email = 'getgroovr-1@yahoo.com'
);
```

---

## Schema changes this session

| Table | Change | Notes |
|-------|--------|-------|
| `classes` | Added `is_archived boolean NOT NULL DEFAULT false` | Manual + (future) auto archiving |
| `classes` | Added `archived_at timestamptz` | Nullable. Set when archived. |

---

## Remaining work — NOT YET DELIVERED

### Auto-archive on game completion

Mike wants classes to auto-archive when the game finishes. Currently archiving is manual only. The cleanest approach: in the teacher students page `getPageData()`, after fetching classes, check each with `isGameOver()` — if the game is over and `is_archived` is false, update it. This piggybacks on the existing timing logic and doesn't require finding a separate "end game" trigger.

**Files to modify:**
- `page_teach_ss.tsx` → `src/app/teacher/students/page.tsx` (small addition to `getPageData()`)

**Files needed from Mike:** already delivered this session — use the session 79 version.

### Chunk 2 — Game engine display (student-facing topics)

Pass `currentTopic` and `nextRoundTopic` from `loadClassDeck()` through to the game engine. Three display points:

1. **Round splash** (`shell.jsx`): "Round 2 — Nature" instead of just "Round 2"
2. **Above the 9-pic grid** (`spotlight.jsx`): Centered topic text above the photo grid
3. **Upload prompt** (`spotlight.jsx`): "The topic for Round 2 is: Nature."

**Files to modify:**
- `shell.jsx` → `src/game/shell.jsx`
- `spotlight.jsx` → `src/game/spotlight.jsx`
- `page_ss_play.tsx` → `src/app/student/play/page.tsx`

**Files needed from Mike:** all three.

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C3 | Test admin ↔ teacher deck interaction | Manual test — not a code task |
| C5 | Messaging — notification notes | Deferred (needs post-session-77 versions of student dashboard, teacher students page, admin page). Teacher page was updated in sessions 78+79. |
| C6 | Teacher comment prompts (game_prompts table) | Deferred — Mike confirmed defer in session 78. Lower priority than topics. |

---

## Playtest punch list (updated)

No changes from session 77. All items remain at their prior status.

| # | Description | Priority | Status |
|---|---|---|---|
| P1–P18 | (see session 77 handoff) | | All ✅ DONE or DROPPED |

---

## Open bugs (updated)

No changes from session 77. All items carried forward.

| # | Description | Priority | Status |
|---|---|---|---|
| NEW | Teacher login bypasses auth (no magic link required) | HIGH | Needs investigation — upload middleware.ts + supabase-server.ts |
| NEW | Verify resubmitEntry handles optional photo | MEDIUM | Mike to check `src/app/play/actions.ts` |
| NEW | Verify game flow handles pre-existing entries for next round | MEDIUM | Mike to test after adding JUMP TO approve lines |
| U1 | Update favorite confirmation text to Mike's wording | LOW | Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |

---

## NEXT SESSION priorities

1. **Auto-archive** — small addition to teacher students page so completed games auto-archive.
2. **Chunk 2 — game engine display** — the student-visible part of topics (splash, grid title, upload prompt). This is what makes the feature real for students.
3. **Teacher auth bypass** — still open from session 77.
4. **C5 — Messaging / notification notes** — if time permits.

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
| `teacher_rotation` | teacher_id (unique), sort_order, status | status: recruiting/waiting/paused |
| `admin_settings` | id=1, warmup_teacher_count | 1/3/9 |
| `classes` | id, teacher_id, name, capacity, round_topics, is_archived, archived_at | capacity default 9. round_topics jsonb (session 78). **is_archived + archived_at NEW session 79.** |
| `class_requests` | id, teacher_id, status, requested_at, reviewed_by, reviewed_at, created_class_id | status: pending/approved/denied |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete |
| `game_topics` | id, topic_text, status, suggested_by, created_at | status: approved/pending. UNIQUE on topic_text. |

---

## Multi-teacher testing setup (carried forward)

Mike plans to test with `getgroovr-1@yahoo.com` and `getgroovr-2@yahoo.com` as teachers, one of the three emails as admin. Magic links auto-create auth users on first sign-in. After first login, set role and is_admin via SQL:

```sql
-- After getgroovr-1@yahoo.com signs in via magic link:
UPDATE profiles SET role = 'teacher' WHERE id = (
  SELECT id FROM auth.users WHERE email = 'getgroovr-1@yahoo.com'
);

-- Make whichever email you want as admin:
UPDATE profiles SET is_admin = true WHERE id = (
  SELECT id FROM auth.users WHERE email = 'getgroovr@yahoo.com'
);
```

Use a second browser or incognito for simultaneous sessions.

---

## Test workflow with v8 (step by step)

1. Run `all-in-one-setup-v8.sql` (creates everything fresh)
2. Run `game-topics-migration.sql` (session 78)
3. Run class archiving migration: `ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false; ALTER TABLE classes ADD COLUMN archived_at timestamptz;` **(NEW — session 79)**
4. Run `populate-seed-voter-sessions.sql`
5. Run JUMP TO ROUND 1 (**with the approve line added**)
6. Play as Casper2 through round 1 — submit photo + favorite comment
7. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
8. Teacher approves round 1 favorite comment
9. Run JUMP TO ROUND 2 (**with the approve line added**)
10. Play as Casper2 through round 2
11. Repeat for round 3 / awards

**To test topics:** Before step 5, log in as teacher and set round topics via the new dropdowns in the class settings header. Save. Then continue the test flow — topics should appear in the game engine once Chunk 2 is deployed.

**To test archiving:** After awards, go to teacher students page — class should appear in the main tab. Click "Archive this class" → confirm → class moves to the "Archived classes" section at the bottom. Spreadsheet download still works from there. Admin dashboard should show the class as archived with an Unarchive button.

---

## Ideas list

1. Admin dashboard — C4 done. ✅ Archived class count done (session 79). Spreadsheet archiving → on-demand generation from archived classes (no stored snapshots needed).
2. Messaging — notification notes. Deferred again (playtest fixes took priority).
3. Auto-class-creation — when class hits capacity.
4. Deployment/hosting setup guide.
5. Round gap timing UI.
6. "Party setup" holding page.
7. Incomplete mode selection warnings.
8. ✅ Teacher spreadsheet overhaul — DONE (session 79). Comprehensive 5-column format with topics.
9. **Game topics — Chunk 2 remaining.** Schema + teacher UI + admin management + spreadsheet export all done. Only game engine display (student-facing) remains.
10. ✅ Class archiving — DONE (session 79). Manual archive/unarchive on teacher + admin dashboards. Auto-archive on game completion is next.
