// Picks one setlist for a concert from the video description and its most relevant comments.
// Order (owner, 13 Nov 2026): the description first; then a comment by the uploading channel itself
// (usually the pinned one); then the most liked comment; on equal likes, the most complete list.

import { parseSetlist, type Track } from "./parse";

export interface CommentText {
  text: string;
  likeCount: number;
  /** True when the comment was written by the channel that uploaded the video. */
  byChannel: boolean;
}

export type SetlistSource = "DESCRIPTION" | "CHANNEL_COMMENT" | "COMMENT";

export interface ChosenSetlist {
  tracks: Track[];
  timed: boolean;
  source: SetlistSource;
}

export interface Choice {
  chosen: ChosenSetlist | null;
  /** Texts that look like a setlist but could not be read; candidates for Claude. */
  unclear: { source: SetlistSource; text: string; reason: string }[];
}

export function fromDescription(description: string, durationSeconds?: number): Choice {
  const result = parseSetlist(description, durationSeconds);
  if (result.kind === "setlist") {
    return { chosen: { tracks: result.tracks, timed: result.timed, source: "DESCRIPTION" }, unclear: [] };
  }
  if (result.kind === "unclear") {
    return { chosen: null, unclear: [{ source: "DESCRIPTION", text: description, reason: result.reason }] };
  }
  return { chosen: null, unclear: [] };
}

export function fromComments(comments: CommentText[], durationSeconds?: number): Choice {
  const found: (ChosenSetlist & { likes: number })[] = [];
  const unclear: Choice["unclear"] = [];
  for (const comment of comments) {
    const source: SetlistSource = comment.byChannel ? "CHANNEL_COMMENT" : "COMMENT";
    const result = parseSetlist(comment.text, durationSeconds);
    if (result.kind === "setlist") {
      found.push({ tracks: result.tracks, timed: result.timed, source, likes: comment.likeCount });
    } else if (result.kind === "unclear") {
      unclear.push({ source, text: comment.text, reason: result.reason });
    }
  }
  found.sort(
    (a, b) =>
      Number(b.source === "CHANNEL_COMMENT") - Number(a.source === "CHANNEL_COMMENT") ||
      b.likes - a.likes ||
      b.tracks.length - a.tracks.length,
  );
  const best = found[0];
  return { chosen: best ? { tracks: best.tracks, timed: best.timed, source: best.source } : null, unclear };
}
