// Cookie bar and the footer's "Cookie settings" button (design/DESIGN.md, section 14, "The cookie bar").
// A strip of clean sheet glued along the foot of the screen, dead straight because it holds buttons.
// A plain bar, not a dialog: the page stays usable and focus is never trapped. "Accept" and "Decline"
// are the same button twice. All behaviour is in useConsentBanner() (src/lib/consent.ts); this file
// only gives it its look and its place. Both render nothing on a site without analytics.
//
// It never sits on the player (CLAUDE.md, YouTube rule 2):
// - it stands on top of the player bar, whatever the bar's height, and under it in the stack;
// - with the mini-player up, or on a concert page where the video could ever scroll under it,
//   it leaves the screen edge and lies in the page instead (`data-place="flow"`), above the top strip.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, type RefObject } from "react";
import { GA_ID } from "@/lib/analytics";
import { openConsentSettings, useConsentBanner } from "@/lib/consent";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Air kept between the bar and a video in the page (the kicker strip bites 14px above the bar). */
const CLEARANCE = 28;

/**
 * Where the bar goes. Reads the player bar and the page's video box, never changes them.
 * Sets `--consent-bottom` (the player bar's height) and `data-place` on the bar, and
 * `--consent-space` on <html> so the footer stays readable behind it.
 */
function useConsentPlace(ref: RefObject<HTMLElement | null>, shown: boolean) {
  const path = usePathname();
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!shown || !el) return;
    const root = document.documentElement;
    let dock: Element | null = null;
    const place = () => {
      const now = document.querySelector('[data-od="dock"]');
      if (now !== dock) {
        size.disconnect();
        attrs.disconnect();
        size.observe(el);
        size.observe(document.body);
        dock = now;
        if (dock) {
          size.observe(dock);
          attrs.observe(dock, { attributes: true, attributeFilter: ["data-mini", "data-sheet"] });
        }
      }
      const mini = Boolean(dock?.hasAttribute("data-mini"));
      // While the bar's sheet is open the bar is as tall as the screen and simply covers this one.
      if (dock?.hasAttribute("data-sheet")) return;
      const bottom = dock && !mini ? Math.ceil(dock.getBoundingClientRect().height) : 0;
      // The video in a concert page is never lower on the screen than where it starts. If that
      // reaches the bar's place, the bar would cross it at some scroll: lie in the page instead.
      const slot = document.querySelector('[data-od="player-slot"]');
      const slotBottom = slot ? slot.getBoundingClientRect().bottom + window.scrollY : 0;
      const barTop = window.innerHeight - bottom - el.offsetHeight - CLEARANCE;
      const flow = mini || slotBottom > barTop;
      el.dataset.place = flow ? "flow" : "foot";
      el.style.setProperty("--consent-bottom", `${bottom}px`);
      root.style.setProperty("--consent-space", flow ? "0px" : `${el.offsetHeight}px`);
    };
    const size = new ResizeObserver(place);
    const attrs = new MutationObserver(place);
    // The player bar is added to and taken from the end of <body> as concerts start and stop.
    const tree = new MutationObserver(place);
    tree.observe(document.body, { childList: true });
    size.observe(el);
    size.observe(document.body);
    window.addEventListener("resize", place);
    place();
    return () => {
      size.disconnect();
      attrs.disconnect();
      tree.disconnect();
      window.removeEventListener("resize", place);
      root.style.removeProperty("--consent-space");
    };
  }, [shown, path, ref]);
}

export function ConsentBanner() {
  const { shown, consent, ref, choose, onKeyDown } = useConsentBanner<HTMLElement>();
  useConsentPlace(ref, shown);
  if (!shown) return null;
  return (
    <aside ref={ref} className="zn-consent" data-od="consent" aria-label="Cookies" tabIndex={-1} onKeyDown={onKeyDown}>
      <p className="zn-consent-kicker">
        <span className="zn-strip" data-tone="black" data-size="small">
          Cookies
        </span>
        {consent !== null && consent !== "unknown" && (
          <span className="zn-label" data-od="consent-now">
            <span className="od-sr"> / </span>Now: {consent === "granted" ? "accepted" : "declined"}
          </span>
        )}
      </p>
      <p className="zn-consent-text">
        Analytics cookies tell us which gigs get played and how people find us. Nothing else. Say no and everything
        still plays.
      </p>
      <div className="zn-consent-actions">
        <button type="button" className="zn-btn" data-tone="white" data-size="small" data-od="consent-accept" onClick={() => choose("granted")}>
          Accept
        </button>
        <button type="button" className="zn-btn" data-tone="white" data-size="small" data-od="consent-decline" onClick={() => choose("denied")}>
          Decline
        </button>
        <Link href="/privacy" className="zn-consent-link" data-od="consent-privacy">
          Privacy
        </Link>
      </div>
    </aside>
  );
}

/** Footer: "Cookie settings" brings the bar back. Only on a site with analytics. */
export function CookieSettingsButton() {
  if (!GA_ID) return null;
  return (
    <button type="button" className="zn-cookie-settings" data-od="cookie-settings" onClick={openConsentSettings}>
      Cookie settings
    </button>
  );
}
