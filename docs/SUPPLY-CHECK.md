# STAGEDIVE: supply check (17 Nov 2026)

Quick manual check, done before building, of how many official, free, full concerts (40 min or more) exist on YouTube. Seed list: `stagedive-seed-concerts.csv` (18 candidates).

**Not verified yet (Claude Code must do this with the YouTube Data API before seeding):** embeddable, public, length of at least 40 min, region restrictions (ES / IT / UK / US / DE at least), and the uploader channel where it's marked "unknown - check".

## Per band
| Band | Official full shows found | Verdict |
|---|---|---|
| Metallica | Many: #MetallicaMondays put a full show a week on their channel (1983–2019) | Excellent. 4 IDs in the seed list; the collector should read the whole channel |
| The Cure | 3 (Troxy 2024, Sydney 2019, Primavera 2026) | OK, but each one is at risk (livestream "for a time", or now a paid film) |
| Linkin Park | 2 (Pinkpop 2012, Rock in Rio Lisboa 2026) | OK |
| Limp Bizkit | 2 (Pinkpop 1997, 2001) | OK |
| Depeche Mode | 1 (Berlin 2017, ~1 h). LiVE SPiRiTS was a one-time stream | Thin. Also synth-pop: no matching genre in the brief's list |
| The Rolling Stones | 0. "Extra Licks" episodes are ~30 min of clips; the "full concert" uploads are fan channels | **Not on the site under the current rules** |

## What this means for the build
1. **Festival archives are the best source, not band channels.** Pinkpop Archive alone has NTR's recordings from 1992 onward (1,500+ performances) and keeps adding full sets. Put festival/broadcaster archive channels first in the collector's source list: Pinkpop Archive, Rock in Rio, Primavera Sound, Arte Concert, etc.
2. **Takedowns are normal.** UMG pulled Pearl Jam's full Pinkpop 1992; Magenta Musik removed all Linkin Park Rock am Ring 2026 uploads within days; livestreams are often temporary. A nightly availability check that hides dead videos is essential (OpenDecks already has the refresh job; make "removed" a status, not an error).
3. **Legacy acts on major labels (Stones-type) mostly exist only as fan uploads.** Expect gaps for some big names; decide whether band pages can exist with zero playable shows (suggestion: no).
4. **Genre list:** add something like "new wave / synth" if Depeche Mode-type acts stay in.

## Decisions
- 17 Nov 2026: Rolling Stones stay out for now (official-only rule kept). Revisit later: possibly allow labelled pro-shot fan uploads ("bootleg" sticker) once the site has traffic.
