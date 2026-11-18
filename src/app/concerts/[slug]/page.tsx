// Concert page: the player, the facts, our write-up, and what to play next.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadGrid, PlayThumb } from "@/components/catalogue/ConcertTile";
import { PlayerSlot } from "@/components/player/PlayerSlot";
import { TrackTime } from "@/components/player/TrackTime";
import { ArtistLines, lineFromCard } from "@/components/ui/ArtistLine";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { formatDate, formatDuration } from "@/lib/format";
import { toTrack } from "@/lib/player-types";
import { getConcertPage } from "@/lib/queries";
import { compactNumber, placeLine } from "@/lib/site";
import { sourceNote, type TrackView } from "@/lib/setlist/view";

const ID_HINT = "Unreleased or unidentified track";

/** "ID", with its explanation on hover and for screen readers. */
function Id() {
  return <abbr title={ID_HINT}>ID</abbr>;
}

/** "Artist – Title" for one setlist line. Artists with a page on FullDJSet are links. */
function TrackName({ track }: { track: TrackView }) {
  const artistIsId = track.artist !== null && /^ID$/i.test(track.artist);
  return (
    <>
      {track.artist && (
        <>
          <span data-od="track-artist">
            {artistIsId ? (
              <Id />
            ) : track.artistSlug ? (
              <Link href={`/artists/${track.artistSlug}`} className="od-inline">
                {track.artist}
              </Link>
            ) : (
              track.artist
            )}
          </span>
          {" – "}
        </>
      )}
      <span data-od="track-title">{track.unidentified ? <Id /> : track.title}</span>
    </>
  );
}

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

