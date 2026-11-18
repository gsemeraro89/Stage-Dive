import { tiltStyle } from "./tilt";

type TapeProps = {
  /** Where it crosses the top edge of its parent (which must be position: relative). */
  at?: "top-left" | "top-right" | "top-center";
  /** Degrees. Tape is allowed a little more swing than paper: up to 6. */
  tilt?: number;
  /** Width in px (118 on the boards, 96 for small things). */
  width?: number;
};

/** Masking tape. Decoration only: it always bridges two things and never carries words. */
export function Tape({ at = "top-left", tilt = -5, width }: TapeProps) {
  return (
    <span
      className="zn-tape"
      data-at={at}
      aria-hidden="true"
      style={tiltStyle(tilt, { "--tape-w": width ? `${width}px` : undefined }, 6)}
    />
  );
}

type StapleProps = {
  at?: "top-left" | "top-right";
  /** Degrees. A staple goes in however it goes in: up to 15. */
  tilt?: number;
};

/** A staple: it says "these sheets are stacked". Decoration only. */
export function Staple({ at = "top-right", tilt = 12 }: StapleProps) {
  return <span className="zn-staple" data-at={at} aria-hidden="true" style={tiltStyle(tilt, undefined, 15)} />;
}
