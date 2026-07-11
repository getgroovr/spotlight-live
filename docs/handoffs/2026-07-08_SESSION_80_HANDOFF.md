# Session 80 Handoff

Date: 2026-07-08

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

## What was delivered in session 80

### Auto-archive on game completion ✅ DONE

Added ~18 lines to `getPageData()` in the teacher students page. After fetching classes, it loops through non-archived ones, builds a `ClassTiming` object, and checks `isGameOver()`. If the game is over, it fires an update to set `is_archived = true` and `archived_at = now`. The local object is also mutated so the page render reflects the change immediately — no second page load needed.

**File delivered:** `page_t_ss.tsx` → goes to `src/app/teacher/students/page.tsx` (REPLACES)

### Chunk 2 — Game engine display (student-facing topics) ✅ DONE

All three files were confirmed complete from the prior session. Topics now display in three places:

1. **Round splash** (`shell.jsx`): Topic appears below the round number on the placard in warm gold text.
2. **Above the 9-pic grid** (`spotlight.jsx`): "Topic: {currentTopic}" label centered above the photo grid.
3. **Upload prompt** (`spotlight.jsx`): "The topic for Round {N} is: {topic}." appended to the upload instructions.

**Files confirmed ready (no changes needed — deploy as-is from session 79):**
- `shell.jsx` → goes to `src/game/shell.jsx` (REPLACES)
- `spotlight.jsx` → goes to `src/game/spotlight.jsx` (REPLACES)
- `page_ss_play.tsx` → goes to `src/app/student/play/page.tsx` (REPLACES)

### C5 — Messaging ✅ DONE (verified, not new code)

Verified MessagePanel is fully wired up on all three dashboards:

- **Student dashboard** (`src/app/student/dashboard/page.tsx`): warm theme. Students can message their teacher and admins. No student-to-student messaging.
- **Teacher students page** (`src/app/teacher/students/page.tsx`): warm theme. Teachers can message individual students, all students in a class, or admin.
- **Admin dashboard** (`src/app/admin/admin-client.tsx`): dark theme. Admin can message teachers.

MessagePanel component (`src/components/MessagePanel.tsx`) features: inbox + sent views, unread badge with count, mark-all-read on open, recipients grouped by role (admin/teacher/student), send-to-all checkbox, 280 char limit, escape to close, warm/dark theme support.

---

## Schema changes this session

None. (Auto-archive uses the `is_archived` and `archived_at` columns added in session 79.)

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C3 | Test admin ↔ teacher deck interaction | Manual test — not a code task |
| C5 | Messaging — notification notes | ✅ DONE — verified session 80 |
| C6 | Teacher comment prompts (game_prompts table) | Deferred — Mike confirmed defer in session 78. Lower priority. |

---

## Playtest punch list (updated)

No changes from session 77. All items remain at their prior status.

| # | Description | Priority | Status |
|---|---|---|---|
| P1–P18 | (see session 77 handoff) | | All ✅ DONE or DROPPED |

---

## Open bugs (updated)

| # | Description | Priority | Status |
|---|---|---|---|
| NEW | Teacher login bypasses auth (no magic link required) | HIGH | Needs investigation — upload middleware.ts + supabase-server.ts |
| NEW | Verify resubmitEntry handles optional photo | MEDIUM | Mike to check `src/app/play/actions.ts` |
| NEW | Verify game flow handles pre-existing entries for next round | MEDIUM | Mike to test after adding JUMP TO approve lines |
| U1 | Update favorite confirmation text to Mike's wording | LOW | Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |

---

## NEXT SESSION priorities

1. **Teacher auth bypass** — still open from session 77. Upload `middleware.ts` + `supabase-server.ts` for investigation.
2. **C3 — Test admin ↔ teacher deck interaction** — manual test, Mike to report results.
3. **C6 — Teacher comment prompts** — if Mike wants to pick this up.
4. **Open bugs** — resubmitEntry, pre-existing entries, U1 copy, B11.

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
| `classes` | id, teacher_id, name, capacity, round_topics, is_archived, archived_at | capacity default 9. round_topics jsonb (session 78). is_archived + archived_at (session 79). Auto-archive on game over (session 80). |
| `class_requests` | id, teacher_id, status, requested_at, reviewed_by, reviewed_at, created_class_id | status: pending/approved/denied |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete |
| `game_topics` | id, topic_text, status, suggested_by, created_at | status: approved/pending. UNIQUE on topic_text. |
| `messages` | id, sender_id, recipient_id, body, is_read, created_at | Session 77. Used by MessagePanel across all dashboards. |

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
3. Run class archiving migration: `ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false; ALTER TABLE classes ADD COLUMN archived_at timestamptz;` (session 79)
4. Run `populate-seed-voter-sessions.sql`
5. Run JUMP TO ROUND 1 (**with the approve line added**)
6. Play as Casper2 through round 1 — submit photo + favorite comment
7. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
8. Teacher approves round 1 favorite comment
9. Run JUMP TO ROUND 2 (**with the approve line added**)
10. Play as Casper2 through round 2
11. Repeat for round 3 / awards

**To test topics:** Before step 5, log in as teacher and set round topics via the new dropdowns in the class settings header. Save. Then continue the test flow — topics should appear in the round splash, above the grid, and in the upload prompt.

**To test archiving:** After awards, go to teacher students page — class should auto-archive on page load (session 80). If it doesn't auto-archive (e.g. game timing isn't fully elapsed), use the manual "Archive this class" button. Either way, class moves to the "Archived classes" section at bottom. Spreadsheet download still works from there. Admin dashboard should show the class as archived with an Unarchive button.

**To test messaging:** On any dashboard, click the "✉ Messages" button. Send a message from teacher to a student, then switch to the student browser and verify it appears with an unread badge. Reply from the student side and verify the teacher sees it. Test admin ↔ teacher messaging similarly.

---

## Ideas list

1. Admin dashboard — C4 done. ✅ Archived class count done (session 79). Spreadsheet archiving → on-demand generation from archived classes (no stored snapshots needed).
2. ✅ Messaging — notification notes. DONE (session 77, verified session 80).
3. Auto-class-creation — when class hits capacity.
4. Deployment/hosting setup guide.
5. Round gap timing UI.
6. "Party setup" holding page.
7. Incomplete mode selection warnings.
8. ✅ Teacher spreadsheet overhaul — DONE (session 79).
9. ✅ Game topics — DONE. Schema + teacher UI + admin management + spreadsheet export (sessions 78–79) + game engine display (session 79/80).
10. ✅ Class archiving — DONE. Manual archive/unarchive (session 79) + auto-archive on game completion (session 80).
