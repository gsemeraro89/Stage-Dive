# STAGEDIVE — brief for Claude Code (v2, with brand book, 17 Nov 2026)

Attach `stagedive-brandbook.zip` (brand book boards as HTML + treated photos). Plan mode, Opus.

## 1. What we're building
STAGEDIVE: a free website of full-length rock concerts that are freely watchable on YouTube (embedded, official or freely available uploads), monetised with ads. English. Sister site of OpenDecks (repo gsemeraro89/opendecks, same owner): reuse its proven parts, not its look.

Setup (plan first, ask me before creating anything):
- New private repo gsemeraro89/stagedive, started from a copy of the OpenDecks code (not a branch of OpenDecks).
- Own test deployment on Render: stagedive-test.
- Domain not decided (stagedive.fm and stagedivegigs.com were free on 17 Nov 2026). Don't buy anything.

Keep from OpenDecks: persistent player (keeps playing across pages, auto-next), one-click play, artist / venue / genre pages, map, admin page for rejected videos, GitHub Actions collector (daily collection, nightly data refresh as YouTube requires, weekly DB backup), tracklist extraction (here: setlists), artist bios, similar artists.

What changes for rock:
- Unit = one band's full concert or full festival show, at least 40 minutes. No compilations, single songs, documentaries, "best of", half-show phone footage.
- Setlist is a first-class object: every concert page shows it; clicking a song jumps to its timestamp. Source: YouTube description/chapters. Optional later: setlist.fm API (check terms first).
- Browse by decade and tour too, not only band, venue/festival and genre.
- Genres (editable): classic rock, hard rock, punk, post-punk, indie, alternative, grunge, metal, garage, shoegaze, stoner, emo/post-hardcore; new wave / synth (owner, 18 Nov 2026); trip hop, electronic rock / big beat, art pop / experimental (owner, 20 Nov 2026: Massive Attack, The Prodigy, Björk). DJ sets, hip hop, reggae, jazz, classical and solo pop acts stay out.
- Venues/festivals: Glastonbury, Reading & Leeds, Roskilde, Rock am Ring, Hellfest, Download, Primavera Sound, Mad Cool, Pinkpop, Rock Werchter, Lollapalooza; rooms like Madison Square Garden, Royal Albert Hall, Wembley, CBGB, The 100 Club, Paradiso.

## 2. Collector (cheap by design)
Same per-artist approach as OpenDecks (decided 16 Nov 2026):
- Artist list from major rock festival line-ups + my manual list. Start with the top 90.
- No view threshold. Min 40 minutes. Public and embeddable only.
- Official/free sources only: artist channels, festival/broadcaster channels (e.g. Arte Concert), label channels. Fan uploads only in the report.
- Free filters before AI: duration, artist name in title, exclusion words (trailer, aftermovie, interview, documentary, reaction, cover, tutorial, lyrics, full album).
- Haiku 5.5 with Batch API + prompt caching; original text only for accepted concerts; cap $3 per run.
- YouTube quota 10,000 units/day; read channel uploads before searching (search = 100 units).
- Dry run with per-artist report → my OK → real run.

## 3. Brand: STAGEDIVE brand book (approved)
The zip contains the approved brand book (9 boards: 01 Brand, 02 System x2, 03 Motion, 04 Homepage, Concert page, Band page, Mobile, Social/merch/newsletter). It is the source of truth. Open the HTML files in a browser and match them; turn them into tokens + components. Write the rules into DESIGN.md in the repo.

Idea: "A fanzine that plays." Every page is cut, glued and copied by hand; every picture is a full concert one click away.
Insight: nobody found their favourite band on a clean page; they found it on a photocopied flyer taped to a wall.
Name: the stage dive, you jump and strangers hold you up. You click, the gig catches you.

Logo:
- Wordmark = nine cut-out letters drawn one by one (5 hands: heavy, typewriter, marker, slab, stencil; 4 black, 2 white, 2 pink, 1 newsprint; no two neighbours tilt the same way). Use the SVG from the brand book as the master asset; never retype it in a font.
- SD stamp symbol for small sizes and favicon (64/32/16). Under 60 px wide the symbol takes over. Min width 160 px full, 90 px flat. Clear space: one letter-width of bare paper (only tape may cross it).
- Don'ts: don't type it straight, don't use pink as ink, don't set it on a photo, don't round corners or soften shadows.

Colour (proportions per page: paper 58 / toner 25 / sheet 11 / pink 6):
- Toner black #0A0A0A: text, photos, strips, the player.
- Copier paper #ECEAE4: the ground, always speckled, never flat, never pure white.
- Clean sheet #FBFAF6: labels, setlists, anything glued on top.
- Highlighter pink #FF2D7A: a block behind black words, one live thing per view. Never text, never on a photo. "If two things are pink, one of them is wrong."
- Masking tape #D8D2B4: decoration only, never carries words.
Contrast: black on paper 17:1, black on pink 5.4:1. Pink on paper fails, so it is never ink.

Type (Google Fonts):
- Archivo Black, caps: H1 56–74 px on a cut strip, one strip per line, alternating white and black; H2 34–42; names 22–26; never below 15.
- Special Elite: everything you read. Body 16–18 / 1.6. Data in caps with triple slashes: GLASTONBURY 2024 /// 1:14:20. Labels 13, tracked.
- Permanent Marker: someone wrote on the page afterwards. Hints, asides, arrows, 17–27, tilted, lower case. Never navigation, max one line.
- Entry hierarchy: 1 photo, 2 name strip, 3 typed data, 4 one marker line.

