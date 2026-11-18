// A list of gigs as rows (board 06, "4 full gigs"): the YouTube picture (whole, a play button), a big
// year or rank, the name, typed data, and the length on a play label. Styles: src/styles/pages.css.
import Link from "next/link";
import { PlayButton } from "@/components/player/PlayButton";
import { PlayGlyph } from "@/components/zine";
import { formatDuration } from "@/lib/format";
import { toTrack } from "@/lib/player-types";
import type { ConcertView } from "@/lib/queries";
import { compactNumber } from "@/lib/site";
import { kindWord, placeYear, playedOn } from "./words";

type Props = {
  concerts: ConcertView[];
  /** Names the list for screen readers. */
  label: string;
  /** The big figure in front of each row: the year it was played, or its place in the list. */
  lead?: "year" | "rank" | "none";
  /** "band": the row is named after who played. "place": after where (on a band's own page). */
  name?: "band" | "place";
  /** Smaller rows for a side column. */
  compact?: boolean;
};

function rowData(c: ConcertView, name: "band" | "place", lead: Props["lead"]): string {
  const views = c.viewCount > 0 ? `${compactNumber(c.viewCount)} views on YouTube` : null;
  if (name === "place") {
    const day = lead === "year" ? (c.performedOn ? playedOn(c) : null) : playedOn(c);
    return [day, c.tour?.name, kindWord(c.venueKind), views].filter(Boolean).join(" /// ");
  }
  const where = lead === "year" ? [c.venue?.name, c.city].filter(Boolean).join(", ") : placeYear(c);
  return [where, views].filter(Boolean).join(" /// ");
}

export function GigRows({ concerts, label, lead = "none", name = "band", compact }: Props) {
  return (
    <>
      <ol className="pg-rows" aria-label={label} data-compact={compact || undefined} data-od="concert-list">
        {concerts.map((c, i) => {
          const track = toTrack(c);
          const t = c.thumbnail;
          const title = name === "band" ? c.credits : [c.venue?.name, c.city].filter(Boolean).join(", ") || c.title;
          return (
            <li key={c.id} className="pg-row" data-od="concert-tile">
              {/* The picture is a play button; nothing is drawn on it. */}
              <PlayButton track={track} className="pg-row-pic">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.src} srcSet={t.srcSet} sizes="150px" width={t.width} height={t.height} alt="" loading="lazy" decoding="async" />
              </PlayButton>
              {lead !== "none" && (
                <span className="pg-row-lead" aria-hidden={lead === "rank" || undefined}>
                  {lead === "year" ? (c.performedYear ?? "?") : i + 1}
                </span>
              )}
              <Link href={`/concerts/${c.slug}`} className="pg-row-text">
                <span className="pg-row-name">{title}</span>
                <span className="zn-data pg-row-data">{rowData(c, name, lead)}</span>
              </Link>
              <PlayButton track={track} className="pg-row-play">
                <PlayGlyph />
                <span>{formatDuration(c.durationSeconds)}</span>
              </PlayButton>
            </li>
          );
        })}
      </ol>
      <p className="zn-label pg-rows-credit">Pictures: YouTube</p>
    </>
  );
}
