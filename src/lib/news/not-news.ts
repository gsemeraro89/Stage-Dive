// Press items that are not news, told from the headline alone, for free, before Claude is asked (22 Nov 2026: the
// first dry run would have sent quizzes, gift guides, "10 best" lists, weekly round-ups, interviews and
// retrospectives). Conservative: only clear features; anything in doubt still goes to Claude, which decides.
// Pure; tested in tests/news-filter.test.ts.

const PATTERNS: [string, RegExp][] = [
  ["quiz", /\bquiz(zes)?\b/i],
  ["gift guide", /\bgifts?\b|\bstocking fillers?\b|\bbuyer'?s guide\b/i],
  // "10 candid photos...", "15 Rock + Metal Bands That Broke Up", "The 10 Best...", "All 5 Rock + Metal Musicians Who...";
  // a plural list word must follow, so "3 Doors Down announce tour" or "30 Seconds to Mars return" stay news.
  [
    "numbered list",
    /^\s*(?:the\s+|all\s+|top\s+)?\d{1,3}\s+(?:[\p{L}+'-]+\s+){0,6}(?:songs|albums|bands|records|tracks|photos|pictures|things|reasons|moments|musicians|artists|singers|guitarists|drummers|bassists|vocalists|frontmen|tours|shows|concerts|gigs|covers|riffs|intros|solos|gifts|facts|times|ways|videos|memories|lessons|secrets|picks)\b/iu,
  ],
  // "Name 10 Essential 1970s Classic Rock Albums", "AP A-sides: 10 songs you need to hear"
  ["numbered list", /\bnames?\s+(?:their\s+|the\s+)?\d{1,3}\b|\b\d{1,3}\s+(?:best|essential|greatest|underrated|overlooked|favou?rite|songs you|albums you|bands you|things)\b/i],
  ["best-of list", /\bof all time\b|\bbest\b.*\bof (?:19|20)\d{2}\b|\bbest (?:songs|albums|records|tracks|bands|concerts|intros|riffs|solos)\b/i],
  ["round-up", /\bround-?ups?\b|\bthe weekly\b|\btop stories\b|\bof the week\b|\bthis past week\b|\bnew releases\b.*\bthis week\b|\ba-sides\b|\bfeedbacker\b/i],
  ["interview", /\binterview(s|ed)?\b|\bin conversation\b|\bQ&A\b/i],
  ["review", /^\s*review\b|\breview\s*$|\bbox set review\b|\balbum review\b|\blive review\b|\breviews?:|\breviews with\b/i],
  ["photo gallery", /^\s*photos?\s*[:\-–—]/i],
  // Retrospectives and features: "How U2 dismantled...", "The day Roger Daltrey...", "35 Years Ago: U2's 'Achtung Baby'".
  ["retrospective", /^\s*how\s+(?!to\b)|^\s*the day\b|\b\d+\s+years ago\b|\bhistory of\b|\btrack-by-track\b|\blook(s|ing)? back\b|\bwhere are they now\b/i],
  ["comparison", /\s(?:vs\.?|versus)\s/i],
  // "Every Rock + Metal Song That's Been in GTA" (not "Every Time I Die announce..."), "Which ... Bands Have the Best...?"
  ["list of every", /^\s*(?:every|all the|here are all(?: the)?)\s+(?:[\p{L}+'-]+\s+){0,3}(?:songs?|albums?|bands?|records|tracks|musicians)\b|^\s*which\b.*\?\s*$/iu],
];

/** Why a headline is not news (a short reason), or null when it may be news. Pure. */
export function notNewsReason(title: string): string | null {
  const t = title.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  for (const [reason, re] of PATTERNS) if (re.test(t)) return reason;
  return null;
}
