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

---

## 2026-11-23 · after the news topic pages and band news pages (designer)

Not built: for the owner to approve.

### 1. The topic labels as rubber stamps on each clipping
**Status.** Built on 23 Nov 2026 with the news pictures (the stamp is a label for now; pressing it does not open the pile yet).

**Idea.** Every story in the news list gets a small black stamp in its corner with its pile: TOURS, FESTIVALS, LIVE ALBUMS, NEW MUSIC, REUNIONS. Pressing it opens the pile.

**Why it fits.** A fanzine sorts its clippings by hand and stamps them; the reader learns the piles exist without reading the row of labels at the top. Black only, so the pink stays the header's.

**Effort.** Small. The topic is already on every article; one link per row and a few lines of CSS.

### 2. Tour dates as a torn ticket strip
**Idea.** When a tour story names dates and cities ("Rose Bowl, June 5, 6, 10, 12"), show them under the "Is <band> touring?" answer as a strip of ticket stubs, perforated, one per date.

**Why it fits.** It turns the one sentence into something a fan can read at a glance, in the paper language of the site. Only from facts in the article, so nothing is invented.

**Effort.** Medium. The dates would have to be pulled out of the article as data by the news writer (main agent), then a small design pass.

### 3. "This week in the pit" at the top of /news
**Status.** Built on 23 Nov 2026 as the front page story (without the handwritten line).

**Idea.** Once there are enough stories, the newest one of the week is glued larger at the top of /news, with its picture big and one handwritten line.

**Why it fits.** A zine has a front-page story. Today all eight clippings weigh the same; a lead story gives the page a cover.

**Effort.** Small. Design only: the first item of page 1, when it has a picture.

---

## 2026-11-23 · after the news pictures (designer)

Not built: for the owner to approve.

### 1. Press the stamp, open the pile
**Idea.** The topic stamp on every clipping (TOUR, LIVE ALBUM, NEW MUSIC...) becomes a link to its pile (/news/tours...). It gets a finger-sized press area and tips a little further when pressed, like a stamp coming down.

**Why it fits.** The stamp already says which pile a story is in; pressing it is the obvious next move, and it sends readers (and search engines) deeper into the news without another menu.

**Effort.** Small. One link in the list (main agent: which topics have a page) and a few lines of CSS.

### 2. One handwritten line on the front page story
**Idea.** The front page story gets a short Permanent Marker note next to its picture, picked from a short list by topic: "pack earplugs" for a tour, "turn it up" for a live album, "they said never" for a reunion.

**Why it fits.** The brand keeps the marker for one handwritten line per view, and the news pages have none yet. It is the fan's voice next to the facts.

**Effort.** Small. A list of lines per topic (the owner signs off on the wording), one element, a few lines of CSS.

### 3. A different picture for each of a band's stories
**Idea.** When a band has several stories, each one takes a different frame: the band's photo for the newest, then its most watched concerts in turn, so a band's news page is a contact sheet instead of one photo and typed clippings.

**Why it fits.** A zine never prints the same photo twice on a spread. Today a repeated photo is shown once and the other stories go typed, which is honest but less visual.

**Effort.** Medium. The picture chooser (main agent) would hand out the band's concerts in turn; no design change needed.

## 24 Nov 2026 · after the cookie bar

### 1. A rubber stamp when you choose
**Idea.** Pressing Accept or Decline stamps "COUNTED" or "NOT COUNTED" on the bar (black ink, crooked, 320 ms, one bounce) before the bar is lifted off.

**Why it fits.** Things get stamped and lifted, never faded. Today the bar just disappears; a stamp tells the visitor the choice was taken, in the zine's hand.

**Effort.** Small. One element and a few lines of CSS; with reduced motion the bar simply goes.

### 2. The choice typed in the footer
**Idea.** Next to "Cookie settings" the footer types the current choice: "COOKIES: OFF" or "COOKIES: ON".

**Why it fits.** On the fan's side: you see what you chose without opening anything. It reads like the typed data lines everywhere else.

**Effort.** Small. The choice is already known in the browser; one typed label.

