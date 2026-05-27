import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The Server Action that uploads starter photos to /teacher/deck accepts
    // files up to 8 MB. The Next.js default proxy body limit is 10 MB and
    // exceeding it silently TRUNCATES the body (no error returned). We raise
    // the limit a little above our 8 MB application cap so that the server-
    // side size check rejects oversized files cleanly instead of seeing a
    // truncated body that looks the right size.
    //
    // See node_modules/next/dist/docs/01-app/03-api-reference/05-config/
    // 01-next-config-js/proxyClientMaxBodySize.md for the truncation behavior.
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
