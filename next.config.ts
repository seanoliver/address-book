import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Token update pages must never be indexed: a crawled /u/<token>
        // URL is a live credential. (/b/[slug] is deliberately indexable —
        // the permalink is meant to be shared and is write-only.)
        source: "/u/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
