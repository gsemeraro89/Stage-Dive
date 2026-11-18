# STAGEDIVE

A fanzine that plays: full-length rock concerts that are free to watch on YouTube, played on our own pages.
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
| `src/app/` | Pages: `/`, `/concerts/[slug]`, `/artists`, `/venues`, `/genres`, `/decades`, `/tours`, `/map`, `/admin` |
| `src/lib/setlist/` | Setlists from the video description, chapters or comments |
| `src/lib/collector/` | Collector rules, YouTube client, Claude classifier (Haiku lane), MusicBrainz |
| `tests/` | Automated tests (Vitest); `tests/fixtures/seed-concerts.json` is test data only |

## Collector and jobs (GitHub Actions, free)

| Workflow | When | What |
|---|---|---|
| `Collect concerts` (`collect.yml`) | daily 08:47 UTC, or by hand | Reads festival and broadcaster archives first (Pinkpop Archive, Rock in Rio, Primavera Sound, ARTE Concert), then band channels; free filters, then Claude. By hand it defaults to a **dry run**. |
| `Refresh YouTube data` (`refresh.yml`) | daily 03:43 UTC | 30-day rule. A video that is gone, private, not embeddable or region-blocked hides its concert (status REMOVED); it comes back if the video does. |
| `Back up database` (`backup.yml`) | Mondays | `pg_dump` kept as a private download for 30 days. |
| `Artist profiles`, `Similar artists`, `Setlist coverage` | by hand / weekly | Bios (Wikimedia/MusicBrainz), similar bands (ListenBrainz), setlist report. |

Rules (brief section 2): one band's full concert or festival show, 40+ minutes; official sources only (fan uploads only in the report); no view threshold; Haiku via the Batch API, at most $3 per run; The Rolling Stones excluded for now (`data/artist-rules.json`).

Scheduled runs publish only when the repository **variable** `COLLECTOR_PUBLISH` is `true`; otherwise they are dry runs.

## Secrets and settings

GitHub → Settings → Secrets and variables → Actions:
- Secrets: `DATABASE_URL` (the database's **External** URL), `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`
- Variables: `COLLECTOR_PUBLISH` (`false` until the owner OKs a real run), `CLAUDE_BUDGET_USD` (`3`), `YOUTUBE_UNIT_BUDGET` (`8000`)

## Deploy (Render, test service `stagedive-test`)

Web service (Node, Frankfurt), auto-deploys from `main`:
- Build command: `npm ci && npm run build`
- Start command: `npm run start:render` (migrations, seed import, thumbnails, then the app)
- Health check path: `/api/health`
- Environment: `DATABASE_URL` (Internal URL), `NODE_VERSION=22`, `ADMIN_PASSWORD`, `SITE_SOURCES` (empty on the test service = show everything)

## Admin

`/admin`, protected by `ADMIN_PASSWORD` (any user name): last job runs, videos the collector was unsure about (publish or reject), recently added concerts (hide or show).
