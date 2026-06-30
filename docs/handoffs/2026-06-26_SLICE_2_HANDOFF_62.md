# SESSION 62 HANDOFF — 6/26/2026

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT SESSION" section for the suggested flow.

---

## Mike's preferences — INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS

1. **Full-file replacements, NOT patches.** Output the entire new file. Mike does not apply line-by-line edits.
2. **PowerShell and SQL commands only.** Mike's machine is Windows. No grep, bash, sed, curl. Use `Select-String` for grep, etc.
3. **Anything beyond PS/SQL needs explicit direction.** Spell out every step.
4. **Don't start coding without seeing the existing files.** Ask Mike to upload before writing replacements.
5. **Ask before assuming on design questions.** Mike has strong opinions.
6. **Flag what's deferred and why.**
7. **Admit when wrong; correct prior handoffs.**
8. **Concise is good. Over-formatting is not.**
9. **Tighten layouts.** Compact, side-by-side field arrangements.
10. **Label editability clearly.**
11. **Use "See the round" / "Close the round" toggle buttons** on all collapsible round sections.
12. **"Spreadsheet" not "CSV" in user-facing text.**
13. **Verify all NOT NULL columns and FK chains BEFORE writing an INSERT.**
14. **Workflow: request files in chunks Claude can complete independently.** 2–3 chunks per chat before next handoff.
15. **Use full destination paths when referencing files.** Don't make Mike guess which directory a file goes in.
16. **Group all confirmation / direction / testing questions at the END of a task block.** Don't stall with single questions mid-flow — batch them so Mike can answer all at once and provide testing feedback on a larger set of modifications.
17. **Fun matters.** Boxing ring countdown, confetti, balloons — the game should feel like a celebration at every transition.
18. **Lock things down after submission.** Once a student uploads, they're done. No going back to re-pick favorites.
19. **Voting rules must be meaningful.** No single-vote winners. Competition ranking for ties.
20. **Photo architecture needs a real solution.** Folder-per-game, not flat.
21. **Just the comment, not "why is this your favorite."** The teacher review queue should show only the favorite comment, not a separate "why" field. One comment per favorite is plenty, especially since students can revise it now.

---

## KEY CONCEPT — Warm-up vs Student Rounds (INCLUDE IN ALL HANDOFFS)

The warm-up round uses the TEACHER'S photos. Students comment on photos they didn't take. Student rounds 1–3 use STUDENT-uploaded photos. Students comment on classmates' work. The teacher's warm-up photos live in the teacher deck (`entries` with `source = 'teacher'`). Student photos are uploaded during the "last step" at the end of each round and go live in the NEXT round's spotlight deck.

---

## What happened in Session 61

Mike ran a full playtest: all-in-one setup → jump to round 2 → play round 2 as Casper2 → teacher review → jump to round 3 → play round 3 → awards. Screenshots documented the full flow. Overall verdict: **"looking really good — not seeing anything that's not been addressed"** and **"not many of those left... good job."**

Key observations from the playtest:
- The "C" avatar for Casper2 (no uploaded photo) looks good — much better than an empty spot
- Teacher dashboard correctly showed both warmup + round 2 items for review
- The "You're all done!" party screen appeared correctly after round 3
- The "Well done, Casper2" / "See your results →" post-game dashboard state worked
- Results/awards page loaded and showed round winners with trophy

---

## NEW BUGS from Session 61 Playtest

