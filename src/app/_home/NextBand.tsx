// "Find your next band" on the homepage: the way in to the wall of similar bands (/map).
// Four layouts on trial, so the owner can compare them (/?nb=b, c, d; default a):
//   a  the box you type a band into + a scrap of today's wall
//   b  a sticker sheet: no typing, tap a band you love
//   c  band of the day: a flyer with its neighbours as tear-off tabs
//   d  the crossroads: from today's band, go louder, softer, older or newer
// Data: getMap(defaultMapArtist()), mapArtistIndex() and the homepage's "sort by noise" order.
// Nothing is invented: louder/softer comes from our own genre order, older/newer from the year of
// each band's most watched gig. Names only: no picture is used, so none can be altered.
// Styles: src/styles/home.css (hm-next, hm-wall, hm-pick, hm-flyer, hm-cross).
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cutName, gigs } from "@/components/gig/words";
import { PlayButton } from "@/components/player/PlayButton";
import { MapSearch } from "@/components/ui/MapSearch";
import { PaperStrip, PlayGlyph, StripHeading, Tape } from "@/components/zine";
import { formatDuration } from "@/lib/format";
import { toTrack } from "@/lib/player-types";
import type { ArtistCard, MapArtist } from "@/lib/queries";

export type NextBandOption = "a" | "b" | "c" | "d";

type Wall = { centre: ArtistCard; artists: MapArtist[] } | null;
type Band = { slug: string; name: string };
type Props = { bands: Band[]; wall: Wall; noise: { slug: string }[] };

const TILTS = [-2.5, 1.5, -1, 2.5, -1.5, 2];
const tilt = (deg: number) => ({ "--tilt": `${deg}deg` }) as CSSProperties;
const wallHref = (slug: string) => `/map?artist=${slug}`;

function Title({ children = "Find your next band" }: { children?: ReactNode }) {
  return (
    <PaperStrip as="h2" size="h2" tone="black" tilt={-1.2} className="hm-title">
      <span id="hm-next">{children}</span>
    </PaperStrip>
  );
}

function Section({ option, children }: { option: NextBandOption; children: ReactNode }) {
  return (
    <section className="hm-section hm-next" aria-labelledby="hm-next" data-od="next-band" data-option={option}>
      {children}
    </section>
  );
}

// ---------- a. The box + a scrap of the wall ----------

/** How many bands the scrap of wall shows around today's band. */
const WALL_SIZE = 6;

