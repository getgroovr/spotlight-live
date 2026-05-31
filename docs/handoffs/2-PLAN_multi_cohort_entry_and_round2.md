# PLANNING DOC — Multi-cohort entry round + Round 2 peer content

**Date:** 2026-05-31 (AM)
**Status:** PAPER ONLY. No schema written, no code touched. This is a design
  artifact to keep alongside the handoffs.
**Worked out by:** Mike + Claude, this session, after clearing Parked B, K, D.

---

## The one-sentence version

The entry round is an **intake + triage** system: teachers upload bait pics,
students self-select by favoriting one, and teachers then curate real classes
("cohorts") out of who showed up — including regrouping students by level after
the fact. Round 2 (peer uploads + reactions) then runs *inside* a finished
cohort, identically no matter how that cohort was assembled.

---

## Vocabulary (locked — earlier confusion resolved)

- **Cohort = a class = the ~9 students who end up together.** This is the unit
  that matters. NOT "a bundle of pics." (Earlier draft wrongly used "cohort" to
  mean a pic-group; corrected.)
- **Entry pic = bait.** A photo in the entry deck. Students react to it and may
  favorite it. Each pic *points to a default cohort*.
- **Favorite = permanent history.** Records what a student responded to at
  entry. NEVER changes. Used to set the student's *initial* cohort.
- **Cohort assignment (`cohort_id` on the student) = the live present.** Where
  the student *currently* is. Teacher-editable. This — not the favorite — is the
  source of truth for "what class are they in."

---

## The core mechanic

1. A teacher uploads entry pics. Per pic (or per group), they set which cohort
   that pic feeds: "favoriting me drops you into class A."
2. Students play the entry game against the **mixed deck of all active pics**
   (everyone's, all teachers'), react, and favorite one.
3. On join, the student's `cohort_id` is set from the **favorited pic's default
   cohort**.
4. The teacher watches their classes fill, then **curates**: merge half-full
   classes to get one rolling, or regroup students by level/readiness — any
   reassignment of `cohort_id` among cohorts they own.
5. Once a class is assembled, **Round 2** runs inside it.

### Why the pic→cohort relationship is a *decision*, not a rule

The number of cohorts is NOT fixed by pic count or teacher count. It's set by
**how the uploader groups pics into classes** — i.e. how many distinct cohorts
the uploaded pics point at:

| Scenario | Pics | Cohorts | How |
|---|---|---|---|
| Part-time teacher | 3 | 1 | all 3 pics point to the same cohort |
| Ambitious teacher | 9 (3 sets of 3) | 3 | each set of 3 points to its own cohort |
| 9 teachers, 1 pic each | 9 | 9 | each pic its own cohort |
| 3 teachers, 3 pics each | 9 | 3 | each teacher's 3 pics → that teacher's 1 cohort |
| 1 teacher, 9 unrelated pics | 9 | 9 | each pic its own cohort |
| 1 teacher, 9 related pics | 9 | 1 | all 9 point to one big cohort |

Same code path for all of these. The grouping is just **data** (how many
distinct `cohort_id`s the pics carry). No special-casing on count.

### Why "merge / regroup by level" needs no new feature

Because the student is owned through their **cohort** (live, editable), not
through their favorited pic (permanent history), a teacher can regroup students
freely *after* seeing who showed up:

- Merge two half-full classes to get one rolling → bulk reassign `cohort_id`.
- Notice cohorts 1, 5, 6 are all entry-level kids → merge them by level,
  regardless of which pic each kid favorited.

Both are the **same operation**: reassign students' `cohort_id` to a target
cohort. The teacher's *reason* (speed vs. level vs. vibe) is human judgment; the
mechanism is identical. This reframes the entry round as **intake + triage**:
pics get kids in the door and give a first signal; the teacher then curates real
classes out of the raw intake.

---

## Tracing ownership

`favorited pic → (default) cohort → teacher (cohort owner)`

- At join: student's `cohort_id` defaults from the favorited pic's cohort.
- After join: `cohort_id` is live truth; teacher can move/merge students among
  cohorts **they own**.
- "My students" (teacher dashboard) = students whose *current* cohort I own.
- Permissions: a teacher can only reassign students among their own cohorts.

---

## Schema sketch (PAPER — not migration-ready, names illustrative)

> Today there is effectively ONE cohort (`NEXT_PUBLIC_DEMO_CLASS_ID`) and one
> deck. This generalizes "one hardcoded cohort" into "many cohort rows, each
> with an owner; pics carry a cohort_id." This is essentially **Parked J**.

