// The homepage (brand book board 04, phones board 07). Sections, top to bottom: gig of the week with
// its typewriter setlist, Find your next band, Fresh off the copier, Pick a decade, Where it happened, Most played,
// the night that…, Sort by noise. The issue strip, header, footer and player live in the layout.
// Data: src/lib/home.ts. Styles: src/styles/home.css. A section with nothing to show is left out.
//
// Pictures (design/DESIGN.md section 6): a YouTube thumbnail is shown whole and untouched, with only a
// play control on it; a band photo (licensed, already photocopied) may be cropped and always carries
// its credit. A band photo is used once on the page, so four gigs by one band never show it four times.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PlayButton } from "@/components/player/PlayButton";
import { GigCard } from "@/components/gig/GigCard";
import { YouTubePicture } from "@/components/gig/GigPicture";
import { bandName, cutName, mainArtist, playedOn } from "@/components/gig/words";
import { PaperStrip, PhotoFrame, PlayableSetlist, PlayGlyph, Sheet, Staple, StripHeading, Tape } from "@/components/zine";
import { formatDuration } from "@/lib/format";
import { homeData, type HomeData } from "@/lib/home";
import { toTrack } from "@/lib/player-types";
import type { BandPhotoView } from "@/lib/photos/view";
import { defaultMapArtist, getMap, mapArtistIndex, type ConcertView } from "@/lib/queries";
import { NextBand, type NextBandOption } from "./NextBand";
import { compactNumber } from "@/lib/site";

function SectionTitle({ id, children, tone = "black" }: { id: string; children: ReactNode; tone?: "black" | "pink" }) {
  return (
    <PaperStrip as="h2" size="h2" tone={tone} tilt={-1.2} className="hm-title">
      <span id={id}>{children}</span>
    </PaperStrip>
  );
}

// ---------- 1. Gig of the week ----------

function GigOfTheWeek({ gig }: { gig: NonNullable<HomeData["gigOfTheWeek"]> }) {
  const { concert, setlist, photo } = gig;
  const track = toTrack(concert);
  const name = bandName(concert);
  const place = [concert.venue?.name, concert.city].filter(Boolean).join(", ");
  const data = [place, playedOn(concert), formatDuration(concert.durationSeconds)].filter(Boolean).join(" /// ");
  const timed = (setlist?.tracks ?? []).flatMap((t) => (t.time === null ? [] : [{ title: t.title, seconds: t.time }]));
  const songs = setlist?.tracks.length ?? 0;
  const meta = [songs ? `${songs} ${songs === 1 ? "song" : "songs"}` : null, playedOn(concert, true)].filter(Boolean).join(" / ");
  const label = (
    <PaperStrip hand="marker" tilt={-3}>
      gig of the week!
    </PaperStrip>
  );
  const strips = (
    <>
      <StripHeading as="h1" size="h1" lines={cutName(name)} keyline />
      <PaperStrip as="p" hand="type" tone="pink" className="hm-hero-data">
        {data}
      </PaperStrip>
    </>
  );

  return (
    <section className="hm-hero" aria-label="Gig of the week" data-od="gig-of-the-week" data-photo={photo ? true : undefined}>
      <div className="hm-hero-main">
        {photo ? (
          <PhotoFrame
            kind="treated"
            src={photo.src}
            alt={`${name}, photocopied`}
            ratio="var(--hero-ratio)"
            tilt={-1}
            eager
            sizes="(min-width: 901px) 58vw, 100vw"
            credit={photo.credit}
            creditHref={photo.sourcePage}
            stamp={label}
            fixings={
              <>
                <Tape at="top-left" tilt={-5} />
                <Tape at="top-right" tilt={4} />
              </>
            }
            className="hm-hero-photo zn-slap"
          >
            {strips}
          </PhotoFrame>
        ) : (
          <YouTubePicture
            concert={concert}
            sizes="(min-width: 901px) 58vw, 100vw"
            tilt={-1}
            eager
            stamp={label}
            fixings={<Tape at="top-left" tilt={-5} />}
            className="hm-hero-photo zn-slap"
          >
            {strips}
          </YouTubePicture>
        )}
        <div className="hm-hero-actions zn-slap">
          <PlayButton track={track} className="zn-btn hm-play">
            <PlayGlyph />
            Play it loud
          </PlayButton>
          <span className="zn-marker" style={{ "--tilt": "2deg" } as CSSProperties}>
            1 click. that’s it.
          </span>
          <Link href={`/concerts/${concert.slug}`} className="hm-more">
            THE GIG&rsquo;S PAGE &gt;&gt;
          </Link>
        </div>
      </div>

      <div className="hm-hero-side">
        {/* With a band photo up front, the gig itself is shown here: the YouTube picture, whole. */}
        {photo && (
          <YouTubePicture concert={concert} sizes="(min-width: 901px) 36vw, 100vw" tilt={1.5} className="hm-hero-tape zn-slap">
            <PaperStrip hand="type" tone="white" tilt={-1}>
              STRAIGHT OFF: {concert.channel.name}
            </PaperStrip>
          </YouTubePicture>
        )}
        <Sheet
          as="aside"
          label="Setlist"
          title="Setlist"
          meta={meta || undefined}
          level={2}
          tilt={photo ? -0.8 : 1.2}
          fixings={
            <>
              <Tape at="top-center" tilt={-2} />
              <Staple at="top-right" />
            </>
          }
          className="hm-setlist zn-slap"
        >
          {timed.length > 0 ? (
            <>
              <PlayableSetlist track={track} songs={timed} />
              <p className="zn-marker hm-setlist-hint">click any song = jump straight to it</p>
            </>
          ) : setlist ? (
            <ol className="zn-setlist hm-setlist-plain">
              {setlist.tracks.map((t, i) => (
                <li key={`${i}-${t.title}`}>
                  <span aria-hidden="true">{String(i + 1).padStart(2, "0")}.</span> {t.title}
                </li>
              ))}
            </ol>
          ) : (
            <p className="hm-setlist-empty">
              Still being typed up. Two fingers, one typewriter. The gig plays start to finish without it.
            </p>
          )}
        </Sheet>
      </div>
    </section>
  );
}

