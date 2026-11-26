// The homepage: "THE ISSUE" (owner's choice, 24 Nov 2026). The page is this week's zine: a cover story
// you can play, a contents line, then dense pasted-up spreads, and the back pages as four rows of pictures.
// Order: cover (gig of the week, setlist, find a gig, the figures) · the legends · the charts ·
// fresh off the copier · rock news · where it happened · the shelves · the back pages · next band.
// Data: homepageData(). Styles: src/styles/home.css (hm-, hx-, ha-). An empty section is left out.
import Link from "next/link";
import { YouTubePicture } from "@/components/gig/GigPicture";
import { bandName, cutName, placeYear, playedOn } from "@/components/gig/words";
import { NewsList } from "@/components/news/NewsList";
import { PlayButton } from "@/components/player/PlayButton";
import { RisingLinks } from "@/components/seo/RisingLinks";
import { PaperStrip, PhotoFrame, PlayGlyph, Sheet, StripHeading } from "@/components/zine";
import { formatDuration } from "@/lib/format";
import { homepageData, type HomePicture, type HomeTile } from "@/lib/home";
import { toTrack } from "@/lib/player-types";
import type { ConcertView } from "@/lib/queries";
import { NextBand } from "./NextBand";
import { ChartRow, FindAGig, Gig, Head, HomeJsonLd, heroPhotoOf, n, Pic, PhotoNote, placeTown, SetlistSheet, shelvesOf, tilt, usedPhotos, viewsLine } from "./parts";

const LEGEND_TILTS = [-1.2, 1, -0.8, 1.2, -1, 0.7];
const WAY_TILTS = [-1, 0.8, -0.6, 1.1, -0.9, 0.6];
// How wide a tile is drawn, for the browser's choice of picture file.
const WAY_SIZES = {
  decades: "(min-width: 1101px) 13vw, (min-width: 761px) 23vw, 62vw",
  genres: "(min-width: 761px) 23vw, 62vw",
  tours: "(min-width: 1101px) 13vw, (min-width: 761px) 31vw, 62vw",
  songs: "(min-width: 1101px) 13vw, (min-width: 761px) 23vw, 62vw",
};

