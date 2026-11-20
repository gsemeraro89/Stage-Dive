// The English Wikipedia article of a Wikidata item (open data, CC0), for the entity links job
// (src/lib/entity-links.ts): https://www.wikidata.org/wiki/Special:EntityData/<QID>.json gives the
// item's sitelinks; "enwiki" is the English article.
import { LINKS_USER_AGENT } from "./collector/musicbrainz";

interface Entity {
  id?: string;
  sitelinks?: Record<string, { site?: string; title?: string; url?: string }>;
}

/**
 * The English Wikipedia article of an item, from its EntityData answer. A merged item answers under its
 * new ID, so the only entity is taken when the asked one is missing. Pure, for tests.
 */
export function enwikiUrlFromEntity(answer: unknown, qid: string): string | null {
  const entities = (answer as { entities?: Record<string, Entity> })?.entities ?? {};
  const entity = entities[qid] ?? (Object.keys(entities).length === 1 ? Object.values(entities)[0] : undefined);
  const link = entity?.sitelinks?.enwiki;
  if (!link?.title) return null;
  if (link.url && /^https:\/\/en\.wikipedia\.org\/wiki\//.test(link.url)) return link.url;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(link.title.replace(/ /g, "_"))}`;
}

/** A Wikidata ID as stored: "Q15920"; anything else is null. */
export function cleanQid(id: string | null | undefined): string | null {
  return id && /^Q\d+$/.test(id) ? id : null;
}

/** One Wikidata call: the item's English Wikipedia article, or null. */
export async function wikipediaUrlFor(qid: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchFn(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {
    headers: { "User-Agent": LINKS_USER_AGENT, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  return enwikiUrlFromEntity(await res.json(), qid);
}