| # | Description | Priority | Notes |
|---|---|---|---|
| B63 | Jump-to-round SQL must be preceded by all-in-one setup or state goes stale | MEDIUM | Teacher reverts to approving warmup round if setup isn't fresh. May be caused by running jump SQLs consecutively without reset. SQL issue, not app code. |
| B64 | Teacher review card still shows "WHY IT'S MY FAVORITE" as separate field | HIGH | Teacher dashboard shows both "COMMENT ON PIC" and "WHY IT'S MY FAVORITE" for Casper2's warmup entry. Mike says: just show the comment, the "why" field is redundant — especially now that students can revise. Remove the "WHY IT'S MY FAVORITE" section from the teacher review card entirely. |
| B65 | Jump-to-round SQL re-creates warmup comment needing approval | MEDIUM | After running all-in-one + jump to round 3, the warmup comment reappeared in teacher's pending queue. May be the SQL inserting a duplicate, or the approval status getting reset. SQL issue. |
| B66 | Dashboard says "your next chance is Student Round 4" after round 3 | MEDIUM | When Casper2 missed the round 3 upload window, dashboard said "next chance is Student Round 4" — but there are only 3 rounds. After the final round, this message should reference the awards/results instead. |
| B67 | Student Round 3 shows "no photo submitted" on dashboard | LOW | The jump-to-round SQL doesn't create an entry for Casper2's round 3 photo upload. Likely an SQL seeding gap, not an app bug. The "no pic" placeholder on the dashboard actually looks fine as a UI state. |

---

## UI CHANGE REQUESTS from Session 61 Playtest

| # | Description | Where | Priority |
|---|---|---|---|
| U1 | "Your favorite" confirmation screen text should read: **"Here's your favorite. If you'd like to change your pick or update your comment, now's the time. Students with the most favorite votes for each round will see their classmates' comments."** | `/student/play` — favorite confirmation view | HIGH |
| U2 | "Now add your photo for Round X" section needs a prominent button-style treatment, not just text + file input. Make it obvious where to tap/click to upload. | `/student/play` — post-favorite upload section | MEDIUM |
| U3 | Hide the filename text (e.g. "Choose File rounded entrances.jpg") once the photo preview is visible. The preview IS the confirmation — no need for the raw filename too. | `/student/play` — file input after photo selected | MEDIUM |
| U4 | Add countdown timer to the "You're all done!" party screen — countdown to when awards will be revealed | `/student/play` — game-over/party view | MEDIUM |
| U5 | Add countdown timer to dashboard — shows when next round starts, or when awards ceremony begins | `/student/dashboard` | MEDIUM |
| U6 | Dashboard banner after final round says "sit tight until the next round" — should say something about the awards ceremony, not "next round" | `/student/dashboard` — post-round banner text | HIGH |
| U7 | "See your results →" button should read **"See the class results →"** or **"See the classes' favorite pictures from each round →"** — it's not YOUR results, it's the class's favorites | `/student/dashboard` — post-game CTA button | HIGH |
| U8 | Seed SQL vote distribution needs to produce clear gold/silver/bronze — give one photo 4 favorites, one 3, one 2 | SQL seed files | HIGH |

---

## Open bugs (CUMULATIVE — carried forward)

| # | Description | Priority | Status |
|---|---|---|---|
| B64 | Teacher review card shows redundant "WHY IT'S MY FAVORITE" field | HIGH | NEW — remove this field from teacher review UI |
| B48 | Lock favorites after next-round photo upload — remove editing, full-screen celebration | HIGH | Partially closed (gate + condensing done; full lock behavior may need verification) |
| B66 | Dashboard "next chance is Round 4" when only 3 rounds exist | MEDIUM | NEW — conditional text based on total rounds |
| B65 | Jump SQL re-creates warmup comment needing approval | MEDIUM | NEW — SQL fix needed |
| B63 | Jump SQL needs fresh all-in-one or state goes stale | MEDIUM | NEW — SQL sequencing issue |
| B49 | Comment editing rules — non-favorites editable until round close, favorite locks on submit | MEDIUM | Open |
| B67 | Student Round 3 "no photo submitted" in jump-to-round | LOW | NEW — SQL seed gap |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| LATENT | Visitor deck.ts missing `id` projection bug | LOW | Open |

### Closed this session (61) — carried from prior handoff

| # | Description | Fix |
|---|---|---|
| B61 | Splash never appeared — React StrictMode double-effect killed it | Defer `markRoundSplashSeen` to dismiss callbacks |
| B60 | Student can re-enter game after completing a round | `sessionByRound.has(currentRound)` gate on dashboard CTA |
| B54 | Completed round stays expanded on dashboard | Played rounds move to completedRounds band |
| B41 | Teacher page photos not loading | Full-URL passthrough + error logging on all three signing points |
| B62 | Results page silently hides silver/bronze | Explicit "No clear 2nd/3rd place" messages with faded medals |
| — | Back button traps student in game | ← navigates to `/student/dashboard` for student mode |
| — | Favorite comment screen too sparse | Richer instructional text |
| — | Student can't preview uploaded photo | File input shows preview via createObjectURL |

