# Session 112 Handoff
**Date:** 2026-10-07, updated 2026-10-12
**Supabase project:** ilctdtppstvmpvuvdqvf (named `groovr-creator` in the Supabase dashboard)

> **Read this one first.** It supersedes `2026-10-07_SESSION_109_HANDOFF.md` (that file is misnamed — its contents call itself Session 111 — and several of its facts were wrong; corrections below). For full feature/file/schema detail, `2026-08-01_SESSION_108_HANDOFF.md` is still the best reference.

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

## Where Everything Actually Lives (verified 2026-10-07)

This was the main finding of Session 112. Earlier handoffs had it muddled.

| Thing | Real location | Notes |
|---|---|---|
| **Newest code** | `C:\Users\Myked\projects\spotlight-live` on Mike's PC | Last edited 2026-08-02 |
| **GitHub repo** | `getgroovr/spotlight-live` | All work is on branch **`slice-1a`**. `main` is far behind (late May). |
| **Database** | Supabase project `ilctdtppstvmpvuvdqvf`, dashboard name **`groovr-creator`**, org `getgroovr` (free tier) | The only project in the account. Contains all the real tables (`admin_settings` last updated 2026-07-14, all `multi_teacher_*` / `multi_game_*` tables, etc.). |
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

---

## What Was Done This Session (112)

1. **Supabase restored.** Project was paused (~2 months idle). Resumed; status Healthy.
2. **Located the real code, repo, and database** (table above).
3. **Backed up unsaved work.** 14 files (edits from 2026-07-30 → 08-02, two new migrations `20260801120000_starter_assignments.sql` and `20260802120000_seed-multi-game.sql`, and handoff docs) were uncommitted. Committed as "Sessions 109-110 work (backup)" on `slice-1a` and pushed to GitHub. **Nothing exists only on the PC anymore.**
4. **Keep-alive set up and verified** — GitHub Actions pings Supabase every 3 days so it never hits the 7-day free-tier pause.

### Keep-alive status — ✅ DONE and verified
- [x] `.github/workflows/keepalive.yml` committed to `main` of `getgroovr/spotlight-live` (commit 1ddd7b2)
- [x] GitHub secret `SUPABASE_URL` = `https://ilctdtppstvmpvuvdqvf.supabase.co`
- [x] GitHub secret `SUPABASE_ANON_KEY` = legacy anon key (JWT, role=anon, ref=ilctdtppstvmpvuvdqvf, expires 2036)
- [x] Manual run #1 succeeded 2026-10-07

Runs automatically every 3rd day of the month (~8:17 AM Phoenix). GitHub emails Mike if a run fails. Check occasionally at github.com/getgroovr/spotlight-live/actions. A spare copy of the workflow sits at `docs/keepalive.yml` (uncommitted, safe to delete). The workflow is on `main` only; when `slice-1a` is eventually merged into `main`, keep the `.github/workflows/keepalive.yml` file.

**Key safety reminder for Mike:** the anon/publishable key and the project URL are public by design (they ship in the browser). The `service_role` / "secret" key is the dangerous one — never put it in GitHub, Vercel's public vars, or a chat.

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

## GroovR Listen Mode: How to Play It (Mike's setup, 2026-10-12)

GroovR (desktop, `C:\Users\Myked\projects\groovr-desktop`) can now **listen** to music the player plays in their own music app. It recognizes the song like Shazam does and lines the dancers up with it. GroovR never stores or plays the music itself.

**Setup that works best (tested Oct 12):**
1. In a terminal in `groovr-desktop`, run `npm run dev:vite` and open `http://localhost:5173` in **Edge/Chrome**. Listen mode does not work in the Electron window.
2. Use the **Apple Music app** from the Microsoft Store, not the website, with the songs **downloaded**. Downloaded songs start and skip almost instantly. Playlist: "GroovR 3 song trial."
3. Switch Apple Music to its **Mini Player** and pin it on top with **PowerToys → Always On Top (Win + Ctrl + T)**. Park it beside the grid. PowerToys is installed; the PC runs Windows 10 Pro 22H2.
4. In GroovR click **🎧 Listen** and share **Entire screen + "Also share system audio."** Mike has no microphone; the Echo is a speaker only.
5. Play or skip songs in the Mini Player. GroovR shows "Now hearing: …", the dancers sync, and that song lights up in the list. Drag the song onto the dancer. **↻ Re-sync** retries if the timing looks off.

**What's built (in `src/listen.js` + `src/groovr.jsx`):**
- Fingerprint recognition.
- Quick start.
- Fast song switching: about 2–3 s after a skip.
- Fingerprints cached in the browser.
- No sync bar, just Re-sync.
- Optional in-game Apple player beside the grid. It's slower; the Mini Player route is preferred.
- The song stops on a match.
- A matched card glows "Now playing" when its song comes around again.

**Limits:**
- Only the 3 real dances (Neil Young, Bob Marley, Beastie Boys) can be recognized. The six stick figures need real clips.
- A browser can't control the Apple Music app. The player uses the Mini Player or media keys.

**Other music services (Mike's question, Oct 12):** listening works on the *sound*, so one GroovR works for everyone: Apple Music, Spotify, YouTube Music, Amazon, CDs. No separate versions are needed.
- To make it easier, GroovR could show **links** per song, which open the song in the player's own app.
- One universal link per song (a song.link-style page) could cover every service.
- Embedding other services' players is possible but slow, as the Apple embed showed. Spotify's developer rules forbid syncing their music to visuals, so stick to plain links.
- Phones can't hear another app's sound directly. A phone version would listen through the microphone instead.
- Not legal advice. Have a lawyer check before going public.

## What Comes Next

1. Decide what "deployed" should mean. Options: (a) keep running locally only for now; (b) point Vercel at `spotlight-live` (new Vercel project or re-link `groovr-creator`) and deploy `slice-1a` or merge it into `main`. Don't do (b) casually — it puts current code on a public URL.
2. GroovR (desktop): replace stick-figure placeholders with real clips (a video in `public/clips/` plus its song, with `appleMusic` link, in `src/dances.js`), then play it with friends using the Listen setup above. Maybe add per-song links for other music services. Dance Mode as planned Oct 7 is dropped (see above).
   - **Tabled GroovR direction (Oct 12): "players bring the music."** GroovR stores only silent dance videos plus song names, builds a randomized playlist (same order for every player in a game), and each player plays it in their own music app. Sync either by starting together or by GroovR listening (ACRCloud/AudD report song + position). Full write-up in the status doc, "Tabled idea (Oct 12)". Dancers must be able to pick their own song; that's Mike's hard requirement.
3. Session 108's open bug and enrollment-redesign notes may already be done — the July 29 commit message says the enrollment flow redesign shipped. Check the code before redoing anything.
