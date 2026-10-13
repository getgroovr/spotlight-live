# SLICE 1 HANDOFF #23 — Self-photo + first game-entry upload shipped; entry-write FK bug found AND fixed (entries is on the PROFILES track, not students — `entries.student_id` → `profiles(id)` = auth `user.id`, class from `profiles.class_id`). Live photo preview added. Teacher CSV reoriented to actual written language + blank lines between students. NEXT: (a) Mike to verify the entry row now lands; (b) bridge the students↔profiles seam so the CSV's own-photo column populates and the in-class view can read entries; (c) round-timing feature (teacher sets each round's length + game end; student sees it from first upload on) — entirely from scratch, `classes` has no schedule fields.

**Date written:** 2026-06-04
**Picking up from:** #22 (blocker was: which `page.tsx` holds the profile form; the profile + self-photo build hadn't shipped)
**This session:** Confirmed `src/app/student/dashboard/page.tsx` IS the profile form. Shipped the self-photo upload (optional). Mapped every route. Resolved the two-photos fork. Confirmed the `entries` schema, the `entry_status`/`media_type` enums, the storage buckets, the `media_url`=path convention, and that uploaded media belongs in the PRIVATE `media` bucket. Then BUILT the first game-entry upload (photo + description → `entries` row) on the same finish-joining form, plus a "Go to the game →" button on the complete state. Self-photo upload was verified end-to-end; the entry write is built but NOT yet tested by Mike as of this writing.
**Next model:** Opus 4.8 (this session ran on 4.8 and went smoothly — whole-file swaps, one-command blocks, screenshots read, scope kept small).
**Destination:** `docs/handoffs/`

> **Mike's standing request (honor it):** keep the three pinned blocks below — **HOW TO WORK WITH MIKE**, the **ROUTE MAP / FILE TREE**, and the **SQL-COMMANDS list** — at the TOP of every future handoff. Bake it in by default; don't make him ask.

---

## ⭐⭐ READ THIS FIRST — HOW TO WORK WITH MIKE (do not skip, do not improvise around it)

