# 2026-06-14 Slice 1 Handoff #40

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT CHAT" section for the suggested flow.
- **Updated end-of-chat #40** with new bugs surfaced during testing + cache-fix to actions.ts.

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
- Teacher-facing UI: "Warm-up Round" + "Round 1, 2, 3 …"
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

`src/app/teacher/students/[id]/page.tsx` — fixes:

1. **"Their favorite" label moved INSIDE the card** (was a section header above the card; now reads as a label for the photo itself).
2. **"LIVE ROUND" green badge** on the current expanded round (replaces tiny "current" text).
3. **Round ordering:** LIVE ROUND first → completed Student Rounds asc → Warm-up Round last.
4. **Warm-up vs Student Round naming:** first session renders as "Warm-up Round", subsequent sessions as "Round N" where N = sequential_position - 1. Header counts student rounds only ("2 rounds played of 3") or shows "Warm-up played" when only warm-up exists.
5. **"Why it was their favorite" hidden on student rounds** — only the warm-up round shows it (matches #39 decision).
6. **Broken thumbnail fix** — entries fetch now branches on `is_starter`. Starter entries use `getPublicUrl` from `teacher-deck`; student entries use `createSignedUrl` from `media`. The old code used STARTER_BUCKET for all entries, breaking thumbnails on any student photo a peer commented on.

### Task 4 — Teacher students list page (READY TO DEPLOY)

`src/app/teacher/students/page.tsx` — student cards now show "Warm-up · date" (when enrollment round = 1) instead of "Round 1 · date".

### Task 5 — actions.ts revalidatePath fix (READY TO DEPLOY) — NEW

`src/app/teacher/students/actions.ts` — `approveEntry`, `rejectEntry`, `approveFavoriteComment`, and `rejectFavoriteComment` now also call:
```ts
revalidatePath("/student/dashboard");
revalidatePath("/student/play");
```

Without this, Next.js was serving cached student dashboard data after teacher approve/reject; the rejection bug below was almost certainly this.

---

## DESIGN DECISIONS MADE in chat #40

- Warm-up naming locked.
- Reset philosophy: preserve auth.users; clear everything else; magic-link still works.
- Seed media reuse: all 5 second-class seed students share one media_url (acceptable for testing).

---

## TESTING FEEDBACK + BUGS SURFACED IN #40 — for chat #41

### B6 — Magic-link login session contamination

**Confirmed by Mike's testing:** With the teacher dashboard open in any tab, clicking a magic link for a different email lands you back in the teacher's session. Closing all tabs first works as a workaround.

Cause: Supabase auth tokens live in `localStorage` per origin, not per tab. Switching sessions requires either an explicit `signOut()` or a hard browser reset.

**Fix direction (chat #41 or later):** Add a "Sign out and continue as X" detection on the magic-link callback — if `auth.getUser()` returns a user whose email doesn't match the magic-link email, force `signOut()` and re-trigger the auth flow.

### B7 — Student dashboard doesn't reflect teacher rejection — LIKELY FIXED in #40

**Mike's report:** Teacher rejects an entry. Diagnostic SQL confirms `entries.status='rejected'` and `rejection_reason` saved. But the student dashboard still shows "AWAITING APPROVAL" on Student Round 1 and on the warm-up favorite. Same for `favorite_comment_status` on `game_sessions`.

**Root cause:** `actions.ts` was only calling `revalidatePath("/teacher/students")` after approve/reject. Student paths (`/student/dashboard`, `/student/play`) were not revalidated, so Next.js served stale cached student pages.

**Fix applied in #40:** Added `revalidatePath("/student/dashboard")` and `revalidatePath("/student/play")` to all four entry/favorite-comment actions. Needs testing in chat #41 — if still broken after deploy, check whether `force-dynamic` is set on `src/app/student/dashboard/page.tsx`.

### B8 — Broken thumbnails on /play page

**Mike's screenshot (image 3 in chat):** /play shows 9 photo slots but 3 are blank. Same bucket-mismatch bug we fixed in `teacher/students/[id]/page.tsx`. The /play page uses `loadGenericDeck()` from `src/lib/deck.ts`; the student in-class game uses `loadClassDeck()` from `src/lib/class-deck.ts`. Whichever file picks the bucket for non-starter entries probably uses `getPublicUrl` on the wrong bucket.

**Need next chat:** `src/lib/deck.ts` and `src/lib/class-deck.ts` to inspect and fix.

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
       gs.favorite_comment IS NOT NULL AS has_fav_comment,
       gs.favorite_comment_status
FROM game_sessions gs
JOIN students s ON s.id = gs.student_id
JOIN classes c ON c.id = gs.class_id
ORDER BY c.name, s.screen_name, gs.round;
```

### Inspect a student's entries (status + rejection_reason)
```sql
SELECT id, status, rejection_reason, reviewed_at, reviewed_by, round_number
FROM entries
WHERE student_id IN (SELECT id FROM auth.users WHERE email = 'myked70@yahoo.com')
  AND is_starter = false;
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
| B1 | Teacher student detail: all rounds labeled "ROUND 1" | ✅ Fixed in #36, refined in #40 | `[id]/page.tsx` |
| B2 | Student completed rounds: no classmate comments shown | 🔴 Not started (data-layer gap) | `student-archive.ts` |
| B3 | `game_sessions.round` always 1 / entries.round_number incorrect | 🟡 Fix written in #39, **untested** | `actions.ts`, `spotlight.jsx`, `shell.jsx`, `student/play/page.tsx` |
| B4 | Seed script round numbers in legacy data | 🟡 Cosmetic | Seed data cleanup |
| B5 | Broken thumbnails on teacher student detail page (commented-on student photos) | ✅ Fixed in #40, observed working in image 5 | `[id]/page.tsx` |
| B6 | Magic-link login after sign-in retains old session | 🔴 Identified in #40 — needs explicit signOut on email mismatch | Magic-link callback / auth flow |
| B7 | Student dashboard doesn't reflect teacher rejection status | 🟡 revalidatePath fix in #40 actions.ts — **needs test** | `actions.ts` (fixed), possibly `student/dashboard/page.tsx` |
| B8 | Broken thumbnails on /play page (visitor demo) | 🔴 Identified in #40 — same bucket issue as B5 | `src/lib/deck.ts` likely |
| B9 | Possibly same as B8 on /student/play (in-class game) | 🔴 Identified in #40 | `src/lib/class-deck.ts` likely |

---

## DB STATE AFTER CHAT #40

Unchanged from #39. No new migrations.

### game_sessions columns:
`id, student_id, class_id, round, comments, favorites, favorite_comment, completed_at, favorite_comment_status, favorite_comment_reviewed_by, favorite_comment_reviewed_at, favorite_comment_rejection_reason`

### Entries table columns:
`id, student_id, class_id, media_url, media_type, description_url, description_text, description_l1, reading_audio_url, status, uploaded_at, reviewed_by, reviewed_at, is_starter, pod_number, round_number, rejection_reason`

**`entries.media_url` is NOT NULL.** Any INSERT must supply it.

### Two-track ID reminder
- `entries.student_id` = `profiles.id` = `auth.users.id`
- Everything else (`enrollments`, `game_sessions`, `teacher_comments`) = `students.id`

---

## TEST DATA STATE

### Classes

| name | total_rounds | round_duration_hours | notes |
|---|---|---|---|
| Spotlight — Mike's First Class | 3 | 0.25 | 8 seed voters + getgroovr/Lovesick data + (after #40 testing) fresh asdASDsad / mykl data from myked70@yahoo.com |
| Spotlight — Mike's Second Class | 3 | 0.5 | After #40 seed: getgroovr (Mike) + 5 seed students sharing one media_url |

### Accounts

| email | display name | role | notes |
|---|---|---|---|
| `getgroovr@yahoo.com` | Mike Dorsten / "Mike" | teacher + student in both classes | |
| `myked70@yahoo.com` | reset multiple times — last walked through as "asdASDsad" / "ASDsdSAD", possibly reset since | student in First Class | Run `diagnose-email.sql` to see current state |
| `myked70og@gmail.com` | Lovesick | student in First Class | |
| `thomasoconnor@hotmail.com` | — | profile not finished | |

### Seed voters (First Class)
`seed-voter-5@test.local` through `seed-voter-12@test.local`. All entries `live`, `media_type = photo`.

### Seed students (Second Class — after #40 seed)
`seed-s2-1@test.local` through `seed-s2-5@test.local`. All 5 share the same `media_url`.

---

## NEXT CHAT — suggested flow

### 1. Confirm B7 fix (revalidatePath) deployed and working

Step 1: After commits, reset a test student (`reset-student.sql` for `myked70@yahoo.com`).
Step 2: Walk through warm-up + finish-joining as that student in an incognito window. **Close all other tabs first** (B6 workaround).
Step 3: As the teacher, reject the student's first submission with a reason.
Step 4: Refresh the student dashboard. It should now show "NOT APPROVED" with the rejection reason — not "AWAITING APPROVAL".

If still broken, check whether `src/app/student/dashboard/page.tsx` has `export const dynamic = "force-dynamic";` at the top. If not, that's the next fix.

### 2. Fix B8/B9 — broken thumbnails on /play and /student/play

Apply the same is_starter bucket-selection logic from `[id]/page.tsx` to wherever `deck.ts` and `class-deck.ts` resolve photo URLs.

**Files needed:** `src/lib/deck.ts`, `src/lib/class-deck.ts`

### 3. B2 — Student completed round expanded view: classmate comments

The archive's per-class loop reads one session (the enrollment round) but doesn't surface per-round sessions or classmate comments. Fix in `student-archive.ts`: query ALL game_sessions for the student+class, and for each completed round, fetch the entries that were commented on so the expanded view shows classmate photos + the student's comment on each.

**Files needed:** `src/lib/student-archive.ts`, `src/app/student/dashboard/page.tsx`.

### 4. Spreadsheet (CSV) export review

Mike to download a class spreadsheet, upload it, reshape columns/headers together.

### 5. PendingQueue warm-up label

`src/app/teacher/students/pending-queue.tsx` shows "Round 1" next to pending favorite comments. Apply same warm-up label fix.

### 6. B6 — Magic-link session-mismatch sign-out (lower priority)

Detect `auth.getUser().email !== magic-link-email` and force `signOut()` before re-auth.

---

## CARRIED-FORWARD ITEMS (lower priority)

- B4: Seed script round number cleanup (cosmetic)
- T3: Split pending queue into "Students pending admission" + "Pending photo submissions"
- "+ New class" affordance for teachers
- Media-type dropdown (Photos active, Video/Audio greyed)
- `class_teachers` join table for multi-teacher support (**Slice 2 candidate**)
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
| `diagnose-email.sql` | Supabase SQL Editor saved query | ✅ Verified working |
| `seed-second-class.sql` | Supabase SQL Editor saved query | ✅ Verified working |
| `teacher-student-detail-page.tsx` | `src/app/teacher/students/[id]/page.tsx` | 🟡 Ready to deploy |
| `teacher-students-page.tsx` | `src/app/teacher/students/page.tsx` | 🟡 Ready to deploy |
| `teacher-students-actions.ts` | `src/app/teacher/students/actions.ts` | 🟡 NEW — revalidatePath fix for B7 |

---

## SUGGESTED COMMITS FOR CHAT #40 WORK

### Commit 1 — `feat(play): correct round numbering through game session and entry persistence (#39 B3)`

Files: `src/app/play/actions.ts`, `src/app/student/play/page.tsx`, `src/game/shell.jsx`, `src/game/spotlight.jsx`

### Commit 2 — `feat(teacher): warm-up naming, favorite-in-box, live round badge, fix broken thumbnails (#40)`

Files: `src/app/teacher/students/page.tsx`, `src/app/teacher/students/[id]/page.tsx`, `src/app/teacher/students/actions.ts` (revalidatePath fix), `src/app/teacher/students/pending-queue.tsx` (if applicable)

### Commit 3 — `chore(student): carry-over dashboard and archive updates`

Files: `src/app/student/dashboard/page.tsx`, `src/lib/student-archive.ts`

### Commit 4 — `docs: handoffs #38 and #40`

Files: `docs/handoffs/2026-06-13_SLICE_1_HANDOFF_38.md`, `docs/handoffs/2026-06-14_SLICE_1_HANDOFF_40.md`

---

## FILES LIKELY NEEDED NEXT CHAT (chat #41)

| file | why |
|---|---|
| `src/lib/deck.ts` | B8 — fix bucket selection for non-starter entries on /play |
| `src/lib/class-deck.ts` | B9 — same fix for /student/play |
| `src/app/student/dashboard/page.tsx` | Verify `force-dynamic` is set; B2 work; B7 verify |
| `src/lib/student-archive.ts` | B2 — per-round sessions + classmate comments |
| `src/app/teacher/students/pending-queue.tsx` | Warm-up label on pending favorite comments |
| One downloaded class spreadsheet | Review export format for usability |
| Latest auth callback file (e.g. `src/app/auth/callback/route.ts`) | B6 — sign-out on email mismatch (lower priority) |
