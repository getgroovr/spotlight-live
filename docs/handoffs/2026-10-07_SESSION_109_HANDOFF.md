# Session 111 Handoff — 2026-10-07

**Status:** Project resumed contact after ~2 months offline. Supabase project is paused/suspended. No code has changed since Session 110 (2026-08-05). This session was discovery and planning only — no code was touched, no Supabase project was reached, nothing was deployed.

**Where the deeper material lives:** A companion living document has the full project history, database schema, tech stack, "what's not yet built," key gotchas, and a value assessment of the project:
https://claude.ai/code/artifact/f1e8158c-58b3-4f4a-a1c5-b64acda73f97
This handoff is the condensed, action-oriented version — read it first, go to the companion doc for depth.

---

## First Message to Next Claude

If you're picking this up fresh, open with something like:

> "I'm resuming the Groovr project. Read the attached handoff (Session 111) in full before doing anything. My priority right now is: (1) get Supabase running again, (2) set up a keep-alive ping so it doesn't pause again, (3) build the new Dance Mode feature described in Step 3. I'm not pursuing the Multi-Teacher Showcase completion or the payments/business layer right now — those are parked. Ask me to connect GitHub and Supabase before you do anything that needs them."

---

## What Happened in Session 111 (this session)

- Reviewed six source documents Mike had saved from the original build (Build Guide, Development Story, Technical Blueprint, Multi-Teacher Game Design, File Tree, Screenshot Walkthrough). No live access to GitHub or Supabase was available this session.
- Produced a companion living document covering project history, architecture, schema, status, and a value assessment of the project as it stands.
- Diagnosed why the app is offline: the Supabase project paused itself after inactivity (normal free-tier behavior, not data loss) — nothing is actually broken.
- Worked through what killed the original dance-game concept (real copyrighted music, no licensing) and landed on a redesigned, copyright-safer version — see Step 3 below.
- Decided the scope for what comes next (below), deliberately narrowed to avoid the overwhelm that stalled the project last time.

## Scope Decision — Read This Before Building Anything

**Pursue now:** the Standard Game (the one-operator class/game flow already built) plus the new **Dance Mode**. This is the part Mike can run and test himself, solo, without needing real students or a classroom.

**Parked, not abandoned:** finishing the Multi-Teacher Showcase (student play page, reveal ceremony, lifecycle automation — phases 4–8 of 8 were never built), and the entire business/licensing layer (Stripe, subscriptions, tenant isolation — described in the project history as "Model A" and "Model B"). Don't suggest reviving these unless Mike brings them up.

**Applies regardless of direction:** Supabase, GitHub, and Vercel are shared infrastructure. Steps 1 and 2 below have to happen no matter what gets built next.

---

## Step 1 — Resume Supabase

1. Log into supabase.com with the account that owns the project.
2. Open the organization, then the paused project (likely named `spotlight-live` or `groovr`).
3. Click **Resume project** and confirm. Takes a few minutes.
4. Go to **Project Settings → API**, copy the Project URL and the `anon` public key.
5. Compare against Vercel's **Settings → Environment Variables** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Should match; confirm.
6. Trigger a fresh Vercel deploy (push a small commit, or **Deployments → Redeploy**) to confirm the pipeline still works.
7. Log in to the live app with **password login, not magic link** (free tier is rate-limited to ~3–4 magic links per address per hour):
   - Teacher/admin: `getgroovr@yahoo.com`
   - Student: `myked70@yahoo.com`
8. Check **Storage → `teacher-deck`** to confirm the photo files are still there.
9. In the SQL Editor, run, in order: `all-in-one-setup-v9.sql` → `populate-seed-voter-sessions.sql` → a `jump-to-round-*.sql` script (or `fast-path-results.sql` to jump straight to the awards ceremony) to confirm the game loop still works end to end.

If anything in 4–9 doesn't match expectations, stop and figure out why before building anything new — it likely means something changed since Session 110.

## Step 2 — Set Up the Keep-Alive Ping

Goal: something runs automatically every few days and makes one trivial request against the database, so the project never again goes 7 days without activity (that 7-day window is what triggers the free-tier pause).

**Option A — GitHub Actions (recommended):**
1. Add `.github/workflows/keepalive.yml` to the repo.
2. Schedule it every 3 days, plus a manual trigger for testing.
3. Job step: `curl` a trivial read from the Supabase REST API (e.g. `select id limit 1` from `admin_settings`).
4. Store the Supabase anon key as a GitHub Actions secret — never commit it directly.
5. Push, then manually run the workflow once to confirm success before trusting the schedule.

**Option B — free external ping service (simpler, no YAML):**
1. Add a small API route to the Next.js app (e.g. `src/app/api/keepalive/route.ts`) that runs a trivial Supabase query and returns `200 OK`.
2. Deploy it.
3. Point a free scheduler (e.g. cron-job.org) at that URL, every 3 days.

Either option removes the single point of failure that caused the pause last time: remembering to do it manually.

## Step 3 — Build the Dance Mode

Full backstory and legal reasoning are in the companion doc's "New Direction: The Dance Mode" section. Short version of why this design: the original dance-game concept died because using real copyrighted songs audibly, stored and distributed through the app, needs a music license the project never had. The redesign avoids that entirely rather than working around it:

1. **Strip audio client-side, before upload.** The recorded video's audio track is removed on the user's own device, before anything reaches the server. This is the detail that keeps the whole feature legally clean — not optional, not a later step.
2. **Tag the song as text, not audio.** Simplest: the dancer types the song name. More rigorous (optional, later): on-device audio fingerprinting (e.g. ACRCloud, AudD) run on the original audio before stripping, so the tag is verified rather than self-reported.
3. **Reuse the existing engine.** The shuffle-stop grid in `src/game/spotlight.jsx` already does the viewing/reveal mechanic this needs — this is a third mode alongside Standard and Multi-Teacher, not a new app. Reveal screen shows the song credit.
4. **Optional: connect a streaming account.** A "play on Spotify" button on the reveal screen, using Spotify's own API, starts the matched track on the viewer's own authenticated, already-licensed account. Falls back to just showing the song name if they don't connect one.
5. **Before this goes beyond friends-and-family testing:** get the "audio never touches our servers, even transiently" claim in step 1 actually checked by someone who knows media/copyright law, and check Spotify's current developer terms before building step 4.

---

## Reference

**Test accounts:**
- Teacher/Admin: `getgroovr@yahoo.com` (`is_admin = true`)
- Student: `myked70@yahoo.com` (screen name Casper2)
- Seed accounts: `seed-voter-1` through `8` @test.local, `seed-teacher-1` through `4` @test.local

**Key gotchas (full list in the companion doc):**
- Tailwind `grid-cols-N` doesn't compile — inline `gridTemplateColumns` styles only.
- Magic-link rate limit ~3–4/hour on free tier — use password login for testing.
- Resume state lives in `localStorage`, not the database — clear DevTools storage, not just DB rows, to fully reset a student.
- `colorScheme: "light"` on the root element — without it, Edge InPrivate renders dark.

**Repo:** `getgroovr/spotlight-live` (private, GitHub, deployed via Vercel). Local working copy historically at `C:\Users\Myked\projects\spotlight-live` on Mike's machine.

---

*End of Session 111 handoff. Session 112 starts at Step 1 above.*
