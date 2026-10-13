# SESSION 97 HANDOFF — 2026-07-19

## Session Summary

Session 97 began multi-teacher dashboard work but course-corrected after identifying a persistent design misunderstanding that had been carried through sessions 96 and earlier. The "shared photo pot" concept was **wrong** and has been fully removed from this handoff. The correct multi-teacher design is documented below.

Session 97 also produced three files for `/teacher/multi` (actions, page, client) based on the wrong pot model. **Those files should be discarded** — they are not usable. The corrected design below is the starting point for the next session.

Session 96 cleanup work remains valid and unchanged.

---

## ⚠️ CRITICAL DESIGN CORRECTION — READ FIRST

**There is no shared photo pot. There never was. Do not build one.**

Previous handoffs described multi-teacher as "teachers contributing photos to a shared pot that gets shuffled into a mixed deck." This is wrong and has been corrected multiple times. The actual design:

**A multi-teacher game is a game that multiple teachers play together.** One teacher creates the game (topic, rounds, timing, their starting pictures). Other teachers join the game and upload their own starting pictures. Once at least 3 teachers have joined and uploaded pictures (at least for round 1), the game can begin. Students can join the game too, but students only comment on the teachers' pictures — students don't upload photos.

This is how single-teacher games already work, just with multiple teachers participating instead of one. Each teacher has their own photos. There is no mixing, shuffling, or shared pot.

**Code built on the wrong premise:**
- `loadMultiTeacherDeck()` in `src/lib/deck.ts` — fetches from multiple teachers and shuffles into a pot. **Wrong.** Needs to be rethought or removed.
- `src/app/play/[teacherId]/page.tsx` — warmup wiring that loads from "shared pot" when `app_mode = "multi"`. **Wrong.** Needs to be rethought.
- Session 97 files (`src/app/teacher/multi/actions.ts`, `page.tsx`, `multi-client.tsx`) — built on the pot model. **Discard entirely.**

---

## Files Changed This Session (96 — still valid)

### Admin Dashboard Cleanup
| File | Destination |
|------|-------------|
| `admin-client.tsx` | `src/app/admin/admin-client.tsx` |
| `page.tsx` (admin) | `src/app/admin/page.tsx` |
| `actions.ts` (admin) | `src/app/admin/actions.ts` |

Removed from Recruitment tab: warm-up control section, game schedule section (with "Save & push to all classes"), mode column and max-classes editing in teacher table. Teacher coordination thread moved to standalone section. Removed actions: `updateWarmupMode`, `saveGameSchedule`, `updateMaxClasses`. Removed types: `WarmupConfig`, `GameSchedule`. Removed `willing_trio`/`willing_nine` from `TeacherRow`.

### Teacher Dashboard — Class Header
| File | Destination |
|------|-------------|
| `class-header.tsx` | `src/app/teacher/students/class-header.tsx` |

Time model flipped: teacher picks **Round time** (total duration) and **Review time**; **Play time** is calculated (round − review). Review options auto-filter. "Rounds" → "Student rounds" with total note. "Round 1" → "Student round 1" in both titles and prompts.

### Teacher Dashboard — Deck Page
| File | Destination |
|------|-------------|
| `deck-client.tsx` | `src/app/teacher/deck/deck-client.tsx` |

Removed "Your name" display field (redundant with `/teacher/profile`). `initialDisplayName` prop made optional so server page doesn't break.

### Game Engine — Deck Loader
| File | Destination |
|------|-------------|
| `deck.ts` | `src/lib/deck.ts` |

Added `loadMultiTeacherDeck(teacherIds, level?)` — **this was built on the wrong "shared pot" model and needs to be reworked.** Also added `getActiveRotationTeacherIds()` and `getAppMode()` helpers. Refactored shared internals (`getSupabase`, `resolvePublicUrl`, `startersToEngineStudents`).

### Warmup Page — Multi-Teacher Wiring
| File | Destination |
|------|-------------|
| `page_p_t_id.tsx` | `src/app/play/[teacherId]/page.tsx` |

When `app_mode = "multi"`, loads from "shared pot" via `loadMultiTeacherDeck`. **This was built on the wrong model and needs to be reworked.**

### Updated Test SQL
| File | Destination |
|------|-------------|
| `testing-walkthrough-v18.sql` | `sql/` |

Updated tests 6, 7, 15, 16 for session 96 changes. Updated diagnostic 6.

---

## What Still Needs to Be Done

