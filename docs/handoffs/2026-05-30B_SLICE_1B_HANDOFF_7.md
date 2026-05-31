# SLICE 1B HANDOFF #7 — Profile v1 + Teacher Dashboard

**Date written:** 2026-05-30 (early afternoon)
**Session length:** ~3 hours across two sittings (magic-link fix in the
  morning, profile + teacher dashboard after a break)
**Picking up from:** Handoff #6 (enrollment + student dashboard built but the
  magic-link round-trip was unverified, blocked by Supabase rate limit)
**Going into:** Commit the teacher dashboard, then build teacher-note write-back
  (the recruit mechanism), then Round 2.

---

## TL;DR for next Claude

1. The magic-link → dashboard round-trip is **FIXED and VERIFIED**. Root cause
   was the implicit-flow `#access_token` landing in the URL fragment where a
   server component can't read it. Fixed with a `/auth/confirm` route that
   exchanges a `token_hash` query param for a session cookie. **Committed.**
2. **Profile v1 is COMPLETE, VERIFIED, and COMMITTED** (commit on branch
   `slice-1a`, message "slice 1B profile v1: email-only join...").
3. **Teacher dashboard (Slice 1B-iii) is BUILT and VERIFIED working, but
   NOT YET COMMITTED.** Two new route files were created this session and
   confirmed rendering. First job next session: commit them.
4. **Two copy-only file updates were pending at session end** — see
   "Loose ends" — Mike was copying them in as the session closed.

**Mike's expected first move:** ask whether the teacher dashboard got
committed. If not, help him commit it. Then move to teacher-note write-back.

---

## What got accomplished this session

### ✅ Magic-link round-trip FIXED (the #6 blocker)

The student dashboard was showing "We couldn't find your enrollment" because
the magic link used Supabase's implicit flow: the token arrived as
`/student/dashboard#access_token=...`. The `#` fragment is never sent to the
server, so the server component's `getUser()` found nothing.

**Fix:** new route `src/app/auth/confirm/route.ts`. The email link now points
at `/auth/confirm?token_hash=...&type=email&next=/student/dashboard`. The
route calls `supabase.auth.verifyOtp({ type, token_hash })`, which sets a real
session cookie, then redirects to the profile. `token_hash` is a normal query
param the server CAN read.

Also updated the **Magic Link email template** (Supabase dashboard →
Authentication → Emails → Magic Link) to point its `href` at `/auth/confirm`
with `{{ .TokenHash }}`. Subject remains "Your Spotlight invitation"; body now
mentions Spotlight.

**Verified:** played through, got the email, clicked the link, landed on the
profile, rendered correctly. Confirmed working end to end.

> NOTE: brand-new users may receive the **Confirm signup** template instead of
> Magic Link on their very first email. That template was NOT yet updated with
> the `/auth/confirm` href. Mike's own tests use Magic Link (he's a confirmed
> user), so it didn't surface. **Update the Confirm signup template too** so a
> first-time student isn't broken. (Parked — see Parked B.)

### ✅ Profile v1 — COMPLETE, VERIFIED, COMMITTED

The biggest conceptual shift this session: the **game** became a thin front
door, and the **profile** became the durable home. Decisions, locked with Mike:

- **Front door (game) collects EMAIL ONLY** to send the magic link. No name,
  no self-photo at the join moment (that was friction at the worst possible
  point — right when a hesitant student decides whether to commit).
- **Profile** (the page after the magic link) is where joining completes and
  where everything lives long-term. It has two states:
  - **Incomplete:** a "finish joining" form — real name, screen name, and the
    "Why was this your favorite?" note, with the favorite photo shown.
  - **Complete:** a per-round stack that grows downward. Round 1 block shows a
    "From your teacher" slot (empty until the teacher writes back), the
    favorite (photo + its description + the in-game comment + the why-note),
    and all nine comments.
- **Name model:** `students.name` = real name (private, teacher sees it);
  `students.screen_name` = public, classmates will see it in Round 2.
- **No language is ever lost:** the nine in-game comments live in
  `game_sessions.comments`; the why-note lives in the new
  `game_sessions.favorite_comment` column (separate, so it never overwrites a
  game comment on the same photo).

Schema for this shipped in migration `20260530120000_slice1b_profile.sql`
(run in Supabase, saved to repo, committed). It added:
- `students.screen_name` (text)
- made `students.name` nullable (collected on profile now, not front door)
- `game_sessions.favorite_comment` (text)
- new `teacher_comments` table (empty for now; teacher dashboard writes to it
  next slice) with RLS: student reads own, teacher reads/writes for owned
  classes.

Files committed for Profile v1:
- `src/game/spotlight.jsx` — front door slimmed (no name gate, no self-photo;
  email-only enroll). Splash resume now keys on a single anon localStorage key.
- `src/app/play/actions.ts` — `enrollStudent` now email-only; added
  `saveProfile` Server Action (saves name + screen_name + favorite_comment).
- `src/app/student/dashboard/page.tsx` — the profile (incomplete/complete
  states described above).