Paste-up grid:
- 12 columns, disobey by up to 4°. Margins 40 px desktop / 16 mobile, gutters 14. Photos may break the margin, type may not.
- Tilt 1–4° for cut-outs, 0° for anything you type into or press twice. Alternate direction with neighbours. The player is the only thing dead straight.
- Shadow: 7 px right, 7 px down, solid black, no blur, only on sheets sitting on other things.
- Edges always square. Photos 4 px black frame; white paper 3 px keyline.
- Things touch: a strip bites 20–30 px into its photo, tape always bridges two things, staple = stacked sheets, nothing floats alone. Sections end with a dashed cut line or a full-bleed black band, never empty space.
- NO rounded corners, gradients, glassmorphism, emoji icons, soft shadows, card grids.

Photocopy treatment for every YouTube thumbnail (do it in the pipeline, cache the result; keep originals for the player):
1. Drop colour, keep the brightest channel so stage light survives.
2. Crush: blacks to black, haze to white, lose mid-greys.
3. Remaining greys → 45° dot screen, 6 px.
4. Add copier dirt: specks, toner gaps, one or two drum streaks.
5. Print on paper colour with a 4 px frame. Words go on a strip, never on the image. Crop hard; hands, not faces.

Icons: play, pause, next, setlist, search, share. Solid shapes "cut with scissors" on a 48 px square label, never outlines. The live control (pause while playing) sits on pink. Touch area ≥ 48 px. Use the SVGs from the brand book.

Motion (timings from the brand book, all must work in production):
- Page load: strips slap on, 260 ms with overshoot, 60–120 ms stagger (photo, strip, strip, tape, sticker).
- Press play: photocopier light bar sweeps 900 ms linear, then pink "On now" stamp 320 ms with one bounce, then the player docks.
- Setlist: played songs get struck by marker (350 ms in 5 jerky steps), current song is pink.
- Hover/focus: paper lifts 90 ms, shadow 4 → 13 px, slight tilt, tape lets go at one end; press sinks 3 px and slams back.
- Next page: page turn 600 ms hinged on the left edge.
- prefers-reduced-motion: everything lands at once, no light bar, no page turn.
Nothing fades: things get slapped, stamped, struck and lifted.

Voice (short, funny, on your side, slightly too loud; say gig, free, jump in, the whole set; never content, at no cost, get started, curated; no unearned exclamation marks):
- Play: "Play it loud"
- New concerts: "Fresh off the copier"
- Loading: "Warming up the copier…"
- Empty search: "Nothing. Not even a bootleg. Check the spelling or yell a different band."
- 404: "Page torn out. Somebody took it home."
- Error: "The tape jammed. Hit play again, it usually behaves."
- Newsletter: "The zine, in your inbox. One issue a week. No glitter."
- Cookies: "We keep two cookies: one remembers your volume, one counts heads. That's the lot." [OK, fine] [No thanks]

Pages to build (match the boards): homepage (top strip "ISSUE No.001 /// FREE…", header + nav Bands / Fields + Rooms / Decades / Genres / Tours + "find a gig:" search, gig of the week with typewritten setlist, Fresh off the copier, Pick a decade, Where it happened (the fields / the rooms), Most played, The night that…, Sort by noise, footer, docked player), concert page with clickable setlist, band page, venue/festival, decade and genre pages, mobile for all. Also templates from board 04 for: Instagram post, reel cover, newsletter header (for later use).

Accessibility: real buttons/links/inputs with labels, visible focus, WCAG AA contrast, 48 px touch targets, alt text, reduced motion respected. Tilt and texture must never hurt usability.

## 4. Creative partner: STAGEDIVE design agent on Fable 5.2
I want design ideas to keep coming, not only execution.
- .claude/agents/stagedive-designer.md, model Fable 5.2, used for every creative or visual request. Code, collector and data stay on Opus.
- It knows DESIGN.md and the brand book boards.
- It proposes, it doesn't impose: after every page or feature it suggests 2–3 ideas that push the zine further (weekly "issue" that changes, hand-marked setlist, "bootleg" sticker on rare shows, decade collages, printable zine PDF of the weekly picks, shareable gig card, reel templates).
- Ideas go into IDEAS.md (date, idea, why it fits, effort). Nothing is built until I approve it.
- Weekly, or when I ask "ideas?", it presents the best 3 with a quick mockup.
- Guardrails: brand book rules above; no real band logos or copied artwork; no artist photos except YouTube thumbnails and properly licensed images (Wikimedia Commons with credit, as on OpenDecks).

## 5. Order of work
1. Plan: repo, Render test service, what's copied from OpenDecks. Wait for my OK.
2. DESIGN.md + tokens + base components from the brand book (wordmark SVG, SD stamp, paper strip, cut-out, tape, staple, photocopy image, icon set, typewriter setlist, docked player) and the motion system, with the designer agent.
3. Thumbnail photocopy pipeline.
4. Homepage on seed data (20–30 concerts I can check).
5. Concert page with clickable setlist, then band, venue/festival, decade, genre pages, mobile.
6. Collector dry run for 90 artists → report → my OK → real run.
7. Deploy to stagedive-test, then the designer agent's first batch of ideas.
Commit in small steps, keep a short README, and after each step tell me in plain words what changed.
