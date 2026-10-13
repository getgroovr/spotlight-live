# Session 74 Handoff

Date: 2026-07-04

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

---

## What was delivered in session 74

### C4 — Class request workflow ✅ DONE
Teacher can click "Request new class" on their class page. Admin sees Approve/Deny buttons in the "Requested" column of the All Teachers table. Approve auto-creates a class named "Class N" with capacity 9. One pending request per teacher at a time. Button hides if teacher is at max_classes.

**Migration:** `20260704000000_class_requests_table.sql` → goes in `supabase/migrations/`

**Files delivered:**
- `src/app/admin/page.tsx` (REPLACES — adds ClassRequestRow type + query)
- `src/app/admin/admin-client.tsx` (REPLACES — Requested column now functional with Approve/Deny)
- `src/app/admin/actions.ts` (REPLACES — adds approveClassRequest, denyClassRequest)
- `src/app/teacher/students/page.tsx` (REPLACES — adds "Request new class" button)
- `src/app/teacher/students/request-class.tsx` (NEW — button client component)
- `src/app/teacher/students/request-actions.ts` (NEW — server action for requesting)

### Column names confirmed
- `entries.rejection_reason` (not `teacher_note`)
- `game_sessions.favorite_comment_rejection_reason`

### B75 — Awards seeding ✅ FIXED (confirmed by Mike)
Playing correctly now with 4,3,2 favorite comments per round.

---

## Schema: new table

| Table | Key columns | Notes |
|-------|-------------|-------|
| `class_requests` | id, teacher_id, status, requested_at, reviewed_by, reviewed_at, admin_note, created_class_id | status: 'pending'/'approved'/'denied' |

---

## Multi-teacher testing setup

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

## NEXT SESSION: Messaging (notification notes)

Mike confirmed: notification notes, not full inbox.

**Design:** A `notifications` table. Teachers/admin can send short notes to students (and vice versa). Notes appear as a badge/list on the recipient's dashboard. No threading — just one-way notes with read/unread.

**Files needed from Mike:**
1. `src/app/teacher/students/page.tsx` (post-C4 version, once confirmed working)
2. `src/app/student/dashboard/page.tsx`
3. `src/app/admin/admin-client.tsx` (post-C4)
4. `src/app/admin/page.tsx` (post-C4)
5. This handoff

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C1 | Fix /play route for mode-aware deck loading | Needs `src/lib/deck.ts` |
| C3 | Test admin ↔ teacher deck interaction | Manual test — not a code task |
| C5 | Messaging — notification notes | NEXT PRIORITY |

---

## Open bugs

| # | Description | Priority | Status |
|---|---|---|---|
| NEW | Teacher login bypasses auth (no magic link required) | HIGH | Needs investigation — upload middleware.ts + supabase-server.ts |
| NEW | Verify resubmitEntry handles optional photo | MEDIUM | Mike to check `src/app/play/actions.ts` |
| C1 | `/play` route queries `is_active` instead of mode columns | MEDIUM | Needs `src/lib/deck.ts` |
| U1 | Update favorite confirmation text to Mike's wording | LOW | Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |

---

## Teacher spreadsheet overhaul — DEFERRED

Column names now confirmed (`rejection_reason`, `favorite_comment_rejection_reason`). Ready to build when Mike wants it. Existing export route.ts already uploaded.

---

## Current schema highlights

| Table | Key columns | Notes |
|-------|-------------|-------|
| `profiles` | id, role, display_name, username, max_classes, is_admin, is_archived | role: teacher/student |
| `teacher_rotation` | teacher_id (unique), sort_order, status | status: recruiting/waiting/paused |
| `admin_settings` | id=1, warmup_teacher_count | 1/3/9 |
| `classes` | id, teacher_id, name, capacity | capacity default 9 |
| `class_requests` | id, teacher_id, status, requested_at, reviewed_by, reviewed_at, created_class_id | NEW session 74 |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete |

---

## Known Tailwind issue (ONGOING)

Tailwind grid-cols-N does NOT compile. All multi-column layouts MUST use inline styles:
```jsx
style={{ display: "grid", gridTemplateColumns: "repeat(N, 1fr)" }}
```

---

## Ideas list

1. Admin dashboard — C4 done. Still needs: archived class count, spreadsheet archiving.
2. Messaging — notification notes. NEXT.
3. Auto-class-creation — when class hits capacity.
4. Deployment/hosting setup guide.
5. Round gap timing UI.
6. "Party setup" holding page.
7. Incomplete mode selection warnings.
8. Teacher spreadsheet overhaul — deferred, ready to build.
