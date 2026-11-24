// Site events for GA4 (the tag is in the page head, GoogleTag.tsx). Rendered once by the layout;
// nothing without NEXT_PUBLIC_GA_ID. For now one event: a visit from an AI assistant (ai_referral).
"use client";
import { useEffect } from "react";
import { aiSourceOf, GA_ID, track } from "@/lib/analytics";
import { applyConsent, readConsent } from "@/lib/consent";

export function Analytics() {
  useEffect(() => {
    if (!GA_ID) return;
    const stored = readConsent();
    if (stored) applyConsent(stored);
    const ai = aiSourceOf(document.referrer);
    if (ai) track("ai_referral", { ai_source: ai });
  }, []);
  return null;
}
