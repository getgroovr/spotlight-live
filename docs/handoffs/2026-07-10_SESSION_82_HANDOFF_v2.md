# Session 82 Handoff (v2)

Date: 2026-07-10

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

## What was delivered in sessions 81–82

### Chunk 1 — Teacher students page ✅ DONE (session 81)
- **Topic locking:** Past-round topic dropdowns disabled with "✓" label.
- **Class dropdown fix:** Selected class always appears even if auto-archived.
- **Files:** `class-header.tsx` → `src/app/teacher/students/class-header.tsx`, `page.tsx` → `src/app/teacher/students/page.tsx`

### Chunk 1.5 — Teacher class request flow ✅ DONE (session 81)
- Request button always visible, class name field + mode preference checkboxes.
- Zero-class state shows request form instead of error.

### Chunk 2 — Admin dashboard overhaul ✅ DONE (session 82)
- Merged rotation list with All Teachers table, ↑↓ reorder buttons.
- Collapsible teachers section.
- Enhanced Current Classes with student lists + emails.
- Game Topics section with delete capability.
- Mode preference tallies, class request approval with class name, teacher mode preferences.

### Chunk 3 — Multi-teacher SQL ✅ DONE (session 81)
- `multi-teacher-setup.sql` — confirms emails, sets roles, sets admin.

### Documentation ✅ DONE (session 82)
- **GROOVR_DEVELOPMENT_STORY.md** — narrative documentary of the app's evolution.
- **GROOVR_TECHNICAL_BLUEPRINT.md** — procedure doc: file structure, schema, setup, rebuild guide.

---

## Next build: three features, chunked

### Design decisions made in session 82

