// "Find your next band" on the homepage: the crossroads. You are here (today's band); four signs
// point out of it: louder, softer, older, newer, each with up to three bands standing next to it.
// Every name opens the wall of similar bands (/map) from that band, so you can keep turning.
// Data: getMap(defaultMapArtist()) and the homepage's "sort by noise" order. Nothing is invented:
// louder/softer comes from our own genre order, older/newer from the year of each band's most
// watched gig. Names and genres only: no picture is used, so none can be altered.
// Styles: src/styles/home.css (hm-next, hm-cross, hm-sign).
import Link from "next/link";
import type { CSSProperties } from "react";
import { PaperStrip } from "@/components/zine";
import type { ArtistCard, MapArtist } from "@/lib/queries";

type Wall = { centre: ArtistCard; artists: MapArtist[] };
type Way = { word: string; bands: MapArtist[] };

/** Bands on one sign, at most. Four signs of three is the whole wall of twelve. */
const PER_SIGN = 3;
const SIGN_TILTS = [1.2, -1.2, -0.8, 1];
const tilt = (deg: number) => ({ "--tilt": `${deg}deg` }) as CSSProperties;
const wallHref = (slug: string) => `/map?artist=${slug}`;

/**
 * Deal today's neighbours onto the four signs. A band goes on one sign only. The signs take turns
 * (one band each per round, the sign with the fewest choices first), so none is left bare; each
 * takes the band furthest its own way first. A sign nobody fits is left out.
 */
function ways(wall: Wall, noise: { slug: string }[]): Way[] {
  const order = new Map(noise.map((g, i) => [g.slug, i]));
  const loud = (a: ArtistCard) => {
    const found = a.genres.flatMap((g) => (order.has(g.slug) ? [order.get(g.slug)!] : []));
    return found.length ? found.reduce((x, y) => x + y, 0) / found.length : null;
  };
  const year = (a: ArtistCard) => a.mostWatched.performedYear ?? null;
  const signs: { word: string; value: (a: ArtistCard) => number | null; sign: 1 | -1; bands: MapArtist[] }[] = [
    { word: "Louder", value: loud, sign: 1, bands: [] },
    { word: "Softer", value: loud, sign: -1, bands: [] },
    { word: "Older", value: year, sign: -1, bands: [] },
    { word: "Newer", value: year, sign: 1, bands: [] },
  ];
  const used = new Set<string>();
  const fits = (s: (typeof signs)[number]) => {
    const from = s.value(wall.centre);
    if (from === null) return [];
    return wall.artists
      .filter((a) => !used.has(a.slug) && s.value(a) !== null && (s.value(a)! - from) * s.sign > 0)
      .sort((a, b) => (s.value(b)! - s.value(a)!) * s.sign);
  };
  for (let round = 0; round < PER_SIGN; round++) {
    // The sign with the fewest bands left to choose from picks first, so it is not left bare.
    for (const s of [...signs].sort((a, b) => fits(a).length - fits(b).length)) {
      const best = fits(s)[0];
      if (!best) continue;
      used.add(best.slug);
      s.bands.push(best);
    }
  }
  return signs.filter((s) => s.bands.length > 0).map(({ word, bands }) => ({ word, bands }));
}

/** Left out (the page goes on without it) when there is no wall today or fewer than two ways out. */
export function NextBand({ wall, noise }: { wall: Wall | null; noise: { slug: string }[] }) {
  if (!wall) return null;
  const signs = ways(wall, noise);
  if (signs.length < 2) return null;
  const { centre } = wall;
  const count = ["", "one way", "two ways", "three ways", "four ways"][signs.length];

  return (
    <section className="hm-section hm-next" aria-labelledby="hm-next" data-od="next-band">
      <div className="hm-next-ask">
        <PaperStrip as="h2" size="h2" tone="black" tilt={-1.2} className="hm-title">
          <span id="hm-next">Find your next band</span>
        </PaperStrip>
        <p className="hm-next-text">Start from today&rsquo;s band and pick a way out. Every turn is another band, with a whole gig behind it.</p>
        <Link href="/map" className="hm-more">
          OR TYPE A BAND YOU LOVE &gt;&gt;
        </Link>
      </div>

      <div className="hm-cross" data-ways={signs.length}>
        <Link href={wallHref(centre.slug)} className="hm-cross-here zn-lift" style={tilt(-1)}>
          <span className="zn-label">YOU ARE HERE</span>
          <span className="hm-cross-name">{centre.name}</span>
        </Link>
        <div className="hm-signs">
          {signs.map((s, i) => (
            <div key={s.word} className="hm-sign" style={tilt(SIGN_TILTS[i])}>
              <h3 className="hm-sign-word">{s.word} &gt;&gt;</h3>
              <ul aria-label={`${s.word} than ${centre.name}`}>
                {s.bands.map((a) => (
                  <li key={a.slug}>
                    <Link href={wallHref(a.slug)} className="hm-sign-band">
                      <span className="hm-sign-name">{a.name}</span>
                      {a.genres[0] && <span className="zn-data hm-sign-note">{a.genres[0].name}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <span className="zn-marker hm-cross-hint" style={tilt(-2)}>
          {count} out. keep turning.
        </span>
      </div>
    </section>
  );
}
