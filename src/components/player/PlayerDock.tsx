"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArtistLine, lineFromSuggestion } from "@/components/ui/ArtistLine";
import { CloseIcon, ExpandIcon, GripIcon, MinimiseIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "@/components/ui/Icons";
import { formatDuration } from "@/lib/format";
import { usePlayer } from "./PlayerProvider";
import { useMiniPlayer } from "./useMiniPlayer";

/**
 * The bottom bar ("deck bar"): what is playing, time, what is next, three controls and a close button.
 * While browsing other pages it also holds the video itself (356x200, or 200x200 on phones),
 * because YouTube does not allow a video to play hidden or smaller than 200x200.
 * "You might also like" opens the bar upward into a sheet of suggested artists: the sheet is part
 * of the bar and sits above the row with the video, so it never touches the video. On the page of
 * the concert that is playing (video in the page) the button scrolls to the page's own section instead.
 * "Mini player", the button touching the right edge of the video, collapses the bar into the mini-player: a small window with only the video and, above
 * it, a strip to drag it by, with "expand" and "close". It is this same <section>, restyled
 * (`data-mini`); the video is never taken out of the page, so the concert does not restart.
 * On the concert page of the concert that is playing the video is in the page and the bar is slim; there the
 * X hides the bar only and the concert keeps playing in the page (`barHidden`, kept here, not in the
 * player). The bar is back as soon as the video is no longer in the page: the visitor left, or the
 * next concert started. Everywhere else the X stops the music.
 * Sizes and layout are in src/styles/deck.css.
 */
export function PlayerDock() {
  const {
    current,
    queue,
    suggestions,
    hasPrevious,
    status,
    time,
    duration,
    inPage,
    resumed,
    minimised,
    setMinimised,
    toggle,
    next,
    previous,
    close,
    registerDock,
  } = usePlayer();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Only ever true while the video is in the page: the docked video must never sit in a hidden bar.
  const [barHidden, setBarHidden] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const hasMore = suggestions.length > 0;
  // No mini-player while the video is inside the concert page: there the bar is already slim.
  const { mini, windowRef, handle } = useMiniPlayer(Boolean(current) && !inPage, minimised);
  const sheetOpen = open && hasMore && !inPage && !mini && Boolean(current);
  const minimiseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  /** After minimise / expand the pressed button is gone: focus goes to its counterpart. */
  const focusNext = useRef(false);

  // The sheet closes when the visitor moves to another page.
  useEffect(() => setOpen(false), [path]);

  // The bar comes back when the video leaves the page (another page, or the next concert), and for a new concert.
  const currentId = current?.youtubeId;
  useEffect(() => setBarHidden(false), [inPage, currentId]);

  // Esc closes the sheet and returns to the button that opened it.
  useEffect(() => {
    if (!sheetOpen) return;
    sheetRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      moreRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    (mini ? expandRef : minimiseRef).current?.focus();
  }, [mini]);

  if (!current) return null;
  if (barHidden && inPage) return null;

  const switchTo = (minimised: boolean) => {
    focusNext.current = true;
    setOpen(false);
    setMinimised(minimised);
  };

  const total = duration || current.durationSeconds;
  const progress = total ? Math.min(100, (time / total) * 100) : 0;
  const upNext = queue[0];
  const playing = status === "playing" || status === "loading";

  return (
    <>
      {/* Keeps the end of the page from hiding behind the fixed bar. */}
      <div
        aria-hidden="true"
        className="od-dock-spacer"
        data-od="dock-spacer"
        data-in-page={inPage || undefined}
        data-more={hasMore || undefined}
        data-mini={mini || undefined}
      />
      <section
        ref={windowRef}
        aria-label="Player"
        className="od-dock"
        data-od="dock"
        data-status={status}
        // Brought back after a page load, paused at the second the visitor had reached, waiting for play.
        data-resumed={resumed || undefined}
        data-in-page={inPage || undefined}
        data-more={hasMore || undefined}
        data-sheet={sheetOpen || undefined}
        data-mini={mini || undefined}
      >
        {mini && (
          // The strip sits above the video, never on it. The window is dragged by the handle only.
          <div className="od-mini-strip" data-od="mini-strip">
            <button
              type="button"
              className="od-mini-handle"
              data-od="mini-handle"
              aria-label="Move player: drag, or use the arrow keys"
              {...handle}
            >
              <GripIcon />
              <span className="od-mini-label meta">{resumed ? "left off here" : "now playing"}</span>
              <span className="od-mini-credits meta">{current.credits}</span>
            </button>
            {resumed && (
              // Brought back paused: the one press that continues, on the strip, never on the video.
              <button
                type="button"
                className="od-mini-play"
                data-od="mini-play"
                aria-label="Play from where you left off"
                onClick={() => {
                  toggle();
                  expandRef.current?.focus();
                }}
              >
                <PlayIcon />
              </button>
            )}
            <button ref={expandRef} type="button" data-od="mini-expand" aria-label="Expand player" onClick={() => switchTo(false)}>
              <ExpandIcon />
            </button>
            <button type="button" data-od="mini-close" aria-label="Close player" onClick={close}>
              <CloseIcon />
            </button>
          </div>
        )}
        {sheetOpen && (
          <div ref={sheetRef} id="deck-sheet" className="od-sheet-more" data-od="deck-sheet" tabIndex={-1}>
            <div className="od-sheet-head">
              <h2 className="display">You might also like</h2>
              <span className="meta od-muted">({String(suggestions.length).padStart(2, "0")})</span>
              <button
                type="button"
                className="od-link"
                onClick={() => {
                  setOpen(false);
                  moreRef.current?.focus();
                }}
              >
                Close list
              </button>
            </div>
            <ol className="od-alines" aria-label="You might also like">
              {suggestions.map((artist) => (
                <li key={artist.slug}>
                  <ArtistLine artist={lineFromSuggestion(artist)} />
                </li>
              ))}
            </ol>
          </div>
        )}
        <div
          className="od-dock-progress"
          data-od="dock-progress"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="od-dock-row" data-od="dock-row">
          {!inPage && (
            // The player is placed exactly over this box. It must stay empty.
            <div ref={registerDock} className="od-dock-video" data-od="dock-video" />
          )}
          <div className="od-dock-info" data-od="dock-info">
            <div className="od-dock-head" data-od="dock-head">
              {!inPage && (
                // Touches the right edge of the video, so it reads as "this video, smaller". Beside it, never on it.
                <button ref={minimiseRef} type="button" className="od-dock-min" data-od="dock-min" onClick={() => switchTo(true)}>
                  <MinimiseIcon />
                  <span className="od-dock-min-text meta">Mini player</span>
                </button>
              )}
              <div className="od-dock-label meta" data-od="dock-label">
                {resumed ? (
                  // Two wordings of one line; CSS shows one (phones have room for the short one only).
                  <>
                    <span className="od-dock-left-long">pick up where you left off</span>
                    <span className="od-dock-left-short">left off here</span>
                  </>
                ) : (
                  "now playing"
                )}
              </div>
            </div>
            <Link href={`/concerts/${current.slug}`} className="od-dock-title title" data-od="dock-title">
              {current.title}
            </Link>
            <div className="od-dock-credits meta" data-od="dock-credits">
              {current.credits}
            </div>
          </div>
          <div className="od-dock-status" data-od="dock-status">
            <span className="od-dock-time meta" data-od="dock-time">
              {formatDuration(Math.floor(time))} / {formatDuration(Math.floor(total))}
            </span>
            {hasMore &&
              (inPage ? (
                // The video is in the page: go to the page's own "You might also like".
                <a href="#also-like" className="od-link od-dock-more" data-od="dock-more">
                  You might also like ({suggestions.length})
                </a>
              ) : (
                <button
                  ref={moreRef}
                  type="button"
                  className="od-link od-dock-more"
                  data-od="dock-more"
                  aria-expanded={sheetOpen}
                  aria-controls="deck-sheet"
                  aria-label={`You might also like (${suggestions.length})`}
                  onClick={() => setOpen((v) => !v)}
                >
                  <span className="od-dock-more-long">You might also like</span>
                  <span className="od-dock-more-short">Also like</span>
                  <span>({suggestions.length})</span>
                </button>
              ))}
          </div>
          {upNext && (
            <span className="od-dock-next meta" data-od="dock-next">
              Next: <Link href={`/concerts/${upNext.slug}`} className="title">{upNext.title}</Link>
            </span>
          )}
          <div className="od-dock-controls" data-od="dock-controls">
            <button type="button" aria-label="Previous concert" onClick={previous} disabled={!hasPrevious}>
              <PreviousIcon />
              <span className="od-sr">Previous</span>
            </button>
            <button type="button" className="od-dock-toggle" aria-label={playing ? "Pause" : resumed ? "Play from where you left off" : "Play"} onClick={toggle}>
              {playing ? <PauseIcon /> : <PlayIcon />}
              <span className="od-sr">{playing ? "Pause" : "Play"}</span>
            </button>
            <button type="button" aria-label="Next concert" onClick={next} disabled={!upNext}>
              <NextIcon />
              <span className="od-sr">Next</span>
            </button>
            {/* Closing stops the music: YouTube does not allow playing with the video hidden. */}
            {inPage ? (
              // In the page the video is on show, so the X only puts the bar away; the concert plays on.
              <button type="button" className="od-dock-close" data-od="dock-hide" aria-label="Hide bar" onClick={() => setBarHidden(true)}>
                <CloseIcon />
                <span className="od-sr">Hide bar</span>
              </button>
            ) : (
              <button type="button" className="od-dock-close" data-od="dock-close" aria-label="Close player" onClick={close}>
                <CloseIcon />
                <span className="od-sr">Close</span>
              </button>
            )}
          </div>
          {status === "error" && (
            <p role="alert" className="od-dock-error meta" data-od="dock-error">
              This concert cannot be played right now.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
