# SLICE 1 HANDOFF #24 — First student-led in-class game RUNS end-to-end. `/student/play` route auth-gated; `class-deck.ts` signs PRIVATE-bucket media URLs; dashboard button repointed. Pre-existing hydration mismatch on the splash "Resume" branch FIXED (mounted gate, classic React SSR pattern). Engine still 9-tile-flavored — Mike confirmed **Option A** for the adaptation: student's own tile SHOWS in the grid but the comment cycle SKIPS it, with a "pending approval / waiting on classmates" note when alone. NEXT (Mike's call): (a) engine-adaptation pass on `spotlight.jsx`, OR (b) round-timing feature (still parked, still Mike's active interest).

**Date written:** 2026-06-04
**Picking up from:** #23 (entry-write fix from #23 needed verification + the in-class view was net-new)
**This session:** Verified the #23 entry-write row lands with the correct profile-track FK. Built and verified the in-class game: new class-deck loader signing URLs from PRIVATE `media`; new `/student/play` route; dashboard "Go to the game →" repointed. Fixed a pre-existing SSR hydration bug on the splash "Resume" branch (localStorage read at render → server/client mismatch). Verified end-to-end at N=1: signed URL rendered, splash → Enter the stage → STOP → comment loop → favorite-pick all worked. Engine adaptation deferred — list + chosen design captured below.
**Next model:** Opus 4.7 (this session); 4.7 followed the agreement — whole-file downloads, one copy-clip per command, asked for files before assuming. Keep using whatever model is current; the working agreement is what matters.
**Destination:** `docs/handoffs/`

> **Mike's standing request (honor it):** keep the three pinned blocks below — **HOW TO WORK WITH MIKE**, the **ROUTE MAP / FILE TREE**, and the **SQL-COMMANDS list** — at the TOP of every future handoff. Bake it in by default; don't make him ask.

---

## ⭐⭐ READ THIS FIRST — HOW TO WORK WITH MIKE (do not skip, do not improvise around it)

These are not preferences to honor when convenient. They are the working agreement.

