# SESSION 96 HANDOFF — 2026-07-19

## Session Summary

Two areas of work: cleanup of existing dashboards, and groundwork for multi-teacher.

**Cleanup:** Removed warmup mode controls, mode column, max-classes editing, and centralized game schedule from the admin dashboard. Simplified the teacher rotation queue to just show active class counts. Renamed "Game time" → "Round time" on the class header, added calculated "Play time", and relabeled rounds as "Student round 1" etc. to distinguish from the warmup. Removed "Your name" from the deck page (redundant with teacher profile). Wired the warmup page to detect multi-teacher mode and load from the shared photo pot.

**Multi-teacher design:** Significant design discussion. The rotation queue is marked for removal — it was built for the old mode system where an admin chose who recruits. With modes gone, it has no purpose. Multi-teacher should be a separate experience (not the admin page), probably a dedicated route like `/teacher/multi` where teachers opt into shared games. Details below.

---

## Files Changed This Session (96)

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

Added `loadMultiTeacherDeck(teacherIds, level?)` — fetches starter photos from all provided teachers, shuffles into a shared pot, picks up to 9. Added `getActiveRotationTeacherIds()` and `getAppMode()` helpers. Refactored shared internals (`getSupabase`, `resolvePublicUrl`, `startersToEngineStudents`).

### Warmup Page — Multi-Teacher Wiring
| File | Destination |
|------|-------------|
| `page_p_t_id.tsx` | `src/app/play/[teacherId]/page.tsx` |

When `app_mode = "multi"`, loads from shared pot via `loadMultiTeacherDeck`. Entry teacher always included even if not in rotation. Falls back to `loadTeacherDeck` in standard mode.

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
10. **Multi-teacher warmup** — Does `app_mode = "multi"` load the shared pot?

### Decided But Not Yet Built
11. **Remove rotation queue entirely** — The rotation queue has no purpose with modes gone. Teachers should opt in/out of multi-teacher games themselves.
12. **Multi-teacher as separate route** — See design section below.
13. **Teacher profile nav link** — Teacher dashboard needs a "Profile" link to `/teacher/profile`.
14. **Student continuation flow** — "Continue with this teacher" CTA on awards ceremony.

---

## Multi-Teacher — Revised Design (Session 96)

### Key Design Decisions Made

**The rotation queue should be removed.** It was built so an admin could decide who recruits and in what order (top N positions = "recruiting" based on mode slots). With modes gone, the queue has no purpose. Teachers recruit students directly through the browse page — no admin gatekeeper needed.

**Recruiting doesn't need coordination.** Each teacher already controls `is_recruiting` on their classes and `is_public` on their profile. Students find them on the browse page. No admin approval needed. Teachers can start and stop recruiting whenever they want.

**Multi-teacher should be a separate page, not the admin dashboard.** The admin page was built for the old mode system. Multi-teacher deserves its own route where teachers browse and join shared games. Think of it as a variant of the teacher dashboard scoped to collaborative play.

### Proposed Architecture

**New route: `/teacher/multi`** (or `/multi`)
- A teacher-facing dashboard for multi-teacher games
- Similar layout to the teacher dashboard (Class/Deck tabs)
- Teachers browse available multi-teacher games and opt in
- Each teacher contributes photos to the shared pot
- Teachers see who else is contributing and how many photos are in the pot

**What a multi-teacher "game" is:**
this was incorrect.  this are my words from previous chats: 
the warmup should NOT load all warm up pics- it should only load those from 
the class from which they come.  the teacher deck has the pics loaded by class now...  
and the student chose the class, so... only those pics from the class.




**How teachers join:**
- A teacher creates a multi-teacher game from `/teacher/multi` (becomes the coordinator)
- Other teachers see it listed and click "Join"
- Joining = opting to have your starter photos included in the shared pot
- No approval needed — if you join, your photos go in

**What stays from the admin dashboard:**
- Teacher coordination thread (messaging between participants)
- Game topics (shared topic list for the multi-teacher event)
- Oversight (stats about the shared game)

**What goes:**
- Rotation queue (replaced by simple join/leave)
- Mode selector (modes are gone)
- Centralized game schedule (teachers control their own)
- "Save & push to all classes" (teachers manage their own classes)
- Max classes per teacher (no admin limits)

### What the Admin Page Becomes

With the rotation queue removed and multi-teacher moving to its own page, the admin page becomes minimal. Options:

1. **Keep it dormant** — `/admin` just shows "Switch to Multi" landing. Multi-teacher coordination lives at `/teacher/multi`.
2. **Repurpose it** — `/admin` becomes the oversight dashboard for multi-teacher games (read-only stats, no controls).
3. **Remove it** — Everything moves to `/teacher/multi` and the admin route goes away.

Decision needed next session.

### Database Implications

The multi-teacher game needs a way to track which teachers are participating. Options:

1. **Reuse `teacher_rotation`** — Already tracks teacher participation. Just rename conceptually from "rotation" to "participation." Remove `sort_order` (ordering doesn't matter) and `willing_trio`/`willing_nine` (modes gone).
2. **New table** — `multi_teacher_games` (id, name, created_by) + `multi_teacher_participants` (game_id, teacher_id, joined_at). Cleaner but more migration work.
3. **Simple flag on profiles** — `is_multi_participant boolean`. Simplest but doesn't support multiple concurrent multi-teacher games.

The `teacher_rotation` table already exists and works. Simplest path is option 1: reuse it, treat it as a participation list rather than a queue.

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
src/app/play/
├── page.tsx              — Session 95: browse page
├── [teacherId]/
│   └── page.tsx          — Session 96: multi-teacher deck loading
src/app/teachers/
├── [id]/
│   └── page.tsx          — Session 95: public teacher profile
src/app/admin/
│   ├── page.tsx          — Session 96: simplified (no warmup/schedule)
│   ├── admin-client.tsx  — Session 96: simplified (rotation queue next to remove)
│   └── actions.ts        — Session 96: removed mode/schedule actions
src/lib/deck.ts           — Session 96: single + multi-teacher loaders
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

No new migrations this session.

---

## Files Needed for Next Session

To continue with multi-teacher:

1. This handoff document
2. `src/app/admin/admin-client.tsx` — To remove the rotation queue
3. `src/app/admin/actions.ts` — To remove rotation actions
4. `src/app/teacher/students/page.tsx` — To understand nav patterns for adding "Profile" and "Multi" links

To start building the multi-teacher dashboard:
5. `src/app/teacher/deck/deck-client.tsx` — As a reference for the multi-teacher variant
6. `src/lib/deck.ts` — For the multi-teacher loader

---

## Working Agreement Reminders
- Whole-file replacements as downloadable files
- Don't write code that assumes unseen file contents
- Carry forward all design decisions across sessions
- The rotation queue should be removed next session
- Multi-teacher is a separate route, not the admin page
- Recruiting doesn't need admin coordination — teachers control their own
