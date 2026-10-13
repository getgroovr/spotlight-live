# Spotlight — Session 113 Handoff
**Date:** 2026-10-13
**Supabase project:** ilctdtppstvmpvuvdqvf (dashboard name **`spotlight`** since 2026-10-13; was `groovr-creator`)

> **Read this one first for Spotlight.** It supersedes `2026-10-07_SESSION_112_HANDOFF.md` (keep that one for history; move it to `Archive/`). For full feature/file/schema detail, `Archive/2026-08-01_SESSION_108_HANDOFF.md` is still the best reference.
>
> **The dance game is now a separate project.** Everything about GroovR (the dance game, Listen mode, GroovR Social, dance parties) moved to its own handoff: `C:\Users\Myked\projects\groovr-desktop\docs\handoffs\2026-10-13_GROOVR_HANDOFF_01.md`. This file covers Spotlight only.

---

## ⭐⭐ HOW TO WORK WITH MIKE — DO NOT REMOVE THIS SECTION

> **INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS. DO NOT TRUNCATE, SUMMARIZE, OR OMIT IT.**

These are not preferences to honor when convenient. They are the working agreement.

1. **Whole-file replacements, delivered as DOWNLOADABLE FILES via `present_files` — NEVER pasted into chat as code blocks.** Write the file to `/mnt/user-data/outputs/<n>.<ext>` and call `present_files`. Mike downloads it and drops it into VS Code at the exact path you state. Do NOT say "replace the saveProfile function with…" — give the entire file as a download. Long files pasted into chat get corrupted by smart quotes, line-ending mangling, and copy-paste fatigue.

2. **One copy-clip = one command.** Never put two things to run in a single code block. "Run this SQL, then paste the result, then run this" = THREE separate blocks. Each block self-contained, copyable whole.

3. **Mike runs SQL (Supabase SQL editor) and PowerShell (VS Code integrated terminal) comfortably.** Lean on those. One result set per SQL run. **PowerShell commands go in the VS Code terminal, NOT the Supabase SQL editor.** If a different tool is ever needed, walk him through it step by step.

4. **Read his screenshots.** When he posts a file-tree or terminal screen grab, the answer is usually right there. Look before guessing.

5. **Don't inflate scope.** When something is small, say it's small and just do it.

6. **Confirm before building on an unknown.** If a file hasn't been seen, don't write code that assumes its contents. Ask for the file first.

7. **Two-track student IDs — do not conflate.**
   - `students.id` is the **students track**. Used by `enrollments`, `students`, `game_sessions.student_id`.
   - `profiles.id` = `auth.users.id` is the **profiles track**. Used by `entries.student_id` (column named `student_id` but FKs to `profiles`). Class membership on this track lives on `profiles.class_id`.
   - When in doubt: entries are on the profiles track; everything else students-related is on the students track.

8. **Don't `DELETE FROM students` to reset.** Cascade chain wipes things you don't want gone. Use targeted deletes.

9. **When Mike says he's running out of context, finish what's in flight.** Don't start a new feature. Ship the migration, write the handoff, stop.

10. **`supabase/migrations/` = STRUCTURAL ONLY.** Seeds, proofs, diagnostics are snippets in chat — not committed migration files. Migration filenames use `YYYYMMDDHHMMSS_description.sql` (14 digits).

11. **Working agreement.** Mike holds editor/dashboard/keys/pushes. Claude designs, drafts whole files, hands them over. Mike applies, commits, pushes.

12. **Resume state lives in `localStorage`, NOT in the DB.** When Mike clears a `students` row to "reset", the splash will STILL show "Resume where you left off" because the engine reads `localStorage[SAVE_KEY]`. InPrivate windows do NOT clear it within the same window's lifetime. To clear: DevTools → Application → Local Storage → `localhost:3000` → delete the key. Mention this preemptively when Mike's cleanup looks like it didn't take.

13. **Always provide migration SQL files as downloadable files** so Mike can add them to his `supabase/migrations/` folder. If a migration is created during a session but only provided as inline SQL in chat (not as a downloadable file), it will be missed from the migrations folder. Every migration = a downloadable `.sql` file.

14. **Workflow: request files in chunks Claude can complete independently.**


---

## Session 113 Decisions (2026-10-13)

1. **Two projects, two handoffs.** **Spotlight** = the online classroom app (`spotlight-live`). **GroovR** = the dance game (`groovr-desktop`). Each keeps its own handoff in its own folder.
2. **One name per product.** No separate names for online vs offline parts. "Spotlight" is the whole classroom app; "GroovR" is the whole dance game, offline and (later) online.
3. **Reclaim the GroovR name for the dance game.** Anything named "groovr" that is really Spotlight gets renamed to Spotlight; the abandoned May GroovR attempt (`groovr-creator`) gets retired.

### Name cleanup checklist

