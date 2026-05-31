# SLICE 1B HANDOFF #8 — Teacher note write-back + Returning-student login

**Date written:** 2026-05-31 (AM)
**Picking up from:** Handoff #7 (Profile v1 committed; teacher dashboard built
  + verified but uncommitted)
**Going into:** Round 2 (the big arc) is the next major build. Several small
  parked slices are ready to grab first if you want quick wins.

---

## TL;DR for next Claude

1. **Everything from this session is COMMITTED.** Two slices landed and were
   verified end to end:
   - **Teacher note write-back (per-photo)** — the recruit mechanism.
   - **Returning-student login** — `/student/login`, email → magic link →
     profile, no game replay.
2. The teacher dashboard from Handoff #7 also got committed at the start of
   this session (it was the uncommitted item #7 worried about — now safe).
3. **Local branch `slice-1a` is AHEAD of `origin/slice-1a` by a few commits —
   NOT pushed.** Mike pushes himself; confirm whether he wants to push.
4. No active bugs. App compiles and runs. (VS Code shows ~138 "Problems" but
   that's pre-existing type-checker noise across the project, not errors in
   our routes — every page loads with 200s.)

**Mike's expected first move:** confirm git state, decide push, then either
pick a small parked slice or start Round 2.

---

## What got accomplished this session

### ✅ Teacher note write-back — per-photo (COMMITTED, VERIFIED)

The recruit mechanism. A teacher writes a note attached to ONE specific photo
the student commented on; it appears on the student's profile UNDER that photo.
Photos with no note show nothing extra — no empty slot (Mike's explicit design
call). Verified: teacher wrote "I think you really have a flare for fashion"
under the green-hat photo; it rendered on both the teacher detail page and the
student profile under that exact photo, with all other photos clean.

Schema (migration `20260531120000_teacher_comments_per_photo.sql`, run in
Supabase + saved to repo + committed):
- `teacher_comments.entry_id` (uuid, FK → entries.id, on delete cascade;
  null = a general/welcome note)
- partial unique index `teacher_comments_student_entry_uniq` on
  `(student_id, entry_id) where entry_id is not null` — one note per photo
- new UPDATE policy "teacher updates class teacher comments" (the table only
  had select + insert before; update lets a teacher EDIT a note)

Files committed:
- `src/app/teacher/students/[id]/actions.ts` — NEW. `writeTeacherComment`
  Server Action. Uses the USER-SCOPED supabase client (teacher's cookie), so
  RLS is the guard. Select existing note for (student, entry) → update if
  found, else insert. Empty body = no-op (clearing does NOT delete in v1).
- `src/app/teacher/students/[id]/page.tsx` — per-photo note UI. Each photo in
  "Everything they wrote" has a `<details>` "+ Add a note" (or shows the note +
  an "Edit" details if one exists). The top placeholder notes section was
  removed; a `generalNotes` section now renders only if non-photo notes exist.
- `src/app/student/dashboard/page.tsx` — reads `entry_id`, maps notes to
  photos, renders a "From your teacher" block under each matching photo (and in
  the favorite block). "From your teacher" top section now only shows general
  notes and is hidden entirely when empty (no dashed placeholder).

### ✅ Returning-student login (COMMITTED, VERIFIED)

A student who already joined can get back to their profile WITHOUT replaying
the game. New route `/student/login`. Reuses the exact magic-link call
`enrollStudent` uses (anon-key client → `signInWithOtp` → `emailRedirectTo`
= `/auth/confirm`), with `shouldCreateUser: false` so only existing students
can sign in here (newcomers still join via `/play`).

Files committed:
- `src/app/student/login/page.tsx` — NEW. Email field → request link;
  `?sent=1` shows a "check your email" confirmation; `?error=email|config`
  shows inline errors. Privacy-preserving copy ("if that email belongs to a
  class…") so it never reveals whether an account exists. Email is NOT put in
  the URL.
- `src/app/student/login/actions.ts` — NEW. `requestLoginLink` Server Action;
  validates email, sends OTP, logs (not shows) any send error, redirects to
  `?sent=1`.

Verified: entered the test student's email → "Check your email" → magic link
arrived → clicked → landed on `/student/dashboard` with Round 1 intact and the
teacher note under the green-hat photo. No replay.

---

## Where things stand right now

### Working & committed
- /play full game loop, email-only enrollment
- Magic link → /auth/confirm → profile (verified end to end)
- Student profile: finish-joining form + complete per-round view, with
  per-photo teacher notes
- Teacher dashboard: cohort grid + student detail with per-photo note authoring
- Returning-student login (/student/login)
- All migrations + RLS through `20260531120000_teacher_comments_per_photo.sql`

### Not pushed
- Local `slice-1a` is ahead of `origin/slice-1a`. Mike pushes when ready.

### Not done
- Round 2 (the big arc — see Parked C).
- Several small parked slices (B, D, K below) are quick wins.

---

## Known bug worth remembering (pre-existing, NOT ours)

**Post-login redirect to `/dashboard` 404s.** After signing in at
`/auth/login` (the TEACHER password login), the app redirects to `/dashboard`,
which isn't a route → 404. Login still WORKED. **Workaround: type the
destination URL directly** (`/teacher/students`, `/teacher/deck`). This is
Parked D.

Also this session: Mike repeatedly built the wrong URL by APPENDING onto
`/dashboard` (e.g. `/dashboard/teacher/students`). The real routes are off the
ROOT: `/teacher/students`, `/student/login`, `/student/dashboard`. When giving
URLs, say "clear the whole address bar."

Teacher account: `getgroovr@yahoo.com` (exists — sign in, don't re-signup).

---

## Parked items (priority order)

### Parked B: Confirm-signup email template
The Magic Link template is updated with the `/auth/confirm?token_hash=...`
href, but the **Confirm signup** template is NOT. A brand-new student's very
first email may use Confirm signup and break. Mike's own tests don't hit it (he
+ the test student are confirmed users). Fix in the Supabase dashboard
(Authentication → Emails → Confirm signup) — same href as Magic Link. Small.

### Parked C: Round 2 (THE BIG ONE — next major build)
Student uploads their OWN content photo + a description. The deck rotates so
students react to EACH OTHER's photos (not the teacher's nine). This lights up
`screen_name` (classmates see it), "the other students' photos" copy, and peer
comments accumulating via the SAME `game_sessions` mechanism keyed by round.
The profile's per-round stack is already shaped to hold: (a) what they said
about the deck, (b) what they posted, (c) what others said about their post,
(d) the teacher's note for that round. Round 1 fills (a) + favorite + why +
teacher notes; Round 2 lights up the rest with no redesign.

### Parked C+: Peer comments & moderated discussion (layer on Round 2)
Mike's idea: Student A's comment on Student B's photo is hidden from B by
default; the teacher approves/"favorites" specific peer comments to make them
visible; an approved comment can grow a discussion (comments on comments). A
new "wall/discussion" surface (photos + threads). Moderation evolves:
teacher-gated first, then student-gated later. **Build implication for when
Round 2/peer comments land: give every peer comment a visibility/approval state
(pending → approved) from day one**, so "hidden until approved" is baked in, not
retrofitted. Nothing today blocks this.

### Parked D: Fix the /dashboard redirect 404
Small. Point the post-login redirect at a real route (`/teacher/deck` or
`/teacher/students`).

### Parked E: Class size flexibility
"Class of up to N" copy reads off the live deck length (9 now). Multiples of 3
(grid is `repeat(3,1fr)`), min 3. No code change to change the number — follows
the deck.

### Parked I: Cohort export (CSV/XLSX) — after Round 2, before multi-teacher
A teacher button to export the whole cohort to a spreadsheet: a row per student
(or per student-per-round), columns for screen name, real name, round,
completion date, comment count, favorite + why, teacher notes. Data already
lives in `game_sessions` (by student+round) and `teacher_comments`, so it's
mostly a flatten-to-rows query + server-side `.xlsx` stream from the cohort
grid. Most valuable AFTER Round 2 (more rows/round to show); do it before
multi-teacher (a single teacher wanting to see their whole class is the real
itch).

### Parked J: Separate neutral entry/demo round from each cohort's live round
Today there's effectively ONE class (`NEXT_PUBLIC_DEMO_CLASS_ID`) and ONE deck,
so "the generic entry game" and "the cohort's current round" are the same
thing. Mike's model: keep a neutral entry/sample game distinct from each
enrolled cohort's own live round, with cohorts routed via per-class join links.
This is really part of the Round 2 + multi-cohort arc. Park until then.

### Parked K: Neutral magic-link email copy
The Magic Link email subject is "Your Spotlight invitation" / body says
"invitation" — wrong for a RETURNING student now that `/student/login` reuses
it. Reword to work for both first-join and return (e.g. subject "Your Spotlight
sign-in link", body "Tap below to sign in to your class"). Supabase dashboard
edit (Authentication → Emails → Magic Link). Mike's territory. Tiny.

### Parked F: Payments (FAR future)
Paid enrollment eventually, on the profile. Card data must NEVER touch our DB
or our form — route to a processor (Stripe etc.) returning a token. Park until
real paying users.

### Parked G: Custom email sender domain
Magic link comes from noreply@mail.app.supabase.io, sometimes lands in Yahoo
spam. Needs an SMTP provider (Resend/Postmark). Not urgent.

### Parked H: Multi-teacher storage RLS
Storage RLS on `teacher-deck` gates on "is a teacher?" not "owns this class?"
Fine with one teacher; revisit when a second is added. (Multi-teacher overall
is lower priority than Round 2 + cohort export per this session's discussion.)

---

## Working agreement (unchanged — still all valid)

- Mike holds: editor, Supabase dashboard, all keys, all pushes. Claude never
  handles real keys, never pushes on Mike's behalf.
- **Whole-file artifacts delivered as DOWNLOADABLE FILES.** Mike stages
  downloads on his Desktop, then copies into the project at
  `C:\Users\Myked\projects\spotlight-live`. The copy-into-project step is
  manual and can get skipped after a break. Always (1) give the full
  destination path, (2) remind him it only takes effect once it's in the
  PROJECT folder, not the Desktop staging folder.
- **There is a Desktop `spotlight-live` folder that is NOT the project.** Only
  `C:\Users\Myked\projects\spotlight-live` is live.
- **Download filenames get renamed by Claude to avoid collisions** (there are
  many `page.tsx` files). Tell Mike the download name AND what to rename it to
  on landing (almost always `page.tsx` or `actions.ts`), AND which folder. Each
  file's top comment line states its real destination path — good for
  double-checking.
- New routes need a NEW FOLDER (folders = routes in Next.js). When a route
  doesn't exist yet, walk Mike through right-click → New → Folder first.
- Mike isn't fluent in JS/TS but IS confident at Supabase dashboard/SQL. Point
  to files in the VS Code tree, not just paths.
- The VS Code Source Control MESSAGE BOX is where commit messages go — Mike
  pasted one into the terminal by mistake this session (harmless; it just ran
  as an unknown command).
- Screenshots first when something's weird — decisive.
- Move to EVIDENCE fast; he gets frustrated spinning on hypotheticals.
- His "what if…/do we even need…" asides are often the best ideas — take them
  seriously even mid-task. (Per-photo notes, returning login, cohort export,
  and the peer-discussion arc all came from his asides this session.)
- Watch his clock and PIVOT TO WRITING THE HANDOFF before he runs out of
  energy.
- Magic links are RATE-LIMITED on Supabase free tier (~3-4/email/hour, "429").
  Verify fixes by reading code FIRST; spend an email only on a verified fix.

---

## First-message-to-next-Claude

Read this whole doc first.

Mike's machine: Windows + VS Code, PowerShell, project at
`C:\Users\Myked\projects\spotlight-live`, branch `slice-1a`. Prefers
downloadable whole files he copies into the project himself. Routes are off the
ROOT (`/teacher/students`, `/student/login`, `/student/dashboard`,
`/teacher/deck`, `/play`) — never under `/dashboard`.

**Before any new code, confirm git state:**
```powershell
cd C:\Users\Myked\projects\spotlight-live
git status
git log --oneline -5
```

Expected: top commit is "slice 1B: teacher note write-back + returning-student
login". Working tree clean. Local `slice-1a` likely AHEAD of origin (unpushed).
Ask Mike whether he wants to push before building.

**Then, don't open with "what do you want to work on?"** Offer the natural
fork: a quick parked win (B confirm-signup template, D redirect fix, or K email
copy — all tiny) vs. starting **Round 2** (Parked C), which is the next major
build and where the project really opens up. Let him steer; his asides are
usually the right call.
