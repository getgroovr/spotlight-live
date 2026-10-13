# SLICE 1A HANDOFF #4 — End of piece 3 session

**Date written:** 2026-05-28 (evening)
**Session length:** ~4 hours, ending around 4pm Phoenix time
**Picking up from:** Handoff #3 (after the 11-stale-rows cleanup)
**Going into:** Piece 3 verified working; real 9-photo upload still pending; multi-teacher discussion deferred

---

## What got accomplished this session

### ✅ Piece 3 shipped and verified working end-to-end

Two files changed, one SQL migration added:

1. **`src/app/teacher/deck/deck-client.tsx`** — replaced
   - Added live photo preview that renders as soon as a file is picked
   - Added inline "Edit" button per card with Save/Cancel for description editing
   - Object URL cleanup on file change and unmount (no memory leaks)
   - Preview auto-clears on successful upload
   - Each card is its own `StarterCard` subcomponent so opening one edit form
     doesn't affect siblings
   - No-op detection: if Save is clicked without changing text, just closes

2. **`src/app/teacher/deck/actions.ts`** — replaced
   - Added `updateStarterDescription(id, text)` Server Action
   - Same auth-check pattern as upload/delete
   - Shared `DESC_MIN`/`DESC_MAX` constants so upload and update can't drift
   - `revalidatePath` on both `/teacher/deck` and `/play` so edits propagate

3. **`src/app/teacher/deck/page.tsx`** — replaced
   - Changed bucket from `media` → `teacher-deck` (this was the long-running
     bug that prevented images from rendering)
   - Switched from `createSignedUrl` to `getPublicUrl` since the bucket is
     public-by-design. Faster (no roundtrip), URLs don't expire.
   - Kept the field name `signed_url` on the Starter type so deck-client
     doesn't need to change

4. **`supabase/migrations/20260528150000_fix_teacher_deck_storage_policies.sql`** — new
   - Replaces all three teacher-deck bucket policies (INSERT/UPDATE/DELETE)
   - New approach: gate on `profile.role = 'teacher'` rather than trying to
     verify class ownership inside the policy
   - Adds explicit public-read SELECT policy for both `anon` and `authenticated`
   - Migration was applied via SQL Editor AND saved to migrations folder

### 🐛 Bugs found and fixed

- **`storage.foldername(c.name)` typo** in the original migration — was
  referencing the class's name column instead of the uploaded object's path.
  Caught in handoff #4 session. The replacement policies don't use
  `storage.foldername` at all, so this class of bug is now structurally
  prevented.
- **Bucket name mismatch** — uploads went to `teacher-deck`, but `page.tsx`
  was still reading from `media`. That's why images said
  "(image unavailable)" even after uploads succeeded.

### 🧪 Diagnostic skills built up

Mike learned to find and use:
- Supabase **Logs & Analytics → Postgres** with severity filter for RLS errors
- Browser **DevTools Network tab** with filter syntax (`Img`, `All`, name search)
- SQL Editor for live policy bisection (`SELECT EXISTS (...)`-style tests)
- VS Code close-without-saving to recover from a botched hand-edit

These skills will pay off all session 2 and beyond. Worth noting.

---

## Where things stand right now

### Working
- Upload form with photo preview before description entry
- Edit description inline on existing cards
- Delete starter (mostly — see Known Issues below)
- Image rendering via public URLs against the teacher-deck bucket
- Storage RLS policies that match real-world usage (teacher-role gate)
- Three test starter rows in `entries` (dummy content like "fdsfasdf...")
- `/play` was last verified after the row delete in the previous session;
  not re-verified since the bucket/policy fixes today

### Not yet done
- The **9 real photos** are NOT in the system yet. The three rows currently
  in the pool are test uploads with junk text — they need to come out before
  the real uploads go in.
- `/play` end-to-end test in InPrivate with real photos
- The deferred UX items from previous handoffs (comment panel beside photo,
  describe-after-preview already done)

---

## Known issues, deferred items, loose threads

### 🔴 Known bug: Remove button can leave orphan UI artifact
Mike observed that deleting a card sometimes leaves a stale entry visible
in the pool until next page load. Likely cause: the Server Action calls
`revalidatePath` but React's optimistic UI state isn't being reset on
delete the way it is on edit. Low priority — doesn't affect data integrity,
the row really is deleted in the DB. Fix during piece 4 polish.

