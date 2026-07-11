# Session 75 Handoff

Date: 2026-07-06

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
14. **Workflow: request files in chunks Claude can complete independently.**
15. **Always state full destination paths for delivered files.** E.g. "goes to `src/app/teacher/deck/page.tsx`" — never just the filename.
16. **Folder structure screenshots not needed in handoffs** — too cumbersome. Claude can request files by path.

---

## What was delivered in session 75

### P3 — Teacher spotlight: student's own contribution at top ✅ DONE

In `renderRoundContent`, the student's own submission for each round now shows biggest (160×160) at the top of the round view, labeled "Their Round N Contribution" with status badge. The favorite is demoted to the same 80×80 thumbnail size as other entries, still labeled "★ Their favorite" with approval badge. Warmup round (rd.round === 1) is unaffected since students don't submit entries for warmup.

**File delivered:** `page_-_id.tsx` → goes to `src/app/teacher/students/[id]/page.tsx` (REPLACES)

### P4 — Student dash: "Your Round X Contribution" label ✅ DONE

Completed rounds on the student dashboard now show "YOUR ROUND X CONTRIBUTION" label above the entry photo/description when expanded.

**File delivered:** `page_-_ss_dash.tsx` → goes to `src/app/student/dashboard/page.tsx` (REPLACES)

### P5 — Standalone "favorite comment" box removed entirely ✅ DONE

The standalone "Why it was your favorite" / favorite comment box has been removed from all 3 locations in the student dashboard (top band, completed rounds, warmup body) AND from the teacher spotlight page. The favorite is now indicated only by the ★ label on the favorited entry's comment card — which already shows the student's comment. The separate `favorite_comment` field was a legacy concept from when students wrote a "why" note separately. Now they just comment on entries and pick a favorite — no second comment needed. The rejection/resubmit flow for `favorite_comment_status` still works (Action Needed section) since that's a moderation concern.

**Files delivered:** Both `page_-_ss_dash.tsx` and `page_-_id.tsx` above.

---

## Schema: no changes this session

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C1 | Fix /play route for mode-aware deck loading | Needs `src/lib/deck.ts` |
| C3 | Test admin ↔ teacher deck interaction | Manual test — not a code task |
| C5 | Messaging — notification notes | Deferred (was NEXT from session 74, bumped by playtest fixes) |

---

## Playtest punch list (session 75)

| # | Description | Priority | Status |
|---|---|---|---|
| P1 | Buttons (edit fav comment, upload pic) — make smaller, same size, just slightly bigger than text | LOW | DEFERRED — needs: `AddEntryForm`, `ResubmitFavoriteCommentForm`, `ResubmitEntryForm` components |
| P2 | Awaiting-approval favorite comments — pull out into to-do area above rounds on student dash (same treatment as pics) | MEDIUM | DEFERRED — needs changes to student-archive.ts query + dashboard page. Currently only rejected comments pull out; pending ones stay inline. |
| P3 | Teacher spotlight: student's own pic biggest at top of round, favorite demoted to thumbnail | HIGH | ✅ DONE |
| P4 | Student dash: label own pic as "Your Round X Contribution" in completed rounds | MEDIUM | ✅ DONE |
| P5 | "Why it was your favorite" box → hidden after approved, only standalone when awaiting/rejected | MEDIUM | ✅ DONE |
| P6 | Too many pics in round 1 and warmup (seeding issue) | MEDIUM | DEFERRED — likely the seeding SQL inserting entries that don't get cleaned between runs. Needs investigation of `all-in-one-setup-v6.sql` cleanup logic. |
| P7 | Missing profile pic (Casper2 "C" avatar) — add a small note like "no pic will appear here" | LOW | DEFERRED |
| P8 | "No pic submitted" for round 2 on student dash — should seeding provide one? | MEDIUM | DEFERRED — the seeding only creates a round 1 entry for the test student. Round 2+ entries would need to be created manually or by adding phases to the setup SQL. |
| P9 | Warmup round item leaking into Round 2 approval queue | HIGH | DEFERRED — likely a query bug in the pending favorite comments query (`page_-_teacher_ss.tsx`). The `game_sessions` query filters by `favorite_comment_status = 'pending'` but doesn't filter by round, so a warmup session with pending status shows up in all views. Needs: `src/app/teacher/students/page.tsx` + `pending-queue.tsx`. |
| P10 | Rotating placeholder comments in comment box — show 2 cute ones then the real instruction, not continuous loop | LOW | DEFERRED — needs the game shell comment input component |
| P11 | Awards fireworks — too tiny. Defer big fireworks to AFTER countdown on final results page. Make it dramatic but quick | MEDIUM | DEFERRED — needs results/awards components |
| P12 | 3rd place confetti/ribbons — match 2nd place quantity | MEDIUM | DEFERRED — needs results/awards components |
| P13 | Folder structure in handoffs | N/A | DROPPED — too cumbersome, not needed |

