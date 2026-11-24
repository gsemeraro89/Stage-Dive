// Runs before the pages it matches (config.matcher), so those pages can be served ready-made (ISR):
// - "/?genre=..." (old list links on the home page) is sent to /concerts with the same filters.
// - "/artists/<slug>?sort=length" is rewritten to /artists/<slug>/sorted/length (the address stays).
// - Password protection for the admin pages (HTTP Basic auth). Any user name, password = ADMIN_PASSWORD.
//   Without ADMIN_PASSWORD set, the admin pages do not exist (404).
// - AI and search crawlers are counted (src/lib/crawler-hits.ts): in memory, written at most every 5 minutes.
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { countCrawlerHit } from "@/lib/crawler-hits";
import { crawlerOf } from "@/lib/crawlers";

function safeEqual(a: string, b: string): boolean {
  // Compare in constant time so the password cannot be guessed from response times.
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Old links to the list with filters on the home page ("/?genre=metal") now live at /concerts. */
const LIST_PARAMS = ["q", "genre", "artist", "venue", "venueKind", "source", "sort", "page"];
/** Band page orders other than the default (src/app/artists/[slug]/band-page.tsx). */
const BAND_SORTS = ["length", "watched"];

export function proxy(request: NextRequest, event?: NextFetchEvent) {
  const url = request.nextUrl;
  // Which pages AI and search crawlers read (owner, 24 Nov 2026). Counted in memory; a due write runs
  // after the response (waitUntil), never delaying it.
  const bot = crawlerOf(request.headers.get("user-agent"));
  if (bot) {
    const write = countCrawlerHit(bot, url.pathname);
    if (write) event?.waitUntil(write);
  }
  if (url.pathname === "/") {
    if (!LIST_PARAMS.some((k) => url.searchParams.has(k))) return NextResponse.next();
    const to = url.clone();
    to.pathname = "/concerts";
    return NextResponse.redirect(to);
  }
  const band = /^\/artists\/([a-z0-9-]+)$/.exec(url.pathname);
  if (band) {
    const sort = url.searchParams.get("sort");
    if (!sort || !BAND_SORTS.includes(sort)) return NextResponse.next();
    const to = url.clone();
    to.pathname = `/artists/${band[1]}/sorted/${sort}`;
    to.searchParams.delete("sort");
    return NextResponse.rewrite(to);
  }
  // Anything else that is not the admin (e.g. /artists/<slug>.md) goes straight through.
  if (!url.pathname.startsWith("/admin")) return NextResponse.next();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return new NextResponse("Not found", { status: 404 });
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [, given = ""] = atob(header.slice(6)).split(/:(.*)/s);
      if (safeEqual(given, password)) return NextResponse.next();
    } catch {
      // malformed header: ask again
    }
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="STAGEDIVE admin", charset="UTF-8"' },
  });
}

// Every page and file a crawler may read (robots.txt, sitemaps, llms.txt, .md copies, feeds), not Next's
// own assets, the API, icons or the brand book's static files.
export const config = { matcher: ["/((?!_next/|api/|favicon|icon|apple-icon|brandbook/|share-card).*)"] };
