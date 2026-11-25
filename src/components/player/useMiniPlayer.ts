"use client";

// The mini-player: the deck bar collapsed into a small window that the visitor can drag.
// This hook only places that window. It is the same <section> as the bar, switched by CSS
// (`data-mini`, src/styles/deck.css), and the YouTube iframe is never moved in the document,
// so the concert keeps playing. PlayerProvider keeps the iframe over the bar's video box; here we
// move that box and put the iframe over it at once instead of waiting for the provider's observer.

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { fixedAnchor } from "@/lib/player/anchor";

type Point = { x: number; y: number };

const STORAGE_KEY = "od:mini-player";
/** Free space around the window where it first appears (bottom right). */
const MARGIN = 16;
const STEP = 16;
const BIG_STEP = 64;

function readStored(): Point | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Point>;
    if (typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y)) {
      return { x: value.x, y: value.y };
    }
  } catch {
    // Storage switched off or unreadable: the window starts bottom right.
  }
  return null;
}

function store(point: Point) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(point));
  } catch {
    // Not remembered; nothing else changes.
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** Put the player exactly over the window's video box (what PlayerProvider does on its next pass). */
function syncFrame(element: HTMLElement) {
  const box = element.querySelector<HTMLElement>('[data-od="dock-video"]');
  const frame = document.querySelector<HTMLElement>('[data-od="player-frame"]');
  if (!box || !frame || frame.style.position !== "fixed") return;
  const rect = box.getBoundingClientRect();
  const a = fixedAnchor(rect, element.getBoundingClientRect(), element.hasAttribute("data-mini"));
  frame.style.top = a.top;
  frame.style.bottom = a.bottom;
  frame.style.left = a.left;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
}

/**
 * @param available false while the mini-player cannot be shown (nothing playing, or the video
 * is inside the concert page). The visitor's choice is kept and applies again afterwards.
 * @param minimised the visitor's choice, kept by PlayerProvider so it survives a page load.
 */
export function useMiniPlayer(available: boolean, minimised: boolean) {
  const mini = minimised && available;
  const windowRef = useRef<HTMLElement>(null);
  /** Where the visitor left the window; null = never moved, it stays bottom right. */
  const wanted = useRef<Point | null>(null);
  const shown = useRef<Point>({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);

  /** Place the window, always wholly inside the viewport. */
  const place = useCallback((point: Point | null) => {
    const element = windowRef.current;
    if (!element) return;
    const maxX = document.documentElement.clientWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;
    const target = point ?? { x: maxX - MARGIN, y: maxY - MARGIN };
    const x = Math.round(clamp(target.x, 0, maxX));
    const y = Math.round(clamp(target.y, 0, maxY));
    shown.current = { x, y };
    element.style.setProperty("--mini-x", `${x}px`);
    element.style.setProperty("--mini-y", `${y}px`);
    syncFrame(element);
  }, []);

  useEffect(() => {
    wanted.current = readStored();
  }, []);

  useLayoutEffect(() => {
    const element = windowRef.current;
    if (!element) return;
    if (!mini) {
      element.style.removeProperty("--mini-x");
      element.style.removeProperty("--mini-y");
      delete element.dataset.dragging;
      drag.current = null;
      syncFrame(element);
      return;
    }
    wanted.current ??= readStored();
    place(wanted.current);
    const onResize = () => place(wanted.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mini, place]);

  const moveTo = useCallback(
    (point: Point) => {
      place(point);
      wanted.current = shown.current;
    },
    [place],
  );

  // Dragging is by the strip's handle only, so every click on the video still reaches YouTube.
  const handle = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      const element = windowRef.current;
      if (!element || (event.pointerType === "mouse" && event.button !== 0)) return;
      const rect = element.getBoundingClientRect();
      drag.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      event.currentTarget.setPointerCapture(event.pointerId);
      element.dataset.dragging = "true";
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      moveTo({ x: event.clientX - active.dx, y: event.clientY - active.dy });
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      if (drag.current?.pointerId !== event.pointerId) return;
      drag.current = null;
      if (windowRef.current) delete windowRef.current.dataset.dragging;
      if (wanted.current) store(wanted.current);
    },
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
      if (drag.current?.pointerId !== event.pointerId) return;
      drag.current = null;
      if (windowRef.current) delete windowRef.current.dataset.dragging;
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? BIG_STEP : STEP;
      const moves: Record<string, Point> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      moveTo({ x: shown.current.x + move.x, y: shown.current.y + move.y });
      if (wanted.current) store(wanted.current);
    },
  };

  return { mini, windowRef, handle };
}
