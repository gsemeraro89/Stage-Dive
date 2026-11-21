import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // YouTube thumbnails.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
  // The Render server has 512 MB: rendered pages are kept on disk, not in memory (lesson from OpenDecks).
  cacheMaxMemorySize: 0,
  // Markdown copies of concert, band and song pages for AI assistants (src/lib/llms.ts).
  async rewrites() {
    return [
      { source: "/concerts/:slug([a-z0-9-]+)\\.md", destination: "/md/concerts/:slug" },
      { source: "/artists/:slug([a-z0-9-]+)\\.md", destination: "/md/artists/:slug" },
      // Festival and venue years (src/lib/venue-years.ts).
      { source: "/venues/:slug([a-z0-9-]+)/:year(\\d{4})\\.md", destination: "/md/venues/:slug/:year" },
      // "Best of" rankings (src/lib/best.ts).
      { source: "/best/:slug([a-z0-9-]+)\\.md", destination: "/md/best/:slug" },
      // Full concerts in HD (src/lib/hd.ts).
      { source: "/hd.md", destination: "/md/hd" },
      // Songs played live (src/lib/songs.ts): a band's songs and one song.
      { source: "/songs/:band([a-z0-9-]+)\\.md", destination: "/md/songs/:band" },
      { source: "/songs/:band([a-z0-9-]+)/:song([a-z0-9-]+)\\.md", destination: "/md/songs/:band/:song" },
    ];
  },
};

export default nextConfig;
