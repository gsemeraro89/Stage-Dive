# STAGEDIVE — project instructions for Claude Code

STAGEDIVE is a free website of full-length rock concerts that are freely watchable on YouTube, organised by band, festival/room, decade, genre and tour, monetised with ads. Concerts play **inside our pages** (YouTube embedded player), never by sending the visitor to YouTube. English UI.

It started on 18 Nov 2026 as a copy of OpenDecks/FullDJSet (`gsemeraro89/opendecks` at `426011f`): same stack, persistent player, collector and refresh jobs; new domain, rules and look.

Read `docs/BRIEF.md` before planning anything, and `docs/SUPPLY-CHECK.md` for what exists on YouTube. The approved brand book is in `design/brandbook/` (open the `.dc.html` boards in a browser). `design/DESIGN.md` and `design/tokens.css` are still the old OpenDecks look until the design step (brief section 5, step 2) replaces them.

## How to work on this repo
- Plan first. For any new step, propose a plan and wait for the owner's approval before writing code.
- Work in the order of `docs/BRIEF.md` section 5, one step at a time. Don't start the next step without the owner's go-ahead.
- Keep the owner informed in plain language: they are a marketer, not a developer. Explain what was built, how to see it, and what they need to do (keys, accounts, decisions). After each step, say in plain words what changed.
- Commit in small steps. Keep the README short and current.
- Never commit secrets. All keys go in `.env` (git-ignored), GitHub repository secrets and Render environment variables. Keep `.env.example` up to date.
- Write tests for the ingestion rules (filters, de-duplication, refresh): they are the core of the product.
- Don't buy anything (domains, plans) and don't create accounts or services without the owner's OK.

## Stack (agreed)
- Next.js (App Router, TypeScript): server-rendered pages for SEO
- PostgreSQL via Prisma
- Hosting: Render (test service `stagedive-test`)
- Styling: Tailwind, driven by the design tokens built from the brand book
- Collector jobs: TypeScript scripts run as scheduled GitHub Actions workflows (free)

## Design is a separate job (owner requirement)
- All visual and creative work is done by the `stagedive-designer` subagent (`.claude/agents/stagedive-designer.md`, Claude Fable 5.2). Delegate to it whenever a task changes what the visitor sees.
- The main agent does not edit `design/`, `src/styles/` or `src/components/ui/`, and does not invent styling. It builds data, logic and unstyled structure, then hands over to the designer.
- The designer does not touch the database, the collector, API routes, player logic, analytics or deployment.
- Ideas go into `IDEAS.md`; nothing is built until the owner approves it.

## Hard rules from YouTube (non-negotiable)
Source: YouTube API Services Terms & Developer Policies (developers.google.com/youtube/terms).
1. Only index videos where the API reports `status.embeddable = true` and `status.privacyStatus = public`, and that are not blocked in ES, IT, GB, US or DE (owner rule). Check status before embedding.
2. Never place ads, overlays or anything else on top of or inside the player. Never modify or hide YouTube branding/controls.
3. Ads may only appear on pages that also carry substantial original content (setlist, write-up, band bio, event info) that would have value without the video (Developer Policies III.G.1.d).
4. Stored YouTube API data must be refreshed or deleted at least every 30 days (III.E.4). The nightly refresh job does it. A video that became private, deleted, non-embeddable or region-blocked is a normal outcome: the concert gets status REMOVED (hidden, YouTube data cleared) and comes back by itself if the video does.
5. Embedded player: minimum 200×200 px; autoplay only when more than half the player is visible; never more than one autoplaying player per page; serve the site over https and set `origin`.
6. Respect API quota (10,000 units/day): read channel upload playlists first (`playlistItems.list`, cheap) and batch `videos.list` (50 IDs per call). `search.list` costs 100 units: use it only inside a fixed budget.
7. Don't use several Google Cloud projects to get around quota. (STAGEDIVE has its own project because it is a separate product, not to add quota to OpenDecks.)

## Product rules
- A concert = one band's full concert or full festival show, at least 40 minutes. No compilations, single songs, documentaries, "best of", half-show phone footage.
- Official, free sources only: festival and broadcaster archives first (Pinkpop Archive, Rock in Rio, Primavera Sound, ARTE Concert), then band and label channels. Fan uploads appear only in the collector report.
- No view threshold. Free filters before any AI; Claude Haiku via the Batch API with prompt caching; no cost cap per run (owner, 19 Nov 2026).
- No home sessions or online livestream shows (owner, 19 Nov 2026); a livestream from a real stage is fine. Audio-only official concerts are fine.
- Dry run with a per-band report, then the owner's OK, then a real run.
- The setlist is a first-class object: every concert page shows it; clicking a song jumps to its time.

## Desktop and mobile, always
Every change must work and feel right on desktop and on a phone (360–400 px): layout, touch targets (48 px), the player, maps and every interactive feature.

## Definition of done for any page
Works on mobile, loads fast (Core Web Vitals green), has a unique title/description, structured data (VideoObject for concerts, MusicGroup for bands), and plays the concert in-page with one click.
