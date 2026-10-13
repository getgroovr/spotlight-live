# SLICE 1A HANDOFF #5 — End of session, /play renders real photos

**Date written:** 2026-05-29 (morning)
**Session length:** ~5 hours
**Picking up from:** Handoff #4 (piece 3 shipped, 9 real photos pending)
**Going into:** Slice 1A is functionally complete. Next chat opens with a
  design conversation about Slice 1B (class formation), NOT with code.

---

## What got accomplished this session

### ✅ Delete bug fixed (the real one, not just the UI artifact)

The "Remove leaves a stale card" symptom from handoff #4 turned out to be
hiding a worse bug: the `entries` table had policies for INSERT (×2),
SELECT (×3), and UPDATE (×2) — but **zero** policies for DELETE. With RLS
on and no DELETE policy, Postgres silently filtered every delete attempt
to zero rows affected and returned no error. The Server Action's storage
cleanup ran anyway, so the storage file vanished while the DB row stayed.
Visible symptom: card stays in the pool after Remove, then images render
as broken on next page load.

**Fix in three parts, all in one commit:**

1. **Migration `20260529130000_add_entries_delete_policy.sql`** — adds the
   missing DELETE policy. Mirrors the existing UPDATE policy
   (`owns_class(class_id)` gate). Applied via SQL Editor and saved to
   `supabase/migrations/`.

2. **`actions.ts` — hardened `deleteStarter`.** The delete call now uses
   `.delete().eq("id", entryId).select("id")` and treats an empty result
   as a permission failure. This means even if a future migration ever
   drops or breaks the DELETE policy again, the bug will surface as a
   visible red error instead of silently orphaning storage files.

3. **`deck-client.tsx` — optimistic UI for Remove.** Used `useOptimistic`
   so the card vanishes immediately. If the Server Action fails, the
   optimistic state is discarded automatically and the card reappears
   alongside the error message. Also doubles as a diagnostic — if delete
   ever fails again, the visual "blip" makes it obvious.

### ✅ Tighter pool grid

Pool grid now ladders 1 → 2 → 3 → 4 columns. On a wide monitor nine
photos sit comfortably without scrolling. Was the second piece of
`deck-client.tsx` in the same change.

### ✅ Three test rows cleared, 9 real photos uploaded

Storage is now populated with the real starter photos. Each card has a
real description. `entries_public` has 9 live starter rows for the public
class.

### ✅ `/play` now renders real photos end-to-end

Mike noticed in InPrivate that the deck was showing colored letter
avatars instead of photos. The engine (`src/game/spotlight.jsx`) was
forked from the matching-game template and still had the old "colored
initial circle" rendering throughout. Fixed three things:

1. **`stop` function** — for photo entries, jumps straight to the reveal
   card (skipping the 3-second "VideoStage" beat). The photo is now the
   visual hero of the reveal card itself, so a separate display beat
   would be redundant. Video entries (future Slice 2+) still play through
   the playing→reveal sequence.

2. **`ProfileCard`** — when the entry is a photo, renders a 4:3 photo as
   the hero element in place of the colored letter avatar. The photo
   stays on screen the entire time the student is reading the description
   and writing their comment. This was Mike's central request: "let the
   photo stay visible until the comment is done."

3. **`StageGrid`** — each spin tile shows a square thumbnail of the
   actual photo instead of a colored letter. Falls back to the original
   Avatar for video entries or missing media.

All three changes are minimal, backwards-compatible (the avatar fallback
still works), and ship in a single commit.

### ✅ Two clean commits pushed

- `slice 1A: deck working end-to-end` — bundled everything that had been
  uncommitted since handoff #3, including yesterday's bucket fix and
  today's delete policy work. Seven files in one commit; a bit big but
  legitimate carryover.
- `feat: show real photos in spin grid and reveal card` — the spotlight
  redesign.

---

## Where things stand right now

### Working
- `/teacher/deck` upload, edit, delete — all three operations clean
- 9 real photos in the pool
- `/play` renders the real photos on the spin grid
- Stop → comment card shows the real photo, description, and a comment
  textarea, all on one screen
- Comment-gated continue (8-char minimum)
- End-of-game CSV download
- localStorage save/resume (per playerName)

### Verified end-to-end
- Anonymous InPrivate visitor can play through
- Comments save locally
- The CSV download works (the legacy artifact path from the desktop build)

### Not done / not started
- Slice 1B: class formation. See "Next chat plan" below.

---

