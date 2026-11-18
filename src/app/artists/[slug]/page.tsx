// Artist page: name, figures, profile (bio and facts) beside the latest upload, latest uploads, most watched, every concert by year, similar artists.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveRows, ChartList, Credits, Feature, LeadGrid, PlayThumb, SIZES } from "@/components/catalogue/ConcertTile";
import { PlayButton } from "@/components/player/PlayButton";
import { ArtistLines, lineFromCard } from "@/components/ui/ArtistLine";
import { ArtistSquares } from "@/components/ui/ArtistSquares";
import { BigName } from "@/components/ui/BigName";
import { yearRange } from "@/components/ui/Collection";
import { PlayIcon } from "@/components/ui/Icons";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { StatStrip } from "@/components/ui/StatStrip";
import { computeArtistStats } from "@/lib/artist-stats";
import { formatDate, formatDuration } from "@/lib/format";
import { toTrack } from "@/lib/player-types";
import { getArtistPage } from "@/lib/queries";
import { compactNumber } from "@/lib/site";

// One database read per request, shared by the page and its title/description.
const load = cache(getArtistPage);

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

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
    title: `${artist.name} — full DJ concerts and live acts`,
    description,
    alternates: { canonical: `/artists/${artist.slug}` },
    openGraph: { title: artist.name, description, images: concerts[0] ? [concerts[0].thumbnail.src] : undefined },
  };
}

