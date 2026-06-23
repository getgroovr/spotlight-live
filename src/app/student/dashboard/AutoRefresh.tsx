// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/dashboard/AutoRefresh.tsx   (NEW)
//
// B25: Tiny client component that calls router.refresh() on a timer so
// the student dashboard picks up teacher approvals/rejections without a
// manual F5. Renders nothing visible.
//
// Usage: drop <AutoRefresh /> anywhere inside the dashboard's server
// component tree. It mounts once and ticks until unmounted.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 25_000; // 25 seconds

export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
