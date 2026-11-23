// The short label of a story's topic, for the topic stamp on news lists and articles (owner, 23 Nov 2026:
// a more visual news section). Data only; the designer places the stamp. Copy rules as everywhere.
import type { Topic } from "./writer";

export const TOPIC_LABELS: Record<Topic, string> = {
  tour: "Tour",
  festival: "Festival",
  "live-release": "Live album",
  reunion: "Reunion",
  anniversary: "Anniversary",
  "new-music": "New music",
  "line-up-change": "Line-up",
  other: "News",
};

/** The stamp label of a topic; "News" for "other" and for a topic the writer does not know. Pure. */
export function topicLabel(topic: string): string {
  return (TOPIC_LABELS as Record<string, string>)[topic] ?? TOPIC_LABELS.other;
}