function Scrap({ bands, wall }: Props) {
  // getMap gives the neighbours nearest first. Around the centre they go left, right, left… so the
  // nearest ones sit next to it; on the scrap they keep their size by rank.
  const near = (wall?.artists ?? []).slice(0, WALL_SIZE).map((a, i) => ({ ...a, rank: i }));
  const before = near.filter((_, i) => i % 2 === 1).reverse();
  const after = near.filter((_, i) => i % 2 === 0);
  const pin = (a: (typeof near)[number]) => (
    <li key={a.slug}>
      <Link
        href={wallHref(a.slug)}
        className="hm-wall-name zn-lift"
        data-near={a.rank < 2 ? 1 : a.rank < 4 ? 2 : 3}
        data-tone={a.rank % 3 === 1 ? "black" : "white"}
        style={tilt(TILTS[a.rank % TILTS.length])}
      >
        {a.name}
      </Link>
    </li>
  );

  return (
    <Section option="a">
      <div className="hm-next-ask">
        <Title />
        <p className="hm-next-text">Name one band you love. We pin up the ones standing right next to them. Every name is a whole gig.</p>
        <MapSearch artists={bands} id="hm-next-q" lead />
      </div>

      {wall && near.length > 0 && (
        <div className="hm-wall">
          <Tape at="top-left" tilt={-5} />
          <p className="zn-label hm-wall-label">
            TODAY&rsquo;S WALL /// {near.length} OF {wall.artists.length} AROUND {wall.centre.name}
          </p>
          <ul className="hm-wall-names" aria-label={`Bands like ${wall.centre.name}`}>
            {before.map(pin)}
            <li>
              <Link href={wallHref(wall.centre.slug)} className="hm-wall-name hm-wall-centre zn-lift" style={tilt(-1)}>
                <span className="od-sr">Today&rsquo;s band: </span>
                {wall.centre.name}
              </Link>
            </li>
            {after.map(pin)}
          </ul>
          <div className="hm-wall-foot">
            <span className="zn-marker" style={tilt(-2)}>
              bigger = more alike
            </span>
            <Link href={wallHref(wall.centre.slug)} className="hm-more">
              THE WHOLE WALL &gt;&gt;
            </Link>
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------- b. The sticker sheet ----------

/** Stickers on the sheet: all of them on a desktop, the first ten on a phone (CSS). */
const SHEET_SIZE = 18;

function StickerSheet({ bands }: Props) {
  // A different corner of the A-Z every day, so the sheet is not always the same eighteen.
  const day = Math.floor(Date.now() / 86_400_000);
  const start = bands.length > SHEET_SIZE ? (day * 7) % bands.length : 0;
  const sheet = [...bands.slice(start), ...bands.slice(0, start)].slice(0, SHEET_SIZE);

  return (
    <Section option="b">
      <div className="hm-pick-head">
        <Title />
        <span className="zn-marker" style={tilt(1.5)}>
          no typing. peel one you love.
        </span>
      </div>
      <ul className="hm-pick" aria-label="Pick a band you love">
        {sheet.map((b, i) => (
          <li key={b.slug}>
            <Link
              href={wallHref(b.slug)}
              className="hm-wall-name hm-sticker zn-lift"
              data-tone={i % 3 === 1 ? "black" : "white"}
              data-hand={i % 4 === 0 ? "heavy" : undefined}
              style={tilt(TILTS[i % TILTS.length])}
            >
              {b.name}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hm-pick-foot">
        <p className="hm-next-text">Peel one off. We pin up the bands standing right next to them, each with a whole gig behind it.</p>
        <Link href="/map" className="hm-more">
          NOT ON THE SHEET? TYPE A BAND &gt;&gt;
        </Link>
      </div>
    </Section>
  );
}

// ---------- c. Band of the day, with tear-off tabs ----------

/** Tabs along the foot of the flyer: all of them on a desktop, the first six on a phone (CSS). */
const TAB_COUNT = 8;

function Flyer({ wall }: Props) {
  if (!wall || wall.artists.length === 0) return null;
  const { centre } = wall;
  const tabs = wall.artists.slice(0, TAB_COUNT);
  const gig = centre.mostWatched;
  const data = [centre.origin, ...centre.genres.slice(0, 2).map((g) => g.name), gigs(centre.concerts)].filter(Boolean).join(" /// ");

  return (
    <Section option="c">
      <div className="hm-next-ask">
        <Title />
        <p className="hm-next-text">
          One band a day goes up on the wall. Like them? Tear a name off the bottom: each tab is a band standing right next to them.
        </p>
        <Link href="/map" className="hm-more">
          OR TYPE A BAND YOU LOVE &gt;&gt;
        </Link>
      </div>

      <div className="hm-flyer">
        <Tape at="top-center" tilt={-3} />
        <div className="hm-flyer-body">
          <p className="zn-label">BAND OF THE DAY</p>
          <StripHeading as="h3" size="h2" lines={cutName(centre.name)} />
          {data && <p className="zn-data hm-flyer-data">{data}</p>}
          <div className="hm-flyer-acts">
            <PlayButton track={toTrack(gig)} className="zn-btn hm-flyer-play">
              <PlayGlyph />
              Play it loud /// {formatDuration(gig.durationSeconds)}
            </PlayButton>
            <Link href={`/artists/${centre.slug}`} className="hm-more">
              THE BAND&rsquo;S PAGE &gt;&gt;
            </Link>
          </div>
        </div>
        <p className="hm-flyer-take">
          <span className="zn-marker" style={tilt(-2)}>
            like them? take one:
          </span>
        </p>
        <ul className="hm-tabs" aria-label={`Bands like ${centre.name}`}>
          {tabs.map((a) => (
            <li key={a.slug}>
              <Link href={wallHref(a.slug)} className="hm-tab">
                <span>{a.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

// ---------- d. The crossroads ----------

type Way = { word: string; band: MapArtist; note: string };

/** From today's band: one neighbour that is louder, one softer, one with an older big gig, one newer. */
function ways(wall: NonNullable<Wall>, noise: { slug: string }[]): Way[] {
  const order = new Map(noise.map((g, i) => [g.slug, i]));
  const loud = (a: ArtistCard) => {
    const found = a.genres.flatMap((g) => (order.has(g.slug) ? [order.get(g.slug)!] : []));
    return found.length ? found.reduce((x, y) => x + y, 0) / found.length : null;
  };
  const year = (a: ArtistCard) => a.mostWatched.performedYear ?? null;
  const used = new Set<string>();
  const out: Way[] = [];
  const pick = (word: string, value: (a: ArtistCard) => number | null, sign: 1 | -1, note: (a: MapArtist) => string) => {
    const from = value(wall.centre);
    if (from === null) return;
    const best = wall.artists
      .filter((a) => !used.has(a.slug) && value(a) !== null && (value(a)! - from) * sign > 0)
      .sort((a, b) => (value(b)! - value(a)!) * sign)[0];
    if (!best) return;
    used.add(best.slug);
    out.push({ word, band: best, note: note(best) });
  };
  const genre = (a: MapArtist) => a.genres[0]?.name ?? "";
  const live = (a: MapArtist) => `LIVE IN ${a.mostWatched.performedYear}`;
  pick("Louder", loud, 1, genre);
  pick("Softer", loud, -1, genre);
  pick("Older", year, -1, live);
  pick("Newer", year, 1, live);
  return out;
}

function Crossroads({ wall, noise }: Props) {
  if (!wall) return null;
  const signs = ways(wall, noise);
  if (signs.length < 2) return null;
  const { centre } = wall;

  return (
    <Section option="d">
      <div className="hm-next-ask">
        <Title />
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
        <ul aria-label={`Ways on from ${centre.name}`}>
          {signs.map((s, i) => (
            <li key={s.word} data-way={s.word.toLowerCase()}>
              <Link href={wallHref(s.band.slug)} className="hm-sign zn-lift" style={tilt([1.5, -1.5, -1, 1][i])}>
                <span className="hm-sign-word">{s.word} &gt;&gt;</span>
                <span className="hm-sign-name">{s.band.name}</span>
                {s.note && <span className="zn-data hm-sign-note">{s.note}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <span className="zn-marker hm-cross-hint" style={tilt(-2)}>
          four ways out. keep turning.
        </span>
      </div>
    </Section>
  );
}

/** A layout that cannot be filled (no wall today) falls back to the box. */
export function NextBand({ option, ...props }: Props & { option: NextBandOption }) {
  const usable = option === "c" ? !!props.wall?.artists.length : option === "d" ? !!props.wall && ways(props.wall, props.noise).length >= 2 : true;
  if (option === "b") return <StickerSheet {...props} />;
  if (option === "c" && usable) return <Flyer {...props} />;
  if (option === "d" && usable) return <Crossroads {...props} />;
  return <Scrap {...props} />;
}
