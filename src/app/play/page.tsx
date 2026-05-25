// /play — the playable Spotlight game route.
//
// SLICE ONE: the game runs entirely client-side with placeholder videos, no
// login required (same as the desktop build). This page is a thin Server
// Component wrapper; all the interactivity lives in the GameShell client
// component below it. Accounts, uploads, and serving real student videos from
// the database come in the next slices.
import GameShell from "@/game/shell";

export const metadata = {
  title: "Spotlight — Play",
};

export default function PlayPage() {
  return <GameShell />;
}
