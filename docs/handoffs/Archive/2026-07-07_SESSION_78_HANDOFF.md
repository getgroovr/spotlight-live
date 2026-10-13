# Session 78 Handoff

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

## What was delivered in session 78

### Game topics — schema + SQL migration ✅ DONE

New `game_topics` table stores the master list of topic presets. Admin seeds topics; teachers can suggest new ones (status='pending' until admin approves). Unique constraint on `topic_text` prevents duplicates. 20 starter topics seeded.

New `round_topics` jsonb column on `classes` stores per-round topic assignments as a map keyed by round number string: `{"1": "Nature", "2": "Friendship", "3": null}`. Null or missing key = no topic for that round.

**File delivered:** `game-topics-migration.sql` → run in Supabase SQL editor before deploying code

### Game topics — teacher UI ✅ DONE

Per-round topic dropdowns in the class settings header. Each round gets a dropdown with (No topic) + all approved topics. Grid adapts to round count (3 cols for ≤3 rounds, 3 cols for 4–6, 4 cols for 7+). `total_rounds` input is now controlled (was uncontrolled `defaultValue`) so the topic grid reacts instantly when the teacher changes the round count.

"Suggest a topic" link below the grid expands to a text input + Send button. Calls `suggestTopic` server action, which inserts into `game_topics` with `status='pending'`. Teacher sees confirmation; topic appears in all teachers' dropdowns once admin approves.

`saveClassSettings` now reads `round_topics` from formData (JSON hidden input), parses it, and saves to `classes.round_topics`.

**Files delivered:**
- `class-header.tsx` → goes to `src/app/teacher/students/class-header.tsx` (REPLACES)
- `actions_teacher_ss.ts` → goes to `src/app/teacher/students/actions.ts` (REPLACES)
- `page_teacher_ss.tsx` → goes to `src/app/teacher/students/page.tsx` (REPLACES)

### Game topics — class-deck data flow ✅ DONE

`loadClassDeck()` now queries `classes.round_topics` and returns `currentTopic` (topic for the round being played) and `nextRoundTopic` (topic for the round the student will upload a photo for). Both are `string | null`.

**File delivered:** `class-deck.ts` → goes to `src/lib/class-deck.ts` (REPLACES)

---

## Schema changes this session

| Table | Change | Notes |
|-------|--------|-------|
| `game_topics` (NEW) | id, topic_text, status, suggested_by, created_at | status: approved/pending. UNIQUE on topic_text. |
| `classes` | Added `round_topics jsonb` | Per-round topic map. Nullable. |

---

## Remaining topic chunks — NOT YET DELIVERED

The topic feature is partially deployed. The schema, teacher UI, and data flow are done. Three chunks remain before students and admin see topics:

### Chunk 2 — Game engine display (student-facing)

Pass `currentTopic` and `nextRoundTopic` from `loadClassDeck()` through to the game engine. Three display points:

1. **Round splash** (`shell.jsx`): The boxing-match countdown screen says "Round 2 — Nature" instead of just "Round 2" when a topic is set.
2. **Above the 9-pic grid** (`spotlight.jsx`): Centered topic text above the photo grid. Disappears when null.
3. **Upload prompt** (`spotlight.jsx`): When the student uploads their photo for the next round, the topic appears as a separate sentence: "The topic for Round 2 is: Nature." Sentence disappears entirely when null (no awkward blank).

**Files to modify:**
- `shell.jsx` → `src/game/shell.jsx`
- `spotlight.jsx` → `src/game/spotlight.jsx`
- `page_ss_play.tsx` → `src/app/student/play/page.tsx`

**Files needed from Mike:** all three are already uploaded from this session.

### Chunk 3 — Admin topic management

Admin dashboard gets a topic management section. Two parts:

1. **Topic list:** View all topics (approved + pending). Approve or reject teacher suggestions. Add new topics directly. Delete unused topics.
2. **Per-class topic visibility:** In the teacher detail view, show which topics each class has assigned to each round.

**Files to modify:**
- `admin-client.tsx` → `src/app/admin/admin-client.tsx`
- `page_admin.tsx` → `src/app/admin/page.tsx`
- `actions_admin.ts` → `src/app/admin/actions.ts`

**Files needed from Mike:** all three are already uploaded from this session.

### Chunk 4 — Spreadsheet export

Add a "Topic" column to the class spreadsheet export. Each round header row shows the topic if one is set (e.g., "Round 1 — Nature" instead of just "Round 1").

**Files to modify:**
- `route.ts` → `src/app/teacher/students/export/route.ts`

**File needed from Mike:** already uploaded from this session.

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C3 | Test admin ↔ teacher deck interaction | Manual test — not a code task |
| C5 | Messaging — notification notes | Deferred (needs post-session-77 versions of student dashboard, teacher students page, admin page). Teacher page was updated in session 78 (topic additions) — use the session 78 version as the baseline. |
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

1. **Chunk 2 — game engine display** — the student-visible part of topics (splash, grid title, upload prompt). This is what makes the feature real for students.
2. **Chunk 3 — admin topic management** — approve/reject teacher suggestions, see per-class topic assignments.
3. **Chunk 4 — spreadsheet** — topic column in export.
4. **Teacher auth bypass** — still open from session 77.
5. **C5 — Messaging / notification notes** — if time permits.

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
| `classes` | id, teacher_id, name, capacity, round_topics | capacity default 9. **round_topics jsonb NEW session 78** |
| `class_requests` | id, teacher_id, status, requested_at, reviewed_by, reviewed_at, created_class_id | status: pending/approved/denied |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete |
| `game_topics` | id, topic_text, status, suggested_by, created_at | **NEW session 78.** status: approved/pending. UNIQUE on topic_text. |

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
2. Run `game-topics-migration.sql` **(NEW — session 78)**
3. Run `populate-seed-voter-sessions.sql`
4. Run JUMP TO ROUND 1 (**with the approve line added**)
5. Play as Casper2 through round 1 — submit photo + favorite comment
6. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
7. Teacher approves round 1 favorite comment
8. Run JUMP TO ROUND 2 (**with the approve line added**)
9. Play as Casper2 through round 2
10. Repeat for round 3 / awards

**To test topics:** Before step 4, log in as teacher and set round topics via the new dropdowns in the class settings header. Save. Then continue the test flow — topics should appear in the game engine once Chunks 2–3 are deployed.

---

## Teacher spreadsheet overhaul — DEFERRED

Column names now confirmed (`rejection_reason`, `favorite_comment_rejection_reason`). Ready to build when Mike wants it.

---

## Ideas list

1. Admin dashboard — C4 done. Still needs: archived class count, spreadsheet archiving.
2. Messaging — notification notes. Deferred again (playtest fixes took priority).
3. Auto-class-creation — when class hits capacity.
4. Deployment/hosting setup guide.
5. Round gap timing UI.
6. "Party setup" holding page.
7. Incomplete mode selection warnings.
8. Teacher spreadsheet overhaul — deferred, ready to build.
9. **Game topics — Chunks 2/3/4 remaining (session 78).** Schema + teacher UI done. Game engine display, admin management, and spreadsheet export still needed.
