// --reconsider: look again at videos kept out as NOT_ROCK or UNCERTAIN (e.g. after the owner widened the
// genres on 20 Nov 2026, or approved an artist). A changed prompt means a new, paid answer, so the second
// look is limited to the sources that can be published (owner: no need to re-ask fan uploads).
import type { ChannelKindName } from "./rules";

/**
 * official (default): channels of data/channels.json, artist channels and other official channels.
 * archive: festival and broadcaster archives only (kind ARCHIVE). all: every video, fan uploads included.
 */
export type ReconsiderScope = "official" | "archive" | "all";

/** RECONSIDER_SCOPE: empty = official; anything unknown stops the run before it spends. */
export function reconsiderScope(value: string | undefined): ReconsiderScope {
  const s = (value ?? "").trim().toLowerCase();
  if (!s) return "official";
  if (s === "official" || s === "archive" || s === "all") return s;
  throw new Error(`unknown RECONSIDER_SCOPE "${value}" (known: official, archive, all)`);
}

/** Whether a kept-out video from a channel of this kind is looked at again. */
export function keepForReconsider(scope: ReconsiderScope, kind: ChannelKindName): boolean {
  if (scope === "all") return true;
  if (scope === "archive") return kind === "ARCHIVE";
  return kind !== "UNKNOWN";
}