---

## Open bugs (updated)

| # | Description | Priority | Status |
|---|---|---|---|
| NEW-P9 | Warmup round favorite comment leaking into student round approval queue | HIGH | Needs investigation — query in teacher/students/page.tsx |
| NEW | Teacher login bypasses auth (no magic link required) | HIGH | Needs investigation — upload middleware.ts + supabase-server.ts |
| NEW | Verify resubmitEntry handles optional photo | MEDIUM | Mike to check `src/app/play/actions.ts` |
| C1 | `/play` route queries `is_active` instead of mode columns | MEDIUM | Needs `src/lib/deck.ts` |
| U1 | Update favorite confirmation text to Mike's wording | LOW | Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |

---

## NEXT SESSION priorities

1. **P9 (HIGH)** — Fix warmup favorite comment leaking into round approval queue. Needs `src/app/teacher/students/page.tsx` (post-session-75 if P3/P4/P5 confirmed working) + `pending-queue.tsx`.
2. **P2 (MEDIUM)** — Pull awaiting-approval favorite comments into the student dash to-do area (same as rejected pics). Needs `src/lib/student-archive.ts` + student dashboard.
3. **C5 — Messaging / notification notes** — as scoped in session 74 handoff. Needs post-session-75 versions of student dashboard, teacher students page, admin page.
4. **P11/P12 — Awards fixes** — fireworks + 3rd place confetti. Needs results/awards components.

**Files needed from Mike (chunk 1 for P9):**
- `src/app/teacher/students/pending-queue.tsx`
- `src/app/teacher/students/page.tsx` (post-session-75, once confirmed working)

**Files needed (chunk 2 for P2):**
- `src/lib/student-archive.ts`

---

## Column names confirmed (carried forward)

- `entries.rejection_reason` (not `teacher_note`)
- `game_sessions.favorite_comment_rejection_reason`

---

## Known Tailwind issue (ONGOING)

Tailwind grid-cols-N does NOT compile. All multi-column layouts MUST use inline styles:
```jsx
style={{ display: "grid", gridTemplateColumns: "repeat(N, 1fr)" }}
```

---

## Current schema highlights

| Table | Key columns | Notes |
|-------|-------------|-------|
| `profiles` | id, role, display_name, username, max_classes, is_admin, is_archived | role: teacher/student |
| `teacher_rotation` | teacher_id (unique), sort_order, status | status: recruiting/waiting/paused |
| `admin_settings` | id=1, warmup_teacher_count | 1/3/9 |
| `classes` | id, teacher_id, name, capacity | capacity default 9 |
| `class_requests` | id, teacher_id, status, requested_at, reviewed_by, reviewed_at, created_class_id | status: pending/approved/denied |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete |

---

## Multi-teacher testing setup (carried forward)

Mike plans to test with `getgroovr-1@yahoo.com` and `getgroovr-2@yahoo.com` as teachers, one of the three emails as admin. Magic links auto-create auth users on first sign-in. After first login, set role and is_admin via SQL:

```sql
-- After getgroovr-1@yahoo.com signs in via magic link:
UPDATE profiles SET role = 'teacher' WHERE id = (
  SELECT id FROM auth.users WHERE email = 'getgroovr-1@yahoo.com'
);

-- Make whichever email you want as admin:
UPDATE profiles SET is_admin = true WHERE id = (
  SELECT id FROM auth.users WHERE email = 'getgroovr@yahoo.com'
);
```

Use a second browser or incognito for simultaneous sessions.

---

## Teacher spreadsheet overhaul — DEFERRED

Column names now confirmed (`rejection_reason`, `favorite_comment_rejection_reason`). Ready to build when Mike wants it. Existing export route.ts already uploaded.

---

## Ideas list

1. Admin dashboard — C4 done. Still needs: archived class count, spreadsheet archiving.
2. Messaging — notification notes. Deferred again (playtest fixes took priority).
3. Auto-class-creation — when class hits capacity.
4. Deployment/hosting setup guide.
5. Round gap timing UI.
6. "Party setup" holding page.
7. Incomplete mode selection warnings.
8. Teacher spreadsheet overhaul — deferred, ready to build.
