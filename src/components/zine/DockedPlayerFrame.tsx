import type { ReactNode } from "react";
import { cx } from "./tilt";

type DockedPlayerFrameProps = {
  /** Band or gig name, in Archivo Black. */
  title: ReactNode;
  /** The handwritten pink tag. */
  nowLabel?: string;
  /** Typed line on the right: "SONG 04 /// KNOW YOUR ENEMY". */
  meta?: ReactNode;
  /** "0:21:10 / 1:17:45": sits on pink. */
  time?: string;
  /** 0 to 100. */
  progress?: number;
  /**
   * The box that holds the video (356x200, or 200x200 on phones: the YouTube minimum).
   * Whatever goes in here must never be covered: no label, icon or shade on the video.
   */
  video?: ReactNode;
  /** The controls: <IconButton tone="on-toner" />, the pause one with `live`. */
  children?: ReactNode;
  /** Pin it to the bottom of the window. Off by default: this is only the visual shell. */
  fixed?: boolean;
  /** Slide up into place (220ms) after the "On now" stamp. */
  docking?: boolean;
  className?: string;
};

/**
 * The docked player bar: toner black, a 5px pink rule, an 8px progress line. The only thing in the
 * zine that sits dead straight: never tilt it, never put tape on it.
 * Visual shell only. The working bar is src/components/player/PlayerDock.tsx, which is styled to
 * match through its data-od attributes (section 9b of src/styles/zine.css).
 */
export function DockedPlayerFrame({
  title,
  nowLabel = "now playing",
  meta,
  time,
  progress = 0,
  video,
  children,
  fixed,
  docking,
  className,
}: DockedPlayerFrameProps) {
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <section
      className={cx("zn-dock", className)}
      aria-label="Player"
      data-fixed={fixed || undefined}
      data-docking={docking || undefined}
      data-video={video ? true : undefined}
    >
      <div className="zn-dock-progress" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div style={{ width: `${value}%` }} />
      </div>
      <div className="zn-dock-row">
        {video && <div className="zn-dock-video">{video}</div>}
        <div className="zn-dock-info">
          <span className="zn-dock-now">{nowLabel}</span>
          <span className="zn-dock-title">{title}</span>
        </div>
        {(meta || time) && (
          <div className="zn-dock-meta">
            {meta}
            {meta && time && <br />}
            {time && <span className="zn-dock-time">{time}</span>}
          </div>
        )}
        {children && <div className="zn-dock-controls">{children}</div>}
      </div>
    </section>
  );
}
