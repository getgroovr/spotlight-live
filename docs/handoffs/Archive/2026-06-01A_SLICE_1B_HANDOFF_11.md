# SLICE 1B HANDOFF #11 — Parked G shipped + multi-cohort arc entered (schema read, slice 1 framed)

**Date written:** 2026-06-01 (mid-morning, ~9:15 AM)
**Picking up from:** Handoff #10 (Parked I shipped; Parked G DNS waiting)
**Going into:** Slice 1 of the multi-cohort arc — cohorts foundation. Schema is
  read; the exact pickup question is identified below.
**Destination for this file:** `docs/handoffs/` (same place as prior handoffs).

---

## TL;DR for next Claude

1. **Parked G (custom email sender domain) is DONE.** Resend domain verified,
   native Resend↔Supabase integration completed (auto-provisioned API key, no
   hand-copying), sender set to `noreply@getgroovr.com` / name "Spotlight."
   **Live-tested to Gmail:** email arrived in primary inbox (not spam, not
   Promotions), from `Spotlight <noreply@getgroovr.com>`, confirm-signup
   template with "Sign in to Spotlight →" link. Student followed the link →
   finish-joining → dashboard. **End-to-end verified.**
2. **Multi-cohort arc is ENTERED.** Plan doc read, live schema dumped and
   analyzed, slice 1 framed. Key finding: **the plan's `cohorts` table already
   exists as `classes`** — no new table needed. Schema analysis below.
3. **The exact pickup question is: what does `my_class_id()` return?** This
   Supabase function is the linchpin of student-scoped RLS. Understanding it
   determines how slice 1 generalizes from one hardcoded class to many.
