"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";

/** One line of a drop-down list: a decade, how many concerts it has, and whether the visitor is in it. */
type Row = { href: string; label: string; full: string; count: number; here: boolean; exact: boolean };

type More = { id: string; name: string; caption: string; rows: Row[] };

type Item = { href: string; label: string; active: (path: string) => boolean; more?: More };

/** A decade in the menu's list, with how many concerts were played in it. */
export type NavDecade = { start: number; label: string; count: number };

const under = (base: string) => (path: string) => path === base || path.startsWith(`${base}/`);

/**
 * Main navigation (brief section 3: Bands / Fields + Rooms / Decades / Genres / Tours).
 * "Decades" carries a list of the decades that have concerts.
 */
function items(path: string, decades: NavDecade[]): Item[] {
  const rows: Row[] = decades.map((d) => {
    const href = `/decades/${d.label}`;
    return { href, label: d.label, full: `The ${d.label}`, count: d.count, here: path === href, exact: path === href };
  });
  return [
    { href: "/artists", label: "Bands", active: under("/artists") },
    { href: "/venues", label: "Fields + Rooms", active: under("/venues") },
    {
      href: "/decades",
      label: "Decades",
      active: under("/decades"),
      more: { id: "od-nav-decades", name: "Pick a decade", caption: "Every decade with gigs", rows },
    },
    { href: "/genres", label: "Genres", active: under("/genres") },
    { href: "/tours", label: "Tours", active: under("/tours") },
    { href: "/map", label: "Map", active: under("/map") },
  ];
}

/** On narrow screens the menu is set in two rows; the second row starts after this many items. */
const FIRST_ROW = 4;

/** From this many lines on, the desktop list is set in two columns. */
const TWO_COLUMNS_FROM = 7;

export function NavLinks({ decades }: { decades: NavDecade[] }) {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);

  // A new page closes the list.
  useEffect(() => setOpen(null), [path]);

  // While a list is open: Esc closes it and gives focus back to its toggle; a press or a focus
  // anywhere outside the item closes it too.
  useEffect(() => {
    if (!open) return;
    const item = () => nav.current?.querySelector<HTMLElement>(`[data-more="${open}"]`);
    const outside = (event: Event) => {
      if (event.target instanceof Node && !item()?.contains(event.target)) setOpen(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      item()?.querySelector("button")?.focus();
      setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <nav aria-label="Main" className="od-nav meta" ref={nav}>
      {items(path, decades).map((item, i) => {
        const link = (
          <Link href={item.href} aria-current={item.active(path) ? "page" : undefined}>
            {item.label}
          </Link>
        );
        const more = item.more && item.more.rows.length > 0 ? item.more : null;
        const isOpen = more !== null && open === more.id;
        const n = more?.rows.length ?? 0;
        return (
          <Fragment key={item.href}>
            {i === FIRST_ROW && <span className="od-nav-break" aria-hidden="true" />}
            {more ? (
              <span className="od-nav-item" data-more={more.id}>
                {link}
                <button
                  type="button"
                  className="od-nav-toggle"
                  aria-label={more.name}
                  aria-expanded={isOpen}
                  aria-controls={more.id}
                  onClick={() => setOpen(isOpen ? null : more.id)}
                >
                  <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                </button>
                {/* Always in the page (search engines follow these links); only hidden until opened. */}
                <div id={more.id} className="od-nav-panel" hidden={!isOpen}>
                  <ul
                    className="od-nav-list"
                    aria-label={more.caption}
                    style={
                      {
                        "--rows": n >= TWO_COLUMNS_FROM ? Math.ceil(n / 2) : n,
                        "--rows-phone": Math.ceil(n / 3),
                      } as CSSProperties
                    }
                  >
                    {more.rows.map((row) => (
                      <li key={row.href}>
                        <Link
                          href={row.href}
                          aria-current={row.exact ? "page" : row.here ? "true" : undefined}
                          onClick={() => setOpen(null)}
                        >
                          <span>
                            <span aria-hidden="true">{row.label}</span>
                            <span className="od-sr">{row.full}</span>
                          </span>
                          <span className="od-nav-count">
                            {row.count.toLocaleString("en-GB")}
                            <span className="od-sr">{row.count === 1 ? " gig" : " gigs"}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </span>
            ) : (
              link
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
