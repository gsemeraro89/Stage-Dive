"use client";

import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CutOut } from "./CutOut";
import { IconButton, SearchGlyph } from "./Icons";

/** A decade in the menu's list, with how many gigs were played in it. */
export type NavDecade = { start: number; label: string; count: number };

/** Brief section 3: Bands / Fields + Rooms / Decades / Genres / Tours. Tilts alternate, as neighbours must. */
const NAV = [
  { href: "/artists", label: "Bands", tilt: -1.5 },
  { href: "/venues", label: "Fields + Rooms", tilt: 1 },
  { href: "/decades", label: "Decades", tilt: -1 },
  { href: "/genres", label: "Genres", tilt: 1.5 },
  { href: "/tours", label: "Tours", tilt: -1 },
] as const;

const DECADES_ID = "zn-head-decades";

/**
 * The site header (brand book boards 04 and 07): the wordmark, five cut-out nav labels and the
 * "find a gig:" search. On a phone the nav and the search fold behind two 48px labels.
 * `logo` is passed in so the wordmark's drawing stays out of the browser bundle.
 */
export function SiteHeader({ logo, decades }: { logo: ReactNode; decades: NavDecade[] }) {
  const path = usePathname();
  /** Phones only: which folded part is open. */
  const [panel, setPanel] = useState<"menu" | "search" | null>(null);
  const [decadesOpen, setDecadesOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // A new page closes everything.
  useEffect(() => {
    setPanel(null);
    setDecadesOpen(false);
  }, [path]);

  // The decade list: Esc closes it and gives focus back to its toggle; a press or a focus outside closes it.
  useEffect(() => {
    if (!decadesOpen) return;
    const item = () => header.current?.querySelector<HTMLElement>("[data-decades]");
    const outside = (event: Event) => {
      if (event.target instanceof Node && !item()?.contains(event.target)) setDecadesOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      item()?.querySelector("button")?.focus();
      setDecadesOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", key);
    };
  }, [decadesOpen]);

  // Opening the search on a phone puts the cursor in it.
  useEffect(() => {
    if (panel === "search") searchInput.current?.focus();
  }, [panel]);

  const under = (base: string) => path === base || path.startsWith(`${base}/`);

  return (
    <header className="zn-head" data-od="header" data-open={panel ?? undefined} ref={header}>
      <Link href="/" className="zn-head-logo" data-od="logo" aria-label="STAGEDIVE home">
        {logo}
      </Link>

      <div className="zn-head-toggles">
        <IconButton
          icon="search"
          label="Search"
          pressed={panel === "search"}
          onClick={() => setPanel(panel === "search" ? null : "search")}
        />
        <IconButton
          icon="setlist"
          label="Menu"
          tone="black"
          pressed={panel === "menu"}
          onClick={() => setPanel(panel === "menu" ? null : "menu")}
        />
      </div>

      <nav aria-label="Main" className="zn-head-nav">
        {NAV.map((item) => {
          const label = (
            <CutOut href={item.href} tilt={item.tilt} tone={under(item.href) ? "pink" : "black"} current={under(item.href)}>
              {item.label}
            </CutOut>
          );
          if (item.href !== "/decades" || decades.length === 0) return <span key={item.href}>{label}</span>;
          return (
            <span key={item.href} className="zn-head-item" data-decades>
              {label}
              <button
                type="button"
                className="zn-head-more"
                aria-label="Pick a decade"
                aria-expanded={decadesOpen}
                aria-controls={DECADES_ID}
                onClick={() => setDecadesOpen(!decadesOpen)}
              >
                <span aria-hidden="true">{decadesOpen ? "−" : "+"}</span>
              </button>
              {/* Always in the page (search engines follow these links); only hidden until opened. */}
              <div id={DECADES_ID} className="zn-head-panel" hidden={!decadesOpen}>
                <ul aria-label="Every decade with gigs">
                  {decades.map((d) => {
                    const href = `/decades/${d.label}`;
                    return (
                      <li key={d.label}>
                        <Link href={href} aria-current={path === href ? "page" : undefined} onClick={() => setDecadesOpen(false)}>
                          <span>
                            <span aria-hidden="true">{d.label}</span>
                            <span className="od-sr">The {d.label}</span>
                          </span>
                          <span className="zn-head-count">
                            {d.count.toLocaleString("en-GB")}
                            <span className="od-sr">{d.count === 1 ? " gig" : " gigs"}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </span>
          );
        })}
      </nav>

      <Form action="/concerts" role="search" className="zn-head-search" data-od="header-search">
        <label htmlFor="zn-head-q" className="zn-marker">
          find a gig:
        </label>
        <input ref={searchInput} id="zn-head-q" type="search" name="q" placeholder="band / venue / year" maxLength={80} />
        <button type="submit" className="zn-icon" data-tone="black" aria-label="Search" title="Search">
          <SearchGlyph />
        </button>
      </Form>
    </header>
  );
}
