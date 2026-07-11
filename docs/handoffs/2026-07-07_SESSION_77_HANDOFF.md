# Session 77 Handoff

Date: 2026-07-07

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

## What was delivered in session 77

### Completed round badge — composite status ✅ DONE

Completed round badge now shows the *worst* status between the entry and the round's favorite comment. Entry approved + comment pending → AWAITING APPROVAL. Entry approved + comment rejected → NOT APPROVED. Prevents misleading APPROVED badge when the comment still needs review.

**File delivered:** `page_dash.tsx` → goes to `src/app/student/dashboard/page.tsx` (REPLACES)

### Duplicate photo removed from comment resubmit form ✅ DONE

The `ResubmitFavoriteCommentForm` no longer shows the favorited photo inside the expanded form — the parent section already shows it. Matches the cleaner entry-resubmit pattern (no duplicate info). Props kept for backward compat.

**File delivered:** `ResubmitFavoriteCommentForm.tsx` → goes to `src/app/student/dashboard/ResubmitFavoriteCommentForm.tsx` (REPLACES)

### Add-photo form removed from dashboard ✅ DONE

Empty future round slots no longer render the `<details>` dropdown with `AddEntryForm`. Students add photos through the game flow only, not the dashboard. `AddEntryForm` import removed from page.tsx. `AddEntryForm.tsx` itself is unchanged (may still be used in the game flow).

**(Same file as composite badge above)**

### Pending entries removed from YOUR ROUNDS ✅ DONE

Entries with `status === "pending"` are skipped in the YOUR ROUNDS top band. They appear in the amber Awaiting Approval section at the top instead. No more duplicate AWAITING APPROVAL cards.

**(Same file as composite badge above)**

### YOUR ROUNDS — live round only ✅ DONE

YOUR ROUNDS top band now only renders the current (live) round. Future rounds are hidden entirely — their entries appear when that round goes live. Prevents pre-approved future entries from showing prematurely (e.g., seeded entries showing as APPROVED before the student plays).

**(Same file as composite badge above)**

### Teacher spotlight — student submission fix ✅ DONE

Two fixes to the teacher's per-student spotlight page:

1. **Dual-ID lookup:** Submissions query now tries both `students.id` AND the email-resolved `profiles.id` via `.in("student_id", [...idsToTry])`. Previously gated on `if (profilesId)` — if the email bridge failed, submissions were empty. Now works regardless.

2. **`Number()` type coercion:** `game_sessions.round` was cast with TypeScript `as number` (compile-only, no runtime effect). If Supabase returned a string, the `submissions.find(s => s.roundNumber === studentRoundNum)` comparison silently failed. Now uses `Number(s.round) || 0`.

**File delivered:** `page_id.tsx` → goes to `src/app/teacher/students/[id]/page.tsx` (REPLACES)

### Teacher spotlight — upcoming submissions filtered ✅ DONE

"Upcoming Submissions" section only shows entries that need the teacher's attention — pending or rejected. Approved future entries are hidden (teacher already dealt with them). They appear inside the round section via "Their Round N Contribution" when played.

**(Same file as dual-ID fix above)**

### Teacher spotlight — live round collapsible ✅ DONE

All rounds (including live) now use the same collapsible `<details>` pattern with "See the round" / "Close the round" toggle. Live round gets a green LIVE ROUND badge in its summary but otherwise behaves identically. No more force-expanded section that can't be closed.

**(Same file as dual-ID fix above)**

### Setup SQL v8 ✅ DONE (corrected)

Phase 5 now creates entries for rounds 1, 2, AND 3 for the test student — ALL as `pending`. Earlier attempt seeded rounds 2/3 as `live`, which blocked the game flow from creating entries and caused all rounds to show APPROVED simultaneously. Corrected to `pending`.

**IMPORTANT:** JUMP TO scripts must approve the relevant round's entry before jumping. Add this line to each:

**JUMP TO ROUND 1** — add:
```sql
UPDATE entries SET status = 'live'
WHERE student_id = (SELECT id FROM auth.users WHERE email = 'myked70@yahoo.com')
  AND class_id = (SELECT id FROM classes WHERE name LIKE '%First%')
  AND round_number = 1 AND is_starter = false;
```

**JUMP TO ROUND 2** — add:
```sql
UPDATE entries SET status = 'live'
WHERE student_id = (SELECT id FROM auth.users WHERE email = 'myked70@yahoo.com')
  AND class_id = (SELECT id FROM classes WHERE name LIKE '%First%')
  AND round_number = 2 AND is_starter = false;
```