- `src/app/auth/confirm/route.ts` — the magic-link fix.
- `supabase/migrations/20260530120000_slice1b_profile.sql`

Commit also swept in some doc renames (handoffs got A/B prefixes — Mike did
that manually; git logged them as `rename ... (100%)`, content intact).

### ✅ Teacher dashboard (Slice 1B-iii) — BUILT, VERIFIED, **NOT COMMITTED**

Two new route files, both confirmed rendering in the browser this session:

- `src/app/teacher/students/page.tsx` — cohort grid. Lists enrolled students
  in the teacher's class(es) as cards: screen name (fallback to real name),
  comment count, "profile not finished" flag, round + completion date. Each
  card links to the detail page. Gated on `classes.teacher_id = auth.uid()`.
- `src/app/teacher/students/[id]/page.tsx` — single-student journey. Shows the
  favorite (photo + description + in-game comment + why-note), then every photo
  beside its comment ("Everything they wrote"), then a teacher-notes section.
  The note-WRITE form is intentionally a placeholder — write-back is next slice.

**Verified:** `/teacher/students` rendered the cohort (2 test "Mike"
enrollments — one with a profile photo, one without, which usefully exercised
the avatar fallback). Clicking a card rendered the full detail page with the
hat-photo favorite and all nine comments. Both work.

**These two files are NOT committed.** They were created directly in VS Code
late in the session. **First job next session: commit them.**

---

## Where things stand right now

### Working & committed
- /play full game loop, email-only enrollment
- Magic link → /auth/confirm → profile (verified end to end)
- Student profile: finish-joining form + complete per-round view
- Profile v1 migration, all RLS

### Working but UNCOMMITTED (commit first thing next session)
- `src/app/teacher/students/page.tsx` (cohort grid)
- `src/app/teacher/students/[id]/page.tsx` (student detail)

### Not done
- Teacher note write-back (the recruit mechanism) — `teacher_comments` table
  and read-side both exist; just needs a `writeTeacherComment` Server Action
  and a form on the detail page. **This is the next build.**
- Round 2 (student uploads own photo + description, deck rotates to peer
  photos, peer comments accumulate). Bigger slice.
- Confirm-signup email template still not updated with `/auth/confirm` href.

---

## Loose ends from THIS session (check these first)

