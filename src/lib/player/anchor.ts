// Where the fixed player frame is pinned. The full bar sits on the bottom of the screen (bottom: 0):
// on phones the browser's address bar hides and shows while scrolling, which moves the bar at once.
// Pinning the frame by its distance from the bar's bottom makes the browser move both together,
// with no JavaScript in between. The mini-player window is placed from the top, so the frame is too.

export interface FixedAnchor {
  top: string;
  bottom: string;
  left: string;
}

export function fixedAnchor(box: DOMRect, bar: DOMRect | null, mini: boolean): FixedAnchor {
  if (mini || !bar) return { top: `${box.top}px`, bottom: "auto", left: `${box.left}px` };
  return { top: "auto", bottom: `${Math.max(0, Math.round(bar.bottom - box.bottom))}px`, left: `${box.left}px` };
}