## Next chat: open with design, NOT code

Mike spent the last hour of this session sketching the next phase out
loud. The conversation got messy on purpose — he wanted to think through
half-formed ideas. The shape that emerged is worth preserving.

### The product reframe (this is the key insight)

The /play "game" is not really a game. It is an **audition**.

For the teacher, the 9 photos are a way of putting their voice in front
of prospective students. For the student, the 20-minute writing
experience is the entry exam — the warmup that proves to themselves they
can do this in English. The CSV at the end isn't the product. The CSV is
proof of engagement that justifies the student saying "yes, I want to
keep going with this teacher."

This reframes everything:

- The game is the **front door** of the class.
- The class is what students do after the game, if they choose to.
- The CSV is for one-off teachers who want a drop-in tool with no
  persistent layer.
- Enrolled students get a return path — see teacher responses, see other
  students' comments (with moderation), upload their own photos.
- Both modes live in the same codebase. The class layer is opt-in.

This means Slice 1B has a natural split:

- **Slice 1B-i**: student accounts + the "join a class" door at end of
  game (optional, opt-in)
- **Slice 1B-ii**: the class layer — teacher dashboard, response
  writing, student return visit, peer-comment moderation queue
- **Slice 1C+**: multi-teacher, pods-as-classes, rolling pool

### Design decisions Mike has already made

These don't need re-litigating. Document them, build on them.

1. **Pods are in.** Each teacher uploads 9 photos in 3 groups of 3. The
   teacher picks a shuffle preference in their profile: "one pod
   exclusively," "one photo from each pod," or "fully random." Pods let
   teachers theme their class (food / weather / people) or just organize
   their content.

2. **A teacher with 3 pods may run 3 different themed classes.** Each
   pod becomes its own class. A student who favorites a food photo joins
   the food class. One teacher = potentially 3 separate classes filling
   in parallel. This is mike's preferred model.

3. **Anonymous game.** Students don't see teacher names during the game.
   They pick on the content, not the reputation.

4. **End-of-game flow:** pick favorite + write a "why this is my
   favorite" comment. Only the teacher of that photo sees the why-comment.
   Other students never see it.

5. **Teacher count strict to 1, 3, or 9.** 9 / N photos per teacher. 3
   teachers × 3 photos = the sweet spot (enough content per teacher for
   a student to read their voice, manageable choice for the student).
   Single-teacher mode also valid for teachers who want a solo class.

6. **No auto-rebalance.** Admin (Mike) sets teacher count *first*, then
   teachers populate. If teacher #2 joins after #1 has populated, the
   pool doesn't auto-shrink #1's photos.

7. **Rolling pool (for later, Slice 1C).** Once a teacher's class is
   full, their photos rotate out and a new teacher's photos rotate in.
   Time-limited so stale teachers don't block the queue.

8. **Mike is sole admin / owner.** Approves each teacher manually,
   reviews their 9 photos before they go live. No public teacher signup.

9. **Peer comments (Slice 2+).** Students can opt to share their
   comments with the photo's uploader and that photo's other
   commenters. Teacher is gatekeeper — comment goes pending → teacher
   approves or blocks → only approved comments are visible. Student
   opt-in is per-comment. **Build infrastructure that doesn't paint us
   into a corner**, but don't design the moderation UI in Slice 1B.

### Threads Mike explicitly parked

These came up during the hike-driven brainstorm. Mike asked to revisit
the first one at the *start* of the next chat before jumping back to
Slice 1B implementation.

**Parked thread A: the multi-round curriculum idea.**

Mike's sketch: round 1 is the normal 9-photo game. Student picks top 3
favorites. Those 3 stay visible (greyed, static). Six students then
upload their own photos. Those 6 become round 2's deck. Students play
round 2. Top 3 of round 2 join the row of original 3. Repeat. By end of
sequence there are 9 student-chosen winners.

Claude's read: this isn't a game, it's a **multi-week curriculum
structure**. Each round is a normal game; the multi-round shape is
*what happens between games*. Worth discussing because it might
illuminate what "class mode" actually looks like over time. **Open the
next chat with this conversation.** It may reframe Slice 1B-ii. Or it
may confirm we should park it permanently. Either way, do it before
writing code.

**Parked thread B: teacher workload / "sweet spot."**

Mike noticed that 9 students × 9 comments = 81 comments per game per
teacher. He floated 6 as more manageable, 3 maybe ideal. Options
discussed: smaller cohorts, sampling, peer-rating-first-then-teacher,
tiered ("starred only" + browse). **This is a Slice 2 problem, not 1B.**
Mike agreed. Mentioned again here so it doesn't get lost.