1. **Two copy-only file updates were pending at session end.** Late in the
   session two files got small wording fixes but Mike hadn't yet copied them
   from his Desktop staging folder into the project (he stages downloads on the
   Desktop, then copies into `C:\Users\Myked\projects\spotlight-live`; a long
   break interrupted the copy step). The two files:
   - `src/game/spotlight.jsx` — "Back to the photos" (was "Back to my
     photos"); un-faded + reworded "check your email" second paragraph to
     "up to N students... add one of your own photos and comment on the other
     students' photos."
   - `src/app/student/dashboard/page.tsx` — "what happens next" panel reworded
     to "up to N students" + the per-round loop.

   **HOW TO VERIFY THEY LANDED:** open `/student/dashboard`, scroll to the
   bottom "what happens next" panel. New wording mentions "students" and
   "comment on the other students' photos." Old wording says "upload your own
   photo and write about it" with no "students." If old → the two files still
   need copying in. These are COPY-ONLY; nothing is broken either way, just
   clunkier wording. Low stakes.

   **NOTE:** these two copy edits are on top of the already-committed Profile
   v1 versions of the same files. So after copying them in, they'll show as
   modified and should be committed (can ride along with the teacher-dashboard
   commit, or its own copy-fix commit).

2. **The teacher dashboard is uncommitted** (see above). Don't lose it.

---

## Known bug worth remembering (pre-existing, NOT ours)

**Post-login redirect to `/dashboard` 404s.** After signing in at
`/auth/login`, Supabase/the app redirects to `/dashboard`, which is not a
route → 404. This is a pre-existing bug first noted in the Slice 1A handoff.
**Workaround: after logging in, type the destination URL directly**
(`/teacher/students`, `/teacher/deck`, etc.). This bit us this session — Mike
hit the 404 after login and briefly thought his teacher password was wrong. It
wasn't; the login worked, the redirect target just doesn't exist. Worth fixing
in its own tiny slice eventually (point the redirect at `/teacher/deck` or
`/teacher/students`).

Teacher account: `getgroovr@yahoo.com` (already exists — do NOT use the signup
flow again; sign in, then type the URL).

---

## Parked items (priority order)

### Parked A: Teacher note write-back — THE NEXT BUILD
The `teacher_comments` table exists with RLS (teacher can insert for owned
classes; student can read own). The student profile already READS it ("From
your teacher" slot) and the teacher detail page already READS it. What's
missing is the WRITE: a `writeTeacherComment(formData)` Server Action + a small
form on `src/app/teacher/students/[id]/page.tsx`. When wired, what the teacher
writes appears on the student's profile. **This is the recruit mechanism** —
Mike's framing: the teacher's first note is how a player gets pulled into the
class / next round. Keep round nullable (null = general/welcome note).

### Parked B: Confirm-signup email template
Update it with the same `/auth/confirm?token_hash={{ .TokenHash }}&type=email`
href as the Magic Link template, so a brand-new student's first email works.
(Magic Link already done.)

### Parked C: Round 2 (the big one)
Student uploads their OWN content photo + a description of it. The deck rotates
so students react to EACH OTHER's photos (not the teacher's nine). This is when
"the other students' photos" and `screen_name` become live, and when peer
comments start accumulating — which is more language data for the teacher,
captured by the SAME game_sessions mechanism keyed by round. The profile's
per-round stack is already shaped to hold: (a) what they said about the deck,
(b) what they posted, (c) what others said about their post, (d) the teacher's
note for that round. Round 1 only fills (a) + favorite + why + teacher slot;
Round 2 lights up the rest with no redesign.

### Parked D: Fix the /dashboard redirect 404
Small. Point the post-login redirect at a real route.

### Parked E: Class size flexibility
Currently the "class of up to N" copy reads off the live deck length (9 now),
so dropping to 6 or 3 updates the copy automatically. Mike wants 9 for now;
possibly 6, minimum 3 (multiples of 3 because the grid is repeat(3,1fr) and
looks best in threes). No code change needed to change the number — it follows
the deck.

### Parked F: Payments (FAR future)
Mike floated paid enrollment eventually, entered on the profile. WHEN that
happens: card data must NEVER touch our DB or our form — route to a processor
(Stripe etc.) that returns a token. Do not hand-roll. Park until there are real
paying users.

### Parked G (carryover): Custom email sender domain
Magic link still comes from noreply@mail.app.supabase.io, occasionally lands in
Yahoo spam. Needs SMTP provider (Resend/Postmark/etc.). Not urgent.

### Parked H (carryover): Multi-teacher storage RLS
Storage RLS on `teacher-deck` gates on "is a teacher?" not "owns this class?"
Fine with one teacher; revisit when a second is added.

---

## Working agreement (unchanged — still all valid)

- Mike holds: editor, Supabase dashboard, all keys, all pushes.
- Claude holds: code, design, migrations, RLS, Server Actions, UI.
- Claude never handles real keys, never pushes on Mike's behalf.
- **Whole-file artifacts, delivered as DOWNLOADABLE FILES** — Mike's confirmed
  preferred method. He can't reliably copy from the VS Code explorer into chat,
  so giving him files to download beats pasting. He stages downloads in a
  Desktop folder, then copies into the project at
  `C:\Users\Myked\projects\spotlight-live`. (This is the source of loose-end #1
  above — the copy-into-project step is a manual move that can get skipped after
  a break. When handing over files, remind him of the destination path AND that
  the file only takes effect once it's in the PROJECT, not the Desktop folder.)
- **There is a Desktop `spotlight-live` folder that is NOT the project.** Only
  `C:\Users\Myked\projects\spotlight-live` is live. Files on the Desktop don't
  affect the app.
- Whole-file over line-edits. Always give the full destination path. For
  `page.tsx` especially, name which folder — there are now several page.tsx
  files (play, student/dashboard, teacher/deck, teacher/students,
  teacher/students/[id]).
- Mike works Windows + VS Code + PowerShell at
  `C:\Users\Myked\projects\spotlight-live`. Branch: `slice-1a`.
- Mike reviews every commit in Source Control before pushing; he pushes.
- Screenshots first when something's weird — lean into that, it's decisive.
- Mike's good design instincts surface as "what if..." asides; take them
  seriously even mid-task. This session's profile redesign came entirely from
  his "do we even need the self-photo here?" question.
- Magic links are RATE-LIMITED on Supabase free tier (~3-4/email/hour, "429:
  email rate limit exceeded"). Budget email tests carefully; verify with code
  reads before spending a send.

---

## First-message-to-next-Claude

Read this whole doc first.

Mike's machine: Windows + VS Code, PowerShell, project at
`C:\Users\Myked\projects\spotlight-live`, branch `slice-1a`. Prefers
downloadable whole files he copies into the project himself.

**Before any new code, confirm git state:**
```powershell
cd C:\Users\Myked\projects\spotlight-live
git status
git log --oneline -5
```

Expected: Profile v1 is committed. The two teacher-dashboard files
(`teacher/students/page.tsx` and `teacher/students/[id]/page.tsx`) are likely
showing as untracked/uncommitted unless Mike committed them after this handoff.
The two copy-fix files may also show as modified if he copied them in.

**Sequence for next session:**
1. Commit the teacher dashboard (+ copy fixes if present). Verify
   `/teacher/students` and a detail page still render. (No email needed — just
   be logged in as teacher; if you hit a 404 after login, type the URL.)
2. Build **teacher note write-back** (Parked A) — the recruit mechanism. This
   is the highest-value next piece and closes the teacher↔student loop.
3. Then Round 2 (Parked C) is the big arc.

Do NOT open with "what do you want to work on?" — open by confirming the commit
state, then go to Parked A.
