# Schema Audit — Spotlight Live, May 2026

_A table-by-table reading of the nine deployed migrations against the
**current product model** (see `BUILD_PLAN.md`). For each piece of the schema:
**does it fit, is it awkward, or is it missing?** And, where work is needed,
whether it must happen **before Slice One** or can defer._

The goal of this document is to make the infrastructure decisions visible
**before** writing feature code, so we either fix the schema deliberately or
go forward knowing exactly what we're working around.

---

## TL;DR (read this first)

The schema is **largely good news.** It was written with real care, and most
of the current product model maps onto it cleanly — including pieces I was
worried about (the archive rule as a DB invariant, teacher-only audio,
storage path conventions, the 9-cap as a trigger, the moderation status
machinery).

There are **three small, well-defined gaps** that must be filled before
Slice 1A can be built cleanly:

1. **`classes.code`** — there is no class-code column. The current model
   requires one (open signup gated by a teacher-issued code).
2. **A way to mark teacher-owned "starter" entries.** Starters are real
   `entries` rows but they're owned by the teacher, not a student, and they
   participate in the deck without ever being "approved" or "archived" in
   the student sense. The existing schema *almost* allows this; one
   inexpensive addition makes it explicit.
3. **A "round" concept does not exist.** The schema is round-agnostic — it
   models a single live deck. This is **fine for Slice One** (which is
   single-round) but a `rounds` table will be needed before any round-advance
   work.

There are also **a handful of architectural mismatches** between earlier
"locked" decisions and the current model. None of them block Slice One; all
need attention before they bite. Listed below.

---

## Migration-by-migration audit

### 01 — `profiles` and roles

**Fits the current model.** `profiles.role` (teacher | student), `class_id`
(single-class membership), `is_18_plus` (the adult affirmation), and the
auto-provisioning trigger on `auth.users` all align with the design.

The "no role self-change, no class self-change" RLS policy (added in 07) is
exactly right — it forces all class assignments through the audited RPC
path, which is what the teacher-issued-code flow requires.

**Minor watch-item, defer:** the engine and earlier docs mention an `avatar`
field; the column exists (`avatar_url`). Nothing to do — flagging for
completeness.

**Verdict: fits. No changes needed for Slice One.**

---

### 02 — `classes` and the 9-student cap

**Fits the spine, but has a real gap.** The `classes` table is the right
shape (teacher_id, name, created_at). The 9-student cap trigger works
correctly and the BUILD_PLAN-decision rationale is preserved in the
migration's comments.

**GAP 1 — missing `code` column.** The current model requires a
teacher-issued class code that students enter to join. There is no column
for this on `classes`. A student joining the class is also not modeled as
a code-redemption action; it's modeled as the teacher calling
`assign_student_to_class(student_id, class_id)`, which assumes the teacher
already knows the student's profile id.

**Recommended fix (before Slice 1B):**

```sql
alter table public.classes
  add column code text unique;
-- with a server-side helper that generates a short, human-friendly code
-- (e.g. 6-8 uppercase alphanumeric, ambiguity-safe alphabet) at create time.
```

And then a new RPC, e.g. `join_class_by_code(p_code text)`, that the student
calls. It would:

- look up the class by code,
- check the cap (the existing trigger fires on update),
- set `profiles.class_id` and `role = 'student'` for the caller.

This is a small migration. It does not invalidate anything that already
exists.

