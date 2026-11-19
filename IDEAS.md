# IDEAS

Proposals from the designer. **Nothing here is built until the owner approves it.**
Each idea: date, the idea, why it fits the zine, effort.

---

## 2026-11-18 · after the design kit

### 1. The issue number is real
**Idea.** The top strip says `ISSUE No.001`. Make it true: every Monday the number goes up, the gig of the week changes, and the homepage gets a new "cover" (a different treated photo, a different marker line, strips cut in a different order). Old issues stay reachable at `/issue/001`, like back numbers in a box under the table.

**Why it fits.** A zine comes out in issues. It gives people a reason to come back on a set day, gives the newsletter its subject line ("Issue No.014 is out"), and turns the archive into something to flip through with the page-turn we already have.

**Effort.** Medium. One small table (issue number, date, featured gig, marker line), a weekly pick by the owner or a rule, one archive page. No new design pieces: the kit already covers it.

### 2. The setlist remembers you
**Idea.** The marker strikes are kept per visitor (in the browser only, no account): come back to a gig you left at song 7 and songs 1–6 are still crossed out, with one handwritten line, "you left at song 7. carry on?", and the play button jumps there.

**Why it fits.** It is what you would do to a paper setlist with a real marker. It makes the hand-marked setlist the product's signature instead of a decoration, and it is on the fan's side: no login, nothing sent anywhere.

**Effort.** Small to medium. `TypewriterSetlist` already takes the current song from outside; this needs local storage for (gig, last song) and one line of copy. Needs the player wiring from step 5 first.

### 3. "Bootleg" and friends: a small set of rubber stamps
**Idea.** Four or five stamps the collector data can earn, shown as a tilted sticker on the black mount of a gig (never on the picture): `BOOTLEG-ISH` (old, rough footage), `THE WHOLE SET` (90 minutes or more), `FIRST TIME HERE` (a band's first gig in the archive), `LOUD` (owner's pick), `RARE` (the only gig we have from that decade for that band). Black or white only; pink stays for "On now".

**Why it fits.** Zines are full of stamps and stickers, and each one is a tiny honest reason to click. They add texture to lists without breaking "one pink thing per view", and they are facts, not hype.

**Effort.** Small. The `CutOut sticker` piece exists. Each stamp is one rule on data we already store (length, date, counts), plus one manual flag for `LOUD`.

---

## 2026-11-18 · after the homepage

### 4. One handwritten line per gig
**Idea.** The board gives every gig on "Fresh off the copier" a marker line ("17 songs, zero breathers", "Barcelona, after midnight"). The homepage leaves them out today because nothing true is stored to write them from. Add one optional line per gig, written by the owner in the admin (60 characters, lower case), shown in marker under the typed data wherever the gig appears.

**Why it fits.** It is the fourth step of an entry (photo, name strip, typed data, one marker line) and the place where the zine's voice lives. Written by a person, never generated, so it stays honest.

**Effort.** Small. One text field on the concert, one input in the admin; the homepage card and the band page already have the slot.

---

## 2026-11-18 · after the other pages

### 5. Tear-off tabs at the bottom of a gig
**Idea.** The concert page ends with a row of tear-off tabs, like the phone-number strips at the bottom of a flyer on a venue wall: each tab is one song with its time ("KILLING IN THE NAME /// 1:09:40"). Pressing a tab copies a link that opens the gig at that song, and the tab tears off (drops, tilted) so you can see what you took.

**Why it fits.** It is the most recognisable thing on a real gig flyer, it is made with scissors, and it turns the clickable setlist into the way the site gets shared: a link to the exact song, not just the page. It also gives the "share" icon from the kit a home without a share menu.

**Effort.** Small to medium. A `?t=` (or `#song-5`) link the concert page reads on load and hands to `playFrom`; one new component from existing pieces (a cut line, strips); one new motion (tear and drop, with the reduced-motion version landing at once). Needs a small change in the player wiring, so not design alone.

