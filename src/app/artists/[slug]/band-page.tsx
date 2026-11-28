// Band page (brand book board 06): the band's photo with its name cut across it, "Start here", every
// full gig as a row, bands that make the same noise, where else the band turns up, and a closed FAQ.
// Styles: src/styles/pages.css (bp-). Data: getArtistPage.
// Shared by /artists/<slug> (newest first, served ready-made) and the sorted views ("?sort=length",
// rewritten by src/proxy.ts to ./sorted/[sort], which are noindex and canonical to the main page).
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { YouTubePicture } from "@/components/gig/GigPicture";
import { GigRows } from "@/components/gig/GigRows";
import { Crumbs, EmptyNote, SectionTitle } from "@/components/gig/PageHead";
import { cutName, hoursOf, kindWord, placeYear, yearSpan } from "@/components/gig/words";
import { LatestNews } from "@/components/news/LatestNews";
import { PlayButton } from "@/components/player/PlayButton";
import { PaperStrip, PhotoFrame, PlayGlyph, Sheet, Staple, StripHeading, Tape } from "@/components/zine";
import { bootlegNote, FAN_SECTION_TITLE, splitBootlegs, startHere } from "@/lib/bootlegs";
import { decadeOf } from "@/lib/catalogue";
import { formatDuration } from "@/lib/format";
import { bandNewsPath } from "@/lib/news/hubs";
import { bandNewsBlock, bandNewsQuestions } from "@/lib/news/queries";
import { bandPhotoFor } from "@/lib/photos/view";
import { toTrack } from "@/lib/player-types";
import { avatarSources, getArtistPage, type ConcertView } from "@/lib/queries";
import { JsonLd } from "@/components/seo/JsonLd";
import { bandAnswers, bandStatLines, bandStatsFor } from "@/lib/answers";
import { bandSongsPath, songPath, songTally } from "@/lib/songs";
import { artistUrl, LIVE_ALBUMS_SHOWN } from "@/lib/live-albums";
import { bandIsStrong, bandSearchDescription, bandSearchTitle, robotsFor, shareImages } from "@/lib/seo";
import { bandJsonLd, bandSameAs, breadcrumbs, elsewhereLinks, faqPage } from "@/lib/structured-data";

// One database read per request, shared by the page and its title/description.
const load = cache(getArtistPage);
const loadPhoto = cache(bandPhotoFor);

export const SORTS = { year: "newest first", length: "by length", watched: "most watched" } as const;
export type Sort = keyof typeof SORTS;

export function isSort(s: string | undefined): s is Sort {
  return s !== undefined && s in SORTS;
}

/** Title, description, canonical, robots and share card. A sorted view is never indexed on its own. */
export async function bandMetadata(slug: string, sort: Sort): Promise<Metadata> {
  const [page, photo] = await Promise.all([load(slug), loadPhoto(slug)]);
  if (!page) return {};
  const { artist, concerts, setlists, liveAlbums } = page;
  const answers = bandAnswers(artist, concerts, setlists, liveAlbums);
  const description = bandSearchDescription(artist, { concerts: concerts.length, setlists: concerts.filter((c) => c.hasSetlist).length }, answers.lead);
  const title = bandSearchTitle(artist.name, concerts.some((c) => c.hasSetlist));
  const path = `/artists/${artist.slug}`;
  const still = concerts.find((c) => c.youtubeId === artist.coverYoutubeId) ?? concerts[0];
  return {
    title,
    description,
    alternates: { canonical: path, types: { "text/markdown": `${path}.md` } },
    robots: robotsFor(sort === "year" && bandIsStrong({ concerts: concerts.length, bio: artist.bio })),
    openGraph: { title, description, url: path, type: "profile", images: shareImages(photo?.src ?? still?.thumbnail.src) },
    twitter: { card: "summary_large_image", title, description },
  };
}

