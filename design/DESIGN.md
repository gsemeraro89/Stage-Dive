# STAGEDIVE design rules

**A fanzine that plays.** Every page is cut, glued and copied by hand. Every picture on it is a full gig, one click away.

This file is the rulebook. It is written from the approved brand book (`design/brandbook/*.dc.html`, order in `canvas.json`) and `docs/BRIEF.md` section 3. If this file and a board disagree, the board wins and this file gets fixed.

| Where | What |
| --- | --- |
| `design/tokens.css` | Every colour, size, tilt, shadow and timing as a CSS variable |
| `src/app/globals.css` | The same tokens as Tailwind utilities (`@theme inline`) |
| `src/styles/zine.css` | Styles for the zine components and the motion system |
| `src/components/zine/` | The components (import from `@/components/zine`) |
| `/kit` | Every component and state on one page, desktop and phone |
| `design/brandbook/` | The approved boards and treated photos: the source of truth |

Light only. The brand has no dark mode.

---

## 1. The idea

- **Insight.** Nobody found their favourite band on a clean page. They found it on a photocopied flyer taped to a wall, already third-hand, already a bit ruined.
- **Name.** The stage dive: you jump and strangers hold you up. You click, the gig catches you.
- **Test for any screen.** Could this have been made with scissors, glue, a typewriter, a marker and one tired photocopier? If a part of it could not, it is wrong.

## 2. Logo

- **Wordmark**: nine cut-out letters drawn one by one (5 hands: heavy, typewriter, marker, slab, stencil; 4 black, 2 white, 2 pink, 1 newsprint; no two neighbours tilt the same way). The master drawing lives in `src/components/zine/brand-art.ts`, generated from board 01. **Never retype it in a font.** Use `<Wordmark />`.
  - `variant="full"`: shadows and two pieces of tape. On paper or a clean sheet. **Min width 160 px.**
  - `variant="flat"`: half tilt, no tape, no shadows, for small sizes. **Min width 90 px.**
  - `variant="on-toner"`: the full wordmark on toner black, with paper keylines.
- **SD stamp** (`<SdStamp />`): the symbol. **Under 60 px wide the symbol takes over** from the wordmark.
- **Favicon**: black square, pink foot, white S. `src/app/icon.svg`, `src/app/favicon.ico` (16 / 32 / 64; the 16 uses the heavier drawing from the board) and `src/app/apple-icon.png`.
- **Clear space**: one letter-width of bare paper all round. Only tape may cross that line.
- **Don't**: type it straight · use pink as ink · set it on a photo · round its corners or soften its shadow · recolour, stretch or re-tilt the letters.

## 3. Colour

Proportions on any page: **paper 58 / toner 25 / sheet 11 / pink 6.**

| Token | Hex | Job |
| --- | --- | --- |
| `--toner` | `#0A0A0A` | Text, photos, strips, the player |
| `--paper` | `#ECEAE4` | The ground. Always speckled (`--paper-ground`), never flat, never pure white |
| `--sheet` | `#FBFAF6` | Labels, setlists, anything glued on top |
| `--pink` | `#FF2D7A` | A block behind black words. One live thing per view |
| `--tape` | `#D8D2B4` | Masking tape. Decoration only |

Supporting greys (not brand colours, never used for decoration): `--label-grey #4F4D48` (small labels on paper), `--toner-track #3A3936` (empty progress line), `--toner-soft #B9B6AD` (quiet text on toner), the two staple greys.

Rules:

- **Pink is never ink and never on a photo.** It is a block behind black words: the song on now, the play button, the one current nav label, the "On now" stamp. *If two things are pink, one of them is wrong.* (The player bar counts as one thing.)
- **Tape never carries words.**
- **The ground is always `--paper-ground`** (two offset dot screens over paper). Do not paint flat paper over it.
- Contrast: black on paper 17:1, black on pink 5.4:1, paper on black 17:1. Pink on paper is under 3:1, which is why it is never text, never a border on paper and never a focus ring.
- No other colours. No tints, no opacity tricks to make new ones. Photos are black and paper; the only colour in a picture is a YouTube thumbnail, which we are not allowed to change (section 6).

## 4. Type

Three hands, one job each. Google Fonts, self-hosted through `next/font` in `src/app/layout.tsx`. Each has one weight; the browser must never fake a bold or an italic (`font-synthesis: none`).

| Hand | Token | Job | Sizes |
| --- | --- | --- | --- |
| **Archivo Black**, caps | `--font-strip` | Headlines and names, always on a cut strip | H1 56–74 px (33 on a phone) · H2 34–42 (21 on a phone) · names 22–26 · **never below 15** |
| **Special Elite** | `--font-type` | Everything you read | Body 16–18 / 1.6 · data 16, caps · labels 13, tracked 0.08em |
| **Permanent Marker** | `--font-marker` | Someone wrote on the page afterwards | 17–27, tilted, lower case |

