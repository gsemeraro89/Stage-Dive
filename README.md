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
| `src/app/` | Pages: `/`, `/concerts/[slug]`, `/artists`, `/venues`, `/venues/[slug]/[year]` (festival years), `/genres`, `/decades`, `/tours`, `/best`, `/best/[slug]` (most watched rankings), `/songs/[band]`, `/songs/[band]/[song]`, `/map`, `/admin` |
| `src/lib/venue-years.ts`, `best.ts`, `entity-links.ts` | Festival and venue years ("Pinkpop 1995"), "best of" rankings by views, band links to MusicBrainz / Wikidata / Wikipedia |
| `src/lib/songs.ts`, `song-title.ts`, `band-stats.ts` | Songs played live (a page per song, every live version, worked out from the setlists) and the band's live statistics |
| `src/lib/setlist/` | Setlists from the video description, chapters or comments |
| `src/lib/collector/` | Collector rules, YouTube client, Claude classifier (Haiku lane), MusicBrainz |
| `src/lib/seo.ts`, `structured-data.ts`, `answers.ts`, `concert-notes.ts`, `llms.ts`, `sitemap.ts`, `robots.ts`, `indexnow.ts` | Search and AI assistants (CLAUDE.md "SEO, AEO and AI search"): what is indexed, titles, schema.org, answer-first leads, FAQ, concert notes, `/llms.txt`, `.md` copies, sitemap, IndexNow |
| `tests/` | Automated tests (Vitest); `tests/fixtures/seed-concerts.json` is test data only |

## Collector and jobs (GitHub Actions, free)

| Workflow | When | What |
|---|---|---|
| `Collect concerts` (`collect.yml`) | by hand (daily schedule paused until step 6) | Reads festival and broadcaster archives first (Pinkpop Archive, Rock in Rio, Primavera Sound, ARTE Concert), then band channels; free filters, then Claude. By hand it defaults to a **dry run**. |
| `Refresh YouTube data` (`refresh.yml`) | daily 03:43 UTC | 30-day rule. A video that is gone, private, not embeddable or region-blocked hides its concert (status REMOVED); it comes back if the video does. Then thumbnail sizes for new concerts and IndexNow. |
| `Back up database` (`backup.yml`) | Mondays | `pg_dump` kept as a private download for 30 days. |
| `Artist profiles`, `Similar artists`, `Setlist coverage` | by hand / weekly | Bios (Wikimedia/MusicBrainz), similar bands (ListenBrainz), setlist report. |
| `Band photos` (`band-photos.yml`) | monthly / by hand | Commons photos, then entity links (`npm run entity-links`: MusicBrainz, Wikidata, English Wikipedia for the band pages; also after new artists in `collect.yml`). |

Rules (brief section 2): one band's full concert or festival show, 40+ minutes; official sources only (fan uploads only in the report); no view threshold; Haiku via the Batch API, no cost cap (owner, 19 Nov 2026); no home sessions or online livestream shows.

Classifier (owner, 20 Nov 2026): the collector asks Claude Haiku (Batch API, cached instructions; up to 1,500 videos a run), Claude Opus only when Haiku is unsure (below 0.75 or UNCERTAIN, official sources only), and Haiku's write-up pass for every accepted concert; a concert waits for its write-up rather than going up without one. Answers are stored and shared with the per-artist lane. Genres include trip hop, electronic rock / big beat and art pop / experimental; DJ sets never. To look again at videos kept out as not rock or uncertain after a rule change: `Collect concerts` with `reconsider` on (`reconsider_scope` official by default: fan uploads are not asked again).

Scheduled runs publish only when the repository **variable** `COLLECTOR_PUBLISH` is `true`; otherwise they are dry runs.

Bootlegs (owner, 20 Nov 2026): professionally filmed, complete shows shared by fan channels, for the bands of `data/artist-rules.json`, one per concert; an official version always wins (the bootleg hides itself, and comes back if the official one goes). `Collect concerts` with `bootleg_publish` on: `dry_run` on = report only, off = stored. Fan channels and playlists read in full: `data/fan-channels.json`. Rules and display: `src/lib/collector/bootleg.ts`, `bootleg-publish.ts`, `src/lib/bootlegs.ts`. Ads on bootleg pages stay off until `ADS_ON_BOOTLEGS=true` (after AdSense approval); any ad slot must call `adsAllowed()` in `src/lib/ads.ts`.

## Secrets and settings

GitHub → Settings → Secrets and variables → Actions:
- Secrets: `DATABASE_URL` (Neon production branch), `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY` (needed from step 6, the collector)
- Variables: `COLLECTOR_PUBLISH` (`false` until the owner OKs a real run), `YOUTUBE_UNIT_BUDGET` (`8000`), `LIVE_SITE_URL` (the live domain, once there is one: IndexNow announces new pages there; nothing is sent while its robots.txt is closed)

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

Only the future live service sets `SITE_INDEXABLE=true` and `SITE_URL=https://<final domain>`. Then robots.txt opens (every AI crawler named), `/sitemap.xml` fills with the pages worth indexing, and pages drop their `noindex`. Everything is built from the database: `/llms.txt`, `/llms-full.txt`, `/concerts/<slug>.md`, `/artists/<slug>.md`, `/venues/<slug>/<year>.md`, `/best/<slug>.md`, titles, answers, FAQ and structured data update by themselves. `/concerts/<slug>?t=315` starts a concert at 5:15 (Google "key moments"). IndexNow key: `/indexnow-key.txt`.

## Admin

`/admin`, protected by `ADMIN_PASSWORD` (any user name): last job runs, videos the collector was unsure about (publish or reject), recently added concerts (hide or show).
