# Spotlight Live — Environment Status & Build Plan

_Written at the end of the "get the environment working" session, ahead of the
upload-slice build._

## Environment: VERIFIED WORKING ✓

| Check | Result |
|---|---|
| `node` / `npm` | v22.22.2 / 10.9.7 |
| `npm install` (from lockfile) | 63 packages, clean |
| `next` version | 16.2.6 (Turbopack) |
| Bundled Next docs (`node_modules/next/dist/docs/`) | present — AGENTS.md path confirmed |
| `npm run build` | ✓ compiles 11.5s, TS passes, all 6 routes generate |
| `npm run dev` | ✓ ready in 413ms; `/`, `/play`, `/auth/login` all HTTP 200 |
| git history | intact (3 commits, HEAD = safety/moderation kickoff) |

**Note:** `node_modules` is rebuilt by `npm install` from `package-lock.json` —
it does NOT need to be shipped/uploaded. The lockfile is the source of truth.

## The 5 decisions (locked in this session)

1. **One teacher.** (Single teacher owns everything.)
2. **Multiple classes allowed**, each capped at **9 students** (the 3×3 grid is
   baked into the engine — this cap is a real invariant to enforce).
3. **One class per student** → `class_members` is no longer many-to-many; a
   student row just carries a `class_id`. Simplifies the draft data model.
4. **Creator-upload slice first** (per kickoff's "the first real problem").
5. **Teacher-created invite/roster, NOT open self-signup** — teacher owns the
   roster; students are invited. Right call for an under-18 classroom tool.
   Kills the public student-signup path.
6. **Reuse the existing Supabase project** — wire `.env.local` at the start of
   the build session.

## Key Next 16 facts confirmed from bundled docs (differ from old training data)

- **Mutations/auth use Server Actions**: `<form action={serverFn}>` +
  `useActionState`. This is the pattern for BOTH the teacher roster actions and
  the creator-upload write path.
- **"Middleware" is now "Proxy"** — `src/proxy.ts` is already written correctly.
- **Proxy must NOT be the authorization solution** — docs explicitly say it's
  for optimistic checks only. Real authz = **Supabase RLS + Server Actions**,
  not the proxy. (Important: don't put roster permission logic in proxy.ts.)
- Relevant doc files for the build:
  - `01-app/02-guides/authentication.md`
  - `01-app/02-guides/forms.md`
  - `01-app/01-getting-started/15-route-handlers.md`
  - `01-app/03-api-reference/.../proxyClientMaxBodySize.md` (upload size limits!)

## Open seams already in the code (don't rebuild — wire up)

- `SOCIAL` master switch in `spotlight.jsx` (peer comments) — stays `false` for now.
- `descriptionL1` (translation), `readingAudio` (teacher-only) — dormant fields, keep.
- `proxy.ts` `PROTECTED_PREFIXES[]` is empty — add `/dashboard`, `/upload` etc.
- `/dashboard` is referenced by login/signup/callback but **does not exist yet**
  — natural first page to create.
- Supabase client factories return `null` when env absent — callers handle null.

## Proposed build order for tomorrow (upload slice)

1. Wire `.env.local` to the existing Supabase project; confirm auth activates.
2. Apply the (revised, simplified) data model as SQL migrations + RLS policies.
   - `profiles`, `classes`, students-with-`class_id`, `entries` (with `is_live`
     archive invariant), storage buckets `videos` + `reading-audio` (RLS-locked).
   - Enforce the **9-student cap** per class.
3. Build the teacher roster flow (create class, invite/add students) — teacher-owned.
4. Build the **creator-upload UI**: pick video → write `descriptionText` →
   record `readingAudio` → writes a row to `entries` + files to storage.
5. Thin adapter: snake_case DB rows → the camelCase `STUDENTS` shape the engine
   already reads, so `spotlight.jsx` stays untouched.

## Re-share strategy (so we don't re-upload every session)

Best: **GitHub**. Repo already has git history. If pushed to GitHub, each session
= `git clone` + `npm install` and we're exactly where we left off. (Reachable
from here: github.com, codeload.github.com.) The earlier project was reportedly
on GitHub and running online — worth locating that repo to recycle/rename rather
than leave an unused project floating around.
