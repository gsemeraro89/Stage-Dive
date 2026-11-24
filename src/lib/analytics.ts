// Google Analytics 4 (owner, 24 Nov 2026, ported from OpenDecks). Loaded only where NEXT_PUBLIC_GA_ID
// is set (the live site), with Google Consent Mode: nothing is stored on the visitor's device until
// they accept in the cookie banner (src/lib/consent.ts); before that GA4 receives cookieless,
// anonymous pings. Without the ID nothing at all is loaded (test service, local copies, tests).

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

/** Where the visitor's cookie choice is kept in their browser (read by the tag in the page head too). */
export const CONSENT_KEY = "sd-consent";

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

/** Send a GA4 event. Does nothing without GA. */
export function track(name: string, params: Record<string, string | number | boolean | undefined> = {}) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}

/**
 * The AI assistant a visit comes from, by its referrer (measure visits from ChatGPT, Perplexity,
 * Claude, Gemini, Copilot... separately from search engines). Pure, for tests.
 */
const AI_SOURCES: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/, "Gemini"],
  [/(^|\.)copilot\.microsoft\.com$/, "Copilot"],
  [/(^|\.)you\.com$/, "You.com"],
  [/(^|\.)phind\.com$/, "Phind"],
  [/(^|\.)chat\.mistral\.ai$/, "Mistral"],
  [/(^|\.)chat\.deepseek\.com$/, "DeepSeek"],
  [/(^|\.)meta\.ai$/, "Meta AI"],
  [/(^|\.)grok\.com$|(^|\.)x\.ai$/, "Grok"],
];
export function aiSourceOf(referrer: string): string | null {
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  return AI_SOURCES.find(([re]) => re.test(host))?.[1] ?? null;
}

/** Same rule as a regular expression, for GA4's custom channel group "AI assistants". */
export const AI_REFERRER_REGEX =
  "chatgpt\\.com|openai\\.com|perplexity\\.ai|claude\\.ai|gemini\\.google\\.com|bard\\.google\\.com|copilot\\.microsoft\\.com|you\\.com|phind\\.com|chat\\.mistral\\.ai|chat\\.deepseek\\.com|meta\\.ai|grok\\.com|x\\.ai";
