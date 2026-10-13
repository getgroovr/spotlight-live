# 2026-06-13 Slice 1 Handoff #38

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

---

## WHAT GOT DONE in chat #38

### Chunk 1 — Favorite comment moderation (SHIPPED & CONFIRMED)

New feature: teacher can approve or reject a student's favorite comment (the comment on the pic + the "why it's my favorite" text) before it's shown in the round reveal.

**Schema changes (applied):**
```sql
ALTER TABLE game_sessions
  ADD COLUMN favorite_comment_status text DEFAULT NULL,
  ADD COLUMN favorite_comment_reviewed_by uuid,
  ADD COLUMN favorite_comment_reviewed_at timestamptz,
  ADD COLUMN favorite_comment_rejection_reason text;
```

**Files shipped:**

| file | destination | what it does |
|---|---|---|
| `actions.ts` | `src/app/teacher/students/actions.ts` | Added `approveFavoriteComment` + `rejectFavoriteComment` server actions |
| `pending-queue.tsx` | `src/app/teacher/students/pending-queue.tsx` | New `FavoriteCommentCard` component + "Pending favorite comments" section |
| `page.tsx` | `src/app/teacher/students/page.tsx` | Queries pending fav comments, resolves student name + favorited pic thumbnail (bucket-aware: teacher-deck for starters, media for student entries) |
| `actions.ts` | `src/app/play/actions.ts` | `saveProfile` now sets `favorite_comment_status: 'pending'` when writing the why-note. Resubmissions after rejection reset reviewed fields. |

### Chunk 2 — Teacher student detail page enhancements (SHIPPED & CONFIRMED)

| file | destination | what it does |
|---|---|---|
| `id-page.tsx` (renamed to `page.tsx`) | `src/app/teacher/students/[id]/page.tsx` | 4 fixes: (1) "THEIR FAVORITE" shows APPROVED/AWAITING APPROVAL/NOT APPROVED badge, (2) rejection reason in red box, (3) favorited pic deduped from regular comments list, (4) "+ Add a note" on the favorited entry |

### Seed script for Second Class (NEEDS RETRY)

The first attempt failed — hardcoded class UUID didn't match what's in the DB (possible copy-paste issue from screenshot). Fixed script v2 discovers the class ID dynamically via `WHERE name LIKE '%Second%'`. **Not yet run by Mike.**

---

## DESIGN DECISIONS MADE in chat #38

### Favorite comment moderation approach — DECIDED (Option A)

Columns directly on `game_sessions` rather than a separate `moderated_content` table. Rationale: entries already have moderation baked into their own columns (`status`, `rejection_reason`, etc.) and we'd have to keep that regardless. A generic moderation table would mean two systems, not one. Adding columns to game_sessions is simpler and we're not going to refactor entries moderation. If a third content type needs moderation in the future, that's the time to unify.

### Favorite comment approve flow — one-click confirm

Unlike photo approvals (which have an optional teacher note textarea), favorite comment approval is a single confirm click. Rejection requires a reason (stored in `game_sessions.favorite_comment_rejection_reason`). The teacher can still add notes via the student detail page's "+ Add a note" on the favorited entry.

---

## BUGS — status tracker

| # | Description | Status | Where |
|---|---|---|---|
| B1 | Teacher student detail: all rounds labeled "ROUND 1" | ✅ Fixed in #36, display workaround confirmed in #37 | `[id]/page.tsx` |
| B2 | Student completed rounds: no classmate comments shown | 🔴 Not started (data-layer gap in `student-archive.ts`) | `student-archive.ts` |
| B3 | `game_sessions.round` always 1 / entries.round_number incorrect (play flow root cause) | 🔴 Not started — causes "Round 4" to appear in a 3-round class | `src/app/student/play/` |
| B4 | Seed script round numbers (4, 5, 6, 7, 8, 9 in a 3-round class) | 🟡 Legacy data — not blocking, but causes display weirdness in student detail | Seed data cleanup needed |

---

## DB STATE AFTER CHAT #38

**New columns on game_sessions:**
- `favorite_comment_status text DEFAULT NULL` — null (no comment), pending, approved, rejected
- `favorite_comment_reviewed_by uuid`
- `favorite_comment_reviewed_at timestamptz`
- `favorite_comment_rejection_reason text`

Everything else unchanged from #37.

### Entries table columns (confirmed via schema query):
`id, student_id, class_id, media_url, media_type, description_url, description_text, description_l1, reading_audio_url, status, uploaded_at, reviewed_by, reviewed_at, is_starter, pod_number, round_number, rejection_reason`

### game_sessions columns (updated):
`id, student_id, class_id, round, comments, favorites, favorite_comment, completed_at, favorite_comment_status, favorite_comment_reviewed_by, favorite_comment_reviewed_at, favorite_comment_rejection_reason`

---

## TEST DATA STATE

### Classes

