# STAGEDIVE

A fanzine that plays: full rock concerts, the whole show, played on our own pages (YouTube embeds).
Started on 18 Nov 2026 from a copy of OpenDecks/FullDJSet (`gsemeraro89/opendecks` at `426011f`).

- Brief: `docs/BRIEF.md` (order of work in section 5). Supply check: `docs/SUPPLY-CHECK.md`.
- Project rules for Claude Code: `CLAUDE.md`. Brand book: `design/brandbook/` (open the `.dc.html` boards in a browser).
- Designer subagent: `.claude/agents/stagedive-designer.md` (Claude Fable 5.2).

## Run it locally

Needs Node 22+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL (and YOUTUBE_API_KEY for the seed check)
npx prisma migrate deploy # create the tables
npm run seed-check        # check data/seed-concerts.csv with YouTube -> data/seed-concerts.json + report
npm run db:seed           # import data/seed-concerts.json (safe to re-run)
npm run dev               # http://localhost:3000
```

Tests: `npm test` (database tests run only when `TEST_DATABASE_URL` is set). Type check: `npm run lint`.

## Code map

| Path | What it is |
|---|---|
| `prisma/schema.prisma` | Tables: concerts, artists (bands), venues, venue_kinds, genres, tours, channels, concert_artists, concert_genres, plays, collector tables |
| `src/lib/catalogue.ts` | Fixed lists: the 13 genres, venue kinds (Festival / Room / Livestream / TV-Studio), decades |
| `data/seed-concerts.csv` | The owner's hand-picked candidates |
| `src/lib/seed/check.ts`, `scripts/seed-check.ts` | Seed check against YouTube (public, embeddable, 40+ min, not blocked in ES/IT/GB/US/DE, official uploader) |
| `src/lib/seed/`, `scripts/seed.ts` | Seed import (`npm run db:seed`) |
| `src/lib/queries.ts` | Every database read used by the pages (only public, embeddable, published concerts) |
| `src/components/player/` | The single persistent YouTube player: provider, concert-page slot, docked bar |
| `src/app/` | Pages: `/`, `/concerts/[slug]`, `/artists`, `/venues`, `/venues/[slug]/[year]` (festival years), `/genres`, `/decades`, `/tours`, `/best`, `/best/[slug]` (most watched rankings), `/hd` (full concerts in HD), `/songs/[band]`, `/songs/[band]/[song]`, `/map`, `/admin` |
| `src/lib/venue-years.ts`, `best.ts`, `hd.ts`, `entity-links.ts`, `live-albums.ts` | Festival and venue years ("Pinkpop 1995"), "best of" rankings by views, concerts in HD, band links to MusicBrainz / Wikidata / Wikipedia, bands' live albums (MusicBrainz) |
| `src/lib/songs.ts`, `song-title.ts`, `band-stats.ts` | Songs played live (a page per song, every live version, worked out from the setlists) and the band's live statistics |
| `src/lib/setlist/` | Setlists from the video description, chapters or comments |
| `src/lib/collector/` | Collector rules, YouTube client, Claude classifier (Haiku lane), MusicBrainz |
| `src/lib/seo.ts`, `structured-data.ts`, `answers.ts`, `concert-notes.ts`, `llms.ts`, `sitemap.ts`, `robots.ts`, `indexnow.ts` | Search and AI assistants (CLAUDE.md "SEO, AEO and AI search"): what is indexed, titles, schema.org, answer-first leads, FAQ, concert notes, `/llms.txt`, `.md` copies, sitemap, IndexNow |
| `src/lib/news/`, `scripts/news.ts`, `data/news-feeds.json` | News: press feeds, matcher (our bands and festivals only), Claude Haiku writer + fact check, pages `/news`, `/news/[slug]`, `/news/feed.xml`, `/news-sitemap.xml`, admin queue `/admin/news` |
| `tests/` | Automated tests (Vitest); `tests/fixtures/seed-concerts.json` is test data only |

## Collector and jobs (GitHub Actions, free)

| Workflow | When | What |
|---|---|---|
| `Collect concerts` (`collect.yml`) | by hand (daily schedule paused until step 6) | Reads festival and broadcaster archives first (Pinkpop Archive, Rock in Rio, Primavera Sound, ARTE Concert), then band channels; free filters, then Claude. By hand it defaults to a **dry run**. |
| `Refresh YouTube data` (`refresh.yml`) | daily 03:43 UTC | 30-day rule. A video that is gone, private, not embeddable or region-blocked hides its concert (status REMOVED); it comes back if the video does. Also reads HD/SD for concerts that have none yet (the `/hd` page). Then thumbnail sizes for new concerts and IndexNow. |
| `Back up database` (`backup.yml`) | Mondays | `pg_dump` kept as a private download for 30 days. |
| `Artist profiles`, `Similar artists`, `Setlist coverage` | by hand / weekly | Bios (Wikimedia/MusicBrainz), similar bands (ListenBrainz), setlist report. |
| `Band photos` (`band-photos.yml`) | monthly / by hand | Commons photos, then entity links (`npm run entity-links`: MusicBrainz, Wikidata, English Wikipedia for the band pages, then each band's live albums from MusicBrainz; also after new artists in `collect.yml`). |

Rules (brief section 2): one band's full concert or festival show, 40+ minutes; official sources only (fan uploads only in the report); no view threshold; Haiku via the Batch API, no cost cap (owner, 19 Nov 2026); no home sessions or online livestream shows.

Classifier (owner, 20 Nov 2026): the collector asks Claude Haiku (Batch API, cached instructions; up to 1,500 videos a run), Claude Opus only when Haiku is unsure (below 0.75 or UNCERTAIN, official sources only), and Haiku's write-up pass for every accepted concert; a concert waits for its write-up rather than going up without one. Answers are stored and shared with the per-artist lane. Genres include trip hop, electronic rock / big beat and art pop / experimental; DJ sets never. To look again at videos kept out as not rock or uncertain after a rule change: `Collect concerts` with `reconsider` on (`reconsider_scope` official by default: fan uploads are not asked again).

Scheduled runs publish only when the repository **variable** `COLLECTOR_PUBLISH` is `true`; otherwise they are dry runs.

Bootlegs (owner, 20 Nov 2026): professionally filmed, complete shows shared by fan channels, for the bands of `data/artist-rules.json`, one per concert; an official version always wins (the bootleg hides itself, and comes back if the official one goes). `Collect concerts` with `bootleg_publish` on: `dry_run` on = report only, off = stored. Fan channels and playlists read in full: `data/fan-channels.json`. Rules and display: `src/lib/collector/bootleg.ts`, `bootleg-publish.ts`, `src/lib/bootlegs.ts`. Ads on bootleg pages stay off until `ADS_ON_BOOTLEGS=true` (after AdSense approval); any ad slot must call `adsAllowed()` in `src/lib/ads.ts`.

News (owner, 21 Nov 2026): after each collector run (`collect.yml`, follows `dry_run`) the news job reads the press feeds in `data/news-feeds.json`, keeps only items naming one of our bands or festivals (free, strict matcher; short names like "Muse" or "Tool" need their capitals and a music word nearby), and has Claude Haiku write a short article in our own words with the source named and linked, then fact-check it. Articles that pass go live; the rest wait in `/admin/news`. Budget: repository variable `NEWS_BUDGET_USD` (default $5 a month). By hand: `Collect concerts` with `admin_ops` = `news:dry` (lists what would be written, no cost), then `news`; `news-feeds` checks which feeds answer. `NEWS_ENABLED=false` skips the step. `news.yml` runs it alone (daily schedule off; how to switch it on is at the top of the file).

## Secrets and settings

GitHub → Settings → Secrets and variables → Actions:
- Secrets: `DATABASE_URL` (Neon production branch), `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY` (needed from step 6, the collector)
- Variables: `NEWS_BUDGET_USD` (news, default `5` dollars a month), `COLLECTOR_PUBLISH` (`false` until the owner OKs a real run), `YOUTUBE_UNIT_BUDGET` (`8000`), `LIVE_SITE_URL` (the live domain, `https://fullconcert.live`, once the live service is up: IndexNow announces new pages there; nothing is sent while its robots.txt is closed)

