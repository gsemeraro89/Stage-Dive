// "Searched this week": plain links to the pages climbing in search (src/lib/rising.ts), rendered on the
// server so crawlers read them. Look: a typed slip between two cut lines (.zn-rising, src/styles/zine.css).
// data-od="rising-links". Nothing when empty.
import Link from "next/link";
import { risingLinks } from "@/lib/rising";

export async function RisingLinks() {
  const links = await risingLinks();
  if (links.length === 0) return null;
  return (
    <nav className="zn-rising" aria-labelledby="rising-links" data-od="rising-links">
      <h2 id="rising-links" className="zn-rising-title">Searched this week</h2>
      <ul className="zn-rising-list">
        {links.map((l) => (
          <li key={l.path}>
            <Link href={l.path}>
              <span>{l.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
