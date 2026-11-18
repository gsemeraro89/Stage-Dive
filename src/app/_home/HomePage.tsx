// The home page (owner choice, 17 Nov 2026): "Places" with "Four ways in". The catalogue shown
// through where the concerts were played: a reel of pictures (festivals, special locations, clubs),
// an atlas of places, the latest uploads, the artists, the four ways in closed by the
// "If you like ___" search line, and the chart. DESIGN.md section 9, "Home".
import Link from "next/link";
import { ChartList, LeadGrid } from "@/components/catalogue/ConcertTile";
import { ArtistSquares } from "@/components/ui/ArtistSquares";
import { AtlasRows, LatestStrip, PlaceReel, Plate, WordRows, type ReelFrame, type WordRow } from "@/components/ui/Home";
import { MapSearch } from "@/components/ui/MapSearch";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { CLUB, FESTIVAL, homeData, SETS_HREF, concertsHref, SPECIAL } from "./home-data";

// The reel: which setting each frame stands for. Special locations lead and come back most often.
const REEL_ORDER = [SPECIAL, FESTIVAL, CLUB, SPECIAL, SPECIAL, FESTIVAL, CLUB, SPECIAL, SPECIAL, FESTIVAL, CLUB, SPECIAL];
const REEL_NAMES: Record<string, string> = { [SPECIAL]: "Special locations", [FESTIVAL]: "Festivals", [CLUB]: "Clubs" };

export default async function HomePage() {
  const data = await homeData();
  const { totals } = data;
  const count = (slug: string) => data.settings.find((s) => s.slug === slug)?.count ?? 0;
  const kicker = (slug: string) => ({
    label: `${REEL_NAMES[slug]} · ${count(slug)} ${count(slug) === 1 ? "concert" : "concerts"}`,
    href: concertsHref({ setting: slug }),
  });

  // The reel is filled first, so it gets the best pictures. The cover picks open it.
  const specialPicks = [...data.picks.cover, ...data.picks.places];
  const picksFor: Record<string, { id: string }[]> = {
    [SPECIAL]: specialPicks,
    [FESTIVAL]: data.picks.festival,
    [CLUB]: data.picks.club,
  };
  const frames: ReelFrame[] = REEL_ORDER.flatMap((slug) =>
    data.take(picksFor[slug], 1, slug).map((concert) => ({ concert, kicker: kicker(slug) })),
  );

  const plates = data.take(data.picks.places, 2, SPECIAL);
  // The list names places in words, so it may repeat a place that has a picture in the reel.
  const atlas = data.take(data.picks.places, 14, SPECIAL, true)
    .filter((s) => !plates.some((p) => p.youtubeId === s.youtubeId))
    .slice(0, 12);

  const ways: WordRow[] = [
    {
      word: "Artists",
      count: totals.artists,
      href: "/artists",
      line: "Every concert of an artist on one page, newest first.",
      links: data.topArtists.slice(0, 6).map((a) => ({ label: a.name, href: `/artists/${a.slug}` })),
      more: "A–Z index",
    },
    {
      word: "Festivals",
      count: totals.festivals,
      href: "/venues",
      line: "Main stages, deserts and open airs, concert by concert.",
      links: data.topVenues.slice(0, 5).map((v) => ({ label: v.name, href: `/venues/${v.slug}` })),
      more: "All festivals",
    },
    {
      word: "Genres",
      count: totals.genres,
      href: "/genres",
      line: "From techno to afro house.",
      links: data.genres.map((g) => ({ label: g.name, href: `/genres/${g.slug}` })),
      more: "All genres",
    },
    {
      word: "Settings",
      count: totals.settings,
      href: SETS_HREF,
      line: "Where it was played: a festival, a club, a studio, or somewhere no one had played before.",
      links: data.settings.map((s) => ({ label: `${s.name} (${s.count})`, href: concertsHref({ setting: s.slug }) })),
      more: "All concerts",
    },
  ];

  return (
    <main data-od="home">
      <section className="od-places" aria-labelledby="home-title" data-od="hero">
        <h1 id="home-title">
          <span className="meta od-acid">Free full-length electronic DJ concerts from</span>
          <span className="display">
            Festivals. <span className="od-outline">Clubs.</span> Rooftops. <span className="od-outline">Deserts.</span>
          </span>
        </h1>
        <div className="od-places-side">
          <p className="od-home-pitch">
            FullDJSet is the index of full DJ concerts on YouTube: every one free, every one played on this page. Start
            from a place, an artist, a festival or a genre, or tell us who you like and we find your next DJ.
          </p>
          <div className="od-home-actions">
            <Link href={SETS_HREF} className="od-play">
              Browse {totals.concerts} concerts
            </Link>
            <Link href="/map" className="od-link">
              Find your next DJ
            </Link>
          </div>
        </div>
        <PlaceReel frames={frames} />
      </section>

      {atlas.length > 0 && (
        <section className="od-section" aria-labelledby="atlas" data-od="atlas-section">
          <SectionHead
            id="atlas"
            title="The atlas"
            note={`${count2(count(SPECIAL))} special locations`}
            href={concertsHref({ setting: SPECIAL })}
            linkLabel="All special locations"
          />
          <div className={`od-atlas-grid${plates.length === 0 ? " od-atlas-grid--list" : ""}`}>
            {plates.length > 0 && (
              <div className="od-atlas-plates">
                {plates.map((concert) => (
                  <Plate key={concert.id} concert={concert} sizes="(min-width: 761px) 40vw, 100vw" />
                ))}
              </div>
            )}
            <AtlasRows concerts={atlas} label="Concerts by place" />
          </div>
        </section>
      )}

      <section className="od-section" aria-labelledby="latest" data-od="latest">
        <LatestStrip newest={data.latest[0]} concerts={totals.concerts} artists={totals.artists} />
        <SectionHead id="latest" title="Latest uploads" note={count2(data.latest.length)} href={concertsHref({ sort: "newest" })} linkLabel="All concerts" />
        <LeadGrid concerts={data.latest} label="Latest uploads" />
      </section>

      <section className="od-section od-section--bleed" aria-labelledby="artists" data-od="artists">
        <SectionHead id="artists" title="Artists" note={count2(totals.artists)} href="/artists" linkLabel="A–Z index" />
        <ArtistSquares artists={data.topArtists} allTile={{ count: totals.artists }} label="Artists" />
      </section>

      <section className="od-section" aria-labelledby="ways" data-od="ways">
        <SectionHead id="ways" title="Four ways in" />
        <WordRows rows={ways} />
        <div className="od-wordrows-ask">
          <p className="meta od-muted">Or start from someone you already like</p>
          <MapSearch artists={data.mapIndex} id="home-map-q" lead />
        </div>
      </section>

      <section className="od-section" aria-labelledby="most-watched" data-od="most-watched">
        <SectionHead id="most-watched" title="Most watched" note="All-time" href={concertsHref({ sort: "most-viewed" })} linkLabel="Full chart" />
        <ChartList concerts={data.mostWatched} label="Most watched" />
      </section>
    </main>
  );
}
