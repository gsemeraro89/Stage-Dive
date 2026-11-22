// robots.txt. The live site (SITE_INDEXABLE=true) is open to search engines and to every AI crawler
// (owner, 19 Nov 2026: be found by every assistant, for search and for training), except the admin
// and the API (filtered list views carry their own noindex). The test service and local copies are
// closed to all of them. Same list as OpenDecks/FullDJSet. Tested in tests/robots.test.ts.
import type { MetadataRoute } from "next";
import { abs, siteIsIndexable } from "./seo";

/**
 * AI crawlers named one by one, so the welcome is explicit even if a default rule changes:
 * search/answer bots (they fetch pages to answer a question) and training bots (models learn the site).
 */
export const AI_CRAWLERS = [
  // OpenAI (ChatGPT search, answers, training)
  "OAI-SearchBot", "ChatGPT-User", "GPTBot",
  // Anthropic (Claude)
  "Claude-SearchBot", "Claude-User", "ClaudeBot", "anthropic-ai",
  // Perplexity
  "PerplexityBot", "Perplexity-User",
  // Google (Gemini, AI Overviews) and Apple (Apple Intelligence, Siri)
  "Google-Extended", "Applebot", "Applebot-Extended",
  // Microsoft Copilot uses Bing; Meta, Amazon, DuckDuckGo, Mistral, Cohere, ByteDance, You.com
  "bingbot", "Meta-ExternalAgent", "Meta-ExternalFetcher", "FacebookBot", "Amazonbot", "DuckAssistBot",
  "MistralAI-User", "cohere-ai", "cohere-training-data-crawler", "Bytespider", "YouBot",
  // Common Crawl: the open archive most models are trained on
  "CCBot",
];

/** Paths no crawler needs. */
export const CLOSED_PATHS = ["/admin", "/api/"];

export function robotsRules(): MetadataRoute.Robots {
  if (!siteIsIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: CLOSED_PATHS },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: CLOSED_PATHS },
    ],
    // The Google News sitemap (src/app/news-sitemap.xml): articles of the last 48 hours.
    sitemap: [abs("/sitemap.xml"), abs("/news-sitemap.xml")],
    host: abs("/"),
  };
}
