// Room at the end of the page for the mini-player (design/DESIGN.md, the deck bar).
// The mini-player is a small window floating over the page. Without room after the footer, the
// last links of every page stay under the video for good: a click lands on the player instead.
// This reads where the window is and tells the page how much room to keep (`--mini-room` on
// <html>, used by .od-dock-spacer[data-mini] in src/styles/deck.css). It only reads the player
// window, never moves or changes it, and draws nothing.
"use client";
import { useEffect } from "react";

/** Air between the window and the last thing on the page. */
const MARGIN = 16;
/** A free strip this tall under the window is enough for a link to be scrolled past it (48px target + air). */
const PASS = 64;

export function MiniRoom() {
  useEffect(() => {
    const root = document.documentElement;
    let dock: Element | null = null;
    const measure = () => {
      const now = document.querySelector('[data-od="dock"]');
      if (now !== dock) {
        attrs.disconnect();
        size.disconnect();
        dock = now;
        if (dock) {
          attrs.observe(dock, { attributes: true, attributeFilter: ["data-mini", "data-dragging", "style"] });
          size.observe(dock);
        }
      }
      if (!dock?.hasAttribute("data-mini")) {
        root.style.removeProperty("--mini-room");
        return;
      }
      // The page must not change length under the visitor's finger: measure when the window is put down.
      if (dock.hasAttribute("data-dragging")) return;
      const rect = dock.getBoundingClientRect();
      // Window low on the screen: the page ends above it. Higher up: links pass under it instead.
      const room = Math.ceil(Math.min(window.innerHeight - rect.top, rect.height + PASS) + MARGIN);
      root.style.setProperty("--mini-room", `${room}px`);
    };
    const attrs = new MutationObserver(measure);
    const size = new ResizeObserver(measure);
    // The player window is added to and taken from the end of <body> as concerts start and stop.
    const tree = new MutationObserver(measure);
    tree.observe(document.body, { childList: true });
    window.addEventListener("resize", measure);
    measure();
    return () => {
      attrs.disconnect();
      size.disconnect();
      tree.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--mini-room");
    };
  }, []);
  return null;
}