### 🟡 Three junk test rows in `entries`
Before uploading the 9 real photos tomorrow, clear these out. SQL:
```sql
DELETE FROM public.entries
WHERE class_id = 'd9ce91d4-793f-4ed9-81ea-201c0d15602e'
  AND is_starter = true;
```
The actual files in `teacher-deck` storage become orphans — clean them up
later or leave them; they don't show up anywhere user-facing.

### 🟡 No description-edit RLS policy on `entries` table
We added the storage policies but did NOT verify that the `entries` table
has an UPDATE policy allowing the teacher to update their own rows. If
clicking "Edit" → Save on a card fails with an RLS error tomorrow, this is
the cause. Easy fix: mirror the DELETE policy on entries for UPDATE.

### 🟡 Trade-off in new storage policies
The new INSERT/UPDATE/DELETE policies on `teacher-deck` check only "is this
caller a teacher?" — they don't enforce that the teacher owns the specific
class the file belongs to. The Server Action does that check. This means
if a second teacher account existed (it doesn't yet), they could in theory
write/edit/delete each other's starter photos at the storage layer by
bypassing the Server Action. Acceptable for Slice 1A because there's only
one teacher. Revisit when Slice 1B+ introduces multiple teachers.

### 🟢 Multi-teacher / favoriting / self-enrollment
Mike raised this in the chat *before* this one — the idea of three teachers
(Mike 1/2/3) with photos that students pick from to self-enroll into a
class. We agreed to keep piece 3 narrow and defer this conversation. It is
still on the table and is probably the right thing to discuss *after* the
9 real photos land and `/play` is verified.

### 🟢 Pre-existing `/dashboard` 404
Still there. Auth flow redirects to `/dashboard` after login, which doesn't
exist. Mike works around by manually typing `/teacher/deck`. Will fix in
piece 4 or whenever auth gets polished.

---

## Working agreement (unchanged)

- Mike holds: editor, Supabase dashboard, all keys, all pushes
- Claude holds: code, design, migrations, RLS, Server Actions, UI
- Claude never handles real keys, never pushes on Mike's behalf
- Build in named slices; Mike reviews every commit in Source Control
  before pushing
- The product is an English-teaching instrument whose purpose is to
  collect each student's language production for teacher evaluation

---

## First-message-to-next-Claude

Read this whole doc before doing anything. Mike has done a brutal day of
debugging — he's earned a clean start with minimal back-and-forth.

The system is in a working state with three junk test rows in the deck.
Mike's expected first move is one of:

1. **Clean test rows, upload the 9 real photos** — straightforward execution
   path, gets him to the front-door-opens milestone
2. **Verify `/play` works in InPrivate** before uploading real photos — slightly
   safer; catches any anon-read issue while there are still cheap test rows
3. **Multi-teacher design conversation** — deferred from earlier chats; would
   be a design session, not a coding session

Ask which he wants. Don't redo code review. Don't re-derive design decisions.
Read the known issues list above; if anything bites tomorrow, it's probably
on that list.

Mike's machine notes: Windows + VS Code, project at `C:\Users\Myked\projects\spotlight-live`,
PowerShell terminal, prefers whole-file copy-paste over hand-editing.

---

## Quick reference: useful SQL

```sql
-- Confirm teacher profile
select id, role from public.profiles where role = 'teacher';

-- Confirm public class
select id, teacher_id, name, is_public from public.classes where is_public = true;

-- See current starter pool
select id, media_url, description_text, uploaded_at
from public.entries
where class_id = 'd9ce91d4-793f-4ed9-81ea-201c0d15602e'
  and is_starter = true
order by uploaded_at;

-- Clear the test rows before real uploads
delete from public.entries
where class_id = 'd9ce91d4-793f-4ed9-81ea-201c0d15602e'
  and is_starter = true;
```

## Quick reference: useful PowerShell

```powershell
cd C:\Users\Myked\projects\spotlight-live
npm run dev
Get-Content .env.local
$env:GIT_PAGER = "cat"
```

## Key IDs (do not lose)

- Teacher (Mike) user id: `18f23db0-0b2f-4f30-914a-233c3a73c305`
- Public class id: `d9ce91d4-793f-4ed9-81ea-201c0d15602e`
- Supabase project ref: `ilctdtppstvmpvuvdqvf`
- Starter bucket name: `teacher-deck` (PUBLIC, contains the photos)
- Student/media bucket name: `media` (PRIVATE, future Slice 1B+)
