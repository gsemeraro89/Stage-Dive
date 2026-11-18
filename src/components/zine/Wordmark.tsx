import { useId } from "react";
import { STAMP, STAMP_FLAT, WORDMARK_FLAT, WORDMARK_FULL, WORDMARK_ON_TONER } from "./brand-art";
import { cx } from "./tilt";

const WORDMARKS = {
  /** Nine cut-outs with their shadows and two pieces of tape. On paper or a clean sheet. Min 160px wide. */
  full: { art: WORDMARK_FULL, viewBox: "0 0 892 210", ratio: 892 / 210, min: 160 },
  /** Small sizes: flat, half tilt, no tape, no shadows. Min 90px wide. */
  flat: { art: WORDMARK_FLAT, viewBox: "0 0 928 210", ratio: 928 / 210, min: 90 },
  /** The full wordmark on toner black: paper keylines instead of shadows. Min 160px wide. */
  "on-toner": { art: WORDMARK_ON_TONER, viewBox: "0 0 892 210", ratio: 892 / 210, min: 160 },
} as const;

type WordmarkProps = {
  variant?: keyof typeof WORDMARKS;
  /** Width in px. Never drawn narrower than the minimum of the variant: under 60px use <SdStamp />. */
  width?: number;
  /** Read by screen readers. Pass "" when a parent link already names the destination. */
  label?: string;
  className?: string;
};

/**
 * The STAGEDIVE wordmark, drawn letter by letter on brand board 01. It is never typed in a font.
 * Keep one letter-width of bare paper around it; only tape may cross that line. Never on a photo.
 */
export function Wordmark({ variant = "full", width = 320, label = "STAGEDIVE", className }: WordmarkProps) {
  const mark = WORDMARKS[variant];
  const id = `sd-news-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const w = Math.max(mark.min, width);
  return (
    <svg
      className={cx("zn-wordmark", className)}
      data-variant={variant}
      viewBox={mark.viewBox}
      width={w}
      height={Math.round(w / mark.ratio)}
      style={{ display: "block", maxWidth: "100%", height: "auto", minWidth: mark.min }}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: mark.art.replaceAll("__ID__", id) }}
    />
  );
}

type SdStampProps = {
  /** Width and height in px. */
  size?: number;
  /** Flat: no shadows, for the smallest sizes. */
  flat?: boolean;
  label?: string;
  className?: string;
};

/** The SD symbol: takes over from the wordmark under 60px wide, and is the parent of the favicon. */
export function SdStamp({ size = 64, flat = false, label = "STAGEDIVE", className }: SdStampProps) {
  return (
    <svg
      className={cx("zn-sdstamp", className)}
      viewBox="0 0 220 220"
      width={size}
      height={size}
      style={{ display: "block", flex: "none" }}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: flat ? STAMP_FLAT : STAMP }}
    />
  );
}