| name | total_rounds | round_duration_hours | notes |
|---|---|---|---|
| Spotlight — Mike's First Class | 3 | 0.25 | 24 seed entries + myked70/Lovesick testing data. Favorite comments tested (approved/rejected). |
| Spotlight — Mike's Second Class | 3 | 0.5 | Mike only enrolled. Seed script v2 ready to run but not yet executed. |

### Accounts (unchanged from #37)

| email | display name | role |
|---|---|---|
| `getgroovr@yahoo.com` | Mike (getgroovr) | teacher + student |
| `myked70@yahoo.com` | myked | student in First Class |
| `myked70og@gmail.com` | Lovesick | student in First Class |
| `thomasoconnor@hotmail.com` | — | student, profile not finished |

### Seed voters (First Class)
`seed-voter-5@test.local` through `seed-voter-12@test.local`. All entries `live`, `media_type = photo`. No auth accounts.

### Seed students (Second Class — NOT YET CREATED, pending seed script v2)
`seed-s2-1@test.local` through `seed-s2-5@test.local` (EmmaJ, JayDawg, SofiaStar, Marc_O, AriaB).

---

## NEXT CHAT — suggested flow

1. **Run seed script v2 for Second Class.** The fixed script discovers class IDs dynamically. Run it in Supabase SQL Editor. Verify Second Class teacher dashboard shows 5+ students, pending entries, and pending favorite comments.

2. **Student dashboard — favorite comment status.** Show the student their favorite comment's approval status and any rejection reason. Needs:
   - `src/lib/student-archive.ts` — add `favoriteCommentStatus` and `favoriteCommentRejectionReason` to `ClassArchive` type, and include `favorite_comment_status`, `favorite_comment_rejection_reason` in the game_sessions query.
   - `src/app/student/dashboard/page.tsx` — add status badge and rejection reason display in the `WarmupBody` component's "Your favorite" section. Already uploaded to Claude in chat #38 (999 lines).

3. **B3: Fix play flow round numbering.** The play flow always writes incorrect round_number values. Root cause is in `src/app/student/play/` (or `src/app/play/`). Need `page.tsx` from that directory.

4. **If time:** Reusable reset-and-reseed script for both classes (carried forward).

---

## CARRIED-FORWARD ITEMS (lower priority)

- B2: Student completed round expanded view missing classmate comments
- T3: Split pending queue into "Students pending admission" + "Pending photo submissions"
- "+ New class" affordance for teachers
- Media-type dropdown (Photos active, Video/Audio greyed out "coming soon")
- `class_teachers` join table for multi-teacher support
- Game-start email notification
- Active-class lifecycle automation
- Dashboard ordering rework
- Privacy disclosure for comment-writers
- RPC `class_top_three_reveal` v2 round filter
- Catch-up migration file
- Reusable seed/demo-reset script
- Two-track ID cleanup (entries.student_id vs students.id)
- `listUsers` lookup optimization (replace with RPC or view at scale)

---

## WHAT NOT TO DO

- Don't start coding without seeing existing files (pref #4)
- Don't give line-by-line patches — full file replacements (pref #1)
- Don't issue bash/grep/curl commands — PowerShell or SQL (pref #2)
- Don't use "CSV" in user-facing text — use "spreadsheet" (pref #12)
- Don't use arrows for collapsible rounds — use "See/Close the round" buttons (pref #11)
- Don't call the warm-up "Round 1" or treat it as a student round
- Don't write INSERTs without checking schema constraints (pref #13)
- Don't request files Claude can't actively work on yet (pref #14)
- Don't stall mid-task with single questions — batch at end (pref #16)

---

## FILES PRODUCED in chat #38

| file (download name) | destination | status |
|---|---|---|
| `actions.ts` (teacher) | `src/app/teacher/students/actions.ts` | ✅ Deployed & confirmed |
| `pending-queue.tsx` | `src/app/teacher/students/pending-queue.tsx` | ✅ Deployed & confirmed |
| `page.tsx` (teacher students list) | `src/app/teacher/students/page.tsx` | ✅ Deployed & confirmed |
| `actions.ts` (play) | `src/app/play/actions.ts` | ✅ Deployed & confirmed |
| `id-page.tsx` (rename to page.tsx) | `src/app/teacher/students/[id]/page.tsx` | ✅ Deployed & confirmed |
| `seed-second-class-v2.sql` | Run in Supabase SQL Editor | 🟡 Not yet run |

---

## FILES LIKELY NEEDED NEXT CHAT

| file | why |
|---|---|
| `src/lib/student-archive.ts` | Add favorite comment status fields to ClassArchive type + query |
| `src/app/student/dashboard/page.tsx` | Already uploaded in #38 (999 lines) — add status badge + rejection reason to WarmupBody |
| `src/app/play/page.tsx` or `src/app/student/play/page.tsx` | B3: understand play flow to fix round numbering |
