import type { Metadata, Viewport } from "next";
import { Archivo_Black, Permanent_Marker, Special_Elite } from "next/font/google";
import Form from "next/form";
import Link from "next/link";
import { PlayerDock } from "@/components/player/PlayerDock";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { NavLinks } from "@/components/ui/NavLinks";
import { decadeIndex } from "@/lib/queries";
import { SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site";
import "./globals.css";

// Self-hosted by Next.js: no request to Google from the visitor's browser.
// Three hands, one job each (design/DESIGN.md): Archivo Black on cut strips, Special Elite for
// everything you read, Permanent Marker for the one handwritten line. Each has a single weight.
const archivoBlack = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-archivo-black", display: "swap" });
const specialElite = Special_Elite({ subsets: ["latin"], weight: "400", variable: "--font-special-elite", display: "swap" });
const permanentMarker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-permanent-marker",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME} — full rock gigs, free`, template: `%s — ${SITE_NAME}` },
  description:
    "Full rock concerts from YouTube, free: the whole set, by band, festival, room, decade, genre and tour. Press play once and keep listening.",
};

export const viewport: Viewport = { themeColor: "#ECEAE4", colorScheme: "light" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Months and years with concerts, for the menu's drop-down lists (cached, see src/lib/memo.ts).
  const decades = await decadeIndex();
  return (
    <html lang="en" className={`${archivoBlack.variable} ${specialElite.variable} ${permanentMarker.variable}`}>
      <body>
        {/* The player wraps every page and is never unmounted, so music survives navigation. */}
        <PlayerProvider>
          <header className="od-header" data-od="header">
            <Link href="/" className="od-logo display" data-od="logo" aria-label={`${SITE_NAME} home`}>
              Full<span>DJSet</span>
            </Link>
            <NavLinks decades={decades} />
            <Form action="/concerts" role="search" className="od-search" data-od="header-search">
              <label>
                <span className="meta">Search</span>
                <input type="search" name="q" placeholder="Metallica, Pinkpop, 1991" maxLength={80} />
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
