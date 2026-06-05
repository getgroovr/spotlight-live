# SLICE 1 HANDOFF #25 — Engine adaptation pass on `spotlight.jsx` LANDED end-to-end (skip-self in comment cycle + dynamic intro copy + solo-self state). Resume-after-enrollment bug FIXED with three-part patch (route-aware `saveKey()`, `clearProgress()` on enrollment, `/play` redirects enrolled users). Dashboard gains a "Your photo" card surfacing the student's own current-class entry; supporting `ownEntry` add to `student-archive.ts` had a TWO-TRACK STUDENT IDS bug (joined `students.id` instead of `profiles.id`) — FIXED and documented in the file header. "WHAT HAPPENS NEXT" text revised twice; current copy doesn't promise the round-timing email we haven't built. NEXT (Mike's call): (a) solo-self splash redesign — render the 3×3 grid with placeholder tiles + disabled spin button instead of the "waiting for classmates" text ("it's the game, just not populated yet"), (b) upload-from-dashboard feature, OR (c) round-timing (still parked, still Mike's interest — countdown-to-deadline now part of the spec).

**Date written:** 2026-06-05
**Picking up from:** #24 (engine adaptation list captured; Option A chosen; not yet built)
**This session:** Built the entire engine-adaptation pass from #24's plan. Then chased a real bug Mike hit during testing (Resume offering stale visitor game after enrollment) → three-part fix. Then a design improvement (own-photo on dashboard) → which surfaced a real data bug (`student_id` join on the wrong table) → diagnostic SQL pinned it → one-line fix. Plus two iterations on the "WHAT HAPPENS NEXT" copy. Mike confirmed the design direction for solo-self next.
**Next model:** Opus 4.7 (this session). Same agreement: whole-file downloads via `present_files`, one copy-clip per command, ask for files before guessing, read screenshots. Use whatever model is current.
**Destination:** `docs/handoffs/`

> **Mike's standing request (honor it):** keep the three pinned blocks below — **HOW TO WORK WITH MIKE**, the **ROUTE MAP / FILE TREE**, and the **SQL-COMMANDS list** — at the TOP of every future handoff. Bake it in by default; don't make him ask.

---

## ⭐⭐ READ THIS FIRST — HOW TO WORK WITH MIKE (do not skip, do not improvise around it)

These are not preferences to honor when convenient. They are the working agreement.