**Watch-item, defer:** the `assign_student_to_class` RPC stays useful for
teacher-initiated reassignment (the "between rounds, teacher moves a student
to a different class" flow). Both RPCs can coexist.

**Verdict: one small migration needed (1-2 statements + an RPC).**

---

### 03 — `entries` (the heart)

**Fits the current model better than expected.** The status enum
(`pending | live | archived`), the "exactly one live per (student, class)"
partial unique index, the welded-description invariant, and the
`media_type` enum (`photo | video`) are all exactly what the current model
asks for.

The pending-status pipeline cleanly handles "student uploads to the
teacher-only holding area" — that's literally `status = 'pending'`, visible
only to the owning teacher per the RLS in migration 07.

**GAP 2 — starter entries don't have a clean home.** The current model needs
the teacher to upload nine starter photos and have them in the deck
(`status = 'live'`) without ever being a student's submission. The existing
schema *allows* this — the RLS policy `entries: teacher seeds own class`
explicitly permits a teacher to insert at any status — but `student_id` is
declared NOT NULL and FK'd to `profiles`. So the teacher must either:

- (a) insert the row with `student_id = teacher_id` (the teacher owns their
  own starters), which works mechanically but conflates two distinct roles
  in the data; or
- (b) introduce a flag (e.g. `is_starter boolean default false`) so the deck
  query can distinguish.

Both are workable. **Recommendation:** go with (a) for Slice 1A — it's
zero migration work — and revisit if it gets confusing. A migration to add
`is_starter` (or a separate `starter_entries` table) can come later if
needed.

A small thing to note for the adapter: when the deck contains starters,
`student_id` will point to a teacher profile. The adapter must not assume
"`student_id` always identifies a student in the cohort." Handling this in
the adapter (one line — "if the profile.role is 'teacher', label it as
'Class Starter' or similar in the engine") is cheaper than a schema change.

**Watch-item, defer:** the "one file per student per round" rule the current
model adds. Today, "exactly one live per (student, class)" is enforced
forever. When rounds appear, this becomes "exactly one live per (student,
class, round)." See "Missing concept: rounds" below.

**Verdict: no required schema change for Slice One; one judgment call
about (a) vs (b) when slice 1A is written.**

---

### 04 — `peer_comments` + `reports`

**Fits the current model cleanly.** The current model says peer comments
post live and use a report-then-resolve safety path. The migration's default
of `status = 'approved'` matches this exactly, and the comment in the SQL
even calls out that flipping the default to `pending` would switch the app
to pre-moderation with no schema change. The `reports` table is polymorphic
(`target_type` enum: `comment | entry | profile`), which is overkill for
Slice One but cheap.

**One observation, not a gap:** the engine's `SOCIAL` flag (in
`spotlight.jsx`) currently disables peer comments client-side. Slice One
doesn't need peer comments at all. They'll come on in a later slice; nothing
in the schema needs to change to enable that.

**Verdict: fits. No changes needed.**

---

### 05 — `sessions` + `session_comments`

**Fits.** Sessions replace per-machine localStorage; `session_comments`
holds the mandatory one-comment-per-(session, entry) the engine collects.
The unique constraint `(session_id, entry_id)` is exactly right — re-commenting
updates the same row, which matches the engine's `myComments[studentId]`
behavior.