- [x] **GroovR backed up to GitHub** as `getgroovr/groovr` (it had no git history at all). Done 2026-10-13.
- [x] **Supabase:** (done 2026-10-13) rename the project's display name `groovr-creator` → `spotlight` (Project Settings → General → Project name). Label only: the project ref `ilctdtppstvmpvuvdqvf`, URL and keys do not change, so `.env.local`, the keep-alive workflow and the app keep working.
- [x] **GitHub:** archived `getgroovr/groovr-creator` (done 2026-10-13). Read-only, nothing lost; Settings → Unarchive undoes it.
- [x] **Vercel:** deleted the stale `groovr-creator` project (done 2026-10-13; it only ever served the May code). The Vercel account now has no projects. When Spotlight is deployed for real, create a new Vercel project named `spotlight` linked to `getgroovr/spotlight-live`.
- [ ] **PC:** the `C:\Users\Myked\projects\groovr-creator` folder can be zipped and removed later. Not urgent.
- Optional, cosmetic: rename repo `spotlight-live` → `spotlight`. GitHub redirects the old name; secrets and Actions move with it. Leave it unless it bothers Mike.

---

## Where Everything Actually Lives (verified 2026-10-07)

This was the main finding of Session 112. Earlier handoffs had it muddled.

| Thing | Real location | Notes |
|---|---|---|
| **Newest code** | `C:\Users\Myked\projects\spotlight-live` on Mike's PC | Last edited 2026-08-02 |
| **GitHub repo** | `getgroovr/spotlight-live` | All work is on branch **`slice-1a`**. `main` is far behind (late May). |
| **Database** | Supabase project `ilctdtppstvmpvuvdqvf`, dashboard name **`spotlight`** (was `groovr-creator`), org `getgroovr` (free tier) | The only project in the account. Contains all the real tables (`admin_settings` last updated 2026-07-14, all `multi_teacher_*` / `multi_game_*` tables, etc.). |
| **Vercel** | Project `groovr-creator`, linked to GitHub repo `getgroovr/groovr-creator` | **Stale.** Created May 20, last deploy May 21. It is NOT linked to `spotlight-live`. Redeploying it only rebuilds the May code. |
| **How the app has actually been run** | Locally (`npm run dev`, `localhost:3000`) against the Supabase project above | That's why Vercel never saw the later work. |

Other folders in `C:\Users\Myked\projects`:

| Folder | What it is | How to run |
|---|---|---|
| `groovr-desktop` | **The original GroovR dance game** (Electron desktop app, no accounts, no internet). 3 real clips in `public/clips/mike/`, 6 stick-figure placeholders; content in `src/dances.js`. Running again as of 2026-10-11, and Mike says it's fun. | `npm run dev` in that folder; a GroovR window opens |
| `spotlight-shuffle` | One-teacher Spotlight, desktop-only (Vite). 9 placeholder videos, mandatory comments, CSV export. Mike's verdict 2026-10-11: "not much" compared with spotlight-live. | `npm run dev`, then `http://localhost:5173` |
| `groovr-creator` | First attempt to put GroovR online (login/signup/profile only), May. Vercel still deploys it. Abandoned. | — |
| `Sql scripts\sql for spotlight live\to reset students` | Test/reset SQL: `all-in-one-setup-v10.sql`, `populate-seed-voter-sessions.sql`, `jump-to-round-*-v5.sql`, `seed-multi-game.sql`, `testing-walkthrough-v24.sql` (the 15-minute test guide). Older versions in `not used`. Most are also saved as snippets in the Supabase SQL Editor. | Paste into Supabase SQL Editor, Run |

### Corrections to the misnamed "Session 109/111" handoff
- Repo is `spotlight-live`, but Vercel deploys a *different* repo (`groovr-creator`). Step 1's "redeploy on Vercel to confirm" does not test current code.
- Setup SQL is `all-in-one-setup-v10.sql` (not v9).
- The Session 108 handoff says **all 8 multi-teacher phases are shipped**. The 109/111 handoff says phases 4–8 were never built. Trust Session 108 + the code (`src/app/play/multi/...`, `reveal/`, `multi-game-lifecycle.ts` all exist) — verify before assuming either.
- Session numbering is muddled: last commit message says "Session 107-108"; Session 108 handoff dated 2026-08-01; file edits continue to 2026-08-02. Calling today Session 112 to stay ahead of every number already used.


> Rows above that mention `groovr-desktop` and `groovr-creator` are historical. Current GroovR detail lives in the GroovR handoff.

---

## Update 2026-10-11 → 10-12 (same session, continued)

