// Which of our bands and festivals a press item is about (owner, 21 Nov 2026: news only for the music we
// cover, i.e. the bands and festivals on the site). Free and strict: only items naming one of them go on
// to Claude (which costs money). Short or everyday names ("Muse", "Ghost", "Tool", "Bush", "Rush",
// "Television", "The Cure", "Download") must appear written as the band writes them (capitals included)
// with a music word close by, or be the item's own category, so "my muse" or "a handy tool" never count.
// Pure; tested in tests/news.test.ts.

export interface NewsEntity {
  kind: "band" | "festival";
  /** Page slug: /artists/<slug> or /venues/<slug>. */
  slug: string;
  name: string;
  /** Another name the band goes by (Artist.aka). */
  aka?: string | null;
}

export interface NewsMatch {
  bands: NewsEntity[];
  festivals: NewsEntity[];
}

/** Other names the press uses for some festivals (on top of the automatic short names). */
export const FESTIVAL_ALIASES: Record<string, string[]> = {
  "Wacken Open Air": ["Wacken"],
  "Graspop Metal Meeting": ["Graspop"],
  "Primavera Sound": ["Primavera Sound Barcelona", "Primavera Sound Porto"],
  "Rock Am Ring": ["Rock am Ring"],
  "Download Festival": ["Download Festival UK"],
  "Pol'And'Rock Festival": ["Woodstock Poland", "Przystanek Woodstock"],
  "Hellfest": ["Hellfest Open Air"],
};

/** Names that must never be matched on their own because they are everyday words in another sense. */
const BLOCKERS: Record<string, RegExp> = {
  Bush: /\b(george|president|administration|white house|w\.)\b/i,
  Rush: /\b(limbaugh|rush hour|gold rush|sugar rush)\b/i,
  Pulp: /\bpulp fiction\b/i,
  Ghost: /\b(ghost of tsushima|ghost town|ghost story|ghost stories|ghostbusters)\b/i,
  Television: /\b(tv|television) (series|show|network|channel|station|drama|special)\b/i,
  Hole: /\b(black hole|plot hole|sinkhole|hole in)\b/i,
};

/** Words that make a short or everyday band name count when close by (same sentence, about 80 characters). */
const MUSIC_WORDS =
  /\b(band|bands|tour|tours|touring|tour dates|album|albums|LP|EP|live|concert|concerts|gig|gigs|show|shows|frontman|frontwoman|singer|vocalist|guitarist|drummer|bassist|keyboardist|reunion|reunite[sd]?|setlist|headlin\w*|festival|record|records|recorded|recording|single|song|songs|track|tracks|music video|vinyl|line-?up|stage|anniversary|perform\w*|rockers?|metal|punk|grunge|rock|indie|cover[sd]?|riff|debut|bill)\b/i;

/** Words that make a one-word festival name count. */
const FESTIVAL_WORDS = /\b(festival|fest|line-?up|tickets?|edition|headlin\w*|stages?|bill|announce[sd]?|returns?|dates|perform\w*|open air)\b/i;

const foldAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘`´]/g, "'");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (n: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, flags);

/** "The Cure" -> "Cure": the words that make a name distinctive. */
const core = (name: string) => name.replace(/^the\s+/i, "").trim();

/**
 * A name that could be an everyday word: one word once "The" is set aside ("Muse", "The Cure"), or
 * very short ("U2", "X"). Such a name needs its own capitals and a music word nearby.
 */
export function isRiskyName(name: string): boolean {
  const c = core(name);
  return !/\s/.test(c) || c.length <= 4;
}

/**
 * The short names the press uses for a festival: "Sziget Festival" -> "Sziget", "Coachella Valley
 * Music and Arts Festival" -> "Coachella Valley", "Lollapalooza Festival, Treptower Park" ->
 * "Lollapalooza", "Stagecoach 2026 (Mustang Stage)" -> "Stagecoach". Pure.
 */
export function festivalNames(name: string): string[] {
  const out = new Set<string>([name]);
  const base = name
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/,.*$/, "")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  out.add(base);
  const short = base.replace(/\s+(Music\s+(&|and)\s+Arts\s+)?(Festival|Fest)$/i, "").replace(/\s+Valley$/i, "").trim();
  if (short.length >= 4) out.add(short);
  for (const a of FESTIVAL_ALIASES[name] ?? []) out.add(a);
  return [...out].filter((n) => n.length >= 3);
}

interface Rule {
  e: NewsEntity;
  re: RegExp;
  /** Needs a context word nearby (risky name). */
  context: RegExp | null;
  block: RegExp | null;
  len: number;
}

export interface Matcher {
  /** Our bands and festivals the item names. */
  find(item: { title: string; summary?: string; categories?: string[] }): NewsMatch;
}

/** Whether a context word sits within about 80 characters of the match, in the same sentence. */
function near(text: string, index: number, length: number, context: RegExp): boolean {
  const from = Math.max(0, index - 80);
  const to = Math.min(text.length, index + length + 80);
  const before = text.slice(from, index).split(/[.!?]\s/).pop() ?? "";
  const after = text.slice(index + length, to).split(/[.!?]\s/)[0] ?? "";
  return context.test(`${before} ${after}`);
}

/** A matcher for our bands and festivals. Pure. */
export function newsMatcher(entities: NewsEntity[]): Matcher {
  const rules: Rule[] = [];
  for (const e of entities) {
    const names = e.kind === "festival" ? festivalNames(e.name) : [e.name, ...(e.aka ? e.aka.split(/\s*[,;/]\s*/) : [])];
    for (const raw of new Set(names.map((n) => foldAccents(n).trim()).filter((n) => n.length >= 2))) {
      const risky = isRiskyName(raw);
      rules.push({
        e,
        // Risky names must be written as the band writes them (case-sensitive); the others in any case.
        re: word(raw, risky ? "gu" : "giu"),
        context: risky ? (e.kind === "festival" ? FESTIVAL_WORDS : MUSIC_WORDS) : null,
        block: BLOCKERS[raw] ?? null,
        len: raw.length,
      });
    }
  }
  rules.sort((a, b) => b.len - a.len);
  return {
    find(item) {
      const text = foldAccents(`${item.title}. ${item.summary ?? ""}`);
      const categories = new Set((item.categories ?? []).map((c) => foldAccents(c).trim().toLowerCase()));
      const found = new Map<string, { e: NewsEntity; at: number }>();
      for (const r of rules) {
        const key = `${r.e.kind}:${r.e.slug}`;
        if (found.has(key)) continue;
        // The item's own category naming the band or festival is enough on its own.
        const name = r.re.source;
        const categoryHit = [...categories].some((c) => new RegExp(`^${name}$`, "iu").test(c));
        if (categoryHit) {
          found.set(key, { e: r.e, at: text.length });
          continue;
        }
        if (r.block && r.block.test(text)) continue;
        for (const m of text.matchAll(r.re)) {
          if (r.context && !near(text, m.index, m[0].length, r.context)) continue;
          found.set(key, { e: r.e, at: m.index });
          break;
        }
      }
      // Named first in the headline = what the story is about.
      const hits = [...found.values()].sort((a, b) => a.at - b.at).map((h) => h.e);
      return { bands: hits.filter((e) => e.kind === "band"), festivals: hits.filter((e) => e.kind === "festival") };
    },
  };
}

/** True when the item names at least one of ours. */
export const hasMatch = (m: NewsMatch) => m.bands.length + m.festivals.length > 0;