1. **Whole-file replacements, delivered as DOWNLOADABLE FILES via `present_files` — NEVER pasted into chat as code blocks.** Write the file to `/mnt/user-data/outputs/<name>.<ext>` and call `present_files`. Mike downloads it and drops it into VS Code at the exact path you state. Do NOT say "replace the saveProfile function with…" — give the entire file as a download. Long files pasted into chat get corrupted by smart quotes, line-ending mangling, and copy-paste fatigue. (#24 had to be reminded of this mid-session. #25 made the same mistake EARLY — sent snippet-only `students.js` and `class-deck.ts` for the isSelf field; Mike committed them; both files were wrecked and `loadClassDeck` export disappeared. Recovery took multiple turns. Cost of NOT following this: a real bug in production, real cleanup time. **Bake it in by default. New sessions: code is downloads, period.**)

2. **One copy-clip = one command.** Never put two things to run in a single code block. "Run this SQL, then paste the result, then run this" = THREE separate blocks. Each block self-contained, copyable whole.

3. **Mike runs SQL (Supabase SQL editor) and PowerShell (VS Code integrated terminal) comfortably.** Lean on those. One result set per SQL run. **PowerShell commands go in the VS Code terminal, NOT the Supabase SQL editor.** If a different tool is ever needed, walk him through it step by step. (#25: walked him through DevTools cookie clearing because that was a new tool for the session. Worked.)

4. **Read his screenshots.** When he posts a file-tree or terminal screen grab, the answer is usually right there. Look before guessing. (#25: a terminal screenshot showed git output with `git show HEAD~1 ... > file.ts` that PowerShell had saved as UTF-16 LE — the mojibake in the resulting upload was diagnosable from that one image.)

5. **Don't inflate scope.** When something is small, say it's small and just do it. Conversely: when Mike floats five ideas in a single message (#25 had two of these), don't try to implement all five at once. Triage to "real bugs vs design discussion vs deferred features," fix the one blocker, name the rest for later.

6. **Confirm before building on an unknown.** If a file hasn't been seen, don't write code that assumes its contents. Ask for the file. (#25: viewed `spotlight.jsx`, `student-archive.ts`, `actions.ts`, `/play/page.tsx`, `/student/play/page.tsx` before patching each one. Twice this session, retracting an assertion mid-message was the right call when the screenshot revealed the assertion was wrong.)

7. **Resume state lives in `localStorage`, NOT in the DB. (UPDATED #25.)** Storage keys are now per-route: `spotlight:progress:visitor` for `/play`, `spotlight:progress:student` for `/student/play`. They don't see each other. On successful enrollment, `clearProgress()` wipes the visitor key automatically (see `spotlight.jsx` EnrollForm success path). `/play` ALSO now redirects logged-in enrolled users to `/student/dashboard` before the visitor flow loads. **But:** if Mike clears a `students` row to "reset" while still logged in, the browser cookie persists; he'll still get redirected to /dashboard via `/play`. To truly start fresh: DevTools → Application → Cookies → `localhost:3000` → delete all (the Supabase auth session cookie + the `_next_hmr_refresh_hash` cookie). Then `/play` works anonymous.

8. **Two-track student IDs — DON'T conflate. (NEW #25.)** This codebase has two distinct UUIDs per student that are NOT the same value:
   - **`students.id`** — generated when the student row inserts (in `enrollStudent`). Used by `enrollments`, `game_sessions`, `submissions`, `submission_comments`, `submission_favorites`, `teacher_comments`. Call this the "students track."
   - **`profiles.id`** — equals `auth.users.id` (the magic-link auth user). Used by `entries.student_id`. Call this the "profiles track."

   `saveProfile` writes entries with `student_id = user.id` (= profiles.id). When reading entries back, you MUST join on `profiles.id` / `user.id`, NEVER on `students.id`. The first `ownEntry` query in `student-archive.ts` used `students.id` and silently returned null for every test — Mike correctly suspected a bug, diagnostic SQL pinned it, one-line fix. **The file header of `student-archive.ts` now documents this seam explicitly. Read it before touching any entry query.**

9. **Don't `DELETE FROM students` to reset test state. (NEW #25.)** Mike was doing this and unknowingly nuking his own photos. The `students` table has SIX foreign keys with `ON DELETE CASCADE`: `enrollments`, `game_sessions`, `submission_comments`, `submission_favorites`, `submissions`, `teacher_comments`. (Notably NOT entries — entries cascade off `profiles`, not `students`. But everything else goes.) For non-destructive retesting, use **Gmail plus-addressing**: `myked70og+test1@gmail.com`, `+test2`, etc. — all route to the same `myked70og@gmail.com` inbox but Supabase treats each as a separate student. Test-and-delete the `+testN` accounts freely; the real Mike account keeps its history.

10. **Mike runs out of context awareness, not stamina.** When he says "I'm running out of steam" or "I'll soon run out of data," act with intent — don't start big new features, finish what's in flight, write the handoff before context dies. He's testing this with real people soon; lost work is real cost.

---

## 🗂️ ROUTE MAP / CONFIRMED FILE TREE (unchanged this session — no new routes)

```
src/app/auth/callback/route.ts
src/app/auth/confirm/route.ts
src/app/auth/login/page.tsx                ← TEACHER sign-in (password)
src/app/auth/signup/page.tsx
src/app/play/page.tsx                       ← VISITOR play; #25 added redirect-if-enrolled
src/app/student/dashboard/export/route.ts   ← per-class CSV export
src/app/student/dashboard/page.tsx          ← PROFILE; #25 added "Your photo" card + text revisions
src/app/student/login/page.tsx              ← returning-student magic-link
src/app/student/play/page.tsx               ← in-class game, signed-in (#24)
src/app/teacher/deck/page.tsx
src/app/teacher/social/page.tsx
src/app/teacher/students/export/route.ts
src/app/teacher/students/[id]/page.tsx
src/app/teacher/students/page.tsx
src/app/page.tsx
```

Non-routable but relevant: `src/game/{shell.jsx, spotlight.jsx (#25: engine adaptation + per-route saveKey + clearProgress-on-enroll), students.js}`; `src/lib/{deck.ts (visitor; #25: isSelf:false on starters), class-deck.ts (#25: isSelf:true on current student), student-archive.ts (#25: ownEntry surfaced + bug fixed), supabase-server.ts}`; `src/app/student/dashboard/{ProfileArchive.tsx, PhotoField.tsx}`.

**Key route distinction (unchanged but worth restating):** `/play` is the cross-class VISITOR demo with the ≥9-photo guard, using PUBLIC `teacher-deck` starters via `getPublicUrl`. **#25: `/play` now redirects to `/student/dashboard` when there's a logged-in user with a matching `students` row.** `/student/play` is the auth-gated CLASS view that handles any N, using PRIVATE `media` entries via `createSignedUrl`. They are NOT interchangeable; they read different tables and different buckets and now also write different `localStorage` keys.

---

## 🧱 SQL / COMMANDS THE NEXT BUILD WILL NEED (each its own copy-clip)

Verify entry-write rows for a given email (uses two-track aware join — auth.users, NOT students):
```sql
select e.id, e.class_id, e.status, e.is_starter, e.uploaded_at,
       e.media_url is not null as has_media,
       left(coalesce(e.description_text, ''), 60) as desc_preview
from entries e
join auth.users u on u.id = e.student_id
where u.email = 'SOME_EMAIL_HERE'
order by e.uploaded_at desc;
```

Confirm a student's IDs across both tracks (students.id, profiles/auth.id, current class):
```sql
select s.id as student_id, s.email,
       u.id as auth_user_id,
       p.class_id as profile_class_id
from auth.users u
join students s on s.email = u.email
left join profiles p on p.id = u.id
where u.email = 'SOME_EMAIL_HERE';
```

Inspect CASCADE rules off the `students` table (so the next dev sees the radius of `DELETE FROM students`):
```sql
select tc.constraint_name, tc.delete_rule
from information_schema.referential_constraints tc
where exists (
  select 1 from information_schema.constraint_column_usage ccu
  where ccu.constraint_name = tc.constraint_name
    and ccu.table_name = 'students'
);
```

Approve a pending entry (teacher action — `pending` → `live`):
```sql
update public.entries set status = 'live' where id = 'ENTRY_UUID_HERE';
```

Route map (re-run if tree changed — PowerShell, VS Code terminal):
```powershell
Get-ChildItem -Path src\app -Recurse -Include page.tsx,route.ts | ForEach-Object { $_.FullName.Replace("$PWD\","") }
```

`classes` columns (round-timing build adds fields here — confirm current state before migrating):
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'classes'
order by ordinal_position;
```

---

**Storage (unchanged from #24):** `profile-photos` PUBLIC, `media` PRIVATE, `teacher-deck` PUBLIC, all written via service-role admin (bypasses storage RLS — no policies needed). PRIVATE `media` reads need `createSignedUrl` (admin, 1h TTL works); `getPublicUrl` returns null for anon against private buckets (migration 08 lesson).

---

## ✅ WHAT SHIPPED THIS SESSION

Eight commits landed (one outstanding at write-time — the `ownEntry` query fix). All in Outgoing; Mike will push when ready.

**1. Engine adaptation pass on `spotlight.jsx` (commit `Engine adaptation: skip self in spotlight, dynamic intro, solo-self state`).** From #24's list:
   - **Skip self in spotlight cycle.** Added `isSelf: boolean` to `EngineStudent` type (in `deck.ts`); `class-deck.ts` sets `isSelf: true` for the matching `user.id`, `deck.ts` sets `isSelf: false` on all visitor starters. In `spotlight.jsx`, derived `playableStudents = students.filter(s => !s.isSelf)` and `playableCount` at the top of the App component. Threaded through everywhere the engine previously read `students.length` for "is the game done" / progress purposes: `allShown`, `finishStudent` done check, `resume` done check, header progress display, comment counter, `DoneScreen` review grid. The `stop()` selection pool now excludes `isSelf`. Self stays in the rendered grid (visible) but never lands in the spotlight, never counts toward "done," and never appears as a favorite-pickable tile.
   - **Dynamic intro copy.** Splash now branches: visitor → `"{N} photos. Hit stop, look closely, and tell us what you see."` (drops the hardcoded "Nine"); in-class with classmates → `"{N} classmates to meet. Hit stop…"`; solo-self → `"Your photo is in the queue. Classmates' photos will appear here as they join the game."`
   - **Solo-self state.** When `playableCount === 0 && hasSelf`, the splash replaces the Enter/Resume button with a calm `"Check back once at least one classmate's photo is approved."` line. No reload button — didn't want to imply polling.
   - **Favorite-locking-per-round (decided, not implemented).** Comment block above `DoneScreen` records the decision: students can change their favorite freely while round is LIVE, but cannot change across rounds; cross-round lock enforced server-side when round-timing lands.

**2. Three-part fix for the stale-Resume-after-enrollment bug (commit `Fix stale Resume after enrollment (three-part fix)`).** Mike hit this in testing: after enrolling at `/play`, clicking the email link, finishing joining, then later returning to `/play`, the splash offered Resume from the visitor game he'd already enrolled out of. Three patches together:
   - **`spotlight.jsx`: per-route `saveKey()`.** Replaced static `SAVE_KEY = "spotlight:progress:anon"` with a function deriving the key from `window.location.pathname`: `/student/*` → `"spotlight:progress:student"`, else → `"spotlight:progress:visitor"`. All four storage helpers (`saveProgress`, `loadProgress`, `clearProgress`, `hasResumableProgress`) now call `saveKey()`. The two routes no longer share or overwrite each other's localStorage.
   - **`spotlight.jsx`: `clearProgress()` on successful enrollment.** In `EnrollForm`'s success branch (after `enrollStudent(...)` returns ok), wipe the visitor key so it isn't sitting around to be re-offered later.
   - **`/play/page.tsx`: redirect-if-enrolled.** At the top of the route, if there's an auth session AND a matching row in `students`, 307 over to `/student/dashboard`. Belt-and-suspenders for the case where someone returns to `/play` after enrolling — they don't even get the chance to see stale state.

**3. Dashboard "Your photo" card** (commits `Dashboard: show student's own current-class entry` + `Fix ownEntry query: join on profiles.id, not students.id`). Adds `ownEntry: OwnEntry | null` to `getStudentArchive`'s result, queries the student's most-recent live OR pending entry in their current class (signed URL from PRIVATE `media` bucket). Dashboard renders a new section between "Go to the game" and the history strip showing the photo + description + an `AWAITING APPROVAL` badge when `status === "pending"`. **First version had a bug:** the query joined on `students.id`, but `entries.student_id` holds `profiles.id` (= `auth.users.id`) — see HOW TO WORK WITH MIKE #8. Silently returned null for every test. Diagnostic SQL through `auth.users` confirmed Mike had 5 pending entries; one-line fix to use `user.id`. The file header of `student-archive.ts` now documents the two-track seam.

**4. Dashboard text revisions (two commits):**
   - `revised text in dashboard to allow any time uploading of student pics` — the old copy said *"Each new round, you'll add one of your own photos and comment on the other students' photos. When round 2 opens, you'll get an email to come back and add yours,"* implying students had to wait for round 2 to add a photo. They don't. New copy says they can add anytime.
   - `Dashboard: drop email promise from WHAT HAPPENS NEXT` — the round-timing/notification feature doesn't exist yet, so promising an email wasn't true. Current copy: *"Your teacher will read what you wrote and respond — their notes show up under the photos they reply to. You can add another photo whenever you want. When new classmate photos are ready, you'll see them next time you visit."* To be revised AGAIN when round-timing lands (see Mike's preferred copy below in NEXT SESSION'S BUILDS).

**5. Recovery commit (commit `Fix isSelf flag: restore full files, add type + visitor-deck handling`).** Earlier in the session, the first delivery of the `isSelf` change shipped as snippet-only files for `students.js` and `class-deck.ts` (violation of HOW TO WORK WITH MIKE #1). Mike committed them; both files were destroyed; `loadClassDeck` export disappeared; build broke. Recovery required reconstructing `students.js` from a UTF-16-LE-mangled `git show HEAD~1` extraction (Python ftfy-style cp437 decoding — the script worked first try once the encoding was right), then restoring both files with the isSelf changes properly added. Diff verification via `git diff HEAD~1 -- ...` confirmed clean restoration. **Bake the whole-file rule in by default. The cost of NOT doing so is documented above.**

---

## 🎯 NEXT SESSION'S BUILDS (Mike's call which order)

### (a) Solo-self splash redesign — Mike's preferred direction (NEW from #25 testing)

Currently when the student is alone in the class (only their own pending entry, no approved classmate entries yet), the `/student/play` splash shows:

> Spotlight
> Your photo is in the queue. Classmates' photos will appear here as they join the game.
> Check back once at least one classmate's photo is approved.

Mike's quote: *"I don't mind if this screen looked more like the game — blank spots for future pics, the spin (and stop) button… right? this is the game, afterall… it's just not populated yet."*

Build: render the 3×3 grid with the student's own photo in one of the tiles and the other 8 as visually-distinct placeholder tiles (dashed border? muted color? a faint "waiting" glyph?). Spin button present but disabled. Maybe a small subtitle like "waiting on classmates" beneath the disabled button. Idea is to make the game surface feel real and concrete — *the stage is set, the actors just haven't shown up yet* — instead of a different screen entirely. Implementation likely lives in `spotlight.jsx`'s splash branch (currently the `soloSelf ? ... : ...` conditional). Tile placeholders likely need a small change to the StageGrid component too.

### (b) Upload-from-dashboard feature (Mike's "hopefully we can get to that soon")

The finish-joining form has the upload UI for the first entry. There's no way to add another photo from the dashboard once joined. Mike wants one: a section (probably near "Your photo") with a small upload form that lets the student add additional entries to their current class. Each upload becomes another `entries` row at `status='pending'`. The `PhotoField` component is already reusable from `src/app/student/dashboard/PhotoField.tsx`. The server action would be a new sibling to `saveProfile` (probably `addEntry`) since `saveProfile` does too many things to extend.

Design choices to make: (i) one pending upload at a time, or stack them? (ii) where exactly does the form sit on the dashboard? (iii) what does the "Your photo" section show when there are multiple owns — most recent? all of them? a stack?

### (c) Round-timing feature (still parked, still Mike's active interest)

Unchanged spec from #23/#24, with one new wrinkle from #25 — Mike floated: *"a count down would be cool."*

- Teacher sets each round's length (1 hr / 1 day / 1 week) and the game-end.
- Student sees the current round's deadline from first upload on, and on every subsequent visit.
- **Display location:** rework the profile's "WHAT HAPPENS NEXT" section to carry the timing.
- **Mike's preferred copy when this lands** (paraphrased from #25 session): "Your first photo gets you into the current round — you can add more anytime, and they'll be used as future rounds open. Your teacher will read what you wrote and respond — their notes show up under the photos they reply to." With timer-aware lines around it.
- **Countdown to deadline** (new from #25) — Mike wants this visualized somewhere. Likely on the dashboard near "Your photo" or in the WHAT HAPPENS NEXT section. Live ticking client-side, derived from a server-rendered round-deadline timestamp.
- **Button gating** (from #24): "Go to the game →" moves to the BOTTOM near the timing text, GREYED OUT until the student explicitly agrees to the timeframe (acknowledgement gate).
- `classes` has no fields for this — needs a migration (per-round duration or computed deadlines).
- No teacher class-settings UI exists — extend `/teacher/deck` or build a new settings screen.
- Once this lands, the WHAT HAPPENS NEXT copy gets revisited — and when it does, **don't hardcode round counts** (Mike: *"no need to hardwire the number of rounds at 5, if not necessary"*).

### (d) Smaller items Mike raised, captured here so they don't fall on the floor

- **History strip redesign**: collapse past rounds into buttons at the bottom of the dashboard (intro round, round 1, round 2…). Mike's intuition: smaller buttons for older rounds keeps the dashboard focused on what's current.
- **Reduce thumbnail size in the history grid**: Mike "still balks a little about the size of the pics" in the per-class history grid (the 3×3 of comments). Tied to the history-collapse above.
- **Add classmates' comments under own photo** (after approval): on the dashboard, show what classmates wrote about the student's photo once those comments exist. Schema-wise: `submission_comments` keyed by the entry id, filtered to non-self authors, only when entry status='live'.
- **Student profile look more like teacher's view of the student**: Mike said the teacher's per-student page (`/teacher/students/[id]/page.tsx` — see image 4 from session 25) reads better than the current student dashboard. Worth a look at that file as a design reference if/when doing dashboard polish.
- **"Reset this test student" teacher button** — a real (small) feature that gives Mike a non-destructive way to wipe a test enrollment without the cascade footgun. Lower priority than the Gmail plus-addressing workaround (which solves the problem today, no code).

---

## 📌 OPEN / CARRIED FROM #24 (still unresolved)

- **Bridge students↔profiles seam** — for the teacher CSV's own-photo column to populate, and any mixed `game_sessions` ↔ `entries` view to work. Map via `students.email` → `auth.users` → `profiles.id`. Decide whether to denormalize a `profile_id` onto `students`. **(#25 partially mitigated this for the dashboard read path by documenting the two-track seam in `student-archive.ts`, but the seam itself still exists. Anything new that joins entries-to-anything-else needs to navigate it.)**
- **entries-vs-submissions mismatch** — reveal RPCs (`class_grand_totals`, `class_round_winners`, `tally_round`) read `submissions` + `submission_favorites`, but upload/review flow targets `entries`. Resolve BEFORE building reveal.
- **"Game over" representation** — needed for CSV button gate on student profile. Assume `enrollment` flips to `status='completed'`; confirm against schema.
- ~~**`student-archive.ts` bug**~~ — flagged in #24 ("reads entry ids from `game_sessions.comments`, not from `entries` directly — so a fresh `pending` entry won't show on the student's own profile"). **#25: addressed for the own-entry case** — the new `ownEntry` field queries `entries` directly. The classmates-entries path still reads via session comments, which is correct (those are scored entries from a completed game), so the original concern is now scoped to own-entries only and resolved.

**Parked features (not now):** end-of-game 1st/2nd/3rd place; "Join a new game" button; teacher condensed all-class view; React "two children with same key" warning on /teacher/students; carry-overs from #22 (`bac4d923` single-vs-multi-cohort, saveProfile multi-round session-targeting, soft-nudge cutoff, dead `sessions`/`session_comments` tables).

---

## 🔎 NEW CONFIRMED FACTS (so the next model doesn't re-derive)

- **`students` CASCADE radius:** Six FKs cascade on delete from `students`: `enrollments_student_id_fkey`, `game_sessions_student_id_fkey`, `submission_comments_author_student_id_fkey`, `submission_favorites_voter_student_id_fkey`, `submissions_student_id_fkey`, `teacher_comments_student_id_fkey`. Notably **NOT entries** — entries cascades off `profiles`, not `students`. (This is the two-track seam in action.) `DELETE FROM public.students WHERE email = '...'` will wipe all of those. Don't recommend it; use Gmail plus-addressing instead (HOW TO WORK WITH MIKE #9).
- **Two-track student IDs:** `students.id` ≠ `profiles.id` (= `auth.users.id`). `entries.student_id` is on the profiles track; everything else listed in the CASCADE above is on the students track. Documented in the header of `src/lib/student-archive.ts`. (HOW TO WORK WITH MIKE #8.)
- **`EngineStudent` now has `isSelf: boolean`** — set in `class-deck.ts` (true for the row matching `user.id`), set in `deck.ts` (always false for visitor starters). Engine code in `spotlight.jsx` derives `playableStudents`, `playableCount`, `hasSelf`, `soloSelf` from it. Skipping self in the comment cycle is "filter out isSelf in the `stop()` pool and count playable for done-checks"; visualizing self is "render all of `students` in the grid as before."
- **Spotlight engine state machine (updated):** All references to `students.length` in done-detection / progress-counting code now use `playableCount` (= non-self count). The visitor flow has `playableCount === students.length` (no self), so behavior is unchanged. Specifically: `allShown`, `finishStudent`'s done check, `resume`'s done check, the header `{shownIds.size} of {playableCount}` line, and the comment counter `{...}/{playableCount}`. `DoneScreen` receives `playableStudents` so the student can't pick their own tile as a favorite (no-op for visitor).
- **`saveKey()` is route-aware:** `spotlight.jsx` derives the localStorage key from `window.location.pathname`. `/student/*` → `spotlight:progress:student`. Else → `spotlight:progress:visitor`. SSR-safe fallback (when `window` is undefined) is the visitor key. All four storage helpers (`saveProgress`, `loadProgress`, `clearProgress`, `hasResumableProgress`) now call `saveKey()` instead of using a constant.
- **`/play` redirects enrolled users:** New block at the top of `src/app/play/page.tsx` — if there's an auth session and the email matches a `students` row, 307 → `/student/dashboard`. Anonymous or not-yet-enrolled users get the visitor flow as before. Defense-in-depth with the per-route saveKey + clearProgress-on-enroll above.
- **Magic-link session cookie persists across `DELETE FROM students`.** The `students` row is in your DB; the auth session cookie is in the browser. Deleting one doesn't sign the other out. To go truly anonymous: DevTools → Application → Cookies → `localhost:3000` → delete all. (Mike used this successfully in #25 testing.)
- **`ownEntry` shape on `getStudentArchive` result:** `{ id, description_text, signedUrl, status: 'pending'|'live', uploadedAt } | null`. Scoped to the current class (`profiles.class_id`), most recent, joined on `user.id` (profiles track — see two-track seam). Both `pending` and `live` surfaced; signed URL from PRIVATE `media` bucket with 1-hour TTL.
- **Dashboard's "Your photo" placement:** between the "Go to the game →" CTA and the "YOUR CLASS" history strip. Hidden entirely when `ownEntry === null` (no current class or no own entry yet). Shows the photo + description + "AWAITING APPROVAL" badge (when pending) + a one-line context message.
- **Eight commits this session (in Outgoing — needs a `git push` when Mike's ready):**
  - `Add isSelf flag to EngineStudent to mark current user` (the broken snippet commit — see recovery)
  - `Fix isSelf flag: restore full files, add type + visitor-deck handling` (recovery)
  - `Engine adaptation: skip self in spotlight, dynamic intro, solo-self state`
  - `revised text in dashboard to allow any time uploading of student pics`
  - `Dashboard: show student's own current-class entry`
  - `Fix stale Resume after enrollment (three-part fix)`
  - `Dashboard: drop email promise from WHAT HAPPENS NEXT`
  - `Fix ownEntry query: join on profiles.id, not students.id` (outstanding at write-time; staged but not committed yet)

This handoff (#25) will be a 9th commit (`docs: add slice 1 handoff #25`).

---

## 🛠️ BUILD ORDER UPDATE

- **Step 0 — logged-in classroom surface.**
  - ✅ profile + self-photo upload (#22/#23)
  - ✅ first game-entry upload (#23, verified #24)
  - ✅ in-class read view at `/student/play` with signed `media`-bucket URLs (#24)
  - ✅ SSR hydration fix on splash resume branch (#24)
  - ✅ engine-adaptation pass on `spotlight.jsx` (#25): skip self, dynamic intro, solo-self state, playable-count threading
  - ✅ Resume-bug three-part fix (#25): per-route saveKey, clearProgress on enroll, /play redirect
  - ✅ Dashboard "Your photo" card surfacing student's own current-class entry (#25)
  - ▶️ **NEXT** (Mike's call): solo-self splash redesign (3×3 grid + placeholders + disabled spin), OR upload-from-dashboard, OR round-timing.
- **Step 1** — completion transition (active→completed). Unblocks CSV "game over" gate.
- **Step 2** — reveal RPC(s) — BUT FIRST resolve entries-vs-submissions mismatch.
- **Step 3** — teacher close-game action; parked teacher condensed-view.

---

## Working agreement (unchanged)

Mike holds editor/dashboard/keys/pushes. SQL editor = one result set per run. `supabase/migrations/` = STRUCTURAL only; seeds/proofs/diagnostics are snippets, not repo. Verify before declaring done. Mike's confident at SQL + PowerShell, learning JS/TS — lean on SQL/PS proofs and downloadable whole-file swaps.

---

## First-message-to-next-Claude

**Step one: read the "HOW TO WORK WITH MIKE" block and follow it.** Whole-file replacements as DOWNLOADABLE FILES via `present_files` — never paste long files into chat. One command per copy-clip. PowerShell goes in the VS Code terminal, not Supabase. Read screenshots. Don't inflate scope. Mind the two-track student ID seam (`#8`). Don't recommend `DELETE FROM students` for resets (`#9`). Keep the three pinned blocks at the TOP of the NEXT handoff too.

**Step two: ask Mike which build first.**
- **(a) Solo-self splash redesign** — render the `/student/play` splash as a 3×3 grid with the student's own tile filled in and the rest as placeholder tiles (dashed border / muted) with a disabled spin button. "It's the game, just not populated yet." Lives in `spotlight.jsx`'s `soloSelf` branch (currently a text-only `<div>`). May need a small tweak to the StageGrid component for placeholder tiles. Smallest of the three.
- **(b) Upload-from-dashboard feature** — let the student add additional photos after the finish-joining form. New `addEntry` server action (sibling to `saveProfile`); reuse `PhotoField` component; surface near "Your photo" on the dashboard. Design choices: one pending at a time vs stack, where the form sits, how "Your photo" handles multiples.
- **(c) Round-timing feature** — teacher sets per-round duration, student sees deadline + countdown, agree-gate on "Go to the game" button. From scratch; needs `classes` schema migration. Mike's active interest, parked three times now. New #25 wrinkle: live countdown to deadline.

**Don't re-open:** §"WHAT'S LOCKED" from #21/#22/#23 (two-track schema, entries lifecycle pending → live → archived, two distinct photos self vs entry, etc.). **Resolve before reveal:** entries-vs-submissions mismatch + students↔profiles seam (partially mitigated #25 for the dashboard read path; the seam itself still exists). **Don't add:** storage policies (service role bypasses RLS).

**One last thing about the testing loop:** Mike's been bitten twice now by destructive resets (`DELETE FROM students` cascading away his uploads) and once by a stale session cookie hiding behind a delete. Recommend Gmail plus-addressing (`myked70og+test1@gmail.com`) for non-destructive retesting and DevTools cookie clearing when he needs to truly start fresh. Both documented in HOW TO WORK WITH MIKE.
