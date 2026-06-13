# 2026-06-12 Slice 1 Handoff #37

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

## WHAT GOT DONE in chat #37

### Chunk 1 — Teacher student detail page fixes (SHIPPED & CONFIRMED)

All changes in one file: `src/app/teacher/students/[id]/page.tsx`.

| # | Issue | Status |
|---|---|---|
| D1 | Rounds now display ascending (1, 2, 3) not reversed | ✅ Shipped |
| D2 | New "Submissions" section shows student's own entries with status badges (APPROVED, AWAITING APPROVAL, NOT APPROVED, ARCHIVED) | ✅ Shipped |
| D3 | Submission photos load correctly (switched from `getPublicUrl` to `createSignedUrl` for media bucket) | ✅ Shipped |
| D4 | "Back to class" link now preserves class context via `?class={classId}` | ✅ Shipped |
| D5 | Teacher notes and rejection reasons display inline on each submission | ✅ Shipped |

**Two-track ID bridge:** The submissions query required resolving `students.id` → `student.email` → auth user → `profiles.id` to query entries. Uses `admin.auth.admin.listUsers()` with email match. Works fine at current scale but will need a cleaner lookup path (RPC or view) if user count grows significantly.

---

## DESIGN DECISIONS MADE in chat #37

### Moderation scope — DECIDED

What needs teacher approval:
- **Photo submissions (pic + description):** Already built. Approved via pending queue before next round starts.
- **Favorite comment (both the comment on the pic AND "why it's my favorite"):** NEEDS TO BE BUILT. Must be approved before end of game, since the winning student's favorite comment is shown to classmates in the round reveal.

What does NOT need approval:
- **Individual gameplay comments** on classmates' pics during a round. These are only visible to the teacher (on the student detail page). Never shown to other students.

### Teacher note architecture — RECONFIRMED from #36
One unified note per entry, stored in `teacher_comments` with `entry_id`. Displayed contextually based on entry status (rejection reason styling for rejected entries, "Your note" styling otherwise).

---

## BUGS — status tracker

| # | Description | Status | Where |
|---|---|---|---|
| B1 | Teacher student detail: all rounds labeled "ROUND 1" | ✅ Fixed in #36, display workaround confirmed in #37 | `[id]/page.tsx` |
| B2 | Student completed rounds: no classmate comments shown | 🔴 Not started (data-layer gap in `student-archive.ts`) | `student-archive.ts` |
| B3 | `game_sessions.round` always 1 / entries.round_number incorrect (play flow root cause) | 🔴 Not started — causes "Round 4" to appear in a 3-round class | `src/app/student/play/` |

---

## DB STATE AFTER CHAT #37

No schema changes. All changes are code-only.

- `entry_status` enum: `{pending, live, archived, rejected}`
- `media_type` enum: `{photo, video}`
- `entries.rejection_reason text` column (from #34)
- Unique index `entries_one_live_per_student_class_round`
- FK `entries_student_id_fkey` (entries.student_id → profiles.id)
- `teacher_comments` table columns: `id (uuid, PK), student_id (uuid, NOT NULL), class_id (uuid, NOT NULL), round (integer, nullable), body (text, NOT NULL), created_at (timestamptz, NOT NULL, default now()), entry_id (uuid, nullable)`

### Entries table columns (confirmed via schema query):
`id, student_id, class_id, media_url, media_type, description_url, description_text, description_l1, reading_audio_url, status, uploaded_at, reviewed_by, reviewed_at, is_starter, pod_number, round_number, rejection_reason`

---

## TEST DATA STATE

### Classes

| name | total_rounds | round_duration_hours | notes |
|---|---|---|---|
| Spotlight — Mike's First Class | 3 | 0.25 | 24 seed entries + myked70 testing data (11 pending submissions) |
| Spotlight — Mike's Second Class | 3 | 0.5 | Mike testing data: 3 approved entries, game complete |

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

1. **Favorite comment moderation.** This is the next feature to build. Needs:
   - Favorite comments surfaced in the pending queue (or a separate section) for teacher approval
   - Both the comment on the pic AND the "why it's my favorite" text need approval
   - Must be approved before game end (when round reveal shows the winner)
   - Files needed: `src/app/teacher/students/pending-queue.tsx`, `src/app/teacher/students/actions.ts`, and whatever stores the favorite/comment data (likely `game_sessions` with `comments`, `favorites`, `favorite_comment` fields)

2. **Seed Second Class** for more realistic testing. Currently only Mike is enrolled — no classmate interactions visible. Need seed entries + seed students so the teacher student detail page shows gameplay data (comments on classmates' pics).

3. **B3: Fix play flow round numbering.** The play flow always writes `round_number = 1` (or incorrect values like 4 in a 3-round class) to both `entries` and `game_sessions`. Root cause is in `src/app/student/play/`. This is the source of multiple display bugs.

4. **If time:** Start on L5 (multi-submit shift logic in `addEntry`).

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

---

## FILES PRODUCED in chat #37

| file (download name) | destination | what it does | status |
|---|---|---|---|
| `page.tsx` | `src/app/teacher/students/[id]/page.tsx` | D1–D5: ascending rounds, submissions section, signed URLs, back-to-class link | ✅ Deployed & confirmed |

No files pending deployment.

---

## FILES LIKELY NEEDED NEXT CHAT

| file | why |
|---|---|
| `src/app/teacher/students/pending-queue.tsx` | Add favorite comment moderation UI |
| `src/app/teacher/students/actions.ts` | Add favorite comment approve/reject actions |
| `src/app/student/play/` directory listing | B3: understand play flow to fix round numbering |
| `src/app/student/play/actions.ts` (or equivalent) | B3: where entries + game_sessions are created |
