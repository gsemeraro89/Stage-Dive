// The giant name: the largest thing on the page, always sized so it fits its column.

// Advance widths in em for Archivo 900 at 125% width, uppercase, letter-spacing -0.02em
// (measured in the browser; see design/DESIGN.md section 4). Unknown characters use DEFAULT.
const WIDTHS: Record<string, number> = {
  A: 0.934, B: 0.91, C: 0.919, D: 0.913, E: 0.84, F: 0.787, G: 0.992, H: 0.989, I: 0.375, J: 0.744, K: 0.968,
  L: 0.766, M: 1.158, N: 0.987, O: 0.988, P: 0.845, Q: 0.988, R: 0.923, S: 0.862, T: 0.857, U: 0.969, V: 0.918,
  W: 1.21, X: 0.941, Y: 0.946, Z: 0.857, "0": 0.791, "1": 0.711, "2": 0.789, "3": 0.793, "4": 0.799, "5": 0.793,
  "6": 0.795, "7": 0.735, "8": 0.808, "9": 0.795, " ": 0.27, "-": 0.396, "&": 1.045, "'": 0.304, ".": 0.361,
  ",": 0.361, "@": 1.22, "|": 0.272,
};
const DEFAULT = 1;

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

export function emWidth(text: string): number {
  let w = 0;
  for (const ch of plain(text)) w += WIDTHS[ch] ?? DEFAULT;
  return w;
}

/** Width in em of the widest line when the words are spread over at most `maxLines` lines. */
export function fitLines(name: string, maxLines: number): number {
  const words = name.trim().split(/\s+/);
  const widths = words.map(emWidth);
  const space = WIDTHS[" "];
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  if (maxLines <= 1 || words.length === 1) return total;
  // Smallest line width that still lets a greedy wrap fit in maxLines lines.
  const candidates = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    let w = 0;
    for (let j = i; j < words.length; j++) {
      w += widths[j] + (j > i ? space : 0);
      candidates.add(w);
    }
  }
  for (const limit of [...candidates].sort((a, b) => a - b)) {
    let lines = 1;
    let w = 0;
    let ok = true;
    for (const width of widths) {
      if (width > limit) {
        ok = false;
        break;
      }
      if (w === 0) w = width;
      else if (w + space + width <= limit) w += space + width;
      else {
        lines++;
        w = width;
      }
    }
    if (ok && lines <= maxLines) return limit;
  }
  return total;
}

/**
 * @param max    CSS length cap for the font size, e.g. "33vw" (short names stop growing here)
 * @param maxPhone  cap on phones, when it differs from `max`
 * @param lines  most lines the name may take on desktop; on phones it wraps word by word
 */
export function BigName({
  name,
  id,
  as: Tag = "h1",
  max = "33vw",
  maxPhone,
  lines = 2,
  outline,
  className,
  children,
}: {
  name: string;
  id?: string;
  as?: "h1" | "p" | "div";
  max?: string;
  maxPhone?: string;
  lines?: number;
  outline?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const words = name.trim().split(/\s+/);
  // 2% of slack so rounding never pushes a line over the edge.
  const em = fitLines(name, emWidth(name) > 7 ? lines : 1) * 1.02;
  const emWord = Math.max(...words.map(emWidth)) * 1.02;
  return (
    <Tag
      id={id}
      className={`od-bigname display${outline ? " od-bigname--outline" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--em": em.toFixed(3), "--em-word": emWord.toFixed(3), "--bigname-max": max, "--bigname-max-phone": maxPhone ?? max } as React.CSSProperties}
    >
      {children ?? name}
    </Tag>
  );
}
