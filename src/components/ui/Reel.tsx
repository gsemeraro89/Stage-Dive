"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reel: a band of equal pictures that scrolls sideways (DESIGN.md section 8, "Reel"). The list
 * scrolls natively with scroll-snap, so a swipe works on touch screens; the two arrow buttons
 * move it by the frames that fit in the band. An arrow is switched off at its end of the band.
 * The frames come in as `<li>` children.
 */
export function Reel({ label, children }: { label: string; children: React.ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  const prev = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft >= max - 2;
    setEnds((was) => (was.start === start && was.end === end ? was : { start, end }));
  }, []);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      watch.disconnect();
    };
  }, [measure]);

  // An arrow that switches off while it has the focus hands the focus to the other one.
  useEffect(() => {
    if (ends.start && !ends.end && document.activeElement === prev.current) next.current?.focus();
    if (ends.end && !ends.start && document.activeElement === next.current) prev.current?.focus();
  }, [ends]);

  const move = (dir: 1 | -1) => {
    const el = list.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const second = first.nextElementSibling as HTMLElement | null;
    // One step = one frame and its seam; a move = every frame that fits whole, one at least.
    const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    const fit = Math.max(1, Math.floor((el.clientWidth + 2) / step));
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = (Math.round(el.scrollLeft / step) + dir * fit) * step;
    el.scrollTo({ left: target, behavior: calm ? "auto" : "smooth" });
  };

  return (
    <div className="od-reel" role="group" aria-label={label} data-od="reel">
      <button
        ref={prev}
        type="button"
        className="od-reel-arrow od-reel-arrow--prev"
        aria-label="Previous pictures"
        disabled={ends.start}
        onClick={() => move(-1)}
        data-od="reel-prev"
      >
        <ArrowIcon />
      </button>
      <button
        ref={next}
        type="button"
        className="od-reel-arrow od-reel-arrow--next"
        aria-label="Next pictures"
        disabled={ends.end}
        onClick={() => move(1)}
        data-od="reel-next"
      >
        <ArrowIcon />
      </button>
      <ul ref={list} className="od-reel-list" data-od="reel-list">
        {children}
      </ul>
    </div>
  );
}

/** A plain filled arrow pointing right; the "previous" button mirrors it in CSS. */
function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M11 2.5 18.5 10 11 17.5 9.2 15.7l4.4-4.4H1.5V8.7h12.1L9.2 4.3z" />
    </svg>
  );
}
