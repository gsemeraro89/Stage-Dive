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
