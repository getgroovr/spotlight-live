# Spotlight Live — Slice 1A handoff #3 (verification FAILED at the known risk point)

Public repo: https://github.com/getgroovr/spotlight-live.git
Branch: `slice-1a`
Last good commit: `3dcba33` — "Slice 1A: generic deck reads from DB; teacher upload UI; photo rendering"
(No new commits since handoff #2. The doc edit below is uncommitted working copy.)

## TL;DR for kickoff
Slice 1A is code-complete and was verified end-to-end **up to the last step**.
Nine starter photos uploaded fine via `/teacher/deck`, all nine rows confirmed
in the DB. Then the final test — anonymous visitor viewing `/play` — **failed
in exactly the spot handoff #2 flagged as the untested assumption.** No photos
render for the anon visitor, in either the shuffle/start screen or the reveal.

So the first real work of this session is **fixing the anon image path**, not
more verification. This was anticipated; it is not a surprise and not a
regression. It's the known risk landing.

## What's confirmed working (don't re-verify)
- ✅ Migration 10 applied in Supabase (`ilctdtppstvmpvuvdqvf`, "groovr-creator").
- ✅ Teacher account exists and is promoted to `role = 'teacher'`.
  Teacher profile id: `18f23db0-0b2f-4f30-914a-233c3a73c305`.
- ✅ Public class exists. Class id: `d9ce91d4-793f-4ed9-81ea-201c0d15602e`.
- ✅ `.env.local` correct (publishable anon key, no service-role key,
  demo class id set).
- ✅ Teacher upload UI at `/teacher/deck` works — nine photos uploaded with
  descriptions.
- ✅ All nine starter rows present in `public.entries` (confirmed via SQL).
  `media_url` holds a storage object key shaped like
  `<class_id>/<teacher_profile_id>/<filename>`, not a full URL — which is
  the expected input for `createSignedUrl`.

## What FAILED (this session's job to fix)
- ❌ **Anonymous `/play` renders zero photos.** Tested in an Edge InPrivate
  window (no auth cookies = true anonymous visitor). Photos do not appear on
  the start/shuffle screen OR on the reveal. Descriptions/flow otherwise load;
  it's specifically the images.
- This is the untested assumption from handoff #2: anon `createSignedUrl`
  against the private bucket, in `src/lib/deck.ts` at the `createSignedUrl`
  call. RLS in migration 10 was supposed to authorize this; it does not appear
  to (or the signing itself is failing for the anon role).

### First moves to diagnose (do this before picking a fix)
1. In the InPrivate `/play`, open DevTools → Network and Console. Look at what
   the image requests actually return — 400/403 from the signed-URL endpoint?
   Empty/again-null `media_url`? A signing error logged server-side?
2. Check whether `createSignedUrl` is returning an error vs. returning a URL
   that then 403s on fetch. Those point at different fixes:
   - Signing call itself errors for anon → the anon role can't sign at all
     against a private bucket (likely). Fallback A or B below.
   - Signing succeeds but the URL 403s → storage RLS / bucket policy issue.
3. Confirm the bucket is private and check its storage RLS policies in the
   Supabase dashboard (Storage → policies).

### Fallback options (from handoff #2, still the right menu)
- **A. Pre-sign at upload time** and store the signed URL on the entries row.
  Simplest mental model; downside is signed URLs expire, so this works for a
  demo but needs a refresh story long-term.
- **B. Service-role-signed path for the public deck only.** Sign server-side
  with the service-role key in a narrow, read-only Server Action scoped to the
  public class. Keeps the bucket private; never exposes the key to the client.
  Note this *changes* the "no service-role key" decision from the original
  handoff — discuss with Mike before committing, since `.env.local` currently
  has `SUPABASE_SERVICE_ROLE_KEY=` intentionally empty.
- **C. (Worth considering) public-read bucket for starter media only.** If the
  starter deck is genuinely public content anyway, a public bucket sidesteps
  signing entirely. Only viable if product is OK with the images being
  world-readable by URL. Decide with Mike.

Recommendation: diagnose first (step 1–3), then bring Mike the specific cause
plus a recommended option rather than picking blind. The choice touches a
locked-in decision (no service-role key), so it's a Mike conversation.

## Deferred UX improvements (NOT this session — capture, don't build)
These came up during verification. They're real and worth doing, but they are
Slice 1A polish / future work, and the broken anon image path comes first.

1. **Describe-after-preview on upload.** Right now the teacher (and later, the
   student) writes the description *before* seeing the uploaded photo render.
   With unnamed files it's easy to mismatch text to the wrong image. Better
   flow: upload → photo renders → type/edit the description underneath the
   visible photo. Lower stakes for students (one photo each) but still a nicer
   interaction, and it lets the teacher fix the demo deck's descriptions too.
   (Today's workaround: remove and re-upload with the right text.)
2. **Comment panel overlaps the photo on `/play`.** When the student profile /
   comment UI appears, it pops up *on top of* the picture. It should sit to the
   side so the photo stays visible while the student is commenting — they need
   to see what they're describing. Move it beside the image, not over it.

## Carried-over loose threads (from handoff #2)
1. **Handoff SQL snippet fixed (uncommitted).** The "Quick reference: useful
   SQL" starter-entries query referenced `created_at`, which doesn't exist on
   `public.entries`. The real timestamp column is `uploaded_at`. Fixed in the
   working copy of the handoff doc; not yet committed. Note: `entries` has NO
   `created_at` column at all — grep the codebase/docs for any other
   `entries.created_at` reference.
2. **Rollback block in `SLICE_1A_MANUAL_STEPS.md` is incomplete.** Recreates the
   original unique index `where status = 'live'` with no `is_starter` carve-out;
   if starter rows exist at rollback time the index creation fails (multiple
   live rows share `(student_id, class_id)`). Fix: add
   `delete from public.entries where is_starter = true;` before the index
   recreation. Not urgent.
3. **`entries_public` view dependency is implicit.** Both `deck.ts` and the
   migration assume the view exposes `class_id` and `status` and omits
   `reading_audio_url`. Worth a SCHEMA_AUDIT entry pinning the expected column
   list. (Relevant now — if the fix touches how anon reads media, double-check
   what the view exposes.)

## Decisions still locked in (don't re-litigate)
- Anonymous visitors must be able to play the generic deck. *(This is exactly
  what's broken — the requirement stands, the implementation needs fixing.)*
- Photos, not videos, for the demo deck.
- 3-second soft timer beat for photo display.
- Nine-or-nothing for `/play`.
- `/teacher/deck` is the durable workflow, not throwaway seed plumbing.
- "SSR Supabase client signs URLs, no service-role key" — **this is the
  decision now under pressure.** If the fix needs the service role (option B),
  this decision changes and must be re-decided with Mike, not silently.

## After Slice 1A finally passes → Slice 1B
Per BUILD_PLAN:
- Logged-in user plays → write a `sessions` row at session start and
  `session_comments` rows as they comment.
- Unique `(session_id, entry_id)` means re-commenting updates the same row.
- **Open question for start of 1B**: for not-yet-signed-up visitors, either
  (a) hold comments in browser memory and hydrate on signup at the end, or
  (b) require signup before playing.

## Working agreement reminders
- Mike holds: editor, Supabase dashboard, all keys, all pushes.
- Claude holds: code, design, migrations, RLS, Server Actions, UI.
- Claude never handles real keys, never pushes on Mike's behalf.
- Build in named slices; Mike reviews every commit in Source Control before
  pushing.
- The product is an English-teaching instrument whose purpose is to collect
  each student's language production for teacher evaluation.

## Current DB state (for reference)
- Project: `ilctdtppstvmpvuvdqvf` ("groovr-creator")
- Teacher profile: `18f23db0-0b2f-4f30-914a-233c3a73c305`
- Public class: `d9ce91d4-793f-4ed9-81ea-201c0d15602e`
- 9 starter entries in that class (`is_starter = true`), media uploaded,
  descriptions present.

## Quick reference: useful SQL
```sql
-- All profiles
select id, role, created_at from public.profiles order by created_at;

-- Public classes (should show one row)
select id, teacher_id, name, is_public, created_at
from public.classes where is_public = true;

-- Starter entries in the public class (should show 9)
select id, media_url, description_text, uploaded_at
from public.entries
where class_id = 'd9ce91d4-793f-4ed9-81ea-201c0d15602e'
  and is_starter = true
order by uploaded_at;
```

## Quick reference: useful PowerShell
```powershell
cd C:\Users\Myked\projects\spotlight-live
Get-Content .env.local
$env:GIT_PAGER = "cat"
git show 3dcba33:path/to/file > review.txt
```
