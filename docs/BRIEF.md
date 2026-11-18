# FullDJSet — product brief (v1, 11 Nov 2026)

> **Name (owner, 17 Nov 2026): the site is called FullDJSet** (logo FULL + DJSET in acid). OpenDecks was the working name; it stays in the repository name, service names, file names and the backup artifacts, which are not seen by visitors.

Owner: Giuseppe Semeraro (Barcelona). Background: performance marketing. Builds with Claude Code.

## 1. The idea
One place to find every free, full-length electronic DJ set on YouTube, searchable by DJ, festival/venue, genre and setting, and watchable on our pages. Revenue from direct festival/promoter deals, display ads and sponsorships (section 6).

## 2. Who it's for
Electronic music fans (melodic techno, house, techno, progressive…) who watch long sets, often in the background while working. They want: find sets by their favourite artists, discover similar ones, and keep music playing without hunting on YouTube.

## 3. MVP scope

### Pages
| Page | URL | Must have |
|---|---|---|
| Home | `/` | Hero, featured artist, filters (genre, DJ, venue/festival, setting), search, sort (newest, most viewed, longest, shortest), set grid |
| Set | `/sets/[slug]` | Embedded player (one click to play), title, artist link, venue, location, length, views, upload date, channel, genre tags, original write-up, tracklist (if available), "More from artist", "You might also like" |
| Artist | `/artists/[slug]` | Hero with the giant name, stats (sets, hours, total views, years on YouTube, countries), bio, **Latest uploads** first, then **Most watched** (all-time; the Trending view was dropped on 12 Nov 2026), **Upcoming shows** (section 4.3), partner slot, every set by year, similar artists, Follow button |
| Venue/Festival | `/venues/[slug]` | All sets from that venue/festival |
| Genre | `/genres/[slug]` | All sets in that genre |
| News | `/news`, `/news/[slug]` | Short original news items about artists, festivals and the scene, each with a link to its source (section 4.4) |

The approved design is in `design/` (see `design/DESIGN.md` and `design/reference/home.html`, `artist.html`, `set.html`). `reference/prototype.html` is an older prototype, kept only as a behaviour reference.

### Player behaviour (key feature)
- A thumbnail or title opens the set page; one click on the page's play button plays the set there (YouTube IFrame Player API). Nothing starts by itself (owner, 16 Nov 2026).
- The bottom bar has a "Mini player" button next to the video: the bar shrinks to a draggable window with only the video (≥ 200×200). On the set page the bar's X only hides the bar; elsewhere it closes the player.
- A sticky mini-player keeps playing while the visitor browses other pages (needs client-side navigation that keeps the player mounted, e.g. a persistent player in the root layout).
- When a set ends, auto-play the next one: the same artist's other sets first, then related sets. Show "Up next".
- "Open on YouTube" small link on the set page.
- Respect the autoplay rules in CLAUDE.md.

### Out of scope for MVP
User accounts, comments, offline lists, mobile app, payments. Follow button can start as an email capture (newsletter provider) rather than accounts.

## 4. Catalogue: where sets come from

### Collector (automated)
1. Seed channel list (owner to confirm and extend): Cercle, Boiler Room, HÖR Berlin, Mixmag, DJ Mag, Monegros Desert Festival, Tomorrowland, Awakenings, Afterlife, Spectra, plus official channels of artists added over time.
2. For each channel: read the uploads playlist (`playlistItems.list`), then `videos.list` in batches of 50 for `contentDetails`, `statistics`, `status`, `snippet`.
3. Keep a video if: duration ≥ 40 min, views ≥ VIEW_THRESHOLD (start at 200,000; configurable), `embeddable = true`, `privacyStatus = public`, not "made for kids".
4. Classify with an LLM (Claude via the Anthropic API): is this a single full set? Artist(s), collaborators, venue/festival, city, country, setting (Festival / Club / Special location / Studio-Session / Livestream), genres from our fixed list (section 4.2), and a short original write-up. Low-confidence items go to a review queue.
5. De-duplicate: same artist + same event = one entry; keep the official upload.
6. Refresh job every ≤ 30 days (YouTube rule): update stats, remove anything no longer public/embeddable.
7. Admin page (password-protected) to approve/reject review-queue items and edit metadata.

