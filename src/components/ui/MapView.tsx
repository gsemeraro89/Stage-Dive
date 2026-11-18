"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArtistLine, type ArtistLineData } from "./ArtistLine";

export type MapArtistLine = ArtistLineData & { x: number; y: number };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** How far an artist is from the centre: 1 = nearest third, 3 = farthest. Concerts the size of the picture. */
function tier(a: { x: number; y: number }): 1 | 2 | 3 {
  const d = Math.hypot(a.x, a.y);
  return d < 0.45 ? 1 : d < 0.75 ? 2 : 3;
}

/**
 * Put every picture (with its name) at its place. Closest artists are placed first; one that would
 * touch something already placed takes the nearest free spot instead, so nothing overlaps.
 * If the field is too small for that (many pictures on a phone), it is made taller.
 * The centre never moves. Same input, same result: the map looks the same on every visit.
 */
function place(field: HTMLElement) {
  // A crowded field on a narrow screen grows downward until every picture has its own place.
  field.style.height = "";
  for (let grown = 0; grown < 10; grown++) {
    if (placeOnce(field)) return;
    field.style.height = `${field.clientHeight + 48}px`;
  }
}

/** One pass. False when a picture found no free place (it is then left on its target). */
function placeOnce(field: HTMLElement): boolean {
  const W = field.clientWidth;
  const H = field.clientHeight;
  let fits = true;
  const placed: { cx: number; cy: number; w: number; h: number }[] = [];
  const centre = field.querySelector<HTMLElement>('[data-node="centre"]');
  // Whole pixels, no transform: half-pixel edges show as faint lines round the names.
  const put = (el: HTMLElement, cx: number, cy: number, w: number, h: number) => {
    el.style.transform = "none";
    el.style.left = `${Math.round(cx - w / 2)}px`;
    el.style.top = `${Math.round(cy - h / 2)}px`;
  };
  if (centre) {
    // A little wider than it is, so the nearest pictures do not crowd the centre.
    placed.push({ cx: W / 2, cy: H / 2, w: centre.offsetWidth + 16, h: centre.offsetHeight + 16 });
    put(centre, W / 2, H / 2, centre.offsetWidth, centre.offsetHeight);
  }
  const free = (cx: number, cy: number, w: number, h: number, gap: number) =>
    cx - w / 2 >= 0 &&
    cx + w / 2 <= W &&
    cy - h / 2 >= 0 &&
    cy + h / 2 <= H &&
    placed.every((p) => Math.abs(p.cx - cx) >= (p.w + w) / 2 + gap || Math.abs(p.cy - cy) >= (p.h + h) / 2 + gap);

  for (const el of field.querySelectorAll<HTMLElement>('[data-node="artist"]')) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Number(el.dataset.x ?? 0);
    const y = Number(el.dataset.y ?? 0);
    const tx = Math.min(W - w / 2, Math.max(w / 2, W / 2 + (x * W) / 2));
    const ty = Math.min(H - h / 2, Math.max(h / 2, H / 2 + (y * H) / 2));
    const out = Math.atan2(y, x);
    let spot: { cx: number; cy: number } | null = null;
    // Air between pictures when there is room; less on a crowded map, but never touching.
    search: for (const gap of [18, 8, 2]) {
      for (let r = 0; r < W; r += 6) {
        // Try outward from the centre first, then round the circle.
        for (let k = 0; k < (r ? 24 : 1); k++) {
          const angle = out + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 12;
          const cx = tx + Math.cos(angle) * r;
          const cy = ty + Math.sin(angle) * r;
          if (free(cx, cy, w, h, gap)) {
            spot = { cx, cy };
            break search;
          }
        }
      }
    }
    if (!spot) {
      fits = false;
      spot = { cx: tx, cy: ty };
    }
    placed.push({ ...spot, w, h });
    put(el, spot.cx, spot.cy, w, h);
  }
  return fits;
}

/**
 * The map: the field of pictures and the artist line of the selected artist (beside the field on
 * a desktop, under it on tablets and phones).
 * - Mouse and keyboard: pointing or focusing selects; clicking a picture or name opens that
 *   artist's page.
 * - Touch: the first tap on a picture selects it, a second tap opens the artist's page. Nothing
 *   can be pointed at with a finger, so a tap that left the page at once made the map unusable.
 * - Phones: the field fits the width of the screen, and the "pick" bar under it (it stays at the
 *   foot of the screen while the field is in view) names the selected artist with the two ways
 *   on: "Start from here" restarts the map from that artist, "Artist page" opens the page.
 * No score, reason or rank is shown anywhere: nearer and larger is all the map says.
 */