### 6. "First time on the wall" for thin piles
**Idea.** While a band, field or decade has one gig, its page shows the marker line "one so far. more when we find them." Go one step further: let the visitor leave their e-mail under that line ("tell me when the second one turns up"), one field, same voice as the newsletter line.

**Why it fits.** Thin pages are the honest state of a new zine; this turns "we only have one" into a reason to come back, and feeds the newsletter with people who told us exactly which band they care about.

**Effort.** Medium. Needs the newsletter sign-up to exist first, plus a tag per band on the subscriber. The page slot and the copy are already there.

---

## 2026-11-18 · after "Find your next band" got its three ways in

### 7. String on the wall
**Idea.** On the wall (`/map`) and on the homepage scrap, join today's band to its neighbours with "string": thin black hand-drawn lines pinned at both ends, like a detective's board. The thicker the string, the more alike. The names stay links; the string is decoration.

**Why it fits.** It is made with pins and thread, it says "these belong together" without a score, and it turns a list of names into a picture you want to poke at.

**Effort.** Small to medium. One inline SVG behind the names on the homepage scrap; on `/map` it needs the positions the map already computes, so a little work with the main agent.

### 8. "Next band?" after the last song
**Idea.** When a gig ends (or in its last minute), the player bar's marker line changes from "now playing" to "next band?" with one similar band's name on a cut-out beside it. One name, not a carousel.

**Why it fits.** It asks at the only moment the fan is actually looking for something new, in the zine's voice, and it keeps "one live thing per view".

**Effort.** Medium. The similar bands are already loaded by the player (`suggestions`); the timing lives in player logic, so it is a job for the main agent with a small design pass.

### 9. The wall as a poster
**Idea.** A "print this wall" link on `/map`: one A4 page, today's band in the middle, its twelve neighbours around it, the wordmark and the address at the bottom. Black and paper only, made for a real photocopier.

**Why it fits.** The whole brand is a flyer taped to a wall; this is the one page of the site that can become one. It is also something to share that is not a screenshot.

**Effort.** Small. A print stylesheet for the map page; no new data.

### 10. The homepage's "Find your next band": four layouts tried, the crossroads chosen
**Decision (owner, 18 Nov 2026).** Four layouts were built behind a switch and compared: the box + a scrap of the wall, a sticker sheet, band of the day with tear-off tabs, and the crossroads. The owner chose **the crossroads** (you are here, then Louder / Softer / Older / Newer, up to three bands per sign, each with its genre). The other three and the switch are deleted. The sticker sheet and the tear-off flyer stay here as ideas for other pages (a band page's foot, the newsletter).

---

## 2026-11-19 · landing pages for search (engineering note, after the SEO step)

Not built: for the owner to approve, after keyword research (a keywords script like OpenDecks' `scripts/keywords.ts`). All generated from the database, indexed only when strong enough, in the sitemap and IndexNow like the rest.

1. **Band at festival** (`/artists/metallica/pinkpop`): every concert by one band at one festival or room, with the years, setlists side by side and the songs that changed. People search exactly this ("metallica pinkpop", "radiohead glastonbury 1997"). Only when the band played there at least twice; otherwise the concert page is the answer.
2. **Best of a festival or decade** (`/best/glastonbury`, `/best/1990s`): the most watched concerts, ranked by views on YouTube, with one line each from our data. Answers "best glastonbury performances" / "best 90s rock concerts".
3. **Festival year** (`/venues/pinkpop/1996`): the line-up we hold for one edition, in running order when known. For "pinkpop 1996 line up".
4. **Genre by decade** (`/genres/grunge/1990s`): the crossings with enough concerts. "90s grunge concerts".
5. **Songs**: built (owner OK, 19 Nov 2026) as `/songs/<band>/<song>` and `/songs/<band>` (song titles collide across bands, so songs live under their band). See README.
