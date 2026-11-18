// Bands: a few on the wall as pictures, then every band A to Z, typed like a contents page.
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { EmptyNote, PageHead, SectionTitle } from "@/components/gig/PageHead";
import { gigs } from "@/components/gig/words";
import { PaperStrip, PhotoFrame } from "@/components/zine";
import { bandPhotosFor } from "@/lib/photos/view";
import { listArtists } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bands — every band with a full gig",
  description: "Every band on STAGEDIVE with a full concert you can watch free.",
  alternates: { canonical: "/artists" },
};

const TILTS = [-1.2, 1, -0.8];
/** "The Cure" is filed under C. */
const fileUnder = (name: string) => name.replace(/^the\s+/i, "");

export default async function ArtistsPage() {
  const artists = await listArtists();
  const photos = await bandPhotosFor(artists.map((a) => a.slug));
  // On the wall: bands with a licensed photo first, then the ones with most gigs. Six at most.
  const wall = [...artists]
    .sort((a, b) => Number(photos.has(b.slug)) - Number(photos.has(a.slug)) || b.concerts - a.concerts || a.name.localeCompare(b.name))
    .filter((a) => photos.has(a.slug) || a.cover)
    .slice(0, 6);
  const letters = new Map<string, typeof artists>();
  for (const a of [...artists].sort((x, y) => fileUnder(x.name).localeCompare(fileUnder(y.name)))) {
    const first = fileUnder(a.name).charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";
    letters.set(letter, [...(letters.get(letter) ?? []), a]);
  }
  const total = artists.reduce((n, a) => n + a.concerts, 0);

  return (
    <main data-od="artists-index" className="pg">
      <PageHead
        trail={[{ label: "Bands" }]}
        lines={["Bands"]}
        data={artists.length ? `${artists.length} ${artists.length === 1 ? "band" : "bands"} /// ${gigs(total)} /// A to Z` : undefined}
        note="every one of them has a full gig here"
      />
      {artists.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>No bands on the wall yet.</p>
        </EmptyNote>
      ) : (
        <>
          {wall.length > 0 && (
            <section className="pg-section" aria-label="On the wall">
              <ul className="hm-cards">
                {wall.map((a, i) => {
                  const photo = photos.get(a.slug);
                  const strip = (
                    <PaperStrip tone="white" size="name" className="hm-card-name">
                      <Link href={`/artists/${a.slug}`}>{a.name}</Link>
                    </PaperStrip>
                  );
                  const sizes = "(min-width: 901px) 30vw, 50vw";
                  return (
                    <li key={a.slug} className="hm-card" style={{ "--tilt": `${TILTS[i % 3]}deg` } as CSSProperties}>
                      {photo ? (
                        <PhotoFrame kind="treated" src={photo.src} alt={`${a.name}, photocopied`} ratio="4 / 3" sizes={sizes} credit={photo.credit} creditHref={photo.sourcePage}>
                          {strip}
                        </PhotoFrame>
                      ) : (
                        a.cover && (
                          // A YouTube picture (a gig still or the band's channel picture): whole and untouched.
                          <PhotoFrame
                            kind="youtube"
                            src={a.cover.thumbnail.src}
                            srcSet={a.cover.thumbnail.srcSet}
                            width={a.cover.thumbnail.width}
                            height={a.cover.thumbnail.height}
                            sizes={sizes}
                            alt={a.cover.portrait ? `${a.name}: the band's picture` : `Still from a gig by ${a.name}`}
                            className={a.cover.portrait ? "pg-avatar" : undefined}
                          >
                            {strip}
                          </PhotoFrame>
                        )
                      )}
                      <p className="zn-data hm-card-data">{gigs(a.concerts)}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="pg-section pg-section--cut" aria-labelledby="a-to-z">
            <div className="pg-block-head">
              <SectionTitle id="a-to-z">A to Z</SectionTitle>
              <span className="zn-label">&ldquo;The&rdquo; doesn&rsquo;t count</span>
            </div>
            <div className="pg-az">
              {[...letters].map(([letter, bands]) => (
                <div key={letter} className="pg-az-group">
                  <h3 className="pg-az-letter">{letter}</h3>
                  <ul className="pg-leaders" aria-label={`Bands under ${letter}`}>
                    {bands.map((a) => (
                      <li key={a.slug}>
                        <Link href={`/artists/${a.slug}`}>
                          <span className="pg-leaders-name">{a.name}</span>
                          <span className="pg-leaders-dots" aria-hidden="true" />
                          <span className="zn-data">{gigs(a.concerts)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
