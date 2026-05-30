# SLICE 1B HANDOFF #6 — Enrollment + Student Dashboard

**Date written:** 2026-05-29 (afternoon)
**Session length:** ~6 hours (continuation of morning Slice 1A wrap)
**Picking up from:** Handoff #5 (Slice 1A complete, 9 real photos live, /play
  rendering end to end)
**Going into:** Slice 1B-iii — teacher dashboard. Plus one design refinement
  (the "why is this your favorite?" question) and several small parked items.

---

## What got accomplished this session

### ✅ Database: students, enrollments, game_sessions tables

Migration `20260529200000_slice1b_students.sql` adds three new tables plus a
`pod_number` column on entries. All have RLS enabled:

- `students` — id, name, email (unique), photo_url, created_at
- `enrollments` — student_id × class_id, round counter, enrolled_at, unique
  composite key
- `game_sessions` — student_id × class_id × round, comments + favorites as
  jsonb, completed_at
- `entries.pod_number` — nullable int (1, 2, 3); not yet used in UI

RLS policies allow:
- A student to read their own row by email match
- The teacher (Mike) to read enrolled students + their enrollments +
  their game sessions, gated on `classes.teacher_id = auth.uid()`

Inserts are done server-side via the service-role client (no client-side
insert policies needed — the enrollment Server Action is the perimeter).

### ✅ Enrollment Server Action

`src/app/play/actions.ts` — `enrollStudent(formData)`:
1. Validates name, email, photo (8MB max, jpeg/png/webp)
2. Uploads photo to `media` bucket (private)
3. Insert into `students` (or reuses existing row if email already known)
4. Upserts an `enrollments` row
5. Inserts a `game_sessions` row with the comments + favorite from
   localStorage
6. Calls `auth.signInWithOtp()` to email a magic link

Critical detail: the magic link is sent via `signInWithOtp`, NOT via
`auth.admin.generateLink`. The admin method generates a link but does
NOT email it (that one's for "I want to manually paste a link somewhere"
flows). signInWithOtp is the one that actually triggers the email send.
This took a wrong turn once; preserved in code comments.

### ✅ Redesigned end-of-game flow

`src/game/spotlight.jsx` — full rewrite of `DoneScreen`:
- **3×3 review grid** of (photo + comment) cells, max-width 580px, fits
  on one screen
- **Tap to favorite** — tapping a photo puts a star badge on it; tapping
  another moves the star
