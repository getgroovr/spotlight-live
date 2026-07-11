# Session 76 Handoff

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

## What was delivered in session 76

### P1 — Button sizing ✅ DONE

AddEntryForm submit button changed from full-width/fontSize 14 to auto-width/fontSize 12/padding "7px 16px"/borderRadius 8. Matches ResubmitEntryForm and ResubmitFavoriteCommentForm (already at target size — unchanged).

**File delivered:** `AddEntryForm.tsx` → goes to `src/app/student/dashboard/AddEntryForm.tsx` (REPLACES)

### P2 — Pending favorite comments surfaced in student dashboard ✅ DONE

Amber "Awaiting approval" info box now appears between Action Needed and the primary CTA. Shows pending favorite comments by round with AWAITING APPROVAL badge and the student's comment text. Read-only — no resubmit form since there's nothing to fix. Warmup excluded per P9.

**File delivered:** `page_-_dash.tsx` → goes to `src/app/student/dashboard/page.tsx` (REPLACES)

### P6 — Starters leaking into round queries ✅ PARTIAL FIX

Added `UPDATE entries SET round_number = NULL WHERE class_id = v_class_id AND is_starter = true;` to Phase 2 of the setup SQL. Starters (warmup deck photos) no longer have round_number values. **Run this standalone NOW:**

```sql
UPDATE entries SET round_number = NULL
WHERE class_id = (SELECT id FROM classes WHERE name LIKE '%First%')
AND is_starter = true;
```

NOTE: This prevents future contamination. Existing game_sessions already have comments on 10 entries (the 8 seed voters + test student + 1 leaked starter). Those sessions won't change — the comments are baked into the JSONB. A clean run of all-in-one-setup-v7.sql before re-playing should produce clean 8-entry rounds going forward.

**File delivered:** `all-in-one-setup-v7.sql` → replaces v6

### P9 — Warmup favorite comment leak in teacher approval queue ✅ DONE

Added `.gt("round", 0)` to the pending favorite comments query. Warmup comments stay out of the teacher's approval queue. Confirmed: warmup comments don't need approval since they're about the teacher's own photos and never shown to classmates.

**File delivered:** `page_-_teacher_ss.tsx` → goes to `src/app/teacher/students/page.tsx` (REPLACES)

### P10 — Rotating placeholder stops after rule ✅ DONE

Placeholder cycle: fun phrase → fun phrase → rule → STOPS. Resets per photo so each new card gets the sequence fresh. No more continuous loop.

**File delivered:** `spotlight.jsx` → goes to `src/app/play/spotlight.jsx` (REPLACES)

### P11 — Dramatic fireworks before finale winners ✅ DONE (rev2)

Added a "finale-burst" phase — 3.5-second dramatic fireworks screen ("And the winners are…" + 🎆) with full confetti (180), balloons (24), ribbons (18) BETWEEN the last round's podium and the finale winners page. Confetti particle size increased to 8–16px (was 5–12px).

Per-round celebrations unchanged from original: confetti+ribbons for 2nd/3rd, confetti+ribbons+balloons for 1st.

**File delivered:** `ResultsCeremony.tsx` → goes to `src/app/student/results/ResultsCeremony.tsx` (REPLACES)

### P12 — 3rd place matches 2nd place ✅ DONE

3rd place now gets 40 confetti + ribbons, matching 2nd place (was 15 confetti, no ribbons).

**(Same file as P11)**

### Teacher spotlight — round 3 unclosable after game over ✅ DONE

When game is over (no round matches currentRound), all rounds are collapsible `<details>` elements. Previously the last round was force-expanded without a wrapper, making it impossible to close.

**File delivered:** `page_-_id.tsx` → goes to `src/app/teacher/students/[id]/page.tsx` (REPLACES)

### C1 — Mode-aware deck loading ✅ CLOSED

Already fixed in session 73. Current deck.ts has `selected_solo`/`selected_trio`/`selected_full` mode column filtering alongside `is_active`. No changes needed.

---

## Schema: no changes this session

