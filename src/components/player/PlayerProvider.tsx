"use client";

// The one YouTube player of the site. It lives in the root layout, so it keeps playing while
// the visitor moves between pages. The same player is shown either inside the concert page
// (when that page's concert is the one playing) or docked in the bottom bar.
//
// YouTube rules followed here (CLAUDE.md): one player per page, never hidden while playing,
// never smaller than 200x200, nothing drawn on top of it, `origin` concert, playback starts
// from a click, and auto-advance only happens in this always-visible player.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fixedAnchor } from "@/lib/player/anchor";
import { DOCK_PLAYER, type RecommendedArtist, type Track } from "@/lib/player-types";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

interface PlayerState {
  current: Track | null;
  queue: Track[];
  /** "You might also like" for what is playing: similar artists, each with a concert to play. */
  suggestions: RecommendedArtist[];
  hasPrevious: boolean;
  status: PlayerStatus;
  /** Seconds played and total, updated about once a second. */
  time: number;
  duration: number;
  /** True when the player is shown inside the page rather than in the bottom bar. */
  inPage: boolean;
}

interface PlayerActions {
  play: (track: Track) => void;
  /** Play a concert from a given second (tracklist times). Starts the concert first if another one is playing. */
  playFrom: (track: Track, seconds: number) => void;
  /** Put a concert first in the queue without stopping the current one (plays now if nothing is playing). */
  playNext: (track: Track) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  /** Stop playback and close the player (bar and video disappear until the next play). */
  close: () => void;
  /** A concert page offers its player area; the player moves there if that concert is playing. */
  registerSlot: (youtubeId: string, element: HTMLElement | null) => void;
  /** The bottom bar offers the place where the docked video sits. */
  registerDock: (element: HTMLElement | null) => void;
}

const PlayerContext = createContext<(PlayerState & PlayerActions) | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

