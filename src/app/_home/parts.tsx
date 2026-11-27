// Pieces of the homepage (src/app/_home/HomePage.tsx, "the issue").
// Data: homepageData() in src/lib/home.ts. Styles: src/styles/home.css (hx-).
//
// Pictures (design/DESIGN.md section 6): a YouTube picture is shown whole and untouched, with at most a
// play control on it. A band or festival photo (licensed, already photocopied) may be cropped and always
// carries its credit, linked to the original. A bootleg always says "Bootleg" and "From <channel>".
import Form from "next/form";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PlayOnPicture } from "@/components/gig/GigPicture";
import { placeYear } from "@/components/gig/words";
import { PlayButton } from "@/components/player/PlayButton";
import { PlayLink } from "@/components/player/PlayLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { PaperStrip, PhotoFrame, PlayableSetlist, PlayGlyph, SearchGlyph, Sheet, Staple } from "@/components/zine";
import { BOOTLEG_LABEL, bootlegCredit } from "@/lib/bootlegs";
import { formatDuration } from "@/lib/format";
import type { HomepageData, HomePicture } from "@/lib/home";
import { toTrack } from "@/lib/player-types";
import type { ConcertView } from "@/lib/queries";
import type { SetlistView } from "@/lib/setlist/view";
import { compactNumber } from "@/lib/site";
import { homeBandsList, homePlacesList, homeRankingLists } from "@/lib/structured-data";

export const n = (x: number) => x.toLocaleString("en-GB");
export const tilt = (deg: number) => ({ "--tilt": `${deg}deg` }) as CSSProperties;
export const viewsLine = (c: ConcertView) => `${compactNumber(c.viewCount)} views on YouTube`;

/** ItemLists for the bands, the places and the rankings shown (src/lib/structured-data.ts). */
export function HomeJsonLd({ data }: { data: HomepageData }) {
  const lists = [homeBandsList(data.legends), homePlacesList(data.places), ...homeRankingLists(data.bestOf)].filter(Boolean);
  return lists.length ? <JsonLd data={lists as never} /> : null;
}

/** A section title on a cut strip, with an optional typed link beside it. */
export function Head({ id, title, more, tone = "black", children }: { id: string; title: string; more?: { href: string; label: ReactNode }; tone?: "black" | "white"; children?: ReactNode }) {
  return (
    <div className="hm-head hx-head">
      <PaperStrip as="h2" size="h2" tone={tone} tilt={-1.2} className="hm-title">
        <span id={id}>{title}</span>
      </PaperStrip>
      {children}
      {more && (
        <Link href={more.href} className="hm-more">
          {more.label} &gt;&gt;
        </Link>
      )}
    </div>
  );
}

/** "find a gig:" as on the header, bigger. Dead straight: you type into it. */
export function FindAGig({ id }: { id: string }) {
  return (
    <Form action="/concerts" role="search" className="hx-find" data-od="home-search">
      <label htmlFor={id} className="zn-marker">
        find a gig:
      </label>
      <span className="hx-find-row">
        <input id={id} type="search" name="q" placeholder="band / venue / year" maxLength={80} />
        <button type="submit" className="zn-icon" data-tone="black" aria-label="Search" title="Search">
          <SearchGlyph />
        </button>
      </span>
    </Form>
  );
}

/** A licensed photo's short credit for a wall of pictures: author and licence, linked to the original. */
function shortCredit(p: { author?: string | null; license?: string | null; credit: string }) {
  return p.author && p.license ? `Photo: ${p.author} / ${p.license}` : p.credit;
}

/**
 * A band's or a place's picture. A licensed photo is cut to `ratio`; a concert picture keeps its own
 * shape, whole, on the black mount.
 */
