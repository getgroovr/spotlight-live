# SESSION 95 HANDOFF — 2026-07-18

## Session Summary

Built the teacher profile and recruiting front door. Teachers can now edit their bio, teaching style, and toggle public visibility. The `/play` route is now a browse page showing teachers with recruiting classes. Public teacher profile pages live at `/teachers/[id]`.

Updated test SQLs (all-in-one-setup v9, testing-walkthrough v17) to seed teacher profile data, set `is_recruiting`, and configure warmup titles/prompts.

Git commit commands produced for all session 93/94 work (6 commits, grouped logically).

---

## Files Changed This Session (95)

### Migration
| File | Destination |
|------|-------------|
| `20260718120000_teacher_profiles.sql` | `supabase/migrations/` |

Adds `teaching_style text` and `is_public boolean` to `profiles`. The `bio` and `avatar_url` columns already exist from the original schema.

### Browse Page (Front Door)
| File | Destination |
|------|-------------|
| `page.tsx` (play-page-v2) | `src/app/play/page.tsx` |

Replaces the "you need a link" placeholder. Shows teacher cards for anyone with `is_public = true` and at least one class with `is_recruiting = true`. Preserves redirect-if-enrolled logic from Session 93. Uses two-step queries (classes → profiles) to avoid FK naming dependency.

### Public Teacher Profile
| File | Destination |
|------|-------------|
| `page.tsx` (teachers-id) | `src/app/teachers/[id]/page.tsx` |

New route. Shows teacher name, avatar, bio, teaching style, and recruiting classes grouped by level. "Try a warmup →" buttons link to `/play/[teacherId]?level=X`.

### Teacher Profile Editor
| File | Destination |
|------|-------------|
| `page.tsx` | `src/app/teacher/profile/page.tsx` |
| `profile-form.tsx` | `src/app/teacher/profile/profile-form.tsx` |
| `actions.ts` | `src/app/teacher/profile/actions.ts` |

New route. Server page loads profile, client form uses `useActionState`. Fields: teaching style, bio, is_public toggle. Saves via service client.

### Updated Test SQLs
| File | Destination |
|------|-------------|
| `all-in-one-setup-v9.sql` | `sql/` |
| `testing-walkthrough-v17.sql` | `sql/` |

Setup v9 adds phases 3B (class recruiting + warmup config) and 3C (teacher profile). Walkthrough v17 adds migrations 5-7, tests 13-16, diagnostic 7, and updated browse-page instructions.

---

## What Still Needs to Be Done

### From Session 94 (Not Yet Verified)
1. **page_t_ss.tsx update** — Add `round_prompts` and `level` to ClassRow select, pass to ClassHeader, group students by class under collapsible headers.
2. **Deck page per-class organization** — Needs testing (the code is committed but untested).
3. **Class header per-round prompts** — Needs testing.

### From Session 95 (Not Yet Verified)
4. **Browse page** — Needs testing. Does the teacher card render? Do level buttons link correctly?
5. **Teacher profile editor** — Needs testing. Does the form save? Does is_public toggle work?
6. **Public teacher profile** — Needs testing. Does `/teachers/[id]` render for public teachers?
7. **Enrollment routing** — `enrollStudent` in `src/app/play/actions.ts` still uses the entry's hardcoded `class_id`. It needs to find a class at the right level with room.

### Future (Not Blocked)
8. **Teacher profile nav link** — The teacher dashboard needs a "Profile" link in its navigation pointing to `/teacher/profile`.
9. **Student continuation flow** — "Continue with this teacher" CTA on awards ceremony results page.
10. **Multi-teacher revival** — See section below.

---

## Multi-Teacher Revival — Design Concept (Updated)

### Core Insight
The admin is a **coordinator**, not a manager. Teachers keep full autonomy over their own classes. The multi-teacher game is a shared contribution pot.

### No Modes
The old Solo/Trio/Full mode system is gone. The 3×3 grid is now flexible — monster filler cards handle any number of real photos (minimum 3). So a multi-teacher game can have 2, 3, 4, or more teachers contributing photos. The grid uses what it gets.

Each teacher contributes photos to a shared pot. The warmup grid draws from the pot, padded with monsters if needed. No fixed teacher count required.

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

### Admin Dashboard — What Stays, What Goes
From the existing admin dashboard (Recruitment tab):

