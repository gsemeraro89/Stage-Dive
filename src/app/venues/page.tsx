// Fields + Rooms: the festivals ("the fields") and everything with a roof ("the rooms").
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { RisingLinks } from "@/components/seo/RisingLinks";
import { breadcrumbs, itemList } from "@/lib/structured-data";
import Link from "next/link";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { gigs } from "@/components/gig/words";
import { listPlaces } from "@/lib/home";

// Served ready-made, rebuilt in the background at most every 10 minutes.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Festivals and Venues · Full Rock Concerts",
  description: "Full rock concerts by where they happened: the festival fields and the rooms, from Glastonbury and Pinkpop to small clubs.",
  alternates: { canonical: "/venues" },
};

type Place = { slug: string; name: string; city: string | null; country: string | null; count: number };

export default async function VenuesPage() {
  // Fields: every festival. Rooms: every room, livestream and TV studio with a gig (src/lib/home.ts).
  const [fields, rooms]: [Place[], Place[]] = await Promise.all([listPlaces("festival"), listPlaces("room")]);
  const byCount = (a: Place, b: Place) => b.count - a.count || a.name.localeCompare(b.name);
  const piles = [
    { id: "fields", title: "the fields", sub: "festivals: mud, sky, big stages", rows: fields.sort(byCount), thin: "one field so far. more on the way." },
    { id: "rooms", title: "the rooms", sub: "clubs, halls, arenas: a roof and a PA", rows: rooms.sort(byCount), thin: "one room so far. more on the way." },
  ].filter((p) => p.rows.length > 0);
  const total = fields.length + rooms.length;

  return (
    <main data-od="venues-index" className="pg">
      <JsonLd data={[breadcrumbs([["Home", "/"], ["Fields + Rooms", "/venues"]]), itemList("Festivals and venues", [...fields, ...rooms].map((v) => ({ path: `/venues/${v.slug}`, name: v.name })))]} />
      <PageHead
        trail={[{ label: "Fields + Rooms" }]}
        lines={["Fields", "+ Rooms"]}
        data={total ? `${fields.length} ${fields.length === 1 ? "field" : "fields"} /// ${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}` : undefined}
        note="where it happened"
      />
      {/* Pages climbing in search (src/lib/rising.ts). Unstyled for now (designer). */}
      <RisingLinks />
      {total === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>No fields or rooms on the wall yet.</p>
        </EmptyNote>
      ) : (
        <div className="pg-where">
          {piles.map((p) => (
            <section key={p.id} aria-labelledby={`where-${p.id}`}>
              <h2 id={`where-${p.id}`} className="zn-marker pg-where-title" data-size="big">
                {p.title}
              </h2>
              <p className="zn-label pg-where-sub">{p.sub}</p>
              <ul>
                {p.rows.map((v) => (
                  <li key={v.slug}>
                    <Link href={`/venues/${v.slug}`} className="hm-venue">
                      <span className="hm-venue-name">{v.name}</span>
                      <span className="hm-venue-dots" aria-hidden="true" />
                      <span className="zn-data hm-venue-place">
                        {[[v.city, v.country].filter(Boolean).join(", "), gigs(v.count)].filter(Boolean).join(" /// ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {p.rows.length === 1 && <p className="hm-where-thin">{p.thin}</p>}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