export default async function HomePage() {
  const data = await homepageData();
  const { hero, legends, places, fresh, bestOf, news, waysIn, nextBand } = data;
  const { totals, gig } = hero;
  const photo = heroPhotoOf(data);
  const shelves = shelvesOf(data);
  const hasNews = Boolean(news.lead);
  const newsItems = news.lead ? [news.lead, ...news.more] : [];
  const platePlaces = places.filter((p) => p.picture).slice(0, 3);

  // A band's photo is glued on the page once (design/DESIGN.md section 6): a way-in tile whose band is
  // already up there (the cover, the legends, an earlier tile) takes a picture of a gig instead.
  const bandsShown = new Set(legends.filter((b) => b.picture?.kind === "band-photo").map((b) => b.slug));
  if (photo && gig) for (const a of gig.concert.artists) bandsShown.add(a.slug);
  const tilePhotos: string[] = [];
  const pictureOf = (t: HomeTile): HomePicture | null => {
    if (t.picture?.kind !== "band-photo" || !t.pictureBand) return t.picture ?? t.fallback;
    if (bandsShown.has(t.pictureBand)) return t.fallback;
    bandsShown.add(t.pictureBand);
    tilePhotos.push(t.picture.photo.src);
    return t.picture;
  };
  // Chosen here, top to bottom, before anything is drawn: the news list is told which photos are taken.
  const ways = {
    decades: waysIn.decades.map((d) => ({ ...d, shown: pictureOf(d) })),
    genres: waysIn.genres.map((g) => ({ ...g, shown: pictureOf(g) })),
    tours: waysIn.tours.map((t) => ({ ...t, shown: pictureOf(t) })),
    songs: waysIn.songs.map((x) => ({ ...x, shown: pictureOf(x) })),
  };

  // "In this issue": the figures as a typed contents list. Each line is a way in.
  const lines: { figure: string; words: string; href?: string }[] = [
    { figure: n(totals.concerts), words: totals.concerts === 1 ? "full gig, the whole set" : "full gigs, the whole set", href: "/concerts" },
    { figure: n(totals.bands), words: totals.bands === 1 ? "band" : "bands", href: "/artists" },
    { figure: n(totals.places), words: `fields + rooms (${n(totals.festivals)} festivals, ${n(totals.venues)} venues)`, href: "/venues" },
    { figure: n(totals.withSetlist), words: "setlists you can click" },
    { figure: n(totals.bootlegs), words: totals.bootlegs === 1 ? "bootleg, from the fans" : "bootlegs, from the fans", href: "/concerts?source=bootleg" },
  ].filter((l) => l.figure !== "0");
  const contents = totals.concerts > 0 && (
    <Sheet as="section" label="In this issue" tilt={0.7} className="ha-contents zn-slap" >
      <div className="zn-sheet-head">
        <h2 className="zn-sheet-title">In this issue</h2>
        <span className="zn-sheet-meta">{data.issue}</span>
      </div>
      <ul data-od="totals">
        {lines.map((l) => {
          const body = (
            <>
              <b>{l.figure}</b>
              <span className="ha-contents-words">{l.words}</span>
              <span className="hm-venue-dots" aria-hidden="true" />
              {l.href && <span aria-hidden="true">&gt;&gt;</span>}
            </>
          );
          return (
            <li key={l.words}>
              {l.href ? (
                <Link href={l.href} className="ha-contents-row">
                  {body}
                </Link>
              ) : (
                <span className="ha-contents-row">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );

  return (
    <main data-od="home" className="hm hx ha">
      <HomeJsonLd data={data} />

      {/* ---------- The cover ---------- */}
      <section className="ha-cover" aria-label="This issue" data-od="hero">
        <div className="ha-mast">
          <StripHeading as="h1" size="h2" lines={["Full rock concerts.", "The whole set."]} first="black" tilts={[-1.5, 1]} className="ha-h1" />
          {data.lead && <p className="ha-lead">{data.lead}</p>}
          <FindAGig id="ha-q" />
        </div>

        {gig && (
          <div className="ha-story" data-od="gig-of-the-week" data-photo={photo ? true : undefined}>
            <div className="ha-story-main">
              {(() => {
                const name = bandName(gig.concert);
                const place = [gig.concert.venue?.name, gig.concert.city].filter(Boolean).join(", ");
                const line = [place, playedOn(gig.concert), formatDuration(gig.concert.durationSeconds)].filter(Boolean).join(" /// ");
                const label = (
                  <PaperStrip hand="marker" tilt={-3}>
                    gig of the week!
                  </PaperStrip>
                );
                const strips = (
                  <>
                    <StripHeading as="h2" size="h1" lines={cutName(name)} keyline />
                    <PaperStrip as="p" hand="type" tone="black" keyline className="hm-hero-data">
                      {line}
                    </PaperStrip>
                  </>
                );
                return photo ? (
                  <PhotoFrame kind="treated" src={photo.src} alt={`${name}, photocopied`} ratio="var(--hero-ratio)" tilt={-1} eager sizes="(min-width: 901px) 58vw, 100vw" credit={photo.credit} creditHref={photo.sourcePage} stamp={label} className="hm-hero-photo zn-slap">
                    {strips}
                  </PhotoFrame>
                ) : (
                  <YouTubePicture concert={gig.concert} sizes="(min-width: 901px) 58vw, 100vw" tilt={-1} eager stamp={label} className="hm-hero-photo zn-slap">
                    {strips}
                  </YouTubePicture>
                );
              })()}
              <div className="hm-hero-actions zn-slap">
                <PlayButton track={toTrack(gig.concert)} className="zn-btn hm-play">
                  <PlayGlyph />
                  Play it loud
                </PlayButton>
                <span className="zn-marker" style={tilt(2)}>
                  1 click. that&rsquo;s it.
                </span>
                <Link href={`/concerts/${gig.concert.slug}`} className="hm-more">
                  THE GIG&rsquo;S PAGE &gt;&gt;
                </Link>
              </div>
              {contents}
            </div>
            <div className="ha-story-side">
              {photo && (
                <YouTubePicture concert={gig.concert} sizes="(min-width: 901px) 36vw, 100vw" tilt={1.5} className="hm-hero-still zn-slap">
                  <PaperStrip hand="type" tone="white" tilt={-1}>
                    STRAIGHT OFF: {gig.concert.channel.name}
                  </PaperStrip>
                </YouTubePicture>
              )}
              <SetlistSheet concert={gig.concert} setlist={gig.setlist} tiltBy={photo ? -0.8 : 1.2} className="zn-slap" />
            </div>
          </div>
        )}
      </section>

      {!gig && <div className="ha-cover-alone">{contents}</div>}

      <p className="zn-band hm-band">
        ONE CLICK AND THE GIG STARTS <span>IT KEEPS PLAYING</span> WHILE YOU DIG THROUGH THE REST
      </p>

      {/* ---------- The legends: the more gigs, the bigger the picture ---------- */}
      {legends.length > 0 && (
        <section className="hm-section" aria-labelledby="ha-legends" data-od="legends">
          <Head id="ha-legends" title="The legends" more={{ href: "/artists", label: <>ALL {n(totals.bands)} BANDS</> }} />
          <ul className="ha-legends">
            {legends.map((b, i) => (
              <li key={b.slug} className="ha-legend" data-rank={i < 2 ? "top" : i < 6 ? "mid" : "rest"} style={tilt(LEGEND_TILTS[i % LEGEND_TILTS.length])}>
                <Pic picture={b.picture} name={b.name} ratio={i < 2 ? "16 / 10" : "4 / 3"} sizes={i < 2 ? "(min-width: 761px) 46vw, 100vw" : i < 6 ? "(min-width: 761px) 23vw, 50vw" : "(min-width: 761px) 15vw, 50vw"}>
                  <PaperStrip tone={i % 2 ? "white" : "black"} size={i < 2 ? "h2" : i < 6 ? "name" : "small"} keyline className="hm-card-name">
                    <Link href={b.href}>{b.name}</Link>
                  </PaperStrip>
                </Pic>
                <p className="zn-data ha-legend-data">
                  {n(b.concerts)} {b.concerts === 1 ? "gig" : "gigs"}
                </p>
              </li>
            ))}
          </ul>
          <PhotoNote show={legends.some((b) => b.picture && b.picture.kind !== "concert")} />
        </section>
      )}

      {/* ---------- Searched this week: pages climbing in search (src/lib/rising.ts) ---------- */}
      <RisingLinks />

      {/* ---------- The charts ---------- */}
      {bestOf.length > 0 && (
        <section className="hm-section hm-section--cut" aria-labelledby="ha-best" data-od="best-of">
          <Head id="ha-best" title="The charts" more={{ href: "/best", label: "EVERY CHART" }} />
          <div className="ha-charts" data-n={bestOf.length}>
            {bestOf.map((r, i) => (
              <Sheet key={r.slug} as="section" label={r.heading} tilt={[-0.6, 0.5, -0.4][i % 3]} className="ha-chart">
                <div className="zn-sheet-head">
                  <h3 className="zn-sheet-title">{r.label}</h3>
                  <span className="zn-sheet-meta">most watched</span>
                </div>
                <ol className="hx-rows">
                  {r.concerts.map((c, k) => (
                    <ChartRow key={c.id} concert={c} rank={k + 1} picture={k === 0} />
                  ))}
                </ol>
                <Link href={r.href} className="hm-more ha-chart-more">
                  THE TOP {Math.min(r.count, 50)} &gt;&gt;
                </Link>
              </Sheet>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Fresh off the copier ---------- */}
      {fresh.length > 0 && (
        <section className="hm-section hm-section--cut" aria-labelledby="ha-fresh" data-od="fresh">
          <Head id="ha-fresh" title="Fresh off the copier" more={{ href: "/concerts", label: "ALL NEW GIGS" }} />
          <ul className="ha-fresh" data-lead={fresh.length >= 5 || undefined}>
            {fresh.map((c, i) => (
              <Gig key={c.id} concert={c} index={i} sizes={i === 0 ? "(min-width: 901px) 46vw, 100vw" : "(min-width: 901px) 22vw, 50vw"} />
            ))}
            <li className="ha-fresh-more">
              <Link href="/concerts" className="ha-fresh-all zn-lift">
                <b>{n(totals.concerts)}</b>
                gigs in the pile. dig in &gt;&gt;
              </Link>
            </li>
          </ul>
        </section>
      )}

      {/* ---------- Rock news ---------- */}
      {hasNews && (
        <section className="hm-section hm-section--cut pg ha-news" aria-labelledby="ha-news" data-od="news">
          <Head id="ha-news" title="Rock news" more={{ href: news.href, label: "ALL THE NEWS" }} />
          <NewsList items={newsItems} label="Rock news" once={[...usedPhotos(data, photo), ...tilePhotos]} />
        </section>
      )}

      {/* ---------- Where it happened: a full-bleed black band ---------- */}
      {places.length > 0 && (
        <section className="hm-where ha-where" aria-labelledby="ha-where" data-od="places">
          <Head id="ha-where" title="Where it happened" tone="white" more={{ href: "/venues", label: <>ALL {n(totals.places)} FIELDS + ROOMS</> }} />
          <div className="ha-where-grid" data-plates={platePlaces.length || undefined}>
            {platePlaces.length > 0 && (
              <ul className="ha-plates">
                {platePlaces.map((p, i) => (
                  <li key={p.slug} style={tilt([-1.5, 1.2, -0.8][i])}>
                    <Pic picture={p.picture} name={p.name} ratio="16 / 10" sizes="(min-width: 901px) 30vw, 100vw">
                      <PaperStrip tone="white" size="name" className="hm-card-name">
                        <Link href={p.href}>{p.name}</Link>
                      </PaperStrip>
                    </Pic>
                  </li>
                ))}
              </ul>
            )}
            <ol className="ha-atlas">
              {places.map((p) => (
                <li key={p.slug}>
                  <Link href={p.href} className="ha-place">
                    <span className="ha-place-top">
                      <span className="hm-venue-name">{p.name}</span>
                      <span className="hm-venue-dots" aria-hidden="true" />
                      <span className="zn-data ha-place-n">
                        {n(p.concerts)} {p.concerts === 1 ? "gig" : "gigs"}
                      </span>
                    </span>
                    <span className="zn-data ha-place-sub">{[placeTown(p), p.years ? (p.years.from === p.years.to ? `${p.years.from}` : `${p.years.from}–${p.years.to}`) : null].filter(Boolean).join(" /// ")}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ---------- The shelves ---------- */}
      {(shelves.hd || shelves.fans || shelves.liveAlbums) && (
        <section className="hm-section" aria-labelledby="ha-shelves" data-od="shelves">
          <Head id="ha-shelves" title="Off the shelves" />
          <div className="ha-shelves">
            {shelves.hd && (
              <Crate id="ha-shelf-hd" kind="hd" title="In HD" count={`${n(shelves.hd.count)} gigs`} href={shelves.hd.href}>
                {shelves.hd.concerts.map((c, k) => (
                  <Gig key={c.id} concert={c} index={k} sizes={crateSizes(k)} data={k === 0 ? crateLead(c) : undefined} />
                ))}
              </Crate>
            )}
            {shelves.fans && (
              <Crate id="ha-shelf-fans" kind="fans" title="From the fans" count={`${n(shelves.fans.count)} bootlegs`} href={shelves.fans.href}>
                {shelves.fans.concerts.map((c, k) => (
                  <Gig key={c.id} concert={c} index={k + 1} sizes={crateSizes(k)} data={k === 0 ? crateLead(c) : undefined} />
                ))}
              </Crate>
            )}
            {shelves.liveAlbums && (
              <Crate id="ha-shelf-albums" kind="live-albums" title="Live albums" count={`${n(shelves.liveAlbums.count)} you can watch`} href={null}>
                {shelves.liveAlbums.albums.map((a, k) => (
                  <Gig key={a.concert.id} concert={a.concert} index={k + 2} sizes={crateSizes(k)} data={`THE ALBUM: ${a.title}${a.year ? ` (${a.year})` : ""}`} />
                ))}
              </Crate>
            )}
          </div>
        </section>
      )}

      {/* ---------- The back pages: four ways in, each a row of pictures ---------- */}
      {(waysIn.decades.length > 0 || waysIn.genres.length > 0 || waysIn.tours.length > 0 || waysIn.songs.length > 0) && (
        <section className="hm-section hm-section--cut" aria-labelledby="ha-ways" data-od="ways-in">
          <Head id="ha-ways" title="The back pages">
            <span className="zn-marker ha-ways-hint">four ways in</span>
          </Head>
          {waysIn.decades.length > 0 && (
            <Way id="ha-way-decades" title="Pick a decade" href="/decades" more="ALL DECADES" kind="decades" count={waysIn.decades.length}>
              {ways.decades.map((d, i) => (
                <WayTile key={d.label} index={i} href={d.href} picture={d.shown} alt={`the ${d.label}`} sizes={WAY_SIZES.decades} big>
                  <span aria-hidden="true">{d.label.slice(2)}</span>
                  <span className="od-sr">The {d.label}</span>
                  <WayCount count={d.count} />
                </WayTile>
              ))}
            </Way>
          )}
          {waysIn.genres.length > 0 && (
            <Way id="ha-way-genres" title="Pick a noise" href="/genres" more="ALL GENRES" kind="genres" count={waysIn.genres.length}>
              {ways.genres.map((g, i) => (
                <WayTile key={g.slug} index={i + 1} href={g.href} picture={g.shown} alt={g.name} sizes={WAY_SIZES.genres}>
                  {g.name}
                  <WayCount count={g.count} />
                </WayTile>
              ))}
            </Way>
          )}
          <div className="ha-way-two" data-both={(waysIn.tours.length > 0 && waysIn.songs.length > 0) || undefined}>
            {waysIn.tours.length > 0 && (
              <Way id="ha-way-tours" title="Follow a tour" href="/tours" more="ALL TOURS" kind="tours" count={waysIn.tours.length}>
                {ways.tours.map((t, i) => (
                  <WayTile key={t.slug} index={i + 2} href={t.href} picture={t.shown} alt={t.band?.name ?? t.name} sizes={WAY_SIZES.tours} by={t.band?.name}>
                    {t.name}
                    <WayCount count={t.count} />
                  </WayTile>
                ))}
              </Way>
            )}
            {waysIn.songs.length > 0 && (
              <Way id="ha-way-songs" title="Chase a song" kind="songs" count={waysIn.songs.length}>
                {ways.songs.map((s, i) => (
                  <WayTile key={s.href} index={i + 3} href={s.href} picture={s.shown} alt={s.band.name} sizes={WAY_SIZES.songs} by={s.band.name}>
                    {s.title}
                    <WayCount count={s.versions} one="night" many="nights" />
                  </WayTile>
                ))}
              </Way>
            )}
          </div>
          <PhotoNote show={tilePhotos.length > 0} />
        </section>
      )}

      <NextBand wall={nextBand.wall} noise={nextBand.noise} />
    </main>
  );
}

// How wide a crate's pictures are drawn: the one at the front, then the ones behind it.
const crateSizes = (k: number) => (k === 0 ? "(min-width: 1101px) 30vw, (min-width: 761px) 46vw, 64vw" : "(min-width: 1101px) 14vw, (min-width: 761px) 22vw, 64vw");
/** The front of a crate says how many watched it. */
const crateLead = (c: ConcertView) => [placeYear(c), viewsLine(c)].filter(Boolean).join(" /// ");

/**
 * A shelf as a crate of gigs: a small cut heading with its typed link, then pictures. The first is the
 * front of the crate (large), the rest sit behind it two across; on a phone the crate is one row you swipe.
 */
function Crate({ id, kind, title, count, href, children }: { id: string; kind: string; title: string; count: string; href: string | null; children: React.ReactNode }) {
  return (
    <section className="ha-shelf" aria-labelledby={id} data-od={`shelf-${kind}`}>
      <div className="ha-shelf-head">
        <PaperStrip as="h3" size="name" tone="black" tilt={-1.5}>
          <span id={id}>{title}</span>
        </PaperStrip>
        {href ? (
          <Link href={href} className="hm-more">
            {count} &gt;&gt;
          </Link>
        ) : (
          <span className="zn-data">{count}</span>
        )}
      </div>
      <ul className="ha-crate">{children}</ul>
    </section>
  );
}

/** One way in: a small cut heading, a link to the whole list, and a row of picture tiles (a swipe row on phones). */
function Way({ id, title, href, more, kind, count, children }: { id: string; title: string; href?: string; more?: string; kind: keyof typeof WAY_SIZES; count: number; children: React.ReactNode }) {
  return (
    <section className="ha-way" aria-labelledby={id} data-od={`ways-${kind}`}>
      <div className="ha-way-head">
        <PaperStrip as="h3" size="name" tone="black" tilt={-1.5}>
          <span id={id}>{title}</span>
        </PaperStrip>
        {href && (
          <Link href={href} className="hm-more">
            {more} &gt;&gt;
          </Link>
        )}
      </div>
      <ul className="ha-tiles" data-way={kind} data-n={count}>
        {children}
      </ul>
    </section>
  );
}

/**
 * A way in as a picture: the photo, the label cut on a strip (the link: it covers the whole tile), the count
 * typed beside it. `by`: whose tour or song it is, typed small under the picture.
 */
function WayTile({ index, href, picture, alt, sizes, big, by, children }: { index: number; href: string; picture: HomePicture | null; alt: string; sizes: string; big?: boolean; by?: string | null; children: React.ReactNode }) {
  return (
    <li className="ha-tile" data-big={big || undefined} style={tilt(WAY_TILTS[index % WAY_TILTS.length])}>
      <Pic picture={picture} name={alt} ratio="16 / 9" sizes={sizes}>
        <PaperStrip tone={index % 2 ? "white" : "black"} size={big ? "h2" : "small"} keyline className="hm-card-name ha-tile-name">
          <Link href={href}>{children}</Link>
        </PaperStrip>
      </Pic>
      {by && <p className="zn-data ha-tile-by">{by}</p>}
    </li>
  );
}

function WayCount({ count, one = "gig", many = "gigs" }: { count: number; one?: string; many?: string }) {
  return (
    <span className="ha-tile-n">
      {n(count)}
      <span className="od-sr"> {count === 1 ? one : many}</span>
      <span aria-hidden="true"> {count === 1 ? one : many}</span>
    </span>
  );
}