These are not preferences to honor when convenient. They are the working agreement. (Verbatim from #22 — still exactly right; this session followed them and it worked.)

1. **Whole-file replacements, never partial cut-and-paste.** When a file changes, give Mike the FULL file contents to drop in, with the exact path. Do not say "replace the saveProfile function with…" — give the entire file. He doesn't like splicing into the middle of files.

2. **One copy-clip = one command.** Never put two things to run in a single code block. "Run this SQL, then paste the result, then run this" must be THREE separate blocks. Each block is one self-contained thing he can copy whole and run whole.

3. **Mike runs SQL (Supabase SQL editor) and PowerShell (in VS Code) comfortably.** Lean on those. One result set per SQL run. **PowerShell commands go in the VS Code integrated terminal, NOT the Supabase SQL editor** (he pasted a PowerShell one-liner into Supabase this session and it errored — say "PowerShell terminal" explicitly when it's a PS command). If a different tool is ever needed, walk him through it step by step.

4. **Read his screenshots.** When he posts a screen grab of the file tree or terminal, the answer to "where is the file" is usually right there. Look before guessing.

5. **Don't inflate scope.** When something is small, say it's small and just do it.

6. **Confirm before building on an unknown.** If a file hasn't actually been seen, don't write code that assumes its contents. Ask for the file first. (This session: did NOT guess the `entries` write path or the teacher route — asked / ran the route map instead. Keep doing this.)

---

## 🗂️ ROUTE MAP / CONFIRMED FILE TREE (from `Get-ChildItem` this session — trust this)

Full list of routable files under `src/app/` (page.tsx + route.ts), verbatim from the terminal:

```
src/app/auth/callback/route.ts
src/app/auth/confirm/route.ts
src/app/auth/login/page.tsx          ← TEACHER sign-in (password)
src/app/auth/signup/page.tsx
src/app/play/page.tsx                ← visitor play-and-join flow (the demo game lives here / in game/)
src/app/student/dashboard/export/route.ts   ← per-class CSV export endpoint
src/app/student/dashboard/page.tsx   ← THE PROFILE / finish-joining page
src/app/student/login/page.tsx       ← returning-student magic-link sign-in
src/app/teacher/deck/page.tsx
src/app/teacher/social/page.tsx
src/app/teacher/students/export/route.ts
src/app/teacher/students/[id]/page.tsx
src/app/teacher/students/page.tsx    ← teacher's student list
src/app/page.tsx
```

Non-routable but relevant: `src/game/` (round-1 demo, incl. `spotlight.jsx`), `src/lib/` (incl. `deck.ts`, `student-archive.ts`, `supabase-server.ts`), `src/app/student/dashboard/ProfileArchive.tsx`.

**Teacher URLs (Mike asked):** list at `/teacher/students`, one student at `/teacher/students/[id]`, plus `/teacher/deck` and `/teacher/social`. Teacher signs in at `/auth/login` (password — different door from the student magic link).

**Key takeaway:** there is **no built in-class game view** and **no code that writes an `entries` row**. `/play` is the visitor flow; `game/` is the demo. The logged-in "play inside your class" surface is net-new (to build next).

---

## 🧱 SQL / COMMANDS THE NEXT BUILD WILL NEED (each its own copy-clip when the time comes)

`entries` table columns (needed before building the game-entry write):
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'entries'
order by ordinal_position;
```

Route map (re-run if the tree changed — PowerShell, in the VS Code terminal):
```powershell
Get-ChildItem -Path src\app -Recurse -Include page.tsx,route.ts | ForEach-Object { $_.FullName.Replace("$PWD\","") }
```

Clear a student row to reuse an email (one statement; if it throws an FK error naming a child table, clear that child first):
```sql
delete from public.students where email = 'SOME_EMAIL_HERE';
```

**Storage note (don't re-litigate):** the `profile-photos` bucket already EXISTS and is PUBLIC. Uploads happen server-side via the service-role `admin` client, which **bypasses storage RLS** — so **no storage policy is needed** for the profile-photo flow. Don't add one. (If a later flow uploads from the browser with the anon key, revisit then.)

---

## ✅ WHAT SHIPPED THIS SESSION

**1. Self-photo upload (optional) — verified working.**
- `page.tsx`: optional "A photo of yourself" file input (`name="photo"`).
- `actions.ts`: `saveProfile` uploads it to the PUBLIC `profile-photos` bucket and stores the public URL in `students.photo_url`. If none provided, leaves `photo_url` untouched.
- Verified: a real public URL landed in `students.photo_url` for `myked70@yahoo.com`.

**2. First game-entry upload (required) — built, FK bug found and FIXED, pending Mike's re-test.**
- `page.tsx`: required `entry_photo` + `entry_description`, below the "why" block.
- `actions.ts`: `saveProfile` uploads `entry_photo` to the PRIVATE `media` bucket and inserts an `entries` row at `status='pending'`.
- **THE BUG (and fix):** first version used `students.id` for `entries.student_id` → FK violation, because `entries.student_id` is a FK to **`profiles(id)`** (the auth identity), NOT `students(id)`. This is the two-track seam. Fix: `entries.student_id = user.id` (auth uid = profiles.id, confirmed every student has a profile row) and `entries.class_id = profiles.class_id` (fallback to active enrollment). `media_url` = storage PATH `<class_id>/<user.id>-<ts>.<ext>`. Mike to re-test that a row now lands.

**5. Teacher CSV reoriented to the actual written LANGUAGE (`teacher/students/export/route.ts`, whole-file replace).** Dropped the metadata Mike said doesn't matter (enrolled/completed timestamps, comment COUNT, profile-finished flag). Now emits: Student, Real name, Email, Class, Round, **Their comments** (the actual text, each prefixed with that photo's caption for findability), **Favorite — why**, **Their own photo (description)**, **Teacher notes**. Two blank rows between students. Not gated to end-of-class (confirmed not needed). ⚠️ CAVEAT: the "Their own photo (description)" column joins `entries.student_id` against the **students-track** id, but entries now uses the **profiles** id — so that column stays BLANK until the students↔profiles seam is bridged (see open items). The comments/why/notes columns work today (they read `game_sessions`, students track).

**3. "Go to the game →" button** added to the complete-state profile, pointing at `/play` (the true in-class view doesn't exist yet — see next build).

**4. Live photo preview (`PhotoField.tsx`, new client component) — CONFIRMED WORKING.** Both file inputs (self-photo and entry photo) show a preview thumbnail the instant a file is picked, with "Replace" (re-pick) and "Remove" (optional fields only), so the student can SEE the photo while writing the description. Mike verified the preview + Replace/Remove render correctly. Native input kept in layout (not `display:none`) to avoid the hidden-`required`-not-focusable submit bug. Preview only — no form-state or backend change; inputs still post to `saveProfile` by `name`. NOTE: displaying the STORED entry back later (private `media` bucket → signed URL) is still the next-build item.

**Storage policy:** none needed for either bucket — uploads use the service-role `admin` client, which bypasses storage RLS. The `media` bucket is PRIVATE, so READS later need signed URLs (see read-path note below); WRITES here are fine via service role.

---

## 🔱 THE FORK, RESOLVED — TWO DISTINCT PHOTOS (do not conflate these again)

- **Self-photo** = a picture *of the student*. Stored in `students.photo_url`. Shown on their own profile. **OPTIONAL.** (Shipped.) Whether it's shown to classmates in-game is still unwired — open item below.
- **Game-entry photo + description** = the student's *contribution* for a round. Writes an **`entries`** row (`pending → live → archived`; one live per student per class). This is the classmate-facing content that gets commented on. **This is the next build. Nothing writes `entries` yet.**

---

## ✅ WHAT'S LOCKED (carried from #21/#22 + new this session — do NOT re-open)

Carried (unchanged): first-session sequence; review folded into deck-fill (own pic instant, teacher approval gates cross-student visibility); `entries` is the home table, lifecycle `pending → live → archived`; soft nudge not hard cutoff; two-track schema (`game_sessions` jsonb = demo; `entries` (+favorites) = real game).

New this session:
- **Two distinct photos** (self vs game-entry) — see fork above.
- **Post-join flow:** finish-joining screen hosts the first upload → then **land the student on their profile**, which carries a **"Go to the game →" button**. (One extra click vs. dropping them straight in; the button is the deliberate anchor.)
- **CSV "send to a new teacher" lives on the student's OWN profile**, and stays **hidden until that class's game is over.** The link already exists in `ProfileArchive.tsx` (`/student/dashboard/export?class_id=…`); the change is to gate its visibility on "game over." (See open item: how "game over" is represented.)

---

## 📌 OPEN / PARKED

**Immediate, gates the next build:**
- **`entries` table columns** — run the SQL above; needed to write the game-entry row.
- **`game/` folder contents + `src/app/play/page.tsx`** — needed to see how a round plays and where "Go to the game →" should point (the in-class game view is net-new).
- **Does the self-photo show to classmates in-game?** If yes, that's part of the in-class view; if no, it's just the profile face. (Affects the "shown on your profile" copy too.)

**Important, before reveal (Step 2):**
- **Bridge the students↔profiles seam.** Needed so (a) the teacher CSV's "own photo (description)" column populates, and (b) any view mixing `game_sessions` (students track) with `entries` (profiles track) works. Map via `students.email` → `auth.users` → `profiles.id`. Decide whether to denormalize a `profile_id` onto `students` (or vice versa) so this stops being a per-query join.
- **Round-timing feature (NEW, from scratch, its own session) — Mike's spec:** teacher sets each round's length (1 hr / 1 day / 1 week) and the game-end; student sees the current round's deadline. **Display location:** rework the profile's "What happens next" section to carry the timing. **Example copy Mike wants:** "The teacher has set a 22-hour limit to finish this round. The next round begins in 24 hours — upload your pic as soon as you can so your classmates have time to comment on it." **Button gating:** move "Go to the game →" to the BOTTOM, near this timing text, and keep it GREYED OUT until the student explicitly agrees to the timeframe (an acknowledgement gate). Student must see timing from the first upload on, and on every subsequent one. `classes` has no fields for this — needs a migration (per-round duration or computed deadlines), a teacher control (no class-settings UI exists; `/teacher/deck` or a new settings screen), and the student-facing display + agree-gate. Relates to the long-parked "soft-nudge date field is the cutoff build."
- **entries-vs-submissions mismatch** (from #22, still unresolved): the reveal RPCs `class_grand_totals` / `class_round_winners` / `tally_round` read from `submissions`/`submission_favorites`, but the upload/review flow targets `entries`. Resolve which table the real game writes to BEFORE building reveal, or tallies read an empty table. (Lean: RPCs predate the `entries` decision and need rewriting — confirm, don't assume.)
- **How "game over" is represented** — needed to gate the CSV button. Assume the enrollment/class flips to `status='completed'`; confirm against the schema before wiring the gate.

**Parked features (not now):**
- End-of-game **1st/2nd/3rd place** view after 5 rounds (shows winners' favorites, etc.).
- **"Join a new game" button** on the profile — carries the profile over, skips round 1, student just adds their new pic.
- **Teacher condensed all-class view** — the teacher needs the class's writing/language in one easy-to-read, condensed place (probably at game's end), likely around `/teacher/students`. Not needed now.
- **Bug:** React "Encountered two children with the same key" warning on `/teacher/students` (key `d8b2c7af-…`). Real but minor; fix when touching that page.
- Carried from #22: `bac4d923` single-vs-multi-cohort (Mike's call); `saveProfile` session-targeting ambiguity at multi-round; soft-nudge date field is the cutoff build; dead `sessions`/`session_comments` tables.

---

## 🔎 CONFIRMED FACTS (so the next model doesn't re-ask)

- **`profiles` columns:** `id` uuid NOT NULL (= auth user id) · `username` · `display_name` · `bio` · `avatar_url` · `is_creator` bool · `is_18_plus` bool · `created_at` · `updated_at` · `role` enum NOT NULL · `color` · `class_id` uuid null. **No email column.** Confirmed: every auth user (incl. magic-link students) HAS a profiles row, `role='student'`, with `class_id` set.
- **`classes` columns:** `id` uuid (default gen_random_uuid) · `teacher_id` uuid NOT NULL · `name` text NOT NULL · `created_at` timestamptz NOT NULL · `is_public` bool NOT NULL (default false). **No schedule/duration/deadline/round-timing fields** — the round-timing feature is from scratch (needs a migration).
- **TWO-TRACK IDENTITY (critical, this is the recurring seam):** the lightweight onboarding track — `students` (email-based, `students.id`), `enrollments`, `game_sessions` — is keyed by `students.id`. The real classroom-content track — `entries` — is keyed by `profiles.id` (= auth user id). `entries.student_id` → `profiles(id)`; `entries.class_id` → `classes(id)`. There is NO stored link between a `students` row and a `profiles` row (students has email; profiles has no email). To bridge them you'd map `students.email` → `auth.users.email` → `auth.users.id` = `profiles.id`. This seam is why the teacher CSV's own-photo column can't yet join, and why any view mixing game_sessions comments (students track) with entries (profiles track) must bridge first.
- **`entries` FK constraints:** `entries_student_id_fkey` (student_id → **profiles**), `entries_class_id_fkey` (class_id → classes), `entries_reviewed_by_fkey` (reviewed_by → profiles, nullable).
- **`entries` columns:** `id` uuid (default `gen_random_uuid()`) · `student_id` uuid NOT NULL · `class_id` uuid NOT NULL · `media_url` text NOT NULL · `media_type` enum NOT NULL · `description_url` text null · `description_text` text NOT NULL (default `''`) · `description_l1` text NOT NULL (default `''`) · `reading_audio_url` text null · `status` `entry_status` NOT NULL (default `'pending'`) · `uploaded_at` timestamptz NOT NULL (default `now()`) · `reviewed_by` uuid null · `reviewed_at` timestamptz null · `is_starter` bool NOT NULL (default false) · `pod_number` int null.
- **Enums:** `entry_status` = `pending` / `live` / `archived`. `media_type` = `photo` / `video`.
- **Storage buckets:** `media` (**PRIVATE**) · `profile-photos` (public) · `reading-audio` (private) · `teacher-deck` (public).
- **`media_url` convention:** stores the storage PATH within its bucket, NOT a full URL. Sample starter paths look like `<class_id>/<uuid>…`. The read layer builds the URL at display time.
- **READ PATH for the private `media` bucket (critical for the next build):** `deck.ts` reads STARTERS from the PUBLIC `teacher-deck` bucket via `getPublicUrl` — that does NOT work for the private `media` bucket. Per `deck.ts`'s own history note, an earlier `createSignedUrl` approach against `media` "silently returned null for anon visitors" (migration 08), which is WHY starters moved to a public bucket. Student entries live in PRIVATE `media`, so showing them needs `createSignedUrl` under an authenticated context (logged-in student or service role), NOT `getPublicUrl`. Whoever builds the in-class view / the student's own entry display must sign `media`-bucket URLs.
- **`src/lib/supabase-server.ts` exports:** `createClient` (async, returns `null` if env not configured) and `isSupabaseConfigured`. Does NOT export `createServerClient`. Admin/service-role client = `createClient as createServiceClient` from `@supabase/supabase-js` — bypasses storage RLS.
- **`src/lib/deck.ts`** (seen): `loadGenericDeck` reads the `entries_public` VIEW (omits `reading_audio_url`), filters `status='live'` across all `is_public` classes, needs ≥9, builds public URLs from `teacher-deck`. Engine shape = `EngineStudent` (id, name, color, bio, entries[{primary, mediaType, uploadedAt, descriptionText, descriptionL1, …}], peerComments). `/play` renders via `GameShell` (`@/game/shell`); game folder = `shell.jsx`, `spotlight.jsx`, `students.js`.
- **`ProfileArchive.tsx`** is a client component; CSV link → `/student/dashboard/export?class_id=…`; `ClassArchive` carries `isCurrent`, `completedAt`, `enrolledAt`, `favoriteComment`, `entries[]`, `generalNotes[]`, `favoriteThumb`.
- **`src/lib/student-archive.ts`** (the read layer feeding the dashboard) is **NOT yet seen.** Returns `{ student, classes }`. UNKNOWN: whether it exposes `student.photo_url`, and — important — whether it signs `media`-bucket URLs for the student's own entries. If the freshly-written pending entry does NOT show on the student's profile after testing, this file is the reason; get it.

---

## 🛠️ BUILD ORDER (scope unchanged; Step 0's self-photo half is DONE)

- **Step 0 — logged-in classroom surface.**
  - ✅ profile + **self-photo** upload (DONE, verified).
  - ✅ first game-**entry** upload (photo + description → `entries` row, `status='pending'`) on finish-joining + "Go to the game →" button (BUILT this session; Mike to test).
  - ▶️ **NEXT:** the in-class game view that READS classmates' `entries` (live only) AND shows the student their own entry — both require **signed URLs from the private `media` bucket** (see read-path note). Also confirm the student's own pending entry displays on their profile (depends on `student-archive.ts`). **Routing bug to fix here:** "Go to the game →" currently points at `/play`, which is the STARTER/teacher-intro deck — so a logged-in student lands back in the intro round (Mike observed this). Its real destination is this in-class round. **Visibility semantics (locked):** the student's own entry shows to THEM immediately while `status='pending'`; teacher approval (`approve_entry`: pending→live) is what makes it visible to classmates. So the in-class view shows: own entry (any status, to self) + classmates' `live` entries only.
- **Step 1** — completion transition (active→completed). (Also unblocks the CSV "game over" gate.)
- **Step 2** — reveal RPC(s) — BUT FIRST resolve the entries-vs-submissions mismatch.
- **Step 3** — teacher close-game action; and the parked teacher condensed-view.

---

## Working agreement (unchanged)
Mike holds editor/dashboard/keys/pushes. SQL editor = one result set per run. `supabase/migrations/` = STRUCTURAL only; seeds/proofs/diagnostics are snippets, not repo. Verify before declaring done. Mike's confident at SQL + PowerShell, learning JS/TS — lean on SQL/PS proofs and whole-file swaps.

---

## First-message-to-next-Claude (Opus 4.8)

**Step one: read the "HOW TO WORK WITH MIKE" block and follow it.** Whole-file swaps. One command per copy-clip. PowerShell goes in the VS Code terminal, not Supabase. Read screenshots. Don't inflate scope. Keep the three pinned blocks at the top of the next handoff too.

**Step two: confirm the entry-write fix landed.** Have Mike submit finish-joining with an entry photo, then: `select id, student_id, class_id, status, media_url from public.entries where is_starter = false order by uploaded_at desc limit 5;` — expect a `pending`, non-starter row whose `student_id` is the student's PROFILE id. If it still fails, re-check the FK targets (entries → profiles, not students).

**Step three — pick ONE of the teed-up builds:**
- **Round-timing feature** (Mike's active interest): migration + teacher control + student-facing deadline display. From scratch; `classes` has no timing fields. See open items.
- **Bridge students↔profiles** so the CSV own-photo column and a mixed in-class view can work.
- **In-class read view**: signed URLs from the PRIVATE `media` bucket (`createSignedUrl`, authenticated) — `getPublicUrl` won't work there. Get `src/lib/student-archive.ts` first.

**Don't re-open:** the §"WHAT'S LOCKED" list. **Resolve before reveal:** the entries-vs-submissions mismatch AND the students↔profiles seam. **Don't add:** storage policies (service role bypasses RLS).