function sorted(concerts: ConcertView[], sort: Sort): ConcertView[] {
  const list = [...concerts];
  if (sort === "length") return list.sort((a, b) => b.durationSeconds - a.durationSeconds || a.id - b.id);
  if (sort === "watched") return list.sort((a, b) => b.viewCount - a.viewCount || a.id - b.id);
  // Newest first (owner, 18 Nov 2026): by year, then by the day it was played; a gig known only by its
  // year comes last in that year, and one with no year at the very end.
  const day = (c: ConcertView) => c.performedOn?.getTime() ?? -Infinity;
  return list.sort((a, b) => (b.performedYear ?? -1) - (a.performedYear ?? -1) || day(b) - day(a) || a.id - b.id);
}

/** Songs listed under "Songs played live" (the rest are on the band's songs page). */
const TOP_LIVE_SONGS = 10;

/** Gigs shown before "Show more" (owner, 18 Nov 2026). */
const FIRST_GIGS = 10;

const NOISE_TILTS = [-2, 1.5, -1, 2, -1.5, 1];

export async function BandPage({ slug, sort }: { slug: string; sort: Sort }) {
  const [page, photo, news] = await Promise.all([load(slug), loadPhoto(slug), bandNewsBlock(slug)]);
  if (!page) notFound();
  const { artist, concerts, similar, setlists, ids, liveAlbums } = page;
  // AEO: the answer-first lead under the name, and the questions in a closed FAQ at the bottom (owner
  // choice); FAQPage structured data carries exactly the questions shown.
  const answers = bandAnswers(artist, concerts, setlists, liveAlbums);
  // "Is <band> touring?" from our newest tour article of the last six months, only when there is one.
  const questions = [...answers.questions, ...bandNewsQuestions(artist.name, news)];
  // Live statistics and songs played live, from the band's own setlists (src/lib/band-stats.ts, src/lib/songs.ts).
  const stats = bandStatsFor(artist.name, concerts, setlists);
  const statLines = bandStatLines(stats).map((l) => ({
    ...l,
    href: l.id === "opener" && stats.opener ? songPath(artist.slug, stats.opener.slug) : l.id === "closer" && stats.closer ? songPath(artist.slug, stats.closer.slug) : l.href,
  }));
  const liveSongs = songTally(setlists);
  // Where the band is known elsewhere (src/lib/entity-links.ts): the same links as sameAs, plus a setlist.fm search.
  const elsewhere = elsewhereLinks(artist.name, ids);
  const genreNames = [...new Set(concerts.flatMap((c) => c.genres.map((g) => g.name)))];
  // Official concerts are the main list; bootlegs come after them, in their own section (owner, 20 Nov 2026).
  const { official, bootlegs } = splitBootlegs(concerts);
  const rows = sorted(official, sort);
  const fanRows = sorted(bootlegs, sort);
  const pick = startHere(concerts);
  const best = pick?.pick;
  // The band's own YouTube picture: the still chosen for the band, else its newest gig (official first).
  const still = concerts.find((c) => c.youtubeId === artist.coverYoutubeId) ?? official[0] ?? concerts[0];
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
      <JsonLd
        data={[
          bandJsonLd(artist, concerts, { image: photo?.src ?? still?.thumbnail.src, sameAs: bandSameAs(ids), genres: genreNames }),
          breadcrumbs([
            ["Home", "/"],
            ["Bands", "/artists"],
            [artist.name, `/artists/${artist.slug}`],
          ]),
          questions.length ? faqPage(questions) : null,
        ]}
      />
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
                {/* An official concert first; a bootleg only when there is none, and then it says so (src/lib/bootlegs.ts). */}
                {pick && (
                  <span data-od="start-here-pick" data-bootleg={best.bootleg ? "" : undefined}>
                    {pick.before}
                    <Link href={`/concerts/${best.slug}`}>{placeYear(best) || best.title}</Link>
                    {pick.after}
                  </span>
                )}
              </p>
              {(artist.label || artist.aka) && (
                <p className="zn-label bp-facts" data-od="artist-facts">
                  {[artist.label ? `Label: ${artist.label}` : null, artist.aka ? `Also written: ${artist.aka}` : null].filter(Boolean).join(" /// ")}
                </p>
              )}
              <PlayButton track={toTrack(best)} className="zn-btn bp-play" visibleText={`Play it loud /// ${formatDuration(best.durationSeconds)}`}>
                <PlayGlyph />
                Play it loud /// {formatDuration(best.durationSeconds)}
              </PlayButton>
            </Sheet>
          )}
        </div>

        <div className="bp-main">
          <p className="bp-lead" data-od="band-lead">
            {answers.lead}
          </p>
          {concerts.length === 0 ? (
            <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
              <p>Every gig by {artist.name} is off the wall right now. They come back when the videos do.</p>
            </EmptyNote>
          ) : official.length === 0 ? null : (
            <section aria-labelledby="every-gig" data-od="archive">
              <div className="pg-block-head">
                <SectionTitle id="every-gig">{official.length === 1 ? "1 full gig" : `${official.length} full gigs`}</SectionTitle>
                {official.length >= 3 ? (
                  <p className="zn-data bp-sorts">
                    <span className="od-sr">Sort: </span>
                    {(Object.keys(SORTS) as Sort[]).map((s, i) => (
                      <span key={s}>
                        {i > 0 && " /// "}
                        {s === sort ? (
                          <span aria-current="true">{s === "year" ? "newest first" : SORTS[s]}</span>
                        ) : (
                          <Link href={s === "year" ? `/artists/${artist.slug}` : `/artists/${artist.slug}?sort=${s}`} scroll={false}>
                            {SORTS[s]}
                          </Link>
                        )}
                      </span>
                    ))}
                  </p>
                ) : (
                  <span className="zn-label">{[yearSpan(official), hoursOf(official)].filter(Boolean).join(" /// ")}</span>
                )}
              </div>
              <GigRows concerts={rows.slice(0, FIRST_GIGS)} label={`Every full gig by ${artist.name}`} lead="year" name="place" />
              {rows.length > FIRST_GIGS && (
                // Native <details>: the rest is in the page for search engines and works without JavaScript.
                <details className="bp-more" data-od="more-gigs">
                  <summary className="hm-more">
                    {/* One label shows at a time (CSS); the hidden one is out of the accessibility tree too. */}
                    <span className="bp-more-closed">SHOW MORE ({rows.length - FIRST_GIGS}) &gt;&gt;</span>
                    <span className="bp-more-open">SHOW FEWER &lt;&lt;</span>
                  </summary>
                  <GigRows concerts={rows.slice(FIRST_GIGS)} label={`More full gigs by ${artist.name}`} lead="year" name="place" />
                </details>
              )}
              {concerts.length === 1 && <p className="zn-marker bp-thin">one so far. more when we find them.</p>}
            </section>
          )}

          {fanRows.length > 0 && (
            // Unstyled for now (designer): bootlegs, after the official gigs (owner, 20 Nov 2026). Each row carries
            // its "Bootleg" label (data-od="bootleg-label"); the page and its rows never call them uploads.
            <section aria-labelledby="from-the-fans" data-od="band-bootlegs" className="bp-fans">
              <div className="pg-block-head">
                <SectionTitle id="from-the-fans" tilt={-1} small>
                  {FAN_SECTION_TITLE}
                </SectionTitle>
                <span className="zn-label">{fanRows.length === 1 ? "1 bootleg" : `${fanRows.length} bootlegs`}</span>
              </div>
              <p className="bp-fans-note" data-od="band-bootlegs-note">
                {bootlegNote(fanRows.length, official.length > 0)}
              </p>
              <GigRows concerts={fanRows} label={`Bootlegs of ${artist.name}`} lead="year" name="place" />
            </section>
          )}

          {statLines.length > 0 && (
            // Unstyled for now (designer): figures from the band's concerts and setlists, each backed by two or more.
            <section aria-labelledby="live-stats" data-od="band-stats" className="bp-stats">
              <SectionTitle id="live-stats" tilt={1} small>
                {artist.name} live, in numbers
              </SectionTitle>
              <dl>
                {statLines.map((l) => (
                  <div key={l.id} data-stat={l.id}>
                    <dt>{l.label}</dt>
                    <dd>{l.href ? <Link href={l.href}>{l.value}</Link> : l.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {liveSongs.length > 0 && (
            // Unstyled for now (designer): the songs in the band's setlists, most played first, each with its own page.
            <section aria-labelledby="live-songs" data-od="band-live-songs" className="bp-songs">
              <SectionTitle id="live-songs" tilt={-1} small>
                Songs played live
              </SectionTitle>
              <ol className="bp-songs-list">
                {liveSongs.slice(0, TOP_LIVE_SONGS).map((song) => (
                  <li key={song.slug}>
                    <Link href={songPath(artist.slug, song.slug)}>
                      <span className="bp-song-name">{song.title}</span>{" "}
                      <span className="zn-data">{song.count === 1 ? "1 setlist" : `${song.count} setlists`}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              <Link href={bandSongsPath(artist.slug)} className="hm-more bp-songs-all">
                EVERY SONG ({liveSongs.length}) &gt;&gt;
              </Link>
            </section>
          )}

          {liveAlbums.length > 0 && (
            // Unstyled for now (designer): the band's live albums from MusicBrainz (src/lib/live-albums.ts), oldest
            // first, each linking to its MusicBrainz page (nofollow); one recorded at a concert of ours links to it.
            <section aria-labelledby="live-albums" data-od="band-live-albums" className="bp-albums">
              <SectionTitle id="live-albums" tilt={1} small>
                Live albums
              </SectionTitle>
              <ol className="bp-albums-list">
                {liveAlbums.slice(0, LIVE_ALBUMS_SHOWN).map((a) => (
                  <li key={a.mbid} data-od="live-album">
                    <a href={a.url} rel="nofollow noopener" className="bp-album-name">
                      {a.title}
                    </a>
                    {a.year && <span className="zn-data bp-album-year"> {a.year}</span>}
                    {a.concert && (
                      <>
                        {" "}
                        <Link href={`/concerts/${a.concert.slug}`} data-od="live-album-concert">
                          watch the concert
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              <p className="zn-label bp-albums-source" data-od="live-albums-source">
                From{" "}
                {ids.mbid ? (
                  <a href={artistUrl(ids.mbid)} rel="nofollow noopener">
                    MusicBrainz
                  </a>
                ) : (
                  "MusicBrainz"
                )}
                {liveAlbums.length > LIVE_ALBUMS_SHOWN ? `, ${liveAlbums.length - LIVE_ALBUMS_SHOWN} more there` : ""}.
              </p>
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

          {elsewhere.length > 0 && (
            // One small line of outbound links, as a list: the separators between them are CSS (designer),
            // so a wrapped line never starts with one. A <div>, since a list cannot sit inside a <p>.
            <div className="zn-label bp-elsewhere" data-od="band-elsewhere">
              <span className="bp-elsewhere-label">Elsewhere: </span>
              <ul className="bp-elsewhere-list" aria-label={`${artist.name} elsewhere`}>
                {elsewhere.map((l) => (
                  <li key={l.id} data-link={l.id}>
                    {/* setlist.fm is a search, not the band's own record: not vouched for (nofollow). */}
                    <a href={l.href} rel={l.sameAs ? "noopener" : "nofollow noopener"}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* News about the band (src/lib/news), unstyled: nothing when there is none. */}
          {/* "All <band> news" leads to the band's news page (/artists/<slug>/news). */}
          <LatestNews items={news.latest} about={artist.name} moreHref={bandNewsPath(artist.slug)} moreLabel={`All ${artist.name} news (${news.total})`} />

          {questions.length > 0 && (
            // Closed by default (owner choice); native <details>, so the answers are in the page for
            // search engines and assistants and work without JavaScript.
            <details className="pg-faq" data-od="faq">
              <summary>Questions about {artist.name}</summary>
              <dl>
                {questions.map((q) => (
                  <div key={q.question}>
                    <dt>{q.question}</dt>
                    <dd>
                      {q.answer}
                      {q.link && (
                        // The news article the answer comes from.
                        <>
                          {" "}
                          <Link href={q.link.href} data-od="faq-news-link">
                            {q.link.text}
                          </Link>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