export function MapView({
  centre,
  artists,
  suffix,
}: {
  centre: ArtistLineData;
  artists: MapArtistLine[];
  /** Kept in every link of the map: the genres that are switched on. */
  suffix: string;
}) {
  const [selected, setSelected] = useState(centre.slug);
  // The artist the map is restarting from, while the new map loads.
  const [leaving, setLeaving] = useState<string | null>(null);
  // What was selected when the finger went down: focus moves the selection before the click arrives.
  const touched = useRef<string | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const current = artists.find((a) => a.slug === selected) ?? centre;
  const hrefFor = (slug: string) => `/map?artist=${slug}${suffix}`;

  useIsoLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    place(field);
    const observer = new ResizeObserver(() => place(field));
    observer.observe(field);
    // The display font changes the width of every name when it arrives.
    document.fonts?.ready.then(() => place(field)).catch(() => {});
    return () => observer.disconnect();
  }, [artists]);

  const pick = (slug: string) => ({
    onMouseEnter: () => setSelected(slug),
    onFocus: () => setSelected(slug),
    onPointerDown: (e: React.PointerEvent) => {
      touched.current = e.pointerType === "mouse" ? null : selected;
    },
    onClick: (e: React.MouseEvent) => {
      const before = touched.current;
      touched.current = null;
      // A finger on a picture that was not selected yet: select it and stay on the map.
      if (before !== null && before !== slug) {
        e.preventDefault();
        setSelected(slug);
      }
    },
    "data-selected": selected === slug || undefined,
  });

  const startFrom = (a: ArtistLineData, short?: boolean) => (
    <Link
      href={hrefFor(a.slug)}
      className={short ? "od-play od-map-start" : "od-link"}
      aria-label={short ? `Start from ${a.name}` : undefined}
      onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) setLeaving(a.slug);
      }}
    >
      {leaving === a.slug ? "Loading" : short ? "Start from here" : `Start from ${a.name}`}
    </Link>
  );
  const isCentre = current.slug === centre.slug;
  const kicker = isCentre ? "You start from" : `Like ${centre.name}`;
  // The field is taller on a phone the more pictures it has to hold.
  const size = artists.length <= 3 ? "s" : artists.length <= 7 ? "m" : artists.length <= 9 ? "l" : "xl";

  // `width` is the widest the square gets; a cropped concert thumbnail needs a file 2.35 times that.
  const picture = (a: ArtistLineData, width: number) =>
    a.cover ? (
      <span className="od-map-pic" data-portrait={a.cover.portrait || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.cover.thumbnail.src} srcSet={a.cover.thumbnail.srcSet} sizes={`${Math.round(width * (a.cover.portrait ? 1 : 2.35))}px`} alt="" decoding="async" />
      </span>
    ) : (
      <span className="od-map-pic od-map-pic--plain display">{a.name.slice(0, 1)}</span>
    );

  return (
    <div className="od-map" data-od="map-view" data-busy={leaving ? "" : undefined}>
      <div ref={fieldRef} className="od-map-field" data-od="map-field" data-size={size}>
        <Link
          href={`/artists/${centre.slug}`}
          className="od-map-centre display"
          data-node="centre"
          {...pick(centre.slug)}
        >
          <span className="od-map-here meta">Start</span>
          {picture(centre, 210)}
          <span className="od-map-name">{centre.name}</span>
        </Link>
        <ol aria-label={`Artists like ${centre.name}`} data-od="map-artists">
          {artists.map((a) => (
            <li
              key={a.slug}
              data-node="artist"
              data-x={a.x}
              data-y={a.y}
              data-tier={tier(a)}
              style={{ "--x": a.x, "--y": a.y } as React.CSSProperties}
            >
              <Link href={`/artists/${a.slug}`} className="od-map-node display" {...pick(a.slug)}>
                {picture(a, 148)}
                <span className="od-map-name">{a.name}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>

      {/* Phones: the selected artist and the two ways on, kept at the foot of the screen. */}
      <div className="od-map-pick" aria-live="polite" data-od="map-pick">
        <Link href={`/artists/${current.slug}`} className="od-map-pickpic" tabIndex={-1} aria-hidden="true" key={current.slug}>
          {picture(current, 72)}
        </Link>
        <div className="od-map-pickid">
          <p className="meta od-muted">{kicker}</p>
          <h2 className="od-map-pickname title">{current.name}</h2>
          {current.genres.length > 0 && (
            <p className="meta od-map-pickgenres">
              {current.genres.slice(0, 3).map((g) => (
                <span key={g.slug}>{g.name}</span>
              ))}
            </p>
          )}
        </div>
        <div className="od-map-pickacts">
          {isCentre ? (
            <p className="od-map-hint">Tap a picture. Bigger and closer means more alike.</p>
          ) : (
            startFrom(current, true)
          )}
          <Link href={`/artists/${current.slug}`} className="od-link">
            Artist page
          </Link>
        </div>
      </div>

      <aside className="od-map-rail" aria-live="polite" aria-label="Selected artist" data-od="map-rail">
        <p className="meta od-acid od-map-kicker">{kicker}</p>
        <div className="od-aline-box">
          <ArtistLine artist={current} heading="h2" key={current.slug}>
            {!isCentre && startFrom(current)}
          </ArtistLine>
        </div>
      </aside>
    </div>
  );
}
