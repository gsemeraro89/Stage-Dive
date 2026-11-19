// Song page (owner, 19 Nov 2026): one song a band plays live, with every concert we hold where they
// played it, newest first, each linking to the concert page at the song (?t=). Facts from the
// setlists only (src/lib/songs.ts). Questions are in the Markdown copy only (/songs/<band>/<song>.md),
// as on concert pages. Unstyled structure for now: the designer styles it (sg- classes, data-od).
// Built on its first visit, then served ready-made and rebuilt at most every 10 minutes.
import type { Metadata } from "next";
import { cache, type ReactNode } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PageHead, SectionTitle } from "@/components/gig/PageHead";
import { cutName } from "@/components/gig/words";
import { JsonLd } from "@/components/seo/JsonLd";
import { positionLabel, songAnswers } from "@/lib/answers";
import { formatDuration } from "@/lib/format";
import { bandSongData } from "@/lib/queries";
import { clip, robotsFor, shareImages, songIsStrong, songSearchTitle } from "@/lib/seo";
import { bandSongsPath, songPath, type Song, type SongVersion } from "@/lib/songs";
import { songSlug } from "@/lib/song-title";
import { breadcrumbs, songJsonLd } from "@/lib/structured-data";
import { thumbnailSources } from "@/lib/thumbnails";

const load = cache(bandSongData);

export const revalidate = 600;
/** No page is built ahead: each one is built on its first visit, then kept. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ band: string; song: string }> };

/** Other songs of the band listed at the bottom (most played first). */
const OTHER_SONGS = 10;

async function find(bandSlug: string, songSlug: string) {
  const data = await load(bandSlug);
  if (!data) return null;
  const song = data.songs.find((s) => s.slug === songSlug);
  return song ? { ...data, song } : { ...data, song: null };
}

/** "Pinkpop 1996" for a version's concert, or its video title when nothing else is known. */
const gigName = (v: SongVersion) => [v.concert.venue?.name ?? v.concert.city, v.concert.performedYear].filter(Boolean).join(" ") || v.concert.title;

