# Slice 1A — manual steps for Mike

After reviewing and pushing the code in this branch, run these in the
Supabase SQL editor against the `groovr-creator` project. Both are idempotent
where possible; both are safe to re-run.

## 1. Apply migration 10

The file `supabase/migrations/20260527120000_public_decks_and_starters.sql`.
Paste its full contents into the SQL editor and run. This adds:

- `classes.is_public` (default false)
- `entries.is_starter` (default false)
- An amended one-live-per-student partial unique index that ignores starters
- Read policies on `entries` and `classes` for anon + authenticated, scoped
  to live rows in public classes only

## 2. Create the public deck (the "demo" class) and find its id

You only need to do this once. Replace `<YOUR_TEACHER_PROFILE_ID>` with your
own profile's uuid (the one auto-created from `auth.users` when you signed
up). You can find it with:

```sql
select id, role from public.profiles where role = 'teacher';
```

Then create the class:

```sql
insert into public.classes (teacher_id, name, is_public)
values (
  '<YOUR_TEACHER_PROFILE_ID>',
  'Spotlight — Front Door',
  true
)
returning id;
```

That `returning id` will spit out the new class id. **Copy it.** You'll
paste it into `.env.local` in the next step. (We could let the app discover
the public class at request time via `select id from classes where is_public`,
and in fact the adapter does exactly that as a fallback — but having the id
pinned in env makes local dev predictable and makes the eventual teacher
upload UI's redirects unambiguous.)

## 3. Wire the class id into env

Add to `.env.local`:

```
NEXT_PUBLIC_DEMO_CLASS_ID=<the_uuid_you_just_copied>
```

That's it for env. Storage URLs are signed using the anon client at request
time — the RLS in migration 10 lets anon visitors read media files for any
class marked `is_public = true`. No service-role key needed.

## 4. Upload the nine starter photos

Open the running app, sign in as your teacher account, navigate to
`/teacher/deck`. Drag in nine photos one at a time, write a description for
each, click submit. The page shows the current pool and won't let `/play`
start the public deck until the pool reaches nine.

That's it — once nine are in, `/play` is live for everyone.

## A note on rollback

If you ever want to undo this migration:

```sql
drop policy if exists "entries: read public deck (anon)"          on public.entries;
drop policy if exists "entries: read public deck (authenticated)" on public.entries;
drop policy if exists "classes: read public (anon)"               on public.classes;
drop policy if exists "classes: read public (authenticated)"      on public.classes;
drop policy if exists "media: read public-class (anon)"           on storage.objects;
drop policy if exists "media: read public-class (authenticated)"  on storage.objects;
drop policy if exists "media: owner or teacher deletes"           on storage.objects;

drop index if exists public.entries_one_live_per_student_class;
create unique index entries_one_live_per_student_class
  on public.entries (student_id, class_id)
  where status = 'live';

alter table public.entries drop column if exists is_starter;
alter table public.classes drop column if exists is_public;
```
