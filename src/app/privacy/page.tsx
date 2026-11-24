// Privacy (owner, 19 Nov 2026). Required by the YouTube API Services terms: the site must say it uses
// YouTube API Services and link to the YouTube Terms of Service and Google's privacy policy. This is
// the one page where "YouTube" is named outside a view count. A draft for the owner to check, not
// legal advice. Unstyled structure: the designer gives it its look.
// Google Analytics 4 (24 Nov 2026): cookies only after consent (src/lib/consent.ts). The analytics
// paragraphs show only on a site that loads it (NEXT_PUBLIC_GA_ID): never claim what is not there.
import type { Metadata } from "next";
import { breadcrumbs } from "@/lib/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { GA_ID } from "@/lib/analytics";
import { robotsFor } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy and cookies",
  description: `How ${SITE_NAME} uses YouTube API Services, what the embedded player may store, what we keep, and your cookie choice.`,
  alternates: { canonical: "/privacy" },
  // Useful to visitors, not a page people search for.
  robots: robotsFor(false),
};

export const revalidate = 86400;

export default function PrivacyPage() {
  return (
    <main data-od="privacy" className="pg">
      <JsonLd data={breadcrumbs([["Home", "/"], ["Privacy", "/privacy"]])} />
      <article className="pg-prose">
        <h1>Privacy and cookies</h1>
        <p>
          {SITE_NAME} is a fanzine of full rock concerts. You do not need an account, and we do not ask for your name, email or any other
          personal details.
        </p>

        <h2>YouTube API Services</h2>
        <p>
          {SITE_NAME} uses YouTube API Services to find concerts, to check that each video is public and may be embedded, and to show its
          title, length and view count. The concerts play in YouTube&apos;s embedded player. By watching a concert here you agree to the{" "}
          <a href="https://www.youtube.com/t/terms" rel="noopener">
            YouTube Terms of Service
          </a>
          . YouTube is a Google service; how Google handles your data is described in the{" "}
          <a href="https://policies.google.com/privacy" rel="noopener">
            Google Privacy Policy
          </a>
          .
        </p>
        <p>
          The player loads only when you press play. From then on YouTube may set its own cookies and receive information from your
          browser, as described in Google&apos;s privacy policy. You can manage what Google keeps at{" "}
          <a href="https://myaccount.google.com/permissions" rel="noopener">
            your Google account&apos;s security settings
          </a>
          .
        </p>

        {GA_ID && (
          <>
            <h2>Analytics (Google Analytics 4)</h2>
            <p>
              To learn which pages people use and how they find us (search engines, AI assistants, other sites), we use Google Analytics 4.
              It only stores cookies on your device if you accept them in the cookie banner. If you decline, or before you choose, Google
              receives only anonymous signals without cookies, which cannot be linked to you.
            </p>
            <p>
              Google Analytics is provided by Google Ireland Limited. Data is kept for the shortest period Google Analytics allows and is
              not shared with advertisers. {SITE_NAME} shows no ads.
            </p>
          </>
        )}

        <h2>What we keep</h2>
        <p>
          We count plays on the site (which concert, when, from which page, and the country the request came from) to build the
          &ldquo;most played&rdquo; list. No IP address or anything else that could be linked to you is stored. Data we receive from YouTube is refreshed or deleted at least every 30 days.
        </p>

        <h2>What your browser keeps</h2>
        <p>
          {GA_ID ? "Your cookie choice, and where you leave the small player window, are kept" : "Where you leave the small player window is kept"}{" "}
          in your own browser, never on our servers.
        </p>

        {GA_ID && (
          <>
            <h2>Changing your choice</h2>
            <p>Use &ldquo;Cookie settings&rdquo; at the bottom of any page to accept or decline analytics cookies at any time.</p>
          </>
        )}

        <h2>Contact</h2>
        <p>For any question about your data, write to the site owner (contact details to be added).</p>
      </article>
    </main>
  );
}