// ---------- 5. Most played ----------

function ChartRow({ concert, rank, note }: { concert: ConcertView; rank: number; note: string }) {
  const track = toTrack(concert);
  const t = concert.thumbnail;
  return (
    <li className="hm-row">
      <span className="hm-row-rank" aria-hidden="true">
        {rank}
      </span>
      {/* The picture is a play button; nothing is drawn on it. */}
      <PlayButton track={track} className="hm-row-pic">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={t.src} srcSet={t.srcSet} sizes="118px" width={t.width} height={t.height} alt="" loading="lazy" decoding="async" />
      </PlayButton>
      <Link href={`/concerts/${concert.slug}`} className="hm-row-text">
        <span className="od-sr">Number {rank}: </span>
        <span className="hm-row-name">{concert.credits}</span>
        <span className="zn-data hm-row-data">
          {[[concert.venue?.name, concert.performedYear].filter(Boolean).join(", "), note].filter(Boolean).join(" /// ")}
        </span>
      </Link>
      <PlayButton track={track} className="hm-row-play">
        <PlayGlyph />
        <span>{formatDuration(concert.durationSeconds)}</span>
      </PlayButton>
    </li>
  );
}

// ---------- The page ----------

const DECADE_TONES = ["black", "white", "pink"] as const;
const DECADE_TILTS = [-2, 1.5, -1, 2, -1.5, 1, -2];
const NOISE_TILTS = [-2, 1.5, -1, 2, -1.5, 1];
const NOISE_TONES = ["white", "black", "white", "black"] as const;

