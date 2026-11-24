// Analytics: visits from AI assistants are told apart from search engines and other sites.
import { describe, expect, it } from "vitest";
import { AI_REFERRER_REGEX, aiSourceOf } from "../src/lib/analytics";

describe("AI assistant visits", () => {
  it("names the assistant a visit comes from", () => {
    expect(aiSourceOf("https://chatgpt.com/")).toBe("ChatGPT");
    expect(aiSourceOf("https://www.perplexity.ai/search?q=x")).toBe("Perplexity");
    expect(aiSourceOf("https://claude.ai/chat/1")).toBe("Claude");
    expect(aiSourceOf("https://gemini.google.com/app")).toBe("Gemini");
    expect(aiSourceOf("https://copilot.microsoft.com/")).toBe("Copilot");
  });
  it("leaves search engines, other sites and empty referrers alone", () => {
    expect(aiSourceOf("https://www.google.com/")).toBeNull();
    expect(aiSourceOf("https://notclaude.ai.example.com/")).toBeNull();
    expect(aiSourceOf("")).toBeNull();
  });
  it("gives GA4 a channel rule matching the same sites", () => {
    expect(new RegExp(AI_REFERRER_REGEX).test("chatgpt.com")).toBe(true);
    expect(new RegExp(AI_REFERRER_REGEX).test("google.com")).toBe(false);
  });
});