export function Pic({
  picture,
  name,
  ratio = "4 / 3",
  sizes,
  eager,
  children,
  className,
  control,
}: {
  picture: HomePicture | null;
  name: string;
  ratio?: string;
  sizes: string;
  eager?: boolean;
  children?: ReactNode;
  className?: string;
  control?: ReactNode;
}) {
  if (!picture) {
    return (
      <figure className={`zn-photo hx-nopic ${className ?? ""}`} data-strips={children ? true : undefined}>
        <div className="zn-photo-frame" aria-hidden="true">
          <span>{name.slice(0, 1)}</span>
        </div>
        {children && <div className="zn-photo-strips">{children}</div>}
      </figure>
    );
  }
  if (picture.kind === "concert") {
    const t = picture.cover.thumbnail;
    return (
      <PhotoFrame kind="youtube" src={t.src} srcSet={t.srcSet} width={t.width} height={t.height} sizes={sizes} alt={`Still from a ${name} gig`} eager={eager} className={className} control={control}>
        {children}
      </PhotoFrame>
    );
  }
  const p = picture.photo;
  return (
    <PhotoFrame kind="treated" src={p.src} alt={`${name}, photocopied`} ratio={ratio} sizes={sizes} eager={eager} credit={shortCredit(p)} creditHref={p.sourcePage} className={className} control={control}>
      {children}
    </PhotoFrame>
  );
}

/** One line under a wall that holds licensed photos: what was done to them (the licences ask for it). */
export function PhotoNote({ show }: { show: boolean }) {
  return show ? <p className="zn-label hx-photonote">Photos from Wikimedia Commons, photocopied by STAGEDIVE and shared under the same licences.</p> : null;
}

/** The rubber stamp and where the film comes from. Always both. */
export function Bootleg({ concert }: { concert: ConcertView }) {
  if (!concert.bootleg) return null;
  return (
    <span className="hx-boot">
      <span className="hm-card-bootleg" data-od="bootleg-label">
        {BOOTLEG_LABEL}
      </span>
      <span className="hx-boot-from">{bootlegCredit(concert.bootleg.from)}</span>
    </span>
  );
}

/** A gig as a small paste-up: the YouTube picture whole, the band on a strip, typed data. */
export function Gig({ concert, index, sizes, data, eager }: { concert: ConcertView; index: number; sizes: string; data?: string; eager?: boolean }) {
  const t = concert.thumbnail;
  return (
    <li className="hx-gig" style={tilt([-1, 0.8, -0.6, 1.1][index % 4])}>
      <PhotoFrame kind="youtube" src={t.src} srcSet={t.srcSet} width={t.width} height={t.height} sizes={sizes} alt={`Still from the video: ${concert.title}`} eager={eager} control={<PlayOnPicture concert={concert} />}>
        <PaperStrip tone="white" size="name" className="hm-card-name">
          <Link href={`/concerts/${concert.slug}`}>{concert.credits}</Link>
        </PaperStrip>
      </PhotoFrame>
      <p className="zn-data hx-gig-data">{data ?? [placeYear(concert), formatDuration(concert.durationSeconds)].filter(Boolean).join(" /// ")}</p>
      <Bootleg concert={concert} />
    </li>
  );
}

