# Session 81 Handoff (v2)

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

## What was delivered in session 81

### Chunk 1 — Teacher students page ✅ DONE
- **Topic locking:** Past-round topic dropdowns are now disabled with "✓" label. Rounds < currentRound are locked.
- **Class dropdown fix:** Selected class always appears in the switcher even if auto-archived. Fixed "0 classes" display bug.
- **Files delivered:**
  - `class-header.tsx` → goes to `src/app/teacher/students/class-header.tsx` (REPLACES)
  - `page_t_ss.tsx` → goes to `src/app/teacher/students/page.tsx` (REPLACES)

### Chunk 3 — Multi-teacher SQL ✅ DONE
- **`multi-teacher-setup.sql`** — Confirms emails without needing real email delivery, sets all three as teachers, sets getgroovr@yahoo.com as admin. Safe to re-run.
- Setup flow: sign up at `/auth/signup` → run SQL in Supabase → log in at `/auth/login`.

---

## Remaining chunks

### Chunk 1.5 — Teacher class request flow (NEW)
**What:** Teachers need a way to name their class, request new classes, and indicate which warmup modes they're willing to participate in.

**Changes:**
1. **Request button always visible** — remove the `atLimit` hidden check. Admin decides yes/no.
2. **Request form adds:** class name field + mode preference checkboxes. Solo is mandatory (no checkbox). Trio and nine are opt-in.
3. **Zero-class state:** Teachers with no classes see the request form instead of "No class found" error.
4. **Mode preferences** saved to `teacher_rotation` (or `profiles`) so admin can see who's available for trio/nine.

**Schema migration needed:**
```sql
-- Add class_name to class_requests
ALTER TABLE class_requests ADD COLUMN class_name varchar(100);

-- Add mode preferences to teacher_rotation
ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false;
ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;
```

**Files needed to start:**
- `src/app/teacher/students/request-class.tsx`
- `src/app/teacher/students/actions.ts`
- (already have `page.tsx` and `class-header.tsx` from Chunk 1)

### Chunk 2 — Admin dashboard overhaul
**What:** Several layout and UX changes:
1. **Merge rotation list with All Teachers table.** The numbered teacher list under MODE is redundant with ALL TEACHERS. Combine into one table with ↑↓ reorder buttons. Non-recruited teachers sort to bottom.
2. **Make teachers section collapsible.**
3. **Remove Decks column** from teacher table. Move deck info into class details.
4. **Enhance Current Classes section.** Each class shows: teacher, topic per round, rounds, duration, student list with email addresses.
5. **Game Topics section** — show existing approved topics (from `game_topics` table), add delete capability.
6. **Mode preference tallies** in overview — how many teachers are willing for trio and nine. (NEW — from Chunk 1.5)
7. **Class request approval** shows the requested class name. (NEW — from Chunk 1.5)
8. **Teacher table** shows each teacher's mode preferences (solo mandatory, trio/nine opt-in). (NEW — from Chunk 1.5)

**File needed:** `src/app/admin/admin-client.tsx`

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

1. **Teacher approval flow in admin UI** — Currently teacher role is set via SQL only. Could add an admin UI to approve/deny teacher role requests. (Surfaced session 81)
2. Auto-class-creation when class hits capacity.
3. Deployment/hosting setup guide.
4. Round gap timing UI.
5. "Party setup" holding page.
6. Incomplete mode selection warnings.

---

## Schema changes this session

```sql
-- Chunk 1.5 migration (run in Supabase SQL Editor)
ALTER TABLE class_requests ADD COLUMN class_name varchar(100);
ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false;
ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;
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
| `teacher_rotation` | teacher_id (unique), sort_order, status, willing_trio, willing_nine | status: recruiting/waiting/paused. Mode prefs NEW session 81. |
| `admin_settings` | id=1, warmup_teacher_count | 1/3/9 |
| `classes` | id, teacher_id, name, capacity, round_topics, is_archived, archived_at | capacity default 9. round_topics jsonb. Auto-archive on game over. |
| `class_requests` | id, teacher_id, status, class_name, requested_at, reviewed_by, reviewed_at, created_class_id | status: pending/approved/denied. class_name NEW session 81. |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete |
| `game_topics` | id, topic_text, status, suggested_by, created_at | status: approved/pending. UNIQUE on topic_text. |
| `messages` | id, sender_id, recipient_id, body, is_read, created_at | Used by MessagePanel across all dashboards. |

---

## Multi-teacher testing setup

Test emails: `getgroovr@yahoo.com` (admin + teacher), `getgroovr-1@yahoo.com` (teacher), `getgroovr-2@yahoo.com` (teacher).

**Setup flow (no real email needed):**
1. Sign up each email at `localhost:3000/auth/signup` with any password
2. Run `multi-teacher-setup.sql` in Supabase SQL Editor (confirms emails + sets roles)
3. Log in at `localhost:3000/auth/login`

Use separate browsers or incognito for simultaneous sessions.

---

## Test workflow with v8 (step by step)

1. Run `all-in-one-setup-v8.sql` (creates everything fresh)
2. Run `game-topics-migration.sql` (session 78)
3. Run class archiving migration: `ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false; ALTER TABLE classes ADD COLUMN archived_at timestamptz;` (session 79)
4. Run Chunk 1.5 migration (session 81 — see schema changes above)
5. Run `populate-seed-voter-sessions.sql`
6. Run JUMP TO ROUND 1 (**with the approve line added**)
7. Play as Casper2 through round 1 — submit photo + favorite comment
8. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
9. Teacher approves round 1 favorite comment
10. Run JUMP TO ROUND 2 (**with the approve line added**)
11. Play as Casper2 through round 2
12. Repeat for round 3 / awards

**To test topics:** Before step 6, log in as teacher and set round topics via the dropdowns. Save. Topics should appear in round splash, above grid, and in upload prompt.

**To test topic locking:** Start a game, advance to round 2. On teacher page, Round 1 topic dropdown should be disabled with ✓. Round 2 and 3 remain editable.

**To test archiving:** After awards, teacher students page should auto-archive on page load. If timing isn't elapsed, use manual "Archive this class" button.

**To test messaging:** On any dashboard, click "✉ Messages." Send teacher → student, verify on student side. Reply student → teacher, verify. Test admin ↔ teacher similarly.

**To test class requests (NEW):** Log in as a teacher. Click "Request new class." Fill in class name + mode preferences. Submit. Log in as admin and verify the request appears with the class name. Approve it. Teacher should see the new class in their dropdown.

**To test admin dashboard (NEW):** Log in as admin. Verify merged teacher table with ↑↓ buttons. Expand/collapse teachers section. Check class details show students + emails. Verify game topics list shows approved topics with delete option. Check mode preference tallies in overview.
