import type { Metadata } from "next";
import "./globals.css";

// Spotlight uses the "Outfit" font, loaded where it's needed (the game and auth
// screens import it via CSS). The root layout keeps a neutral system-font stack
// as the fallback so there is no build-time dependency on a font CDN.
export const metadata: Metadata = {
  title: "Spotlight",
  description: "Spotlight — the shuffle-stop showcase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