### From Sessions 94–95 (Not Yet Verified)
1. **page_t_ss.tsx update** — Add `round_prompts` and `level` to ClassRow select, pass to ClassHeader, group students by class under collapsible headers.
2. **Deck page per-class organization** — Needs testing.
3. **Browse page** — Needs testing. Do teacher cards render? Do level buttons link?
4. **Teacher profile editor** — Needs testing. Does form save? Does is_public toggle work?
5. **Public teacher profile** — Needs testing. Does `/teachers/[id]` render?
6. **Enrollment routing** — `enrollStudent` in `src/app/play/actions.ts` still uses hardcoded `class_id`. Needs to find a class at the right level with room.

### From Session 96 (Not Yet Verified)
7. **Admin cleanup** — Does the simplified admin dashboard render? Teacher queue without mode/max columns?
8. **Class header labels** — Do "Student rounds", "Round time", "Play time" display correctly?
9. **Deck page** — Is "Your name" gone?

### From Session 96 (Built on Wrong Premise — Needs Rework)
10. **`deck.ts` multi-teacher loader** — `loadMultiTeacherDeck` shuffles photos into a pot. Needs to be redesigned for the correct game-based model.
11. **Warmup page multi wiring** — `page_p_t_id.tsx` loads from pot. Needs to be redesigned.

### Decided But Not Yet Built
12. **Remove rotation queue entirely** — The rotation queue has no purpose with modes gone. The `teacher_rotation` table may still be useful but the admin UI queue (sort order, pause/resume) should go.
13. **Multi-teacher dashboard** — See corrected design section below. Needs to be built from scratch.
14. **Teacher profile nav link** — Teacher dashboard needs a "Profile" link to `/teacher/profile`.
15. **Student continuation flow** — "Continue with this teacher" CTA on awards ceremony.

---

## Multi-Teacher — Corrected Design (Session 97)

### What a Multi-Teacher Game Actually Is

A multi-teacher game works the same way a single-teacher game works, except multiple teachers participate. Here is exactly how it works:

**Creating a game:**
1. A teacher goes to `/teacher/multi` and creates a new game.
2. They set: **topic**, **number of rounds**, **round timing** (round time, review time).
3. They upload their **starting pictures** — at minimum, pictures for round 1.
4. The game is now listed as "forming" — waiting for other teachers to join.

**Joining a game:**
1. Other teachers browse `/teacher/multi` and see available games (topic, timing, who created it, how many teachers have joined so far).
2. A teacher clicks "Join" on a game they want to participate in.
3. After joining, they upload **their own starting pictures** for the game.
4. Each teacher has their own pictures. Pictures are not mixed or shuffled between teachers.

**Starting the game:**
1. The game requires **at least 3 teachers** who have joined **and** uploaded their pictures (at least for round 1).
2. Once the minimum is met, the game can begin (either automatically or the creator starts it).

**Students in the game:**
1. Students can join the game.
2. Students **only comment on the teachers' pictures** — they do not upload their own photos.
3. This is the core difference from a single-teacher game where students might upload their own work.

**What each teacher controls independently:**
- Their own starting pictures for the game
- Nothing else changes about their classes, their other games, or their schedule

**What is shared:**
- The game definition (topic, rounds, timing)
- The fact that multiple teachers are participating
- Students can see and comment on any participating teacher's pictures within that game

### What This Means for the UI

**`/teacher/multi` should show:**
- A "Create game" flow (topic, rounds, timing, upload pictures)
- A list of available games to join (with topic, creator, participant count, status)
- For games the teacher has joined: their uploaded pictures, other participants, game status
- A way to leave a game before it starts

**This is NOT:**
- A shared photo pot where photos get mixed together
- A general "opt in to multi-teacher mode" toggle
- A warmup grid that shows shuffled photos from multiple teachers
- Anything involving the admin choosing who participates

### Database Design

The old `teacher_rotation` table was a queue, not a game. Multi-teacher needs proper game entities:

**Option: New tables (recommended)**
```
multi_teacher_games
  id            uuid primary key
  topic         text not null
  total_rounds  integer not null
  round_duration_hours  numeric
  game_phase_hours      numeric
  review_phase_hours    numeric
  created_by    uuid references profiles(id)
  status        text default 'forming'   -- forming | ready | active | complete
  created_at    timestamptz default now()

multi_teacher_participants
  id            uuid primary key
  game_id       uuid references multi_teacher_games(id)
  teacher_id    uuid references profiles(id)
  joined_at     timestamptz default now()
  unique(game_id, teacher_id)

multi_teacher_photos
  id            uuid primary key
  game_id       uuid references multi_teacher_games(id)
  teacher_id    uuid references profiles(id)
  media_url     text not null
  description_text  text
  round_number  integer default 1
  is_active     boolean default true
  created_at    timestamptz default now()
```

Students joining multi-teacher games and commenting on photos will also need a table, but that can be designed when the student-side flow is built.

The existing `teacher_rotation` table can be dropped or left dormant once the rotation queue UI is removed from the admin page.

### What the Admin Page Becomes