4. **Git is CLEAN and PUSHED.** `slice-1a` == `origin/slice-1a`. Top commit
   `a306d9b` "slice 1B: cohort CSV export (Parked I)". Only untracked file:
   this handoff (and #10, also untracked).
5. No active code bugs. App compiles/runs.

---

## What got accomplished this session

### ✅ Parked G — Custom email sender domain (DONE)

**The problem it solved:** Supabase's default sender (`noreply@mail.app.supabase.io`)
had poor deliverability (Yahoo spam, Gmail inconsistent) and a ~3–4/hr rate
limit. Now emails send from the app's own verified domain via Resend SMTP.

**Setup path taken (native integration, not manual):**
1. Domain `getgroovr.com` verified in Resend (DNS records entered in Handoff
   #10; domain flipped to Verified at 7:31 AM — confirmed via screenshot).
2. Resend Settings → Integrations → **Connect to Supabase** button.
3. Supabase authorization screen → granted Resend read/write to auth configs
   for the `getgroovr` organization.
4. Resend's 4-step wizard:
   - **Project:** `groovr-creator` (Mike's only Supabase project) ✓
   - **Link domain:** `getgroovr.com` ✓
   - **Add an API key:** auto-created "Supabase Integration" key ✓
   - **Configure SMTP:** sender name `Spotlight`, sender email
     `noreply@getgroovr.com` → clicked Configure SMTP ✓
5. All four wizard nodes went green. "Ready to send."
6. **Confirmed on Supabase side:** Authentication → Emails → SMTP Settings
   shows: Enable Custom SMTP ON, host `smtp.resend.com`, port 465, username
   `resend`, password populated (Reveal button visible), sender
   `noreply@getgroovr.com`, name `Spotlight`.
7. **Live test:** new student enrollment through `/play` → confirm-signup email
   → **Gmail primary inbox**, from `Spotlight <noreply@getgroovr.com>`. Student
   clicked "Sign in to Spotlight →" → `/auth/confirm` → finish-joining form →
   student dashboard as "Dee" with Round 1 data. Full loop.

**What this unlocks:**
- Reliable email delivery (Gmail, Yahoo, everything) from the app's own domain.
- Rate limit lifted — custom SMTP bypasses Supabase's default sending cap.
- Resend dashboard gives delivery/bounce/complaint observability.
- Foundation for future transactional emails (teacher notifications, etc.) using
  the same verified domain and Resend account.

### Two new items surfaced (Mike's asides — capturing, not building)

**A. Teacher "new student joined" notification email.** Mike noticed no
notification arrived when "Dee" enrolled. Correct — this email was never built.
The app only sends auth emails (magic link, confirm-signup). Now that
getgroovr.com is verified and Resend is wired, a server-side notification is
straightforward to add later (not part of G, not blocking anything).

**B. Remind student of their Round 1 comment on the finish-joining form.** The
data is there (dashboard shows "What you said during the game" one screen later),
but the finish-joining card doesn't echo it. Small UI touch — standalone, not
tangled with the multi-cohort arc.

### 🟡 Multi-cohort arc — schema analysis + slice 1 framing (IN PROGRESS)

Read the plan doc (`PLAN_multi_cohort_entry_and_round2.md`) end to end against
the live schema. Key findings:

---

## Schema analysis — the plan vs. reality

### The plan's `cohorts` table = the existing `classes` table

The plan proposed a new `cohorts` table with `id`, `teacher_id` (owner), `label`,
`created_at`. The live `classes` table already has exactly this: `id` (uuid pk),
`teacher_id` (uuid, NOT NULL), `name` (text), `created_at`, plus `is_public`
(boolean). The locked vocabulary says "cohort = a class." **No new table needed.**

Every time the plan says `cohort_id`, that's `class_id` in the real schema.

### The pic→cohort link already exists

`entries` has `class_id` (uuid, NOT NULL) + `is_starter` (boolean). Starter
entries (bait pics) are already scoped to a class. The plan's "favoriting this
pic drops you into class A" = "this entry's `class_id` determines the student's
enrollment." Multiple starter entries can share one `class_id` (3 pics → 1
cohort) or each point to a different one (3 pics → 3 cohorts). The plan's
flexible grouping is just data — the column already exists.

### Student class assignment lives in TWO places

1. **`enrollments.class_id`** — the enrollment record.
2. **`profiles.class_id`** — on the auth profile itself.

RLS policies reference `my_class_id()` heavily (entries read, peer_comments
read/insert, student entries insert). This function almost certainly reads from
`profiles.class_id`. Both places need to stay in sync — or one becomes canonical
and the other derived.

### RLS is already multi-cohort-ready (structurally)

The `owns_class(class_id)` function is used everywhere for teacher scoping:
entries (read/insert/update/delete), peer_comments (read/moderate), reports,
sessions. The classes table itself has `teacher_id = auth.uid()` policies for
CRUD. This all works for N classes out of the box — a teacher with 3 classes
sees all 3 classes' data.

### What's actually hardcoded (the real bottleneck)

The app code uses `NEXT_PUBLIC_DEMO_CLASS_ID` (an env var) to point the entry
game and join flow at one specific class. The schema supports many classes; the
app UI assumes one. Slice 1's real job is removing that hardcoding.

### Full table inventory (for reference)

| Table | Key columns for multi-cohort | Role |
|---|---|---|
| `classes` | `id`, `teacher_id`, `name`, `is_public` | The cohort. Already has ownership. |
| `entries` | `class_id`, `is_starter`, `student_id` | Pics in the deck. Starter entries = bait. Already class-scoped. |
| `enrollments` | `student_id`, `class_id`, `round` | Student↔class link. Already class-scoped. |
| `profiles` | `class_id`, `role` | Auth profile. `class_id` used by `my_class_id()` for RLS. |
| `game_sessions` | `student_id`, `class_id`, `round`, `favorites` | Play data. Already class-scoped. Favorites = permanent history. |
| `students` | `id`, `name`, `email` | Student identity (separate from profiles). |
| `teacher_comments` | `student_id`, `class_id`, `round`, `entry_id` | Per-photo teacher notes. Already class-scoped. |
| `peer_comments` | `author_id`, `subject_id`, `class_id`, `status` | Peer reactions. Already class-scoped. Has moderation_status. |
| `session_comments` | `session_id`, `entry_id` | Comments within a play session. |
| `sessions` | `player_id`, `class_id` | Play sessions. Already class-scoped. |
| `entries_public` | (view) | Public view of entries. |
| `reports` | `class_id` | Content reports. Already class-scoped. |

### Helper functions identified in RLS

- **`owns_class(class_id)`** — returns true if the current user's `auth.uid()`
  matches the `teacher_id` on the given class. Used everywhere for teacher
  scoping.
- **`my_class_id()`** — **UNKNOWN IMPLEMENTATION.** Almost certainly returns
  `profiles.class_id` for the current user. This is the critical function:
  student-scoped RLS for entries, peer_comments, and entry inserts all use it.
  **Must read this function's SQL before writing slice 1.**
- **`is_teacher()`** — returns true if current user has teacher role. Used in
  profiles and classes policies.

---

## Slice 1 — cohorts foundation (framed, not started)

**What slice 1 IS (now that we've read the schema):**
- NOT a new table. NOT new columns (unless `label` is wanted beyond `name`).
- Remove the `NEXT_PUBLIC_DEMO_CLASS_ID` hardcoding from the entry game + join
  flow.
- Entry game shows starter entries across multiple classes (mixed deck).
- Student favorites one → at join, their `enrollments.class_id` AND
  `profiles.class_id` get set from the favorited entry's `class_id`.
- Teacher creates classes (rows in `classes`) and uploads starter entries
  assigned to them — but that's slice 3. For slice 1, seed via SQL.

**What must happen BEFORE writing any migration or code:**
1. **Read `my_class_id()`.** Run in Supabase SQL Editor:
   ```sql
   SELECT pg_get_functiondef(oid)
   FROM pg_proc
   WHERE proname = 'my_class_id';
   ```
   This tells us: does it read `profiles.class_id`? Does it assume one class?
   Does it need to become `is_in_class(class_id)` for multi-cohort?

2. **Read `owns_class()` and `is_teacher()` too** (same query pattern). These
   are probably fine, but confirm.

3. **Read the `/play` page code** to find every reference to
   `NEXT_PUBLIC_DEMO_CLASS_ID` and understand the join-time assignment flow.

**Mike's expected first move:** run the `my_class_id()` function definition
query, paste result. Then we read `/play` together and map every hardcoded
class reference before writing anything.

---

## Where things stand right now

### Working & committed & pushed
- /play game loop, email-only enrollment; magic link → /auth/confirm → profile
- Student profile (finish-joining, per-round view, per-photo teacher notes)
- Teacher dashboard: cohort grid + student detail + per-photo notes
- Returning-student login; teacher password-login redirect (→ /teacher/students)
- Both email templates correct (Magic Link + Confirm signup)
- Cohort CSV export (Parked I) — route + grid button
- **NEW:** Custom SMTP via Resend — `noreply@getgroovr.com` / "Spotlight"
- All migrations through `20260531120000_teacher_comments_per_photo.sql`

### Git
- `slice-1a` == `origin/slice-1a`, clean.
- Top commit: `a306d9b` "slice 1B: cohort CSV export (Parked I)".
- Untracked: `docs/handoffs/2026-06-01A_SLICE_1B_HANDOFF_10.md` and this file.

### Not done / next
- **Slice 1: cohorts foundation** — framed, pickup question identified. ← next.
- The rest of the multi-cohort arc (slices 2–4 per plan doc).
- Round 2 peer content (slice 5, downstream/isolated).
- Two new aside items (teacher notification email, finish-joining reminder).
- Parked H (multi-teacher storage RLS) — deferred until 2nd teacher is real.

---

## Parked items — UPDATED

- ~~**B / D / K**~~ — DONE (#9).
- ~~**Parked I: cohort CSV export**~~ — DONE (#10). Nicer evaluation report
  deferred to ride with Round 2.
- ~~**Parked G: custom email sender domain**~~ — **DONE this session.**
- **Parked C / C+ / E / J** — folded into multi-cohort + Round 2 plan doc.
  Untouched this session. J is realized by the multi-cohort arc itself.
- **Parked H: multi-teacher storage RLS** — still parked.
- **Parked F: payments** — far future.
- **NEW — Teacher "new student joined" notification email** — not built, not
  blocking. Easy to add now that Resend is wired.
- **NEW — Finish-joining form: echo student's Round 1 comment** — small UI
  touch, standalone.

---

## Working agreement (unchanged)

- Mike holds: editor, Supabase dashboard, all keys, all pushes, all
  Namecheap/Resend dashboards. Claude never handles real keys, never pushes.
- Whole-file artifacts as DOWNLOADABLE FILES with full destination path.
- Download filenames renamed to avoid collisions.
- New routes need a NEW FOLDER.
- Routes off ROOT (`/teacher/students`, `/student/login`, `/play`, etc.).
- Commit messages in VS Code Source Control MESSAGE BOX.
- Mike isn't fluent in JS/TS but IS confident at Supabase dashboard/SQL.
- Screenshots first when something's weird.
- His asides are usually the right call — listen for them.
- Watch his clock and PIVOT TO WRITING THE HANDOFF before he's out of gas.
- Magic links: custom SMTP via Resend now lifts the old rate limit. Test
  sparingly anyway (Resend free tier has its own monthly cap).

---

## First-message-to-next-Claude

Read this whole doc first. The plan doc (`PLAN_multi_cohort_entry_and_round2.md`)
is reference for the arc — read it too, but hold the schema analysis above as
the ground truth (plan names ≠ live names; `cohorts` = `classes`,
`cohort_id` = `class_id`).

Mike's machine: Windows + VS Code, PowerShell, project at
`C:\Users\Myked\projects\spotlight-live`, branch `slice-1a`.

**Before anything, confirm git state:**
```powershell
cd C:\Users\Myked\projects\spotlight-live
git status
git log --oneline -5
```

**Then: the pickup question.** Run in Supabase SQL Editor:
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'my_class_id';
```
Paste the result. This function is the linchpin — student-scoped RLS everywhere
references it. Understanding what it returns (and whether it assumes one class)
determines how slice 1 generalizes the join flow.

Then read `owns_class()` and `is_teacher()` the same way. Then read `/play`
page code for every `NEXT_PUBLIC_DEMO_CLASS_ID` reference.

**Do NOT write migrations or code until all three functions are read and the
`/play` hardcoding is mapped.** The schema is structurally multi-cohort already;
the work is in the app code and possibly in `my_class_id()`.

His asides are usually the right call — listen for them.
