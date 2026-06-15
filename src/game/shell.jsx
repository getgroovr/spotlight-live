"use client";

import { useEffect } from "react";
import App from "./spotlight.jsx";

// Centers the self-contained Spotlight card on the warm tan page background.
// Ported from the desktop main.jsx Shell: same light/warm theme, but here it
// only paints the page background while mounted and restores it on unmount, so
// it doesn't bleed into the (dark-themed) auth pages that share this app.
//
// initialStudents (optional): forwarded to the engine. The /play Server
// Component fetches the deck and passes it in; if omitted, the engine falls
// back to its built-in STUDENTS sample data so local dev without env vars
// still works.
//
// mode (optional): "visitor" (default, /play) or "student" (/student/play).
// In student mode, the end-of-round flow saves comments via saveStudentRound
// instead of triggering enrollment via enrollStudent. See B3 fix (#39).
/**
 * @param {{ initialStudents?: unknown[], mode?: "visitor" | "student" }} props
 */
export default function GameShell({ initialStudents, mode } = {}) {
  useEffect(() => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    // Remember what we're overriding so we can put it back when leaving /play.
    const prev = {
      htmlBg: htmlEl.style.background,
      htmlScheme: htmlEl.style.colorScheme,
      bodyBg: bodyEl.style.background,
      bodyMargin: bodyEl.style.margin,
    };
    htmlEl.style.background = "#D9BE8E";
    htmlEl.style.colorScheme = "light";
    bodyEl.style.background = "#D9BE8E";
    bodyEl.style.margin = "0";
    return () => {
      htmlEl.style.background = prev.htmlBg;
      htmlEl.style.colorScheme = prev.htmlScheme;
      bodyEl.style.background = prev.bodyBg;
      bodyEl.style.margin = prev.bodyMargin;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
        background: "#D9BE8E",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        <App initialStudents={initialStudents} mode={mode} />
      </div>
    </div>
  );
}