**Flexible warmup model (replaces rigid 1/3/9):**
- Admin picks how many teachers participate in the warmup. That's the one control knob.
- Each participating teacher uploads 1–3 photos (their choice).
- The grid is the total photos contributed. It wraps naturally — no forced squares.
- Examples: 3 teachers × 3 each = 9 (3×3). 4 teachers × 3 each = 12 (3×4). Mixed contributions are fine: 2+3+2+2 = 9 (3×3).
- Solo mode = admin sets teacher count to 1. Same as today.
- `warmup_teacher_count` in `admin_settings` stays — it already means "how many teachers." The change is that per-teacher photo count is no longer computed (9 ÷ teacher_count) but flexible (1–3, teacher's choice).

**Teacher celebration:**
- The warmup round already produces data about which teacher got the most favorites (most students picked their photo).
- Surface this as a teacher results screen using the existing `ResultsCeremony.tsx` component — same gold/silver/bronze, same confetti, different data source.
- Audience: teachers and admin only. Students should not see "your teacher lost" before the game starts.

**Class size request:**
- Teachers request a class size (9, 16, or 25) when requesting a new class.
- Independent of warmup teacher count. Warmup = how students discover teachers. Class size = how many students a teacher takes.
- Add `requested_capacity` to `class_requests`. Admin can approve as-is or override.

---

### Chunk A — Teacher celebration from warmup data

**What:** After warmup closes, show teachers/admin a results screen: which teacher got the most student enrollments. Reuse `ResultsCeremony.tsx` with teacher data instead of student data.

**Schema:** None. Enrollment data already exists in `enrollments`.

**Logic:** Query: per teacher, count enrolled students from the current warmup. Rank. Feed to ceremony component.

**Open question (ask Mike):** Where does this screen live? Options:
- A tab/section on the admin dashboard ("Warmup Results")
- A standalone page `/admin/warmup-results` or `/teacher/warmup-results`
- Triggered automatically when the warmup closes

**Files needed to start:**
- `src/app/student/results/ResultsCeremony.tsx` (to understand the component interface)
- `src/app/admin/admin-client.tsx` (if embedding in admin dashboard)
- `src/app/admin/actions.ts`

**Estimated effort:** Small — 1 chunk. Mostly wiring existing ceremony code to a different query.

---

### Chunk B — Flexible warmup contributions

**What:** Replace the rigid per-teacher photo limit (9 ÷ mode) with flexible 1–3 per teacher. Grid fills dynamically.

**Schema migration:**
```sql
-- Teacher deck: track max photos per teacher preference (optional)
-- Actually, no schema change needed here. The current deck already stores
-- all uploaded starters. The change is in how many can be marked "active."
-- The limit moves from a computed value (9 ÷ teacher_count) to a flat 1–3.
```

No schema migration needed. The deck's active toggle already works — the change is the activation limit logic in the deck page and the `/play` warmup loader.

**Changes:**
1. **Teacher deck (`page.tsx`, `deck-client.tsx`):** Change per-teacher limit from `9 ÷ warmup_teacher_count` to a flat max of 3 active photos. Show "1–3 photos" instead of the computed limit. Teacher decides how many to activate.
2. **Warmup loader (`deck.ts` or `/play` actions):** Instead of "grab exactly 9 photos," grab all active starters from the top N teachers (N = `warmup_teacher_count`). Grid size = total active photos from those N teachers.
3. **Spotlight/shell (`spotlight.jsx`, `shell.js`):** Grid must handle non-square counts (7, 8, 10, 11, 12...). Currently assumes 9. Compute columns dynamically: if total ≤ 9, use 3 columns. If 10–16, use 4 columns. If 17–25, use 5 columns. Or simpler: columns = ceil(sqrt(total)).
4. **Admin dashboard:** Update mode display. Instead of "Solo (9 photos) / Trio (3 each) / Full (1 each)," show "N teachers participating, X total photos in warmup grid."

**Files needed to start:**
- `src/lib/deck.ts` (warmup grid loader)
- `src/app/teacher/deck/page.tsx`
- `src/app/teacher/deck/deck-client.tsx`
- `src/app/teacher/deck/actions.ts`
- `src/game/spotlight.jsx` (grid rendering)
- `src/game/shell.js` (grid state)
- `src/app/play/actions.ts` (enrollment from warmup)
- `src/app/admin/admin-client.tsx` (mode display)

**Estimated effort:** Medium — 2 chunks. One for the deck + loader side, one for the grid rendering + admin display.

---

### Chunk C — Class size request

**What:** Teachers request a specific class size (9/16/25) when requesting a class. Admin approves or overrides.

**Schema migration:**
```sql
ALTER TABLE class_requests ADD COLUMN requested_capacity integer DEFAULT 9;
```

**Changes:**
1. **Request form (`request-class.tsx`):** Add dropdown: "Class size: 9 / 16 / 25."
2. **Request action (`actions.ts`):** Save `requested_capacity` to `class_requests`.
3. **Admin approval (`admin-client.tsx`, `actions.ts`):** Show requested capacity. Admin can approve as-is or override before creating the class. Created class uses approved capacity.

**Files needed to start:**
- `src/app/teacher/students/request-class.tsx`
- `src/app/teacher/students/actions.ts`
- `src/app/admin/admin-client.tsx`
- `src/app/admin/actions.ts`

**Estimated effort:** Small — 1 chunk.

---

### Recommended build order

**Chunk C first** (class size request) — smallest, independent, no risk to existing features. Quick win.

**Chunk A second** (teacher celebration) — small, high fun-per-effort, validates ceremony code reusability.

**Chunk B last** (flexible warmup) — largest, touches the most files, but also the most impactful. Do after C and A are stable.

---

## Carry-over priorities

| # | Description | Status |
|---|---|---|
| C3 | Test admin ↔ teacher deck interaction | Manual test — in progress |
| C6 | Teacher comment prompts (game_prompts table) | Deferred — lower priority |

---

## Open bugs (updated)

| # | Description | Priority | Status |
|---|---|---|---|
| B-AUTH | Teacher login bypasses auth (no magic link required) | HIGH | Needs investigation — upload middleware.ts + supabase-server.ts |
| B-RESUB | Verify resubmitEntry handles optional photo | MEDIUM | Mike to check `src/app/play/actions.ts` |
| B-PREEX | Verify game flow handles pre-existing entries for next round | MEDIUM | Mike to test after adding JUMP TO approve lines |
| U1 | Update favorite confirmation text to Mike's wording | LOW | Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |

---

## Ideas list

1. **Teacher approval flow in admin UI** — Currently teacher role is set via SQL only. Could add admin UI to approve/deny teacher role requests. (Surfaced session 81)
2. Auto-class-creation when class hits capacity.
3. Deployment/hosting setup guide.
4. Round gap timing UI.
5. "Party setup" holding page.
6. Incomplete mode selection warnings.
7. **Teacher game (full competition, not just celebration).** Teachers play the same game loop as students — upload photos, vote, comment, full awards. Each teacher uploads 2–3 photos, fills a grid, teachers vote on each other. Natural grid pairings: 3×3 through 5×5. Same engine, different enrollment logic. **Deferred until student game is solid at all grid sizes and Chunk A (celebration) proves the concept.** If the warmup celebration feels sufficient, this may not be needed. If teachers want more, the path is clear.

---

## Schema changes this session (session 81 — already applied)

```sql
ALTER TABLE class_requests ADD COLUMN class_name varchar(100);
ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false;
ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;
```

**Pending migrations for next build:**
```sql
-- Chunk C: class size request
ALTER TABLE class_requests ADD COLUMN requested_capacity integer DEFAULT 9;
```

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
| `teacher_rotation` | teacher_id (unique), sort_order, status, willing_trio, willing_nine | status: recruiting/waiting/paused. willing_* may be replaced by flexible warmup model (Chunk B). |
| `admin_settings` | id=1, warmup_teacher_count | Currently 1/3/9. Chunk B keeps this as "how many teachers" but removes per-teacher photo computation. |
| `classes` | id, teacher_id, name, capacity, round_topics, is_archived, archived_at | capacity default 9. Chunk C adds 16/25 options. |
| `class_requests` | id, teacher_id, status, class_name, requested_at, reviewed_by, reviewed_at, created_class_id | Chunk C adds requested_capacity. |
| `enrollments` | student_id, class_id, status | status: active |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo/trio/full, description_text, rejection_reason | selected_* columns may simplify under Chunk B. |
| `game_sessions` | id, student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason | |
| `games` | id, class_id, name, status, round_count | status: pending/active/complete |
| `game_topics` | id, topic_text, status, suggested_by, created_at | status: approved/pending. UNIQUE on topic_text. |
| `messages` | id, sender_id, recipient_id, body, is_read, created_at | |

---

## Multi-teacher testing setup

Test emails: `getgroovr@yahoo.com` (admin + teacher), `getgroovr-1@yahoo.com` (teacher), `getgroovr-2@yahoo.com` (teacher).

**Setup flow (no real email needed):**
1. Sign up each email at `localhost:3000/auth/signup` with any password
2. Run `multi-teacher-setup.sql` in Supabase SQL Editor (confirms emails + sets roles)
3. Log in at `localhost:3000/auth/login`

Use separate browsers or incognito for simultaneous sessions.

---

## Test workflow with v8 (step by step)

1. Run `all-in-one-setup-v8.sql` (creates everything fresh)
2. Run `game-topics-migration.sql` (session 78)
3. Run class archiving migration: `ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false; ALTER TABLE classes ADD COLUMN archived_at timestamptz;` (session 79)
4. Run Chunk 1.5 migration (session 81): `ALTER TABLE class_requests ADD COLUMN class_name varchar(100); ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false; ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;`
5. Run `populate-seed-voter-sessions.sql`
6. Run JUMP TO ROUND 1 (**with the approve line added**)
7. Play as Casper2 through round 1 — submit photo + favorite comment
8. Back on dashboard: round 1 entry = approved, favorite comment = awaiting approval
9. Teacher approves round 1 favorite comment
10. Run JUMP TO ROUND 2 (**with the approve line added**)
11. Play as Casper2 through round 2
12. Repeat for round 3 / awards

**To test topics / locking / archiving / messaging / class requests / admin dashboard:** See session 81 handoff test instructions (unchanged).