### Restore a backup

Download the latest `stagedive-db-…` artifact from the "Back up database" workflow, unzip it, then:

```bash
pg_restore --no-owner --no-privileges --clean --if-exists -d "<new database URL>" stagedive.dump
```

## Deploy (Render, test service `stagedive-test`)

Web service (Node, Frankfurt), auto-deploys from `main`:
- Build command: `npm ci && npm run build` (Prisma client, migrations, then the Next build; the build reads the database)
- Start command: `npm run start:render` (migrations, then the app; fast cold start). After changing `data/seed-concerts.json`, run `npm run db:seed` and `npm run db:thumbnails` by hand.
- Health check path: `/api/health`
- Environment: `DATABASE_URL` (the Neon production branch, Frankfurt), `NODE_VERSION=22`; `ADMIN_PASSWORD` only when the admin page is wanted (without it `/admin` does not exist); `SITE_SOURCES` empty = show everything
- Live at https://stagedive-test.onrender.com (closed to search engines: `SITE_INDEXABLE` is not set)

## Search engines and AI assistants

Only the future live service sets `SITE_INDEXABLE=true` and `SITE_URL=https://fullconcert.live` (the domain the owner bought on 20 Nov 2026). Then robots.txt opens (every AI crawler named), `/sitemap.xml` fills with the pages worth indexing, and pages drop their `noindex`. Everything is built from the database: `/llms.txt`, `/llms-full.txt`, `/concerts/<slug>.md`, `/artists/<slug>.md`, `/venues/<slug>/<year>.md`, `/best/<slug>.md`, `/hd.md`, titles, answers, FAQ and structured data update by themselves. `/concerts/<slug>?t=315` starts a concert at 5:15 (Google "key moments"). IndexNow key: `/indexnow-key.txt`.