- **H1**: on a cut strip, **one strip per line, alternating white and black**, each tilted against its neighbour, the second stepped in. Use `<StripHeading lines={[...]} />`.
- **Data** is typed in caps with triple slashes: `GLASTONBURY 2024 /// 1:14:20`. Class `zn-data`.
- **Marker**: hints, asides, arrows. **Never navigation. Never more than one line.** One per entry at most. Class `zn-marker`.
- **Hierarchy of an entry**: 1 photo · 2 name strip · 3 typed data · 4 one marker line.
- Type never breaks the page margin. Type never sits on a picture (section 6).

## 5. Paste-up

**Grid**: 12 columns you are allowed to disobey by up to 4°. Margins **40 px desktop / 16 px phone** (`--margin`), gutters **14 px** (`--gutter`). Photos may break the margin; type may not.

**Tilt** (`tilt` prop on every component, in degrees):

- 1–4° for cut-outs. **Alternate direction with each neighbour.**
- **0° for anything you type into or press twice**: inputs, play/pause, next, the setlist rows, buttons.
- **The player is the only thing that sits dead straight.** Never tilt it, never tape it.
- Components clamp tilt to ±4°. Tape may swing to ±6°.

**Shadow**: 7 px right, 7 px down, solid black, **no blur** (`--shadow-sheet`). Only on sheets that sit on top of other things. A sheet you can pick up rests at 4 px and lifts to 13 px (section 8).

**Edges**: square, always. Photos get a **4 px black frame** (`--frame`); white paper gets a **3 px keyline** (`--keyline`). Every Tailwind radius is zeroed in `globals.css`.

**Things touch**:

- A strip bites **20–30 px** into its photo (`--bite`). On a YouTube thumbnail it bites into the black mount instead (section 6).
- **Tape always bridges two things.** It never sits in the middle of one.
- A **staple** means stacked sheets.
- Nothing floats alone.

**Sections end** with a dashed cut line (`<hr class="zn-cutline">`) or a full-bleed black band (`zn-band`). Never with empty space.

**Never**: rounded corners · gradients · glassmorphism · blur · soft shadows · emoji as icons · outline icons · card grids of identical tiles · fades.

## 6. Photos

There are **two kinds of picture and they follow different rules.** `<PhotoFrame kind="…">` enforces them.

### `kind="youtube"`: a YouTube thumbnail

YouTube's developer policies say a video thumbnail must not be altered. So:

- **No filter, no recolouring, no photocopy treatment.** The file goes to the browser as YouTube serves it (a plain `<img>`, no resizing proxy).
- **No crop.** The picture keeps the shape of its own file (pass the real `width` and `height`). No `object-fit: cover`.
- **Nothing on the picture except a play control.** No strip, no stamp, no duration tag, no tape, no shade, no light bar.
- The zine happens **around** it: the 4 px black frame, a black mount under the picture that the strips bite into, tape across the top edge, the "On now" stamp sitting on the top edge, the tilt, the shadow.
- **A visible "YouTube" credit** under the frame, always.

### `kind="treated"`: a picture we are allowed to change

Our own art, the brand book photos, licensed pictures (Wikimedia Commons, credited through the `credit` prop). These get the **photocopy treatment**, done once in the image pipeline and cached, never with a CSS filter:

1. Drop the colour. Keep the brightest channel so stage light survives.
2. Crush it: blacks to black, haze to white. Lose the mid-greys.
3. What is left of the greys becomes a 45° dot screen, 6 px.
4. Add what a tired copier adds: specks, toner gaps, one or two drum streaks.
5. Print on paper colour with a 4 px frame.

Then: **crop hard; hands, not faces.** Strips bite into the picture. Words still go on a strip, never straight on the image. Pink never touches a photo, except the "On now" stamp and the live pause control.

Both kinds: real `alt` text that says what is in the picture. No real band logos or copied artwork, anywhere.

## 7. Icons and buttons

- Six icons: **play, pause, next, setlist, search, share** (plus "previous", from the player on board 03). Solid shapes cut from black paper with scissors, so no two edges are quite parallel. **Never outlines.** The points come from board 02: do not tidy them.
- Each sits on a **48 px square label** (`<IconButton />`): white with a keyline, or toner black; on the player a paper outline (`tone="on-toner"`).
- **The live control** (pause, while playing) is the one that sits on pink: `live`. One per view.
- `<PressButton />` is the big labelled button ("Play it loud"): 4 px black edge, solid 6 px shadow. Pink only for the one live action; black or white for everything else.
- Always a real `<button>` or `<a>`, always named (`label`), **touch area 48 px or more**, dead straight if it is pressed twice.

