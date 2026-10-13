# SESSION 65 HANDOFF — 6/27/2026

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT SESSION" section for the suggested flow.

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

---

## What happened in session 64

### Chunk D — Teacher Dashboard Multi-Teacher Audit (COMPLETE)

Full audit of all teacher-facing files for multi-class/multi-teacher readiness:

**Already multi-teacher-ready (no changes needed):**

- **`src/app/teacher/students/page.tsx`** — Gold standard. Queries classes by `teacher_id`, has `?class=` param for class switching, ClassHeader renders all teacher's classes. Pending queues and student grid scoped to `selectedClass.id`.
- **`src/app/teacher/students/[id]/page.tsx`** — Properly gated. Fetches all classes owned by `teacher_id = user.id`, checks enrollment against those class IDs via `.in("class_id", classIds)`. Sessions, entries, submissions all scoped to `enrollment.class_id`.
- **`src/lib/class-deck.ts`** — Student-facing deck loader. Scoped through the student's enrollment chain, not the teacher. Each student is in one class, each class belongs to one teacher. No multi-teacher changes needed.

**Needs work (DEFERRED — blocked on admin design):**

- **`src/app/teacher/deck/page.tsx`** — Finds its class via `NEXT_PUBLIC_DEMO_CLASS_ID` env var or first `is_public: true` class. Neither is teacher-scoped. With multiple teachers, Teacher B could see Teacher A's public class.
- **`src/app/teacher/deck/actions.ts`** — Same problem. `uploadStarter` uses the same pinned/is_public class lookup. Not teacher-scoped.
- **`src/app/teacher/deck/deck-client.tsx`** — Client component, no class logic of its own. Will inherit the fix from page.tsx + actions.ts.

**Why deferred:** The warm-up deck's class-scoping ties directly into the admin/teacher-selection system Mike described (see "Admin & Warm-Up Deck Design" below). No point rewriting it now when the admin design will reshape how classes and teacher slots work.

### New file delivered

- **`src/app/teacher/page.tsx`** — Simple redirect to `/teacher/students`. Prevents the 404 when hitting `/teacher`.

### Housekeeping

- **`src/app/teacher/social/`** — Empty folder. Mike confirmed it should be deleted. Just delete the folder from the file system.

---

## Admin & Warm-Up Deck Design (NEW — from session 64 discussion)

Mike described the full vision for how teachers and the warm-up round interact. This is the key architectural piece that needs to be designed before the deck page can be rebuilt.

### How the warm-up round works

The warm-up round is the recruitment mechanism. Students who aren't in a class yet play a warm-up round using photos provided by teacher(s). The student self-selects a teacher by favoriting that teacher's photo. After the warm-up, the student joins the class of the teacher whose photo they favorited.

### Warm-up deck configurations

The warm-up grid always shows 9 photos. The admin controls how many teachers contribute:

| Config | Teachers | Photos per teacher | How student picks |
|--------|----------|--------------------|-------------------|
| 1 teacher | 1 | 9 photos | Student joins that teacher's class automatically |
| 3 teachers | 3 | 3 photos each | Student favorites one → joins that teacher |
| 9 teachers | 9 | 1 photo each | Student favorites one → joins that teacher |

### Teacher photo pool

Each teacher uploads many photos (e.g. 20) into the warm-up deck. Each photo has an **active/inactive** status. When a teacher is in the warm-up rotation, the admin (or system) activates the right number of their photos (1, 3, or 9 depending on config). Each photo in the deck is tagged with its owning teacher.

### Admin role and controls

The admin is a new role (not yet built). Admin responsibilities:

1. **Teacher ordering/rotation** — Admin maintains an ordered list of teachers. The teacher at the top of the list is the one whose photos are currently in the warm-up deck, actively recruiting students.
2. **Class fill → rotate** — When the current teacher's class fills up (hits capacity), the system rotates to the next teacher in the list. That teacher's photos become active in the deck.
3. **Teacher class limits** — Admin sets how many classes each teacher can have. A teacher who wants 3 classes stays in the rotation until they've filled 3 classes. The limit is set by the admin (teacher can request, admin approves).
4. **Multi-pass rotation** — First pass: every teacher gets one class. Second pass: teachers who want 2+ classes get another. Third pass: teachers who want 3+ classes. And so on.
5. **Admin dashboard** — Separate view showing all teachers, their class counts, rotation status, and capacity settings.

### Design principles (from Mike)

- Keep it simple at first, add complexity as needed.
- The single-teacher warm-up (1 teacher, 9 photos) is the MVP. Multi-teacher warm-up (3 or 9 teachers) is the stretch goal.
- Build so the system CAN expand to multi-teacher warm-ups, but don't implement that complexity yet.
- Admin ordering/rotation and class limits are more important than the multi-teacher warm-up game.

### What this means for the database

New tables or columns likely needed (not yet designed):

- `profiles.max_classes` or similar — admin-set limit on how many classes a teacher can have
- `profiles.rotation_order` or a separate `teacher_rotation` table — admin-controlled ordering
- `entries.is_active` — active/inactive flag for warm-up deck photos (currently all starters are implicitly active)
- Admin role in `profiles.role` (currently only 'teacher' and 'student' exist)
- Possibly a `warm_up_config` table or setting — how many teachers per warm-up (1/3/9)

