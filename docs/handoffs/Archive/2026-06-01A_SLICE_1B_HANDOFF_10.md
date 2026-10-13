# SLICE 1B HANDOFF #10 — Parked I shipped + Parked G (custom email domain) in flight

**Date written:** 2026-06-01 (mid-morning)
**Picking up from:** Handoff #9 (Parked B/K/D cleared; multi-cohort plan doc written)
**Going into:** Finish Parked G (custom email sender via Resend) once DNS verifies,
  then the remaining forks. One item shipped this session, one is mid-setup
  waiting on DNS propagation.
**Destination for this file:** `docs/handoffs/` (same place as prior handoffs).

---

## TL;DR for next Claude

1. **Parked I (cohort CSV export) is DONE — committed + pushed.** Live-tested:
   clicked Export CSV, got `spotlight-cohort-2026-06-01.csv`, opened clean with
   correct columns. Top commit should be **"slice 1B: cohort CSV export
   (Parked I)"**.
2. **Parked G (custom email sender domain) is IN FLIGHT.** All four Resend DNS
   records are entered in Namecheap and saved. Resend has *seen* them ("DNS
   verified" milestone) but the domain was still **Pending** final verification
   at pause — Resend warned Namecheap propagation can take a few hours. **This
   is a waiting game, not a bug.**
3. **Git should be CLEAN and PUSHED.** `slice-1a` == `origin/slice-1a`. Verify
   first thing.
4. No active code bugs. App compiles/runs (~138 VS Code "Problems" = the same
   pre-existing type-checker noise; not ours).

**Mike's expected first move:** confirm git state, then check whether Resend has
flipped `getgroovr.com` to **Verified**. If yes → finish G (Supabase SMTP +
test). If still pending → wait, or pick another fork.

---

## What got accomplished this session

### ✅ Parked I — Cohort CSV export (DONE, committed + pushed)

A teacher button that downloads the class roster as a CSV.

**Two files:**
- **NEW:** `src/app/teacher/students/export/route.ts` — a GET route handler that
  streams the cohort as a `.csv` attachment. Plain `<a>` link triggers it; no
  client JS, no new dependency.
- **EDITED:** `src/app/teacher/students/page.tsx` — added an "↓ Export CSV" link
  in the header (shown only when the class has students). Everything else
  byte-for-byte unchanged.

**How it works / decisions baked in:**
- Auth + ownership scoping **mirrors the existing page exactly**: read the user
  with the SSR client (`auth.uid()` from cookies), then service client for the
  joins, every query scoped to `classes` the teacher owns. A logged-in
  non-owner gets a 404, never another teacher's roster.
- **Speaks TODAY's schema, not the plan doc's.** Targets `classes` /
  `enrollments` / `game_sessions` / `teacher_comments` — NOT the future
  `cohort_id` model. When the multi-cohort arc lands, this route gets
  generalized along with everything else.
- One row per enrollment. Columns: Student, Real name, Email, Class, Round,
  Enrolled (UTC), Completed (UTC), Comments made, Favorite comment, Profile
  finished, Teacher notes (concatenated, oldest-first, tagged by round).
- UTF-8 BOM so Excel reads accents; RFC-4180 quoting; one `game_sessions` query
  per enrollment (fine at cohort scale).

**Live test passed:** Export CSV → downloaded `spotlight-cohort-2026-06-01.csv`,
opened in editor, header + 2 data rows present. Both students show as "Mike"
(Mike + test student both used that name — expected, per #9).

**Decision recorded — the "nicer report" is a SEPARATE, LATER piece:**
Mike asked the right question: can this carry the pics / be something a teacher
uses to evaluate *language development*? Answer worked through:
- A CSV **cannot** carry images (plain text). Photos live in a private bucket
  behind 1-hour signed URLs, so even photo *links* in a saved CSV would die fast.
- Evaluating language development is a **reading** task (photo + their actual
  words + your notes), not a spreadsheet task. The right artifact is a
  **per-student report** — HTML/PDF or XLSX-with-thumbnails — that can embed pics.
- That report wants **Round 2** data underneath it (Round 2 is when the student
  produces their *own* language: uploads a photo, writes a description, gets
  peer comments). Round 1 only has reactions to bait pics + teacher notes.
- **Conclusion (Mike chose "A"):** ship the CSV now as the plain-data/backup
  export (done); defer the nice evaluation report to ride **with Round 2**.
  This re-shapes Parked I's old "someday nicer version" — it's no longer a loose
  end, it's slotted next to Round 2.

### 🟡 Parked G — Custom email sender domain (IN FLIGHT, waiting on DNS)

**Goal:** stop Supabase Auth emails (magic links, confirm-signup) sending from
`noreply@mail.app.supabase.io` — poor deliverability (Yahoo spam) and a ~3–4/hr
rate limit. Send from **`getgroovr.com`** via **Resend** SMTP instead.

**Done this session:**
- **Domain un-suspended.** `getgroovr.com` (Namecheap, registrant Michael
  Dorsten, expires May 11 2027) was **suspended for contacts verification** at
  session start. Mike completed verification → domain reinstated. DNS confirmed
  live (`nslookup` returns Namecheap nameservers `dns1`/`dns2.registrar-servers.com`;
  Nameservers = "Namecheap BasicDNS").
- **Resend account created** (free tier, `getgroovr@yahoo.com`). Domain
  `getgroovr.com` added in Resend; region **North Virginia (us-east-1)**.
- **All four DNS records entered in Namecheap Advanced DNS and SAVED:**

  | # | Resend "section" | Namecheap Type | Host | Value | Notes |
  |---|---|---|---|---|---|
  | 1 | DKIM | TXT | `resend._domainkey` | `p=MIGfMA0...QIDAQAB` | full value ends `QIDAQAB` ✓ |
  | 2 | SPF  | TXT | `send` | `v=spf1 include:amazonses.com ~all` | confirmed full value vs Resend tooltip ✓ |
  | 3 | DMARC| TXT | `_dmarc` | `v=DMARC1; p=none;` | ✓ |
  | 4 | SPF  | MX  | `send` | `feedback-smtp.us-east-1.amazonses.com`, priority `10` | see MX gotcha below |

**Current Resend status (at pause, ~7:30 AM):** domain **Pending**. Timeline:
"Domain added" (6:52) → "DNS verified" (7:29, Resend found the records) →
"Verifying domain" (7:29, spinner). DKIM row shows Pending. Banner: *"Looking
for DNS records: This may take a few hours depending on Namecheap's propagation
time."* **Records are correct and seen — just waiting on final verification.**

---

## ⚠️ Namecheap DNS gotchas (hard-won this session — read before touching DNS again)

- **Namecheap's "Add New Record" type dropdown has NO "SPF" or "DKIM" option** —
  those are *purposes*, not record types. DKIM, SPF, and DMARC are all **TXT**.
- **There is NO "MX Record" in that dropdown either.** When Mail Settings is set
  to **"Email Forwarding"**, Namecheap hides manual MX. To add the MX:
  switch **Mail Settings → "Custom MX"**, which reveals a **dedicated MX entry
  row lower on the page** (Host / Mail Server / Priority). That row IS the MX —
  you don't use the type dropdown for it. Priority `10` must be typed manually.
- **Host field wants the RELATIVE part only** (`resend._domainkey`, `send`,
  `_dmarc`) — do NOT append `.getgroovr.com`; Namecheap appends the domain
  automatically. (Doubling → `...getgroovr.com.getgroovr.com` = broken.)
- **Copy long values, don't type them** (DKIM `p=...`, SPF). One wrong char
  kills verification. (Mike lost the copy button on DMARC and hand-typed it —
  but `v=DMARC1; p=none;` is short and verified fine.)
- **Leave-alone records that do NOT conflict** (different hosts): `CNAME www →
  parkingpage.namecheap.com`; `URL Redirect @ → http://www.getgroovr.com/`.
  There was also a locked forwarding SPF on `@`
  (`v=spf1 include:spf.efwd.registrar-servers.com ~all`) under Email Forwarding;
  switching to Custom MX may remove it — harmless either way, since Resend's
  records live on the `send` host, not `@`.

---

## Remaining steps to FINISH Parked G (once Resend shows Verified/green)

1. **Confirm Resend domain status → Verified** (all records green). Re-check the
   Resend Domains page; can click re-verify to nudge. May take a few hours.
2. **Wire Supabase to Resend SMTP.** Cleanest path is the **native
   Resend↔Supabase integration** — it auto-creates the API key and fills
   Supabase's SMTP settings, so the key is never hand-copied (good: Claude never
   touches it; Mike never has to paste it). Manual fallback: Supabase Dashboard
   → Authentication → Emails → **SMTP Settings → Enable Custom SMTP**, enter
   Resend's host/port/user/pass.
3. **Set sender:** `noreply@getgroovr.com` / name "Spotlight" (or similar).
4. **Test ONE magic link** to a real address; confirm it lands in the **inbox
   (not spam)** and is **from getgroovr.com**. Test sparingly — magic links are
   rate-limited (~3–4/email/hr, 429) on the default sender; custom SMTP lifts
   that, but don't burn sends before it's live.
5. **No template re-edit needed.** The Magic Link + Confirm-signup *templates*
   were fixed in #9 (Parked B/K) and still point at `/auth/confirm` with correct
   `type` params. Custom SMTP changes the *transport/sender*, not the templates.

> Mike holds all keys and the Supabase dashboard. Claude does NOT enter keys or
> push. Walk Mike through dashboard steps; have him paste/screenshot what each
> screen shows.

---

## Where things stand right now

### Working & committed & pushed
- /play game loop, email-only enrollment; magic link → /auth/confirm → profile
- Student profile (finish-joining, per-round view, per-photo teacher notes)
- Teacher dashboard: cohort grid + student detail + per-photo notes
- Returning-student login; teacher password-login redirect (→ /teacher/students)
- Both email templates correct (Magic Link + Confirm signup)
- **NEW:** cohort CSV export (Parked I) — route + grid button
- All migrations + RLS through `20260531120000_teacher_comments_per_photo.sql`

### Git
- Expected: `slice-1a` == `origin/slice-1a`, clean. Top commit **"slice 1B:
  cohort CSV export (Parked I)"**, then "docs: multi-cohort entry + Round 2
  planning doc" (`6dca0e1`), then `8bde714` (Parked D). **Verify with the
  commands below** (hash of the new top commit wasn't captured — confirm live).

### Not done
- **G** — finish (Supabase SMTP + test) once Resend verifies. ← nearest task.
- The multi-cohort entry + Round 2 arc (the big build; plan doc covers it).
- The nicer per-student evaluation report (rides with Round 2).
- Remaining small parked items: H (deferred), F/G(receiving) far future.

---

## Parked items — UPDATED

- ~~**B / D / K**~~ — DONE (#9).
- ~~**Parked I: cohort export**~~ — DONE this session (CSV). The "nicer
  evaluation report" (pics, readable, language-development) is deferred to ride
  **with Round 2**; it'd be HTML/PDF or XLSX-with-thumbnails. Re-shaped, not loose.
- **Parked G: custom email sender domain** — IN FLIGHT. All DNS records in
  Namecheap; Resend pending verification. Resume at "confirm verified → Supabase
  SMTP → test." (xlsx/pdf skills exist if the nicer report gets built later.)
- **Parked C / C+ / E / J** — folded into the multi-cohort + Round 2 plan doc
  (`PLAN_multi_cohort_entry_and_round2.md`, in `docs/`, re-attached to chats).
  Untouched this session.
- **Parked H: multi-teacher storage RLS** — still parked. Needs a 2nd teacher +
  a multi-owner entry deck, which needs the big arc first. (Mike noted he can
  fake a 2nd teacher with another email — useful for testing the arc *later*,
  not for unblocking H now.)
- **Parked F: payments** — far future; card data never touches our DB.

---

## Working agreement (unchanged — still all valid)

- Mike holds: editor, Supabase dashboard, all keys, all pushes, all
  Namecheap/Resend dashboards. Claude never handles real keys, never pushes.
- **Whole-file artifacts delivered as DOWNLOADABLE FILES** with the full
  destination path in the top comment. Mike stages on Desktop, copies into
  `C:\Users\Myked\projects\spotlight-live` — the copy-into-project step is
  manual and only takes effect once it's in the PROJECT folder (NOT the Desktop
  `spotlight-live` staging folder). Always restate path + rename + folder.
- Download filenames renamed to avoid collisions (many `page.tsx`/`route.ts`).
- New routes need a NEW FOLDER (folders = routes in Next.js).
- Routes are off the ROOT (`/teacher/students`, `/student/login`, `/play`,
  etc.) — **never** under `/dashboard`. Say "clear the whole address bar."
- Commit messages go in the **VS Code Source Control MESSAGE BOX** (not terminal).
- **Dashboard email templates: check the URL before saving** (Magic Link
  `.../magic-link-or-otp` vs Confirm signup `.../confirm-sign-up`).
- Mike isn't fluent in JS/TS but IS confident at Supabase dashboard/SQL and
  comfortable in registrar dashboards. Point to files in the VS Code tree.
- Screenshots first when something's weird — decisive. Move to EVIDENCE fast.
- **His asides are usually the right call** — the whole multi-cohort model came
  from them, and the "can this CSV evaluate language development?" aside this
  session correctly re-shaped Parked I.
- Watch his clock and PIVOT TO WRITING THE HANDOFF before he's out of gas.
- Magic links rate-limited on Supabase free tier (~3–4/email/hr, 429) — verify
  fixes by reading code first; spend a send only on a verified fix. (Custom SMTP
  via Resend lifts this once G lands.)

---

## First-message-to-next-Claude

Read this whole doc first. Don't open `PLAN_multi_cohort_entry_and_round2.md`
unless/until Mike wants the big arc — it's reference, not entry context.

Mike's machine: Windows + VS Code, PowerShell, project at
`C:\Users\Myked\projects\spotlight-live`, branch `slice-1a`. Prefers downloadable
whole files he copies into the project himself (Desktop → project folder).

**Before anything, confirm git state:**
```powershell
cd C:\Users\Myked\projects\spotlight-live
git status
git log --oneline -5
```
Expected: working tree clean, `slice-1a` == `origin/slice-1a`, top commit
"slice 1B: cohort CSV export (Parked I)".

**Then offer the fork — don't open with "what do you want to work on?":**
- **Finish Parked G** (nearest task). First check if Resend has verified
  `getgroovr.com`. If **Verified** → wire Supabase custom SMTP (native
  Resend↔Supabase integration), set sender `noreply@getgroovr.com`, send one
  test magic link, confirm inbox-not-spam. If **still pending** → it's just
  Namecheap propagation; wait or pick another fork.
- **The big arc** — multi-cohort entry + Round 2 (read the plan doc; start with
  slice 1, cohorts foundation, which begins by READING the current
  classes/enrollments schema — already captured: `classes`, `enrollments`,
  `game_sessions`, `teacher_comments`, etc.).
- **H** stays deferred until a 2nd teacher + multi-owner deck is real.

His asides are usually the right call — listen for them.