## 8. Motion

**Nothing fades. Things get slapped, stamped, struck and lifted.** All of it lives in section 10 of `src/styles/zine.css`, driven by tokens.

| Move | Timing | How to use it |
| --- | --- | --- |
| **Slap-on** (page load) | 260 ms, overshoot `cubic-bezier(.2,1.5,.4,1)`, 60–120 ms stagger | Class `zn-slap` with `style="--i: 0…n"`. Order: photo, strip, strip, tape, sticker |
| **Light bar** (press play) | 900 ms linear, once per play | `<PhotoFrame scan="run">` |
| **"On now" stamp** | 320 ms, one bounce, after the bar (950 ms delay) | `<OnNowStamp animate />` |
| **Player docks** | 220 ms with overshoot, after the stamp | `<DockedPlayerFrame docking />` (shell only) |
| **Marker strike** (setlist) | 350 ms in 5 jerky steps | Automatic in `<TypewriterSetlist />` |
| **Paper lift** (hover / focus) | 90 ms; shadow 4 → 13 px, slight tilt, tape lets go at one end; press sinks 3 px and slams back | Class `zn-lift`, or `<Sheet href>` |
| **Page turn** (next page) | 600 ms, hinged on the left edge | `zn-book` + `zn-leaf[data-turned]`; `zn-turn-in` / `zn-turn-out` for a whole page |

- **`prefers-reduced-motion: reduce`: everything lands at once.** No slap, no light bar, no stamp bounce, no page turn. Pressing still answers (the shadow changes, nothing travels). All motion CSS sits inside `@media (prefers-reduced-motion: no-preference)`.
- The light bar never crosses a YouTube thumbnail: there it runs in a thin scanner slot under the picture.
- The real player bar is never animated while it holds the video.
- No looping decoration, no parallax, no scroll-jacking, no fades, no easing "for polish".

## 9. The player

- The docked player is **toner black, a 5 px pink rule on top, an 8 px progress line** (track `--toner-track`, fill pink), paper text. Dead straight.
- "now playing" is the one marker line; the time sits on pink; pause is the live control.
- **YouTube rules (non-negotiable)**: nothing on top of or inside the player, ever: no label, no icon, no shade, no tape. Never hide YouTube's controls or branding. The video is never smaller than 200 × 200 (356 × 200 docked on desktop).
- `<DockedPlayerFrame />` is the visual shell. The working bar is `src/components/player/PlayerDock.tsx`; it is dressed to match through its `data-od` attributes only (section 9b of `zine.css`). Its logic is not design's to touch.

## 10. Components

All in `src/components/zine/`, server components unless noted. See them at `/kit`.

| Component | What it is |
| --- | --- |
| `Wordmark`, `SdStamp` | The logo (section 2) |
| `PaperStrip`, `StripHeading` | A line of headline on cut paper; a heading of alternating strips |
| `CutOut` | A small piece of cut paper: nav label, tag, sticker |
| `Tape`, `Staple` | Fixings. Decoration, hidden from screen readers |
| `Sheet` | A clean sheet with keyline and 7 px shadow; with `href` it lifts |
| `PhotoFrame`, `OnNowStamp` | The two kinds of picture (section 6); the pink stamp |
| `IconButton`, `PressButton`, glyphs | Section 7 |
| `TypewriterSetlist` (client) | Songs with times; each a button; `onSelect(seconds, index)` |
| `DockedPlayerFrame` | The player bar's visual shell |

Utility classes: `zn-label`, `zn-data`, `zn-marker`, `zn-cutline`, `zn-band`, `zn-slap`, `zn-lift`, `zn-book` / `zn-leaf`.

## 11. Voice

Like the person who made the zine: **short, funny, on your side, slightly too loud.** We never explain a joke and we never use an exclamation mark we haven't earned.

| We say | We don't say |
| --- | --- |
| gig | content |
| free | at no cost |
| fresh off the copier | new releases |
| jump in | get started |
| the whole set | curated |

Fixed lines. Use them exactly:

| Where | Line |
| --- | --- |
| Play | **Play it loud** |
| New concerts | **Fresh off the copier** |
| Loading | Warming up the copier… |
| Empty search | Nothing. Not even a bootleg. Check the spelling or yell a different band. |
| 404 | Page torn out. Somebody took it home. |
| Error | The tape jammed. Hit play again, it usually behaves. |
| Newsletter | The zine, in your inbox. One issue a week. No glitter. |
| Cookie notice | We keep two cookies: one remembers your volume, one counts heads. That’s the lot. **[OK, fine] [No thanks]** |
| Top strip | ISSUE No.001 /// FREE /// FULL ROCK GIGS, STRAIGHT OFF YOUTUBE /// NO LOGIN, NO NONSENSE |
| Search label | find a gig: (placeholder: band / venue / year) |
| Manifesto | No login. No algorithm. No “recommended for you”. We’ve got scissors, glue and every full gig we could find. Free, like the flyer on the venue wall. One click. Jump in. |

