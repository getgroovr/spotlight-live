# Session 81 Handoff

Date: 2026-07-09

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

- **Auto-archive on game completion** — `src/app/teacher/students/page.tsx`
- **Game engine topic display** — confirmed in `shell.jsx`, `spotlight.jsx`, `page_ss_play.tsx`
- **Messaging verification** — confirmed across all dashboards

---

## Session 81 issues (from Mike's playtest)

### Issue A — Lock past round topics on teacher page
**What:** Teacher can currently change the topic for Round 1 even when the game is on Round 2. Past-round topic dropdowns should be disabled/read-only so the display reflects how the game was actually played.
**File needed:** `src/app/teacher/students/page.tsx`

### Issue B — Admin dashboard overhaul
**What:** Several layout and UX changes:
1. **Merge rotation list with All Teachers table.** The numbered teacher list under MODE (with waiting/recruit badges) is redundant with the ALL TEACHERS table below. Combine into one table. Move the ↑↓ reorder buttons into the merged table. Non-recruited teachers sort to the bottom.
2. **Make the teachers section collapsible** — button to expand/collapse.
3. **Remove Decks column** from the teachers table. Move deck info into the class details view instead.
4. **Enhance Current Classes section.** Each class should show: teacher, topic per round, rounds, duration, and a student list with student email addresses.
5. **Game Topics section** — should display existing approved topics (from `game_topics` table), not just "0 starter topics." Add ability to remove/delete topics.
**File needed:** `src/app/admin/admin-client.tsx`

### Issue C — Current class dropdown styling
**What:** The "Current class:" dropdown at the top of the teacher page shows a mostly-empty box with a faint line. Cosmetic issue — may just need better default/placeholder text or styling when there's only one class.
**File needed:** `src/app/teacher/students/page.tsx`

### Issue D — Multi-teacher SQL setup
**What:** The setup SQLs in the handoff only handle one teacher at a time. Update to handle all three test emails (`getgroovr@yahoo.com`, `getgroovr-1@yahoo.com`, `getgroovr-2@yahoo.com`) in one script. Set `getgroovr@yahoo.com` as admin, all three as teachers.
**File needed:** SQL only (no app file)

---

## Testing chunks (sorted by file)

### Chunk 1 — Teacher students page (Issues A + C)
**File to upload:** `src/app/teacher/students/page.tsx`

Delivers:
- Lock topic dropdowns for past rounds (Issue A)
- Fix current-class dropdown styling (Issue C)

### Chunk 2 — Admin dashboard overhaul (Issue B)
**File to upload:** `src/app/admin/admin-client.tsx`

Delivers:
- Merge rotation list + All Teachers into one table with ↑↓ buttons
- Collapsible teachers section
- Remove Decks column
- Enhanced class details (topics, rounds, duration, students + emails)
- Game Topics: show existing approved topics, add delete capability

This is the biggest chunk. May need to split further after seeing the file.

### Chunk 3 — Multi-teacher SQL (Issue D)
**No file upload needed.** Claude writes the SQL.

Delivers:
- Single SQL block that sets all three emails as teachers and one as admin

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C3 | Test admin ↔ teacher deck interaction | Manual test — not a code task |
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

1. **Teacher approval flow in admin UI** — Currently teacher role is set via SQL only. Could add an admin UI to approve/deny teacher role requests. (NEW — surfaced session 81)
2. Auto-class-creation when class hits capacity.
3. Deployment/hosting setup guide.
4. Round gap timing UI.
5. "Party setup" holding page.
6. Incomplete mode selection warnings.

---

## Schema changes this session

None.

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
| `classes` | id, teacher_id, name, capacity, round_topics, is_archived, archived_at | capacity default 9. round_topics jsonb. Auto-archive on game over. |
| `class_requests` | id, teacher_id, status, requested_at, reviewed_by, reviewed_at, created_class_id | status: pending/approved/denied |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete |
| `game_topics` | id, topic_text, status, suggested_by, created_at | status: approved/pending. UNIQUE on topic_text. |
| `messages` | id, sender_id, recipient_id, body, is_read, created_at | Used by MessagePanel across all dashboards. |

---

## Multi-teacher testing setup

Test emails: `getgroovr@yahoo.com` (admin + teacher), `getgroovr-1@yahoo.com` (teacher), `getgroovr-2@yahoo.com` (teacher).

After all three sign in via magic link at `/auth/login`, run this SQL once:

```sql
-- Set all three as teachers and one as admin
UPDATE profiles SET role = 'teacher'
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN ('getgroovr@yahoo.com', 'getgroovr-1@yahoo.com', 'getgroovr-2@yahoo.com')
);

UPDATE profiles SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'getgroovr@yahoo.com'
);
```

Use separate browsers or incognito for simultaneous sessions.

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

**To test topics:** Before step 5, log in as teacher and set round topics via the dropdowns. Save. Topics should appear in round splash, above grid, and in upload prompt.

**To test archiving:** After awards, teacher students page should auto-archive on page load. If timing isn't elapsed, use manual "Archive this class" button. Class moves to "Archived classes" section. Spreadsheet download works from there.

**To test messaging:** On any dashboard, click "✉ Messages." Send teacher → student, verify on student side. Reply student → teacher, verify. Test admin ↔ teacher similarly.

**To test topic locking (NEW):** Start a game, advance to round 2. On teacher page, Round 1 topic dropdown should be disabled. Round 2 and 3 should remain editable.

**To test admin dashboard (NEW):** Log in as admin. Verify merged teacher table with ↑↓ buttons. Expand/collapse teachers section. Check class details show students + emails. Verify game topics list shows approved topics with delete option.
