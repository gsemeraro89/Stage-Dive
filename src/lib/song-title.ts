// One name and one address per song (owner, 19 Nov 2026: a page for every song played live).
// Setlists spell the same song in many ways: "Creep", "CREEP", "Creep (Live)", "Creep - Remastered",
// "Encore: Creep", "Seek & Destroy" / "Seek and Destroy", "Am I Evil? (Diamond Head cover)".
// songTitleBase() takes off what is a note about the performance, not part of the song's name;
// songSlug() turns that into the address used under /songs/<band>/<song>. A subtitle that is part of
// the name stays ("Street Spirit (Fade Out)"); the song pages merge it with the short spelling when
// both turn up (src/lib/songs.ts canonicalSlugs). Pure functions, tested in tests/songs.test.ts.
import { slugify } from "./slug";

/** What a bracket may say about a performance: not part of the song's name. */
const NOTE_IN_BRACKETS = new RegExp(
  "^(?:" +
    [
      String.raw`live\b.*`,
      String.raw`acoustic\b.*`,
      String.raw`unplugged\b.*`,
      String.raw`electric\b.*`,
      String.raw`(?:\d{4}\s+)?(?:digital(?:ly)?\s+)?remaster(?:ed)?\b.*`,
      String.raw`.*\bcover\b.*`,
      String.raw`(?:with|feat\.?|ft\.?|featuring)\s.+`,
      String.raw`intro|outro|extended(?:\s+(?:version|intro|outro|jam|ending))?`,
      String.raw`(?:with\s+)?(?:intro|outro|jam|snippet|tease)`,
      String.raw`tease|snippet|partial|incomplete|short(?:\s+version)?|cut|fragment`,
      String.raw`reprise|encore|instrumental`,
      String.raw`(?:radio|single|album|live|full|alternate|alt\.?|extended|short)\s+(?:edit|version|mix)`,
      String.raw`edit|version|remix`,
    ].join("|") +
    ")$",
  "i",
);

/** What may follow a dash at the end of a line: "- Live", "- 2011 Remaster", "- Acoustic". */
const NOTE_AFTER_DASH =
  /\s+[-–—]\s+(?:live\b.*|(?:\d{4}\s+)?(?:digital(?:ly)?\s+)?remaster(?:ed)?\b.*|acoustic\b.*|unplugged\b.*|(?:radio|single|album)\s+(?:edit|version)|demo|reprise|intro|outro|cover)$/i;

/** "Encore:", "Encore 2 -", "E1:" in front of a song. */
const ENCORE_PREFIX = /^(?:encore(?:\s*\d+)?|e\d)\s*[:.\-–—]\s*/i;

/**
 * The song's name without notes about the performance:
 * "Creep (Live)" -> "Creep", "Paranoid Android - Remastered" -> "Paranoid Android",
 * "Encore: Enter Sandman" -> "Enter Sandman", "Am I Evil? (Diamond Head cover)" -> "Am I Evil?",
 * "“One”" -> "One". "Street Spirit (Fade Out)" stays as it is.
 */
export function songTitleBase(title: string): string {
  let t = title.normalize("NFC").replace(/\s+/g, " ").trim();
  let before = "";
  while (t !== before) {
    before = t;
    t = t
      .replace(ENCORE_PREFIX, "")
      // Square brackets are always notes ("[tease]", "[with Dave Mustaine]").
      .replace(/\s*\[[^\]]*\]\s*$/, "")
      .replace(/\s*\(([^()]*)\)\s*$/, (m, inner: string) => (NOTE_IN_BRACKETS.test(inner.trim()) ? "" : m))
      .replace(NOTE_AFTER_DASH, "")
      // Markers some setlists add ("Creep*", "Creep +", "Creep †").
      .replace(/[\s*+†#]+$/, "")
      .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
      .trim();
  }
  return t || title.trim();
}

/** The song's address under its band: "Creep (Live)" -> "creep", "Seek & Destroy" -> "seek-and-destroy". Empty when nothing is left. */
export function songSlug(title: string): string {
  return slugify(songTitleBase(title));
}

/** The short form of a title with a subtitle in brackets: "Street Spirit (Fade Out)" -> "street-spirit". Null without one. */
export function shortSongSlug(title: string): string | null {
  const m = /^(.*\S)\s*\([^()]+\)$/.exec(songTitleBase(title));
  return m ? slugify(m[1]) || null : null;
}
