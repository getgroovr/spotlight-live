# Spotlight Live — database schema

SQL migrations for the `groovr-creator` Supabase project (reused per
`BUILD_PLAN.md`). Built as **migration files**, not hand-clicked in the Table
Editor, so code and DB never drift and there's a record of every change.

## Apply

The repo owner runs these against the linked project (keys stay on their
machine — never in the repo or chat):

```bash
# one-time, from the repo root, after `supabase link`:
supabase db push          # applies supabase/migrations/* in timestamp order
supabase seed buckets     # provisions the buckets declared in config.toml
```

Local dev:

```bash
supabase start            # spins up Postgres + Storage, seeds buckets from config.toml
supabase db reset         # re-applies all migrations from scratch
```

## Migrations (in order)

| File | What it builds |
|------|----------------|
| `…001_profiles_and_roles` | `profiles` adapted (role `teacher`\|`student`, `color`, `bio`, `is_18_plus`); auto-provision trigger on `auth.users`. |
| `…002_classes_and_cap` | `classes` (teacher-owned deck); `profiles.class_id` (one class per student); **9-student cap** trigger. |
| `…003_entries` | The heart. `media_url`+`media_type` (photo\|video), the `status` state machine (`pending`\|`live`\|`archived`), **one-live-per-student-per-class** partial unique index, teacher-only `reading_audio_url`. |
| `…004_peer_comments_and_reports` | `peer_comments` (dormant until `SOCIAL`) + `reports`, both on the shared moderation `status` pattern. |
| `…005_sessions_and_csv` | `sessions` + `session_comments` — the CSV deliverable's real home. |
| `…006_functions` | RLS helpers (`is_teacher`, `owns_class`, `my_class_id`) + `approve_entry()` (the archive rule, atomic). |
| `…007_rls_policies` | Row-Level Security on every table; `entries_public` view that drops teacher-only audio. |
| `…008_storage_buckets` | `media` (classmate-readable) + `reading-audio` (teacher-only) buckets and their storage RLS. |

## How it maps to the engine (no engine changes)

A query of "all students in class X, each with their entries newest-first"
reconstructs the exact `STUDENTS` array `spotlight.jsx` reads. A thin adapter
maps snake_case → the engine's camelCase:

| DB | engine (`students.js`) |
|----|------------------------|
| `profiles.display_name / color / bio` | student `name / color / bio` |
| `entries.media_url` | `entry.primary` |
| `entries.description_url` | `entry.description` (optional legacy video) |
| `entries.description_text` | `entry.descriptionText` |
| `entries.description_l1` | `entry.descriptionL1` (dormant) |
| `entries.reading_audio_url` | `entry.readingAudio` (teacher-only) |
| `entries.uploaded_at` | `entry.uploadedAt` |
| `peer_comments` | `student.peerComments[]` |
| `sessions` + `session_comments` | `buildSessionRows()` → the CSV |

The game reads the **`entries_public` view** (no `reading_audio_url`); only
teacher tools read the base `entries` table.

## Invariants enforced in the DB (not the UI)

- **≤ 9 students per class** — `enforce_class_cap()` trigger.
- **Exactly one `live` entry per student per class** — partial unique index.
- **The archive rule** — `approve_entry()` archives the old live entry and
  promotes the pending one atomically; each description stays welded to its
  own entry forever.
- **Teacher-only audio** — `entries_public` view + `reading-audio` bucket RLS.
- **Upload-approval gate** — students can only insert `status='pending'`; only
  the owning teacher can promote to `live`.

## Validation

All eight migrations apply cleanly on Postgres 16, and a functional test suite
verifies the cap, the one-live invariant, the `approve_entry` archive rule, the
teacher-only-audio view, and CSV reconstruction. See the chat log / project
notes for the harness.
