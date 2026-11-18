// Band page (brand book board 06): the band's photo with its name cut across it, "Start here", every
// full gig as a row, bands that make the same noise, and where else the band turns up.
// Styles: src/styles/pages.css (bp-). Data: getArtistPage.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { YouTubePicture } from "@/components/gig/GigPicture";
import { GigRows } from "@/components/gig/GigRows";
import { Crumbs, EmptyNote, SectionTitle } from "@/components/gig/PageHead";
import { cutName, hoursOf, kindWord, placeYear, yearSpan } from "@/components/gig/words";
import { PlayButton } from "@/components/player/PlayButton";
import { PaperStrip, PhotoFrame, PlayGlyph, Sheet, Staple, StripHeading, Tape } from "@/components/zine";
import { computeArtistStats } from "@/lib/artist-stats";
import { decadeOf } from "@/lib/catalogue";
import { formatDuration } from "@/lib/format";
import { bandPhotoFor } from "@/lib/photos/view";
import { toTrack } from "@/lib/player-types";
import { avatarSources, getArtistPage, type ConcertView } from "@/lib/queries";
import { compactNumber } from "@/lib/site";
import { bandJsonLd, jsonLd } from "@/lib/structured-data";

// One database read per request, shared by the page and its title/description.
const load = cache(getArtistPage);

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { artist, concerts } = page;
  const stats = computeArtistStats(concerts);
  const description = [
    `${stats.concerts} full ${stats.concerts === 1 ? "concert" : "concerts"} by ${artist.name} to watch free: ${stats.hours} ${stats.hours === 1 ? "hour" : "hours"} of music.`,
    artist.bio,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
  return {
    title: `${artist.name} — full concerts`,
    description,
    alternates: { canonical: `/artists/${artist.slug}` },
    openGraph: { title: artist.name, description, images: concerts[0] ? [concerts[0].thumbnail.src] : undefined },
  };
}

const SORTS = { year: "by year", length: "by length", watched: "most watched" } as const;
type Sort = keyof typeof SORTS;

function sorted(concerts: ConcertView[], sort: Sort): ConcertView[] {
  const list = [...concerts];
  if (sort === "length") return list.sort((a, b) => b.durationSeconds - a.durationSeconds || a.id - b.id);
  if (sort === "watched") return list.sort((a, b) => b.viewCount - a.viewCount || a.id - b.id);
  return list.sort((a, b) => (a.performedYear ?? 9999) - (b.performedYear ?? 9999) || a.id - b.id);
}

const NOISE_TILTS = [-2, 1.5, -1, 2, -1.5, 1];

