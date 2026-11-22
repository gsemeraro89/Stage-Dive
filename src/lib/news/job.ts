// The news job (scripts/news.ts; run by collect.yml after the collector, or by news.yml): read the press
// feeds, keep the items that name one of our bands or festivals (free matcher), then have Claude Haiku
// write and fact-check a short original article, within NEWS_BUDGET_USD a month.
// Ported from OpenDecks/FullDJSet (src/lib/news/job.ts) and adapted to bands + festivals.
import type { PrismaClient } from "../../generated/prisma/client";
import { VISIBLE } from "../filters";
import { slugify } from "../slug";
import { RESERVED_NEWS_SLUGS } from "./hubs";
import { ALL_FEEDS, FEEDS, readArticle, readFeed, type Feed, type FeedItem } from "./feeds";
import { hasMatch, newsMatcher, type NewsEntity, type NewsMatch } from "./match";
import { notNewsReason } from "./not-news";
import { NewsWriter, searchShapedTitle, sourceProblems, sourceText, withoutUnsourcedYears, writtenProblems, type NewsPasses, type Written } from "./writer";

/** Default monthly budget for news, in US dollars (owner, 21 Nov 2026: $5 a month; NEWS_BUDGET_USD changes it). */
export const DEFAULT_NEWS_BUDGET_USD = 5;

