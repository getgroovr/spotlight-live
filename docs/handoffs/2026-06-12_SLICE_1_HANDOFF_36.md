# 2026-06-12 Slice 1 Handoff #36

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Have Mike deploy the files listed in "Files produced but NOT deployed" and test them. If anything fails, fix it before moving on.

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

## WHAT GOT DONE in chat #36

### Chunk 1 — Student dashboard layout fixes (SHIPPED & CONFIRMED)

| # | Issue | Status |
|---|---|---|
| L1 | Completed rounds ascending (1, 2, 3) | ✅ Shipped |
| L2 | Teacher's Warm-up Round moved below results + spreadsheet buttons | ✅ Shipped |
| L3 | Button text → "See who got the most favorite votes in each round →" | ✅ Shipped |
| L4 | Status badge shows entry approval status independent of round timing | ✅ Verified, no change needed |

### Chunk 2 — Teacher approval flow fixes (PRODUCED, needs deploy + test)

**T1 — Archive prior live entry on approve (`actions.ts`):**
`approveEntry` archives any existing `status = 'live'` entry for the same student+class+round before flipping the new one to live.

**T2 — Teacher note on approve/reject (`actions.ts` + `pending-queue.tsx` + student `page.tsx`):**
- Both approve and reject reveal a textarea (optional for approve, required for reject).
- Both write to `teacher_comments` table with `entry_id` set. Reject also writes to `entries.rejection_reason` for backward compat.
- `resolveStudentsId` bridges the two-track ID gap: entry's `student_id` (profiles.id) → auth user email → `students.id`.
- Student dashboard updated: rejection box uses `teacherNote || rejectionReason` fallback; normal teacher-note section suppressed for rejected entries.

**Assumption to verify at deploy:** The `teacher_comments` INSERT uses columns `student_id, class_id, entry_id, round, body`. If the table has additional NOT NULL columns (like `teacher_id`), the INSERT will fail at runtime — check the console. The approve/reject action itself still succeeds; only the note write is lost.

### B1 — Teacher student detail "all Round 1" bug (PRODUCED, needs deploy + test)

**Root cause:** `game_sessions.round` is always `1` for all sessions. The play flow records the enrollment round (warm-up = round 1), not the actual round being played. The teacher student detail page used `s.round || 1` to display round numbers, so every row showed "ROUND 1."

**Fix:** Sequential numbering by chronological order (`round: i + 1`). Also added `.eq("class_id", enrollment.class_id)` to the session query to prevent cross-class bleed, and changed sort to `completed_at ASC` for correct ordering.

**Note:** This is a display-layer workaround. The deeper issue — `game_sessions.round` not being set correctly by the play flow — is a separate fix that needs `src/app/student/play/` code. Carry forward as a known data-layer gap.

### Files produced but NOT deployed

| file (download name) | destination | what it does |
|---|---|---|
| `actions.ts` | `src/app/teacher/students/actions.ts` | T1 archive + T2 teacher_comments writes |
| `pending-queue.tsx` | `src/app/teacher/students/pending-queue.tsx` | T2 approve textarea UI |
| `page.tsx` | `src/app/student/dashboard/page.tsx` | T2 teacher note display unification + all Chunk 1 fixes |
| `teacher-student-detail-page.tsx` | `src/app/teacher/students/[id]/page.tsx` | B1 sequential round numbering fix |

**IMPORTANT:** `teacher-student-detail-page.tsx` was named differently to avoid confusion with the student dashboard `page.tsx`. Rename it to `page.tsx` when placing it in `src/app/teacher/students/[id]/`.

---

## DESIGN DECISIONS MADE in chat #36

### Teacher note architecture — DECIDED
One unified note per entry, stored in `teacher_comments` with `entry_id`. Used for approval comments, rejection reasons, and later edits from the student profile page. Student sees it contextually based on entry status.

### Multi-teacher — DECIDED (not yet built)
- Full migration to `class_teachers` join table.
- All teachers get full admin within their class.
- Creator/administrator can revoke a teacher's access.
- Safety net: email link in student profile for reporting concerns. Details TBD.

### Media types — DECIDED (partially deferred)
- Build a media-type dropdown on the teacher dashboard. Only Photos active now. Video and Audio greyed out with "coming soon."
- This establishes the UI scaffold for media flexibility without building upload/playback.

### L5 — Multi-submit gating — DECIDED
When a student submits a pic for a round that already has one:
- **Shift the existing pic to the next available slot** (next round without an entry).
- **If no more rounds need a picture, delete it.**
- This means the student can always resubmit — their current pic slides forward to make room, and the new one takes the slot.

---

## BUGS — status tracker

| # | Description | Status | Where |
|---|---|---|---|
| B1 | Teacher student detail: all rounds labeled "ROUND 1" | 🟡 Fix produced, needs deploy | `[id]/page.tsx` |
| B2 | Student completed rounds: no classmate comments shown | 🔴 Not started (data-layer gap in `student-archive.ts`) | `student-archive.ts` |
| B3 | `game_sessions.round` always 1 (play flow doesn't set correct round) | 🔴 Not started (root cause of B1) | `src/app/student/play/` |

---

## DB STATE AFTER CHAT #36

No schema changes. All changes are code-only.

- `entry_status` enum: `{pending, live, archived, rejected}`
- `media_type` enum: `{photo, video}`
- `entries.rejection_reason text` column (from #34)
- Unique index `entries_one_live_per_student_class_round`
- FK `entries_student_id_fkey` (entries.student_id → profiles.id)
- `teacher_comments` table — known columns: `id, student_id, class_id, entry_id, round, body, created_at`

---

## TEST DATA STATE

### Classes

| name | total_rounds | round_duration_hours | notes |
|---|---|---|---|
| Spotlight — Mike's First Class | 3 | 0.25 | 24 seed entries + myked70 testing data |
| Spotlight — Mike's Second Class | 3 | 0.5 | 4 pending entries from #35 testing |

### Accounts

| email | display name | role |
|---|---|---|
| `getgroovr@yahoo.com` | Mike (getgroovr) | teacher + student |
| `myked70@yahoo.com` | myked | student in First Class |
| `myked70og@gmail.com` | Lovesick | student in First Class |
| `thomasoconnor@hotmail.com` | — | student, profile not finished |

### Seed voters
`seed-voter-5@test.local` through `seed-voter-12@test.local`. All entries `live`, `media_type = photo`. No auth accounts.

---

## NEXT CHAT — suggested flow

1. **Deploy + test the four files from this chat.** Check console for teacher_comments INSERT errors.
2. **Fix anything that breaks** (most likely: teacher_comments missing a NOT NULL column in the INSERT).
3. **Design conversation: media dropdown + multi-teacher.** Questions to resolve:
   - Where does the media-type dropdown go? Class settings? Per-round config?
   - `class_teachers` join table schema?
   - How does a creator invite additional teachers?
4. **If time:** Start on L5 (multi-submit shift logic in `addEntry`).

---

## CARRIED-FORWARD ITEMS (lower priority)

- B2: Student completed round expanded view missing classmate comments
- B3: `game_sessions.round` always 1 (play flow root cause)
- T3: Split pending queue into "Students pending admission" + "Pending photo submissions"
- "+ New class" affordance for teachers
- Game-start email notification
- Active-class lifecycle automation
- Dashboard ordering rework
- Privacy disclosure for comment-writers
- RPC `class_top_three_reveal` v2 round filter
- Catch-up migration file
- Reusable seed/demo-reset script

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
