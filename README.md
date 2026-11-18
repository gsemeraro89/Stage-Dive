# FullDJSet (repository: opendecks)

Free electronic DJ sets from YouTube, playable on the page.

- Start with `PRIMA-DI-INIZIARE.md` (owner checklist, Italian) and `PRIMO-PROMPT.md` (first message for Claude Code).
- Project rules: `CLAUDE.md`. Product spec: `docs/BRIEF.md`. Design: `design/DESIGN.md`.
- Designer subagent: `.claude/agents/designer.md` (see `AGENTE-DESIGN.md`).

## Run it locally

Needs Node 22+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL
npx prisma migrate deploy # create the tables
npm run db:seed           # import data/seed-sets.json (safe to re-run)
npm run dev               # http://localhost:3000
```

Tests: `npm test` (database tests run only when `TEST_DATABASE_URL` is set). Type check: `npm run lint`.

## Code map

| Path | What it is |
|---|---|
| `prisma/schema.prisma` | Database tables: sets, artists, venues, genres, settings, channels, set_artists, set_genres, review_queue, plays |
| `prisma/migrations/` | Database changes, applied in order by `prisma migrate deploy` |
| `src/lib/catalogue.ts` | Fixed lists: genres and settings (and how old setting labels map onto them) |
| `src/lib/seed/` | Seed import: `normalize.ts` cleans the JSON, `import.ts` writes it to the database |
| `scripts/seed.ts` | `npm run db:seed` |
| `src/lib/filters.ts` | Home page search, filters and sorting (URL parameters to database query) |
| `src/lib/upnext.ts` | What plays next: same artist first, then shared genres |
| `src/lib/queries.ts` | Every database read used by the pages (only public, embeddable, published sets) |
| `src/lib/thumbnails.ts`, `scripts/thumbnails.ts` | Best available YouTube thumbnail per set (`npm run db:thumbnails`) |
| `src/components/player/` | The single persistent YouTube player: provider, set-page slot, bottom bar |
| `src/components/catalogue/` | Unstyled building blocks: set tile, set list, filter form |
| `src/app/` | Pages: `/`, `/sets/[slug]`, `/artists`, `/artists/[slug]`, `/venues`, `/venues/[slug]`, `/genres`, `/genres/[slug]`, plus `/api/health` and `/api/queue/[youtubeId]` |
| `tests/` | Automated tests (Vitest) |

## How the player works

There is one YouTube player for the whole site, created in the root layout so it survives page changes.
It is positioned over a target box: the player area of the set page when that set is playing, otherwise
the video box in the bottom bar (356×200, YouTube's minimum is 200×200). The iframe is never moved in
the DOM, because that would restart the video. Elements carry `data-od="..."` attributes as styling hooks.

## Collector (phase 3)

Runs on GitHub Actions (free), not on Render:

| Workflow | When | What |
|---|---|---|
| `Collect sets` (`collect.yml`) | daily 08:47 UTC (after YouTube's quota reset), or by hand | Reads the channels in `data/channels.json` plus a few discovery searches, keeps videos that pass the YouTube and product rules, asks Claude what each one is, publishes only confirmed electronic sets. By hand it defaults to a **dry run** (report only). |
| `Refresh YouTube data` (`refresh.yml`) | daily 03:43 UTC | YouTube 30-day rule: updates every set at 25 days, deletes sets that became private, deleted or non-embeddable. |
| `Back up database` (`backup.yml`) | Mondays | `pg_dump` kept as a private download for 30 days. |

How a video gets in (all automatic, no manual approval, owner decision of 12 Nov 2026):
1. YouTube facts: public, embeddable, not made for kids, at least 40 minutes, at least `VIEW_THRESHOLD` views (10M to start).
2. Claude (`src/lib/collector/classify.ts`): a single full set? which artist, venue, genres (our list in `src/lib/catalogue.ts`)?
3. Decision (`src/lib/collector/rules.ts`, `decide`): channels that only post electronic music need a confident "yes" from Claude; mixed channels and fan uploads also need a second independent signal (MusicBrainz genres for the artist, or a genre named in the video's own text). In doubt, the video stays out and is listed in `/admin`.
4. Artists already in the catalogue count as approved (owner rule, 13 Nov 2026): their other full sets come in, with genres from the classifier or, failing that, from their sets on the site. Each run searches YouTube for a few catalogue artists' sets, never-searched artists first (`artists.last_searched_at`). Owner-approved artists not yet in the catalogue (`data/artist-rules.json`): their full sets are accepted on any channel, even when the classifier is unsure; their listed genres are used when the classifier gives none of ours. Run the collector with `reconsider` (button input) or `--reconsider` to look again, for free, at videos kept out earlier.
5. De-duplication: same artist and same venue within a year, or same length within 90 s: one entry, official upload kept, hand-picked seed sets never replaced.

Saving on the classifier (owner request, 12 Nov 2026):
- **Batch API:** videos are classified through Anthropic's Batch API at half price. A run waits up to `BATCH_WAIT_MINUTES` (45) for the answers; unfinished batches are collected by the next run. `--no-batch` (or the `no_batch` button input) classifies straight away at full price.
- **Answers are kept** (`classification_cache`), dry runs included, so the real run after a dry run pays nothing for the same videos. An answer is reused only while the rules are unchanged (`PROMPT_VERSION` fingerprint of model, instructions and answer format) and for at most 30 days.

Every decision is stored for 30 days (`video_decisions`) so a video is not paid for twice; after that it is looked at again.

Scheduled runs publish only when the repository **variable** `COLLECTOR_PUBLISH` is `true`; otherwise they are dry runs. This is the owner's on/off switch.

Repository secrets needed (Settings → Secrets and variables → Actions): `DATABASE_URL` (Render **External** Database URL), `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`.

### Restore a backup

Download the latest `opendecks-db-…` artifact from the "Back up database" workflow, unzip it, then:

```bash
pg_restore --no-owner --no-privileges --clean --if-exists -d "<new External Database URL>" opendecks.dump
```

## Admin

`/admin`, protected by `ADMIN_PASSWORD` (any user name). Shows the last job runs, videos kept out because the collector was unsure (publish or reject), and recently added sets (hide or show).

## Deploy (Render)

Web service (Node, free plan, Frankfurt), auto-deploys from `main`:

- Build command: `npm ci && npm run build`
- Start command: `npm run start:render` (applies database migrations, re-imports the seed, checks thumbnails, starts the app)
- Health check path: `/api/health`
- Environment: `DATABASE_URL` = the Render Postgres **Internal Database URL**, `NODE_VERSION` = `22`, `ADMIN_PASSWORD`, `SITE_SOURCES` (live site: `SEED` for now; demo site `opendecks-test`: empty = everything)