export default async function HomePage({ nextBand = "a" }: { nextBand?: NextBandOption }) {
  // The wall of similar bands is an extra: if it cannot be read, the page goes out without it.
  const [data, bands, wall] = await Promise.all([
    homeData(),
    mapArtistIndex().catch(() => []),
    defaultMapArtist()
      .then((slug) => (slug ? getMap(slug) : null))
      .catch(() => null),
  ]);
  const { gigOfTheWeek: gig, fresh, decades, fields, rooms, mostPlayed, mostPlayedBy, nightThat, noise } = data;

  // A band photo is used once on the page.
  const used = new Set<string>();
  if (gig?.photo) used.add(mainArtist(gig.concert)?.slug ?? "");
  const photoOnce = (c: ConcertView): BandPhotoView | null => {
    const slug = mainArtist(c)?.slug;
    if (!slug || used.has(slug) || !data.photos[slug]) return null;
    used.add(slug);
    return data.photos[slug];
  };
  const freshCards = fresh.map((concert) => ({ concert, photo: photoOnce(concert) }));

  const byViews = mostPlayedBy === "views";
  const loudest = [...noise].reverse().find((g) => g.count > 0)?.slug;
  const places = [
    { title: "the fields", rows: fields, thin: "one field so far. more on the way." },
    { title: "the rooms", rows: rooms, thin: "one room so far. more on the way." },
  ].filter((p) => p.rows.length > 0);

  return (
    <main data-od="home" className="hm">
      {gig && <GigOfTheWeek gig={gig} />}

      <p className="zn-band hm-band">
        ONE CLICK AND THE GIG STARTS <span>IT KEEPS PLAYING</span> WHILE YOU DIG THROUGH THE REST
      </p>

      {bands.length > 0 && <NextBand option={nextBand} bands={bands} wall={wall} noise={noise} />}

      {freshCards.length > 0 && (
        <section className={bands.length > 0 ? "hm-section hm-section--cut" : "hm-section"} aria-labelledby="hm-fresh" data-od="fresh">
          <div className="hm-head">
            <SectionTitle id="hm-fresh">Fresh off the copier</SectionTitle>
            <Link href="/concerts" className="hm-more">
              ALL <span className="hm-wide">NEW GIGS </span>&gt;&gt;
            </Link>
          </div>
          <ul className="hm-cards">
            {freshCards.map(({ concert, photo }, i) => (
              <GigCard key={concert.id} concert={concert} photo={photo} index={i} />
            ))}
          </ul>
        </section>
      )}

      {decades.length > 0 && (
        <section className="hm-section hm-section--cut" aria-labelledby="hm-decades" data-od="decades">
          <div className="hm-head">
            <SectionTitle id="hm-decades">Pick a decade</SectionTitle>
          </div>
          <ul className="hm-decades" data-few={decades.length <= 4 || undefined} style={{ "--n": Math.min(decades.length, 7) } as CSSProperties}>
            {decades.map((d, i) => (
              <li key={d.label}>
                <Link
                  href={`/decades/${d.label}`}
                  className="hm-decade zn-lift"
                  data-tone={DECADE_TONES[i % 3]}
                  style={{ "--tilt": `${DECADE_TILTS[i % DECADE_TILTS.length]}deg` } as CSSProperties}
                >
                  <span className="hm-decade-top">
                    <span className="hm-decade-n" aria-hidden="true">
                      {d.label.slice(2, 4)}
                    </span>
                    <span className="od-sr">The {d.label}: </span>
                    <span className="zn-data">
                      {d.count} {d.count === 1 ? "gig" : "gigs"}
                    </span>
                  </span>
                  {d.line && <span className="hm-decade-line">{d.line}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {places.length > 0 && (
        <section className="hm-where" aria-labelledby="hm-where" data-od="where">
          <div className="hm-head">
            <SectionTitle id="hm-where" tone="pink">
              Where it happened
            </SectionTitle>
            <Link href="/venues" className="hm-more">
              ALL <span className="hm-wide">FIELDS + ROOMS </span>&gt;&gt;
            </Link>
          </div>
          <div className="hm-where-grid">
            {places.map((p) => (
              <div key={p.title}>
                <h3 className="zn-marker hm-where-title" data-size="big">
                  {p.title}
                </h3>
                <ul>
                  {p.rows.map((v) => (
                    <li key={v.slug}>
                      <Link href={`/venues/${v.slug}`} className="hm-venue">
                        <span className="hm-venue-name">{v.name}</span>
                        <span className="hm-venue-dots" aria-hidden="true" />
                        <span className="zn-data hm-venue-place">
                          {[[v.city, v.country].filter(Boolean).join(", "), `${v.count} ${v.count === 1 ? "gig" : "gigs"}`]
                            .filter(Boolean)
                            .join(" /// ")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {p.rows.length === 1 && <p className="hm-where-thin">{p.thin}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(mostPlayed.length > 0 || nightThat) && (
        <div className="hm-section hm-two">
          {mostPlayed.length > 0 && (
            <section aria-labelledby="hm-chart" data-od="most-played">
              <div className="hm-head">
                <SectionTitle id="hm-chart">{byViews ? "Most watched" : "Most played"}</SectionTitle>
                <span className="zn-label">{byViews ? "by views on YouTube" : "on this site, last 30 days"}</span>
              </div>
              <ol className="hm-rows">
                {mostPlayed.map(({ concert, plays }, i) => (
                  <ChartRow
                    key={concert.id}
                    concert={concert}
                    rank={i + 1}
                    note={byViews ? `${compactNumber(concert.viewCount)} views` : `${plays} ${plays === 1 ? "play" : "plays"}`}
                  />
                ))}
              </ol>
            </section>
          )}

          {nightThat ? (
            <Sheet as="article" tilt={-1} fixings={<Tape at="top-left" tilt={-4} />} className="hm-night" label="The night that…">
              <span className="zn-marker" data-size="big">
                the night that…
              </span>
              <h2 className="hm-night-head">{nightThat.headline}</h2>
              <YouTubePicture concert={nightThat.concert} sizes="(min-width: 901px) 36vw, 100vw" />
              <p className="hm-night-story">{nightThat.story}</p>
              <PlayButton track={toTrack(nightThat.concert)} className="zn-btn hm-night-play">
                <PlayGlyph />
                Play /// {formatDuration(nightThat.concert.durationSeconds)}
              </PlayButton>
            </Sheet>
          ) : (
            /* No story yet: the house rules take the wall instead (brand book, voice). Never an invented story. */
            <Sheet as="aside" tilt={-1} fixings={<Tape at="top-left" tilt={-4} />} className="hm-deal" label="How this works">
              <p className="zn-label">STAGEDIVE /// THE DEAL</p>
              <p className="hm-deal-text">
                No login. No algorithm. No &ldquo;recommended for you&rdquo;. We&rsquo;ve got scissors, glue and every full gig we
                could find. Free, like the flyer on the venue wall.
              </p>
              <p className="zn-marker" data-size="big">
                One click. Jump in.
              </p>
            </Sheet>
          )}
        </div>
      )}

      {noise.length > 0 && (
        <section className="hm-section" aria-labelledby="hm-noise" data-od="noise">
          <div className="hm-head">
            <SectionTitle id="hm-noise">Sort by noise</SectionTitle>
            <span className="zn-label">quiet on the left /// loud on the right</span>
          </div>
          <ul className="hm-noise">
            {noise.map((g, i) => {
              const style = {
                "--tilt": `${NOISE_TILTS[i % NOISE_TILTS.length]}deg`,
                "--loud": noise.length > 1 ? i / (noise.length - 1) : 1,
              } as CSSProperties;
              return (
                <li key={g.slug}>
                  {g.count > 0 ? (
                    <Link
                      href={`/genres/${g.slug}`}
                      className="hm-genre zn-lift"
                      data-tone={g.slug === loudest ? "pink" : NOISE_TONES[i % NOISE_TONES.length]}
                      style={style}
                    >
                      {g.name}
                      <span className="hm-genre-n">
                        {g.count}
                        <span className="od-sr">{g.count === 1 ? " gig" : " gigs"}</span>
                      </span>
                    </Link>
                  ) : (
                    <span className="hm-genre" data-tone="none" style={style}>
                      {g.name}
                      <span className="od-sr">: no gigs yet</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {noise.some((g) => g.count === 0) && <p className="zn-marker hm-noise-note">dashed = nothing on the wall yet</p>}
        </section>
      )}
    </main>
  );
}
