import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // YouTube thumbnails.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
  // The Render server has 512 MB: rendered pages are kept on disk, not in memory (lesson from OpenDecks).
  cacheMaxMemorySize: 0,
  // Markdown copies of concert and band pages for AI assistants (src/lib/llms.ts).
  async rewrites() {
    return [
      { source: "/concerts/:slug([a-z0-9-]+)\\.md", destination: "/md/concerts/:slug" },
      { source: "/artists/:slug([a-z0-9-]+)\\.md", destination: "/md/artists/:slug" },
    ];
  },
};

export default nextConfig;