| Feature | Keep? | Notes |
|---------|-------|-------|
| Teacher list / "See teachers" | **Yes** | Shows who's participating in the multi-teacher game |
| Message board / coordination thread | **Yes** | Core coordination tool — teachers discuss, plan, join |
| Game schedule (rounds, timing, start date) | **Yes** | Coordinator sets game timing for the shared event |
| "Save & push to all classes" | **Maybe** | Useful if coordinator sets shared timing; may not be needed if teachers control their own classes |
| MODE selector (Solo/Trio/Full) | **No** | Modes are gone. Grid is flexible. |
| Rotation queue (▲/▼, Recruit, Pause, Remove) | **No** | Old concept. Teachers join voluntarily via message board. |
| Warm-up mode (Solo/Trio/Full selector) | **No** | Same as MODE — gone. |
| Game Topics | **Maybe** | Could be a shared prompt list for the multi-teacher event |

### What Was Removed in Session 93 (and Whether It's Needed Back)
| Removed | Description | Need it back? |
|---------|-------------|---------------|
| `readOnly` prop on ClassHeader | Prevented teachers from editing admin-created classes | **No** — teachers keep full control of own classes; multi-game is separate |
| `isStandardMode` prop | Toggled between standard/multi UI paths | **No** — both modes are always available, just different pages |
| `topicOptions` (string[] version) | Old topic list format | **No** — `topicOptionsWithId` covers this |
| `requestClass` action | Admin approval workflow for class creation | **No** — teachers create classes freely; multi-game join is different |
| Multi-teacher code in page_t_ss | Conditional rendering for multi mode | **No** — multi-teacher coordination happens on admin page, not teacher page |

**Verdict: Nothing removed needs to come back.** The old multi-teacher tried to manage everything with code-level permissions. The new version uses the message board for coordination and keeps the game engine change minimal.

---

## Architecture Notes

### Recruiting Flow (Per-Class)
Session 93 had recruiting per-level on profiles (`recruiting_beginner/intermediate/advanced`). Session 94 moved it to per-class (`classes.is_recruiting`). The browse page queries `classes` for `is_recruiting = true` joined to `profiles` for `is_public = true`.

### Round Topics Key "0"
`round_topics` JSONB now uses key "0" for the warmup title. Both the deck page and class header read/write this key.

### Round Prompts
`round_prompts` JSONB is parallel to `round_topics`. Key "0" = warmup prompt, keys "1","2",… = game round prompts. Saved by `saveClassSettings` on the class tab and `saveWarmupPrompt` on the deck page.

### Backward Compat
`teacher_prompt` (single string on classes) is still written by the class header form — set to the warmup prompt value. The game engine's existing `teacher_prompt` display still works without changes.

### Teacher Profile Columns
| Column | Type | Source |
|--------|------|--------|
| `bio` | text | Original schema (reused) |
| `avatar_url` | text | Original schema (reused) |
| `teaching_style` | text | Session 95 migration |
| `is_public` | boolean | Session 95 migration |

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
├── profile/
│   ├── page.tsx          — Session 95: profile edit (server component)
│   ├── profile-form.tsx  — Session 95: profile form (client component)
│   └── actions.ts        — Session 95: saveTeacherProfile action
src/app/play/
├── page.tsx              — Session 95: browse page (replaces placeholder)
├── [teacherId]/
│   └── page.tsx          — Session 93: level-aware warmup route
src/app/teachers/
├── [id]/
│   └── page.tsx          — Session 95: public teacher profile
src/app/admin/              — Dormant, intact (future multi-teacher coordinator)
src/lib/deck.ts             — Session 93: level-aware deck loader
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

---

## Files Needed for Multi-Teacher Session

To get started on the multi-teacher revival, the next session needs:

1. `src/app/admin/admin-client.tsx` — The admin dashboard client component (visible in screenshot)
2. `src/app/admin/page.tsx` — Admin page server component
3. `src/app/admin/actions.ts` (or similar) — Admin server actions
4. `src/lib/deck.ts` — The deck loader (needs multi-teacher photo sourcing)
5. Any message board / teacher coordination files (likely in admin or a shared location)
6. The current Session 95 handoff (this file)

Optional but helpful:
7. `src/app/teacher/students/page.tsx` — To understand nav patterns for adding "Profile" link
8. Database schema for `teacher_rotation`, `admin_settings`, `class_requests` tables — to understand what's dormant and reusable

---

## Working Agreement Reminders
- Whole-file replacements as downloadable files
- Don't write code that assumes unseen file contents
- Carry forward all design decisions and "what stays / what goes" tables across sessions
- Commit recommendation: good stopping point after profile/recruiting pages are verified working
