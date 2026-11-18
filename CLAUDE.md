# FullDJSet — project instructions for Claude Code

FullDJSet (working name until 17 Nov 2026: OpenDecks; the repository and services keep that name) is a website that indexes free-to-watch electronic DJ sets on YouTube, organised by artist, venue/festival, genre and setting. Sets play **inside our pages** (YouTube embedded player), never by sending the visitor to YouTube.

Read `docs/BRIEF.md` before planning anything. The approved design is in `design/` (`DESIGN.md`, `tokens.css`, `reference/*.html`). `reference/prototype.html` is an older prototype: use it only to understand behaviour (filters, artist page logic), never for the look. `data/seed-sets.json` holds the 23 hand-checked seed sets and the NTO artist profile.

## How to work on this repo
- Plan first. For any new phase, propose a plan and wait for approval before writing code.
- Work in the phases listed in `docs/BRIEF.md` (section 7), one at a time. Don't start the next phase without the owner's go-ahead.
- Keep the owner informed in plain language: he is a marketer, not a developer. Explain what was built, how to see it, and what he needs to do (keys, accounts, decisions).
- Never commit secrets. All keys go in `.env` (git-ignored) and in Render environment variables. Keep `.env.example` up to date.
- Write tests for the ingestion rules (filters, de-duplication, refresh) — they are the core of the product.

## Stack (agreed)
- Next.js (App Router, TypeScript) — server-rendered pages for SEO
- PostgreSQL (Render managed Postgres) via Prisma
- Hosting: Render (web service + Postgres + cron jobs). The owner's Render account is connected to Claude.
- Styling: Tailwind, driven by `design/tokens.css` and `design/DESIGN.md` (dark ground, acid accent #C6FF3D, Archivo + IBM Plex Mono, no rounded corners)
- Collector jobs: Node/TypeScript scripts run as scheduled GitHub Actions workflows (owner decision, 12 Nov 2026: free, instead of Render cron jobs)

## Design is a separate job (owner requirement)
- All visual and creative work is done by the `designer` subagent (`.claude/agents/designer.md`), which runs on Claude Fable 5.2. Delegate to it whenever a task changes what the user sees: new pages or components, layout, type, colour, spacing, imagery, states, and visual review.
- The main agent does not edit `design/`, `src/styles/` or `src/components/ui/`, and does not invent styling. It builds data, logic and unstyled structure, then hands over to the designer.
- The designer does not touch the database, the collector, API routes, player logic, analytics or deployment.
- Design and engineering go in separate branches and pull requests (`design/...` and `feat/...`) so the owner can review design on its own.
- `design/DESIGN.md` is the source of truth. Its bans (no rounded blocks, no cards, no gradients) and its text-on-photo legibility rule apply to every page.

## Hard rules from YouTube (non-negotiable)
Source: YouTube API Services Terms & Developer Policies (developers.google.com/youtube/terms).
1. Only index videos where the API reports `status.embeddable = true` and `status.privacyStatus = public`. Check status before embedding.
2. Never place ads, overlays or anything else on top of or inside the player. Never modify or hide YouTube branding/controls.
3. Ads may only appear on pages that also carry substantial original content (tracklist, write-up, artist bio, event info) that would have value without the video (Developer Policies III.G.1.d). Every set page must have this content before ads are switched on.
4. Stored YouTube API data (titles, stats, etc.) must be refreshed or deleted at least every 30 days (III.E.4). Build a refresh job; drop videos that became private, deleted or non-embeddable.
5. Embedded player: minimum 200×200 px; autoplay only when more than half the player is visible; never more than one autoplaying player per page; the player must send a proper HTTP Referer (serve the site over https, set `origin`).
6. Respect API quota: crawl channel upload playlists (`playlistItems.list`, cheap) and batch `videos.list` (50 IDs per call). Avoid `search.list` (expensive) except for occasional discovery.
7. Don't use multiple Google Cloud projects to get around quota.

## Product rules
- A "set" = a full DJ set or live act, normally ≥ 40 minutes. Exclude clips, single tracks, trailers, aftermovies, compilations of several artists, and re-uploads of a set that already exists on an official channel.
- Prefer official channels (artist, festival, venue, Cercle, Boiler Room, HÖR, Mixmag, DJ Mag…). Fan uploads: see the open decision in BRIEF.md.
- Credit collaborations (e.g. "NTO with Sofiane Pamart").
- Language: English UI.

## Desktop and mobile, always (owner rule, 16 Nov 2026)
Every change that is proposed or built must work and feel right on both desktop and mobile: layout, touch targets, gestures, the player, maps and every interactive feature. Check it at phone width (360–400px) as well as desktop before calling it done, and show the owner both.

## Definition of done for any page
Works on mobile, loads fast (Core Web Vitals green), has a unique title/description, structured data (VideoObject for sets, MusicGroup/Person for artists), and plays the set in-page with one click.