export default async function ConcertPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { concert, queue, moreFromArtist, similarCards, setlist } = page;
  const track = toTrack(concert);
  const mainArtist = concert.artists.find((a) => a.role === "MAIN") ?? concert.artists[0];
  const upNext = queue.slice(0, 4);

  return (
    <main data-od="concert">
      {/* Desktop: the player with the setlist beside it (so times can be clicked with the video in
          view), then the title and the facts under the player. Phones: player, title, setlist,
          facts, up next. Without a setlist the side column is "Up next" alone. Layout: pages.css. */}
      <div className="od-setgrid" data-setlist={setlist ? "" : undefined}>
        <div className="od-setplayer">
          <PlayerSlot track={track} srcSet={concert.thumbnail.srcSet} alt={`${concert.credits} — ${placeLine(concert) || concert.title}`} />
          <p className="od-player-note meta" data-od="player-note">
            <span className="od-muted">Plays here, on this page</span>
            <a href={`https://www.youtube.com/watch?v=${concert.youtubeId}`} rel="noopener" className="od-link">
              Open on YouTube
            </a>
          </p>
        </div>

        <h1 className="od-concert-title display">{concert.title}</h1>

        {(setlist || upNext.length > 0) && (
          <div className="od-setside">
            {setlist && (
              <section
                className="od-setlist"
                aria-labelledby="setlist"
                data-od="setlist"
                data-timed={setlist.tracks[0].time !== null || undefined}
              >
                <div className="od-setlist-head">
                  <h2 id="setlist" className="title">
                    Setlist
                  </h2>
                  <span className="meta od-muted">{count2(setlist.tracks.length)}</span>
                </div>
                <ol className="od-tracks" data-od="track-list">
                  {setlist.tracks.map((t, i) => {
                    const label = [t.artist, t.unidentified ? "ID" : t.title].filter(Boolean).join(" – ");
                    const nextTime = setlist.tracks[i + 1]?.time ?? null;
                    return (
                      <li key={i} className="od-track" data-od="track" data-unidentified={t.unidentified || undefined}>
                        {t.time !== null && (
                          <TrackTime className="od-track-time" track={track} seconds={t.time} nextSeconds={nextTime} label={label} />
                        )}{" "}
                        <span className="od-track-name">
                          <TrackName track={t} />
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="od-setlist-source meta od-muted" data-od="setlist-source">
                  {sourceNote(setlist.source)}
                </p>
              </section>
            )}

            {upNext.length > 0 && (
              <aside className="od-upnext" aria-labelledby="up-next" data-od="up-next">
                <h2 id="up-next" className="meta od-acid">
                  Up next
                </h2>
                <ol aria-label="Up next" data-od="concert-list">
                  {upNext.map((s) => (
                    <li key={s.id} data-od="concert-tile">
                      <PlayThumb concert={s} sizes="(min-width: 1001px) 124px, 132px" />
                      <div className="min-w-0">
                        <h3 className="title">
                          <Link href={`/concerts/${s.slug}`}>{s.title}</Link>
                        </h3>
                        <p className="meta od-muted" style={{ margin: 0 }}>
                          {s.credits} · {compactNumber(s.viewCount)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>
        )}

        <div className="od-setmain">
          <dl className="od-sheet" data-od="data-sheet">
            <div>
              <dt className="meta">{concert.artists.length > 1 ? "Artists" : "Artist"}</dt>
              <dd>
                {concert.artists.map((a, i) => (
                  <span key={a.slug}>
                    {i > 0 && (a.role === "WITH" ? " with " : " & ")}
                    {a.hasPage ? (
                      <Link href={`/artists/${a.slug}`} className="od-sheet-artist">
                        {a.name}
                      </Link>
                    ) : (
                      // A guest without a page of their own: the name in the same type, not a link.
                      <span className="od-sheet-artist od-sheet-artist--plain">{a.name}</span>
                    )}
                    {a.creditNote ? ` (${a.creditNote})` : ""}
                  </span>
                ))}
              </dd>
            </div>
            {concert.venue && (
              <div>
                <dt className="meta">{concert.venueKind?.name === "Festival" ? "Festival" : "Venue"}</dt>
                <dd>
                  <Link href={`/venues/${concert.venue.slug}`} className="od-inline">
                    {concert.venue.name}
                  </Link>
                </dd>
              </div>
            )}
            {(concert.city || concert.country) && (
              <div>
                <dt className="meta">Location</dt>
                <dd>{[concert.city, concert.country].filter(Boolean).join(", ")}</dd>
              </div>
            )}
            <div>
              <dt className="meta">Genre</dt>
              <dd>
                {concert.genres.map((g, i) => (
                  <span key={g.slug}>
                    {i > 0 && " · "}
                    <Link href={`/genres/${g.slug}`} className="od-inline">
                      {g.name}
                    </Link>
                  </span>
                ))}
              </dd>
            </div>
            {concert.venueKind && (
              <div>
                <dt className="meta">VenueKind</dt>
                <dd>{concert.venueKind.name}</dd>
              </div>
            )}
            <div>
              <dt className="meta">Uploaded</dt>
              <dd>
                <time dateTime={concert.publishedAt.toISOString().slice(0, 10)}>{formatDate(concert.publishedAt)}</time>
              </dd>
            </div>
            <div>
              <dt className="meta">Channel</dt>
              <dd>{concert.channel.name}</dd>
            </div>
            <div>
              <dt className="meta">Views</dt>
              <dd>{concert.viewCount.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="meta">Length</dt>
              <dd>{formatDuration(concert.durationSeconds)}</dd>
            </div>
          </dl>

          {concert.writeUp && (
            <p className="od-writeup" data-od="write-up">
              {concert.writeUp}
            </p>
          )}
        </div>
      </div>

      {moreFromArtist.length > 0 && mainArtist && (
        <section className="od-section" aria-labelledby="more-from" data-od="more-from-artist">
          <SectionHead
            id="more-from"
            title={`More from ${mainArtist.name}`}
            note={count2(Math.min(moreFromArtist.length, 5))}
            href={`/artists/${mainArtist.slug}`}
            linkLabel={`All concerts by ${mainArtist.name}`}
          />
          <LeadGrid concerts={moreFromArtist.slice(0, 5)} label={`More from ${mainArtist.name}`} />
        </section>
      )}
      {similarCards.length > 0 && (
        // Similar artists, each with a concert to play. The deck bar's "You might also like" scrolls here.
        <section className="od-section" aria-labelledby="also-like" data-od="related">
          <SectionHead id="also-like" title="You might also like" note={count2(similarCards.length)} />
          <ArtistLines artists={similarCards.map(lineFromCard)} label="You might also like" />
        </section>
      )}
    </main>
  );
}
