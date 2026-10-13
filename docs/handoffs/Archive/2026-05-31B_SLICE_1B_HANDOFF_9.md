# SLICE 1B HANDOFF #9 — Parked B/K/D cleared + multi-cohort entry plan

**Date written:** 2026-05-31 (late AM)
**Picking up from:** Handoff #8 (Slice 1B committed + verified; teacher note
  write-back + returning-student login landed)
**Going into:** The big arc. A full planning doc now exists for it — see
  "The plan doc" below. Several smaller parked items also remain.

---

## TL;DR for next Claude

1. **Three parked quick wins are DONE this session, all committed + PUSHED:**
   - **Parked B** — Confirm-signup email template fixed (dashboard).
   - **Parked K** — Magic Link email copy made neutral for returning students (dashboard).
   - **Parked D** — post-login redirect `/dashboard` → `/teacher/students` (code, committed).
2. **Git is CLEAN and PUSHED.** Local `slice-1a` == `origin/slice-1a`. Top
   commit is the Parked D fix (`8bde714`). Nothing uncommitted, nothing unpushed.
   (This is a change from #8, which had unpushed commits — all resolved.)
3. **A planning doc was written for the big arc:**
   `PLAN_multi_cohort_entry_and_round2.md`. It's in the repo at `docs/` AND
   Mike re-attaches it to new chats. **Don't read it cold — only crack it open
   if Mike wants to start the multi-cohort / Round 2 arc.** Details below.
4. No active bugs. App compiles and runs. (~138 VS Code "Problems" = the same
   pre-existing type-checker noise; not ours; every page loads 200.)

**Mike's expected first move:** confirm git state, then either start the
multi-cohort entry arc (read the plan doc) or grab a remaining small parked item.

---

## What got accomplished this session

### ✅ Parked B — Confirm-signup email template (DONE, dashboard)
The latent landmine from #8. A brand-new student's FIRST email can be the
**Confirm signup** template, which still had the old/broken link → would have
dumped the first real student back at `/play` with no session. Neither Mike nor
the test student could ever hit it (both already confirmed), so it was invisible.

Fix: pointed Confirm signup at `/auth/confirm`, same as Magic Link, BUT with
**`type=signup`** (NOT `type=email`). This was verified by READING
`src/app/auth/confirm/route.ts` first — the route does
`searchParams.get("type")` and passes it verbatim to `verifyOtp`, so the param
must match the token kind: magic-link tokens verify as `email`, signup tokens
verify as `signup`. Both templates now point at `/auth/confirm` with the
correct `type` and `next=/student/dashboard`.
- **Confirm signup** href: `...&type=signup&next=/student/dashboard` ✅
- Subject/body still say "invitation / you just joined" — CORRECT there, since
  Confirm signup only ever goes to a brand-new student.
- Could NOT be dry-run (no way to spend a fresh signup token on a new email),
  but the logic is fully matched to the route — the most verifiable without a
  real new student.

### ✅ Parked K — Neutral Magic Link copy (DONE, dashboard)
Magic Link is now reused by `/student/login` for RETURNING students, so the old
"invitation / you just joined" wording was wrong. Reworded:
- Subject: **"Your Spotlight sign-in link"**
- Body: "Tap below to sign in to your Spotlight class" + "If you didn't request
  this, ignore this email."
- **Functional part untouched:** href still `type=email&next=/student/dashboard`.
- Works for both first-join and return now.

> ⚠️ During K, the `type=signup` edit got briefly saved into the **Magic Link**
> template by mistake (wrong tab — both templates are on the same Emails page).
> Caught and reverted; Magic Link is back to `type=email`. Lesson for next time:
> the dashboard URL tells you which template you're on
> (`.../templates/magic-link-or-otp` vs `.../templates/confirm-sign-up`) — check
> it before saving.

### ✅ Parked D — post-login redirect fix (DONE, committed `8bde714`)
`src/app/auth/login/page.tsx` (the TEACHER password login) did
`router.push("/dashboard")` → 404. Changed the single line to
`router.push("/teacher/students")` (the cohort grid; a teacher's natural home).
Verified: logged in at `/auth/login` → landed on `/teacher/students` (200, grid
renders). One-line change, full file delivered + copied in + committed + pushed.

> Note: the two students in the cohort grid both show as "Mike" — expected (Mike
> + the test student both used that name). Not a bug.

---

## The plan doc (the big arc) — `PLAN_multi_cohort_entry_and_round2.md`

**This is the headline output of the session.** Mike + Claude worked out the
full model for the next major build. It is PAPER ONLY — no schema written, no
code touched. Location: `docs/` in the repo, and attached to new chats.

**One-sentence model:** the entry round is an **intake + triage** system —
teachers upload bait pics, students self-select by favoriting one, and teachers
then curate real classes ("cohorts") out of who showed up (including regrouping
by level after the fact). Round 2 (peer uploads + reactions) runs *inside* a
finished cohort, identically regardless of how it was assembled.

**Vocabulary that matters (got corrected mid-session):**
- **Cohort = a class = the ~9 students who end up together** (NOT a bundle of pics).
- **Favorite (pic) = permanent history** — what they responded to; sets initial
  cohort; never changes.
- **`cohort_id` on the student = the LIVE present** — where they are now;
  teacher-editable (this is what makes merge/regroup possible).

**Key insights captured in the doc:**
- The pic→cohort relationship is a **decision the uploader makes**, not a fixed
  rule. # of cohorts = how many distinct cohorts the uploaded pics point at.
  Part-timer = 3 pics → 1 cohort; ambitious = 9 pics → 3 cohorts; etc. Same code
  path, no special-casing on count.
- **Merge / regroup-by-level needs NO new feature** — it's just bulk-reassigning
  students' `cohort_id` among cohorts the teacher owns. Possible *because*
  cohort is live truth, not the (permanent) favorite.
- **Round 2 is orthogonal** — can be built before/after/alongside the
  multi-cohort work; they don't interact. Bake in peer-comment approval state
  (`pending → approved`) from day one (Parked C+).
- **Constraint on the record:** entry deck grid is `repeat(3,1fr)`, ~9 pics max
  visible → comfortably shows up to **3 cohorts' worth** at once. More cohorts =
  someday display question; doesn't block the foundation.

**Proposed build slices (order TBD with Mike):**
1. Cohorts foundation (cohorts table + owner; pic gets `cohort_id`; enrollment
   gets `cohort_id`; join-time default from favorite).
2. Teacher dashboard scoping ("my students" = owned cohorts).
3. Upload → cohort grouping UI.
4. Merge / regroup action.
5. Round 2 peer content (separable).

This plan IS the concrete form of **Parked J** and folds in **C, C+, E, H**.

---

## Where things stand right now

### Working & committed & pushed
- /play full game loop, email-only enrollment
- Magic link → /auth/confirm → profile (verified end to end)
- Student profile: finish-joining form + per-round view + per-photo teacher notes
- Teacher dashboard: cohort grid + student detail with per-photo note authoring
- Returning-student login (/student/login)
- Teacher password login redirect fixed (→ /teacher/students)
- Both email templates (Magic Link + Confirm signup) correct
- All migrations + RLS through `20260531120000_teacher_comments_per_photo.sql`

### Git
- `slice-1a` == `origin/slice-1a`, clean, pushed. Top commit `8bde714`
  (Parked D). Plan doc may be added to `docs/` + committed by Mike separately.

### Not done
- The multi-cohort entry + Round 2 arc (see plan doc).
- Remaining small parked items: B/K/D are now DONE; see below for what's left.

---

## Known bug worth remembering (pre-existing, NOT ours)
None outstanding from the old list — Parked D (the `/dashboard` 404) is now
FIXED. The general URL caution still holds: routes are off the ROOT
(`/teacher/students`, `/student/login`, `/student/dashboard`, `/teacher/deck`,
`/play`) — never under `/dashboard`. When giving URLs, say "clear the whole
address bar."

Teacher account: `getgroovr@yahoo.com` (exists — sign in, don't re-signup).

---

## Parked items — UPDATED (B, D, K now DONE)

- ~~**Parked B**~~ — DONE this session (Confirm-signup template).
- **Parked C: Round 2 (peer content)** — now folded into the plan doc as the
  downstream/isolated piece. Build before/after/alongside multi-cohort work.
- **Parked C+: peer comment approval state** — fold into Round 2 from day one
  (`pending → approved`).
- ~~**Parked D**~~ — DONE this session (redirect fix).
- **Parked E: class size flexibility** — "~9, multiples of 3, min 3." Lives in
  the plan doc as cohort sizing.
- **Parked I: Cohort export (CSV/XLSX)** — a teacher button to export the cohort
  to a spreadsheet. Most valuable AFTER Round 2 (more rows/round); before
  multi-teacher. Data is in `game_sessions` + `teacher_comments`. (xlsx skill
  exists in this environment if/when built.)
- **Parked J: neutral entry vs. cohort live round** — this is now REALIZED by
  the plan doc (the multi-cohort entry model). No longer a separate vague item.
- ~~**Parked K**~~ — DONE this session (neutral Magic Link copy).
- **Parked F: Payments (FAR future)** — card data NEVER touches our DB/form;
  route to a processor (Stripe etc.). Park until real paying users.
- **Parked G: Custom email sender domain** — magic link from
  noreply@mail.app.supabase.io sometimes hits Yahoo spam. Needs SMTP provider
  (Resend/Postmark). Not urgent.
- **Parked H: Multi-teacher storage RLS** — storage RLS gates on "is a teacher?"
  not "owns this class?" Becomes relevant once a 2nd teacher exists and the entry
  deck mixes owners (see plan doc).

---

## Working agreement (unchanged — still all valid)

- Mike holds: editor, Supabase dashboard, all keys, all pushes. Claude never
  handles real keys, never pushes on Mike's behalf.
- **Whole-file artifacts delivered as DOWNLOADABLE FILES.** Mike stages
  downloads on Desktop, copies into the project at
  `C:\Users\Myked\projects\spotlight-live`. The copy-into-project step is manual
  and can get skipped after a break. Always (1) give the full destination path,
  (2) remind him it only takes effect once it's in the PROJECT folder, not the
  Desktop staging folder.
- **There is a Desktop `spotlight-live` folder that is NOT the project.** Only
  `C:\Users\Myked\projects\spotlight-live` is live.
- **Download filenames get renamed by Claude to avoid collisions** (many
  `page.tsx` files). Tell Mike the download name AND what to rename it to AND
  which folder. Each file's top comment states its real destination path.
- New routes need a NEW FOLDER (folders = routes in Next.js).
- Mike isn't fluent in JS/TS but IS confident at Supabase dashboard/SQL. Point
  to files in the VS Code tree, not just paths.
- The VS Code Source Control MESSAGE BOX is where commit messages go (not the
  terminal).
- **Dashboard email templates: check the URL before saving** — Magic Link
  (`.../magic-link-or-otp`) and Confirm signup (`.../confirm-sign-up`) live on
  the same Emails page; easy to edit the wrong one (happened this session).
- Screenshots first when something's weird — decisive.
- Move to EVIDENCE fast; he gets frustrated spinning on hypotheticals.
- His "what if…/do we even need…" asides are often the best ideas — take them
  seriously mid-task. (The entire multi-cohort intake/triage model came from his
  asides this session — including "merge by level," which became the keystone.)
- Watch his clock and PIVOT TO WRITING THE HANDOFF before he runs out of energy.
- Magic links are RATE-LIMITED on Supabase free tier (~3-4/email/hour, "429").
  Verify fixes by reading code FIRST; spend an email only on a verified fix.

---

## First-message-to-next-Claude

Read this whole doc first. Do NOT read the plan doc unless/until Mike wants the
big arc — it's reference, not entry context.

Mike's machine: Windows + VS Code, PowerShell, project at
`C:\Users\Myked\projects\spotlight-live`, branch `slice-1a`. Prefers downloadable
whole files he copies into the project himself (Desktop → project folder).
Routes are off the ROOT — never under `/dashboard`.

**Before any new code, confirm git state:**
```powershell
cd C:\Users\Myked\projects\spotlight-live
git status
git log --oneline -5
```
Expected: top commit `8bde714` "slice 1B: fix post-login redirect (Parked D)".
Working tree clean. `slice-1a` == `origin/slice-1a` (pushed). If Mike committed
the plan doc to `docs/`, that'll be the new top commit instead — fine.

**Then, don't open with "what do you want to work on?"** Offer the fork:
- A remaining small parked item (I, G, H — all modest), OR
- **Start the big arc** — the multi-cohort entry + Round 2 build. If so, read
  `PLAN_multi_cohort_entry_and_round2.md` and begin with **slice 1 (cohorts
  foundation)**, which starts by READING the current deck/enrollment schema so
  you generalize what actually exists rather than guessing.

His asides are usually the right call — listen for them.
