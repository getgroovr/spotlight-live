# 2026-06-14 Slice 1 Handoff #40

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT CHAT" section for the suggested flow.

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
14. **Workflow: request files in chunks Claude can complete independently.** 2–3 chunks per chat before next handoff.
15. **Use full destination paths when referencing files.** Don't make Mike guess which directory a file goes in.
16. **Group all confirmation / direction / testing questions at the END of a task block.** Don't stall with single questions mid-flow — batch them so Mike can answer all at once and provide testing feedback on a larger set of modifications.

---

## KEY CONCEPT: Warm-up Round vs Student Rounds — REREAD EVERY CHAT

**The Teacher's Warm-up Round is NOT "Round 1" and NOT "Student Round 0."** It is a fundamentally different thing:

- The teacher fills the warm-up round with content BEFORE the game begins.
- It serves as the **recruiting tool** — the teacher sends the class link, prospective students play through the warm-up to join.
- Students join the class BY playing the warm-up round.
- Warm-up entries have `is_starter = true`. Student entries have `is_starter = false`.

**DB constraint (in place):**
```sql
CREATE UNIQUE INDEX entries_one_live_per_student_class_round
ON entries (student_id, class_id, round_number)
WHERE status = 'live' AND is_starter = false;
```

**Naming convention (locked in #40):**
- Student-facing UI: "Teacher's Warm-up Round" + "Student Round 1, 2, 3 …"
- Teacher-facing UI: "Warm-up Round" + "Round 1, 2, 3 …" (the "student" prefix is implied)
- In `game_sessions`, the warm-up session's `round` value is the enrollment round (1). Student rounds N appear at session position N+1 in chronological order. Code that displays must subtract 1 to get the displayed student round number.

---

## WHAT GOT DONE in chat #40

### Task 1 — Reusable testing/admin SQL scripts (READY TO USE)

Four saved-query scripts for the Supabase SQL Editor. Replace the email/class at the marked line, run.

| script | what it does |
|---|---|
| `preview-student.sql` | Read-only counts (game_sessions, entries, teacher_comments, enrollments) for one email. Output in **Messages** tab. |
| `reset-student.sql` | Wipes one student's data (everything except auth.users row). Preserves magic-link login. |
| `reset-class.sql` | Wipes ALL student data for a class (`game_starts_at` reset to NULL too). Starter entries survive. |
| `diagnose-email.sql` | Shows auth.users.id, students.id, name fields, and all counts for one email. |

**Key fix on these:** `profiles` table has NO `email` column. Profile IDs (= auth user IDs) come from `auth.users`. Earlier versions hit "column email does not exist" errors.

### Task 2 — Second Class seed script (READY)

`seed-second-class.sql`: creates 5 seed students (EmmaJ, JayDawg, SofiaStar, Marc_O, AriaB) with enrollments + entries. `entries.media_url` is NOT NULL, so the script copies a real media_url from any existing First Class non-starter entry and reuses it for all 5. All 5 entries show the same photo but with different descriptions. Safe to re-run.

### Task 3 — Teacher student detail page (READY TO DEPLOY)

`src/app/teacher/students/[id]/page.tsx` — four fixes:

1. **"Their favorite" label moved INSIDE the card** (was a section header above the card; now reads as a label for the photo itself).
2. **"LIVE ROUND" green badge** on the current expanded round (replaces tiny "current" text).
3. **Round ordering:** LIVE ROUND first → completed Student Rounds asc → Warm-up Round last.
4. **Warm-up vs Student Round naming:** first session renders as "Warm-up Round", subsequent sessions as "Round N" where N = sequential_position - 1. Header counts student rounds only ("2 rounds played of 3") or shows "Warm-up played" when only warm-up exists.
5. **"Why it was their favorite" hidden on student rounds** — only the warm-up round shows it (matches #39 decision).
6. **Broken thumbnail fix** — entries fetch now branches on `is_starter`. Starter entries use `getPublicUrl` from `teacher-deck`; student entries use `createSignedUrl` from `media`. The old code used STARTER_BUCKET for all entries, breaking thumbnails on any student photo a peer commented on.

### Task 4 — Teacher students list page (READY TO DEPLOY)

`src/app/teacher/students/page.tsx` — one fix: student cards now show "Warm-up · date" (when enrollment round = 1) instead of "Round 1 · date".

---

## DESIGN DECISIONS MADE in chat #40

### Warm-up naming locked — DECIDED

Teacher UI says "Warm-up Round" + "Round 1, 2, 3"; student UI keeps existing "Teacher's Warm-up Round" + "Student Round 1, 2, 3". Both reflect that the warm-up is not a numbered student round.

### Reset philosophy — DECIDED

`reset-student.sql` preserves auth.users (magic-link still works) and clears everything else. After reset, next login should hit the finish-joining flow as if brand new.

### Seed media — DECIDED (interim)

Seed students copy a real existing `media_url` rather than uploading new files. All 5 show the same photo. Acceptable for testing; if we want unique photos per seed student, that's a bulk-upload utility for a future session.

---

## OPEN QUESTIONS / IN PROGRESS

### "Mike vs Mike D" magic-link confusion — UNDIAGNOSED

After resetting `myked70@yahoo.com`, Mike opened an incognito window, clicked the magic link, and reportedly saw "Welcome, Mike." with the OLD entries still showing on `/student/dashboard`. The data displayed (real photos, "asdfa…" descriptions) looks like `getgroovr@yahoo.com`'s student persona, not myked70's. Strong suspicion: browser-session contamination, NOT a DB issue.

**To diagnose next chat:**
1. Run `diagnose-email.sql` for `myked70@yahoo.com` — should show students.id = (none), entries = 0, etc., confirming reset worked.
2. In the incognito window with the issue: DevTools → Application → Cookies → look for `sb-*-auth-token`. Decode it (jwt.io) — the `email` claim tells you who's actually signed in.
3. If the diagnose shows myked70 IS reset but dashboard still shows data, the auth cookie was leaked from the regular browser session.

### Broken thumbnail bug — FIXED IN #40 BUT UNTESTED

Fix is in the new `[id]/page.tsx` — needs Mike's test walkthrough confirmation.

---

## TESTING GUIDE & REUSABLE SQL COMMANDS

Save in Supabase SQL Editor as labeled queries.

### Start game NOW (for testing)

```sql
UPDATE classes SET game_starts_at = NOW() WHERE name LIKE '%First%';
```

### Un-start game

```sql
UPDATE classes SET game_starts_at = NULL WHERE name LIKE '%First%';
```

### See game_sessions per student per class

```sql
SELECT gs.id, s.screen_name, c.name AS class_name,
       gs.round, gs.completed_at,
       gs.favorite_comment IS NOT NULL AS has_fav_comment
FROM game_sessions gs
JOIN students s ON s.id = gs.student_id
JOIN classes c ON c.id = gs.class_id
ORDER BY c.name, s.screen_name, gs.round;
```

### Force a favorite-comment status for testing

```sql
UPDATE game_sessions
SET favorite_comment_status = 'rejected',
    favorite_comment_rejection_reason = 'Test rejection reason'
WHERE id = '<session_id>';
```

---

## BUGS — status tracker

| # | Description | Status | Where |
|---|---|---|---|
| B1 | Teacher student detail: all rounds labeled "ROUND 1" | ✅ Fixed in #36, refined in #40 (warm-up naming) | `[id]/page.tsx` |
| B2 | Student completed rounds: no classmate comments shown | 🔴 Not started (data-layer gap in `student-archive.ts`) | `student-archive.ts` |
| B3 | `game_sessions.round` always 1 / entries.round_number incorrect | 🟡 Fix written in #39, **untested** | `actions.ts`, `spotlight.jsx`, `shell.jsx`, `student/play/page.tsx` |
| B4 | Seed script round numbers in legacy data | 🟡 Cosmetic | Seed data cleanup |
| B5 | Broken thumbnails on teacher student detail page (commented-on student photos rendered from wrong bucket) | 🟡 Fix in #40 `[id]/page.tsx`, **untested** | `[id]/page.tsx` |
| B6 | Magic-link login after reset shows old student data | 🔴 Undiagnosed — most likely browser session contamination | TBD |

---

## DB STATE AFTER CHAT #40

Unchanged from #39. No new migrations.

### game_sessions columns:
`id, student_id, class_id, round, comments, favorites, favorite_comment, completed_at, favorite_comment_status, favorite_comment_reviewed_by, favorite_comment_reviewed_at, favorite_comment_rejection_reason`

### Entries table columns:
`id, student_id, class_id, media_url, media_type, description_url, description_text, description_l1, reading_audio_url, status, uploaded_at, reviewed_by, reviewed_at, is_starter, pod_number, round_number, rejection_reason`

**`entries.media_url` is NOT NULL.** Any INSERT must supply it (seed scripts copy from an existing entry).

### Two-track ID reminder
- `entries.student_id` = `profiles.id` = `auth.users.id`
- Everything else (`enrollments`, `game_sessions`, `teacher_comments`) = `students.id`

---

## TEST DATA STATE

### Classes

| name | total_rounds | round_duration_hours | notes |
|---|---|---|---|
| Spotlight — Mike's First Class | 3 | 0.25 | 24 seed voter entries + getgroovr/Lovesick data + (after #40 testing) potentially fresh myked70 data |
| Spotlight — Mike's Second Class | 3 | 0.5 | After #40 seed: getgroovr (Mike) + 5 seed students (EmmaJ, JayDawg, SofiaStar, Marc_O, AriaB) |

### Accounts

| email | display name | role |
|---|---|---|
| `getgroovr@yahoo.com` | Mike Dorsten / "Mike" | teacher + student in both classes |
| `myked70@yahoo.com` | reset in #40 — next login is fresh finish-joining | student in First Class (after re-enrollment) |
| `myked70og@gmail.com` | Lovesick | student in First Class |
| `thomasoconnor@hotmail.com` | — | student, profile not finished |

### Seed voters (First Class)
`seed-voter-5@test.local` through `seed-voter-12@test.local`. All entries `live`, `media_type = photo`.

### Seed students (Second Class — after #40 seed)
`seed-s2-1@test.local` through `seed-s2-5@test.local` (EmmaJ, JayDawg, SofiaStar, Marc_O, AriaB). All 5 share the same `media_url` (copied from an existing First Class entry).

---

## NEXT CHAT — suggested flow

### 1. Deploy + test #40 work

Step 1: Deploy the two TSX files:
- `src/app/teacher/students/page.tsx` (warm-up label fix)
- `src/app/teacher/students/[id]/page.tsx` (favorite-in-box, LIVE ROUND badge, ordering, warm-up naming, broken-thumbnail fix)

Step 2: Run `seed-second-class.sql` in Supabase. Confirm Second Class teacher view shows 6 students (Mike + 5 seeds).

Step 3: Diagnose the magic-link issue:
- Run `diagnose-email.sql` for `myked70@yahoo.com`
- Check the auth cookie in the incognito window's DevTools
- Report findings

Step 4: Test B3 (the play-flow round numbering fix from #39) — still untested. Use the walkthrough from #39 handoff.

### 2. B2: Student completed round expanded view — classmate comments

The archive's per-class loop reads one session (the enrollment round) but doesn't surface per-round sessions or classmate comments. Fix in `student-archive.ts`: query ALL game_sessions for the student+class, and for each completed round, fetch the entries that were commented on so the expanded view shows classmate photos + the student's comment on each.

Files needed next chat: `src/lib/student-archive.ts`, `src/app/student/dashboard/page.tsx`.

### 3. Spreadsheet (CSV) export review

Mike wants to review the downloadable class spreadsheet for usability. Next chat: Mike downloads one, uploads it, we reshape columns/headers together.

### 4. PendingQueue component — warm-up label

`src/app/teacher/students/pending-queue.tsx` (or similar) shows "Round 1" next to pending favorite comments. Needs the same "Warm-up Round" label fix. Mike to upload the file when convenient.

---

## CARRIED-FORWARD ITEMS (lower priority)

- B4: Seed script round number cleanup (cosmetic)
- T3: Split pending queue into "Students pending admission" + "Pending photo submissions"
- "+ New class" affordance for teachers
- Media-type dropdown (Photos active, Video/Audio greyed)
- `class_teachers` join table for multi-teacher support (**Slice 2 candidate** — defer until Slice 1 stable)
- Game-start email notification
- Active-class lifecycle automation
- Dashboard ordering rework
- Privacy disclosure for comment-writers
- RPC `class_top_three_reveal` v2 round filter
- Catch-up migration file
- Reusable seed/demo-reset script ✅ DONE in #40
- Two-track ID cleanup (entries.student_id vs students.id)
- `listUsers` lookup optimization
- Per-seed-student unique photos (bulk upload utility)

---

## WHAT NOT TO DO

- Don't start coding without seeing existing files (pref #4)
- Don't give line-by-line patches — full file replacements (pref #1)
- Don't issue bash/grep/curl commands — PowerShell or SQL (pref #2)
- Don't use "CSV" in user-facing text — use "spreadsheet" (pref #12)
- Don't use arrows for collapsible rounds — use "See/Close the round" buttons (pref #11)
- Don't call the warm-up "Round 1" or treat it as a student round
- Don't write INSERTs without checking schema constraints (pref #13)
- Don't query `profiles` by `email` — `profiles` has no email column. Go through `auth.users`.

---

## FILES PRODUCED in chat #40

| file (download name) | destination | status |
|---|---|---|
| `preview-student.sql` | Supabase SQL Editor saved query | ✅ Verified working |
| `reset-student.sql` | Supabase SQL Editor saved query | ✅ Verified working |
| `reset-class.sql` | Supabase SQL Editor saved query | 🟡 Ready, not yet run |
| `diagnose-email.sql` | Supabase SQL Editor saved query | 🟡 Ready for next chat |
| `seed-second-class.sql` | Supabase SQL Editor saved query | 🟡 Ready (uses real media_url) |
| `teacher-student-detail-page.tsx` | `src/app/teacher/students/[id]/page.tsx` | 🟡 Ready to deploy |
| `teacher-students-page.tsx` | `src/app/teacher/students/page.tsx` | 🟡 Ready to deploy |

---

## FILES LIKELY NEEDED NEXT CHAT

| file | why |
|---|---|
| `src/lib/student-archive.ts` | B2: per-round session data + classmate comments |
| `src/app/student/dashboard/page.tsx` | B2: render classmate comments in completed round expanded view |
| `src/app/teacher/students/pending-queue.tsx` | Warm-up label on pending favorite comments |
| One downloaded class spreadsheet | Review export format for usability |
