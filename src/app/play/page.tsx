// /play — landing page (future browse/search page).
//
// DESTINATION: src/app/play/page.tsx   (REPLACES existing file)
//
// Session 93: With the move to /play/[teacherId], the bare /play route
// no longer loads a deck. It's a placeholder that will eventually become
// the "find a teacher" browse page (Front Door, Priority 2).
//
// For now it shows a simple holding page. If a visitor lands here without
// a teacher ID, they need a teacher's warmup link to proceed.
//
// REDIRECT-IF-ENROLLED: kept from the previous version. If someone is
// already enrolled, send them to their dashboard regardless of route.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const metadata = {
  title: "Spotlight — Find a Teacher",
};

export const dynamic = "force-dynamic";

export default async function PlayLandingPage() {
  // If this visitor is already enrolled, send them to their dashboard.
  const ssr = await createClient();
  if (ssr) {
    const { data: { user } } = await ssr.auth.getUser();
    if (user?.email) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        const admin = createServiceClient(supabaseUrl, serviceKey);
        const { data: student } = await admin
          .from("students")
          .select("id")
          .eq("email", user.email.toLowerCase())
          .maybeSingle();
        if (student) {
          redirect("/student/dashboard");
        }
      }
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#D9BE8E",
        color: "#3a2a1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px" }}>
          Spotlight
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 16px" }}>
          To play a warmup game, you need a link from a teacher.
          Ask your teacher for their Spotlight warmup link to get started.
        </p>
        <p style={{ fontSize: 13, color: "#6a4f33", lineHeight: 1.6, margin: 0 }}>
          A teacher browse page is coming soon.
        </p>
      </div>
    </div>
  );
}
