// Concert page (brand book board 05, phones board 07): the player in its frame, the band on strips,
// the typewriter setlist beside it (click a song, the gig jumps there), the facts, our write-up, and
// what to play next. Styles: src/styles/pages.css (cp-). Data: getConcertPage.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GigCard } from "@/components/gig/GigCard";
import { GigRows } from "@/components/gig/GigRows";
import { OnNowMark } from "@/components/gig/OnNowMark";
import { Crumbs, SectionTitle } from "@/components/gig/PageHead";
import { bandName, cutName, gigs, kindWord, mainArtist, placeYear, playedOn, playedOnLong } from "@/components/gig/words";
import { PlayerSlot } from "@/components/player/PlayerSlot";
import { PaperStrip, PlayableSetlist, Sheet, Staple, StripHeading, Tape } from "@/components/zine";
import { formatDate, formatDuration } from "@/lib/format";
import { toTrack } from "@/lib/player-types";
import { getConcertPage } from "@/lib/queries";
import { sourceNote, type TrackView } from "@/lib/setlist/view";
import { compactNumber, placeLine } from "@/lib/site";
import { concertJsonLd, jsonLd } from "@/lib/structured-data";

// One database read per request, shared by the page and its title/description.
const load = cache(getConcertPage);

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { concert } = page;
  const place = placeLine(concert);
  const description = [
    `Watch ${concert.credits}${place ? ` at ${place}` : ""} in full (${formatDuration(concert.durationSeconds)}).`,
    concert.writeUp,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
  return {
    title: concert.title,
    description,
    alternates: { canonical: `/concerts/${concert.slug}` },
    openGraph: { title: concert.title, description, type: "video.other", images: [concert.thumbnail.src] },
  };
}

/** A song as the setlist types it. A song credited to someone else says so. */
function songTitle(t: TrackView, band: string): string {
  const title = t.unidentified ? "Unidentified song" : t.title;
  return t.artist && !/^ID$/i.test(t.artist) && t.artist.toLowerCase() !== band.toLowerCase() ? `${title} (${t.artist})` : title;
}

/** Where the setlist was read, said honestly. */
function setlistSource(source: string | null): string {
  if (source === "COMMENT") return "Setlist typed up by a viewer on YouTube. It may have mistakes.";
  return sourceNote(source);
}

