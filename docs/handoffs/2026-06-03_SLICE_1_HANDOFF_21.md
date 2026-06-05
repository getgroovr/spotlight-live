# SLICE 1 HANDOFF #21 — KEY FINDING: the classroom game loop is UNBUILT. `spotlight.jsx` is only Round 1 (the front-door demo). The real next thing is the logged-in profile→upload→game surface. Sequence decided. Review kept but folded into deck-fill. Soft nudge, not hard cutoff.

**Date written:** 2026-06-03
**Picking up from:** #20 (design decided — per-player progression, end-of-game top-3 reveal, no new schema)
**This session:** Read the actual engine (`spotlight.jsx`) and discovered the multi-round classroom game doesn't exist in code yet. Resolved the two-track schema mystery. Decided the student's first-session sequence. Resolved the teacher-review tension. Decided soft-nudge over hard-cutoff. Revised the build order accordingly.
**Destination:** `docs/handoffs/`

---

## ⭐ START HERE — WHAT TO PASTE BEFORE WE BUILD (do this first, every session)

**Next Claude: walk Mike through this list as step one. Don't start designing or coding until the orientation set is in. Mike has this saved as a txt file too, but make it easy — just ask for the items below.**

A column dump (`information_schema.columns`) does NOT show functions, RLS policies, or indexes. That's the main blind spot. So the minimum to actually BUILD (not just diagnose) is:

**Always paste first — the orientation set (3 files):**
1. The schema dump — the `information_schema.columns` query from #19/#20 (table/column/type/nullable/default).
2. `src/game/spotlight.jsx` — the round-1 engine.
3. `src/app/play/actions.ts` — enrollment + profile server actions.

**Plus ONE SQL query not yet captured** — fills the function/policy blind spot. One result set:

```sql
select p.proname as name, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
```

This returns the real SQL for the RPCs the reveal depends on (`tally_round`, `class_round_winners`, `class_grand_totals`) — never actually seen, only referenced.

**Then, depending on what we're building that session:**
- **Profile + self-photo step:** the profile page file (where `saveProfile` is the `<form action>`) + `src/game/students.js`
- **Upload + deck:** `src/lib/deck.ts` + `src/game/students.js` + the teacher review surface (`teacher/deck/`, `teacher/social/`, or `teacher/students/` — whichever holds approval, or confirm none does)
- **Reveal:** the RPC definitions (from the query above) are the main thing

That orientation set + the function query is the true minimum. The handoff itself supplies the design; these supply the ground truth to build against.

---

## 🔑 THE KEY FINDING — the classroom game loop does not exist yet

`spotlight.jsx` is the **front-door demo, and it only does Round 1.** A visitor plays shuffle-stop on nine starter pics, comments on each (min 8 chars, `myComments` keyed by student id), picks one favorite, enters an email, and `enrollStudent` fires. That's the entire lifecycle in code.

Confirmed three ways:
- The engine's own header comment: *"No self-photo here — the student's own content photo belongs to round 2."* Round 2 is named as future.
- **No upload UI exists anywhere** in `spotlight.jsx` — no file input, no write to `submissions`/`entries`. The student never posts a pic.
- `enrollStudent` writes the round-1 `game_sessions` jsonb blob and stops. It never touches `submissions`/`submission_favorites`.

**This reframes the whole build order.** HANDOFF #20's steps (completion transition → reveal RPCs → teacher close action) are correct but assumed a student game loop already existed to attach them to. It doesn't. The real **Step 0** is building the logged-in classroom surface itself: the screen an enrolled student lands on after the magic link, where they upload their pic for a round and comment on classmates' pics.

### Two-track schema mystery — RESOLVED
- `game_sessions` jsonb (`comments`, `favorites`) = **Round-1 demo data.** The blob the front-door engine writes.
- `submissions` + `submission_favorites` (with `round`, `voter_student_id`) = **the empty home the real classroom game was always meant to write to.** Empty because the thing that writes there hasn't been built.

No conflict, no two-writers bug — just one populated track (demo) and one empty track (real game, unbuilt).

---

## ✅ DECIDED THIS SESSION

### 1. The student's first-session sequence
**magic link → profile (name, screen name, self-photo, the "why") → upload first pic + description → straight into the game, with their OWN pic showing immediately.**

- Profile is half-built: `saveProfile` already saves `name` + `screen_name`; `students.photo_url` column exists but is empty — that's the home for the **self-photo** (the missing piece).
- The first-pic upload is genuinely new — no upload UI exists.
- "Straight into the game" works because the upload gate guarantees the student has at least their own pic to see. The button lights up on upload.

### 2. Teacher review — KEPT, but folded into deck-fill (this dissolves the "review kills the flow" problem)
Review is the **safety backbone** (stops inappropriate uploads reaching other students). Do not cut it. The fix is to stop conflating two moments:
- **Student uploads → instantly in the game, sees their OWN pic.** Their own photo needs no approval to show back to them. Flow preserved.
- **Teacher approves → pic enters EVERYONE ELSE's deck.** Review gates only *cross-student visibility*.

