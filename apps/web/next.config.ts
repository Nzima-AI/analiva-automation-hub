import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(process.cwd(), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@aah/core", "@aah/db", "@aah/connectors", "@aah/extraction"],
  // tesseract.js spawns a worker script and loads wasm from its own package directory.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  // Bank statement CSVs are posted to a server action (Vercel caps bodies at 4.5 MB anyway).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    return [
      {
        // Everything except the document viewer, which the review screen shows in a frame.
        source: "/((?!documents/[^/]+/download).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