export default async function ConcertPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { concert, queue, moreFromArtist, similarCards, setlist } = page;
  const track = toTrack(concert);
  const band = mainArtist(concert);
  const name = bandName(concert);
  const more = moreFromArtist.slice(0, 3);
  const upNext = queue.filter((c) => !more.some((m) => m.id === c.id)).slice(0, 4);

  const songs = setlist?.tracks ?? [];
  const timed = songs.length > 0 && songs.every((t) => t.time !== null);
  const songCount = songs.length ? `${songs.length} ${songs.length === 1 ? "song" : "songs"}` : null;
  const where = [concert.venue?.name, concert.city].filter(Boolean).join(", ");
  const data = [where, playedOn(concert)].filter(Boolean).join(" /// ");
  const kind = kindWord(concert.venueKind);

  return (
    <main data-od="concert" className="pg cp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(concertJsonLd(concert, setlist)) }} />
      <Crumbs
        trail={[
          { label: "Bands", href: "/artists" },
          ...(band ? [{ label: band.name, href: band.hasPage ? `/artists/${band.slug}` : undefined }] : []),
          { label: placeYear(concert) || "The gig" },
        ]}
      />

      <div className="cp-top" data-setlist={setlist ? "" : undefined}>
        <div className="cp-stage">
          {/* The player: dead straight, in a black frame. Nothing is ever placed on the video; the
              stamp sits on the frame's top edge and the strips on the black mount under it. */}
          <div className="cp-player" data-od="player-area">
            <OnNowMark youtubeId={concert.youtubeId} className="cp-onnow" />
            <PlayerSlot track={track} srcSet={concert.thumbnail.srcSet} alt={`${concert.credits} — ${placeLine(concert) || concert.title}`} />
          </div>
          <div className="cp-strips">
            <StripHeading as="h1" size="h1" lines={cutName(concert.credits, 14)} keyline />
            {data && (
              <PaperStrip as="p" hand="type" tone="pink" tilt={-0.6} className="cp-data">
                {data}
              </PaperStrip>
            )}
          </div>
          <p className="cp-note zn-label" data-od="player-note">
            <span>Plays right here /// picture and video: YouTube</span>
            <a href={`https://www.youtube.com/watch?v=${concert.youtubeId}`} rel="noopener">
              Open on YouTube &gt;&gt;
            </a>
          </p>
        </div>

        <Sheet
          as="aside"
          label="Setlist"
          title="Setlist"
          meta={songCount ?? undefined}
          level={2}
          tilt={1}
          fixings={
            <>
              <Tape at="top-center" tilt={-2} />
              <Staple at="top-right" />
            </>
          }
          className="cp-setlist"
        >
          <div data-od="setlist" data-timed={timed || undefined}>
            {timed ? (
              <>
                <PlayableSetlist
                  track={track}
                  songs={songs.map((t) => ({ title: songTitle(t, name), seconds: t.time ?? 0 }))}
                  label={`Setlist: ${concert.credits}`}
                />
                <p className="zn-marker cp-setlist-hint">click any song = jump straight to it</p>
              </>
            ) : setlist ? (
              <ol className="zn-setlist hm-setlist-plain" aria-label={`Setlist: ${concert.credits}`}>
                {songs.map((t, i) => (
                  <li key={`${i}-${t.title}`}>
                    <span aria-hidden="true">{String(i + 1).padStart(2, "0")}.</span> {songTitle(t, name)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="hm-setlist-empty">
                Still being typed up. Two fingers, one typewriter. The gig plays start to finish without it.
              </p>
            )}
            {setlist && (
              <p className="zn-label cp-setlist-source" data-od="setlist-source">
                {setlistSource(setlist.source)}
              </p>
            )}
          </div>
        </Sheet>

        <div className="cp-details">
          <div className="cp-words">
            {concert.writeUp ? (
              <p className="cp-writeup" data-od="write-up">
                {concert.writeUp}
              </p>
            ) : (
              <p className="cp-writeup">
                {name}
                {where ? `, ${where}` : ""}
                {concert.performedYear ? `, ${concert.performedYear}` : ""}. The whole set, {formatDuration(concert.durationSeconds)} of it,
                free, start to finish.
              </p>
            )}
            <p className="zn-marker">one click. it keeps playing while you dig.</p>
          </div>

          <dl className="cp-facts" data-od="data-sheet">
            <div>
              <dt className="zn-label">{concert.artists.length > 1 ? "Bands" : "Band"}</dt>
              <dd>
                {concert.artists.map((a, i) => (
                  <span key={a.slug}>
                    {i > 0 && (a.role === "WITH" ? " with " : " & ")}
                    {a.hasPage ? <Link href={`/artists/${a.slug}`}>{a.name}</Link> : a.name}
                    {a.creditNote ? ` (${a.creditNote})` : ""}
                  </span>
                ))}
              </dd>
            </div>
            {playedOnLong(concert) && (
              <div>
                <dt className="zn-label">Date</dt>
                <dd>{playedOnLong(concert)}</dd>
              </div>
            )}
            {(concert.venue || concert.city || concert.country) && (
              <div>
                <dt className="zn-label">Where</dt>
                <dd>
                  {concert.venue && <Link href={`/venues/${concert.venue.slug}`}>{concert.venue.name}</Link>}
                  {[concert.venue ? "" : null, concert.city, concert.country].filter((v) => v !== null).join(", ")}
                  {kind ? ` /// ${kind.toLowerCase()}` : ""}
                </dd>
              </div>
            )}
            <div>
              <dt className="zn-label">Length</dt>
              <dd>{[formatDuration(concert.durationSeconds), songCount].filter(Boolean).join(" /// ")}</dd>
            </div>
            {concert.tour && (
              <div>
                <dt className="zn-label">Tour</dt>
                <dd>
                  <Link href={`/tours/${concert.tour.slug}`}>{concert.tour.name}</Link>
                </dd>
              </div>
            )}
            {concert.genres.length > 0 && (
              <div>
                <dt className="zn-label">Genre</dt>
                <dd>
                  {concert.genres.map((g, i) => (
                    <span key={g.slug}>
                      {i > 0 && " /// "}
                      <Link href={`/genres/${g.slug}`}>{g.name}</Link>
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <div>
              <dt className="zn-label">Source</dt>
              <dd>
                {concert.channel.isOfficial ? "Official upload" : "Upload"} by {concert.channel.name}, plays from YouTube
              </dd>
            </div>
            <div>
              <dt className="zn-label">Video</dt>
              <dd>
                {concert.title} /// {compactNumber(concert.viewCount)} views /// up since{" "}
                <time dateTime={concert.publishedAt.toISOString().slice(0, 10)}>{formatDate(concert.publishedAt)}</time>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {(more.length > 0 || upNext.length > 0 || similarCards.length > 0) && (
        <div className="cp-after">
          <div className="cp-after-main">
            {more.length > 0 && band && (
              <section aria-labelledby="more-from" data-od="more-from-artist" className="pg-block">
                <div className="pg-block-head">
                  <SectionTitle id="more-from">More {band.name}</SectionTitle>
                  {band.hasPage && (
                    <Link href={`/artists/${band.slug}`} className="hm-more">
                      THE BAND&rsquo;S PAGE &gt;&gt;
                    </Link>
                  )}
                </div>
                <ul className="hm-cards">
                  {more.map((c, i) => (
                    <GigCard key={c.id} concert={c} index={i} name="place" sizes="(min-width: 901px) 22vw, 50vw" />
                  ))}
                </ul>
              </section>
            )}
            {upNext.length > 0 && (
              <section aria-labelledby="up-next" data-od="up-next" className="pg-block">
                <div className="pg-block-head">
                  <SectionTitle id="up-next" tilt={more.length ? 1 : -1.2}>
                    Up next
                  </SectionTitle>
                  <span className="zn-label">when this one ends, these play</span>
                </div>
                <GigRows concerts={upNext} label="Up next" lead="rank" />
              </section>
            )}
          </div>
          {similarCards.length > 0 && (
            // Similar bands. The player bar's "You might also like" scrolls here (#also-like).
            <section aria-labelledby="also-like" data-od="related" className="pg-block cp-after-side">
              <div className="pg-block-head">
                <SectionTitle id="also-like" tilt={1} small>
                  You might also like
                </SectionTitle>
              </div>
              <ul className="pg-list">
                {similarCards.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/artists/${a.slug}`}>
                      <span className="pg-list-name">{a.name}</span>
                      <span className="zn-data">{gigs(a.concerts)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