// Minimal typing of the parts of the YouTube IFrame API used here.
interface YTPlayer {
  loadVideoById(id: string, startSeconds?: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
}
interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const;

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  apiPromise ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("Could not load the YouTube player"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [suggestions, setSuggestions] = useState<RecommendedArtist[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [slot, setSlot] = useState<{ youtubeId: string; element: HTMLElement } | null>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const creatingRef = useRef(false);
  // Latest values for use inside YouTube's callbacks, which are created only once.
  const currentRef = useRef<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  const historyRef = useRef<Track[]>([]);
  const advanceRef = useRef<() => void>(() => {});
  /** Where the concert being started should begin (a tracklist time), 0 for the start. */
  const startAtRef = useRef(0);

  const start = useCallback((track: Track, at = 0) => {
    startAtRef.current = at;
    currentRef.current = track;
    setCurrent(track);
    setTime(0);
    setDuration(track.durationSeconds);
    setStatus("loading");

    // Fetch what plays next. Ignore the answer if the visitor has already moved on.
    setQueue([]);
    queueRef.current = [];
    fetch(`/api/queue/${track.youtubeId}`)
      .then((res) => (res.ok ? res.json() : { queue: [] }))
      .then((data: { queue: Track[] }) => {
        if (currentRef.current?.youtubeId !== track.youtubeId) return;
        queueRef.current = data.queue;
        setQueue(data.queue);
      })
      .catch(() => {});
    setSuggestions([]);
    fetch(`/api/recommendations/${track.youtubeId}`)
      .then((res) => (res.ok ? res.json() : { artists: [] }))
      .then((data: { artists: RecommendedArtist[] }) => {
        if (currentRef.current?.youtubeId !== track.youtubeId) return;
        setSuggestions(data.artists);
      })
      .catch(() => {});

    if (playerRef.current) {
      playerRef.current.loadVideoById(track.youtubeId, at);
      return;
    }
    if (creatingRef.current) return; // being created; it will load currentRef when ready
    creatingRef.current = true;
    loadYouTubeApi()
      .then((YT) => {
        const host = hostRef.current;
        if (!host) return;
        const first = currentRef.current ?? track;
        const player = new YT.Player(host, {
          width: "100%",
          height: "100%",
          videoId: first.youtubeId,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: window.location.origin, start: Math.floor(startAtRef.current) },
          events: {
            onReady: () => {
              playerRef.current = player;
              // The visitor may have picked another concert while the player was loading.
              const wanted = currentRef.current;
              if (wanted && wanted.youtubeId !== first.youtubeId) player.loadVideoById(wanted.youtubeId, startAtRef.current);
              else {
                // A tracklist time clicked while the player was loading: start there.
                if (startAtRef.current) player.seekTo(startAtRef.current, true);
                player.playVideo();
              }
            },
            onStateChange: ({ data }) => {
              if (!currentRef.current) return; // closed by the visitor
              if (data === YT_STATE.PLAYING) setStatus("playing");
              else if (data === YT_STATE.PAUSED) setStatus("paused");
              else if (data === YT_STATE.BUFFERING) setStatus("loading");
              else if (data === YT_STATE.ENDED) advanceRef.current();
            },
            // The video cannot be played here (removed, private, embedding switched off): move on.
            onError: () => {
              if (queueRef.current.length) advanceRef.current();
              else setStatus("error");
            },
          },
        });
      })
      .catch(() => {
        creatingRef.current = false;
        setStatus("error");
      });
  }, []);

  const remember = useCallback((track: Track) => {
    historyRef.current = [...historyRef.current.slice(-49), track];
    setHistory(historyRef.current);
  }, []);

  const play = useCallback(
    (track: Track) => {
      const playing = currentRef.current;
      if (playing?.youtubeId === track.youtubeId) {
        playerRef.current?.playVideo();
        return;
      }
      if (playing) remember(playing);
      start(track);
    },
    [start, remember],
  );

  const playFrom = useCallback(
    (track: Track, seconds: number) => {
      const playing = currentRef.current;
      if (playing?.youtubeId === track.youtubeId) {
        const player = playerRef.current;
        if (player) {
          player.seekTo(seconds, true);
          player.playVideo();
        } else {
          startAtRef.current = seconds; // still being created: it starts there
        }
        return;
      }
      if (playing) remember(playing);
      start(track, seconds);
    },
    [start, remember],
  );

  const playNext = useCallback(
    (track: Track) => {
      if (!currentRef.current) {
        start(track);
        return;
      }
      if (currentRef.current.youtubeId === track.youtubeId) return;
      queueRef.current = [track, ...queueRef.current.filter((t) => t.youtubeId !== track.youtubeId)];
      setQueue(queueRef.current);
    },
    [start],
  );

  const next = useCallback(() => {
    if (!currentRef.current) return; // closed: nothing advances
    const [upNext] = queueRef.current;
    if (!upNext) {
      setStatus("paused");
      return;
    }
    const playing = currentRef.current;
    if (playing) remember(playing);
    start(upNext);
  }, [start, remember]);

  const previous = useCallback(() => {
    const last = historyRef.current[historyRef.current.length - 1];
    if (!last) return;
    historyRef.current = historyRef.current.slice(0, -1);
    setHistory(historyRef.current);
    start(last);
  }, [start]);

  const close = useCallback(() => {
    // Stop, never just hide: YouTube does not allow a video to keep playing out of sight.
    playerRef.current?.stopVideo();
    currentRef.current = null;
    queueRef.current = [];
    historyRef.current = [];
    setCurrent(null);
    setQueue([]);
    setSuggestions([]);
    setHistory([]);
    setStatus("idle");
    setTime(0);
    setDuration(0);
  }, []);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === YT_STATE.PLAYING) player.pauseVideo();
    else player.playVideo();
  }, []);

  useEffect(() => {
    advanceRef.current = next;
  }, [next]);

  // Clock for the bottom bar.
  useEffect(() => {
    if (!current) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setTime(player.getCurrentTime() || 0);
      const d = player.getDuration();
      if (d) setDuration(d);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [current]);

  const registerSlot = useCallback((youtubeId: string, element: HTMLElement | null) => {
    setSlot((prev) => {
      if (element) return { youtubeId, element };
      return prev?.youtubeId === youtubeId ? null : prev;
    });
  }, []);
  const registerDock = useCallback((element: HTMLElement | null) => setDock(element), []);

  const inPage = Boolean(current && slot && slot.youtubeId === current.youtubeId);
  const target = inPage ? slot!.element : dock;

  // Keep the player exactly over its target: the concert page's player area, or the bottom bar.
  // The iframe itself is never moved in the page (that would restart the video).
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (!current || !target) {
      frame.style.display = "none";
      return;
    }
    let raf = 0;
    const place = () => {
      const rect = target.getBoundingClientRect();
      frame.style.display = "block";
      frame.style.width = `${rect.width}px`;
      frame.style.height = `${rect.height}px`;
      // In the page the player scrolls under the bottom bar like any other content;
      // docked, it sits in the bar.
      frame.style.zIndex = inPage ? "1" : "41";
      if (inPage) {
        // Scrolls with the page.
        frame.style.position = "absolute";
        frame.style.bottom = "auto";
        frame.style.top = `${rect.top + window.scrollY}px`;
        frame.style.left = `${rect.left + window.scrollX}px`;
      } else {
        // Stays with the fixed bottom bar, pinned the same way the bar is (see lib/player/anchor).
        const dockEl = target.closest<HTMLElement>('[data-od="dock"]');
        const a = fixedAnchor(rect, dockEl?.getBoundingClientRect() ?? null, Boolean(dockEl?.hasAttribute("data-mini")));
        frame.style.position = "fixed";
        frame.style.top = a.top;
        frame.style.bottom = a.bottom;
        frame.style.left = a.left;
      }
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    place();
    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    observer.observe(document.body);
    // The bottom bar grows and shrinks as its text wraps, which moves the video box inside it.
    const bar = target.closest('[data-od="dock"]');
    if (bar) observer.observe(bar);
    window.addEventListener("resize", schedule);
    // Safety net for layout changes no observer reports (fonts loading, late images).
    const timer = window.setInterval(place, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
    // queue and status are listed because the bar's text changes with them.
  }, [current, target, inPage, queue, status]);

  const value = useMemo(
    () => ({
      current,
      queue,
      suggestions,
      hasPrevious: history.length > 0,
      status,
      time,
      duration,
      inPage,
      play,
      playFrom,
      playNext,
      toggle,
      next,
      previous,
      close,
      registerSlot,
      registerDock,
    }),
    [current, queue, suggestions, history.length, status, time, duration, inPage, play, playFrom, playNext, toggle, next, previous, close, registerSlot, registerDock],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* The player. Positioned by the effect above; nothing is ever placed on top of it. */}
      <div
        ref={frameRef}
        data-od="player-frame"
        style={{ display: "none", minWidth: DOCK_PLAYER.height, minHeight: DOCK_PLAYER.height }}
      >
        <div ref={hostRef} />
      </div>
    </PlayerContext.Provider>
  );
}
