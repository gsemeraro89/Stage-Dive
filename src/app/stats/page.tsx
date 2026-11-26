// "STAGEDIVE in numbers" (owner, 26 Nov 2026): citable figures about the catalogue, every one counted
// from our database (src/lib/stats.ts, read in src/lib/stats-data.ts), with how they are made and when
// they were last refreshed, so journalists and AI assistants can quote them with a source. Grows and
// re-ranks by itself after every collector and refresh run. Indexed from ten official concerts.
// Unstyled structure for now (designer): class names pg-stats-*, data-od="stats-*".
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { EmptyNote, PageHead, SectionTitle } from "@/components/gig/PageHead";
import { JsonLd } from "@/components/seo/JsonLd";
import { formatDate } from "@/lib/format";
import { clip, robotsFor, shareImages } from "@/lib/seo";
import {
  bandPath,
  concertName,
  concertPath,
  decadePath,
  hoursOf,
  lengthWords,
  mostCoveredDecade,
  mostWatchedPath,
  num,
  placePath,
  RANKINGS,
  songRowPath,
  STATS_HEADING,
  STATS_METHOD,
  STATS_PATH,
  STATS_TITLE,
  statsDate,
  statsFacts,
  statsIsStrong,
  statsLead,
} from "@/lib/stats";
import { siteStats } from "@/lib/stats-data";
import { breadcrumbs, statsJsonLd } from "@/lib/structured-data";
import { quoted } from "@/lib/text";
import { SITE_NAME } from "@/lib/site";

// One database read per request, shared by the page and its title/description.
const load = cache(siteStats);

// Served ready-made, rebuilt in the background at most every 10 minutes.
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const st = await load();
  const description = clip(statsLead(st));
  return {
    title: { absolute: STATS_TITLE },
    description,
    alternates: { canonical: STATS_PATH, types: { "text/markdown": `${STATS_PATH}.md` } },
    robots: robotsFor(statsIsStrong(st.totals.official)),
    openGraph: { title: STATS_TITLE, description, url: STATS_PATH, images: shareImages(st.mostWatched[0]?.thumbnail.src) },
  };
}