---

## Ideas list

1. **Admin dashboard** — admin limits how many classes a teacher can create; system oversight
2. **Student → teacher messaging** — button in student profile to message the teacher
3. **Student → admin messaging** — separate button to message the admin/support
4. **Auto-class-creation** — when class hits 9 students, system auto-creates next class (teacher sets desired count)
5. **Teacher sets desired number of classes** — "I want 4 classes" → system creates 4, fills sequentially
6. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough
7. **Round gap timing UI** — student-facing countdown showing submission deadline vs round boundary; teacher-facing review window indicator
8. **"Party setup" holding page** — after final round, students see countdown to results reveal (B58 placeholder now in place, U4 extends it with actual countdown)
9. **Tie-handling in awards** — with 9 students there will often be ties (3 golds, 1 bronze, etc.). May need tie-breaking rules or "shared gold" display. Worth thinking through the UX for common tie scenarios.

---

## NEXT SESSION (62): UI Polish + SQL Fixes

This session is primarily UI copy changes and SQL seed improvements. Estimated: 2 chunks.

### Chunk A — UI Text & Layout Fixes

**Files needed from Mike:**
- `src/app/student/play/` — the play page and its components (spotlight.jsx or equivalent)
- `src/app/student/dashboard/page.tsx`
- `src/app/student/results/page.tsx`
- `src/app/teacher/students/page.tsx` (for B64 — removing "why it's my favorite" from review card)

**What to do:**
1. **B64:** Remove "WHY IT'S MY FAVORITE" section from teacher review card. Just show the comment.
2. **U1:** Update favorite confirmation text to Mike's exact wording.
3. **U2:** Make the "upload your photo for next round" section more button-like and prominent.
4. **U3:** Hide raw filename once photo preview is showing.
5. **U6:** Change post-final-round banner from "next round" language to awards/ceremony language.
6. **U7:** Change "See your results →" to "See the class results →" (or similar).
7. **B66:** Fix "next chance is Round 4" — when current round = total rounds, show awards messaging instead.

### Chunk B — SQL Seed Improvements

**Files needed from Mike:**
- Current `all-in-one-setup` SQL (latest version)
- Current `jump-to-round` SQL files

**What to do:**
1. **U8:** Update vote distribution in seed SQL so awards show clear gold (4 votes), silver (3), bronze (2) per round.
2. **B65:** Investigate and fix warmup comment re-creation during jump-to-round. Add `ON CONFLICT DO NOTHING` or conditional insert.
3. **B63:** Add a note/guard at the top of jump-to-round SQL reminding to run all-in-one first, or add idempotency checks.
4. **B67:** Ensure jump-to-round-3 creates a Casper2 entry for round 3 (or at least doesn't leave a confusing gap).

### Chunk C (if time) — Countdown Timers

**Files needed:** dashboard page, party/done screen component

**What to do:**
1. **U4:** Add countdown to awards reveal on the "You're all done!" party screen.
2. **U5:** Add countdown to next round / awards on the student dashboard.
3. These depend on the `class_timing` / `games` table having a `started_at` + `round_duration` that can calculate when the current round ends. If that data isn't available yet, stub the countdown with placeholder text and note what schema work is needed.

---

## Slice 2 Timeline (updated)

- ✅ Session 60: Chunk B file updates (B55–B59 closed)
- ✅ Session 61: Splash screen, teacher photos, results layout, dashboard post-game state
- 🔲 **Session 62: UI polish from playtest + SQL seed fixes** ← YOU ARE HERE
- 🔲 Session 63: Data layer game_id awareness + teacher game lifecycle + photo folder scoping
- 🔲 Session 64: Multi-class polish, remaining bugs (B48, B49, B11)
- 🔲 Session 65: Round gap timing UI, countdown timers, deployment prep
