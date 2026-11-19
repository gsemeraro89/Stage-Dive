// Genres: "Sort by noise" (board 04). Quiet on the left, loud on the right; the type grows with the noise.
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, itemList } from "@/lib/structured-data";
import Link from "next/link";
import type { CSSProperties } from "react";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { gigs } from "@/components/gig/words";
import { homeData } from "@/lib/home";

// Served ready-made, rebuilt in the background at most every 10 minutes.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Rock Genres · Full Concerts by Genre",
  description: "Full rock concerts by genre: classic rock, punk, post-punk, metal, grunge, shoegaze, stoner and more.",
  alternates: { canonical: "/genres" },
};

const TILTS = [-2, 1.5, -1, 2, -1.5, 1];
const TONES = ["white", "black"] as const;

export default async function GenresPage() {
  // Every genre of the site, quietest first, with how many gigs it has (0 = not on the wall yet).
  const { noise } = await homeData();
  const live = noise.filter((g) => g.count > 0);
  return (
    <main data-od="genres-index" className="pg">
      <JsonLd data={[breadcrumbs([["Home", "/"], ["Genres", "/genres"]]), itemList("Genres", live.map((g) => ({ path: `/genres/${g.slug}`, name: g.name })))]} />
      <PageHead
        trail={[{ label: "Genres" }]}
        lines={["Sort by", "noise"]}
        data={noise.length ? `${live.length} of ${noise.length} on the wall /// quiet on the left /// loud on the right` : undefined}
      />
      {noise.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>No genres on the wall yet.</p>
        </EmptyNote>
      ) : (
        <section className="pg-section">
          <ul className="hm-noise pg-noise">
            {noise.map((g, i) => {
              const style = {
                "--tilt": `${TILTS[i % TILTS.length]}deg`,
                "--loud": noise.length > 1 ? i / (noise.length - 1) : 1,
              } as CSSProperties;
              return (
                <li key={g.slug}>
                  {g.count > 0 ? (
                    <Link href={`/genres/${g.slug}`} className="hm-genre zn-lift" data-tone={TONES[i % 2]} style={style}>
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

          {live.length > 0 && (
            <ul className="pg-leaders pg-noise-list" aria-label="Genres with gigs">
              {live.map((g) => (
                <li key={g.slug}>
                  <Link href={`/genres/${g.slug}`}>
                    <span className="pg-leaders-name">{g.name}</span>
                    <span className="pg-leaders-dots" aria-hidden="true" />
                    <span className="zn-data">{gigs(g.count)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