**Parked thread C: student dropoff / 1-on-1 path.**

Mike mused about a student dropping out of class-mode but continuing
1-on-1 with the teacher. Possibly a paid tier. Definitely not Slice 1B.
Noted for future.

### Business shape

Mike is settling toward: **build it for his own teaching, then license
it to other ESL teachers who want the same thing.** Not pursuing school
district contracts. The ~$50-200/teacher/month range is the realistic
target if/when other teachers want in. This shapes design in one
specific way: don't over-build for multi-tenancy now. Build for "Mike
plus a handful of teachers Mike knows." If it works, generalize later.

### Security debt to remember

The storage RLS policies on `teacher-deck` use a "is this caller a
teacher?" gate, not a "does this teacher own this class?" gate. This was
explicitly accepted as a trade-off for Slice 1A because there is only
one teacher. **When Slice 1C introduces multi-teacher, the storage
policies need revisiting** — otherwise teacher B could in principle
write/edit/delete teacher A's photos at the storage layer (the Server
Action would block it through the UI, but not through a direct API
call).

---

## Working agreement (unchanged)

- Mike holds: editor, Supabase dashboard, all keys, all pushes
- Claude holds: code, design, migrations, RLS, Server Actions, UI
- Claude never handles real keys, never pushes on Mike's behalf
- Mike reviews every commit in Source Control before pushing
- Whole-file artifacts preferred over line-edit instructions
- Mike works in PowerShell, Windows, VS Code. Project at
  `C:\Users\Myked\projects\spotlight-live`
- Screenshots are the fastest debugging path with Mike — ask for them
  when something's weird

---

## First-message-to-next-Claude

Read this whole doc before doing anything.

Mike's expected first move is **a design conversation about the
multi-round / curriculum idea** (parked thread A above). Do NOT jump
straight into Slice 1B implementation. Mike specifically asked to
revisit that conversation first.

Frame the conversation this way:
- Reflect back the multi-round sketch as you understand it
- Press on whether it's still a game or has become a class structure
- Ask Mike whether his answer is "the game is the unit, the multi-round
  shape is the class layer using the game as its building block" — that
  was where the previous conversation landed but he wanted to revisit
- Help him decide: keep the multi-round idea in the roadmap, or
  permanently park it
- Then move to Slice 1B scoping

When you do reach Slice 1B, the design decisions in "Design decisions
Mike has already made" above are settled. Don't re-litigate them.

Mike's machine: Windows + VS Code, project at
`C:\Users\Myked\projects\spotlight-live`, PowerShell terminal, prefers
whole-file copy-paste over hand-editing.

---

## Quick reference

### Key IDs (do not lose)

- Teacher (Mike) user id: `18f23db0-0b2f-4f30-914a-233c3a73c305`
- Public class id: `d9ce91d4-793f-4ed9-81ea-201c0d15602e`
- Supabase project ref: `ilctdtppstvmpvuvdqvf`
- Starter bucket: `teacher-deck` (PUBLIC)
- Student/media bucket: `media` (PRIVATE, future Slice 1B+)

### Useful SQL

```sql
-- See current starter pool
select id, media_url, description_text, uploaded_at
from public.entries
where class_id = 'd9ce91d4-793f-4ed9-81ea-201c0d15602e'
  and is_starter = true
order by uploaded_at;

-- See all policies on entries
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'entries'
order by cmd, policyname;

-- See all policies on storage.objects (for teacher-deck)
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;
```

### Useful PowerShell

```powershell
cd C:\Users\Myked\projects\spotlight-live
npm run dev
$env:GIT_PAGER = "cat"
git log --oneline -10
```

### Files most likely to need attention in Slice 1B

- `src/game/spotlight.jsx` — engine. The end-of-game DoneScreen is where
  the "pick favorite + join class" door belongs.
- `src/lib/deck.ts` — DB → engine adapter. Will need to pass through
  more entry metadata (pod number, teacher id) when Slice 1B-ii lands.
- New migration(s) for: students table, enrollments table, pod_number
  column on entries, teacher shuffle-preference column on profiles.
- `src/app/teacher/deck/page.tsx` and `actions.ts` — pod assignment UI
  when uploading.
- New route(s): `src/app/student/...` for the return-visit class
  experience (Slice 1B-ii).