1. **Docs tidied.** Old handoffs moved to `docs/handoffs/Archive/`. Only this file and the misnamed Session 109 file remain at the top level. The online status doc ("Groovr — Project Status & Resumption Plan", a Claude Doc) was corrected and given a "Where Everything Runs" table and an "Ideas: Where GroovR and Spotlight Meet" section.
2. **Dance game revived.** `groovr-desktop` runs. The Oct 7 "Dance Mode" plan (strip audio + Spotify) is **dropped**: silent clips remove the puzzle, and Spotify's developer policy forbids syncing its music to video and building games on it. GroovR stays private on Mike's PC for now.
3. **spotlight-live run end to end locally, no code changes:**
   - All classes had been archived. Unarchived **Spotlight — Mike's First Class**.
   - `myked70@yahoo.com` had been deleted (by the "Delete Student Email" snippet, Aug 2). Mike re-signed up 2026-10-12 (new auth id `3a33d7be-…`). An old unrelated test account `myked70og@gmail.com` also exists.
   - Ran `all-in-one-setup-v10.sql` then `populate-seed-voter-sessions.sql`. Both succeeded.
   - Teacher approved Casper2's round 1 photo, set **Starts at** to 2026-10-12 7:16 AM (3 student rounds, 2 h rounds, 30 min review), saved. Student dashboard showed Round 1 live, photo approved, teacher feedback visible, rounds 2–3 awaiting approval. Everything worked.
4. **Mike's reaction:** works and the restart was smooth, but it isn't exciting yet. It feels far along enough that the real next step is trying it with actual students. That's why it went online in the first place.

## How to Run and Log In (spotlight-live)

1. VS Code → open `C:\Users\Myked\projects\spotlight-live` → terminal → `npm run dev` → `http://localhost:3000`.
2. Use **two browser windows**: normal window for one account, InPrivate (Ctrl+Shift+N) for the other. Never sign into both accounts in the same window.

| Page | URL | Who |
|---|---|---|
| Log in | `localhost:3000/auth/login` | Teacher and student (use password, not magic link) |
| Sign up | `localhost:3000/auth/signup` | New accounts (18+ checkbox; email confirmation is off) |
| Teacher: classes, review queue, game settings | `localhost:3000/teacher/students` | Teacher (`getgroovr@yahoo.com`, is_admin) |
| Teacher: warm-up deck | `localhost:3000/teacher/deck` | Teacher |
| Teacher: profile | `localhost:3000/teacher/profile` | Teacher |
| Multi-teacher Showcase lobby | `localhost:3000/teacher/multi` ("Multi-Mode →" button) | Teacher |
| Admin dashboard | `localhost:3000/admin` | Admin |
| Student dashboard | `localhost:3000/student/dashboard` | Student (`myked70@yahoo.com`, screen name Casper2) |
| Student game | "Go to the game →" on the dashboard (`/student/play`) | Student |
| Awards ceremony | `localhost:3000/student/results` | Student, after the last round |
| Public browse + free warm-up | `localhost:3000/play` → teacher card → "Try a warmup" | Anyone, no login |
| Public teacher profile | `localhost:3000/teachers/<teacher id>` | Anyone |

**To reset the test class:** Supabase → SQL Editor → run `all-in-one-setup-v10.sql`, then `populate-seed-voter-sessions.sql`. Requires `myked70@yahoo.com` to exist and the "First" class to be unarchived. It wipes and rebuilds **only** the "First" class.

## How a Round Works Today (from the code, `src/lib/round-timing.ts` + `src/lib/class-deck.ts`)

- **Photos are submitted ahead.** Each student fills a photo slot for each round before that round starts. A slot locks when its round begins.
- **Each round = play window + review window.** With 2 h rounds and 30 min review, students play for the first 90 min. Then submissions close, and the teacher approves the next round's photos.
- **Viewing happens during the round, not after.** When round N opens, the grid holds every classmate's teacher-approved round N photo. Classmates only ever see approved photos; a student sees their own even while pending.
- **A student whose own photo for the round is still pending can't play** ("entry-pending" holding page).
- **Fewer than 9 photos:** monster cards fill the empty grid spots (`monsters.jsx`). **Zero photos:** "no entries" holding page.
- **Photos approved mid-round** appear for anyone who opens the grid afterwards. Early players may see fewer.
- **After the last round:** the game is over and students go to the awards ceremony. There is no separate "look back at everything" window built in.

## Round Timing: Settled (Mike, 2026-10-12)

Submissions run one round ahead, by design: students view and comment on round N while uploading for round N+1. No change needed.

Still open, minor: photos approved mid-round reach only students who play afterwards, and there is no extra viewing time after the final round (students go straight to the awards). Revisit only if real testing shows it matters.


## What Comes Next (Spotlight)

1. Finish the name cleanup checklist above.
2. Decide what "deployed" should mean. Options: (a) keep running locally only for now; (b) point a new Vercel project `spotlight` at `spotlight-live` and deploy `slice-1a` or merge it into `main`. Don't do (b) casually — it puts current code on a public URL.
3. Try it with real students. Mike's Oct 12 verdict: it works and is far enough along that real use is the next real test.
4. Session 108's open bug and enrollment-redesign notes may already be done — the July 29 commit message says the enrollment flow redesign shipped. Check the code before redoing anything.
5. Future overlap with GroovR: a GroovR Social (online) would likely start as a copy of Spotlight's accounts, classes (→ crews), comments and approval queue. Not started; see the GroovR handoff.
