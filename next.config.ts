import type { NextConfig } from "next";

// Comma-separated list of origins allowed to embed this dashboard in an iframe.
// Example: "https://portal.rightanswers.com,https://qa-develop.rightanswers.com"
// Defaults to "'self'" (no cross-origin embedding) when not set.
const frameAncestors = process.env.EMBED_FRAME_ANCESTORS
  ? `'self' ${process.env.EMBED_FRAME_ANCESTORS.split(",").map((s) => s.trim()).join(" ")}`
  : "'self'";

const nextConfig: NextConfig = {
  experimental: {
    // A week of exports is 15 CSVs, well past the 1MB default. Set above the
    // upload action's own 60MB cap so multipart overhead cannot make the framework
    // error fire first; the action's friendlier message is the one users should see.
    serverActions: { bodySizeLimit: "64mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Allow specified origins to embed this app in an iframe.
          // X-Frame-Options is the legacy header; CSP frame-ancestors takes
          // precedence in modern browsers and supports multiple origins.
          { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` },
          { key: "X-Frame-Options", value: frameAncestors === "'self'" ? "SAMEORIGIN" : "ALLOWALL" },
        ],
      },
    ];
  },
};

export default nextConfig;
