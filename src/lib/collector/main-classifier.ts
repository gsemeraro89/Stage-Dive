// The main collector's classifier (owner, 20 Nov 2026): Claude Haiku first, through the half-price
// Batch API with the fixed instructions cached (the per-artist lane's pass, src/lib/collector/haiku.ts),
// and Claude Opus only as a second opinion when Haiku is unsure. Pure functions, so the rules can be tested.
//
// Answers are stored and shared: Haiku's in lane_answers (the lane reads the same ones), Opus's in
// classification_cache. A stored answer is never paid for twice; Opus's answer wins when both exist.
import type { FullClassification } from "./classify";
import { toFullClassification, type LaneClassification } from "./haiku";
import type { ChannelKindName, Verdict } from "./rules";

/**
 * haiku+opus (default): Haiku for every video, Opus for the answers Haiku is unsure about.
 * haiku: Haiku only. opus: Opus for every video (the old collector, about 35 times the cost).
 */
export type MainClassifierMode = "haiku+opus" | "haiku" | "opus";
export const DEFAULT_MAIN_CLASSIFIER: MainClassifierMode = "haiku+opus";

/** COLLECT_CLASSIFIER: empty = the default; anything unknown stops the run before it spends. */
export function mainClassifierMode(value: string | undefined): MainClassifierMode {
  const s = (value ?? "").trim().toLowerCase();
  if (!s) return DEFAULT_MAIN_CLASSIFIER;
  if (s === "haiku+opus" || s === "haiku" || s === "opus") return s;
  throw new Error(`unknown COLLECT_CLASSIFIER "${value}" (known: haiku+opus, haiku, opus)`);
}

export interface SecondOpinionInput {
  mode: MainClassifierMode;
  /** An Opus answer is already stored (or waiting in a batch): never asked twice. */
  hasOpusAnswer: boolean;
  /** Haiku's stored answer, or null when there is none. */
  haiku: Pick<LaneClassification, "confidence" | "uploaderIsOfficial"> | null;
  /** Haiku declined to answer (it has no server-side fallback; Opus has). */
  haikuRefused: boolean;
  /** The decision the collector would make on Haiku's answer alone (null without an answer). */
  verdict: Verdict | null;
  channelKind: ChannelKindName;
  /** Confidence needed for an answer to count (MIN_CONFIDENCE, 0.75). */
  minConfidence: number;
}

/**
 * Whether Opus should look at a video. In haiku+opus mode: only for official sources (a channel of
 * our list, an artist channel, or an uploader Haiku recognised as official: fan uploads only go to the
 * report, so a second opinion would change nothing), when Haiku declined, was less sure than
 * minConfidence, or its answer leads to UNCERTAIN.
 */
export function needsOpus(i: SecondOpinionInput): boolean {
  if (i.hasOpusAnswer || i.mode === "haiku") return false;
  if (i.mode === "opus") return true;
  if (!i.haiku) return i.haikuRefused && i.channelKind !== "UNKNOWN";
  const official = i.channelKind !== "UNKNOWN" || i.haiku.uploaderIsOfficial;
  if (!official) return false;
  return i.haiku.confidence < i.minConfidence || i.verdict === "UNCERTAIN";
}

/** The answer the decision uses: Opus's when there is one (it carries its own write-up), else Haiku's. */
export function pickAnswer(
  opus: FullClassification | undefined,
  haiku: LaneClassification | undefined,
): { from: "opus" | "haiku"; classification: FullClassification } | null {
  if (opus) return { from: "opus", classification: opus };
  if (haiku) return { from: "haiku", classification: toFullClassification(haiku, "", haiku.uploaderIsOfficial) };
  return null;
}

/**
 * Every published concert carries an original write-up (owner rule: content for every new concert,
 * automatically; 400+ characters make a concert page strong enough to index). An accepted concert
 * without one goes to the write-up pass (Haiku, batch, stored) and waits for it before publishing.
 */
export function needsWriteUp(verdict: Verdict, classification: Pick<FullClassification, "writeUp">): boolean {
  return verdict === "ACCEPTED" && !(classification.writeUp ?? "").trim();
}