/** An address filed under another spelling ("street-spirit-fade-out" -> "street-spirit") moves there for good. */
function movedTo(songs: Song[], slug: string): string | null {
  return songs.find((s) => s.slug !== slug && s.versions.some((v) => songSlug(v.title) === slug))?.slug ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { band: b, song: s } = await params;
  const page = await find(b, s);
  if (!page?.song) return {};
  const { band, song, setlists } = page;
  const title = songSearchTitle(song.title, band.name, song.versions.length);
  const description = clip(songAnswers(band, song, setlists).lead, 300);
  const path = songPath(band.slug, song.slug);
  const still = song.newest?.concert ?? song.versions[0].concert;
  return {
    title,
    description,
    alternates: { canonical: path, types: { "text/markdown": `${path}.md` } },
    robots: robotsFor(songIsStrong(song.versions.length)),
    openGraph: { title, description, url: path, type: "music.song", images: shareImages(thumbnailSources(still.youtubeId, still.thumbnailUrl).src) },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SongPage({ params }: Props) {
  const { band: b, song: s } = await params;
  const page = await find(b, s);
  if (!page) notFound();
  if (!page.song) {
    const to = movedTo(page.songs, s);
    if (to) permanentRedirect(songPath(page.band.slug, to));
    notFound();
  }
  const { band, song, songs, setlists } = page;
  const answers = songAnswers(band, song, setlists);
  const path = songPath(band.slug, song.slug);
  const others = songs.filter((o) => o.slug !== song.slug).slice(0, OTHER_SONGS);

  const facts: { id: string; label: string; value: ReactNode }[] = [
    { id: "versions", label: "Live versions", value: `${song.versions.length} of ${setlists} setlists` },
    ...(song.oldest ? [{ id: "oldest", label: "Oldest here", value: <Link href={song.oldest.href}>{gigName(song.oldest)}</Link> }] : []),
    ...(song.newest && song.versions.length > 1 ? [{ id: "newest", label: "Newest here", value: <Link href={song.newest.href}>{gigName(song.newest)}</Link> }] : []),
    ...(song.position ? [{ id: "position", label: "Place in the set", value: positionLabel(song.position) }] : []),
    ...(song.averageLengthSeconds !== null
      ? [{ id: "length", label: song.timedVersions > 1 ? "Average length" : "Length", value: formatDuration(song.averageLengthSeconds) }]
      : []),
    ...(song.creditedTo ? [{ id: "credit", label: "Credited to", value: song.creditedTo }] : []),
  ];
  const links: { id: string; label: string; items: { href: string; name: string }[] }[] = [
    { id: "places", label: "Played at", items: song.places.map((p) => ({ href: `/venues/${p.slug}`, name: p.name })) },
    { id: "decades", label: "Decades", items: song.decades.map((d) => ({ href: `/decades/${d.label}`, name: `The ${d.label}` })) },
    { id: "tours", label: "Tours", items: song.tours.map((t) => ({ href: `/tours/${t.slug}`, name: t.name })) },
  ].filter((l) => l.items.length > 0);

  return (
    <main data-od="song" className="pg sg">
      <JsonLd
        data={[
          ...songJsonLd(band, song),
          breadcrumbs([
            ["Home", "/"],
            ["Bands", "/artists"],
            [band.name, `/artists/${band.slug}`],
            ["Songs played live", bandSongsPath(band.slug)],
            [song.title, path],
          ]),
        ]}
      />
      <PageHead
        trail={[
          { label: "Bands", href: "/artists" },
          { label: band.name, href: `/artists/${band.slug}` },
          { label: "Songs", href: bandSongsPath(band.slug) },
          { label: song.title },
        ]}
        lines={cutName(song.title)}
        data={
          <>
            <Link href={`/artists/${band.slug}`}>{band.name}</Link> /// {song.versions.length === 1 ? "1 live version" : `${song.versions.length} live versions`}
          </>
        }
      >
        <p className="pg-lead" data-od="song-lead">
          {answers.lead}
        </p>
      </PageHead>

      <dl className="sg-facts" data-od="song-facts">
        {facts.map((f) => (
          <div key={f.id} data-fact={f.id}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
        {links.map((l) => (
          <div key={l.id} data-fact={l.id}>
            <dt>{l.label}</dt>
            <dd>
              {l.items.map((it, i) => (
                <span key={it.href}>
                  {i > 0 && " /// "}
                  <Link href={it.href}>{it.name}</Link>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="versions" data-od="song-versions" className="sg-versions">
        <SectionTitle id="versions">Every live version</SectionTitle>
        <ol className="sg-version-list">
          {song.versions.map((v) => (
            <li key={v.concert.id} className="sg-version" data-timed={v.time !== null || undefined}>
              <Link href={v.href} className="sg-version-play" data-od="song-version-play">
                {v.time !== null ? `Play from ${formatDuration(v.time)}` : "Play the concert"}
              </Link>{" "}
              <Link href={`/concerts/${v.concert.slug}`} className="sg-version-gig">
                {gigName(v)}
              </Link>{" "}
              <span className="sg-version-data">
                {[`song ${v.position} of ${v.of}`, v.lengthSeconds !== null ? formatDuration(v.lengthSeconds) : null, v.title !== song.title ? `as “${v.title}”` : null]
                  .filter(Boolean)
                  .join(" /// ")}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {others.length > 0 && (
        <section aria-labelledby="more-songs" data-od="song-more" className="sg-more">
          <SectionTitle id="more-songs" small>
            More {band.name} songs played live
          </SectionTitle>
          <ul className="pg-list">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={songPath(band.slug, o.slug)}>
                  <span className="pg-list-name">{o.title}</span>
                  <span className="zn-data">{o.versions.length === 1 ? "1 version" : `${o.versions.length} versions`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="sg-links" data-od="song-links">
        <Link href={bandSongsPath(band.slug)} className="hm-more">
          EVERY {band.name.toUpperCase()} SONG ({songs.length}) &gt;&gt;
        </Link>{" "}
        <Link href={`/artists/${band.slug}`} className="hm-more">
          THE BAND&rsquo;S PAGE &gt;&gt;
        </Link>
      </p>
    </main>
  );
}