export default async function ArtistPage({ params, searchParams }: Props) {
  const slug = (await params).slug;
  const [page, photo, query] = await Promise.all([load(slug), bandPhotoFor(slug), searchParams]);
  if (!page) notFound();
  const { artist, concerts, similar } = page;
  const sort: Sort = typeof query.sort === "string" && query.sort in SORTS ? (query.sort as Sort) : "year";
  const rows = sorted(concerts, sort);
  const best = sorted(concerts, "watched")[0];
  // The band's own YouTube picture: the still chosen for the band, else its newest gig.
  const still = concerts.find((c) => c.youtubeId === artist.coverYoutubeId) ?? concerts[0];
  const avatar = artist.coverUseAvatar && artist.imageUrl ? avatarSources(artist.imageUrl) : null;

  const topGenre = [...new Map(concerts.flatMap((c) => c.genres).map((g) => [g.slug, g])).values()];
  const data = [artist.origin, artist.bornYear ? `born ${artist.bornYear}` : null, artist.style ?? topGenre[0]?.name]
    .filter(Boolean)
    .join(" /// ");

  // "Seen in": every decade, genre, field, room and tour the band's gigs are filed under.
  const seen = new Map<string, { href: string; name: string; kind: string }>();
  for (const c of sorted(concerts, "year")) {
    if (c.performedYear) {
      const d = decadeOf(c.performedYear);
      seen.set(`d${d}`, { href: `/decades/${d}`, name: `The ${d}`, kind: "Decade" });
    }
  }
  for (const c of concerts) for (const g of c.genres) seen.set(`g${g.slug}`, { href: `/genres/${g.slug}`, name: g.name, kind: "Genre" });
  for (const c of concerts)
    if (c.venue) seen.set(`v${c.venue.slug}`, { href: `/venues/${c.venue.slug}`, name: c.venue.name, kind: kindWord(c.venueKind) ?? "Place" });
  for (const c of concerts) if (c.tour) seen.set(`t${c.tour.slug}`, { href: `/tours/${c.tour.slug}`, name: c.tour.name, kind: "Tour" });

  const name = (
    <>
      <StripHeading as="h1" size="h1" lines={cutName(artist.name)} keyline className="bp-name" />
      {data && (
        <PaperStrip as="p" hand="type" tone="black" keyline tilt={1} className="bp-data">
          {data}
        </PaperStrip>
      )}
    </>
  );

  return (
    <main data-od="artist" className="pg bp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(bandJsonLd(artist, concerts)) }} />
      <Crumbs trail={[{ label: "Bands", href: "/artists" }, { label: artist.name.replace(/^the /i, "").charAt(0).toUpperCase() }, { label: artist.name }]} />

      <div className="bp-top">
        <div className="bp-side" style={{ "--chars": Math.max(...cutName(artist.name).map((l) => l.length), 4) } as CSSProperties}>
          {photo ? (
            // A licensed photo, photocopied: it may be cropped and the name may lie on it. Its credit is always shown.
            <PhotoFrame
              kind="treated"
              src={photo.src}
              alt={`${artist.name}, photocopied`}
              ratio="47 / 32"
              tilt={-2}
              shadow
              eager
              sizes="(min-width: 901px) 470px, 100vw"
              credit={photo.credit}
              creditHref={photo.sourcePage}
              className="bp-photo"
            >
              {name}
            </PhotoFrame>
          ) : avatar ? (
            // The band's YouTube channel picture, exactly as YouTube serves it.
            <PhotoFrame
              kind="youtube"
              src={avatar.src}
              srcSet={avatar.srcSet}
              width={avatar.width}
              height={avatar.height}
              alt={`${artist.name}: the band's picture`}
              tilt={-2}
              shadow
              eager
              sizes="(min-width: 901px) 300px, 70vw"
              className="bp-photo bp-photo--avatar"
            >
              {name}
            </PhotoFrame>
          ) : still ? (
            <YouTubePicture
              concert={still}
              tilt={-2}
              shadow
              eager
              sizes="(min-width: 901px) 470px, 100vw"
              className="bp-photo"
            >
              {name}
            </YouTubePicture>
          ) : (
            <div className="bp-photo">{name}</div>
          )}

          {/* With a band photo up top, a still from one of the gigs is stapled under it: whole and untouched. */}
          {(photo || avatar) && still && (
            <div className="bp-second">
              <Staple at="top-left" tilt={-10} />
              <YouTubePicture concert={still} tilt={3} shadow sizes="(min-width: 901px) 290px, 62vw" />
            </div>
          )}

          {best && (
            <Sheet title="Start here" level={2} tilt={-1} fixings={<Tape at="top-right" tilt={4} width={100} />} className="bp-start">
              {artist.bio && (
                <p className="bp-bio" data-od="bio">
                  {artist.bio}
                </p>
              )}
              <p className="bp-bio">
                {concerts.length === 1 ? "One full gig" : `${concerts.length} full gigs`}, {hoursOf(concerts)} of band.{" "}
                {concerts.length > 1 ? (
                  <>
                    If you watch one, make it <Link href={`/concerts/${best.slug}`}>{placeYear(best) || best.title}</Link>: it is the one
                    YouTube has watched most ({compactNumber(best.viewCount)} views).
                  </>
                ) : (
                  <>
                    It is <Link href={`/concerts/${best.slug}`}>{placeYear(best) || best.title}</Link>, the whole set.
                  </>
                )}
              </p>
              {(artist.label || artist.aka) && (
                <p className="zn-label bp-facts" data-od="artist-facts">
                  {[artist.label ? `Label: ${artist.label}` : null, artist.aka ? `Also written: ${artist.aka}` : null].filter(Boolean).join(" /// ")}
                </p>
              )}
              <PlayButton track={toTrack(best)} className="zn-btn bp-play">
                <PlayGlyph />
                Play it loud /// {formatDuration(best.durationSeconds)}
              </PlayButton>
            </Sheet>
          )}
        </div>

        <div className="bp-main">
          {concerts.length === 0 ? (
            <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
              <p>Every gig by {artist.name} is off the wall right now. They come back when the videos do.</p>
            </EmptyNote>
          ) : (
            <section aria-labelledby="every-gig" data-od="archive">
              <div className="pg-block-head">
                <SectionTitle id="every-gig">{concerts.length === 1 ? "1 full gig" : `${concerts.length} full gigs`}</SectionTitle>
                {concerts.length >= 3 ? (
                  <p className="zn-data bp-sorts">
                    <span className="od-sr">Sort: </span>
                    {(Object.keys(SORTS) as Sort[]).map((s, i) => (
                      <span key={s}>
                        {i > 0 && " /// "}
                        {s === sort ? (
                          <span aria-current="true">{s === "year" ? "sorted by year" : SORTS[s]}</span>
                        ) : (
                          <Link href={s === "year" ? `/artists/${artist.slug}` : `/artists/${artist.slug}?sort=${s}`} scroll={false}>
                            {SORTS[s]}
                          </Link>
                        )}
                      </span>
                    ))}
                  </p>
                ) : (
                  <span className="zn-label">{[yearSpan(concerts), hoursOf(concerts)].filter(Boolean).join(" /// ")}</span>
                )}
              </div>
              <GigRows concerts={rows} label={`Every full gig by ${artist.name}`} lead="year" name="place" />
              {concerts.length === 1 && <p className="zn-marker bp-thin">one so far. more when we find them.</p>}
            </section>
          )}

          <div className="bp-two">
            {similar.length > 0 && (
              <section aria-labelledby="same-noise" data-od="similar">
                <SectionTitle id="same-noise" tilt={1} small>
                  Same noise
                </SectionTitle>
                <ul className="bp-noise">
                  {similar.map((a, i) => (
                    <li key={a.slug}>
                      <Link
                        href={`/artists/${a.slug}`}
                        className="hm-genre zn-lift"
                        data-tone={i % 2 ? "black" : "white"}
                        style={{ "--tilt": `${NOISE_TILTS[i % NOISE_TILTS.length]}deg`, "--loud": 0.1 } as CSSProperties}
                      >
                        {a.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={`/map?artist=${artist.slug}`} className="hm-more bp-map">
                  FIND YOUR NEXT BAND &gt;&gt;
                </Link>
              </section>
            )}
            {seen.size > 0 && (
              <section aria-labelledby="seen-in" data-od="seen-in">
                <SectionTitle id="seen-in" tilt={-1} small>
                  Seen in
                </SectionTitle>
                <ul className="pg-list">
                  {[...seen.values()].map((s) => (
                    <li key={s.href}>
                      <Link href={s.href}>
                        <span className="pg-list-name">{s.name}</span>
                        <span className="zn-data">{s.kind}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