/** One ranking: a caption, then numbered rows (rank, the linked item, its figure). */
function Ranking({ id, title, unit, rows }: { id: string; title: string; unit: string; rows: { href: string; name: string; value: string }[] }) {
  if (!rows.length) return null;
  return (
    <section className="pg-stats-ranking" aria-labelledby={id} data-od={`stats-${id}`}>
      <SectionTitle id={id} small>
        {title}
      </SectionTitle>
      <table className="pg-stats-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Name</th>
            <th scope="col">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.href}>
              <td className="pg-stats-rank">{i + 1}</td>
              <td className="pg-stats-name">
                <Link href={r.href}>{r.name}</Link>
              </td>
              <td className="pg-stats-value">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function StatsPage() {
  const st = await load();
  const t = st.totals;
  const facts = statsFacts(st);
  const date = statsDate(st);
  const covered = mostCoveredDecade(st.decades);
  // The headline figures, each linked to where it can be browsed when there is such a page.
  const totals: { id: string; label: string; value: string; href?: string }[] = [
    { id: "concerts", label: "Full concerts", value: num(t.concerts), href: "/concerts" },
    { id: "official", label: "Official concerts", value: num(t.official), href: "/concerts?source=official" },
    { id: "bootlegs", label: "Bootlegs", value: num(t.bootlegs), href: "/concerts?source=bootleg" },
    { id: "bands", label: "Bands", value: num(t.bands), href: "/artists" },
    { id: "places", label: "Festivals and venues", value: num(t.places), href: "/venues" },
    { id: "festivals", label: "Festivals among them", value: num(t.festivals), href: "/venues" },
    { id: "countries", label: "Countries", value: num(t.countries) },
    { id: "setlists", label: "Concerts with a setlist", value: num(t.withSetlist) },
    { id: "timed-songs", label: "Songs you can jump to", value: num(t.timedSongs) },
    { id: "songs", label: "Different songs played live (band by band)", value: num(t.songs) },
    { id: "hours", label: "Hours of music", value: num(hoursOf(t.seconds)) },
    ...(t.firstYear && t.lastYear ? [{ id: "years", label: "Years covered", value: `${t.firstYear}–${t.lastYear}`, href: "/decades" }] : []),
    { id: "decades", label: "Decades", value: num(t.decades), href: "/decades" },
  ];
  return (
    <main data-od="stats" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            [STATS_HEADING, STATS_PATH],
          ]),
          ...(t.concerts ? statsJsonLd(st) : []),
        ]}
      />
      <PageHead
        trail={[{ label: "In numbers" }]}
        lines={[SITE_NAME, "in numbers"]}
        data={
          <span data-od="stats-updated">
            Last updated <time dateTime={date}>{formatDate(st.updatedAt)}</time>
          </span>
        }
      >
        <p className="pg-lead" data-od="stats-lead">
          {statsLead(st)}
        </p>
      </PageHead>
      {t.concerts === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>No concerts to count yet.</p>
        </EmptyNote>
      ) : (
        <>
          {/* The headline figures: a term and its number. */}
          <section className="pg-section pg-stats-totals" aria-labelledby="stats-totals" data-od="stats-totals">
            <SectionTitle id="stats-totals">The totals</SectionTitle>
            <dl className="pg-stats-figures">
              {totals.map((x) => (
                <div key={x.id} className="pg-stats-figure" data-od={`stats-total-${x.id}`}>
                  <dt>{x.href ? <Link href={x.href}>{x.label}</Link> : x.label}</dt>
                  <dd>{x.value}</dd>
                </div>
              ))}
            </dl>
            {/* The same figures as sentences that can be quoted on their own (the lead is the first). */}
            <ul className="pg-stats-facts" data-od="stats-facts">
              {facts.slice(1).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>

          {/* Rankings: official concerts only, as every "best of" list. */}
          <div className="pg-section pg-stats-rankings" data-od="stats-rankings">
            <Ranking
              id="most-watched"
              title={RANKINGS.mostWatched}
              unit="Views on YouTube"
              rows={st.mostWatched.map((c) => ({ href: concertPath(c), name: concertName(c), value: num(c.viewCount) }))}
            />
            {st.mostWatched.length > 0 && (
              <p className="pg-thin" data-od="stats-best">
                <Link href={mostWatchedPath}>The 50 most watched rock concerts</Link> and <Link href="/best">every ranking</Link>.
              </p>
            )}

            {st.decades.length > 0 && (
              <section className="pg-stats-ranking" aria-labelledby="decades" data-od="stats-decades">
                <SectionTitle id="decades" small>
                  {RANKINGS.decades}
                </SectionTitle>
                <table className="pg-stats-table pg-stats-table--decades">
                  <thead>
                    <tr>
                      <th scope="col">Decade</th>
                      <th scope="col">Official concerts</th>
                      <th scope="col">Most watched</th>
                      <th scope="col">Views on YouTube</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.decades.map((d) => (
                      <tr key={d.label} data-od={d === covered ? "stats-most-covered" : undefined}>
                        <td className="pg-stats-name">
                          <Link href={decadePath(d.label)}>The {d.label}</Link>
                        </td>
                        <td className="pg-stats-value">
                          {num(d.concerts)}
                          {d === covered && <span className="pg-stats-flag"> most covered</span>}
                        </td>
                        <td>{d.top ? <Link href={concertPath(d.top)}>{concertName(d.top)}</Link> : null}</td>
                        <td className="pg-stats-value">{d.top ? num(d.top.viewCount) : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <Ranking
              id="bands"
              title={RANKINGS.bands}
              unit="Official concerts"
              rows={st.bands.map((b) => ({ href: bandPath(b), name: b.name, value: num(b.concerts) }))}
            />
            <Ranking
              id="places"
              title={RANKINGS.places}
              unit="Official concerts"
              rows={st.places.map((p) => ({ href: placePath(p), name: p.name, value: num(p.concerts) }))}
            />
            <Ranking
              id="longest"
              title={RANKINGS.longest}
              unit="Length"
              rows={st.longest.map((c) => ({ href: concertPath(c), name: concertName(c), value: lengthWords(c.durationSeconds) }))}
            />
            <Ranking
              id="songs"
              title={RANKINGS.songs}
              unit="Setlists"
              rows={st.songs.map((x) => ({ href: songRowPath(x), name: `${quoted(x.title)} by ${x.band.name}`, value: num(x.versions) }))}
            />
          </div>
        </>
      )}

      <section className="pg-section pg-stats-method" aria-labelledby="stats-method" data-od="stats-method">
        <SectionTitle id="stats-method">How these numbers are made</SectionTitle>
        <p>{STATS_METHOD}</p>
        <p>
          You are welcome to quote these figures with a link to this page. Last updated <time dateTime={date}>{formatDate(st.updatedAt)}</time>; a plain-text copy is at{" "}
          <a href={`${STATS_PATH}.md`}>{`${STATS_PATH}.md`}</a>.
        </p>
      </section>
    </main>
  );
}