- **`cohorts`** — NEW
  - `id` (uuid, pk)
  - `teacher_id` (uuid, fk → teacher/auth user) — owner
  - `label` (text) — e.g. "Monday entry-level"
  - `created_at`
- **entry pics** (generalize today's deck)
  - add `cohort_id` (uuid, fk → cohorts.id) — the *default* cohort a favoriting
    student lands in. Many pics may share one `cohort_id`.
- **student enrollment / profile**
  - add `cohort_id` (uuid, fk → cohorts.id) — LIVE assignment. Set from
    favorited pic's cohort at join; editable afterward (merge/move).
  - keep the favorited-pic record as-is (permanent history).
- **RLS**
  - teacher reads/writes cohorts where `teacher_id = auth.uid()`.
  - teacher reads students whose `cohort_id` ∈ their cohorts.
  - reassignment limited to cohorts the teacher owns (both source & target).

*(Round 2 peer-content tables are deliberately NOT in this sketch — they're
orthogonal. See "Round 2 is untouched" below.)*

---

## Build slices (proposed order — to be confirmed)

This arc is large; slice it. Order TBD with Mike, but a natural progression:

1. **Cohorts foundation.** `cohorts` table + owner; pic gains `cohort_id`;
   enrollment gains `cohort_id`; join-time default assignment from favorite.
   (No teacher UI yet — seed/admin to start.)
2. **Teacher dashboard scoping.** "My students" filters to owned cohorts.
   Handles 1/3/9 cohorts with no count special-casing.
3. **Upload → cohort grouping UI.** Teacher uploads pics and assigns each to a
   cohort (new or existing). This is where the part-timer/ambitious split
   becomes a real choice in the product.
4. **Merge / regroup action.** Bulk-reassign students' `cohort_id` among owned
   cohorts. Powers both "get a class rolling" and "regroup by level."
5. **Round 2 peer content** (separable; can interleave earlier — see below).

---

## Round 2 is UNTOUCHED by all of this

Round 2 = students upload their own photo + description; the deck rotates so they
react to **each other's** posts within their class; peer comments accumulate via
the same `game_sessions` mechanism keyed by round. The per-round profile stack
already holds four slots: (a) what they said about the deck, (b) what they
posted, (c) what others said about their post, (d) the teacher's note for that
round. Round 1 fills (a) + favorite + why + teacher notes; Round 2 lights up the
rest — **no redesign**.

Round 2 plays identically regardless of how a cohort was assembled (1/3/9
classes, merged, regrouped). It is downstream and isolated. It can therefore be
built **before, after, or alongside** the multi-cohort entry work.

### Bake in from day one (Parked C+)
When peer comments land, give every peer comment a **visibility/approval state**
(`pending → approved`) from the start, so "hidden until the teacher approves" is
built in, not retrofitted. Moderation evolves: teacher-gated first, student-gated
later.

---

## Open questions / constraints (on the record)

- **Entry deck display limit.** The deck grid is `repeat(3, 1fr)`, max ~9 pics
  visible. So the mixed entry deck comfortably shows **up to 3 cohorts' worth
  (9 pics)** at once. Beyond 3 cohorts you'd need a bigger/scrolling deck OR to
  not show every cohort to every student. Real "someday" question; does NOT
  block the foundation work.
- **How does the uploader set a pic's cohort?** Slice 3 (upload UI) decides the
  UX: pick existing cohort from a dropdown, or "new cohort" inline. Paper only
  for now.
- **Cohort target size.** "~9 students" is the mental model (grid is 3×3,
  multiples of 3, min 3 — per Parked E). Is 9 a hard cap or a soft target?
  TBD; doesn't block foundation.
- **Cross-teacher entry deck.** Multi-teacher means the entry deck mixes pics
  from *different* teachers. Storage RLS today gates on "is a teacher?" not
  "owns this class?" (Parked H). Revisit when a 2nd teacher is real.

---

## Relationship to existing parked items

- **Parked C (Round 2)** — the peer-content half. Still valid, now slotted as
  the downstream/isolated piece.
- **Parked C+ (peer approval state)** — fold into Round 2 from day one.
- **Parked J (neutral entry vs. cohort live round)** — this plan IS the concrete
  form of J. The multi-cohort entry model realizes it.
- **Parked H (multi-teacher storage RLS)** — becomes relevant once a 2nd teacher
  exists and the entry deck mixes owners.
- **Parked E (class size flexibility)** — the "~9, multiples of 3" sizing.