1. **Whole-file replacements, delivered as DOWNLOADABLE FILES via `present_files` — NEVER pasted into chat as code blocks.** Write the file to `/mnt/user-data/outputs/<name>.<ext>` and call `present_files`. Mike downloads it and drops it into VS Code at the exact path you state. Do NOT say "replace the saveProfile function with…" — give the entire file as a download. Long files pasted into chat get corrupted by smart quotes, line-ending mangling, and copy-paste fatigue. (#24 had to be reminded of this mid-session — bake it in by default. New sessions: code is downloads, period.)

2. **One copy-clip = one command.** Never put two things to run in a single code block. "Run this SQL, then paste the result, then run this" = THREE separate blocks. Each block self-contained, copyable whole.

3. **Mike runs SQL (Supabase SQL editor) and PowerShell (VS Code integrated terminal) comfortably.** Lean on those. One result set per SQL run. **PowerShell commands go in the VS Code terminal, NOT the Supabase SQL editor.** If a different tool is ever needed, walk him through it step by step.

4. **Read his screenshots.** When he posts a file-tree or terminal screen grab, the answer is usually right there. Look before guessing.

5. **Don't inflate scope.** When something is small, say it's small and just do it.

6. **Confirm before building on an unknown.** If a file hasn't been seen, don't write code that assumes its contents. Ask for the file. (This session: viewed `spotlight.jsx` before patching it; flagged Option A's risk explicitly before building; named the residual unknown — engine's <9-tile behavior — before claiming victory. Keep doing this.)

7. **Resume state lives in `localStorage`, NOT in the DB.** When Mike clears a `students` row to "reset", the splash will STILL show "Resume where you left off" because the engine reads `localStorage[SAVE_KEY]` (see `spotlight.jsx` ~L60). InPrivate windows do NOT clear it within the same window's lifetime. To clear: DevTools → Application → Local Storage → `localhost:3000` → delete the key. Mention this preemptively when Mike's cleanup looks like it didn't take.

---

## 🗂️ ROUTE MAP / CONFIRMED FILE TREE (updated this session)

Routable files under `src/app/`:

```
src/app/auth/callback/route.ts
src/app/auth/confirm/route.ts
src/app/auth/login/page.tsx                ← TEACHER sign-in (password)
src/app/auth/signup/page.tsx
src/app/play/page.tsx                       ← VISITOR play (cross-class, ≥9 guard)
src/app/student/dashboard/export/route.ts   ← per-class CSV export
src/app/student/dashboard/page.tsx          ← PROFILE / finish-joining
src/app/student/login/page.tsx              ← returning-student magic-link
src/app/student/play/page.tsx               ← ✅ NEW (#24) — in-class game, signed-in
src/app/teacher/deck/page.tsx
src/app/teacher/social/page.tsx
src/app/teacher/students/export/route.ts
src/app/teacher/students/[id]/page.tsx
src/app/teacher/students/page.tsx
src/app/page.tsx
```

Non-routable but relevant: `src/game/{shell.jsx, spotlight.jsx, students.js}`; `src/lib/{deck.ts (visitor), class-deck.ts ✅ NEW #24, student-archive.ts, supabase-server.ts}`; `src/app/student/dashboard/{ProfileArchive.tsx, PhotoField.tsx}`.

**Key route distinction (confusing without it):** `/play` is the cross-class VISITOR demo with the ≥9-photo guard, using PUBLIC `teacher-deck` starters via `getPublicUrl`. `/student/play` is the auth-gated CLASS view that handles any N, using PRIVATE `media` entries via `createSignedUrl`. They are NOT interchangeable; they read different tables and different buckets.

---

## 🧱 SQL / COMMANDS THE NEXT BUILD WILL NEED (each its own copy-clip)

Verify entry-write rows (regression check):
```sql
select id, student_id, class_id, status, media_url, uploaded_at
from public.entries
where is_starter = false
order by uploaded_at desc
limit 5;
```

Route map (re-run if tree changed — PowerShell, VS Code terminal):
```powershell
Get-ChildItem -Path src\app -Recurse -Include page.tsx,route.ts | ForEach-Object { $_.FullName.Replace("$PWD\","") }
```

Clear a student row to reuse an email (also clear browser localStorage — see HOW TO WORK WITH MIKE #7):
```sql
delete from public.students where email = 'SOME_EMAIL_HERE';
```

`classes` columns (round-timing build adds fields here — confirm current state before migrating):
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'classes'
order by ordinal_position;
```

**Storage (unchanged from #23):** `profile-photos` PUBLIC, `media` PRIVATE, both written via service-role admin (bypasses storage RLS — no policies needed). PRIVATE `media` reads need `createSignedUrl` (admin, 1h TTL works); `getPublicUrl` returns null for anon against private buckets (migration 08 lesson).

---

## ✅ WHAT SHIPPED THIS SESSION

**1. #23's entry-write fix verified.** Real submission landed: `student_id` = profile id (auth uid), `class_id` = real class, `status='pending'`, `media_url` = `<class_id>/<user.id>-<ts>.<ext>` path-not-URL format.

**2. NEW `src/lib/class-deck.ts`** — class-scoped deck loader, parallel to `deck.ts`. Filters `entries` by current student's `profiles.class_id`. Visibility: classmates' entries only at `status='live'`; own entries at `pending` OR `live`. Two queries + merge (clearer than a compound `.or()` filter). Signs URLs via `createSignedUrl` on PRIVATE `media` (admin, 1h TTL). Hydrates display from `profiles` (`display_name` → `username` → "Classmate" fallback; `color` → palette fallback; `bio`). Returns `EngineStudent[]` of any N (no 9-photo guard). Lifts current student to front of array.

**3. NEW `src/app/student/play/page.tsx`** — the in-class game route. Calls `loadClassDeck()`, renders `<GameShell initialStudents={...}>` on success, or one of four audience-appropriate holding pages (no-supabase / no-session / no-class / no-entries). `dynamic = "force-dynamic"` so signed URLs don't get baked into a static prerender.

**4. MODIFIED `src/app/student/dashboard/page.tsx`** — one-line change: "Go to the game →" button `href="/play"` → `href="/student/play"`. Everything else byte-identical.

**5. MODIFIED `src/game/spotlight.jsx`** — SSR hydration fix on splash "Resume where you left off" branch. Added `[mounted, setMounted] = useState(false)` + `useEffect(() => setMounted(true), [])`, gated `canResume` on `mounted`. Pre-existing bug: `hasResumableProgress()` reads `localStorage` at render → server sees no resume, hydrating client (with leftover save state) sees resume → mismatch. Standard React SSR fix. Diff is two additions + one line modified, nothing else touched.

**Verified end-to-end with one real class entry:** finish-joining submit → entry row lands `pending` → "Go to the game →" → splash → "Enter the stage" → game runs with one tile → STOP → photo renders via signed URL → comment input → save → "Pick your favorite" with one option → favorite saved. The whole pipeline works.

**Four commits landed this session (in Outgoing — need a `git push` when Mike's ready):**
- `docs: backfill slice 1 handoffs #17–#19`
- `slice 1: self-photo upload + first game-entry write (verified) + live photo preview + teacher CSV reorient to written language`
- `docs: add slice 1 handoffs #20–#23`
- `slice 1: first student-led in-class game view (class-deck + signed media URLs + /student/play route + SSR hydration fix on splash resume branch)`

This handoff (#24) will be a 5th commit (`docs: add slice 1 handoff #24`).

---

## 🎯 NEXT SESSION'S BUILDS (Mike's call which order)

### (a) Engine adaptation pass on `spotlight.jsx` — Mike picked Option A

The engine was built for a fixed 9-tile single-session visitor demo. It now consumes a living class deck (any N, growing over time, student's own entry mixed with classmates'). Mechanics work; the framing is off. The list:

- **Intro copy** — hardcoded "Nine photos. Hit stop, look closely, and tell us what you see." Generalize for any N. E.g. "Photos from your class. Hit stop, look closely…" (final phrasing is Mike's call.)
- **Skip own tile in the comment cycle (Mike's Option A).** Student's own tile SHOWS in the grid but the comment loop SKIPS it — they already wrote a description at upload; re-commenting on their own photo is redundant. Implementation note: the student's own `EngineStudent.id` equals their `auth user.id` (per `class-deck.ts`). Cleanest path: add an `isSelf: boolean` field to `EngineStudent` (default false in `deck.ts`; set true in `class-deck.ts` for the matching id), then skip in the comment loop. Alternative: pass current `user.id` as a separate prop through `GameShell` → `App` and compare inside.
- **"Pending approval / waiting on classmates" note when alone.** When the only EngineStudent is the current student (own `pending` entry, no classmate `live` entries yet), display a friendly note: "Your photo is pending teacher approval. Your classmates' photos will appear here as they upload and the teacher approves them." Surface location TBD — likely splash or post-STOP.
- **"Pick your favorite" with one option** — currently asks them to "pick" their only choice, which is silly. If `students.length === 1` (i.e., just self, no classmates yet), skip the favorite-pick OR replace with the "waiting" note above. Tied to the previous bullet.
- **Favorite-change semantics across rounds** (Mike's question, parked): when round 2 opens and new photos appear, can the student change their previously-recorded favorite? Design call. Schema (`game_sessions.favorites` jsonb map keyed by entry id) supports either.

**Files needed:** `src/game/spotlight.jsx` (820 lines), `src/game/students.js` (already on disk from #24 — see uploads). Skim deck.ts + class-deck.ts again before editing — the `EngineStudent` shape is the contract.

### (b) Round-timing feature (still parked, still Mike's active interest)

Unchanged from #23 — entirely from scratch:
- Teacher sets each round's length (1 hr / 1 day / 1 week) and the game-end.
- Student sees the current round's deadline from first upload on, and on every subsequent one.
- **Display location:** rework the profile's "What happens next" section to carry the timing.
- **Example copy Mike wants:** "The teacher has set a 22-hour limit to finish this round. The next round begins in 24 hours — upload your pic as soon as you can so your classmates have time to comment on it."
- **Button gating:** "Go to the game →" moves to the BOTTOM near the timing text, GREYED OUT until the student explicitly agrees to the timeframe (acknowledgement gate).
- `classes` has no fields for this — needs a migration (per-round duration or computed deadlines).
- No teacher class-settings UI exists — extend `/teacher/deck` or build a new settings screen.
- Relates to long-parked "soft-nudge date field is the cutoff build."

---

## 📌 OPEN / CARRIED FROM #23 (still unresolved)

- **Bridge students↔profiles seam** — for the teacher CSV's own-photo column to populate, and any mixed `game_sessions` ↔ `entries` view to work. Map via `students.email` → `auth.users` → `profiles.id`. Decide whether to denormalize a `profile_id` onto `students`.
- **entries-vs-submissions mismatch** — reveal RPCs (`class_grand_totals`, `class_round_winners`, `tally_round`) read `submissions` + `submission_favorites`, but upload/review flow targets `entries`. Resolve BEFORE building reveal.
- **"Game over" representation** — needed for CSV button gate on student profile. Assume `enrollment` flips to `status='completed'`; confirm against schema.
- **`student-archive.ts` bug (flagged but not fixed):** reads entry ids from `game_sessions.comments`, not from `entries` directly — so a fresh `pending` entry won't show on the student's own profile. Also still uses `getPublicUrl` against `teacher-deck` for entries that live in private `media`. Fix when touching the dashboard profile read path.

**Parked features (not now):** end-of-game 1st/2nd/3rd place; "Join a new game" button; teacher condensed all-class view; React "two children with same key" warning on /teacher/students; carry-overs from #22 (`bac4d923` single-vs-multi-cohort, saveProfile multi-round session-targeting, soft-nudge cutoff, dead `sessions`/`session_comments` tables).

---

## 🔎 NEW CONFIRMED FACTS (so the next model doesn't re-derive)

- **`EngineStudent` shape** (exported from `src/lib/deck.ts`, also produced by `class-deck.ts`): `{ id, name, color, bio, entries: [{ primary, description, mediaType, uploadedAt, descriptionText, descriptionL1, readingAudio }], peerComments: [] }`. `students.js` confirms this is what the engine consumes.
- **`profiles` columns relevant to in-class display:** `display_name`, `username`, `color`, `bio` — all exist, all read by `class-deck.ts`. `display_name` is primary label, `username` is fallback.
- **PRIVATE `media` bucket reads:** `createSignedUrl` with the admin (service-role) client works from any server-side context; 1-hour TTL covers a play session comfortably. `getPublicUrl` returns null for anon against private buckets.
- **`spotlight.jsx` map (post-#24):** 820 lines, `"use client"`. App component starts L577. State cluster L578-584. Mounted gate + effect at L586-595 (added #24). `canResume` at L668 (was L658 pre-fix). `localStorage` is hit synchronously by `loadProgress()`/`hasResumableProgress()` at L63-79; `SAVE_KEY` just above. **Any future read of session-derived state needs the `mounted` gate pattern.**
- **Engine state machine (observed):** `view` ∈ {`splash`, `game`, ...favorite-pick/done...}. `phase` (inside game) ∈ {`idle`, `running`, `done`}. `shownIds` is a Set of tile ids that have been spotlighted; `allShown = shownIds.size >= students.length` is the end-of-deck gate.
- **Engine handles N<9 without crashing.** Verified at N=1: shuffle no-ops, STOP immediately resolves to the one tile, comment loop runs once, favorite-pick shows one tile. UX is incoherent (still says "Nine photos") but no exceptions.

---

## 🛠️ BUILD ORDER UPDATE

- **Step 0 — logged-in classroom surface.**
  - ✅ profile + self-photo upload (#22/#23)
  - ✅ first game-entry upload (#23, verified #24)
  - ✅ in-class read view at `/student/play` with signed `media`-bucket URLs (#24)
  - ✅ SSR hydration fix on splash resume branch (#24)
  - ▶️ **NEXT:** engine-adaptation pass on `spotlight.jsx` (own-tile skip + N≠9 copy + 1-tile end-state + favorite-change), OR round-timing — Mike's call.
- **Step 1** — completion transition (active→completed). Unblocks CSV "game over" gate.
- **Step 2** — reveal RPC(s) — BUT FIRST resolve entries-vs-submissions mismatch.
- **Step 3** — teacher close-game action; parked teacher condensed-view.

---

## Working agreement (unchanged)

Mike holds editor/dashboard/keys/pushes. SQL editor = one result set per run. `supabase/migrations/` = STRUCTURAL only; seeds/proofs/diagnostics are snippets, not repo. Verify before declaring done. Mike's confident at SQL + PowerShell, learning JS/TS — lean on SQL/PS proofs and downloadable whole-file swaps.

---

## First-message-to-next-Claude

**Step one: read the "HOW TO WORK WITH MIKE" block and follow it.** Whole-file replacements as DOWNLOADABLE FILES via `present_files` — never paste long files into chat. One command per copy-clip. PowerShell goes in the VS Code terminal, not Supabase. Read screenshots. Don't inflate scope. Keep the three pinned blocks at the TOP of the NEXT handoff too.

**Step two: ask Mike which build first.**
- **(a) Engine adaptation pass on `spotlight.jsx`** — own-tile skip in comment cycle, N≠9 intro copy, 1-tile end-state, favorite-change. You'll need `spotlight.jsx` (820 lines) and `students.js`. Mike picked **Option A** for the design (own tile shown, comment cycle skips it, "pending approval / waiting on classmates" note when alone).
- **(b) Round-timing feature** — migration + teacher control + student-facing display + agree-gate. From scratch; `classes` has no timing fields. Mike's active interest, parked twice now.

**Don't re-open:** §"WHAT'S LOCKED" from #21/#22/#23 (two-track schema, entries lifecycle pending → live → archived, two distinct photos self vs entry, etc.). **Resolve before reveal:** entries-vs-submissions mismatch + students↔profiles seam. **Don't add:** storage policies (service role bypasses RLS).
