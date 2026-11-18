// Player control icons: plain filled SVG, the only icons the design allows (DESIGN.md section 2).
type Props = { size?: number };

export function PlayIcon({ size = 14 }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 14 14">
      <path d="M2 1v12l11-6z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon({ size = 14 }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 14 14">
      <path d="M2 1h4v12H2zM8 1h4v12H8z" fill="currentColor" />
    </svg>
  );
}

export function PreviousIcon({ size = 14 }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 14 14">
      <path d="M1 1h2.5v12H1zM13 1v12L4.5 7z" fill="currentColor" />
    </svg>
  );
}

export function NextIcon({ size = 14 }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 14 14">
      <path d="M10.5 1H13v12h-2.5zM1 1v12l8.5-6z" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 14 14">
      <path d="M2.8 1 7 5.2 11.2 1 13 2.8 8.8 7 13 11.2 11.2 13 7 8.8 2.8 13 1 11.2 5.2 7 1 2.8z" fill="currentColor" />
    </svg>
  );
}

/** Deck bar: collapse into the mini-player (a small window in the corner of the screen). */
export function MinimiseIcon({ size = 14 }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 14 14">
      <path fillRule="evenodd" d="M1 2h12v10H1zM2.5 3.5v7h9v-7zM6.5 6.5h4v3h-4z" fill="currentColor" />
    </svg>
  );
}

/** Mini-player: back to the full bar (a band along the bottom of the screen). */
export function ExpandIcon({ size = 14 }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 14 14">
      <path fillRule="evenodd" d="M1 2h12v10H1zM2.5 3.5v4h9v-4z" fill="currentColor" />
    </svg>
  );
}

/** Mini-player: the handle it is dragged by. */
export function GripIcon({ size = 14 }: Props) {
  return (
    <svg aria-hidden="true" width={(size * 8) / 14} height={size} viewBox="0 0 8 14">
      <path d="M1 2h2v2H1zM5 2h2v2H5zM1 6h2v2H1zM5 6h2v2H5zM1 10h2v2H1zM5 10h2v2H5z" fill="currentColor" />
    </svg>
  );
}
