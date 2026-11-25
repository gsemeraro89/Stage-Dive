// "Pick up where you left off" (owner, 25 Nov 2026). A full page load (a reload, closing the tab, or
// the first click after a site update, which Next.js turns into a full load) ends the music. The
// player keeps a small record of what was playing in this browser (localStorage), and on the next
// page load it brings the bar back PAUSED at that second: one press of play continues. It never
// starts by itself (browsers block sound without a click; YouTube rule 5 on autoplay).
// Closing the player (X) deletes the record. Pure functions here; PlayerProvider does the wiring.

import type { Track } from "@/lib/player-types";

export const RESUME_KEY = "sd-player";
/** A record older than this is ignored and deleted. */
export const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** How often the record is refreshed while a concert plays (also on leaving the page). */
export const RESUME_SAVE_EVERY_MS = 10_000;
/** Queue and history kept in the record, at most. */
const KEEP = 30;

export interface ResumeRecord {
  v: 1;
  track: Track;
  /** Second the visitor had reached. */
  at: number;
  /** When the record was written (ms since epoch). */
  savedAt: number;
  /** What plays next, in order (the "Play next" choices included). */
  queue: Track[];
  /** Concerts played before, oldest first (the "Previous" button). */
  history: Track[];
  /** The visitor had collapsed the bar into the mini-player. */
  mini: boolean;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** Concert slugs: letters, digits, "-" and "_" (some end with part of the video id). Nothing that leaves /concerts/. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.youtubeId === "string" &&
    YOUTUBE_ID.test(t.youtubeId) &&
    typeof t.slug === "string" &&
    SLUG.test(t.slug) &&
    typeof t.title === "string" &&
    typeof t.credits === "string" &&
    typeof t.durationSeconds === "number" &&
    Number.isFinite(t.durationSeconds) &&
    t.durationSeconds >= 0 &&
    typeof t.thumbnail === "string"
  );
}

/** Only the fields the player needs, so nothing else that sits on a track object is stored. */
function pick(t: Track): Track {
  return { youtubeId: t.youtubeId, slug: t.slug, title: t.title, credits: t.credits, durationSeconds: t.durationSeconds, thumbnail: t.thumbnail };
}

function tracks(value: unknown, without: string): Track[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTrack).filter((t) => t.youtubeId !== without).slice(0, KEEP).map(pick);
}

/** The second to come back to: whole seconds, never below 0 nor past the end. */
export function resumeSecond(at: number, durationSeconds: number): number {
  if (!Number.isFinite(at) || at <= 0) return 0;
  const end = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.max(0, Math.floor(durationSeconds) - 1) : Infinity;
  return Math.min(Math.floor(at), end);
}

export function serializeResume(state: {
  track: Track;
  at: number;
  queue: Track[];
  history: Track[];
  mini: boolean;
  now: number;
}): string {
  const record: ResumeRecord = {
    v: 1,
    track: pick(state.track),
    at: resumeSecond(state.at, state.track.durationSeconds),
    savedAt: state.now,
    queue: tracks(state.queue, state.track.youtubeId),
    // The most recent ones: "Previous" goes back from the end.
    history: tracks(state.history.slice(-KEEP), state.track.youtubeId),
    mini: Boolean(state.mini),
  };
  return JSON.stringify(record);
}

/** Expired after RESUME_MAX_AGE_MS; a record from the future (clock changed) counts as expired too. */
export function isResumeFresh(savedAt: number, now: number): boolean {
  return Number.isFinite(savedAt) && savedAt <= now + 60_000 && now - savedAt < RESUME_MAX_AGE_MS;
}

/** The record, or null when there is none, it is unreadable, of another version, or too old. */
export function parseResume(raw: string | null | undefined, now: number): ResumeRecord | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  if (r.v !== 1 || !isTrack(r.track) || typeof r.savedAt !== "number" || !isResumeFresh(r.savedAt, now)) return null;
  const track = pick(r.track);
  return {
    v: 1,
    track,
    at: resumeSecond(typeof r.at === "number" ? r.at : 0, track.durationSeconds),
    savedAt: r.savedAt,
    queue: tracks(r.queue, track.youtubeId),
    history: tracks(r.history, track.youtubeId),
    mini: r.mini === true,
  };
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage, or null where it is switched off (private windows, blocked site data). */
export function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the record; an expired or broken one is deleted on the way. */
export function readResume(store: Store | null, now: number): ResumeRecord | null {
  if (!store) return null;
  try {
    const raw = store.getItem(RESUME_KEY);
    const record = parseResume(raw, now);
    if (raw && !record) store.removeItem(RESUME_KEY);
    return record;
  } catch {
    return null;
  }
}

export function writeResume(store: Store | null, value: string): void {
  try {
    store?.setItem(RESUME_KEY, value);
  } catch {
    // Full or switched off: nothing is remembered, nothing else changes.
  }
}

export function clearResume(store: Store | null): void {
  try {
    store?.removeItem(RESUME_KEY);
  } catch {
    // Nothing to do.
  }
}
