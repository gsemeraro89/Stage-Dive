// A band's songs played live (owner, 19 Nov 2026): every song in the band's setlists we hold, most
// played first, each linking to its song page (src/lib/songs.ts). Unstyled structure for now: the
// designer styles it (sgi- classes, data-od). Built on its first visit, then served ready-made and
// rebuilt at most every 10 minutes.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/gig/PageHead";
import { cutName } from "@/components/gig/words";
import { JsonLd } from "@/components/seo/JsonLd";
import { bandSongsAnswers, positionLabel } from "@/lib/answers";
import { formatDuration } from "@/lib/format";
import { bandSongData } from "@/lib/queries";
import { bandSongsSearchTitle, clip, robotsFor, shareImages, songIndexIsStrong } from "@/lib/seo";
import { bandSongsPath, songPath, type Song } from "@/lib/songs";
import { bandSongsJsonLd, breadcrumbs } from "@/lib/structured-data";
import { thumbnailSources } from "@/lib/thumbnails";

const load = cache(bandSongData);

export const revalidate = 600;
/** No page is built ahead: each one is built on its first visit, then kept. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ band: string }> };

const tallies = (songs: Song[]) => songs.map((s) => ({ title: s.title, count: s.versions.length }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).band);
  if (!page || !page.songs.length) return {};
  const { band, songs, setlists } = page;
  const title = bandSongsSearchTitle(band.name);
  const description = clip(bandSongsAnswers(band, tallies(songs), setlists).lead, 300);
  const path = bandSongsPath(band.slug);
  const still = songs[0].newest?.concert ?? songs[0].versions[0].concert;
  return {
    title,
    description,
    alternates: { canonical: path, types: { "text/markdown": `${path}.md` } },
    robots: robotsFor(songIndexIsStrong({ songs: songs.length, setlists })),
    openGraph: { title, description, url: path, images: shareImages(thumbnailSources(still.youtubeId, still.thumbnailUrl).src) },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** "1996 to 2006", "1997", or nothing. */
function years(s: Song): string | null {
  const [a, b] = [s.oldest?.concert.performedYear, s.newest?.concert.performedYear];
  if (!a || !b) return null;
  return a === b ? String(a) : `${a} to ${b}`;
}

export default async function BandSongsPage({ params }: Props) {
  const page = await load((await params).band);
  if (!page || !page.songs.length) notFound();
  const { band, songs, setlists } = page;
  const answers = bandSongsAnswers(band, tallies(songs), setlists);
  const path = bandSongsPath(band.slug);

  return (
    <main data-od="band-songs" className="pg sgi">
      <JsonLd
        data={[
          bandSongsJsonLd(band, songs),
          breadcrumbs([
            ["Home", "/"],
            ["Bands", "/artists"],
            [band.name, `/artists/${band.slug}`],
            ["Songs played live", path],
          ]),
        ]}
      />
      <PageHead
        trail={[{ label: "Bands", href: "/artists" }, { label: band.name, href: `/artists/${band.slug}` }, { label: "Songs played live" }]}
        lines={cutName(`${band.name} songs played live`)}
        data={
          <>
            {songs.length === 1 ? "1 song" : `${songs.length} songs`} /// {setlists === 1 ? "1 setlist" : `${setlists} setlists`}
          </>
        }
      >
        <p className="pg-lead" data-od="band-songs-lead">
          {answers.lead}
        </p>
      </PageHead>

      <ol className="sgi-list" data-od="band-songs-list" aria-label={`Songs ${band.name} played live, most played first`}>
        {songs.map((s) => (
          <li key={s.slug} className="sgi-song">
            <Link href={songPath(band.slug, s.slug)} className="sgi-song-name">
              {s.title}
            </Link>{" "}
            <span className="sgi-song-data">
              {[
                s.versions.length === 1 ? "1 version" : `${s.versions.length} versions`,
                years(s),
                s.position ? positionLabel(s.position).toLowerCase() : null,
                s.averageLengthSeconds !== null ? formatDuration(s.averageLengthSeconds) : null,
              ]
                .filter(Boolean)
                .join(" /// ")}
            </span>
          </li>
        ))}
      </ol>

      <p className="sgi-links" data-od="band-songs-links">
        <Link href={`/artists/${band.slug}`} className="hm-more">
          {`ALL ${band.name.toUpperCase()} SETLISTS`} &gt;&gt;
        </Link>
      </p>
    </main>
  );
}
