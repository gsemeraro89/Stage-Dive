import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import Form from "next/form";
import Link from "next/link";
import { PlayerDock } from "@/components/player/PlayerDock";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { NavLinks } from "@/components/ui/NavLinks";
import { periodIndex } from "@/lib/queries";
import { SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site";
import "./globals.css";

// Self-hosted by Next.js: no request to Google from the visitor's browser.
// Archivo is loaded as a variable font with its width axis (the display type is 125% wide).
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME} — free electronic DJ concerts`, template: `%s — ${SITE_NAME}` },
  description:
    "Full-length electronic DJ concerts and live acts from YouTube, organised by artist, festival, venue, genre and venueKind. Press play once and keep listening.",
};

export const viewport: Viewport = { themeColor: "#0B0B0F", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Months and years with concerts, for the menu's drop-down lists (cached, see src/lib/memo.ts).
  const periods = await periodIndex();
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>
        {/* The player wraps every page and is never unmounted, so music survives navigation. */}
        <PlayerProvider>
          <header className="od-header" data-od="header">
            <Link href="/" className="od-logo display" data-od="logo" aria-label={`${SITE_NAME} home`}>
              Full<span>DJSet</span>
            </Link>
            <NavLinks periods={periods} />
            <Form action="/concerts" role="search" className="od-search" data-od="header-search">
              <label>
                <span className="meta">Search</span>
                <input type="search" name="q" placeholder="NTO, Cercle, Monegros" maxLength={80} />
              </label>
              <button type="submit" className="meta">
                Go
              </button>
            </Form>
          </header>
          {children}
          <footer className="od-footer meta" data-od="footer">
            <p>
              {SITE_NAME} indexes public, embeddable YouTube videos. All rights belong to the artists and channels.
            </p>
            <p>{SITE_TAGLINE}.</p>
          </footer>
          <PlayerDock />
        </PlayerProvider>
      </body>
    </html>
  );
}
