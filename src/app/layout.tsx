import type { Metadata, Viewport } from "next";
import { Archivo_Black, Permanent_Marker, Special_Elite } from "next/font/google";
import Link from "next/link";
import { PlayerDock } from "@/components/player/PlayerDock";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { SiteHeader } from "@/components/zine/SiteHeader";
import { Wordmark } from "@/components/zine/Wordmark";
import { issueLabel } from "@/lib/home";
import { decadeIndex } from "@/lib/queries";
import { SITE_NAME, siteUrl } from "@/lib/site";
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
          {/* The top strip (board 04). Phones get the short version (board 07). */}
          <p className="zn-band zn-issue" data-od="issue-strip">
            ISSUE {issueLabel(new Date())} /// FREE <span className="zn-issue-long">/// FULL ROCK GIGS, STRAIGHT OFF YOUTUBE </span>
            /// NO LOGIN<span className="zn-issue-long">, NO NONSENSE</span>
          </p>
          <SiteHeader logo={<Wordmark variant="full" width={300} label="" />} decades={decades} />
          {children}
          <footer className="zn-foot" data-od="footer">
            <p>{SITE_NAME} /// every gig here is an official or freely available YouTube upload. We just glue them together.</p>
            <Link href="/map">FIND YOUR NEXT BAND &gt;&gt;</Link>
          </footer>
          <PlayerDock />
        </PlayerProvider>
      </body>
    </html>
  );
}