---

## Playtest observations from session 76 testing

These came up during Mike's post-delivery testing. Adding here for tracking.

| # | Description | Priority | Root cause | Status |
|---|---|---|---|---|
| T1 | 10 pics per round on teacher spotlight | MEDIUM | Existing game_sessions have comments on 10 entries (8 seed voters + test student + leaked starter). P6 SQL fix prevents future contamination. Clean re-run of setup-v7 + JUMP TO scripts needed. | Needs re-test after v7 |
| T2 | Student's own pic/description missing from teacher spotlight rounds | MEDIUM | The JUMP TO scripts create game_sessions for rounds 2/3 but don't create entries at those round_numbers for the test student. The setup SQL only creates a round 1 entry. | Needs JUMP TO script updates |
| T3 | Still 10 instead of 8 entries in round views | LOW | Same root cause as T1. Baked JSONB in existing sessions. Clean re-seed resolves. | Needs re-test after v7 |

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C3 | Test admin ↔ teacher deck interaction | Manual test — not a code task |
| C5 | Messaging — notification notes | Deferred (needs post-session-76 versions of student dashboard, teacher students page, admin page) |

---

## Playtest punch list (updated)

| # | Description | Priority | Status |
|---|---|---|---|
| P1 | Buttons — auto-width, snug padding | LOW | ✅ DONE |
| P2 | Awaiting-approval favorite comments in student dash to-do area | MEDIUM | ✅ DONE |
| P3 | Teacher spotlight: student's own pic biggest at top | HIGH | ✅ DONE (session 75) |
| P4 | Student dash: "Your Round X Contribution" label | MEDIUM | ✅ DONE (session 75) |
| P5 | Standalone favorite comment box removed | MEDIUM | ✅ DONE (session 75) |
| P6 | Too many pics in round 1 / warmup (seeding) | MEDIUM | ✅ SQL FIX — needs clean re-seed to fully resolve |
| P7 | Missing profile pic avatar note | LOW | DROPPED — won't exist in real games |
| P8 | "No pic submitted" for round 2 | MEDIUM | DEFERRED — JUMP TO scripts need entry creation for rounds 2+ |
| P9 | Warmup leak in teacher approval queue | HIGH | ✅ DONE |
| P10 | Rotating placeholder: 2 fun + rule, stop | LOW | ✅ DONE |
| P11 | Awards fireworks — dramatic burst before finale | MEDIUM | ✅ DONE |
| P12 | 3rd place confetti/ribbons match 2nd place | MEDIUM | ✅ DONE |
| P13 | Folder structure in handoffs | N/A | DROPPED |

---

## Open bugs (updated)

| # | Description | Priority | Status |
|---|---|---|---|
| T2 | Student's own pic missing from teacher spotlight in rounds 2/3 | MEDIUM | Seeding gap — JUMP TO scripts don't create entries for the test student |
| NEW | Teacher login bypasses auth (no magic link required) | HIGH | Needs investigation — upload middleware.ts + supabase-server.ts |
| NEW | Verify resubmitEntry handles optional photo | MEDIUM | Mike to check `src/app/play/actions.ts` |
| U1 | Update favorite confirmation text to Mike's wording | LOW | Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |

---

## NEXT SESSION priorities

1. **T2 (MEDIUM)** — JUMP TO scripts need to create test student entries for rounds 2/3. Needs the JUMP TO ROUND 2/3 SQL scripts from Mike.
2. **C5 — Messaging / notification notes** — as scoped in session 74 handoff.
3. **P8 — "No pic submitted" for round 2** — same root cause as T2.
4. **Teacher auth bypass** — investigate middleware.ts + supabase-server.ts.

**Files needed from Mike (chunk 1 for T2):**
- JUMP TO ROUND 2 SQL script
- JUMP TO ROUND 3 SQL script
- JUMP TO AWARDS CEREMONY SQL script

**Files needed (chunk 2 for C5):**
- Post-session-76 versions of student dashboard, teacher students page, admin page (if changed independently)

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
