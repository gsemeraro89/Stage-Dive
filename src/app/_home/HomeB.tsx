// Homepage, direction B: "THE WALL". You are standing in front of the venue wall: posters edge to
// edge, pictures first, places up front. The gig of the week is the big poster; the rest of the
// wall is reels you walk along.
// Order: the poster (gig of the week, running order, find a gig) · ticket stubs (the figures) ·
// where it happened (the reel) · the legends (the wall) · top of the bill · fresh off the copier ·
// the shelves · rock news · four ways in · next band.
// Data: homepageData(). Styles: src/styles/home2.css (hb-, hx-). An empty section is left out.
import Link from "next/link";
import type { CSSProperties } from "react";
import { YouTubePicture } from "@/components/gig/GigPicture";
import { bandName, cutName, playedOn } from "@/components/gig/words";
import { NewsList } from "@/components/news/NewsList";
import { PlayButton } from "@/components/player/PlayButton";
import { PaperStrip, PhotoFrame, PlayGlyph, StripHeading } from "@/components/zine";
import { formatDuration } from "@/lib/format";
import { homepageData } from "@/lib/home";
import { toTrack } from "@/lib/player-types";
import type { ConcertView } from "@/lib/queries";
import { NextBand } from "./NextBand";
import { Bootleg, ChartRow, FindAGig, Gig, Head, HomeJsonLd, heroPhotoOf, n, Pic, PhotoNote, placeData, placeTown, SetlistSheet, shelvesOf, tilt, usedPhotos, viewsLine } from "./parts";

const DECADE_TONES = ["black", "white", "pink"] as const;
const DECADE_TILTS = [-2, 1.5, -1, 2, -1.5, 1, -2];
const GENRE_TILTS = [-2, 1.5, -1, 2, -1.5, 1];

