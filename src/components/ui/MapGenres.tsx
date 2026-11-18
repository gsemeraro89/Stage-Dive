"use client";

import { useId, useState } from "react";
import Link from "next/link";

/**
 * The genre switches of the map ("Only Techno, House…"). On a desktop they are one open row.
 * On phones the twelve of them took four rows above the map, so they fold behind one line that
 * says what is on ("Genres: all" / "Only: Techno") and opens the list (DESIGN.md section 9).
 */
export function MapGenres({
  genres,
  clearHref,
}: {
  genres: { slug: string; name: string; href: string; on: boolean }[];
  /** Concert when at least one genre is on. */
  clearHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const on = genres.filter((g) => g.on);

  return (
    <nav className="od-map-genres meta" aria-label="Genres" data-od="map-genres" data-open={open ? "" : undefined}>
      <button type="button" className="od-map-genres-fold" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span>
          <span className="od-muted">{on.length ? "Only: " : "Genres: "}</span>
          <span className={on.length ? "od-acid" : undefined}>{on.length ? on.map((g) => g.name).join(", ") : "all"}</span>
        </span>
        <span className="od-map-genres-verb">{open ? "Close" : "Change"}</span>
      </button>
      <div className="od-map-genres-list" id={id}>
        <span className="od-muted od-map-genres-only">Only</span>
        {genres.map((g) => (
          <Link key={g.slug} href={g.href} aria-current={g.on ? "true" : undefined}>
            {g.name}
          </Link>
        ))}
        {clearHref && (
          <Link href={clearHref} className="od-map-clear">
            All genres
          </Link>
        )}
      </div>
    </nav>
  );
}