export default async function ArtistPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { artist, concerts, similar, similarCards } = page;
  // "If you like X": the first four in full (artist lines), the others as squares.
  const likeLines = similarCards.slice(0, 4);
  const likeSquares = similar.filter((a) => !likeLines.some((c) => c.slug === a.slug));
  const stats = computeArtistStats(concerts);
  const [latest, ...older] = concerts;
  const moreLatest = older.slice(0, 3);
  const mostWatched = [...concerts].sort((a, b) => b.viewCount - a.viewCount || a.id - b.id).slice(0, 5);

  const years =
    stats.firstYear === null || stats.lastYear === null
      ? "—"
      : stats.firstYear === stats.lastYear
        ? String(stats.lastYear)
        : `${stats.firstYear}–${String(stats.lastYear).slice(2)}`;

  // Profile facts: only what is known. `inline` is the wording used in the mono rail.
  const facts = [
    artist.origin && { label: "From", value: artist.origin, inline: artist.origin },
    artist.bornYear && { label: "Born", value: String(artist.bornYear), inline: `Born ${artist.bornYear}` },
    artist.style && { label: "Style", value: artist.style, inline: artist.style },
    artist.label && { label: "Label", value: artist.label, inline: artist.label },
    artist.aka && { label: "Also written", value: artist.aka, inline: `Also written ${artist.aka}` },
  ].filter((f): f is { label: string; value: string; inline: string } => Boolean(f));
  // The profile column needs something to say: a bio, or at least two facts.
  // With less, the latest upload takes the full width and the column is not drawn at all.
  const hasProfile = Boolean(artist.bio) || facts.length >= 2;

  return (
    <main data-od="artist">
      <header className="od-pagehero">
        <p className="od-rail meta" data-od="artist-rail">
          <span>Artist</span>
          {/* Without a profile column the facts stand here, so they are never shown twice. */}
          {!hasProfile && facts.map((f) => <span key={f.label}>{f.inline}</span>)}
        </p>
        <BigName name={artist.name} max="13vw" maxPhone="20vw" lines={1} />
        <StatStrip
          stats={[
            { label: stats.concerts === 1 ? "Full concert" : "Full concerts", value: String(stats.concerts).padStart(2, "0") },
            { label: "Of music", value: `${stats.hours}h` },
            { label: "Total views", value: compactNumber(stats.totalViews) },
            { label: "On YouTube", value: years },
            { label: stats.countries === 1 ? "Country" : "Countries", value: String(stats.countries).padStart(2, "0") },
          ]}
        />
      </header>

      {!latest ? (
        <section className="od-section">
          <div className="od-empty" data-od="empty">
            <p className="display">No concerts yet</p>
            <p>Nothing by {artist.name} is in the archive right now.</p>
          </div>
        </section>
      ) : (
        <>
          {hasProfile ? (
            <section className="od-intro" aria-label="Profile and latest upload" data-od="latest">
              <div className="od-profile" data-od="profile">
                <p className="meta od-muted" style={{ margin: 0 }}>
                  Profile
                </p>
                {artist.bio && (
                  <p className="od-bio" data-od="bio">
                    {artist.bio}
                  </p>
                )}
                {facts.length > 0 && (
                  <dl className="od-profile-facts meta" data-od="artist-facts">
                    {facts.map((f) => (
                      <div key={f.label}>
                        <dt>{f.label}</dt>
                        <dd>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="od-profile-concert" data-od="artist-actions">
                  <p className="meta od-acid" style={{ margin: 0 }}>
                    Latest upload
                  </p>
                  <h2 className="title">
                    <Link href={`/concerts/${latest.slug}`}>{latest.title}</Link>
                  </h2>
                  <p className="od-profile-concert-meta meta od-muted">
                    <time dateTime={latest.publishedAt.toISOString().slice(0, 10)}>{formatDate(latest.publishedAt)}</time>
                    <span>{compactNumber(latest.viewCount)} views</span>
                  </p>
                  <Credits concert={latest} />
                  <PlayButton track={toTrack(latest)} className="od-play">
                    <PlayIcon />
                    Play latest concert — {formatDuration(latest.durationSeconds)}
                  </PlayButton>
                </div>
              </div>
              <div className="od-intro-media">
                <PlayThumb concert={latest} sizes={SIZES.lead} priority />
              </div>
            </section>
          ) : (
            // No profile yet: the latest upload takes the full width, with its own play button.
            <section className="od-section od-intro-solo" aria-label="Latest upload" data-od="latest">
              <Feature concert={latest} kicker={concerts.length === 1 ? "The concert" : "Latest upload"} />
            </section>
          )}

          {moreLatest.length > 0 && (
            <section className="od-section" aria-labelledby="latest" data-od="more-latest">
              <SectionHead id="latest" title="Latest uploads" note={count2(moreLatest.length)} />
              <LeadGrid concerts={moreLatest} label="Latest uploads" />
            </section>
          )}

          {concerts.length >= 3 && (
            <section className="od-section" aria-labelledby="most-watched" data-od="most-watched">
              <SectionHead id="most-watched" title="Most watched" note="All-time" />
              <ChartList concerts={mostWatched} label="Most watched" />
            </section>
          )}

          <section className="od-section" aria-labelledby="every-concert" data-od="archive">
            <SectionHead id="every-concert" title="Every concert" note={`${count2(concerts.length)} · ${yearRange(concerts)}`} />
            <ArchiveRows concerts={concerts} label={`Every concert by ${artist.name}`} />
          </section>
        </>
      )}

      {similar.length > 0 && (
        <section className="od-section od-section--bleed" aria-labelledby="similar" data-od="similar">
          <SectionHead id="similar" title={`If you like ${artist.name}`} note={count2(similar.length)}>
            <Link href={`/map?artist=${artist.slug}`} className="od-link">
              Find your next DJ
            </Link>
          </SectionHead>
          {likeLines.length > 0 && (
            <div className="od-like-lines">
              <ArtistLines artists={likeLines.map(lineFromCard)} label={`Artists like ${artist.name}`} />
            </div>
          )}
          {likeSquares.length > 0 && (
            <ArtistSquares
              artists={likeSquares}
              columns={likeSquares.length % 5 === 0 ? 5 : 4}
              label={likeLines.length > 0 ? "More similar artists" : "Similar artists"}
            />
          )}
        </section>
      )}
    </main>
  );
}
