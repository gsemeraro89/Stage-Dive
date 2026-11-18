// Map page (phase 4, step 2): type an artist, similar artists placed around it, closer = more alike.
// /map?artist=<slug> or /map?q=<text>; without either it starts from today's featured artist.
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyNote } from "@/components/gig/PageHead";
import { lineFromCard } from "@/components/ui/ArtistLine";
import { MapGenres } from "@/components/ui/MapGenres";
import { MapSearch } from "@/components/ui/MapSearch";
import { MapView } from "@/components/ui/MapView";
import { defaultMapArtist, filterOptions, findArtistByText, getMap, mapArtistIndex } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find your next band",
  description: "Type a band and find the ones like them. Every name plays a full concert in one click.",
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = one(params.q)?.trim().slice(0, 80) ?? "";
  const genres = (one(params.genres) ?? "").split(",").filter((g) => SLUG.test(g));
  let slug = one(params.artist)?.toLowerCase() ?? "";
  if (!SLUG.test(slug)) slug = "";
  const searched = q ? await findArtistByText(q) : null;
  if (!slug) slug = searched?.slug ?? (q ? "" : ((await defaultMapArtist()) ?? ""));
  const [map, index, options] = await Promise.all([slug ? getMap(slug, genres) : null, mapArtistIndex(), filterOptions()]);

  // Every link on the page keeps the artist; the genre links change the genres.
  const href = (next: { genres: string[] }) =>
    `/map?artist=${slug}${next.genres.length ? `&genres=${next.genres.join(",")}` : ""}`;
  const suffix = genres.length ? `&genres=${genres.join(",")}` : "";
  const toggle = (g: string) => (genres.includes(g) ? genres.filter((x) => x !== g) : [...genres, g]);

  return (
    <main data-od="map" className="pg">
      <header className="od-map-head">
        <div className="od-map-top">
          <div className="od-rail meta">
            <h1>Find your next band</h1>
            {map && (
              <span>
                {map.artists.length} {map.artists.length === 1 ? "band" : "bands"} around {map.centre.name}
              </span>
            )}
          </div>
        </div>
        <MapSearch key={map?.centre.slug ?? q} artists={index} id="map-q" value={q || map?.centre.name || ""}>
          {genres.length > 0 && <input type="hidden" name="genres" value={genres.join(",")} />}
        </MapSearch>
        {map && (
          <MapGenres
            key={genres.join(",")}
            genres={options.genres.map((g) => ({ slug: g.slug, name: g.name, href: href({ genres: toggle(g.slug) }), on: genres.includes(g.slug) }))}
            clearHref={genres.length > 0 ? href({ genres: [] }) : undefined}
          />
        )}
      </header>

      {!map ? (
        <div data-od="map-empty">
          <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
            <p>{q ? `No band on the wall matches “${q}”.` : "That band is not on the wall."} Check the spelling or yell a different band.</p>
            <Link href="/map" className="hm-more">
              START FROM TODAY’S BAND &gt;&gt;
            </Link>
          </EmptyNote>
        </div>
      ) : map.artists.length === 0 ? (
        <div data-od="map-empty">
          <EmptyNote lines={["No one", "nearby. Yet."]}>
            <p>
              {genres.length
                ? `No bands around ${map.centre.name} in ${genres.length === 1 ? "this genre" : "these genres"}.`
                : `We have not worked out who sounds like ${map.centre.name} yet. The wall is still small.`}
            </p>
            {genres.length > 0 ? (
              <Link href={href({ genres: [] })} className="hm-more">
                SHOW ALL GENRES &gt;&gt;
              </Link>
            ) : (
              <Link href={`/artists/${map.centre.slug}`} className="hm-more">
                GIGS BY {map.centre.name} &gt;&gt;
              </Link>
            )}
          </EmptyNote>
        </div>
      ) : (
        <MapView
          key={`${map.centre.slug}:${genres.join(",")}`}
          centre={lineFromCard(map.centre)}
          artists={map.artists.map((a) => ({ ...lineFromCard(a), x: a.x, y: a.y }))}
          suffix={suffix}
        />
      )}
    </main>
  );
}