Expected size at launch: several thousand sets (exact number unknown until the first crawl).

### 4.1 Seed data
`data/seed-sets.json` contains 23 hand-checked sets (owner's 10 recently watched sets + the full NTO catalogue of 14) and the NTO artist profile. Import these first; they are the test fixtures for the UI.

### 4.2 Genre list (owner decision, 12 Nov 2026: these 9 only, for now)
Techno, Melodic Techno, Melodic House, Progressive House, Progressive, Deep House, Tech House, Afro House, Electronica. Live Act is an attribute, not a genre. Artist-only genres (used only for artists the owner approved by name, never offered to the classifier): Big Room / EDM, Trance, Nu Disco, Bass, and Hard Techno (17 Nov 2026, see 4.9).

Taken off the original list: Hard Techno, Psytrance, House, Organic House, Disco, Drum & Bass, Trance, Neo-Classical. **Artist-only genres (owner, 16 Nov 2026):** Big Room / EDM, Trance, Nu Disco, Bass are used only for artists the owner approved by name in `data/artist-rules.json` (Steve Aoki, Dimitri Vegas & Like Mike, 3 Are Legend, Swedish House Mafia, Afrojack, NERVO, Martin Garrix, Marshmello, Alesso, Axwell Λ Ingrosso → Big Room / EDM; Armin van Buuren → Trance; Purple Disco Machine, Folamour → Nu Disco; Skrillex → Bass). The classifier is never offered them, so other mainstage EDM (Alok, Timmy Trumpet, Vini Vici…) stays out. New sets by these artists come in automatically. Seed sets keep their other genres (Folamour's set has none left). The collector leaves out sets that fit only these.

## 5. SEO and content
- Server-rendered pages, clean URLs, sitemap.xml, robots.txt, canonical tags.
- Structured data: VideoObject on set pages, MusicGroup/Person on artist pages, BreadcrumbList.
- Every set page needs original text (write-up + tracklist where possible). This is required by YouTube's rules before showing ads, and helps Google ranking.

## 6. Monetization (design for it, switch on later)
1. **Direct festival/promoter deals (main earner):** tracked links/discount codes per festival, paid placements on lineup artists' pages ("See NTO live at X"). Needs: a "sponsored placement" slot on artist and set pages, click tracking per partner.
2. **Display ads:** ad slots as in the prototype (leaderboard, 300×250 sidebar, in-feed). Never on or over the player. Start with Google AdSense; move to a premium network as traffic grows.
3. **Email list:** Follow button → newsletter signup tagged by artist. Sponsors buy newsletter slots.
4. **Small extras:** ticket affiliate links, track/gear links.
5. **Analytics from day one:** page views and play events per set, per artist and per visitor country (privacy-friendly analytics + our own `plays` table). These numbers are what we sell to festivals.

### 6.1 Early monetization plan (research 13 Nov 2026; owner works alone, no partnerships yet)
Findings: comparable sites earn from brands/sponsors, B2B data for labels (1001Tracklists' 1001Trackstats, WhoSampled data licensing), ticketing/promoter boosts (RA, Bandsintown), not from embeds (embedders get no YouTube ad share). Beatport has no public affiliate program; Apple's is invite-only; Spotify export needs 250k MAU.
- **Months 0–3:** (1) email list from day one (weekly "sets for deep work"); (2) ticket affiliates on artist/festival pages (Skiddle, Fever, Ticketmaster) + Stay22 hotels on festival pages; (3) per-track buy/stream links (Qobuz on Awin, 10%); (4) DJ/production affiliates inside original guides (Native Instruments, Point Blank, DJ.Studio, MyMP3Pool; Plugin Boutique later); (5) "Submit your set": free, with a paid fast-track review (€5–15, never a guaranteed listing, clearly labelled); (6) hand-sold "presented by" sponsorship of one genre page + newsletter (€100–300/month) to DJ schools/plugin makers; (7) a support link (Ko-fi). AdSense waits until set pages have write-ups and there is traffic.
- **Months 3–12:** Mediavine Journey (~10k sessions) then Raptive; premium "Crate" tier €3–5/month that never gates video (track ID alerts, Rekordbox/Serato/CSV export, crates, ad-free) after a waitlist test; newsletter money (SparkLoop at 1k+, sponsors at 5k+); festival/promoter sponsorship packages and paid listing boosts.
- **Compliance:** never sell anything on or around the player; no paywall on sets; a "DJ support" report for labels must be built on OpenDecks' own tracklist data (DJ/label submissions, verified edits), not on YouTube descriptions or view counts (YouTube bans derived/aggregated API Data products; to confirm on the policy page). No events, merch with artist/festival marks, or NFTs for now.

## 7. Build phases (one at a time, owner approves each)
1. **Foundation:** repo, Next.js app, database schema (sets, artists, venues, genres, channels, set_artists, review_queue, plays), seed import from `data/seed-sets.json`, deploy to Render. Result: live URL showing the 23 seed sets.
2. **Pages + player**, in two tracks:
   - 2a (main agent, Opus): data loading, routes, unstyled page structure, persistent player logic + auto-play next.
   - 2b (`designer` subagent, Fable 5.2): build the UI components and style every page to match `design/`. Venue and genre pages have no approved mockup yet: the designer proposes them first.
   Result: you can browse and listen without leaving the site, and it looks like the approved design.
3. **Collector:** YouTube crawler, filters, LLM classification, de-duplication, review queue, admin page, 30-day refresh cron. Result: catalogue grows automatically.
4. **Recommendations + Map** (section 4.6, owner decision 13 Nov 2026: before Upcoming shows): similarity job, "You might also like" on artist pages and in the player, then the `/map` page. Result: visitors always have a next artist to discover.
5. **Upcoming shows** (section 4.3): coverage test first, then events table, sync job, "Upcoming shows" on artist pages, tracked ticket links. Europe first. Result: every artist page shows where to see the artist live and where to buy.
6. **News** (section 4.4): source list, drafting job, approval in the admin page, `/news` pages. Result: a news section the owner runs in a few minutes a day.
7. **SEO + content:** structured data, sitemap, write-ups, tracklists.
8. **Monetization + analytics:** ad slots wired to AdSense (once content rule is met), sponsored placements, newsletter signup, analytics dashboards.
9. **Launch:** custom domain, performance pass, legal pages (privacy, cookies/consent for EU visitors, terms).

### 4.5 Collector decisions (owner, 12 Nov 2026)
- View threshold at launch: **10,000,000** (configurable).
- Fan uploads: **allowed**, but never a re-upload of a set that exists on an official channel; the official upload always wins.
- Mainstage EDM (big room, electro house, festival EDM, hardstyle; e.g. Martin Garrix, Hardwell, Timmy Trumpet) is **out**, even when it is played at an electronic festival.
- Genres: only the 9 in section 4.2 (owner decision, 12 Nov 2026). A set that fits none stays out.
- **No manual approval of artists or videos.** A video is published only when the checks agree (Claude, plus MusicBrainz or the video's own text on mixed channels and for fan uploads); in doubt it stays out and is listed in the admin page.
- **Owner-approved artists** (13 Nov 2026, `data/artist-rules.json`): Fred again.., Honey Dijon, The Martinez Brothers, RÜFÜS DU SOL, Yousuke Yukimatsu, Fatboy Slim, Above & Beyond (and Keinemusik; Peggy Gou added 13 Nov) belong in the catalogue; their full sets are accepted even when the classifier is unsure.
- **Catalogue artists are approved** (13 Nov 2026): once an artist is in the catalogue, all their other full sets above the view threshold come in. Each artist is searched on YouTube for their other sets, new artists first.
- **Channel list extended** (13 Nov 2026) to 33 channels: festivals (Time Warp, DGTL, Dekmantel, Kappa FuturFestival, Sónar, Movement, EXIT, ADE), Ibiza and clubs (Hï, Ushuaïa, Pacha, Amnesia, Circoloco, elrow, Music On), labels and events (Afterlife, Anjunadeep, Defected, Diynamic, Keinemusik, Paradise, Drumcode), media (Resident Advisor, Be-At.TV). New channels are looked up 8 per run to stay inside the YouTube quota.
- **Threshold to 5,000,000** (owner, 13 Nov 2026): once the remaining channels are read (14 Nov) and the owner has seen the results, the view threshold drops from 10M to 5M. **No new channels**: the same channel list is used, but nothing is re-read from the start. From 14 Nov the collector remembers every long video (≥ 40 min) kept out only by things that can change (views), and looks at those again for 1 YouTube unit per 50 videos; each lower threshold (5M, then lower) costs almost nothing. Titles that say trailer/aftermovie/interview/documentary are left out without asking Claude, and clear verdicts are kept longer (not a set: 1 year; not our genres: 6 months) so Claude is not paid twice. The channels read before 14 Nov are re-read once (--recrawl) to fill the list. With 5M, artist searches run at 30–40 a day for 1–2 days (all catalogue artists, fan uploads included), then back to 10 a day. **Done 16 Nov 2026:** owner go-ahead; the workflow default is now 5,000,000 (scheduled runs use it once this is on main).
- Scheduled jobs run on **GitHub Actions** (free) instead of Render cron jobs. Database stays on the free Render plan for now, with a weekly backup.

- **Artist bios, cheaper** (owner, 13 Nov 2026): origin and birth year come from MusicBrainz first (free); Claude Sonnet 5.5 (cheaper than the classifier's Opus) writes the short bio from those facts without searching the web, and searches (at most 2) only when MusicBrainz does not know the artist well enough. A bio is written once per artist.

- **Guests** (owner, 13 Nov 2026): an artist credited only as a guest ("with") never gets a page from someone else's set, however well known (MEUTE on an NTO livestream is NTO's set). A page exists only for artists with a set of their own on the site. A guest's name stays as plain text in the set's credits (no link) and is left out of the artist lists, the map and suggestions; the page appears by itself when a set of their own comes in.

- **Artist pictures** (owner, 13 Nov 2026): the set thumbnail is always the first choice (the most engaging picture), shown black-and-white with colour on hover, name and count under the picture. The avatar of the artist's official YouTube channel (stored, re-checked every 25 days) is only a fallback. Among an artist's sets, Claude Haiku picks once the thumbnail that shows a person with the least printed text (asked again only when the artist's sets change); when every thumbnail is only graphics, the channel avatar is shown. A cover must show the artist: only the artist's own sets are candidates when they have any (a b2b thumbnail may show the other DJ), and an artist with only shared sets never reuses a thumbnail another artist already shows (their channel photo is used instead). The owner can override the pick (cover_locked); an admin control for that comes later.

- **Festivals section** (owner, 13 Nov 2026): the menu entry and index are "Festivals" only. The index lists places with at least one set in the Festival setting; clubs and other venues keep their page (reached from their sets) but are not listed there.

### 4.6 Recommendations and Map (owner, 13 Nov 2026)
- **"You might also like"** while listening and on artist pages: 3–4 similar artists, each with one suggested set that can be queued ("Play next") without stopping the current one. Never on top of the player.
- **Map** page (`/map`, in the main menu; a search box on the home links to it): type an artist, similar artists sit around it, closer means more similar. On phones it becomes a ranked list. Only our 9 genres.
- Each suggested artist shows: picture, origin, birth year, style, genres, number of sets, most watched set (one-click play), latest set.
- **No "why" is shown**, and no similarity label: users trust the algorithm. The score stays internal.
- Signals: shared genres (rarer genres weigh more), same label or collective, same venues/festivals, collaborations and b2b, Last.fm and ListenBrainz "similar artists" (free), and later our own plays (who listens to X also listens to Y). Computed weekly by a GitHub Actions job and stored.
- Design choices (owner, 13 Nov 2026): the player bar opens upward into a "You might also like" sheet (never over the video); the set page and the artist page ("If you like", first four as full rows, the rest as squares) use the same artist rows; phone map list unnumbered; no explanatory line on the map; home search box ("If you like ___") after the Artists squares. Map look: the owner wants to compare the typographic and the picture options, plus any other good idea, before choosing.
- Only artists with at least one set on the site are suggested, **for now**. Later idea: also show artists we don't have sets for yet.

### 4.7 Tracklist decisions (owner, 13 Nov 2026)
- Tracklists come from the **video description** first, then the **most relevant comments** (a comment by the uploading channel first, then the most liked, then the most complete). Same reading rules for both (`src/lib/tracklist/`); texts the rules cannot read may be handed to Claude, and its answer must pass the same checks.
- **"ID" tracks are shown** as "ID" (hover text: "Unreleased or unidentified track").
- Not used: 1001Tracklists (no public API; copying is against its terms) and audio recognition (would mean downloading YouTube audio).
- Tracklists are YouTube data: re-read at least every 30 days with the refresh job, removed if the text disappears.
- **Long tracklists are always shown in full** (owner, 13 Nov 2026, following the designer's advice): no "Show all" control, every track in the HTML.
- Built and live (13 Nov 2026, PR #11): the first measurement found 64 of 98 sets with a tracklist, and the first refresh filled 68 of 99. They are saved by the collector and the refresh job, and shown in the "Tracklist" section of the set page, with clickable times and "ID" tracks shown as "ID". The design is by the designer, in its own commit inside the same PR (this session could only push to one branch). The admin page has a tracklist counter.

### 4.8 What comes next (owner, 13 Nov 2026)
1. **Finish the tracklists first:** measurement, saving in the collector and the monthly refresh, the set page section, design, and the admin counter (see 4.7).
2. **Then track pages only (idea 1):** every track found in the tracklists gets its own page ("Played in X sets"), each set linking to the exact minute. **A plan must be approved before any code.**
   - Decided (owner, 13 Nov 2026): every track found gets a page, linked from the tracklist, but Google indexes it only when it is played in **2 or more sets**; below that it is `noindex` and left out of the sitemap (to avoid thin pages).
   - Decided (owner, 13 Nov 2026): **each version (original, every remix) has its own page**, with links to the other versions of the same track.
   - "ID" tracks and lines with no artist get no page.
   - First count (13 Nov 2026, workflow "Track page numbers", read-only): 68 sets with a tracklist give 1,137 distinct tracks, but only 25 are played in 2 or more sets, mostly an artist's own tracks in two of their own sets. **Owner decision: wait.** No track pages until the catalogue is bigger. Re-run the count (Actions → "Track page numbers"; free, no quota) once the catalogue has about 500 published sets, or sooner if the owner asks; then decide again. The rule that says when two lines are the same track (`src/lib/tracks/normalize.ts`, with tests) is kept for then.
3. **On hold for now:** charts from plays, recommendations, best moments voted by users, user accounts, richer festival pages.

### 4.9 Per-artist lane (owner, 17 Nov 2026)
Goal: every **official** full set (40 minutes or more) of 90 named artists, **with no view threshold**, cheaply.
- **The artists** are in `data/artist-rules.json`, marked `"allSets": true`, as owner-approved artists with their genres and other spellings (`aka`, e.g. Rodhad, Kolsch, Hector Oaks, Pan Pot, Tale of Us).
- **Hard Techno** is a new artist-only genre (like Big Room / EDM, Trance, Nu Disco and Bass): used for the hard techno artists (I Hate Models, Sara Landry, Klangkuenstler, Dax J, 999999999, FJAAK, VTSS, Kobosil...), never offered to the classifier, so other hard techno artists still stay out. Timmy Trumpet, Hardwell, W&W and Oliver Heldens are Big Room / EDM; Vini Vici is Trance.
- **Who is who:** names shared by several artists (ANNA, Quest, Dixon, Adiel, Olympe...) are told apart on MusicBrainz by their genres; the artist's official YouTube channel comes from MusicBrainz links. Both are stored (`artist_lookups`). The owner can fix either in `artist-rules.json` (`mbid`, `youtubeChannelId`); the owner's value wins.
- **Sources, cheapest first:** (a) the ~26,800 remembered long videos, read again (1 unit per 50); (b) each artist's own channel, newest 150 uploads; (c) one YouTube search per artist (`"<artist>" set`, 50 most relevant long embeddable videos, 100 units). Searches share the 10,000 daily units, so about 85 fit on day 1 and the rest run the next day. Each search is stored and never repeated (a dry run's searches serve the real run).
- **Free filters before Claude**, in this order: already a set or already decided (except "uncertain" and "not our genres", which get a new look now that the artist is approved) → skip; YouTube rules and length (public, embeddable, not for kids, processed, not live, 40 minutes) → drop; the artist's name not in the title (accents, case and punctuation ignored; on the artist's own channel the name may be missing) → drop; trailer, teaser, aftermovie, interview, documentary, podcast, album, compilation, "best of", "1 hour" in the title → drop; **not an official channel** (our channel list, the artist's own channel, or a channel already approved as official) → **report only**: fan uploads are never sent to Claude and never published.
- **Claude Haiku** (the cheap model) classifies through the half-price Batch API, with the fixed instructions cached and the description cut to 1,500 characters: full set or not, artists, venue, city, country, setting, our genres, confidence. A second short Haiku pass writes the 2–3 sentence original write-up, only for sets that will be published (same field as before). A stored Opus answer for the same video is used as it is (free).
- **Haiku test first:** the `haiku_test` button re-asks Haiku about the ~185 videos Opus already answered and compares publish / not publish through the same rules. From 95% agreement the lane uses Haiku alone; below that, Haiku first and Opus only when Haiku is less than 75% sure (setting `lane_classifier`: auto / haiku / haiku+opus; auto follows the last test).
- **Budget:** at most `CLAUDE_BUDGET_USD` per run (default $3, counted from the real token use); when it is reached, the rest waits for the next run.
- Only sets credited to one of the 90 artists come in through this lane; anything else found on their channels is left to the main collector and its view threshold. De-duplication is the same as always (the official upload wins).
- **After the first two dry runs** (owner, 17 Nov 2026):
  - **No readable official channel → other channels allowed.** For an artist whose official channel was not found, or cannot be read, videos from any channel may go to Claude; they still pass every free filter and Claude, are marked "via other channel" in the report, and an official upload of the same set always wins. Artists with a readable channel keep the rule above (other channels: report only).
  - Channels are checked with YouTube itself (the real uploads playlist, 50 channels per unit; "Artist - Topic" channels ignored). For artists still without a channel, YouTube is asked once for `@<name>` (1 unit); it counts only if the channel's title is the artist's name and it has at least 10 videos ("youtube-handle" in the report).
  - **Haiku only** in this lane by default (`lane_classifier` = haiku); the owner reviews the report before publishing.
  - **Write-ups in dry runs too**, waiting up to 30 minutes, so the real run publishes in minutes.
  - The budget counts real spend; an estimate only holds room while its batch is out.
  - **Cheap passes:** `lane_sources` = `answers,search` (or `answers,matches,search`) reads again only the videos the lane already classified, matched or found by search, instead of all ~26,800 remembered long videos.
- **Report** (`reports/artist-search-<date>.md` and `.json`, in the run's "collector-report" download): per artist, what each source found, what the free filters dropped and why, what went to Claude, what was accepted, the fan uploads (report only, with channel links) and the new sets; totals for Claude cost, YouTube units, searches used and left.

### 4.10 "This month", year pages and the catalogue-artist rule (owner, 17 Nov 2026)
- **Menu: "This month"**: sets uploaded to YouTube in the current calendar month, newest first. It rolls over by itself on the 1st, with no extra job (the daily collector already finds new uploads).
- **Menu: year page** (e.g. "2026"): every set uploaded in that year. The menu switches to the new year **at the end of January** (in January it still shows the previous year). Past years stay online as archive pages.
- **Catalogue-artist rule: decided, but OFF until the owner gives a start date.** It extends the per-artist lane (4.9) rather than adding a second mechanism. A full set (a concert, 40 minutes or more) where an artist already on FullDJSet plays gets in **whatever its view count**. A **daily check** looks for new uploads by those artists. Until the owner says otherwise: **new uploads only** (older low-view sets still need the normal threshold), and **official channels only** (fan uploads still need the threshold). A reminder to ask the owner for the start date is set for 24 Nov 2026.
- Everything here is tried on the demo site first; the live site stays as it is for now.
- Look (owner, 17 Nov 2026): phone menu in **two rows**; the "This month" page shows the month name large with "This month" as the small acid word; the menu shows **one year only** (2026, then 2027 from the end of January) and lights it only on that year's pages; "Every set" lists carry a small thumbnail per set.

## 8. Open decisions (owner)
- News: which sources to read.
- Upcoming shows: which ticket sellers to approach for affiliate or partner access.
- Domain for FullDJSet (name decided 17 Nov 2026; the custom domain is set up in phase 8, Launch).
- Newsletter provider (e.g. Brevo, Beehiiv, Mailchimp).
- Analytics tool (e.g. Plausible, GA4).
- Tracklists: whether to approach 1001Tracklists for a partnership (owner, 13 Nov 2026: not for now).
