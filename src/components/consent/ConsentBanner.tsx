// Cookie banner and the footer's "Cookie settings" button: unstyled structure (no CSS yet). The
// designer gives them their look and may move them into src/components/ui/. All behaviour is in
// useConsentBanner() (src/lib/consent.ts). Both render nothing on a site without analytics.
// A plain bar, not a dialog: the page stays usable and focus is never trapped. It must never sit
// on top of the player (CLAUDE.md, YouTube rule 2).
"use client";
import Link from "next/link";
import { GA_ID } from "@/lib/analytics";
import { openConsentSettings, useConsentBanner } from "@/lib/consent";

export function ConsentBanner() {
  const { shown, consent, ref, choose, onKeyDown } = useConsentBanner<HTMLElement>();
  if (!shown) return null;
  return (
    <aside ref={ref} className="sd-consent" data-od="consent" aria-label="Cookies" tabIndex={-1} onKeyDown={onKeyDown}>
      <p className="sd-consent-kicker">
        Cookies
        {consent !== null && consent !== "unknown" && (
          <span data-od="consent-now"> / Now: {consent === "granted" ? "accepted" : "declined"}</span>
        )}
      </p>
      <p className="sd-consent-text">
        We use analytics cookies to see which concerts people play and how they find us. No ads, no tracking across sites.
      </p>
      <div className="sd-consent-actions">
        <button type="button" className="sd-consent-btn" data-od="consent-accept" onClick={() => choose("granted")}>
          Accept
        </button>
        <button type="button" className="sd-consent-btn" data-od="consent-decline" onClick={() => choose("denied")}>
          Decline
        </button>
        <Link href="/privacy" className="sd-consent-link" data-od="consent-privacy">
          Privacy
        </Link>
      </div>
    </aside>
  );
}

/** Footer: "Cookie settings" brings the banner back. Only on a site with analytics. */
export function CookieSettingsButton() {
  if (!GA_ID) return null;
  return (
    <button type="button" className="sd-cookie-settings" data-od="cookie-settings" onClick={openConsentSettings}>
      Cookie settings
    </button>
  );
}
