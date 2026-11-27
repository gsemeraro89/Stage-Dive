// Speed (27 Nov 2026): the Google tag is fetched after the page has loaded (src/components/analytics/GoogleTag.tsx).
import { describe, expect, it, vi } from "vitest";

describe("Google tag, fetched after the page has loaded", () => {
  it("queues gtag at once and adds gtag.js only after load, when idle", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-TEST123");
    const { GoogleTag, gtagUrl } = await import("../src/components/analytics/GoogleTag");
    const el = GoogleTag() as { type: string; props: { src?: string; dangerouslySetInnerHTML: { __html: string } } };
    vi.unstubAllEnvs();
    // One inline script: no <script src> that would be fetched and run while the page loads.
    expect(el.type).toBe("script");
    expect(el.props.src).toBeUndefined();
    const code = el.props.dangerouslySetInnerHTML.__html;
    expect(code).toContain(JSON.stringify(gtagUrl("G-TEST123")));

    const added: { src: string; async: boolean }[] = [];
    const listeners: Record<string, () => void> = {};
    const idle: (() => void)[] = [];
    const window: Record<string, unknown> = {
      addEventListener: (name: string, fn: () => void) => (listeners[name] = fn),
      requestIdleCallback: (fn: () => void) => idle.push(fn),
    };
    const sandbox = {
      window,
      localStorage: { getItem: () => null },
      requestIdleCallback: window.requestIdleCallback,
      setTimeout,
      document: { readyState: "interactive", createElement: () => ({ src: "", async: false }), head: { appendChild: (s: { src: string; async: boolean }) => added.push(s) } },
    };
    window.window = window;
    const { runInNewContext } = await import("node:vm");
    runInNewContext(code.replace(/window\.dataLayer=window\.dataLayer\|\|\[\];/, "var dataLayer=window.dataLayer=[];"), sandbox);
    expect((window.dataLayer as unknown[]).length).toBeGreaterThan(0); // consent default, js, config queued
    expect(added).toEqual([]);
    listeners.load();
    expect(added).toEqual([]);
    idle.forEach((f) => f());
    expect(added).toEqual([{ src: gtagUrl("G-TEST123"), async: true }]);
  });
});