/** NEWS_BUDGET_USD as a number: empty or not a positive number = the default. Pure. */
export function newsBudgetFromEnv(value: string | undefined): number {
  const n = Number((value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_NEWS_BUDGET_USD;
}

/** At most this many press items go to Claude in one run. */
export const MAX_PRESS_PER_RUN = 25;
/** Press items older than this are not news any more. */
export const MAX_AGE_DAYS = 7;
/** Rough upper cost of one item (write + check; measured cost is about a third of this), kept in hand so a run never goes over the budget. */
export const ITEM_ESTIMATE_USD = 0.01;

/** Whether one more item fits in the month's budget. Pure. */
export function fitsBudget(spentUsd: number, budgetUsd: number, estimateUsd = ITEM_ESTIMATE_USD): boolean {
  return spentUsd + estimateUsd <= budgetUsd;
}

/** The slug an article starts from: its headline, at most 90 characters, never empty. Pure. */
export function baseSlug(title: string): string {
  return slugify(title).slice(0, 90).replace(/-+$/, "") || "news";
}

/** A slug no other article has: "pixies-european-tour-dates", then "...-2", "...-3". */
async function uniqueSlug(db: PrismaClient, title: string): Promise<string> {
  const root = baseSlug(title);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    // The topic pages and the list's own addresses (/news/tours, /news/page) are never an article's.
    if (RESERVED_NEWS_SLUGS.has(slug)) continue;
    if (!(await db.newsArticle.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}

/** Our bands (with a page) and our festivals (places with a visible festival concert), for matching. */
export async function newsEntities(db: PrismaClient): Promise<NewsEntity[]> {
  const [bands, festivals] = await Promise.all([
    db.artist.findMany({ where: { credits: { some: { role: "MAIN", concert: VISIBLE } } }, select: { slug: true, name: true, aka: true } }),
    db.venue.findMany({ where: { concerts: { some: { ...VISIBLE, venueKind: { slug: "festival" } } } }, select: { slug: true, name: true } }),
  ]);
  return [
    ...bands.map((b): NewsEntity => ({ kind: "band", slug: b.slug, name: b.name, aka: b.aka })),
    ...festivals.map((f): NewsEntity => ({ kind: "festival", slug: f.slug, name: f.name })),
  ];
}

function startOfMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Which of the matched entities the story is about, as the model named them; the matcher's order when it named none. Pure. */
export function storyEntities(match: NewsMatch, about: string[]): { bands: NewsEntity[]; festival: NewsEntity | null } {
  const all = [...match.bands, ...match.festivals];
  const named = about.map((n) => all.find((e) => e.name.toLowerCase() === n.trim().toLowerCase())).filter((e): e is NewsEntity => Boolean(e));
  const chosen = named.length ? [...new Set(named)] : all;
  return { bands: chosen.filter((e) => e.kind === "band"), festival: chosen.find((e) => e.kind === "festival") ?? null };
}

/** Everything that keeps an article from going live on its own (empty = publish). Pure. */
export function reviewReasons(w: Written, source: string, check: { supported: boolean; problems: string[]; copied: boolean } | null): string[] {
  return [
    ...writtenProblems(w),
    ...sourceProblems(w, source),
    ...(w.sensitive ? ["sensitive subject (death, illness, crime or court): the owner reads it first"] : []),
    ...(check ? check.problems : ["fact check gave no answer"]),
    ...(check && !check.supported && !check.problems.length ? ["fact check: not supported"] : []),
    ...(check?.copied ? ["copies the source"] : []),
  ];
}

export interface PressRunOptions {
  feeds?: Feed[];
  fetcher?: typeof fetch;
  writer?: NewsPasses;
  now?: Date;
  budgetUsd?: number;
  maxItems?: number;
  dryRun?: boolean;
}

/** Press news: read the feeds, keep items about our bands and festivals, write and check them. */
export async function runPressNews(db: PrismaClient, opts: PressRunOptions = {}) {
  const now = opts.now ?? new Date();
  const fetcher = opts.fetcher ?? fetch;
  const budget = opts.budgetUsd ?? newsBudgetFromEnv(process.env.NEWS_BUDGET_USD);
  // The budget and the clean-up follow the database's own clock (rows are stamped with it), not `now`.
  const clock = new Date();
  const spentRows = await db.newsSeen.aggregate({ where: { createdAt: { gte: startOfMonth(clock) } }, _sum: { costUsd: true } });
  let spent = spentRows._sum.costUsd ?? 0;
  const matcher = newsMatcher(await newsEntities(db));
  const stats = {
    feeds: 0,
    feedErrors: [] as string[],
    items: 0,
    seenBefore: 0,
    tooOld: 0,
    noMatch: 0,
    /** About ours but not news by its headline (quiz, list, interview...): skipped for free, Claude not asked. */
    notNewsByTitle: 0,
    sentToClaude: 0,
    notNews: 0,
    duplicate: 0,
    published: [] as string[],
    review: [] as string[],
    errors: [] as string[],
    costUsd: 0,
    monthSpentUsd: 0,
    budgetUsd: budget,
    stoppedByBudget: false,
  };

  // Every item from every feed, once per URL.
  const items = new Map<string, FeedItem & { source: string }>();
  for (const feed of opts.feeds ?? FEEDS) {
    const { items: got, error } = await readFeed(feed, fetcher);
    if (error) stats.feedErrors.push(`${feed.name} (${feed.url}): ${error}`);
    else stats.feeds++;
    for (const it of got) if (!items.has(it.url)) items.set(it.url, { ...it, source: feed.name });
  }
  stats.items = items.size;
  const seen = new Set((await db.newsSeen.findMany({ where: { url: { in: [...items.keys()] } }, select: { url: true } })).map((s) => s.url));
  const oldest = now.getTime() - MAX_AGE_DAYS * 86_400_000;

  const queue: { item: FeedItem & { source: string }; match: NewsMatch }[] = [];
  const skippedByTitle: string[] = [];
  for (const item of items.values()) {
    if (seen.has(item.url)) {
      stats.seenBefore++;
      continue;
    }
    if (item.publishedAt && item.publishedAt.getTime() < oldest) {
      stats.tooOld++;
      continue;
    }
    const match = matcher.find(item);
    if (!hasMatch(match)) {
      stats.noMatch++;
      if (!opts.dryRun) await db.newsSeen.create({ data: { url: item.url, decision: "no-match" } });
      continue;
    }
    const notNews = notNewsReason(item.title);
    if (notNews) {
      stats.notNewsByTitle++;
      skippedByTitle.push(`${notNews} | ${item.source} | ${item.title}`);
      if (!opts.dryRun) await db.newsSeen.create({ data: { url: item.url, decision: "not-news-title" } });
      continue;
    }
    queue.push({ item, match });
  }
  // Newest first, so the budget goes to fresh news.
  queue.sort((a, b) => (b.item.publishedAt?.getTime() ?? 0) - (a.item.publishedAt?.getTime() ?? 0));
  const label = (q: (typeof queue)[number]) => `${[...q.match.bands, ...q.match.festivals].map((e) => e.name).join(" / ")} | ${q.item.source} | ${q.item.title}`;

  if (opts.dryRun || !queue.length) {
    stats.monthSpentUsd = spent;
    return { ...stats, wouldSend: queue.map(label), ...(opts.dryRun ? { skippedByTitle } : {}) };
  }
  const writer = opts.writer ?? new NewsWriter();
  for (const q of queue.slice(0, opts.maxItems ?? MAX_PRESS_PER_RUN)) {
    const { item, match } = q;
    if (!fitsBudget(spent, budget)) {
      stats.stoppedByBudget = true;
      break;
    }
    stats.sentToClaude++;
    let cost = 0;
    const remember = (decision: string) =>
      db.newsSeen.upsert({ where: { url: item.url }, create: { url: item.url, decision, costUsd: cost }, update: { decision, costUsd: cost } });
    try {
      // The page itself; when a site does not let us read it, the full text its feed carries, if any.
      const page = await readArticle(item.url, fetcher);
      const articleText = page.length >= 300 || !item.content ? page : item.content;
      const press = { title: item.title, summary: item.summary, articleText, sourceName: item.source };
      const bandSlugs = match.bands.map((b) => b.slug);
      const venueSlugs = match.festivals.map((f) => f.slug);
      const recent = await db.newsArticle.findMany({
        where: {
          OR: [{ bandSlugs: { hasSome: bandSlugs } }, { venueSlug: { in: venueSlugs } }],
          publishedAt: { gte: new Date(now.getTime() - 21 * 86_400_000) },
          status: { not: "REJECTED" },
        },
        orderBy: { publishedAt: "desc" },
        take: 10,
        select: { title: true },
      });
      const ours = [...match.bands.map((b) => `${b.name} (band)`), ...match.festivals.map((f) => `${f.name} (festival)`)];
      const { answer, usd } = await writer.write(press, ours, recent.map((r) => r.title));
      cost += usd;
      if (!answer) {
        stats.errors.push(`no answer: ${item.url}`);
        await remember("error");
        continue;
      }
      // The model names ours exactly as given, with " (band)"/" (festival)" or without.
      const about = answer.about.map((a) => a.replace(/\s*\((band|festival)\)\s*$/i, ""));
      const story = storyEntities(match, about);
      if (!answer.isNews || (!story.bands.length && !story.festival)) {
        stats.notNews++;
        // Judged from the headline and summary alone (the site did not let us read it): tried again on
        // the next run, when the page may answer. Items leave the feeds within days, so this stays cheap.
        if (articleText.length >= 300 || !answer.isNews) await remember("not-news");
        continue;
      }
      if (answer.duplicateOf > 0) {
        stats.duplicate++;
        await remember("duplicate");
        continue;
      }
      const source = sourceText(press);
      // A year the source does not give is taken out of the headline (the model likes to add one).
      answer.title = withoutUnsourcedYears(answer.title, source);
      // Search-shaped (owner, 22 Nov 2026): the band or festival in the headline, leading when it was left out.
      answer.title = searchShapedTitle(answer.title, [...story.bands.map((b) => b.name), ...(story.festival ? [story.festival.name] : [])]);
      const { answer: check, usd: checkUsd } = await writer.check(press, answer);
      cost += checkUsd;
      const problems = reviewReasons(answer, source, check);
      const ok = problems.length === 0 && check?.supported === true;
      const title = answer.title.trim();
      await db.newsArticle.create({
        data: {
          kind: "press",
          key: item.url,
          topic: answer.topic,
          slug: await uniqueSlug(db, title),
          title,
          lead: answer.lead.trim(),
          body: answer.body.trim(),
          bandSlugs: story.bands.map((b) => b.slug),
          venueSlug: story.festival?.slug ?? null,
          venueName: story.festival?.name ?? null,
          artists: answer.artists.slice(0, 20),
          sourceName: item.source,
          sourceUrl: item.url,
          status: ok ? "PUBLISHED" : "REVIEW",
          checkNote: problems.length ? problems.join("; ").slice(0, 1000) : null,
          costUsd: cost,
          publishedAt: now,
        },
      });
      (ok ? stats.published : stats.review).push(title);
      await remember(ok ? "written" : "review");
    } catch (e) {
      // Not remembered: the item is tried again on the next run (a broken answer is rare and cheap).
      stats.errors.push(`${item.url}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
      // What was paid is still counted towards the month.
      if (cost > 0) await remember("error").catch(() => undefined);
    } finally {
      spent += cost;
      stats.costUsd += cost;
    }
  }
  await db.newsSeen.deleteMany({ where: { createdAt: { lt: new Date(clock.getTime() - 60 * 86_400_000) } } });
  stats.monthSpentUsd = spent;
  return stats;
}

/** Each feed's answer, for the admin op news-feeds (which feeds work from GitHub's runners), switched off ones too. */
export async function checkFeeds(feeds: Feed[] = ALL_FEEDS, fetcher: typeof fetch = fetch) {
  const out = [];
  for (const f of feeds) {
    const { items, error } = await readFeed(f, fetcher);
    out.push({ name: f.name, url: f.url, active: f.active !== false, ok: !error, items: items.length, ...(error ? { error } : { newest: items[0]?.title ?? null }) });
  }
  return out;
}
