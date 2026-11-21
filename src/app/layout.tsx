import type { Metadata, Viewport } from "next";
import { Archivo_Black, Permanent_Marker, Special_Elite } from "next/font/google";
import Link from "next/link";
import { PlayerDock } from "@/components/player/PlayerDock";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { SiteHeader } from "@/components/zine/SiteHeader";
import { Wordmark } from "@/components/zine/Wordmark";
import { issueLabel } from "@/lib/home";
import { decadeIndex } from "@/lib/queries";
import { robotsFor, shareImages } from "@/lib/seo";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { FOOTER_LINE, ISSUE_STRIP_SOURCES } from "@/lib/bootlegs";
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
  title: { default: `${SITE_NAME} · Full Rock Concerts and Setlists`, template: `%s · ${SITE_NAME}` },
  description:
    "Full rock concerts, the whole set, by band, festival, room, decade, genre and tour, with setlists. Press play once and keep listening.",
  // Pages are indexed only on the live site (SITE_INDEXABLE=true, src/lib/seo.ts); a page can still opt out.
  robots: robotsFor(true),
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_GB", images: shareImages() },
  twitter: { card: "summary_large_image" },
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
          {/* The top strip (board 04). Phones get the short version (board 07). */}
          <p className="zn-band zn-issue" data-od="issue-strip">
            ISSUE {issueLabel(new Date())} /// THE WHOLE SET <span className="zn-issue-long">/// {ISSUE_STRIP_SOURCES} </span>
            /// NO LOGIN<span className="zn-issue-long">, NO NONSENSE</span>
          </p>
          <SiteHeader logo={<Wordmark variant="full" width={300} label="" />} decades={decades} />
          {children}
          <footer className="zn-foot" data-od="footer">
            <p>
              {SITE_NAME} /// {FOOTER_LINE}
            </p>
            <Link href="/map">FIND YOUR NEXT BAND &gt;&gt;</Link>
            <Link href="/best" data-od="footer-best">
              MOST WATCHED &gt;&gt;
            </Link>
            <Link href="/news" data-od="footer-news">
              NEWS &gt;&gt;
            </Link>
            {/* Required by the YouTube API Services terms: how the site uses them, and Google's privacy policy. */}
            <Link href="/privacy" data-od="footer-privacy">
              Privacy
            </Link>
          </footer>
          <PlayerDock />
        </PlayerProvider>
      </body>
    </html>
  );
}
