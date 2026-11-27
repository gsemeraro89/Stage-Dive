// A list of gigs as rows (board 06, "4 full gigs"): the YouTube picture (whole, a play button), a big
// year or rank, the name, typed data, and the length on a play label. Styles: src/styles/pages.css.
import Link from "next/link";
import { PlayButton } from "@/components/player/PlayButton";
import { PlayLink } from "@/components/player/PlayLink";
import { PlayGlyph } from "@/components/zine";
import { formatDuration } from "@/lib/format";
import { toTrack } from "@/lib/player-types";
import type { ConcertView } from "@/lib/queries";
import { compactNumber } from "@/lib/site";
import { BOOTLEG_LABEL, bootlegCredit } from "@/lib/bootlegs";
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

/** The typed facts, and the view count apart from them (phones leave the count out to keep one line). */
function rowData(c: ConcertView, name: "band" | "place", lead: Props["lead"]): { facts: string; views: string | null } {
  const views = c.viewCount > 0 ? `${compactNumber(c.viewCount)} views on YouTube` : null;
  if (name === "place") {
    const day = lead === "year" ? (c.performedOn ? playedOn(c) : null) : playedOn(c);
    return { facts: [day, c.tour?.name, kindWord(c.venueKind)].filter(Boolean).join(" /// "), views };
  }
  const where = lead === "year" ? [c.venue?.name, c.city].filter(Boolean).join(", ") : placeYear(c);
  return { facts: where, views };
}

/** YouTube's own 16:9 file of the video (320x180, always there): the picture alone, no bars baked in. */
const wideThumb = (youtubeId: string) => `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;

export function GigRows({ concerts, label, lead = "none", name = "band", compact }: Props) {
  return (
    <>
      <ol className="pg-rows" aria-label={label} data-compact={compact || undefined} data-od="concert-list">
        {concerts.map((c, i) => {
          const track = toTrack(c);
          const title = name === "band" ? c.credits : [c.venue?.name, c.city].filter(Boolean).join(", ") || c.title;
          const { facts, views } = rowData(c, name, lead);
          const line = [facts, views].filter(Boolean).join(" /// ");
          return (
            <li key={c.id} className="pg-row" data-od="concert-tile">
              {/* The picture opens the concert's page (the music playing goes on); nothing is drawn on it. */}
              <PlayLink track={track} className="pg-row-pic">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wideThumb(c.youtubeId)} width={320} height={180} alt="" loading="lazy" decoding="async" />
              </PlayLink>
              {lead !== "none" && (
                <span className="pg-row-lead" aria-hidden={lead === "rank" || undefined}>
                  {lead === "year" ? (c.performedYear ?? "?") : i + 1}
                </span>
              )}
              {/* Name and facts are kept to one line each and cut with "…"; the full text stays in the
                  link (screen readers read all of it) and in its title (shown on hover). */}
              <Link href={`/concerts/${c.slug}`} className="pg-row-text" title={`${title}${c.bootleg ? ` (${BOOTLEG_LABEL.toLowerCase()})` : ""} /// ${line}`}>
                <span className="pg-row-name">{title}</span>
                {/* Unstyled for now (designer): a bootleg is always marked (owner, 20 Nov 2026). */}
                {c.bootleg && (
                  <span className="pg-row-bootleg" data-od="bootleg-label" title={bootlegCredit(c.bootleg.from)}>
                    {BOOTLEG_LABEL}
                  </span>
                )}
                <span className="zn-data pg-row-data">
                  {facts}
                  {views && (
                    <span className="pg-row-views">
                      {facts ? " /// " : ""}
                      {views}
                    </span>
                  )}
                </span>
              </Link>
              <PlayButton track={track} className="pg-row-play" visibleText={formatDuration(c.durationSeconds)}>
                <PlayGlyph />
                <span>{formatDuration(c.durationSeconds)}</span>
              </PlayButton>
            </li>
          );
        })}
      </ol>
    </>
  );
}