export default async function HomeB() {
  const data = await homepageData();
  const { hero, legends, places, fresh, bestOf, news, waysIn, nextBand } = data;
  const { totals, gig } = hero;
  const photo = heroPhotoOf(data);
  const shelves = shelvesOf(data);
  const newsItems = news.lead ? [news.lead, ...news.more] : [];
  const maxGenre = Math.max(1, ...waysIn.genres.map((g) => g.count));

  return (
    <main data-od="home" className="hm hx hb">
      <HomeJsonLd data={data} />

      {/* ---------- The poster: a black wall, the gig of the week pasted on it ---------- */}
      <section className="hb-hero" aria-label="On the wall this week" data-od="hero">
        <div className="hb-hero-words">
          <StripHeading as="h1" size="h1" lines={["Full rock", "concerts.", "The whole", "set."]} first="white" tilts={[-2, 1.2, -1, 1.5]} className="hb-h1" />
          {data.lead && <p className="hb-lead">{data.lead}</p>}
          <FindAGig id="hb-q" />
          {gig && photo && (
            <YouTubePicture concert={gig.concert} sizes="(min-width: 1101px) 26vw, 100vw" tilt={1.2} className="hb-still zn-slap">
              <PaperStrip hand="type" tone="white" tilt={-1}>
                STRAIGHT OFF: {gig.concert.channel.name}
              </PaperStrip>
            </YouTubePicture>
          )}
        </div>

        {gig && <Poster concert={gig.concert} photo={photo} issue={data.issue} />}

        {gig && (
          <div className="hb-hero-side">
            <SetlistSheet concert={gig.concert} setlist={gig.setlist} title="Running order" tiltBy={-0.8} className="zn-slap" />
          </div>
        )}
      </section>

      {/* Ticket stubs: the figures, torn off along the dashes. */}
      {totals.concerts > 0 && (
        <ul className="hb-stubs" aria-label="What is on the wall" data-od="totals">
          <Stub href="/concerts" figure={n(totals.concerts)} word="full gigs" i={0} />
          <Stub href="/artists" figure={n(totals.bands)} word="bands" i={1} />
          <Stub href="/venues" figure={n(totals.places)} word="fields + rooms" i={2} />
          {totals.withSetlist > 0 && <Stub figure={n(totals.withSetlist)} word="setlists you can click" i={3} />}
          {totals.bootlegs > 0 && <Stub href="/concerts?source=bootleg" figure={n(totals.bootlegs)} word="bootlegs" i={4} />}
        </ul>
      )}

      {/* ---------- Where it happened: a reel of posters, off the edge of the page ---------- */}
      {places.length > 0 && (
        <section className="hm-section hb-places" aria-labelledby="hb-where" data-od="places">
          <Head id="hb-where" title="Where it happened" more={{ href: "/venues", label: <>ALL {n(totals.places)} FIELDS + ROOMS</> }}>
            <span className="zn-marker hb-reel-hint">keep walking &gt;&gt;</span>
          </Head>
          <ol className="hb-reel" tabIndex={0} aria-label="Festivals and venues with the most gigs">
            {places.map((p, i) => (
              <li key={p.slug} className="hb-place" style={tilt([-1, 0.8, -0.6, 1][i % 4])}>
                <p className="hb-place-count" aria-hidden="true">
                  <b>{n(p.concerts)}</b>
                  <span>{p.concerts === 1 ? "gig" : "gigs"}</span>
                  <span className="hb-place-kind">{p.kind === "festival" ? "the field" : "the room"}</span>
                </p>
                <Pic picture={p.picture} name={p.name} ratio="16 / 9" sizes="(min-width: 761px) 340px, 78vw">
                  <PaperStrip tone={i % 2 ? "white" : "black"} size="name" keyline className="hm-card-name">
                    <Link href={p.href}>{p.name}</Link>
                  </PaperStrip>
                </Pic>
                <p className="zn-data hb-place-data">
                  {placeTown(p)}
                  {placeTown(p) && <br />}
                  <span className="od-sr">{placeData(p)}</span>
                  <span aria-hidden="true">{p.years ? (p.years.from === p.years.to ? p.years.from : `${p.years.from}–${p.years.to}`) : null}</span>
                </p>
              </li>
            ))}
          </ol>
          <PhotoNote show={places.some((p) => p.picture && p.picture.kind !== "concert")} />
        </section>
      )}

      {/* ---------- The legends: a wall of pictures on black ---------- */}
      {legends.length > 0 && (
        <section className="hb-legends" aria-labelledby="hb-legends" data-od="legends">
          <Head id="hb-legends" title="The legends" tone="white" more={{ href: "/artists", label: <>ALL {n(totals.bands)} BANDS</> }} />
          <ul className="hb-wall" data-n={legends.length}>
            {legends.map((b, i) => (
              <li key={b.slug} className="hb-brick" data-big={i === 0 || undefined}>
                <Pic picture={b.picture} name={b.name} ratio="16 / 9" sizes={i === 0 ? "(min-width: 901px) 40vw, 100vw" : "(min-width: 901px) 20vw, 50vw"} />
                <Link href={b.href} className="hb-brick-link">
                  <span className="hb-brick-name">{b.name}</span>
                  <span className="zn-data hb-brick-n">
                    {n(b.concerts)} {b.concerts === 1 ? "gig" : "gigs"}
                  </span>
                </Link>
              </li>
            ))}
            <li className="hb-brick hb-brick--all">
              <Link href="/artists" className="hb-brick-all">
                <b>+{n(Math.max(0, totals.bands - legends.length))}</b>
                more bands &gt;&gt;
              </Link>
            </li>
          </ul>
          <PhotoNote show={legends.some((b) => b.picture && b.picture.kind !== "concert")} />
        </section>
      )}

      {/* ---------- Top of the bill: each chart is a row of five ---------- */}
      {bestOf.length > 0 && (
        <section className="hm-section" aria-labelledby="hb-best" data-od="best-of">
          <Head id="hb-best" title="Top of the bill" more={{ href: "/best", label: "EVERY CHART" }} />
          {bestOf.map((r, i) => (
            <div key={r.slug} className="hb-bill">
              <div className="hb-bill-head">
                <PaperStrip as="h3" size="name" tone={i % 2 ? "white" : "black"} tilt={i % 2 ? 1.5 : -1.5}>
                  {r.label}
                </PaperStrip>
                <Link href={r.href} className="hm-more">
                  THE TOP {Math.min(r.count, 50)} &gt;&gt;
                </Link>
              </div>
              <ol className="hb-reel hb-bill-reel" tabIndex={0} aria-label={r.heading}>
                {r.concerts.map((c, k) => (
                  <li key={c.id} className="hb-ranked" data-first={k === 0 || undefined}>
                    <span className="hb-rank" aria-hidden="true">
                      {k + 1}
                    </span>
                    <RankedGig concert={c} rank={k + 1} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      {/* ---------- Fresh off the copier ---------- */}
      {fresh.length > 0 && (
        <section className="hm-section hm-section--cut" aria-labelledby="hb-fresh" data-od="fresh">
          <Head id="hb-fresh" title="Fresh off the copier" more={{ href: "/concerts", label: "ALL NEW GIGS" }} />
          <ul className="hb-fresh">
            {fresh.map((c, i) => (
              <Gig key={c.id} concert={c} index={i} sizes="(min-width: 901px) 22vw, 50vw" />
            ))}
          </ul>
        </section>
      )}

      {/* ---------- The shelves: three crates on a black band ---------- */}
      {(shelves.hd || shelves.fans || shelves.liveAlbums) && (
        <section className="hb-shelves" aria-labelledby="hb-shelves" data-od="shelves">
          <Head id="hb-shelves" title="Dig through the crates" tone="white" />
          <div className="hb-crates">
            {shelves.hd && (
              <Crate id="hb-crate-hd" title="In HD" count={`${n(shelves.hd.count)} gigs`} href={shelves.hd.href} od="shelf-hd">
                {shelves.hd.concerts.slice(0, 3).map((c, k) => (
                  <CrateGig key={c.id} concert={c} first={k === 0} />
                ))}
              </Crate>
            )}
            {shelves.fans && (
              <Crate id="hb-crate-fans" title="From the fans" count={`${n(shelves.fans.count)} bootlegs`} href={shelves.fans.href} od="shelf-fans">
                {shelves.fans.concerts.slice(0, 3).map((c, k) => (
                  <CrateGig key={c.id} concert={c} first={k === 0} />
                ))}
              </Crate>
            )}
            {shelves.liveAlbums && (
              <Crate id="hb-crate-albums" title="Live albums" count={`${n(shelves.liveAlbums.count)} you can watch`} href={null} od="shelf-live-albums">
                {shelves.liveAlbums.albums.slice(0, 3).map((a, k) => (
                  <CrateGig key={a.concert.id} concert={a.concert} first={k === 0} note={`THE ALBUM: ${a.title}${a.year ? ` (${a.year})` : ""}`} />
                ))}
              </Crate>
            )}
          </div>
        </section>
      )}

      {/* ---------- Rock news ---------- */}
      {news.lead && (
        <section className="hm-section pg hb-news" aria-labelledby="hb-news" data-od="news">
          <Head id="hb-news" title="Rock news" more={{ href: news.href, label: "ALL THE NEWS" }} />
          <NewsList items={newsItems} label="Rock news" once={usedPhotos(data, photo)} />
        </section>
      )}

      {/* ---------- Four ways in ---------- */}
      {(waysIn.decades.length > 0 || waysIn.genres.length > 0 || waysIn.tours.length > 0 || waysIn.songs.length > 0) && (
        <section className="hm-section hm-section--cut" aria-labelledby="hb-ways" data-od="ways-in">
          <Head id="hb-ways" title="Four ways in" />
          {waysIn.decades.length > 0 && (
            <div className="hb-way">
              <WayHead word="1. Pick a decade" href="/decades" more="ALL DECADES" />
              <ul className="hm-decades" data-few={waysIn.decades.length <= 4 || undefined} style={{ "--n": Math.min(waysIn.decades.length, 7) } as CSSProperties}>
                {waysIn.decades.map((d, i) => (
                  <li key={d.label}>
                    <Link href={d.href} className="hm-decade zn-lift" data-tone={DECADE_TONES[i % 3] === "pink" ? "white" : DECADE_TONES[i % 3]} style={tilt(DECADE_TILTS[i % DECADE_TILTS.length])}>
                      <span className="hm-decade-top">
                        <span className="hm-decade-n" aria-hidden="true">
                          {d.label.slice(2, 4)}
                        </span>
                        <span className="od-sr">The {d.label}: </span>
                        <span className="zn-data">
                          {n(d.count)} {d.count === 1 ? "gig" : "gigs"}
                        </span>
                      </span>
                      {d.line && <span className="hm-decade-line">{d.line}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {waysIn.genres.length > 0 && (
            <div className="hb-way">
              <WayHead word="2. Pick a noise" href="/genres" more="ALL GENRES" />
              <ul className="hm-noise">
                {waysIn.genres.map((g, i) => (
                  <li key={g.slug}>
                    <Link href={g.href} className="hm-genre zn-lift" data-tone={i === 0 ? "pink" : i % 2 ? "white" : "black"} style={{ "--tilt": `${GENRE_TILTS[i % GENRE_TILTS.length]}deg`, "--loud": g.count / maxGenre } as CSSProperties}>
                      {g.name}
                      <span className="hm-genre-n">
                        {n(g.count)}
                        <span className="od-sr">{g.count === 1 ? " gig" : " gigs"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="hb-way-two">
            {waysIn.tours.length > 0 && (
              <div className="hb-way">
                <WayHead word="3. Follow a tour" href="/tours" more="ALL TOURS" />
                <ul className="hb-list">
                  {waysIn.tours.map((t) => (
                    <li key={t.slug}>
                      <Link href={t.href} className="hb-list-row">
                        <span className="hb-list-name">{t.name}</span>
                        <span className="zn-data">{[t.band?.name, `${n(t.count)} ${t.count === 1 ? "gig" : "gigs"}`].filter(Boolean).join(" /// ")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {waysIn.songs.length > 0 && (
              <div className="hb-way">
                <WayHead word="4. Chase a song" />
                <ul className="hb-list">
                  {waysIn.songs.map((s) => (
                    <li key={s.href}>
                      <Link href={s.href} className="hb-list-row">
                        <span className="hb-list-name">{s.title}</span>
                        <span className="zn-data">
                          {s.band.name} /// {n(s.versions)} live versions
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <NextBand wall={nextBand.wall} noise={nextBand.noise} />
    </main>
  );
}

/** The gig of the week as a gig poster: a clean sheet, the picture, the name cut big, the date typed. */
function Poster({ concert, photo, issue }: { concert: ConcertView; photo: ReturnType<typeof heroPhotoOf>; issue: string }) {
  const name = bandName(concert);
  const place = [concert.venue?.name, concert.city].filter(Boolean).join(", ");
  const strips = <StripHeading as="h2" size="h1" lines={cutName(name)} first="black" keyline className="hb-poster-name" />;
  return (
    <article className="hb-poster zn-slap" aria-label={`Gig of the week: ${concert.credits}`} data-od="gig-of-the-week" data-photo={photo ? true : undefined}>
      <p className="hb-poster-top">
        <span>GIG OF THE WEEK</span>
        <span>ISSUE {issue}</span>
      </p>
      {photo ? (
        <PhotoFrame kind="treated" src={photo.src} alt={`${name}, photocopied`} ratio="var(--poster-ratio)" eager sizes="(min-width: 1101px) 34vw, 100vw" credit={photo.credit} creditHref={photo.sourcePage} className="hb-poster-pic">
          {strips}
        </PhotoFrame>
      ) : (
        <YouTubePicture concert={concert} sizes="(min-width: 1101px) 34vw, 100vw" eager className="hb-poster-pic">
          {strips}
        </YouTubePicture>
      )}
      <p className="hb-poster-data">
        {place && <span>{place}</span>}
        {playedOn(concert) && <span>{playedOn(concert)}</span>}
        <span>{formatDuration(concert.durationSeconds)} /// the whole set</span>
      </p>
      <div className="hb-poster-actions">
        <PlayButton track={toTrack(concert)} className="zn-btn hm-play">
          <PlayGlyph />
          Play it loud
        </PlayButton>
        <Link href={`/concerts/${concert.slug}`} className="hm-more">
          THE GIG&rsquo;S PAGE &gt;&gt;
        </Link>
      </div>
    </article>
  );
}

function Stub({ href, figure, word, i }: { href?: string; figure: string; word: string; i: number }) {
  const body = (
    <>
      <b>{figure}</b>
      <span>{word}</span>
    </>
  );
  return (
    <li style={tilt([-1.5, 1, -0.8, 1.4, -1][i % 5])}>
      {href ? (
        <Link href={href} className="hb-stub zn-lift">
          {body}
        </Link>
      ) : (
        <span className="hb-stub">{body}</span>
      )}
    </li>
  );
}

/** A ranked gig in the reel: the picture whole with its play control, the band on a strip, the count typed. */
function RankedGig({ concert, rank }: { concert: ConcertView; rank: number }) {
  const t = concert.thumbnail;
  return (
    <div className="hb-ranked-gig">
      <YouTubePicture concert={concert} sizes="(min-width: 761px) 300px, 70vw">
        <PaperStrip tone="white" size="name" className="hm-card-name">
          <Link href={`/concerts/${concert.slug}`}>
            <span className="od-sr">Number {rank}: </span>
            {concert.credits}
          </Link>
        </PaperStrip>
      </YouTubePicture>
      <p className="zn-data hx-gig-data" data-w={t.width}>
        {[[concert.venue?.name, concert.performedYear].filter(Boolean).join(" "), viewsLine(concert)].filter(Boolean).join(" /// ")}
      </p>
    </div>
  );
}

function Crate({ id, title, count, href, od, children }: { id: string; title: string; count: string; href: string | null; od: string; children: React.ReactNode }) {
  return (
    <section className="hb-crate" aria-labelledby={id} data-od={od}>
      <div className="hb-crate-head">
        <PaperStrip as="h3" size="name" tone="white" tilt={-1.5}>
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
      <ul className="hb-crate-list">{children}</ul>
    </section>
  );
}

function CrateGig({ concert, first, note }: { concert: ConcertView; first: boolean; note?: string }) {
  if (!first) return <ChartRow concert={concert} picture note={note} />;
  return (
    <li className="hb-crate-top">
      <YouTubePicture concert={concert} sizes="(min-width: 901px) 30vw, 100vw">
        <PaperStrip tone="white" size="name" className="hm-card-name">
          <Link href={`/concerts/${concert.slug}`}>{concert.credits}</Link>
        </PaperStrip>
      </YouTubePicture>
      <p className="zn-data hx-gig-data">{note ?? [[concert.venue?.name, concert.performedYear].filter(Boolean).join(" "), viewsLine(concert)].filter(Boolean).join(" /// ")}</p>
      <Bootleg concert={concert} />
    </li>
  );
}

function WayHead({ word, href, more }: { word: string; href?: string; more?: string }) {
  return (
    <div className="hb-way-head">
      <h3 className="hb-way-word">{word}</h3>
      {href && (
        <Link href={href} className="hm-more">
          {more} &gt;&gt;
        </Link>
      )}
    </div>
  );
}