---

## Open bugs — status update

| # | Description | Priority | Status |
|---|---|---|---|
| B41 | No photo preview in teacher's review card for picture submittals | MEDIUM | Open |
| B48 | Lock favorites after next-round photo upload — remove editing, full-screen celebration | HIGH | Open |
| B49 | Comment editing rules — non-favorites editable until round close, favorite locks on submit | MEDIUM | Open |
| B54 | Completed round section on dashboard should collapse/minimize | LOW | Open |
| B55 | After replaying completed round, button should become "Back to dashboard" | MEDIUM | Open |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B64 | Remove "WHY IT'S MY FAVORITE" section from teacher review card | MEDIUM | Open — needs teacher review component |
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | Open — needs play component |
| U2 | Make "upload your photo for next round" more button-like and prominent | LOW | Open — needs play component |
| U3 | Hide raw filename once photo preview is showing | LOW | Open — needs upload component |

### Closed / verified this session

| # | Description | Notes |
|---|---|---|
| — | Teacher dashboard multi-teacher audit | Complete — students pages already scoped, deck deferred |
| — | `/teacher` 404 | Fixed — redirect to `/teacher/students` |
| — | Empty `social/` folder | Flagged for deletion |

---

## Ideas list

1. **Admin dashboard** — admin limits how many classes a teacher can create; system oversight. NOW EXPANDED — see "Admin & Warm-Up Deck Design" section above.
2. **Student → teacher messaging** — button in student profile to message the teacher
3. **Student → admin messaging** — separate button to message the admin/support
4. **Auto-class-creation** — when class hits capacity, system auto-creates next class. TIES INTO admin rotation system.
5. **Teacher sets desired number of classes** — "I want 4 classes" → admin approves limit → rotation fills sequentially
6. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough
7. **Round gap timing UI** — student-facing countdown for submission deadline; teacher-facing review window
8. **"Party setup" holding page** — after final round, students see countdown to results reveal
9. **Tie-handling in awards** — with 9 students, ties are common. May need tie-breaking or "shared gold" display.
10. **Awards ceremony timing polish** — Mike may want to adjust reveal durations, podium sizing, or add sound effects after live testing.
11. **Multi-teacher warm-up game** — 3 or 9 teachers in one warm-up round, students pick their teacher by favoriting. Stretch goal — build infrastructure to support it but don't implement yet.
12. **Teacher rotation system** — Admin-controlled ordered list. When a class fills, next teacher's photos go into the warm-up deck automatically.

---

## NEXT SESSION (65): Admin Design + Remaining Bugs

Two possible directions. Mike should pick based on priority:

### Option A — Admin & Deck Redesign

Design the admin system and rebuild the deck page. This is the bigger architectural piece.

**Step 1: Schema design.** Work out the new tables/columns for admin role, teacher rotation, class limits, and active/inactive deck photos. Write the migration SQL.

**Step 2: Admin dashboard.** New route (`/admin/` or `/admin/dashboard`). Shows all teachers, their class counts, rotation order, and class limits. Admin can reorder teachers and set limits.

**Step 3: Deck page rebuild.** Replace the hardcoded `DEMO_CLASS_ID` / `is_public` logic. Each teacher manages their own photo pool. Active/inactive toggle per photo. The warm-up deck pulls active photos from the currently-rotating teacher(s).

**Files needed:**
1. This handoff
2. Schema dump: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`
3. Current RLS policies: `SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public';`

### Option B — Bug Bash (Chunk C remainders + high-priority bugs)

Knock out the remaining UI bugs that need specific component files.

**B48 (HIGH):** Lock favorites after next-round photo upload.
**B64 (MEDIUM):** Remove "WHY IT'S MY FAVORITE" from teacher review card.
**B41 (MEDIUM):** Photo preview in teacher review card.
**U1-U3 (LOW):** Various copy/UI tweaks.

**Files needed:**
1. This handoff
2. For B48: the student dashboard component and the play/game-shell component
3. For B64: the teacher pending-queue component (the review card that shows in `students/page.tsx`)
4. For U1-U3: the spotlight play component and file-upload component

### Recommended

Option A if Mike wants to move the architecture forward. Option B if Mike wants to polish what's already built. Either way, the session can be productive — A is design-heavy, B is implementation-heavy.

---

## Files delivered this session

| File | Destination | Action |
|------|-------------|--------|
| `teacher-page.tsx` | `src/app/teacher/page.tsx` | NEW — create this file |
| `src/app/teacher/social/` | — | DELETE this empty folder |

---

## Files to upload at the start of next chat

### For Option A (admin design):
1. This handoff
2. Schema dump SQL output
3. RLS policies SQL output
4. `src/app/teacher/deck/page.tsx` (already seen, but include for reference)
5. `src/app/teacher/deck/actions.ts` (already seen, but include for reference)

### For Option B (bug bash):
1. This handoff
2. `src/app/teacher/students/pending-queue.tsx` (or whatever the review card component is called — for B64, B41)
3. `src/app/student/dashboard/page.tsx` (or the student dashboard — for B48)
4. `src/game/shell.tsx` or the spotlight play components (for U1, B48)
5. The file-upload component (for U2, U3)
