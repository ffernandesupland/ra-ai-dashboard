import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A week of exports is 15 CSVs, well past the 1MB default. Set above the
    // upload action's own 60MB cap so multipart overhead cannot make the framework
    // error fire first; the action's friendlier message is the one users should see.
    serverActions: { bodySizeLimit: "64mb" },
  },
};

export default nextConfig;