**JUMP TO ROUND 3** — add:
```sql
UPDATE entries SET status = 'live'
WHERE student_id = (SELECT id FROM auth.users WHERE email = 'myked70@yahoo.com')
  AND class_id = (SELECT id FROM classes WHERE name LIKE '%First%')
  AND round_number = 3 AND is_starter = false;
```

**File delivered:** `all-in-one-setup-v8.sql` → replaces v7

---

## Schema: no changes this session

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C3 | Test admin ↔ teacher deck interaction | Manual test — not a code task |
| C5 | Messaging — notification notes | Deferred (needs post-session-77 versions of student dashboard, teacher students page, admin page) |

---

## Playtest punch list (updated)

| # | Description | Priority | Status |
|---|---|---|---|
| P1 | Buttons — auto-width, snug padding | LOW | ✅ DONE (session 76) |
| P2 | Awaiting-approval favorite comments in student dash | MEDIUM | ✅ DONE (session 76) |
| P3 | Teacher spotlight: student's own pic biggest at top | HIGH | ✅ DONE (session 75) |
| P4 | Student dash: "Your Round X Contribution" label | MEDIUM | ✅ DONE (session 75) |
| P5 | Standalone favorite comment box removed | MEDIUM | ✅ DONE (session 75) |
| P6 | Too many pics in round 1 / warmup (seeding) | MEDIUM | ✅ SQL FIX (session 76) — needs clean re-seed |
| P7 | Missing profile pic avatar note | LOW | DROPPED |
| P8 | "No pic submitted" for round 2 | MEDIUM | ✅ Fixed by v8 seeding + JUMP TO approve lines |
| P9 | Warmup leak in teacher approval queue | HIGH | ✅ DONE (session 76) |
| P10 | Rotating placeholder: 2 fun + rule, stop | LOW | ✅ DONE (session 76) |
| P11 | Awards fireworks — dramatic burst before finale | MEDIUM | ✅ DONE (session 76) |
| P12 | 3rd place confetti/ribbons match 2nd place | MEDIUM | ✅ DONE (session 76) |
| P13 | Folder structure in handoffs | N/A | DROPPED |
| P14 | Completed round badge: composite status | MEDIUM | ✅ DONE (session 77) |
| P15 | Duplicate photo in comment resubmit form | LOW | ✅ DONE (session 77) |
| P16 | Remove add-photo from dashboard | MEDIUM | ✅ DONE (session 77) |
| P17 | Pending entries duplicate in YOUR ROUNDS | MEDIUM | ✅ DONE (session 77) |
| P18 | Future round entries visible prematurely | MEDIUM | ✅ DONE (session 77) |

---

## Open bugs (updated)

| # | Description | Priority | Status |
|---|---|---|---|
| NEW | Teacher login bypasses auth (no magic link required) | HIGH | Needs investigation — upload middleware.ts + supabase-server.ts |
| NEW | Verify resubmitEntry handles optional photo | MEDIUM | Mike to check `src/app/play/actions.ts` |
| NEW | Verify game flow handles pre-existing entries for next round | MEDIUM | If student plays round 1 and a pending round 2 entry already exists from v8 seeding, does the game flow skip/update/duplicate? Mike to test after adding JUMP TO approve lines. |
| U1 | Update favorite confirmation text to Mike's wording | LOW | Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |

---

## NEXT SESSION priorities

1. **Test v8 + JUMP TO approve lines** — verify the game flow works end-to-end with pending seeded entries.
2. **Teacher auth bypass** — investigate middleware.ts + supabase-server.ts.
3. **C5 — Messaging / notification notes** — as scoped in session 74 handoff.
4. **Game flow entry conflict check** — if the game flow creates a duplicate entry when one already exists, need to fix `src/app/play/actions.ts`.

**Files needed from Mike (if game flow has entry conflicts):**
- `src/app/play/actions.ts`

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

## Test workflow with v8 (step by step)

1. Run `all-in-one-setup-v8.sql` (creates everything fresh)
2. Run `populate-seed-voter-sessions.sql`
3. Run JUMP TO ROUND 1 (**with the approve line added**)
4. Play as Casper2 through round 1 — submit photo + favorite comment
5. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
6. Teacher approves round 1 favorite comment
7. Run JUMP TO ROUND 2 (**with the approve line added**)
8. Play as Casper2 through round 2
9. Repeat for round 3 / awards

---

## Teacher spreadsheet overhaul — DEFERRED

Column names now confirmed (`rejection_reason`, `favorite_comment_rejection_reason`). Ready to build when Mike wants it.

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
