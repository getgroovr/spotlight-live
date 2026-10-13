# SLICE 1 HANDOFF #22 — Build attempt stalled on a missing file path. The PLAN is good; the EXECUTION needs Mike's working preferences respected from message one. Profile-page location STILL unconfirmed. Next session: get the full file, then build the small thing (it's an afternoon, not multi-day).

**Date written:** 2026-06-03
**Picking up from:** #21 (key finding: classroom game loop is unbuilt; `spotlight.jsx` is only Round-1 demo; sequence + review + soft-nudge all decided)
**This session:** Confirmed the orientation set (schema dump, `actions.ts`, function defs all received and read). Started the first build — profile + self-photo. Stalled repeatedly guessing the profile-page file path. Did NOT ship anything. Surfaced a real process problem worth fixing.
**Next model:** Mike is switching to **Opus 4.8** (this session ran on 4.3 and there was a notable disconnect — lots of motion, little progress).
**Destination:** `docs/handoffs/`

---

## ⭐⭐ READ THIS FIRST — HOW TO WORK WITH MIKE (do not skip, do not improvise around it)

These are not preferences to honor when convenient. They are the working agreement. The last session failed mostly by ignoring them.

1. **Whole-file replacements, never partial cut-and-paste.** When a file changes, give Mike the FULL file contents to drop in, with the exact path. Do not say "replace the saveProfile function with…" — give the entire file. He doesn't like splicing into the middle of files.

2. **One copy-clip = one command.** Never put two things to run in a single code block. "Run this SQL, then paste the result, then run this" must be THREE separate blocks. Each block is one self-contained thing he can copy whole and run whole.

3. **Mike runs SQL (Supabase SQL editor) and PowerShell (in VS Code) comfortably.** Lean on those. One result set per SQL run. If a different tool is ever needed, that's fine — but he'll need step-by-step direction, so say so explicitly and walk him through it.

4. **Read his screenshots.** When he posts a screen grab of the file tree or terminal, the answer to "where is the file" is usually right there. Look before guessing. The last session guessed paths three times against screenshots that already showed the layout.

5. **Don't inflate scope.** When something is small, say it's small and just do it. (See the multi-day-timeline mistake below.)

6. **Confirm before building on an unknown.** If a file hasn't actually been seen, don't write code that assumes its contents. Ask for the file first.

**Going forward: keep this block, the file list, and the SQL-commands-needed list pinned at the TOP of every handoff.** Mike will keep asking for this; bake it in by default.

---

## 📂 ORIENTATION SET (what to ask for at the very start — make it easy, just request the items)

