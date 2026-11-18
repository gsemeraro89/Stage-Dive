// The photocopy treatment (brief section 3, "Photocopy treatment"), for images we are allowed to change:
// licensed band photos (Wikimedia Commons) and our own art. Never for YouTube thumbnails or avatars:
// YouTube's developer policies say a video thumbnail must not be altered (owner decision, 18 Nov 2026).
//
//   1. Drop colour, keep the brightest channel so stage light survives.
//   2. Crush: blacks to black, haze to white, lose mid-greys.
//   3. Remaining greys -> 45° dot screen, 6 px.
//   4. Copier dirt: specks, toner gaps, one or two drum streaks.
//   5. Print on paper colour. (The 4 px black frame is drawn by the page, not baked in.)
//
// Deterministic: the same photo and seed always give the same copy, so a re-run changes nothing.
import sharp from "sharp";

export const PAPER = [0xec, 0xea, 0xe4] as const; // copier paper #ECEAE4
export const TONER = [0x0a, 0x0a, 0x0a] as const; // toner black #0A0A0A

export interface PhotocopyOptions {
  width?: number;
  height?: number;
  /** Dot screen cell size in pixels (brief: 6). */
  cell?: number;
  /** Seeds the copier dirt, e.g. the band's slug. */
  seed?: string;
  /** Levels for the crush: at or below `black` is solid black, at or above `white` is paper. */
  black?: number;
  white?: number;
}

/** Small fast PRNG (mulberry32) so the dirt is the same on every run. */
export function prng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Steps 1–3 on raw RGB pixels: 1 = toner, 0 = paper. Pure, for tests.
 * `rgb` has 3 bytes per pixel, row by row.
 */
export function screen(rgb: Uint8Array, width: number, height: number, o: Required<Pick<PhotocopyOptions, "cell" | "black" | "white">>): Uint8Array {
  const out = new Uint8Array(width * height);
  const s = Math.SQRT1_2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      // 1. The brightest channel: a red or blue stage light stays bright instead of turning grey.
      const v = Math.max(rgb[p], rgb[p + 1], rgb[p + 2]);
      // 2. Crush the levels: how much toner this spot gets, 0..1.
      const t = Math.min(1, Math.max(0, (v - o.black) / (o.white - o.black)));
      const dark = 1 - t;
      let ink: number;
      if (dark >= 0.92) ink = 1;
      else if (dark <= 0.06) ink = 0;
      else {
        // 3. Dot screen at 45°: a dot per cell whose area matches the darkness.
        const u = (x + y) * s;
        const w = (x - y) * s;
        const du = u - (Math.floor(u / o.cell) + 0.5) * o.cell;
        const dw = w - (Math.floor(w / o.cell) + 0.5) * o.cell;
        const radius = o.cell * Math.sqrt(dark / Math.PI);
        ink = du * du + dw * dw <= radius * radius ? 1 : 0;
      }
      out[y * width + x] = ink;
    }
  }
  return out;
}

/** Step 4: copier dirt, in place. Specks, a few toner gaps in dark areas, one or two drum streaks. */
export function addDirt(ink: Uint8Array, width: number, height: number, seed: string): void {
  const rand = prng(seed);
  const at = (x: number, y: number) => y * width + x;
  const blot = (cx: number, cy: number, rx: number, ry: number, value: 0 | 1) => {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(width - 1, Math.ceil(cx + rx)); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) ink[at(x, y)] = value;
      }
    }
  };
  // Specks: small black dots, about 6 per 10,000 pixels.
  const specks = Math.round(width * height * 0.0006);
  for (let i = 0; i < specks; i++) {
    const r = 0.6 + rand() * 1.4;
    blot(rand() * width, rand() * height, r, r * (0.7 + rand() * 0.6), 1);
  }
  // Toner gaps: a few pale patches where the toner did not take.
  const gaps = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < gaps; i++) {
    blot(rand() * width, rand() * height, 4 + rand() * 12, 2 + rand() * 5, 0);
  }
  // Drum streaks: one or two broken vertical lines from a scratched drum.
  const streaks = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < streaks; i++) {
    const x0 = Math.floor(width * (0.1 + rand() * 0.8));
    const thick = 1 + Math.floor(rand() * 2);
    for (let y = 0; y < height; y++) {
      if (rand() < 0.45) for (let k = 0; k < thick && x0 + k < width; k++) ink[at(x0 + k, y)] = 1;
    }
  }
}

/** The whole treatment: any photo in, a two-colour PNG (toner on paper) out. */
export async function photocopy(input: Buffer, options: PhotocopyOptions = {}): Promise<{ png: Buffer; width: number; height: number }> {
  const width = options.width ?? 960;
  const height = options.height ?? 720;
  const o = { cell: options.cell ?? 6, black: options.black ?? 70, white: options.white ?? 190 };
  // Crop hard to the frame; "attention" keeps the busiest part (the stage) rather than the middle.
  const { data } = await sharp(input)
    .rotate()
    .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ink = screen(new Uint8Array(data.buffer, data.byteOffset, data.length), width, height, o);
  addDirt(ink, width, height, options.seed ?? "stagedive");
  // 5. Print: toner on copier paper.
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0; i < ink.length; i++) {
    const c = ink[i] ? TONER : PAPER;
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  }
  const png = await sharp(out, { raw: { width, height, channels: 3 } })
    .png({ palette: true, colours: 2, compressionLevel: 9 })
    .toBuffer();
  return { png, width, height };
}