With multi-teacher moving to its own route with its own data model, the admin page options are:

1. **Keep it dormant** — `/admin` just shows the "Switch to Multi" landing.
2. **Repurpose it** — `/admin` becomes a read-only oversight dashboard for multi-teacher games.
3. **Remove it** — Everything moves to `/teacher/multi` and the admin route goes away.

Decision still needed.

---

## Architecture Notes (Carried Forward)

### Recruiting Flow (Per-Class)
Teachers control `is_recruiting` per class and `is_public` on their profile. The browse page at `/play` queries `classes` for `is_recruiting = true` joined to `profiles` for `is_public = true`. No admin involvement.

### Round Topics Key "0"
`round_topics` JSONB uses key "0" for the warmup title. Both the deck page and class header read/write this key.

### Round Prompts
`round_prompts` JSONB is parallel to `round_topics`. Key "0" = warmup prompt, keys "1","2",… = student round prompts.

### Time Model (Session 96)
Teacher picks **Round time** (total duration per round) and **Review time**. **Play time** = Round time − Review time (calculated, shown to teacher). Hidden form fields still send `round_duration_hours`, `game_phase_hours` (= play time), and `review_phase_hours` to the server action.

### Teacher Profile Columns
| Column | Type | Source |
|--------|------|--------|
| `bio` | text | Original schema |
| `avatar_url` | text | Original schema |
| `teaching_style` | text | Session 95 migration |
| `is_public` | boolean | Session 95 migration |

---

## Key File Locations (Current State)

```
src/app/teacher/
├── deck/
│   ├── page.tsx          — Session 94: per-class deck, level sections
│   ├── deck-client.tsx   — Session 96: removed "Your name"
│   └── actions.ts        — Session 94: per-class upload, class-level recruiting
├── students/
│   ├── page.tsx          — Session 93 (needs round_prompts update)
│   ├── class-header.tsx  — Session 96: student rounds, round time, play time
│   ├── request-class.tsx — Session 94: level picker
│   └── actions.ts        — Session 94: level on createClassDirect, round_prompts
├── profile/
│   ├── page.tsx          — Session 95: profile edit (server component)
│   ├── profile-form.tsx  — Session 95: profile form (client component)
│   └── actions.ts        — Session 95: saveTeacherProfile action
├── multi/                — NOT YET BUILT (session 97 files were wrong, discarded)
src/app/play/
├── page.tsx              — Session 95: browse page
├── [teacherId]/
│   └── page.tsx          — Session 96: has multi-teacher wiring BUILT ON WRONG MODEL
src/app/teachers/
├── [id]/
│   └── page.tsx          — Session 95: public teacher profile
src/app/admin/
│   ├── page.tsx          — Session 96: simplified (no warmup/schedule)
│   ├── admin-client.tsx  — Session 96: simplified (rotation queue still present, marked for removal)
│   └── actions.ts        — Session 96: removed mode/schedule actions
src/lib/deck.ts           — Session 96: has loadMultiTeacherDeck BUILT ON WRONG MODEL
```

---

## Migrations to Run (Cumulative, In Order)

All safe to re-run:
1. `migration-session67.sql` — Dual-role + settings
2. `20260625140000_b59_game_sessions_unique.sql` — Session unique constraint
3. `20260702130000_teacher_archiving.sql` — Archiving support
4. `20260703000000_auth_user_lookup_rpc.sql` — Auth-lookup RPC
5. `20260717200000_migration_session93_levels.sql` — Level column + recruiting
6. `20260718060000_round_prompts.sql` — Per-round prompts JSONB
7. `20260718120000_teacher_profiles.sql` — Teacher profile browse columns

**New migration needed next session:** `multi_teacher_games`, `multi_teacher_participants`, `multi_teacher_photos` tables.

---

## Files Needed for Next Session

To build the multi-teacher dashboard correctly:

1. This handoff document
2. `src/app/teacher/deck/deck-client.tsx` — Reference for photo upload UI patterns
3. `src/app/teacher/deck/actions.ts` — Reference for photo upload server actions
4. `src/app/teacher/students/class-header.tsx` — Reference for game setup UI (topic, rounds, timing)
5. `src/app/admin/admin-client.tsx` — To remove the rotation queue
6. `src/app/admin/actions.ts` — To remove rotation actions

---

## Working Agreement Reminders
- Whole-file replacements as downloadable files
- Don't write code that assumes unseen file contents
- Carry forward all design decisions across sessions
- **There is no shared photo pot — teachers post games, other teachers join and upload their own photos, students comment on teacher photos**
- Multi-teacher is a separate route (`/teacher/multi`), not the admin page
- Recruiting (for single-teacher classes) doesn't need admin coordination — teachers control their own
- The rotation queue should be removed from the admin page
