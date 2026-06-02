# SLICE 1 HANDOFF #14 — Social slice DESIGNED (not built); "what ends a class" RESOLVED; adults-only decision made

**Date written:** 2026-06-02
**Picking up from:** Handoff #13 (Part 2 student archive UI shipped + verified; "one active class at a time" / World B guard added; regroup requested)
**Going into:** A BUILD session (probably) — the social slice is now fully specified. But CHECK the open intents below and the slice-order question before writing code.
**Destination for this file:** `docs/handoffs/`

---

## TL;DR for next Claude

1. **This was the regroup #13 asked for. It produced a full design for the SOCIAL
   SLICE (the peer-content / "Round 2" arc), and in doing so it ANSWERED #13's
   big open question: *what ends a class.***
2. **What ends a class:** a class runs a **fixed 5 rounds**. The class flips
   `active→completed` when the teacher approves the final comment of round 5 and
   the grand-total reveal fires. This makes the World B `active→completed` flip
   (manual SQL today) finally automatic — it was blocked in #13 on "round logic /
   teacher UI that don't exist yet," and this slice is that logic.
3. **NOTHING WAS BUILT this session.** It was discussion only, per Mike's regroup
   request. This doc is a SPEC, not a verification. Do not record any of it as
   "done."
4. **Decision: this product is for ADULT language learners.** Kids are out of
   scope. An "I'm 18+" attestation is to be added before enrollment — but see the
   caveat: it's a TERMS mechanism, not a filter.
5. **Two genuinely open intents remain** (flagged below): the
   upload-timing-vs-voting wrinkle, and confirming-against-code whether a stored
   per-pic description ever existed.

---

## The model that was settled (hold as the social-slice spec)

### Shape of a class
- A class = **5 rounds**, fixed. **The 5 are STUDENT-pic rounds.** The entry round
  is NOT one of them — it's pre-commitment placement onboarding that sits OUTSIDE
  the count (favorite a teacher pic → routes you toward a class; unscored, no
  winner; no enrollment/profile/evaluation yet). Roster size is independent of
  round count (a 9-student class still runs 5 rounds).
- **Every student is "in the spotlight" EVERY round:** each round, every student
  uploads a new pic and receives comments on it. Spotlight ≠ winning. This is the
  inclusive part — everyone gets a turn, every round.
- **New pics each round.** The teacher starter deck is used ONLY for the entry
  round (onboarding / placement / routing). After the entry round the starters are
  gone; all 5 scored rounds are student-uploaded peer content. Each student ends
  the class with 5 pics (one per round) — which is what makes the finale ("show all
  his pictures at once") a real multi-pic model.

### The reward ladder (three rungs)
- **Spotlight** — everyone, every round (upload + receive comments).
- **Round winner** — each round, the most-favorited pic wins. **A student can win
  at most ONE round.** If the top-voted student in a later round already won, the
  round crown goes to the highest-voted student who hasn't won yet (runner-up).
- **Class winner** — highest **grand total** votes across all 5 rounds. Grand
  total counts every favorite a student received, no exclusions — so the class
  winner will likely have won a round (maybe several on raw votes), but is only
  ever *shown* as a round winner once. The class winner gets something extra at
  the finale (e.g. more of their profile revealed — exact reward TBD).

### Voting
- Students favorite **one pic per round**, chosen from a grid of all the round's
  pics + their comments. **This favoriting UI already exists** — it's the entry-
  round mechanic (favorite one teacher pic → routed into a class). REUSED, not
  net-new. What's net-new is tallying favorites ACROSS students (today favorites
  are per-student and never aggregated).

### The combined screen (THIS RESOLVES the old timing wrinkle — see below)
The student does THREE things on ONE screen, in one visit per round:
1. **Vote** — pick this round's favorite from the grid.
2. **Upload** — submit their NEXT round's pic.
3. **Describe** — write the description of that uploaded pic (REQUIRED — no pic
   without its words; pedagogically the richest text + makes the finale readable).

The key consequence: **the pic you upload competes NEXT round, not the one you're
voting in.** So every pic in play for round N was uploaded during round N-1's
screen and has had the entire previous round to be approved. Voting and uploading
are decoupled in TIME even though they share a screen. This is why OPEN INTENT #1
(below) is now RESOLVED — nothing gets uploaded into the round you're voting on,
so "approved at hour 23 with no time to collect votes" cannot happen.