/** A chart line: number, band, where and when, how many watched it, and a play label with the length. */
export function ChartRow({ concert, rank, picture, note }: { concert: ConcertView; rank?: number; picture?: boolean; note?: ReactNode }) {
  const track = toTrack(concert);
  const t = concert.thumbnail;
  return (
    <li className="hx-row" data-pic={picture || undefined}>
      {rank !== undefined && (
        <span className="hx-row-rank" aria-hidden="true">
          {rank}
        </span>
      )}
      {picture && (
        <PlayLink track={track} className="hx-row-pic">
          {/* The picture opens the concert's page (the music playing goes on); nothing is drawn on it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} srcSet={t.srcSet} sizes="120px" width={t.width} height={t.height} alt="" loading="lazy" decoding="async" />
        </PlayLink>
      )}
      <span className="hx-row-text">
        <Link href={`/concerts/${concert.slug}`} className="hx-row-link">
          {rank !== undefined && <span className="od-sr">Number {rank}: </span>}
          <span className="hx-row-name">{concert.credits}</span>
          <span className="zn-data hx-row-data">{note ?? [placeYear(concert), viewsLine(concert)].filter(Boolean).join(" /// ")}</span>
        </Link>
        <Bootleg concert={concert} />
      </span>
      <PlayButton track={track} className="hm-row-play" visibleText={formatDuration(concert.durationSeconds)}>
        <PlayGlyph />
        <span>{formatDuration(concert.durationSeconds)}</span>
      </PlayButton>
    </li>
  );
}

/** Songs that fit on the cover's setlist sheet before it starts to scroll. */
const SETLIST_FITS = 14;

/** The gig of the week's setlist on a stapled sheet: every timed song is a button. */
export function SetlistSheet({ concert, setlist, title = "Setlist", tiltBy = 1, className }: { concert: ConcertView; setlist: SetlistView | null; title?: string; tiltBy?: number; className?: string }) {
  const track = toTrack(concert);
  const timed = (setlist?.tracks ?? []).flatMap((t) => (t.time === null ? [] : [{ title: t.title, seconds: t.time }]));
  const songs = setlist?.tracks.length ?? 0;
  // A long night (Springsteen plays 30): the sheet stays one screen tall and the list scrolls inside it.
  const long = songs > SETLIST_FITS;
  return (
    <Sheet as="aside" label={title} title={title} meta={songs ? `${songs} ${songs === 1 ? "song" : "songs"}` : undefined} level={3} tilt={tiltBy} fixings={<Staple at="top-right" />} className={`hm-setlist ${className ?? ""}`}>
      {timed.length > 0 ? (
        <>
          <div className="hm-setlist-roll" data-long={long || undefined}>
            <PlayableSetlist track={track} songs={timed} />
          </div>
          <p className="zn-marker hm-setlist-hint">{long ? `click any song = jump to it. all ${songs} are in there, scroll the sheet` : "click any song = jump straight to it"}</p>
        </>
      ) : setlist ? (
        <div className="hm-setlist-roll" data-long={long || undefined} tabIndex={long ? 0 : undefined} role={long ? "group" : undefined} aria-label={long ? `Setlist, ${songs} songs` : undefined}>
          <ol className="zn-setlist hm-setlist-plain">
            {setlist.tracks.map((t, i) => (
              <li key={`${i}-${t.title}`}>
                <span aria-hidden="true">{String(i + 1).padStart(2, "0")}.</span> {t.title}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="hm-setlist-empty">Still being typed up. Two fingers, one typewriter. The gig plays start to finish without it.</p>
      )}
    </Sheet>
  );
}

/** "242 GIGS /// 1992–2026" */
export function placeData(p: { concerts: number; years: { from: number; to: number } | null }) {
  const years = p.years ? (p.years.from === p.years.to ? String(p.years.from) : `${p.years.from}–${p.years.to}`) : null;
  return [`${n(p.concerts)} ${p.concerts === 1 ? "gig" : "gigs"}`, years].filter(Boolean).join(" /// ");
}

export const placeTown = (p: { city: string | null; country: string | null }) => [p.city, p.country].filter(Boolean).join(", ");

/** The shelves that have something on them, in the page's order. */
export function shelvesOf(data: HomepageData) {
  const { hd, fans, liveAlbums } = data.shelves;
  return {
    hd: hd.concerts.length ? hd : null,
    fans: fans.concerts.length ? fans : null,
    liveAlbums: liveAlbums.albums.length ? liveAlbums : null,
  };
}

/** Pictures already glued on the page (a licensed photo is used once): for the news list's `once`. */
export function usedPhotos(data: HomepageData, heroPhoto: { src: string } | null): string[] {
  const out: string[] = [];
  if (heroPhoto) out.push(heroPhoto.src);
  for (const x of [...data.legends, ...data.places]) if (x.picture && x.picture.kind !== "concert") out.push(x.picture.photo.src);
  return out;
}

/** The hero keeps the band's photo unless the legends wall shows the same one further down. */
export function heroPhotoOf(data: HomepageData) {
  const gig = data.hero.gig;
  if (!gig?.photo) return null;
  return data.legends.some((l) => l.picture?.kind === "band-photo" && l.picture.photo.src === gig.photo!.src) ? null : gig.photo;
}
