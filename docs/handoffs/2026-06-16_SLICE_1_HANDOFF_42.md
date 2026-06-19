# 2026-06-16 Slice 1 Handoff #42 (revised)

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
- The warm-up deck (teacher-deck PUBLIC bucket) and student round decks (media PRIVATE bucket) are completely separate — different sources, different ownership, different storage buckets.

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

## WHAT GOT DONE in chat #42

### Task 1 — Teacher student detail: "Warm-up round played" copy fix (READY TO DEPLOY)

`src/app/teacher/students/[id]/page.tsx` — Previously showed "Warm-up played of 3" when only the warm-up was completed. Now shows "Warm-up round played" (no "of 3"). Student rounds still get "1 round played of 3" etc.

### Task 2 — "Pick your favorite" UX improvement (READY TO DEPLOY)

`src/game/spotlight.jsx` — Moved instruction text from header subtitle down to next to the disabled "Join the class" / "Save my comments" button. Shows "↑ Tap the photo you liked the most to continue" only while no favorite is selected; disappears once they tap one.

### Task 3 — Teacher spreadsheet reshaped to one-row-per-comment (DEPLOYED, VERIFIED)

`src/app/teacher/students/export/route.ts` — One row per comment, two columns (Photo description | Student's comment), grouped by student → round. Seed voters excluded. Stripped favorites/status/teacher notes — language-only. Confirmed working.

### Task 4 — SQL testing toolkit (DELIVERED, test-reset.sql NEEDS UPDATE)

SQL files delivered. Mike ran test-reset.sql successfully. However, the original script kept the enrollment record, causing a "You're already in a class" error when myked70 tried to rejoin via /play. **Updated test-reset-v2.sql** now also deletes the enrollment and clears profiles.class_id so the student can go through the full /play → join flow from scratch.

---

## TESTING RESULTS from 6/16 morning session

Mike ran through the walkthrough using First Class + myked70. Here's what happened:

### What worked
- SQL reset ran successfully (image 3)
- /play warm-up played through (photos loaded, comments entered)
- Magic link sent and received
- Student joined as "Casper1", uploaded sunrise photo, landed on dashboard (image 6)
- Game started via SQL (image 8)
- Student dashboard correctly shows Student Round 1 with photo + description + AWAITING APPROVAL

### Issues found

**Issue 1 — "Already in a class" warning on rejoin (test-reset bug)**
After running test-reset.sql, the student tried to join via /play and got "You're already in a class. You can join a new one once your current class has finished." (image 4). The enrollment wasn't deleted. **FIX:** test-reset-v2.sql now deletes enrollment + clears profiles.class_id.

**Issue 2 — Magic link opens in default browser, not InPrivate**
The magic link email opened in Mike's regular browser (where teacher was logged in), not InPrivate. This overwrote the teacher session with the student session. Mike had to re-login as teacher. This is standard browser behavior (OS opens links in default browser), but it makes the two-browser testing flow awkward.

**Workaround for testing:** After the magic link opens in the regular browser and the student finishes joining, log out of the student session, log back in as teacher. OR: set the InPrivate browser as default temporarily. OR: copy the magic link URL manually into InPrivate.

**This is also B6 territory** — the magic link session overwriting whatever session exists in that browser.

**Issue 3 — /student/play shows "Please sign in" in InPrivate (image 9)**
Expected behavior. The student session was created in the regular browser (via magic link), so InPrivate has no session. The student needs to play in whichever browser has the session.

**Issue 4 — Duplicate photos in warm-up**
Mike commented on the same photo multiple times during the warm-up spotlight. The deck may be serving duplicate entries. Needs investigation — could be a `deck.ts` or `spotlight.jsx` issue where the spotlight sequence doesn't deduplicate.

**Issue 5 — Could not complete round flow**
Testing stopped at Step 4 (/student/play). The student session was in the regular browser (from magic link), but Mike needed that browser for the teacher. Couldn't play as student and teacher simultaneously with the current setup. **The two-browser testing strategy needs the magic link to land in InPrivate.** Mike should copy the magic link URL and paste it into InPrivate instead of clicking it directly.

---

## NEW DESIGN QUESTIONS from testing (Mike's input needed)

### Q1 — Class size limits (currently no cap)
First Class shows 10 students joined (8 seed voters + Lovesick + myked70 + thomasoconnor). The game only has 9 photo slots. What happens to student 10+?

Mike's questions:
- Do extra students go in a "waiting room"?
- Should they start filling a new class automatically?
- Does the teacher pick how many classes to have?
- Should there be a hard cap at 9 students per class?

**Current state:** No cap enforced. The class_id on `/play` enrollment just adds them.

### Q2 — Teacher deck bundling (more than 9 photos)
The teacher deck page shows all photos in a flat list. Mike wants the ability to create bundles/divisions of 9 photos, so the teacher can select which bundle to use for the warm-up.

**Current state:** All `is_starter = true` entries for the class are loaded as the warm-up deck. No grouping.

### Q3 — Minimum comment length (teacher-configurable?)
Mike notes the required comment length is very short for a language class. Should this be a teacher-configurable setting (e.g. minimum 20 characters, 50 characters, etc.)? Or just a higher default?

### Q4 — Duplicate photos in warm-up
Mike saw the same photo appear multiple times in the spotlight sequence. Is this:
- A data issue (duplicate entries in the DB)?
- A deck-loading issue (same entry served twice)?
- A spotlight sequencing issue?

**Needs investigation.** Files to check: `src/lib/deck.ts` (warm-up deck loader) and `src/game/spotlight.jsx` (sequence logic).

---

## BUGS — status tracker

| # | Description | Status | Where |
|---|---|---|---|
| B1 | Teacher student detail: all rounds labeled "ROUND 1" | ✅ Fixed in #36, refined in #40 | `[id]/page.tsx` |
| B2 | Student completed rounds: no classmate comments shown | ✅ Fixed in #41, **needs round-flow test** | `student-archive.ts`, `page.tsx` |
| B3 | `game_sessions.round` always 1 / entries.round_number incorrect | 🟡 Fix written in #39, **untested** | `actions.ts`, `spotlight.jsx`, `shell.jsx`, `student/play/page.tsx` |
| B4 | Seed script round numbers in legacy data | 🟡 Cosmetic | Seed data cleanup |
| B5 | Broken thumbnails on teacher student detail page | ✅ Fixed in #40 | `[id]/page.tsx` |
| B6 | Magic-link login retains old session / overwrites teacher session | 🔴 Deferred — needs explicit signOut on email mismatch | Auth callback |
| B7 | Student dashboard doesn't reflect teacher rejection status | 🟡 Fix in place (#40), **needs deploy test** | `actions.ts`, `student/dashboard/page.tsx` |
| B8 | Broken thumbnails on /play page | ✅ Fixed #41, confirmed #42 | `src/lib/deck.ts` |
| B9 | Broken thumbnails on /student/play | ✅ No fix needed | `src/lib/class-deck.ts` |
| B10 | "Warm-up played of 3" awkward copy | ✅ Fixed in #42 | `[id]/page.tsx` |
| B11 | Duplicate photos in warm-up spotlight | 🔴 New — needs investigation | `deck.ts` / `spotlight.jsx` |
| B12 | test-reset.sql didn't fully clear enrollment | ✅ Fixed in test-reset-v2.sql | SQL toolkit |

---

## DB STATE AFTER CHAT #42

Unchanged from #41. No new migrations.

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
| Spotlight — Mike's First Class | 2 (Mike changed) | 2 (set by test-reset) | 8 seed voters + test students |
| Spotlight — Mike's Second Class | 3 | 0.5 | getgroovr + Im MikeD + 5 seed students |

### Accounts

| email | display name | role | notes |
|---|---|---|---|
| `getgroovr@yahoo.com` | Mike Dorsten / "Mike" | teacher + student in both classes | |
| `myked70@yahoo.com` | last joined as "Casper1" | student in First Class | |
| `myked70og@gmail.com` | Lovesick | student in First Class | |
| `thomasoconnor@hotmail.com` | — | profile not finished | |

### Seed voters (First Class)
`seed-voter-5@test.local` through `seed-voter-12@test.local`. All entries `live`, `media_type = photo`.

### Seed students (Second Class)
`seed-s2-1@test.local` through `seed-s2-5@test.local`. All 5 share the same `media_url`.

---

## NEXT CHAT — suggested flow

### Priority 1: Complete the round-flow test

Mike needs to successfully play through at least one full student round. Blocker was the magic-link session landing in the wrong browser. 

**Testing tip:** After clicking "Send my invitation" on /play, go to your email, RIGHT-CLICK the magic link, copy the URL, and paste it into the InPrivate browser's address bar. This keeps the student session in InPrivate and the teacher session in the regular browser.

Updated test flow with test-reset-v2.sql:
1. Run test-reset-v2.sql (fully wipes enrollment)
2. InPrivate → /play → warm-up → pick favorite → enter myked70@yahoo.com
3. Copy magic link URL → paste into InPrivate
4. Finish joining in InPrivate → student dashboard
5. Regular browser → teacher login → approve entry
6. SQL: start game
7. InPrivate → /student/play → play round 1
8. Verify B2, B3, B7 along the way

### Priority 2: Investigate B11 (duplicate photos in warm-up)

Need to check:
- Are there duplicate entries in the DB? Run: `SELECT id, description_text, media_url FROM entries WHERE class_id IN (SELECT id FROM classes WHERE name LIKE '%First%') AND is_starter = true;`
- Does `deck.ts` deduplicate?
- Does `spotlight.jsx` cycle through without repeats?

**Files needed:** `src/lib/deck.ts`, `src/game/spotlight.jsx` (already have from #42)

### Priority 3: Design decisions on new questions

Mike to decide on:
- Q1: Class size cap / overflow handling
- Q2: Deck bundling for teacher photos
- Q3: Minimum comment length (configurable or fixed)

These don't need code yet — just Mike's direction so they can be specced.

### Lower priority
- B6: Magic-link session mismatch (file needed: `src/app/auth/callback/route.ts`)
- B3/B7: Will be validated during the round-flow test
- Remaining carried-forward items

---

## CARRIED-FORWARD ITEMS

- B3: Round-number fix untested (written in #39) — will be tested in round-flow walkthrough
- B4: Seed script round number cleanup (cosmetic)
- B6: Magic-link session mismatch sign-out
- T3: Split pending queue into "Students pending admission" + "Pending photo submissions"
- "+ New class" affordance for teachers
- Media-type dropdown (Photos active, Video/Audio greyed)
- Class size cap / overflow handling (NEW — Q1)
- Deck bundling for teacher photos (NEW — Q2)
- Configurable minimum comment length (NEW — Q3)
- `class_teachers` join table for multi-teacher support (**Slice 2 candidate**)
- Game-start email notification
- Active-class lifecycle automation
- Dashboard ordering rework
- Privacy disclosure for comment-writers
- RPC `class_top_three_reveal` v2 round filter
- Catch-up migration file
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

## FILES PRODUCED in chat #42

| file (download name) | destination | status |
|---|---|---|
| `[id]-page.tsx` | `src/app/teacher/students/[id]/page.tsx` | 🟡 Ready to deploy |
| `spotlight.jsx` | `src/game/spotlight.jsx` | 🟡 Ready to deploy |
| `route.ts` | `src/app/teacher/students/export/route.ts` | ✅ Deployed and verified |
| `test-reset-v2.sql` | Mike's local SQL folder (replaces test-reset.sql) | 📁 Testing tool |
| `jump-round.sql` | Mike's local SQL folder | 📁 Testing tool |
| `diagnose-round.sql` | Mike's local SQL folder | 📁 Testing tool |
| `teacher-actions.sql` | Mike's local SQL folder | 📁 Testing tool |
| `testing-walkthrough.sql` | Mike's local SQL folder | 📁 Testing tool |

---

## SUGGESTED COMMIT FOR CHAT #42 WORK

```
feat(teacher): spreadsheet one-row-per-comment, pick-favorite UX, copy fixes (#42)
```

Files: `src/app/teacher/students/[id]/page.tsx`, `src/game/spotlight.jsx`, `src/app/teacher/students/export/route.ts`

---

## FILES LIKELY NEEDED NEXT CHAT (chat #43)

| file | why |
|---|---|
| `src/lib/deck.ts` | B11 — investigate duplicate photos in warm-up |
| `src/game/spotlight.jsx` | B11 — investigate spotlight sequence deduplication |
| `src/app/auth/callback/route.ts` | B6 — sign-out on email mismatch |
| Any file Mike flags from round-flow testing | Based on walkthrough results |
