# SESSION 94 HANDOFF — 2026-07-18

## Session Summary

Major restructure of the teacher deck page and class settings. Deck page now organizes warmup photos by class within level sections (instead of by level alone). Class header gained per-round prompts and more prominent round titles. Level picker added to class creation.

**Multi-teacher revival concept proposed** (not built yet — see Future section).

---

## Files Changed This Session

### Migration
| File | Destination |
|------|-------------|
| `20260718060000_round_prompts.sql` | `supabase/migrations/` |

Adds `round_prompts jsonb` to `classes` — parallel to `round_topics`, stores per-round teacher prompts shown to students.

### Deck Page (complete overhaul)
| File | Destination |
|------|-------------|
| `actions.ts` | `src/app/teacher/deck/actions.ts` |
| `page.tsx` | `src/app/teacher/deck/page.tsx` |
| `deck-client.tsx` | `src/app/teacher/deck/deck-client.tsx` |

**Key changes:**
- Photos are now per-class (not per-level). `uploadStarter` takes `class_id` directly.
- Deck page shows level sections (Beginning/Intermediate/Advanced), each with expandable class cards.
- Each class card: recruiting toggle (per-class via `classes.is_recruiting`), warmup title (stored in `round_topics["0"]`), warmup prompt (stored in `round_prompts["0"]`), upload form, photo grid.
- "+ Add class" button per level with name, capacity, level pre-set.
- `createClassWithLevel` action creates class + game row from deck page.

### Class Tab
| File | Destination |
|------|-------------|
| `request-class.tsx` | `src/app/teacher/students/request-class.tsx` |
| `actions_t_ss.ts` | `src/app/teacher/students/actions.ts` |
| `class-header.tsx` | `src/app/teacher/students/class-header.tsx` |

**Key changes:**
- `createClassDirect` now accepts `level` parameter (defaults to "beginner").
- `saveClassSettings` reads and saves `round_prompts` JSONB. `round_topics` parsing now allows key "0" (warmup title).
- Request-class form has level picker dropdown (both prominent and compact).
- Class header: round titles toggle is now a prominent button (highlighted when configured). Round 0 (warmup) appears in the titles grid as a free-text input. Single `teacher_prompt` textarea removed and replaced by per-round prompts section under a toggle. Each round gets its own prompt text field. `teacher_prompt` hidden field bridges to warmup prompt for backward compat.

---

## What Still Needs to Be Done (This Session's Scope)

### Page_t_ss.tsx Update (student grouping)
The teacher students page needs:
1. Add `round_prompts` and `level` to the ClassRow select query
2. Pass `round_prompts` to the ClassHeader component
3. Group students by class under collapsible headers (visual treatment, not just dropdown)

This is the remaining piece of Chunk 2. The class-header's `round_prompts` prop is optional, so the page works without this update — prompts just won't pre-fill from saved data until the page passes them.

### Teacher Profile / Recruiting Page
- Public-facing teacher page with bio, teaching style
- Links to current/upcoming classes with level badges
- Shareable URL for student discovery
- Entry point to the whole student → teacher → class flow

---

## Multi-Teacher Revival — Design Concept (Not Built)

Mike proposed bringing back multi-teacher in a lean form. Key insight: the admin is a **coordinator**, not a manager. Teachers keep full autonomy over their own classes. The multi-teacher game is a shared contribution pot.

### How It Works
1. A teacher with 2+ teachers wanting to play together becomes an admin/coordinator
2. Admin creates a multi-teacher game on the admin dashboard
3. Admin invites teachers via the message board (already built)
4. Each teacher contributes up to 3 photos (warmup + 2 rounds)
5. Students see a mix of all teachers' photos
6. All coordination happens on the admin message board — no code-level permission management

### Changes Required for Multi-Teacher
- **Game engine:** `loadTeacherDeck` needs to pull photos from multiple teachers (join table: teacher ↔ multi-game)
- **Admin dashboard:** Already exists dormant at `src/app/admin/`. Needs invite flow and shared game schedule.
- **Teacher dashboard:** Two new links: "Join multi-teacher game" and "Request admin role" — both navigate to admin dashboard.
- **Database:** `app_mode` flag, `admin_settings`, `class_requests` tables all still exist.

### What Was Removed in Session 93 (and Whether It's Needed Back)
| Removed | Description | Need it back? |
|---------|-------------|---------------|
| `readOnly` prop on ClassHeader | Prevented teachers from editing admin-created classes | **No** — teachers keep full control of own classes; multi-game is separate |
| `isStandardMode` prop | Toggled between standard/multi UI paths | **No** — both modes are always available, just different pages |
| `topicOptions` (string[] version) | Old topic list format | **No** — `topicOptionsWithId` covers this |
| `requestClass` action | Admin approval workflow for class creation | **No** — teachers create classes freely; multi-game join is different |
| Multi-teacher code in page_t_ss | Conditional rendering for multi mode | **No** — multi-teacher coordination happens on admin page, not teacher page |

**Verdict: Nothing removed needs to come back.** The old multi-teacher tried to manage everything with code-level permissions. The new version uses the message board for coordination and keeps the game engine change minimal (allow multiple teacher contributors).

---

## Architecture Notes

### Recruiting Flow (Per-Class)
Session 93 had recruiting per-level on profiles (`recruiting_beginner/intermediate/advanced`). Session 94 moved it to per-class (`classes.is_recruiting`). The browse/find page (when built) should query `classes` for `is_recruiting = true` instead of profiles.

### Round Topics Key "0"
`round_topics` JSONB now uses key "0" for the warmup title. Both the deck page and class header read/write this key. The deck page saves it via `saveWarmupTitle` action. The class header includes it in the form submission.

### Round Prompts
`round_prompts` JSONB is parallel to `round_topics`. Key "0" = warmup prompt, keys "1","2",… = game round prompts. Saved by `saveClassSettings` on the class tab and `saveWarmupPrompt` on the deck page.

### Backward Compat
`teacher_prompt` (single string on classes) is still written by the class header form — set to the warmup prompt value. This means the game engine's existing `teacher_prompt` display still works without changes.

---

## Key File Locations (Current State)

```
src/app/teacher/
├── deck/
│   ├── page.tsx          — Session 94: per-class deck, level sections
│   ├── deck-client.tsx   — Session 94: class cards with warmup title/prompt
│   └── actions.ts        — Session 94: per-class upload, class-level recruiting
├── students/
│   ├── page.tsx          — Session 93 (needs round_prompts update)
│   ├── class-header.tsx  — Session 94: prominent titles, per-round prompts
│   ├── request-class.tsx — Session 94: level picker
│   └── actions.ts        — Session 94: level on createClassDirect, round_prompts
src/app/admin/              — Dormant, intact (future multi-teacher coordinator)
src/lib/deck.ts             — Session 93: level-aware deck loader (no changes needed)
```

---

## Working Agreement Reminders
- Whole-file replacements as downloadable files
- Don't write code that assumes unseen file contents
- Commit recommendation: good stopping point after class-header + deck overhaul are verified working