### Front-edge and back-edge of the combined screen (the screen is NOT uniform every round)
Because upload-while-voting puts each round's pics a round AHEAD, the chain has a
bootstrap hole at the front and a trailing dangle at the back. The front is now
RESOLVED; the back is a candidate.

- **FRONT — RESOLVED.** The entry round is **pre-commitment onboarding, OUTSIDE the
  round count.** The student favorites a teacher pic, which is a **PLACEMENT signal
  only** — it routes them toward a class (and, later, toward a teacher whose deck
  they gravitate to → ties to multi-teacher / Parked H). It is **UNSCORED**: no
  winner on teacher pics. At that moment the student has **no profile, no
  enrollment, no teacher relationship → nothing for a teacher to evaluate.** That's
  the try-before-commit boundary.
    - Therefore **"5 rounds" = 5 STUDENT-pic rounds.** The entry round is NOT round 1.
    - Round 1 (first student round) is fed by a **standalone upload screen**: upload
      pic + description, **NO vote** (there's no prior student round to vote on; the
      entry-round favorite already did its placement job). NOT the combined screen.
    - **The entry round is left EXACTLY as built/verified in #13 — untouched.** New
      screens sit BESIDE it, never inside it. This kills the re-verification risk
      that Option A would have carried. (This supersedes the earlier A-vs-B lean;
      the standalone-screen path won, and for a better reason than "fewer special
      cases" — it preserves the commitment boundary.)
- **BACK (round 5) — RESOLVED as its own screen.** Round 5 has no "next round" to
  upload for, so it is **vote + reveal**, AND it carries an **optional, explicit
  re-enroll offer.** Key consent point (Mike's correction): uploading a pic must
  NOT silently mean "I want another class." Plenty of students finish and are done.
  So the pic and re-enrollment are **decoupled** — the screen OFFERS re-enrollment
  ("your class is complete — want to go again with this teacher?") as an opt-in
  choice, never an assumption. Because it's a distinct meaning (not just a similar-
  looking screen), it is **its own screen**, not the combined screen.
    - **Timing falls out of World B:** the #13 "one active enrollment per student"
      guard means a student can't join a new class while the current one is
      `active`. So the offer can only fire AFTER the class flips to `completed` —
      which is exactly the round-5-final-approval / reveal moment. The timing works.
    - **"Same teacher" bypasses placement → ties to the POOL.** A returning student
      who already has a teacher doesn't need the entry round's sorting function;
      they need a seat in that teacher's NEXT cohort. That's functionally a POOLED
      student waiting for the next class — so the re-enroll offer and the
      backfill/pool may be the SAME mechanism from two angles. Noted as a
      CONNECTION, not settled design — it's bigger than this screen.

### Resulting screen sequence (FOUR shapes)
1. **Entry round** — favorite a teacher pic. Placement only, unscored, no upload,
   pre-enrollment. Untouched from #13.
2. **Round 1** — standalone upload screen. Upload pic + description, NO vote.
3. **Rounds 2–4** — combined screen. Vote on previous round's pics + upload next +
   describe.
4. **Round 5** — its own screen. Vote + reveal, NO next-upload, PLUS an optional
   opt-in re-enroll offer (same teacher; fires only once class is `completed`).

---

## Round lifecycle (the state machine — net-new, the core of this slice)

Per round, in order:

1. **Upload + input window: 24 hours.** Students upload their pic (+ description),
   comment on others' pics, and cast their one favorite. Deadline is for STUDENT
   INPUT — once it hits, no more uploads/comments/votes, even from no-shows.
2. **Teacher review window: ~2 hours.** Teacher reviews and approves. (See "Two
   approval gates" — note one gate actually has to operate DURING window 1, not
   here.)
3. **Reveal = teacher approves the final comment.** There is NO separate reveal
   button and NO timer-triggered reveal. Approving the last comment IS the reveal:
   it triggers the cross-student tally, crowns the round winner, and reveals the
   round (pic + owner profile + approved comments). The NEXT round's clock starts
   from that same instant.
4. Repeat for 5 rounds. After round 5's final approval, grand-total tally runs,
   class winner revealed, class → `completed`.

**Single point of advance:** the teacher is the only thing that moves a round to
reveal. There is NO automatic fallback if the teacher never acts — the round sits
closed-but-unrevealed until they do. Acceptable for adults + one engaged teacher;
named here so nobody expects a timeout to rescue a stalled round.

### The daily clock rule
- The **teacher sets the class's daily start time.** The intent is that the class
  happens at ~the same time each day.
- Cadence: 24h input + ~2h teacher window = next round opens ~26h after the last.
  To keep the daily anchor fixed despite the 2h drift, stagger the input windows:
  **24 / 22 / 24 …** with the teacher's 2 hours absorbing the difference. Net:
  same wall-clock start each day.
- Students are told the cadence up front ("next round opens ~2 hours after the
  24-hour clock, same time each day").
- Assumes the teacher uses their 2 hours and no more; overrun slips the anchor.
  Expected-not-enforced. Fine for adults / one teacher.

---

## Two approval gates (this MOVED this session — important)

In #13-era thinking, "teacher approves" was a single end-of-round gate. It is now
**two gates**, because Mike's rule is "nothing gets uploaded without teacher
approval":

- **Upload gate (start of round, BLOCKING):** a student's **pic AND their
  description** must be teacher-approved before the pic is visible/votable at all.
  Nothing un-vetted is ever public.
- **Comment gate (end of round, BLOCKING for reveal):** **peer comments** (student
  comments on other students' pics) must be approved before the reveal shows them.

**The wrinkle this creates — NOW RESOLVED by the combined screen:**
The wrinkle WAS: if a pic must be approved before it can be voted on, and voting
happens DURING the 24h window, the teacher has to approve uploads FAST, mid-round.
The **combined screen dissolves this**: pics are uploaded on the PREVIOUS round's
screen, so they arrive a full round early and the teacher has the entire previous
round to approve them — calm, not a 2-hour scramble. The upload gate no longer
fights the voting window.

**The one edge that remains:** a pic uploaded on round N-1's screen but REJECTED by
the teacher needs a resubmit path before round N opens, or the student is silently
absent from round N. Calm now (a whole round of runway exists), but the path has to
be built. Note it.

---

## The three teacher surfaces (what the teacher acts on)

All three require approval; only the third carries an optional teacher voice:

| Surface | Approval | Teacher comment |
|---|---|---|
| The uploaded **pic** | REQUIRED (upload gate) | — |
| The owner's **description** of their pic | REQUIRED (upload gate) | — |
| **Peer comments** (students on others' pics) | REQUIRED (comment gate) | OPTIONAL — teacher may add a comment / discussion on top |

**Workload reality:** peer comments scale with roster² — every student commenting
on every pic each round ≈ roster × roster. For a 9-student class that's ~80
comments/round, each needing a teacher approval pass. But approval is a yes/no
TRIAGE, not 80 written replies — the optional teacher comment is the teacher's
choice. State the cost as triage, not essay-grading. (This is also why the teacher
surface, not peer content, is arguably the gating dependency — see slice order.)

### Note on teacher feedback vs peer-comment approval
Keep these as TWO objects even though they share the approve-checkbox gesture:
- **Peer comments** need a pending→approved state that the REVEAL reads.
- **Teacher feedback to a student** (the thing #13 noted is "already being sent" —
  `teacher_comments`) becomes a formal click-to-approve-and-send. Different object.
Don't collapse them or the reveal will gate on the wrong comments.

---

## Adults-only decision + the 18+ attestation

- **Decision:** product is for ADULT language learners. Kids out of scope. Mike's
  reasoning: adult language learners far outnumber kid users; safeguarding a
  kid-inclusive public-photo + open-comment product is a much bigger lift. If kids
  ever need legitimate access, modify THEN.
- **Add an "I'm 18+" attestation before enrollment.**
- **CAVEAT — write this next to the feature so future-Claude doesn't misread it:**
  a single checkbox is a **TERMS / consent mechanism, not a filter.** It shifts
  liability (a minor who lies owns the lie); it does NOT exclude anyone. The kids
  Mike's worried about will tick it without reading — that's the whole point of the
  concern. If actual exclusion ever matters (and for public user photos +
  open comments, regulators increasingly expect it), the real lever is
  friction — a date-of-birth field (COPPA-aligned, makes a kid do arithmetic to
  lie) rather than one checkbox. SHIP the checkbox now; label it "attestation,
  revisit if we ever formalize age-gating."
- **Direction caveat:** building adults-only-now is fine; retrofitting child-safety
  onto a LIVE product with real users + real photos is the hard direction. The door
  only swings easily the way we're going through it.

---

## Dropouts + the pool / backfill (net-new, settled)

- **Drop trigger:** **two CONSECUTIVE round misses** → student flipped to dropped.
  One miss = "sat out this round," NOT a drop.
- **Warning:** after the FIRST miss, notify the student they'll be dropped if they
  miss the next round.
- **Backfill from the pool:** a dropped slot can be filled mid-class from a POOL of
  students who've done the entry round (favorited a teacher pic) but aren't yet in
  a live cohort. The ENTRY ROUND is the staging area — no new mechanism needed.
- **Fairness: explicitly NOT engineered.** A mid-class joiner is at a disadvantage
  (can't catch the grand total if total = sum of all rounds). Accepted. A backfill
  contends for FUTURE ROUND wins but realistically not the CLASS crown. The class
  crown is for someone who was there the whole way. A dropped student is free to
  join a fresh class, probably at its start.

### Schema consequences of dropouts (carry into build)
- `enrollments.status` needs a THIRD value: **`dropped`** (today only
  active/completed). Update the CHECK constraint.
- **Dropping must RELEASE the one-active-enrollment guard from #13** (the partial
  unique index `one_active_enrollment_per_student` on status='active') so the freed
  student can re-enroll. Since `dropped` ≠ `active`, the partial index already
  excludes them — VERIFY this is true with the new CHECK value before trusting it.
- Need a **per-student-per-round "missed round" signal** to count consecutive
  misses and fire the warning. The round state machine has to record participation
  anyway.

---

## Net-new vs REUSED (so the next handoff doesn't say "built" about a non-thing)

**Reused (exists, verified in prior sessions):**
- The favorite-one-pic-from-a-grid-with-comments screen (entry round mechanic).
- `round` column already exists across enrollments / game_sessions /
  teacher_comments — a foothold for the lifecycle, though the lifecycle around it
  does NOT exist.
- `enrollments.status` (active/completed) + partial unique index (#13).

**Net-new (the actual work of this slice):**
- A table for **per-round STUDENT uploads** (pic → owner → round). Today's
  favorites/comments are all about the teacher starter deck; there is no place
  student-uploaded pics live.
- A **per-upload description field** (see OPEN INTENT #2).
- **Cross-student tally** keyed to those uploads — count favorites across students
  to crown round + class winners. Never existed.
- **Peer-comment approval state** (pending/approved/rejected) that the reveal reads.
- **Upload-gate approval** on pic + description (blocking before votable).
- The **round state machine** (timer-gated input → upload approvals → comment
  approvals → teacher-triggered reveal → next round), incl. the daily-clock /
  24-22-24 anchor. This is the architectural shift: the cohort now moves in
  LOCKSTEP instead of each student playing independently whenever.
- **`dropped` status** + missed-round tracking + pool/backfill flow.
- **18+ attestation** at enrollment.
- Class **auto-completion** (round 5 final approval → grand tally → completed).

---

## OPEN INTENTS (decide before / during build)

1. **Upload timing vs voting — RESOLVED.** The combined screen (vote this round +
   upload next round + describe) decouples upload from voting in time: every pic
   competes the round AFTER it's uploaded, so it's approved a full round ahead. No
   sub-window engineering needed. (Residual edge: a rejected pic needs a resubmit
   path before its round opens — see "Two approval gates.")
1b. **Front-edge bootstrap — RESOLVED.** Entry round = pre-commitment placement
   onboarding, OUTSIDE the round count, unscored, untouched from #13. "5 rounds" =
   5 student-pic rounds. Round 1 is a standalone upload-only screen (no vote).
   Rounds 2–5 are the combined screen. See "Front-edge and back-edge."
1c. **Back-edge round 5 — RESOLVED.** Round 5 is its own screen: vote + reveal +
   an OPTIONAL opt-in re-enroll offer (same teacher). Pic and re-enrollment are
   DECOUPLED — uploading never silently means "another class." Offer fires only
   after class → `completed` (World B guard). "Same teacher" bypasses placement and
   likely routes via the POOL. See "Front-edge and back-edge."
2. **Did a stored per-pic DESCRIPTION ever exist?** Almost certainly NO. In the
   entry round the student writes `favorite_comment` = why they liked a TEACHER
   pic — a comment on someone else's photo, not a description of their OWN.
   Nothing in the #13 schema holds "here's my pic + what it is." So the description
   is a NEW field on the new upload table, written on the combined screen at upload
   time, REQUIRED. **Confirm against actual code** before recording either way.

---

## BUILD ORDER (what to build first — settled this session)

Build bottom-up: data → teacher gate → student screen → tally. Do NOT start with
the pretty student screen — it reads/writes tables and an approval flow that don't
exist yet, which is exactly the "verified but the lifecycle wasn't actually there"
trap #13 kept hitting.

1. **Schema first (SQL — Mike's strong surface, verifiable with proof queries
   before any UI):** per-round student-upload table (pic + owner + round +
   description); approval-state columns on uploads AND on peer comments; `dropped`
   enrollment status + CHECK update. Nothing renders without this.
2. **Teacher approval surface:** the screen where pic / description / peer comments
   get approved and a round gets closed. This is the gating dependency for
   everything else AND the slice the plan doc sequences early. Without it the
   student screen has nothing to gate against.
3. **The combined student screen:** vote + upload-next + describe. Only buildable
   once there's a table to write to and a teacher who can approve what lands there.
4. **Tally + reveal + auto-completion:** last — it READS everything 1–3 produce
   (cross-student tally → round winner → grand total → class winner → class
   `completed`).

## Slice ORDER question (check before building this)

Closing rounds and approving comments/uploads all live on a **teacher surface**
that doesn't really exist yet. The plan doc (`2-PLAN_multi_cohort_entry_and_round2
.md`) puts the teacher-dashboard slice EARLIER (slice ~2) than peer content
(~Round 2). So this social slice probably CANNOT go first — it needs a teacher
screen to approve uploads, clear the comment queue, and trigger reveals. Re-read
the plan doc order with this dependency in mind before committing to build order.

---

## Working agreement (unchanged from #13, still in force)

- Mike holds editor, Supabase dashboard, all keys, all pushes. Claude never
  handles real keys, never pushes.
- Whole-file artifacts as DOWNLOADABLE FILES with full destination path. New routes
  need a NEW FOLDER.
- Mike isn't fluent in JS/TS but IS confident at Supabase SQL — lean on SQL proof
  queries to verify behavior before declaring done.
- Verify-before-declaring, ESPECIALLY git. `git status` / `git show --stat HEAD`
  before trusting commit state.
- Migrations folder = STRUCTURAL changes only (columns/tables/policies/functions/
  indexes). Seeds → docs/seeds; test-data → scratch. Run-in-dashboard AND
  save-to-`supabase/migrations/` for every structural change.
- His asides are usually the right call — LISTEN for them. (This session's
  "should the teacher set the class start time" and "did students ever describe
  their pic" asides both shaped the spec.)

---

## First-message-to-next-Claude

This is a SPEC handoff, not a verification handoff — nothing here is built. Read
this whole doc, plus #13 and `2-PLAN_multi_cohort_entry_and_round2.md`.

If the session turns to BUILD, build BOTTOM-UP per the BUILD ORDER section: schema
→ teacher approval surface → combined student screen → tally/reveal. Do NOT start
with the student screen. The slice-order dependency still holds — the social slice
needs the teacher surface, which the plan doc sequences early.

The timing wrinkle is RESOLVED (combined screen decouples upload from voting in
time). Both edges are RESOLVED: the front-edge — the entry round is pre-commitment
placement onboarding OUTSIDE the round count (unscored, untouched from #13), "5
rounds" = 5 student-pic rounds, round 1 is standalone upload-only, rounds 2–4 are
the combined screen; and the back-edge — round 5 is its own screen (vote + reveal +
an OPTIONAL opt-in re-enroll offer, same teacher, decoupled from the pic, fires
only once the class is `completed`). At the screen level the design is now fully
specified (4 screen shapes). Nothing screen-level is left open.

The model is fully specified: 5 rounds, everyone spotlit every round, one-round-win
cap with runner-up reassignment, class winner = grand-total votes, teacher-
triggered reveal (= approving the final comment), 24/22/24 daily clock, two
approval gates (upload: pic+description; reveal: peer comments), dropout at two
consecutive misses with a first-miss warning, pool/backfill from the entry round
(fairness not engineered), adults-only with an 18+ attestation (a terms mechanism,
NOT a filter — keep that caveat attached).

Schema deltas to build: a per-round student-upload table (pic/owner/round +
description), cross-student vote tally, peer-comment approval state, `dropped`
enrollment status, per-round participation/miss tracking, auto-completion at
round 5. Reused: the entry-round favoriting UI; the existing `round` column;
`enrollments.status` + the partial unique active-enrollment index from #13.
