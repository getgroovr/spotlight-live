# Spotlight Live

The hosted version of **Spotlight**, the shuffle-stop showcase game. Desktop
sibling: `spotlight-shuffle`. See `KICKOFF_SPOTLIGHT_LIVE.md` for the full story,
architecture, and roadmap.

## Quick start
```bash
npm install
npm run dev      # open the printed http://localhost:3000, click "Play now"
```
The game at `/play` is fully playable with no account and no backend.

Built on Next.js 16 + Supabase (auth plumbing reused from the archived
groovr-creator app). **Note:** this Next.js version has breaking changes vs.
older docs — read `node_modules/next/dist/docs/` and `AGENTS.md` first.
