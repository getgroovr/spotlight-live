# KICKOFF — Spotlight Live (the online version)

**This is the hosted "live" build of Spotlight.** Its desktop sibling is
`spotlight-shuffle` (the Vite + React template). This app is where the features
the desktop build deliberately deferred — real accounts, an upload destination,
translation, teacher-only privacy, surfaced peer comments — actually get built.

> **Status (Slice One): the game is playable in the browser.** The full
> shuffle-stop loop runs client-side with placeholder videos, no login required,
> exactly like desktop. Accounts and uploads are the next slices.

---

## What this is built on

`spotlight-live` was forked from `groovr-creator`, the earlier online app for the
dance/matching game. That game is **archived** (kept frozen on desktop; it can't
realistically go online for music-copyright reasons). What we KEPT from it is the
generic, already-working plumbing — none of it was dance-specific:

- **Next.js 16** (App Router) + **Supabase** auth.
- Email/password **login, signup** (with an 18+ gate), and the email-confirmation
  **callback** route.
- **Session proxy** (`src/proxy.ts` — Next 16 renamed "middleware" to "proxy")
  that refreshes the session and can protect routes.
- Browser/server **Supabase client factories** (`src/lib/`).

What we REPLACED is the dance identity (GroovR branding, the neon theme, the
matching framing) with the Spotlight game.

> **Heads-up for any agent working here:** this Next.js version has real breaking
> changes vs. older training data (see `AGENTS.md`). The authoritative docs are
> bundled at `node_modules/next/dist/docs/`. Read them before writing routing,
> caching, or data-fetching code. (Already learned the hard way: `middleware` →
> `proxy`; `next/font/google` fetches at build time; client components still
> prerender, so anything that throws on missing env vars breaks the build.)

---

## How to run
1. `npm install`
2. `npm run dev` → open the printed `http://localhost:3000`.
3. The landing page (`/`) has a **Play now** button → `/play` (the game).

No `.env.local` is required for Slice One. The auth pages exist and render, but
will say accounts aren't enabled until Supabase credentials are added (see
`.env.local.example`).

---

## The files
```
spotlight-live/
├── src/
│   ├── app/
│   │   ├── page.tsx              landing → /play
│   │   ├── play/page.tsx         the game route (thin server wrapper)
│   │   ├── layout.tsx            root layout (system-font fallback; Outfit loaded in-game)
│   │   ├── globals.css
│   │   └── auth/                 login / signup / callback (Supabase — plumbing, dormant)
│   ├── game/
│   │   ├── spotlight.jsx         THE ENGINE — identical to desktop + a "use client" line
│   │   ├── students.js           CONTENT LAYER — identical to desktop
│   │   └── shell.jsx             paints the tan page bg + centers the card (was desktop main.jsx)
│   ├── lib/
│   │   ├── supabase-client.ts    returns null when unconfigured (so Slice One needs no backend)
│   │   └── supabase-server.ts    same
│   └── proxy.ts                  session refresh + route protection (no protected routes yet)
└── .env.local.example            the Supabase vars the accounts slice will need
```

**Architecture principle (carried from desktop):** the engine and content are
cleanly separated. `students.js` is the one list everything reads from;
`spotlight.jsx` is the engine. Today `students.js` is a static file with
placeholder data. The online work is to make that list come from the **database**
instead — without the engine caring where the data comes from.

---

## The road ahead (the deferred seams, now in scope)

In priority order, matching the desktop kickoff's "deferred to spotlight-social":

1. **Accounts wired into the flow.** The auth pages work; connect them to the
   game (who's playing, whose class). Reuse the same Supabase project.
2. **The upload destination — the first real problem.** A creator picks a video,
   writes the English `descriptionText`, records the `readingAudio`. These become
   rows in the database + files in storage, replacing the static `students.js`.
3. **Translation** (`descriptionL1` → English) — needs a server + a translation API.
4. **Real privacy** — teacher-only `readingAudio`, per-student visibility, enforced
   by accounts (not the desktop honor system).
5. **Roaming save/resume** — move per-machine localStorage to the account.
6. **Peer comments surfaced** — flip `SOCIAL = true` in the engine and back it with
   real data + teacher curation.

## What Slice One deliberately did NOT change
The shuffle-stop engine and the content data model are byte-identical to the
desktop build. The mechanic, the mandatory-comment gate, the CSV deliverable, the
archive model, and the dormant online seams (`SOCIAL`, `descriptionL1`,
`readingAudio`, `peerComments`) all carried over untouched — so the online build
inherits exactly the template the desktop app was designed to be.