Keyword research (owner, 20 Nov 2026): `Collect concerts` with `admin_ops` = `keyword-research` (read-only, no quota, no Claude; about an hour, at most two). It asks Google and Bing search suggestions about every band, festival and edition, venue, genre, decade, tour and top song, plus the head terms around "full concert", and reports each phrase with its score, intent and the page that should rank for it, or the missing page type (`reports/keywords-<date>.md`, and the top 300 phrases, gaps and counts at the end of the job log). Locally: `npm run keywords -- --plan`. The target phrases every page title carries are in `src/lib/keyword-targets.ts`.

Tours (owner, 21 Nov 2026): the collector links each new concert to the main band's own tour when the video's title or description names it (`src/lib/collector/tours.ts`: a regex first, Claude Haiku only when unsure; festival tours like Warped Tour and other bands' tours never count). For concerts already listed: `admin_ops` = `backfill-tours` (or `backfill-tours:500` for the first 500; options `limit=`, `wait=` minutes, `no-batch`). It re-reads title and description (1 YouTube unit per 50 concerts), asks Haiku through the half-price Batch API only for unsure ones (well under $1 for thousands), and never looks at a settled concert again. Tour pages become indexed from two concerts.

Bands people search for that are not on the site (owner, 21 Nov 2026): each `keyword-research` run also ranks them (the last lines of its log: `MISSING_BAND<TAB>score<TAB>phrases<TAB>name`, top 300) and stores the list (table `keyword_missing_bands`). Then `admin_ops` = `missing-bands-check:top=40` is a dry run for the 40 best: MusicBrainz identity, only bands whose genres are ours (no pop, hip hop, country, jazz), then the per-artist lane for them (one YouTube search each, 100 units; Claude Haiku on long official videos, write-ups included), ending with what would be published per band (`MISSING_BAND_RESULT`, `MISSING_BAND_CONCERT`). After the owner's OK: `missing-bands-publish:top=40`, or `missing-bands-publish:names=Band A|Band B`; it prints the lines to add to `data/artist-rules.json` to keep following them.

## Admin

`/admin`, protected by `ADMIN_PASSWORD` (any user name): last job runs, videos the collector was unsure about (publish or reject), recently added concerts (hide or show).