The CSV deliverable (the teacher's export) reconstructs from a four-way
join of these tables plus `entries` and `profiles`. The fields the
migration's comment lists match the engine's `buildSessionRows()` output.

**Watch-item, defer:** the current model says "a student may submit only
after they have commented on every other student's live entry in this
round." That gate is a query: "does this player have a session_comments row
for every live entry in their class (excluding their own) for this round?"
The schema supports the query today (assuming a single round); with rounds,
it'll need `session.round_id`. Not a Slice One concern.

**Verdict: fits. No changes needed for Slice One.**

---

### 06 — helper functions + `approve_entry`

**Fits, and `approve_entry` is doing meaningful work.** The role-check
helpers (`is_teacher`, `owns_class`, `my_class_id`) keep RLS policies
readable. `approve_entry` is the archive rule as a single atomic
transaction (archive the old live → promote the pending to live), which is
exactly what the engine's `addEntry()` does on the desktop side.

This RPC will be called directly from the teacher's dashboard in Slice 1C.
Nothing new needed.

**Verdict: fits. No changes needed.**

---

### 07 — RLS policies + the `entries_public` view

**Fits, with one notable strength worth calling out.** The
`entries_public` view is a column-safe projection that omits
`reading_audio_url` — meaning the game (which reads the view) can never
accidentally expose teacher-only audio, even if a row policy let a row
through. The audit comment is right: the game reads the view, teacher tools
read the table. This is the desktop "honor-system privacy" made real.

The "no self-change of role/class_id" policy is the linchpin that forces
class assignment through `assign_student_to_class` — and, when we add the
code-redemption RPC, through that too.

**One question for Slice 1B:** the new code-redemption RPC will need to
update `profiles.class_id` for the caller. Since the self-update RLS
policy forbids this, the RPC will need to be `SECURITY DEFINER` (like the
existing roster RPC) and authorize the caller by validating the code. Easy;
just flagging it so we don't get surprised by an "RLS denied" error mid-build.

**Verdict: fits. No changes needed beyond the new RPC that comes with
GAP 1.**

---

### 08 — storage buckets + storage RLS

**Fits, with a path convention to honor.** Two private buckets (`media`,
`reading-audio`) with the path convention
`<bucket>/<class_id>/<student_id>/<filename>`. The RLS policies use
`storage.foldername(name)` to authorize by path segment. The conventions
mean Slice 1A's teacher seed uploads should land under
`media/<class_id>/<teacher_id>/...` (the teacher's storage write policy
already permits this), and Slice 1C's student submissions under
`media/<class_id>/<student_id>/...`.

**One Next.js 16 watch-item:** there's an upload-body-size limit
(`proxyClientMaxBodySize`) that may need raising once real media uploads
start. The bucket's `file_size_limit` is 50 MiB; the proxy limit is
separate and may be lower by default. **Check `node_modules/next/dist/docs/`
before writing the upload route.**

**Verdict: fits. No changes needed. One Next.js 16 config item to check
when the upload UI is written.**

---

### 09 — `assign_student_to_class` RPC

**Fits, with a sibling needed.** The existing RPC handles teacher-initiated
assignment ("teacher places this student in this class"). The current model
also needs a student-initiated code-redemption path (GAP 1). They are
separate RPCs serving separate flows; both should exist.

**Verdict: fits. The sibling RPC is part of GAP 1's fix.**

---

## Missing concept: rounds

The schema has no `rounds` table. Today, a class has one live deck and
that's the whole world. The current model adds **rounds**:

- A class progresses through ~10 rounds.
- A round has its own deck (the live `entries` rows during that round).
- A student submits **one** entry per round.
- The deck rolls forward at round end; what was live becomes archived;
  newly-approved pending entries become live.

The good news is the **archive machinery already in `entries` (status +
`approve_entry`) does most of the work without naming "rounds" explicitly.**
Round end = "approve the next nine pending entries; the current nine flip
to archived; the new nine are live." If the teacher does this manually
(no auto-advance yet), the schema as it stands handles it.

**What we'd need before any round-advance feature:**

- A `rounds` table: `id`, `class_id`, `round_number`, `started_at`,
  `ended_at`.
- A nullable `entries.round_id` (which round this entry was live in;
  archived entries keep their round_id forever).
- A nullable `sessions.round_id` (so "did this student comment on everyone
  in this round?" is queryable).
- The "exactly one live per (student, class)" partial unique index
  becomes "exactly one live per (student, class, round)" — or the
  round_id is left null for the currently-live round and we keep the
  existing index. Decide when we get there.

**None of this is needed for Slice One.** Slice One operates in an implicit
"round 1" and doesn't roll over. **Flagged for future work.**

---

## Architectural mismatches between old docs and current model

These do not require schema changes today but should be noted so they don't
confuse next session:

- **Earlier docs say peer comments are pre-moderated by the teacher.** The
  current model has them post live with a report-then-resolve path. The
  schema's default of `status = 'approved'` quietly matches the current
  model. The old "pending" default is reachable by changing the column
  default, which makes flipping back a one-line migration if we ever want
  to revisit. **No work needed; just don't be surprised.**
- **Earlier docs say uploads go via a `class_members` many-to-many
  membership table.** The schema uses the simpler `profiles.class_id`
  one-class-per-student model. The current model is fine with this. (A
  many-to-many would only be needed if students could be in several classes
  at once, which is explicitly NOT the current model.)
- **Earlier docs assume the upload pipeline includes a description blurb
  and a `reading_audio` recording.** Slice One does photo-only without
  reading audio. The schema supports both; the UI just won't expose them
  in Slice One.

---

## Summary table

| Concern                              | Status        | When to fix         |
|--------------------------------------|---------------|---------------------|
| Identity, roles, 18+ gate            | Fits          | —                   |
| 9-student cap                        | Fits (trigger)| —                   |
| Pending → live → archived pipeline   | Fits          | —                   |
| Archive rule as atomic RPC           | Fits          | —                   |
| RLS by role                          | Fits          | —                   |
| Storage buckets + path RLS           | Fits          | —                   |
| Teacher-only audio (column-safe view)| Fits          | —                   |
| Peer comments + reports              | Fits          | —                   |
| Sessions + CSV                       | Fits          | —                   |
| Teacher-initiated roster RPC         | Fits          | —                   |
| **Class code on `classes`**          | **Missing**   | **Before Slice 1B** |
| **`join_class_by_code` RPC**         | **Missing**   | **Before Slice 1B** |
| Marking teacher starter entries      | Workable as-is| Decide in 1A code   |
| Rounds (table + foreign keys)        | Missing       | Before round-advance|
| Upload-body-size limit               | Config-only   | Before 1C           |

---

## Recommendation for next session

Before writing any Slice 1A code:

1. Write the **class-code migration** as a 10th migration file
   (`20260527XXXXXX_class_code_and_join.sql`): adds `classes.code unique`,
   a helper to generate codes, and the `join_class_by_code` RPC.
2. Deploy that migration the same way the others were deployed (Supabase
   SQL editor, paste, Run; verify with a quick lookup).
3. Then begin Slice 1A code, following the build-order section in
   `BUILD_PLAN.md`. **Read `node_modules/next/dist/docs/`** for Server
   Actions and file upload patterns before writing the routes — the
   AGENTS.md warning is real.

The teacher-starter-entries question (GAP 2) can be settled as part of
writing 1A — the simplest path is to write the seed upload action with
`student_id = teacher_id` and see how it reads. If it gets confusing, the
`is_starter` migration is small.
