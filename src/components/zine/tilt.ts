import type { CSSProperties } from "react";

/** Tilt in degrees. Cut-outs take 1 to 4 either way and alternate with their neighbours;
 *  anything you type into or press twice takes 0. Values beyond 4 are pulled back to 4. */
export type Tilt = number;

const MAX_TILT = 4;

/** Inline style carrying the tilt (and any other custom properties) to the CSS in src/styles/zine.css. */
export function tiltStyle(
  tilt: Tilt | undefined,
  extra?: Record<string, string | number | undefined>,
  max: number = MAX_TILT,
): CSSProperties | undefined {
  const style: Record<string, string | number> = {};
  if (tilt !== undefined) style["--tilt"] = `${Math.max(-max, Math.min(max, tilt))}deg`;
  for (const [key, value] of Object.entries(extra ?? {})) if (value !== undefined) style[key] = value;
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

/** Join class names, skipping empty ones. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