Navigation: Bands · Fields + Rooms · Decades · Genres · Tours · **Next band?** (the wall of similar bands, `/map`). The last one is a sticker: heavy type on white, black edge, 4 px shadow. It is never pink at rest, only when you are on the wall.

## 12. Accessibility

Tilt and texture must never hurt usability.

- Real `<button>`, `<a>`, `<input>` with labels. Icon-only controls are named. Nothing clickable is a `<div>`.
- **Visible focus**: a 3–4 px dashed toner outline, offset from the element (paper-coloured inside the player). Never pink, never removed.
- **WCAG AA** for all text. Only toner on paper, sheet, pink or tape; only paper on toner.
- **Touch targets 48 px** or more.
- `alt` text on every picture; decoration (tape, staples, the light bar) is `aria-hidden`.
- The song on now carries `aria-current`; played songs are announced as played, not only struck through.
- Reduced motion respected (section 8).
- Text stays selectable and zoomable; nothing is baked into an image.
- **Desktop and phone (360–400 px), always.** Check both before calling anything done.

## 13. Don'ts, in one place

1. Don't use pink as ink, as a border on paper, or on a photo.
2. Don't have two pink things in one view.
3. Don't put words on tape, or on a picture.
4. Don't alter, crop or cover a YouTube thumbnail.
5. Don't round a corner, blur a shadow or draw a gradient.
6. Don't fade anything in or out.
7. Don't tilt the player, an input, or anything pressed twice.
8. Don't let anything float alone: tape it, staple it, overlap it or end the section.
9. Don't type the wordmark.
10. Don't use real band logos, copied artwork or unlicensed artist photos.
11. Don't write "content", "curated", "get started" or "at no cost".
12. Don't add a second typeface, a second accent colour or a dark mode.

## 14. Pages

Every page is built from the kit. Where things live:

| Page | Markup | Styles |
| --- | --- | --- |
| Homepage (board 04) | `src/app/_home/HomePage.tsx` | `src/styles/home.css` (`hm-`) |
| Concert page (board 05) | `src/app/concerts/[slug]/page.tsx` | `src/styles/pages.css` (`cp-`) |
| Band page (board 06) | `src/app/artists/[slug]/page.tsx` | `pages.css` (`bp-`) |
| Bands, Fields + Rooms, Decades, Genres, Tours, Every gig, and their piles | `src/app/*/page.tsx` | `pages.css` (`pg-`) |

Shared pieces that know about gigs live in `src/components/gig/`: `PageHead` (trail, name on strips, one typed line), `GigRows` (a list of gigs), `GigCard`, `Collection` (rows plus "On the bill"), `GigFilters`, `OnNowMark`. `PlayableSetlist` (in the kit) wires the typewriter setlist to the player.

Rules the pages add:

- **The concert page's player** sits in a 4 px black frame with a solid shadow, dead straight, never taped. Under the video the frame grows a black mount; the band's strips bite into the mount, never the video. The "On now" stamp sits on the frame's top edge, outside the video.
- **One pink thing per page.** On a page that has its label pink in the header (Bands, Decades, Genres…), nothing else is pink at rest: data strips are black, play labels are black and turn pink only for the gig that is playing. On the concert page (no pink label in the header) the date strip is pink, as on the board.
- **A list of YouTube pictures** carries one visible "Pictures: YouTube" line under it.
- **A setlist without times** is a plain typed list, not buttons. A setlist read from a viewer's comment says so.
- **Find your next band** has three ways in besides the footer: the sticker in the header, the crossroads under the homepage's black band (`hm-next`, `src/app/_home/NextBand.tsx`: "you are here" on today's band, then four signs, Louder / Softer / Older / Newer, up to three bands each with their genre; every name opens the wall from that band), and "if you like this, try:" under the concert page's title (`cp-try`: the marker asks, three cut-outs are the links). None of them is pink.
- **Nothing is invented.** No story, quote or song note that is not stored. An empty pile says "Nothing. Not even a bootleg." and points somewhere full.

## 15. The bridge (what is left of it)

The player bar (`PlayerDock`), the concert page's player slot and the map (`/map`) still use `od-` class names and the old token names (`--ground`, `--ink`, `--muted`, `--acid`, `.display`, `.title`, `.meta`…), mapped onto the zine at the bottom of `tokens.css`. Their layout is in `deck.css`, `map.css` and `components.css`; they are dressed through `data-od` attributes only, because their logic is not design's to touch. New work uses the zine tokens and components, not the bridge names.
