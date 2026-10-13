# 2026-06-07 Slice 1 Handoff #30

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** ask Mike to upload the existing teacher UI files (he knows where they live; the chat below didn't see them). Don't start writing teacher UI code from imagination — read what's there first.
- **Then read** `src/app/student/results/page.tsx` and `src/app/student/results/RevealCeremony.tsx` to understand the patterns set last chat (server-fetch + client-ceremony split, two-client auth pattern, tier-cap-in-TS). Teacher UI will likely reuse some of these.

---

## TL;DR — current state

- **Reveal page is DONE and verified.** v2 shipped: RPC rewritten, page split into server + client, multi-screen bronze→silver→gold→finish flow working. Tested with 1-winner data path (Gold-only screen).
- **Next big task: Teacher UI expansion.** Mike has been wanting this since the top of last chat; reveal page was a meaningful detour. Teacher UI file already exists with per-student drill-down; needs class management + pending-review queue + per-student CSV layered in.
- **Don't trust the #29 handoff's claim that admin bypasses `is_enrolled_in()`.** It doesn't. Admin actively FAILS the check (verified empirically). Pattern is corrected in `results/page.tsx` — user client for RPC, admin for storage signing.

---

## What got done this chat (#30)

### Reveal page (Priority 2 from #29) — COMPLETE

1. **Built v1**: `src/app/student/results/page.tsx` as a single server component with podium + per-winner sections + Panel A (their top entry + favoriters' comments) + Panel B (their own picks). Single long page.

2. **Verified the data layer end-to-end**: roster query, two-class diagnostic, seed voters, configured class timing. The RPC works when called as the user (not admin — see gotcha below).

3. **Rebuilt as v2** after Mike's design feedback: dropped Panel B entirely, expanded Panel A to support multiple favorited entries per winner (capped by tier: Gold 3, Silver 2, Bronze 1). Split into:
   - `src/app/student/results/page.tsx` — server component: auth, fetch, sign URLs, hand resolved data to client.
   - `src/app/student/results/RevealCeremony.tsx` — client component: manages bronze→silver→gold stage transitions with `useState`, advances via button click, routes to `/student/dashboard` on Finish.
   - `class_top_three_reveal` v2 migration deployed to Supabase. Replaces `panel_a` + `panel_b` shape with `favorited_entries: [...]` array (ordered fav_count DESC). Page applies tier cap in TypeScript (`TIER_CAP` constant) so it's tunable without DB changes.

4. **Tested with real data**: myked (4 favorites total, across 2 entries — Round 1 with 3 favs, Round 9 with 1 fav). Single-winner path correctly suppressed the progress dots, "Finish the game →" routed to dashboard.

### Tier caps and ordering decisions made

- Gold 3 / Silver 2 / Bronze 1 entries per screen (locked in via `TIER_CAP` in page.tsx).
- Within a screen, entries ordered **most-favorited first** (Mike's choice).
- Comments within an entry ordered by `author_screen_name` (deterministic).
- Screens ordered worst-first (Bronze → Silver → Gold) — classic awards-ceremony pattern.

---

## The next task: Teacher UI expansion

Mike's words (paraphrased and ordered):

> The teacher UI has already been started. It currently allows the teacher to click on each student to open up all their contributions to the game. What it doesn't do yet is manage the whole game — the name of the class (currently it's "Backdoor" or "Front Door", which is dumb; the teacher should name their class — maybe just the date it started by default). The teacher also needs to set the number of rounds AND the timing (how long each round lasts).
>
> Maybe the next area is the photos/descriptions that are pending review — so the teacher doesn't have to go look for them. Once approved they go to the relevant student folder. And the CSV within each student folder, probably only available at the end of the game... but who cares if the teacher wants to use this feature earlier — so be it.

### Layout Mike has in mind (top to bottom)

1. **Class management header** (new)
   - Class name (editable text input; default = the date it started, e.g. "Spotlight — 2026-06-07")
   - Total rounds (numeric input)
   - Round duration (pulldown: 5 min, 15 min, 30 min, 1 hr, 1 day, 2 days, 1 week)
   - "Maybe more" — Mike said this part isn't fully fleshed out yet.

2. **Pending review queue** (new)
   - Photos + descriptions awaiting approval
   - Approval action moves the entry into the relevant student folder
   - Open: scoped to current class only, or all teacher's classes?

3. **Student list** (already exists)
   - Per-student drill-down already implemented
   - Add: CSV download button inside each student's view, gated on `isGameOver` BUT allow earlier (no hard block — Mike: "who cares if the teacher wants to use this earlier, so be it").

### Design questions to resolve EARLY in next chat

Don't start coding until these are pinned down — easier to ask Mike than to guess and rebuild.

- **When does `game_starts_at` get set?** Currently it's a column on `classes` but the trigger for setting it is unclear. Options:
  - On first teacher configuration ("save" sets it to NOW())
  - Explicit "Start game" action by teacher (separate from configure)
  - When first student enrolls
  - When teacher sets it explicitly via a date picker
- **`round_duration_hours` storage.** Column is hours-typed. 5 min = 0.0833 hours — storable but ugly. Options: keep as hours and accept the fractions; rename to `round_duration_seconds` (migration); or rename to `round_duration_minutes`. Mike's pulldown spans 5 minutes → 1 week, so seconds or minutes are both reasonable.
- **Default class name** — "Spotlight — YYYY-MM-DD" matches existing naming pattern. Confirm with Mike.
- **Pending review queue scope** — per-class or global across teacher's classes?
- **Pending review approval flow** — what columns flip on `entries`? Today `entries.status` is `'pending' | 'live' | ...`; approval probably means `pending → live`.

### Files almost certainly involved

- `src/app/teacher/...` — Mike to upload. The existing per-student-drill-down lives somewhere under here.
- `src/lib/supabase-server.ts` — auth client (already familiar).
- Likely a server action file for the mutations (timing config, approval).
- `src/app/student/dashboard/page.tsx` — for the existing CSV implementation Mike wants restored (next CSV section). The handoff #28/#29 trail says it was removed per #23 decision and moved to teacher side — that move never actually happened. Restore from git or pull from `ProfileArchive.tsx` history.

---

## Smaller follow-ups (carry-over + new from this chat)

These don't block teacher UI; do them as natural opportunities arise or before shipping.

### From this chat (#30)

- **Dashboard button rewording.** Current copy: "See the 3 most favorited students →". Mike: "it's not even good English." New copy: **"See who got the most favorites →"** (agreed on in chat). File: `src/app/student/dashboard/page.tsx` — the end-of-game CTA.
- **Student CSV restoration on dashboard.** Per Mike: should come back, gated on `isGameOver`, sitting alongside the reveal button (NOT replacing it — students may re-read comments, screenshot, show parents). The teacher CSV per #23 still goes on the teacher side too; both can coexist.
- **RPC defensive filter.** `class_top_three_reveal` v2 doesn't filter `entry.round_number <= classes.total_rounds`. Mike's test data showed "Round 9" in the reveal because entries were uploaded past round 5 before total_rounds was set. Production won't see this if teacher sets timing before students submit, but worth adding a defensive WHERE clause: `AND e.round_number <= v_total_rounds`. One-liner in the migration.
- **Dashboard ordering rework** (raised mid-chat, not done). Mike wants: current round on top, then future rounds in ASC order, archived at bottom. Archived rounds collapsed into 2-3 column tiles (photo over name) rather than full-width rows.

### Carry-over from #29

- **Round-timing helper extraction (#29 Priority 4) — STILL PENDING.**
  - `TimingShape` / `computeCurrentRound` / `computeIsGameOver` now duplicated in **three** files:
    1. `src/lib/student-archive.ts`
    2. `src/app/student/actions.ts`
    3. `src/app/student/results/page.tsx` (new)
  - Extract to `src/lib/round-timing.ts` and import from all three. ~15 min. Worth doing before the next lock-math change or before teacher UI starts modifying timing (because the teacher UI will need these helpers too — make it 4 files if not extracted first).

### Older

- **Privacy disclosure for comment-writers.** Mike wants students to know their comments may be shown to classmates at reveal. Right place: the comment-writing step in the play flow, with optional soft echo on the reveal page itself ("comments shown here were written by classmates during the game"). Cheap to add later.

---

## Key gotchas / corrections to prior handoffs

### #29 was wrong about admin bypassing `is_enrolled_in()`

The handoff said: "as admin, the `is_enrolled_in` check passes trivially because admin bypasses RLS."

This is **wrong**. `is_enrolled_in()` is a SQL function call inside the RPC body, NOT an RLS policy. It inspects `auth.uid()`, which is null when the request comes in on the service-role JWT. So admin actively FAILS the check (verified: postgres role gets `not authorized for class ...` from the RAISE).

**Correct pattern (now in `src/app/student/results/page.tsx`):**

- User's authenticated cookie client (`createClient` from `@/lib/supabase-server`) for the RPC call — has the user's JWT, `auth.uid()` resolves, `is_enrolled_in()` passes.
- Service-role admin client (`createServiceClient` with `SUPABASE_SERVICE_ROLE_KEY`) for storage signing only.

Same RPC, same one function-call file. Just two clients.

### Two-track student IDs (carry-over reminder from #29)

Still relevant for teacher UI:
- `students.id` — generated on enrollment. Used by `enrollments`, `game_sessions`, `submissions`, `teacher_comments`.
- `profiles.id` — equals `auth.users.id`. Used by `entries.student_id`.
- The bridge between them is `email` (lower-cased). The RPC handles this internally; for any new teacher UI queries that touch both worlds, mirror the email-bridge join.

---

## Test data state (so next-Claude doesn't re-figure)

### Classes

| name | id | total_rounds | round_duration_hours | game_starts_at | notes |
|---|---|---|---|---|---|
| Spotlight — Front Door | `d9ce91d4-793f-4ed9-81ea-201c0d15602e` | 5 | 24 | now() - 6 days | configured + seeded (earlier in chat) |
| Spotlight — Back Door | `bac4d923-8eaa-4feb-8e68-cbbe6d0d82aa` | 5 | 24 | now() - 6 days | configured + seeded; **active test class** |

### Accounts

| email | screen_name | class | role |
|---|---|---|---|
| `getgroovr@yahoo.com` | Mike | Front Door (student); also teacher | dual identity |
| `myked70@yahoo.com` | myked | Back Door | student; **gold winner in last chat's test** |
| `myked70og@gmail.com` | Lovesick | Back Door | student; 1 entry only |
| `thomasoconnor@hotmail.com` | — | NULL | profile exists, not enrolled |

### Seed voters (in students table only — no auth.users)

`seed-voter-1@test.local` through `seed-voter-4@test.local` → Alice Anderson (Allie), Bob Brown (Bobby), Carol Chen (CC), Dan Davis (Danno). All have `game_sessions` rows favoriting myked's entries in Back Door.

To clean up: `DELETE FROM game_sessions WHERE student_id IN (SELECT id FROM students WHERE email LIKE 'seed-voter-%@test.local'); DELETE FROM students WHERE email LIKE 'seed-voter-%@test.local';`

### Data drift to know about

- myked uploaded entries past round 5 (rounds 6, 7, 8, 9) BEFORE total_rounds was set to 5. They still exist in `entries` with their original round_numbers. The reveal page shows "Round 9" for the Dan-favorited entry. See "RPC defensive filter" in follow-ups above.

---

## Files that matter

### Reveal page (last chat's work — done)

- `src/app/student/results/page.tsx` — server component
- `src/app/student/results/RevealCeremony.tsx` — client component
- DB function `class_top_three_reveal` — v2 deployed (migration SQL kept locally by Mike, not in repo)

### Reference patterns (heavily used last chat)

- `src/lib/student-archive.ts` — admin client setup, signed URL pattern, email-bridge join (lines 178-186, 365-398)
- `src/lib/supabase-server.ts` — cookie-based user client
- `src/app/student/dashboard/page.tsx` — design tokens C/F (lines 82-98), reveal CTA button
- `src/app/student/dashboard/ProfileArchive.tsx` — header comment explains the #23 decision about CSV moving to teacher side

### Teacher UI (next chat's work)

- Mike to upload at chat start. Existing file has the per-student drill-down.

---

## What NOT to do

- **Don't start coding teacher UI before seeing the existing file.** It already has the per-student drill-down; reuse its patterns.
- **Don't extract the round-timing helpers as the FIRST teacher UI commit.** Do them as a precursor only if teacher UI will touch timing (it will). Either extract first, or duplicate again and accept the 4-file cleanup later. Mike's call.
- **Don't try to re-design the reveal page.** It works; small follow-ups noted above are it.
- **Don't ask about test data setup before reading the "Test data state" section above.** Everything's there.
- **Don't trust "admin bypasses [auth check]" claims** without checking what the check actually does.

---

## Trust the handoff. Trust the design decisions captured here. Start by asking for the teacher UI files.
