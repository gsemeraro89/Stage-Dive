// What the site's one YouTube player does on each pass of PlayerProvider's placement effect.
//
// The player is shown either in the concert page's player area (the "slot") or in the bottom bar
// (the "dock"). When the visitor leaves the page of the concert that is playing, the slot goes away
// before the bar's video box exists: for one render there is no place for the player. Hiding it then
// (display: none) would take a playing video out of sight, which YouTube does not allow and which can
// stop it (the player's own viewport drops to 0x0). So while a concert is current the player stays
// where it was until its new place arrives, a moment later in the same commit.

export type FramePlacement = "hide" | "keep" | "place";

/**
 * @param playing true while a concert is current (playing, paused or loading)
 * @param hasTarget true when the slot or the dock's video box is there to put the player over
 */
export function framePlacement(playing: boolean, hasTarget: boolean): FramePlacement {
  if (!playing) return "hide"; // closed or nothing started: nothing to show
  return hasTarget ? "place" : "keep";
}
