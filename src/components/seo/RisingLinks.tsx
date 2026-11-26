// "Searched this week": plain links to the pages climbing in search (src/lib/rising.ts), rendered on the
// server so crawlers read them. Unstyled for now (designer): data-od="rising-links". Nothing when empty.
import Link from "next/link";
import { risingLinks } from "@/lib/rising";

export async function RisingLinks() {
  const links = await risingLinks();
  if (links.length === 0) return null;
  return (
    <nav aria-labelledby="rising-links" data-od="rising-links">
      <h2 id="rising-links">Searched this week</h2>
      <ul>
        {links.map((l) => (
          <li key={l.path}>
            <Link href={l.path}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