- **"Join the class →" button** stays greyed until a favorite is picked
- **No CSV download** — replaced with "No thanks — play again" link
- Removed the mid-game favorite toggle on ProfileCard (one favorite, picked
  at the end, was Mike's request)
- The favorite is local state until enrollment; if the student walks away
  before submitting the profile form, nothing is sent to the teacher

The data flow: comments accumulate in localStorage during play → student
picks favorite at end → student submits profile form → all of it is
persisted in one Server Action call as a game_session row.

### ✅ Student dashboard (the landing page after magic link)

`src/app/student/dashboard/page.tsx` — server component, no client JS:
- Reads auth session via the SSR Supabase client
- Looks up the student by email
- Pulls their most recent game_session
- Joins to `entries` to render the photo + comment grid
- Hero block for their favorite, with the photo's description_text and
  what they wrote
- "What happens next" panel that just explains round 2 is coming

Auth gate: if no session, redirects to /play. If session but no student
record, shows a "not enrolled" message.

### ✅ Email template customized

In Supabase dashboard → Authentication → Emails → Magic Link:
- Subject changed from "Your Magic Link" to "Your Spotlight invitation"
- Body still default Supabase HTML; can be made richer in a future pass

Sender domain is still `noreply@mail.app.supabase.io` (free tier).
Custom domain requires SMTP setup; parked for later.

### ✅ Supabase auth configuration verified

- Site URL: `http://localhost:3000` ✅
- Redirect URL allowed: `http://localhost:3000/**` ✅
- Email provider enabled ✅
- Confirm email: ON (means magic link is the verification step)

### ✅ .env.local updated

Added `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (used by the
enrollment action for the magic-link redirect target). Also confirmed
`SUPABASE_SERVICE_ROLE_KEY` is now populated.

### ✅ End-to-end test confirmed working (partial)

- Anonymous play through → review grid → favorite picked → profile form
- Server Action ran successfully, student row created, session saved
- Magic link sent and received in Yahoo inbox (clicked through to URL
  with auth token in fragment)
- Later attempts hit Supabase free-tier rate limit (`429: email rate
  limit exceeded`) — known limitation, not a bug

The student dashboard render path was NOT successfully verified end to end
because of the rate limit. The most recent test couldn't get a magic link
to click through. Next chat's first job is to verify a fresh magic link
lands on the dashboard and renders correctly.

---

## Where things stand right now

### Working
- /teacher/deck (unchanged from Slice 1A)
- /play full game loop
- New end-of-game review + favorite + enroll flow
- Enrollment writes student + enrollment + game_session
- Magic link email sends (rate-limited)
- Student dashboard route exists and compiles

### Not yet verified
- Clicking a fresh magic link → landing on dashboard → rendering favorite + comments correctly
  (was blocked by rate limit; should resolve within an hour or two of session end)

### Not done
- "Why is this your favorite?" question on the profile form (Mike asked
  for this at the very end of session — see Parked Item A below)
- Teacher dashboard (Slice 1B-iii) — the main job for next chat
- pod_number UI on /teacher/deck (column exists, no UI yet)
- Custom email sender domain (still using supabase.io)
- The session is NOT yet committed to git — see "Uncommitted work" below

### Uncommitted work (as of session end)
- `src/game/spotlight.jsx` — modified
- `src/app/play/actions.ts` — modified
- `src/app/play/page.tsx` — touched but restored via `git checkout` (no
  net change; verify with `git diff` before committing)
- `src/app/student/dashboard/page.tsx` — new file (untracked)
- `supabase/migrations/20260529200000_slice1b_students.sql` — new file
- `.env.local` — added NEXT_PUBLIC_SITE_URL (this file is gitignored,
  doesn't matter for commits)

Suggested first commit message for next chat: `slice 1B-i: enrollment +
student dashboard end-to-end`

---

## A near-miss worth remembering

Mid-session, the dashboard content got pasted into the WRONG `page.tsx`
file. The correct path is `src/app/student/dashboard/page.tsx`. The wrong
path was `src/app/play/page.tsx` — which then broke the /play game.

Caught by reading `git diff src/app/play/page.tsx`. Recovered with
`git checkout src/app/play/page.tsx`. No lasting damage.

The contributing factor was multiple `page.tsx` tabs open in VS Code from
different paths (including a stale copy on the Desktop). When giving Mike
file content to paste, ALWAYS lead with the full path AND tell him to
verify the breadcrumb at the top of the editor matches before pasting.

---

## Parked items (in priority order)

### Parked A: "Why is this your favorite?" on the profile form

Mike's last design suggestion of the session. The profile completion form
should also show the photo they picked and ask them to write a comment
about why. This is the **highest-value writing sample** of the whole game
(the teacher cares more about this than the other 9 comments).

Implementation sketch:
- In `EnrollForm` (inside `spotlight.jsx`), above the name field:
  - Show the favorited photo (large)
  - Add a textarea: "Why was this your favorite?"
  - Require minimum 15 chars
- Save the why-comment as a separate field in the `game_sessions.favorites`
  jsonb, e.g. `{ "<entry-id>": { "starred": true, "why": "<text>" } }` OR
  add a new `favorite_comment` column to `game_sessions`
- Surface it prominently in the student dashboard (already shows favorite
  in a hero block, just needs the why-comment added)
- Critical for teacher dashboard (Slice 1B-iii) — display the why-comment
  with weight, since this is the most personal writing sample

This should be done EARLY in the next chat, before building the teacher
dashboard, so the teacher dashboard can already show it.

### Parked B: Teacher dashboard (Slice 1B-iii)

The main thing to build next. From earlier in this session, what Mike
described:

> "A grid of students. Click a student, see their journey: their name +
> profile photo, Round 1: which photo they picked, what they wrote about
> it, Round 2: their own uploaded photo + what others wrote about it,
> Round 3, 4... same pattern."

For Slice 1B-iii we only need Round 1 — but build the shape so adding
rounds is just "more rows," not a redesign.

Suggested structure:
- `src/app/teacher/students/page.tsx` — cohort grid, list of enrolled
  students with profile photo + name + completion timestamp
- `src/app/teacher/students/[id]/page.tsx` — single student detail:
  their photo, their favorite (with why-comment if Parked A is done),
  their 9 comments alongside the photos they commented on

Both gate on `auth.uid()` matching the teacher; the existing RLS
policies should make the data access just work.

Cosmetic suggestion: link to the student detail page from the existing
`/teacher/deck` page so Mike doesn't have to type URLs.

### Parked C: Seed fake students for design

Before building the teacher dashboard, consider inserting 8 fake student
rows + enrollments + game_sessions directly via SQL so there's a realistic
cohort to design against. Doing it with one real student doesn't expose
layout problems the way 9 does.

### Parked D: Multi-round / class formation (carryover from Handoff #5)

Mike's framing locked in this session: the multi-round structure IS the
class. Round 1 is the audition / front door. Picking a favorite is the
enrollment act. Round 2+ is the class. Each round produces two artifacts
per student: what they responded to, and what they wrote. The teacher
dashboard surfaces those naturally as they accumulate.

This is the long arc. Slice 1B-iii (teacher dashboard) is just "make round
1 visible." Round 2 — students uploading their own photo, the deck
rotating — is a separate slice.

### Parked E (carryover): Multi-teacher / Slice 1C

Still parked. Storage RLS on `teacher-deck` gates on "is this a teacher?"
not "does this teacher own this class?" That's fine while there's one
teacher. When a second teacher is added, the storage policies need
revisiting — otherwise teacher B could in principle write/edit/delete
teacher A's photos at the storage layer (the Server Action would block it
through the UI, but not via a direct API call).

### Parked F: Custom email sender

Currently the magic link comes from `noreply@mail.app.supabase.io`. This
ends up in Yahoo's spam folder occasionally. Custom domain requires SMTP
provider setup (Resend, Postmark, SendGrid, etc.) and Supabase config to
point at it. Not urgent; revisit when there are more than a handful of
real users.

### Parked G: "Send my favorite to my new teacher" button label

Mike commented that "Join the class →" was good for the gating button on
the review grid. The button on the profile form was changed to "Send my
favorite to my new teacher →" — this is a Mike-approved phrasing but
worth revisiting once the why-comment (Parked A) lands, since the
phrasing could be more like "Send my favorite + my note →".

---

## Working agreement (unchanged from Handoff #5)

- Mike holds: editor, Supabase dashboard, all keys, all pushes
- Claude holds: code, design, migrations, RLS, Server Actions, UI
- Claude never handles real keys, never pushes on Mike's behalf
- Mike reviews every commit in Source Control before pushing
- **Whole-file artifacts preferred over line-edit instructions** — this
  bit Mike especially hard this session; respect it
- **When giving Mike a file, ALWAYS tell him the full path AND tell him
  to verify the editor breadcrumb matches before pasting** (see "near-miss"
  above)
- Mike works in PowerShell, Windows, VS Code at
  `C:\Users\Myked\projects\spotlight-live`
- Screenshots first when something's weird

---

## First-message-to-next-Claude

Read this whole doc before doing anything.

Mike's expected first move: ask whether the magic link → student
dashboard round-trip is now working. The rate limit from end-of-session
should have lifted. The first 5 minutes of next chat: have Mike test
that path and confirm the dashboard renders his favorite + comments
correctly.

If that works → start Parked A (why-comment on profile form). It's
small, high-value, and the teacher dashboard wants it.

After Parked A → Slice 1B-iii (teacher dashboard). Consider seeding fake
students first (Parked C) so design has real shape to work with.

Mike's machine: Windows + VS Code, project at
`C:\Users\Myked\projects\spotlight-live`, PowerShell terminal, prefers
whole-file copy-paste over hand-editing.

**Before first code, ask Mike to run:**
```powershell
git status
git log --oneline -5
```
and paste the output. Slice 1B is uncommitted as of this handoff; first
job may be to help him stage and commit before doing anything new.

---

## Quick reference

### Key IDs (unchanged)
- Teacher (Mike) user id: `18f23db0-0b2f-4f30-914a-233c3a73c305`
- Public class id: `d9ce91d4-793f-4ed9-81ea-201c0d15602e`
- Supabase project ref: `ilctdtppstvmpvuvdqvf`
- Starter bucket: `teacher-deck` (PUBLIC)
- Student/media bucket: `media` (PRIVATE)

### Useful SQL for Slice 1B

```sql
-- See enrolled students
select s.name, s.email, e.round, e.enrolled_at
from public.students s
join public.enrollments e on e.student_id = s.id
order by e.enrolled_at desc;

-- See a student's most recent session (replace email)
select gs.round, gs.comments, gs.favorites, gs.completed_at
from public.game_sessions gs
join public.students s on s.id = gs.student_id
where s.email = 'myked70@yahoo.com'
order by gs.completed_at desc;

-- Clear test data (BE CAREFUL — production has real Mike-uploaded entries)
-- This removes only student/enrollment/session rows; leaves entries alone
delete from public.game_sessions;
delete from public.enrollments;
delete from public.students;
```

### Useful PowerShell

```powershell
cd C:\Users\Myked\projects\spotlight-live
npm run dev
$env:GIT_PAGER = "cat"
git log --oneline -10
git diff src/path/to/file.tsx   # before making big edits
```

### Files most likely to need attention in Slice 1B-iii

- `src/app/teacher/students/page.tsx` — NEW route, cohort grid
- `src/app/teacher/students/[id]/page.tsx` — NEW route, student detail
- `src/app/play/actions.ts` — small edit if Parked A schema-extends game_sessions
- `src/game/spotlight.jsx` — small edit for the why-comment field on EnrollForm
- `src/app/student/dashboard/page.tsx` — add why-comment display if Parked A done
- New migration for `game_sessions.favorite_comment` if going that route
  (alternative: extend the existing `favorites` jsonb shape, no migration needed)