### 3. The cookie bar on the kit page
**Idea.** Show the bar and its states (first visit, "Now: accepted", on a phone, lying in the page) on `/kit`, like every other component.

**Why it fits.** The kit is where the owner checks the whole system on one page; the bar only shows where analytics is on, so today it is hard to look at.

**Effort.** Small. A static copy of the markup on the kit page, no logic.

---

## 2026-11-24 · after the two homepage directions (A "the issue", B "the wall")

### 1. The owner picks the cover
**Idea.** The gig of the week turns through the bands A to Z, so this week the cover of a site with Metallica, Radiohead and Pearl Jam on it is a band most visitors have never heard of. Let the cover be chosen: `data/home-picks.json` already takes a pinned gig; add a short list of "cover-worthy" gigs (a famous band, a setlist with times, a good photo) that the weekly turn draws from, and keep A to Z for the days nobody picked.

**Why it fits.** A zine's cover is the one page somebody decides on. It is also the first picture a new visitor and a search preview see.

**Effort.** Small. A list in the picks file and one rule in the weekly pick (engineering); no new design.

### 2. One song, every night it was played
**Idea.** "By song" on the homepage is eight Metallica songs, because Metallica has the most gigs. Show one song per band instead (each band's most played), and give the line a play label: press it and the player jumps straight into that song in the most watched gig that has it.

**Why it fits.** It shows off what nobody else has: the setlists are clickable. One press on the homepage and you are inside the song.

**Effort.** Small for the list (one rule in `topSongs`), medium for the play label (needs the song's time in the chosen gig).

### 3. The reel remembers where you stood
**Idea.** In direction B the places are a reel you walk along. Add two cut-paper arrows at its ends (the "next" icon from the kit, on its 48 px label) that move the reel by one poster, and remember the position when you come back from a place's page.

**Why it fits.** A wall of posters is something you walk along; on a desktop without a trackpad the arrows are the legs. Nothing fades or slides by itself.

**Effort.** Small. A few lines of script on a list that already works without it.

### 4. A map of the fields
**Idea.** OpenDecks has an atlas. Ours could be a photocopied outline map of Europe with a staple where each of the top festivals is, the number of gigs written beside it in marker; a staple opens the festival's page.

**Why it fits.** "Where it happened" becomes a real where. A hand-marked map is pure zine.

**Effort.** Medium to large. Needs coordinates for the places (engineering) and one drawn map (design).

### 5. "On this day"
**Idea.** A small sticker in the hero: "24 November 1991: Nirvana played Paradiso. It is here." when a gig in the pile was played on today's date.

**Why it fits.** A reason to come back every day, built only from dates we store.

**Effort.** Small. One query by day and month; one sticker from the kit.

---

## 2026-11-24 · after "the issue" became the homepage (picture-led back pages)

Done from the list above: 1 (the cover turns through famous gigs) and the first half of 2 (one song per band). Idea 3 went with direction B.

### 1. A song tile that plays the song
**Idea.** "Chase a song" tiles open the song's page. Give each a play label on its picture's mount: press it and the player jumps straight into that song in the most watched gig that has it.

**Why it fits.** One press on the homepage and you are inside "Paranoid Android". Nobody else can do that; it is the setlist idea made loud.

**Effort.** Medium. Needs the song's time in the chosen gig from `homepageData()` (engineering); the label is already in the kit.

### 2. The shelves as crates
**Idea.** "Off the shelves" is now the most typed part of the page (three lists of six lines). Turn each shelf into a crate you flick through: one swipe row of gig pictures per shelf, the bootleg stamp on the mount, the typed list gone.

**Why it fits.** Same cure the back pages just got. A crate of tapes is something you dig in, not read.

**Effort.** Small to medium. Design only: the data is already there.

### 3. Different pictures for every tile
**Idea.** Two tiles can show the same gig (the most watched gig of the 2010s is also the most watched alternative gig). Let the page ask for the second or third most watched gig when the first is already up.

**Why it fits.** On a photocopied page, the same picture twice looks like a mistake, not a choice.

**Effort.** Small. `fallback` becomes a short list in `homepageData()` (engineering); the page already keeps track of what is glued on.


---

## 2026-11-24 · after the shelves became crates

Done from the list above: 2 (the shelves as crates; owner: "go ahead with the shelves as pictures too").

### 1. The album's sleeve note on the crate
**Idea.** A live album tile only says "THE ALBUM: title (year)". Add one marker line per crate front: "you can buy this one. or watch it here." and link the album's title to its MusicBrainz page (we already hold the link).

**Why it fits.** It says out loud what makes this shelf special: these nights were pressed on a record.

**Effort.** Small. Design only: the link is already in `homepageData()`.

### 2. HD as a stamp, everywhere
**Idea.** A small rubber stamp "HD" (same family as the Bootleg stamp, black ink, under the picture, never on it) on any gig filmed in HD: in the crates, in "Fresh off the copier" and in the lists.

**Why it fits.** The zine already speaks in stamps. One more tells you which gig to put on the big screen.

**Effort.** Small to medium. Needs an `hd` flag on the concert view (engineering); the stamp is a kit piece.

### 3. A fourth crate: "Longest nights"
**Idea.** One more crate of the longest gigs in the pile ("3 hours 12. bring water."), most minutes first.

**Why it fits.** "The whole set" is the promise; the longest sets are the proof, and the lengths are funny on their own.

**Effort.** Small. One more shelf from `homepageData()` (engineering); the crate takes it as it is. Four crates would sit two by two on a desktop.

## 2026-11-25 · after the mini-player room fix

Nothing here is built. Owner approval first.

### 1. The room under the page says something
**Idea.** The empty strip the page now keeps for the mini-player gets one handwritten line on the left, away from the window ("still playing. keep digging."), in Permanent Marker.

**Why it fits.** It is the page's one handwritten line where there is otherwise blank paper, and it tells the fan the gig goes with them.

**Effort.** Small. One line in the spacer, design only. Never under or on the video.

### 2. The mini-player snaps to a corner
**Idea.** When the window is put down it slaps into the nearest corner (16 px from the edges) instead of staying wherever it was dropped.

**Why it fits.** Things get slapped down in this zine, and a window in a corner covers the least page: fewer links to scroll out from under it.

**Effort.** Small to medium. Placement lives in `useMiniPlayer` (engineering); the slap is a kit motion, off with reduced motion.

### 3. A smaller window on phones
**Idea.** On a phone the mini-player takes the 200 px square video the bar already uses there, instead of the 356 px one that fills the width.

**Why it fits.** At 380 px the window covers almost a third of the screen. The square leaves half the width for the page and still respects the 200x200 minimum.

**Effort.** Small. CSS for the window width and height; `MiniRoom` measures it by itself.

## 2026-11-25 · after "a picture opens, a play button plays"

### 1. "Play it instead" on the gig page while another gig is on
**Idea.** When a visitor opens a gig's page while another gig is playing, the page's big play button reads "Play this instead" and a typed line under it names what is on ("on now: Metallica, Slane 2019").

**Why it fits.** The picture no longer switches the music, so the page should say out loud what one press will do. Short, on the fan's side, and the pink stays on one thing.

**Effort.** Small. Wording and one typed line in the player slot; the state (`current`) is already there.

### 2. The bar remembers the song, not only the second
**Idea.** After a reload the marker line says where the visitor was in the set: "left off at: Enter Sandman" when the setlist has times, else the plain line.

**Why it fits.** The setlist is a first-class object, and a song name is a better reason to press play than "0:47:12".

**Effort.** Small to medium. Engineering passes the song at the saved second to the bar; design is one line.

### 3. A dog-eared corner on pictures already seen
**Idea.** A gig the visitor has opened before gets a folded paper corner on its frame (on the black frame, never on the picture) in lists and crates.

**Why it fits.** Zines get dog-eared. It tells a returning fan what is new to them without a "watched" badge, and nothing touches the YouTube picture.

**Effort.** Medium. A list of opened gigs kept in the browser (engineering, no account), one small cut-paper corner in the kit.