Already received and read this session (don't re-request unless stale):
- Schema dump (`information_schema.columns`) — full table/column/type/nullable/default.
- `src/app/play/actions.ts` — has `enrollStudent` + `saveProfile`.
- Function definitions (`pg_get_functiondef` over `public`) — all RPCs + auth helpers seen.
- `src/game/spotlight.jsx` (from #21).

**STILL NEEDED before the first build — THE one blocker:**
- **The full contents of `src/app/student/dashboard/page.tsx`** — the most likely home of the profile form. Last session ran `Get-Content` on it but the terminal output scrolled past the top (imports + any `saveProfile` form wiring), so it was never actually read. Get the WHOLE file.
- If `saveProfile` is NOT imported/used there, the fallback is **`src/app/student/login/page.tsx`** — the other `page.tsx` under `student/`.

**How to get it cleanly (give Mike this exact one-liner — it writes the file to a temp doc he can open whole, avoiding terminal scroll-off):**

```powershell
Get-Content src\app\student\dashboard\page.tsx | Set-Content "$env:TEMP\dashboard_page.txt"; Start-Process notepad "$env:TEMP\dashboard_page.txt"
```

(Or simplest: just open `src/app/student/dashboard/page.tsx` in the VS Code editor and paste the whole thing into chat.)

---

## 🗂️ CONFIRMED FILE TREE (from this session's screenshots — trust this)

Under `src/app/`:
- `auth/`
- `play/` — contains `actions.ts` (enrollStudent, saveProfile)
- `student/`
  - `dashboard/` → `export/`, **`page.tsx`**, `ProfileArchive.tsx`
  - `login/` → `actions.ts`, **`page.tsx`**
  - (NO `profile/` folder — stop looking for one)
  - `teacher/`
- `game/`, `lib/`

There are **two** `page.tsx` under `student/`: one in `dashboard/`, one in `login/`. The profile form is in one of them — unconfirmed which. This is the single thing blocking the first build.

`src/lib/deck.ts` is open in the editor — confirms `STARTER_BUCKET = "teacher-deck"`, `EngineStudent` shape (id, name, color, bio, entries[{primary, description, mediaType, uploadedAt, descriptionText, descriptionL1, readingAudio}], peerComments: never[]). Useful for the deck step later.

---

## 🧱 SQL COMMANDS THIS BUILD WILL NEED (each its own copy-clip when the time comes)

For the self-photo step, two one-liners (give them as two separate blocks):

Create the storage bucket:
```sql
insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', true);
```

(Storage RLS/policy for student uploads will likely also be needed — but DON'T hand Mike the broad `grant ... to service_role` from last session without thinking. Confirm the right storage policy against how uploads actually flow once the page file is seen. Parked until then.)

---

## ✅ WHAT'S DECIDED (carried from #21 — do NOT re-open these)

- **First-session sequence:** magic link → profile (name, screen name, self-photo, the "why") → upload first pic + description → into the game showing their OWN pic immediately.
- **Review KEPT, folded into deck-fill:** student's own pic shows to them instantly (no approval); teacher approval only gates *cross-student* visibility. Pending + not-yet-uploaded sit in the same "not here yet" bucket. No new mechanism.
- **`entries` is the home table.** Confirmed this session via `approve_entry`: it archives the student's current `status='live'` row and promotes the pending one to `live`. So entry lifecycle is **pending → live → archived** (NOT pending→approved — note the enum is `entry_status` with `live`/`archived`, distinct from the `submissions` table's `approved`).
- **Soft nudge, not hard cutoff.**
- **Two-track schema resolved:** `game_sessions` jsonb = Round-1 demo data; `entries` (+ favorites) = the real classroom game home.

---

## 🔎 WHAT WE LEARNED FROM THE FUNCTION DEFS (new this session)

- **`entries` lifecycle is `pending → live → archived`**, enforced by `approve_entry` (archives prior live, promotes pending). One live entry per student per class at a time.
- Auth is done **inside SECURITY DEFINER functions**, not as table RLS policies you can list separately — every privileged RPC calls `owns_class()` / `is_teacher()` / `is_enrolled_in()` and raises on failure. So "show me the RLS policies" won't reveal much; the authorization lives in the function bodies (which we now have).
- Reveal RPCs exist and are real: **`class_grand_totals`** (top-3 by total favorites across approved submissions), **`class_round_winners`** (per-round winner, each student wins at most once), **`tally_round`** (per-round counts). NOTE: these read from **`submissions` / `submission_favorites`**, NOT `entries`. ⚠️ **Flag for next session:** there's a mismatch — the upload/review flow points at `entries`, but the reveal RPCs read `submissions`. Resolve which table the real game writes to BEFORE building reveal, or the tallies will read an empty table. (Leaning: the RPCs may predate the `entries` decision and need rewriting to read `entries` — but confirm, don't assume.)
- 9-students-per-class cap is enforced by trigger (`enforce_class_cap`).

---

## 🛠️ REVISED BUILD ORDER (unchanged shape from #21, scope corrected)

**Step 0 — the logged-in classroom surface. THE SMALL FIRST PIECE = profile + self-photo upload.**
This is an afternoon, not a multi-day project. (Last session spelled out a 5-day plan with staging rollouts and analytics — that was overcomplication. Don't do that.) Concretely it is:
- one form file (the student profile page — once we confirm which `page.tsx`),
- the `saveProfile` edit in `src/app/play/actions.ts` to accept + store the photo into `students.photo_url`,
- one SQL line to make the bucket,
- a storage policy (TBD once flow is seen).
Ship that, let Mike play it, then iterate.

Then: first-pic upload (writes an `entries` row, `status='pending'`/own pic visible). Then the game view reading classmate `entries` (live only).

**Step 1** — completion transition (active→completed).
**Step 2** — reveal RPC(s) — BUT FIRST resolve the entries-vs-submissions table mismatch above.
**Step 3** — teacher close-game action.

---

## ⚠️ MISTAKES THIS SESSION (so the next model doesn't repeat them)

1. **Guessed the profile-page path 3+ times** against screenshots that showed the tree. Invented `src/pages/profile/edit.js` (no `pages/` dir exists — it's App Router), then `src/app/student/profile/page.tsx` (no `profile/` folder), then `src/app/student/page.tsx` (doesn't exist). **Fix: read the screenshot, ask for the file, don't guess.**
2. **Suggested downloading files from `example.com`** — a placeholder domain that's literally just the IANA example page. Wasted a round-trip. **Fix: deliver file contents in chat, or via the present_files mechanism that produces a real link (like the handoff itself).**
3. **Inflated a small task into a 5-day plan** with staging environments and analytics dashboards. **Fix: small things are small.**
4. **Put multi-step instructions in single blocks** early on, against Mike's stated preference. **Fix: one copy-clip per command.**

---

## 📌 OPEN / PARKED

- **entries vs submissions for the reveal RPCs** — NEW, important. Resolve before Step 2.
- **Storage RLS policy for profile-photos** — define properly once the upload flow/page is seen; don't blanket-grant.
- **Which `page.tsx` holds the profile form** — the immediate blocker.
- Unchanged from #21: `bac4d923` single-vs-multi-cohort (Mike's call); `saveProfile` session-targeting ambiguity at multi-round; soft-nudge date field is the cutoff build; dead `sessions`/`session_comments` tables.

---

## Working agreement (unchanged)
Mike holds editor/dashboard/keys/pushes. SQL editor = one result set per run. `supabase/migrations/` = STRUCTURAL only; seeds/proofs/diagnostics are snippets, not repo. Verify before declaring done. Mike's confident at SQL + PowerShell, learning JS/TS — lean on SQL/PS proofs and whole-file swaps.

---

## First-message-to-next-Claude (Opus 4.8)

**Step one: read the "HOW TO WORK WITH MIKE" block above and actually follow it.** Whole-file swaps. One command per copy-clip. Read his screenshots. Don't inflate scope.

**Step two: unblock the one blocker.** Ask Mike to open `src/app/student/dashboard/page.tsx` and paste the WHOLE file (or run the notepad one-liner above). Confirm whether `saveProfile` is wired as the form action there; if not, look at `src/app/student/login/page.tsx`.

**Then build the small thing:** profile + self-photo. Whole file for the page, whole file for `actions.ts`, the one bucket SQL line, the storage policy. That's the afternoon. Let Mike play it before going further.

**Don't re-open:** the §"WHAT'S DECIDED" list. **Do flag early:** the entries-vs-submissions reveal-table mismatch.
