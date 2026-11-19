"use client";

import Link from "next/link";
import { useState } from "react";
import { cx } from "./tilt";

export type SetlistSong = {
  title: string;
  /** Where the song starts in the video, in seconds. */
  seconds: number;
  /** The song's own page (every live version), when it has one: a link beside the button. */
  href?: string;
};

type TypewriterSetlistProps = {
  songs: SetlistSong[];
  /** Called with the start time of the song that was clicked. Wire it to the player. */
  onSelect?: (seconds: number, index: number) => void;
  /**
   * The song on now (0-based), or null when nothing is playing. Songs before it are struck out.
   * Leave it out and the list keeps track by itself, starting from `defaultCurrentIndex`.
   */
  currentIndex?: number | null;
  defaultCurrentIndex?: number | null;
  /** Names the list for screen readers. */
  label?: string;
  className?: string;
};

/** 3725 -> "1:02:05", 185 -> "3:05". */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

/**
 * The typewritten setlist. Every song is a real button that jumps to its time. Songs already played
 * are struck through with a marker (350ms, five jerky steps); the song on now sits on pink.
 * Put it inside a <Sheet title="Setlist">.
 */
export function TypewriterSetlist({
  songs,
  onSelect,
  currentIndex,
  defaultCurrentIndex = null,
  label = "Setlist",
  className,
}: TypewriterSetlistProps) {
  const [own, setOwn] = useState<number | null>(defaultCurrentIndex);
  const controlled = currentIndex !== undefined;
  const current = controlled ? currentIndex : own;

  if (!songs.length) {
    return <p className="zn-setlist-empty">No setlist yet. Somebody forgot to write it down.</p>;
  }

  return (
    <ol className={cx("zn-setlist", className)} aria-label={label}>
      {songs.map((song, i) => {
        const played = current !== null && i < current;
        const now = current === i;
        return (
          <li key={`${i}-${song.seconds}`}>
            <button
              type="button"
              className="zn-setlist-song"
              aria-current={now ? "true" : undefined}
              data-state={now ? "now" : played ? "played" : "ahead"}
              onClick={() => {
                if (!controlled) setOwn(i);
                onSelect?.(song.seconds, i);
              }}
            >
              <span className="zn-setlist-n" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}.
              </span>
              <span className="zn-setlist-title">{song.title}</span>
              {now && <span className="zn-setlist-now">on now</span>}
              {played && <span className="od-sr">, played</span>}
              <span className="zn-setlist-time">
                <span className="od-sr">, starts at </span>
                {clock(song.seconds)}
              </span>
              {played && <i className="zn-strike" aria-hidden="true" />}
            </button>
            {song.href && (
              // Unstyled for now (designer): the song's page, beside the button that plays it.
              <Link href={song.href} className="zn-setlist-page" data-od="song-page-link" aria-label={`${song.title}: every live version`}>
                every version
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