From the student's side this is identical to the deck-fill model already accepted: "here are the classmate pics available right now; check back as more appear." A pending-review pic and a not-yet-uploaded pic sit in the same "not here yet" bucket — **no new mechanism.** The teacher reviews at their own pace and blocks nobody.

This points at **`entries`** as the home table — it already has the review flow (`status` pending→approved, `reviewed_by`, `reviewed_at`). The deck query filters to approved. (Confirm against RLS once the function/policy query is in.)

### 3. The empty-deck / first-uploader case
Not an edge case to engineer around — it falls out of reading a table that happens to have few rows. The first student uploads, hits start, and sees only their own pic + a "you're first — check back as classmates join" state. Needs a deliberate friendly waiting screen, NOT a broken-looking empty grid.

### 4. Cutoff — SOFT NUDGE, not hard cutoff
- **Soft nudge (build this):** display-only suggested date — "upload by Friday so classmates have time to see your photo." Maybe a teacher at-a-glance list of who hasn't uploaded. Enforces nothing; late uploads still work, they just catch fewer eyes. Cheap: a date field + text, no scheduled jobs.
- **Hard cutoff (parked):** system-enforced upload lock at a deadline. Needs scheduled-job + wall-clock machinery and creates the "teacher racing the clock to review" problem. Mike's own reasoning settles it: a late upload getting fewer responses is "its own consequence" — which is exactly what a nudge allows. The only thing a hard lock adds is preventing late uploads, which we've agreed is fine to allow.

---

## REVISED BUILD ORDER

**Step 0 (NEW — the real next thing): the logged-in classroom surface.**
The screen after the magic link. Smallest sensible first version = the profile + self-photo step, since `saveProfile` already exists and only the photo upload is missing. Then the first-pic upload. Then the game view reading classmate pics from `entries` (approved only).

**Step 1 — Completion transition** (#20's step 1): what flips `active`→`completed`. Can't attach until Step 0's loop exists.

**Step 2 — Reveal RPC(s)** (#20's step 2): `class_grand_totals` for top-3; per-student reveal data. Needs the RPC definitions (orientation query).

**Step 3 — Teacher close-game action** (#20's step 3).

(#20's full reveal design still stands: top-3 by total favorites; Panel A = most-favorited posted pic + comments from favoriters only; Panel B tiered Gold=9 / Silver=6 / Bronze=3, chronological, own comments.)

---

## FILES SEEN vs. NOT SEEN (as of this session)

**Seen:** `actions.ts`, `play/page.tsx`, `game/shell.jsx`, `game/spotlight.jsx`, the schema column dump.

**Referenced but NOT seen (needed to build):**
- RPC definitions (`tally_round`, `class_round_winners`, `class_grand_totals`) — get via orientation query
- RLS policies / indexes — same blind spot
- `src/game/students.js` — deck data shape / DB-row→render contract (`STUDENTS`, `liveEntry`, `addEntry`)
- `src/lib/deck.ts` — `loadGenericDeck`; the classroom deck is a sibling
- Teacher review surface — `teacher/deck|social|students/` (which one holds approval, or confirm none yet)
- Profile page — where `saveProfile` is the form action; THE file the self-photo upload gets added to

---

## OPEN / PARKED

- **Profile self-photo upload:** the half-built piece — `students.photo_url` empty, needs an upload control. First concrete build target.
- **`entries` vs `submissions` final call:** leaning `entries` (review flow built in). Confirm against RLS before committing.
- **Hard cutoff:** parked (see §4). Soft nudge is the build.
- **Unchanged from #20:** `bac4d923` single-vs-multi-cohort (Mike's call); `class_round_winners` dormant; `saveProfile` session-targeting ambiguity (flag at multi-round); product observations (CSV gate, note-editor collapse, magic-link landing `/play` not `/student/dashboard`, "1 Issue" overlay); dead `sessions`/`session_comments` tables.

---

## Working agreement (unchanged)
Mike holds editor/dashboard/keys/pushes. SQL editor = one result set per run. `supabase/migrations/` = STRUCTURAL only; seeds/proofs/diagnostics are snippets, not repo. Verify before declaring done. Mike's confident at SQL, less so JS/TS — lean on SQL proofs.

---

## First-message-to-next-Claude

**Step one: ask Mike for the orientation set (top of this doc) before doing anything else.** The 3 files + the one function/policy SQL query. He has the list saved but make it easy — just request the items.

**The headline he needs to hear:** the multi-round classroom game isn't built yet. `spotlight.jsx` is only the Round-1 front-door demo. The real next thing is the logged-in surface: profile + self-photo → upload first pic + description → into the game showing their own pic, classmate pics appearing as they're uploaded **and approved**.

**Decided, don't re-open:** the first-session sequence (§1); review is kept but only gates cross-student visibility, folding into deck-fill (§2); soft nudge not hard cutoff (§4); `entries` is the likely home table (confirm vs RLS). Two-track schema is resolved: `game_sessions` jsonb = demo, `submissions`/`submission_favorites` = empty real-game home.

**Smallest first build:** the profile + self-photo step (`saveProfile` exists; only the photo upload is missing).
