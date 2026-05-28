# Spotlight Live — Slice 1A handoff #2 (verification in progress)

Public repo: https://github.com/getgroovr/spotlight-live.git
Branch: `slice-1a` (already pushed to origin)
Commit: `3dcba33` — "Slice 1A: generic deck reads from DB; teacher upload UI; photo rendering"

## Read first (same as before)
1. `BUILD_PLAN.md` — product and slice order. Slice 1A still in scope until verification passes.
2. `SCHEMA_AUDIT.md` — table-by-table audit.
3. `AGENTS.md` — points at `node_modules/next/dist/docs/`. Bundled Next.js 16.2
   docs in the npm package. `npm install`, then read those before writing
   Next.js code. Training data is older than 16.2 (middleware → proxy,
   async cookies(), etc.).
4. The original handoff (`SLICE_1A_HANDOFF.md` if you have it, or the file
   inventory inside that file is reproduced in commit `3dcba33`'s message).

## Where things stand right now
Slice 1A code is **committed and pushed**. Code review (last session) found
**zero blockers** across the four highest-risk files (migration 10,
`src/lib/deck.ts`, `src/app/teacher/deck/actions.ts`, `src/app/play/page.tsx`).
Verification is **partially complete**:

- ✅ Migration 10 applied successfully in Supabase (`ilctdtppstvmpvuvdqvf`
  project, "groovr-creator").
- ✅ Teacher profile created via signup, promoted to `role = 'teacher'`.
  Teacher profile id: `18f23db0-0b2f-4f30-914a-233c3a73c305`.
- ✅ Public class created. Class id: `d9ce91d4-793f-4ed9-81ea-201c0d15602e`.
- ✅ `.env.local` updated and pointing at the right project. All four
  required vars present:
    - `NEXT_PUBLIC_SUPABASE_URL=https://ilctdtppstvmpvuvdqvf.supabase.co`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...` (publishable key,
      new short format; replaced the old long JWT)
    - `SUPABASE_SERVICE_ROLE_KEY=` (intentionally empty — Slice 1A doesn't
      use service role)
    - `NEXT_PUBLIC_DEMO_CLASS_ID=d9ce91d4-793f-4ed9-81ea-201c0d15602e`
- ✅ Dev server restarted with new env.
- ✅ Mike confirmed he can reach `/teacher/deck` after signing in (a 404
  appears in between on `/dashboard`; see "Pre-existing bugs" below).

**What's NOT yet verified:**
- ❌ Photos uploaded (none yet — this is the next step).
- ❌ The untested assumption: anon `createSignedUrl` against a private
  bucket. Lives in `src/lib/deck.ts` at the `createSignedUrl` call.
  RLS in migration 10 should authorize this; needs proof.

## First message to next-Claude
Mike will be signed in as teacher and wants to start uploading photos.
The right opening move is:

1. **Don't do code review again.** It's done; zero blockers found.
2. **Don't re-apply the migration.** Already done in `ilctdtppstvmpvuvdqvf`.
3. **Drive Mike through uploading nine photos at `/teacher/deck`**, then
   the InPrivate-window test of `/play`. That's verification step 4–5 in
   `SLICE_1A_MANUAL_STEPS.md`.
4. **Watch for the untested assumption.** If photos don't render for the
   anon visitor in the InPrivate window, the fallback options are:
   - Pre-sign at upload time and store the signed URL on the entries row
   - Switch to a service-role-signed path for the public deck only
   The handoff acknowledges this; don't be surprised if a fix lands here.

## Verification steps remaining
4. Sign in at `http://localhost:3000/auth/login` as the teacher account.
   (Don't use the signup flow again — already signed up.)
5. Go directly to `http://localhost:3000/teacher/deck` by typing the URL.
   The post-signup redirect to `/dashboard` is broken (pre-existing bug,
   not Slice 1A's fault); typing the URL bypasses it.
6. Upload nine photos with descriptions (≥10 chars, ≤1000 chars each).
   Allowed types: JPEG, PNG, WebP. Max 8 MB per file.
7. Open `/play` in an **InPrivate window** (Ctrl+Shift+N in Edge). The
   photos should render. If they don't, that's the untested assumption
   failing; see "fallback options" above.

## Pre-existing bugs (NOT Slice 1A's concern, but worth tracking)
1. **Post-signup redirect to `/dashboard` 404s.** The signup flow sends
   the user to `/dashboard` which doesn't exist as a route. Workaround:
   type the destination URL manually (`/teacher/deck`, `/play`, etc.).
   Worth fixing in a separate slice eventually.
2. **The login form file (`src/app/auth/login/page.tsx`) showed up in
   the error trace during signup debugging.** That might just be the
   "already have an account?" link reusing the login handler — but worth
   eyeballing if anyone touches auth flow next.

## Loose threads (defer until after Slice 1A verification)
1. **Rollback block in `SLICE_1A_MANUAL_STEPS.md` is incomplete.** It
   recreates the original unique index `where status = 'live'` (no
   `is_starter` carve-out). If starter rows exist when rollback runs,
   the index creation fails because multiple live rows share
   `(student_id, class_id)`. Fix: add a `delete from public.entries
   where is_starter = true;` step before the index recreation. Not
   urgent; rollback isn't expected to run.
2. **`entries_public` view dependency is implicit.** Both `deck.ts` and
   the migration assume the view exposes `class_id` and `status` and
   omits `reading_audio_url`. Worth a SCHEMA_AUDIT entry pinning the
   expected column list so future changes don't silently break the
   anon read.

## Decisions still locked in (don't re-litigate)
Same as the original handoff. The big ones:
- Anonymous visitors must be able to play the generic deck.
- Photos, not videos, for the demo deck.
- 3-second soft timer beat for photo display.
- Nine-or-nothing for `/play`.
- `/teacher/deck` is the durable workflow, not throwaway seed plumbing.
- SSR Supabase client signs URLs, no service-role key (the untested
  assumption).

## When verification passes, move to Slice 1B
Per BUILD_PLAN:
- When a logged-in user plays, write a `sessions` row at session start
  and `session_comments` rows as they comment.
- Unique `(session_id, entry_id)` constraint already means re-commenting
  updates the same row, matching the engine's behavior.
- **Open question to decide with Mike at the start of 1B**: for
  not-yet-signed-up visitors, either (a) hold comments in browser memory
  and hydrate on signup at the end, or (b) require signup before playing.

## Working agreement reminders
- Mike holds: editor, Supabase dashboard, all keys, all pushes.
- Claude holds: code, design, migrations, RLS, Server Actions, UI.
- Claude never handles real keys, never pushes on Mike's behalf.
- Build in named slices; Mike reviews every commit in Source Control
  before pushing.
- The product is an English-teaching instrument whose purpose is to
  collect each student's language production for teacher evaluation.

## Quick reference: useful PowerShell commands
```powershell
# Project root
cd C:\Users\Myked\projects\spotlight-live

# See env file
Get-Content .env.local

# See which env vars the code reads
Select-String -Path src\lib\*.ts -Pattern "NEXT_PUBLIC_SUPABASE"

# Disable git pager for this session (helps with code review)
$env:GIT_PAGER = "cat"

# Show a file from the commit without diff formatting
git show 3dcba33:path/to/file > review.txt
notepad review.txt
```

## Quick reference: useful SQL
```sql
-- All profiles
select id, role, created_at from public.profiles order by created_at;

-- Public classes (should show one row)
select id, teacher_id, name, is_public, created_at
from public.classes where is_public = true;

-- Starter entries in the public class (should reach 9)
select id, media_url, description_text, uploaded_at
from public.entries
where class_id = 'd9ce91d4-793f-4ed9-81ea-201c0d15602e'
  and is_starter = true
order by uploaded_at;
```
