// Cookie consent (GDPR, ported from OpenDecks 24 Nov 2026). The visitor's choice is kept in their
// browser; GA4 is told through Google Consent Mode. The banner and the footer "Cookie settings"
// button (src/components/ui/ConsentBanner.tsx) use useConsentBanner(),
// or the smaller pieces: useConsent(), setConsent() and openConsentSettings().
"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CONSENT_KEY, GA_ID } from "./analytics";

export type ConsentChoice = "granted" | "denied";
const EVENT = "sd-consent-change";
const OPEN_EVENT = "sd-consent-open";

export function readConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

/** Tell Google Consent Mode. Ads storage stays denied: the site shows no ads. */
export function applyConsent(choice: ConsentChoice) {
  window.gtag?.("consent", "update", {
    analytics_storage: choice,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

export function setConsent(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // private mode: the choice holds for this page only
  }
  applyConsent(choice);
  window.dispatchEvent(new Event(EVENT));
}

/** Show the banner again (footer "Cookie settings"). */
export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The visitor's choice: "granted", "denied", null (not asked yet), or "unknown" while rendering on the server. */
export function useConsent(): ConsentChoice | null | "unknown" {
  return useSyncExternalStore(subscribe, readConsent, () => "unknown");
}

/** Calls `onOpen` when the visitor asks to change their choice. */
export function onConsentSettingsOpen(onOpen: () => void): () => void {
  window.addEventListener(OPEN_EVENT, onOpen);
  return () => window.removeEventListener(OPEN_EVENT, onOpen);
}

/**
 * Everything the cookie banner needs, without any look. `shown` is false on a site without analytics
 * (no NEXT_PUBLIC_GA_ID) and on the server render, so nothing flashes. The banner shows on a first
 * visit, and again when the visitor presses "Cookie settings" (focus then moves to the banner, and
 * goes back to the button when it closes). Esc puts it away only when a choice already stands.
 */
export function useConsentBanner<T extends HTMLElement = HTMLElement>() {
  const consent = useConsent();
  const [reopened, setReopened] = useState(false);
  const ref = useRef<T>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(
    () =>
      onConsentSettingsOpen(() => {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setReopened(true);
      }),
    [],
  );

  // Asked for from the footer: take the keyboard there. On a first visit focus is left alone.
  useEffect(() => {
    if (reopened) ref.current?.focus();
  }, [reopened]);

  const close = useCallback(() => {
    setReopened(false);
    opener.current?.focus();
    opener.current = null;
  }, []);
  const choose = useCallback(
    (choice: ConsentChoice) => {
      setConsent(choice);
      close();
    },
    [close],
  );
  const onKeyDown = useCallback(
    (event: { key: string }) => {
      if (event.key === "Escape" && consent !== null && consent !== "unknown") close();
    },
    [consent, close],
  );

  const shown = Boolean(GA_ID) && consent !== "unknown" && (consent === null || reopened);
  return { shown, consent, ref, choose, close, onKeyDown };
}
