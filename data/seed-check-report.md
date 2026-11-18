# Seed check — 2026-11-18

18 candidates from data/seed-concerts.csv, checked with the YouTube Data API (1 quota units).
Rules: public, embeddable, at least 40 minutes, not blocked in ES / IT / GB / US / DE, uploader confirmed official.

- Pass: 10 (written to data/seed-concerts.json)
- Owner to decide (uploader not confirmed): 0
- Dropped: 8

| # | Band | Where / when | Video | Uploader (YouTube) | Length | Result |
|---|---|---|---|---|---|---|
| 1 | Metallica | The Metro 1983-08-12 | [abDLUhw-53w](https://www.youtube.com/watch?v=abDLUhw-53w) | Metallica | 0:44 | PASS (channel carries the band's name) |
| 2 | Metallica | L.C. Walker Arena 1991-11-01 | [IA9xKr_Dmek](https://www.youtube.com/watch?v=IA9xKr_Dmek) | Metallica | 2:22 | PASS (channel carries the band's name) |
| 3 | Metallica | Olympiastadion 2004-06-13 | [uCYDSdEu7KQ](https://www.youtube.com/watch?v=uCYDSdEu7KQ) | Metallica | 2:16 | PASS (channel carries the band's name) |
| 4 | Metallica | Yankee Stadium (Big Four) 2011-09-14 | [nbhqDjIWLpk](https://www.youtube.com/watch?v=nbhqDjIWLpk) | Metallica | 2:19 | PASS (channel carries the band's name) |
| 5 | Metallica | The Night Before (Super Bowl) 2022-02-06 | [NYCq51wIR9g](https://www.youtube.com/watch?v=NYCq51wIR9g) | – | – | DROP: not found on YouTube (deleted or private) |
| 6 | The Cure | Troxy 2024-11-01 | [_aWDlaxvEZo](https://www.youtube.com/watch?v=_aWDlaxvEZo) | – | – | DROP: not found on YouTube (deleted or private) |
| 7 | The Cure | Sydney Opera House (Disintegration) 2019-05-30 | [z9uSPf9WDbw](https://www.youtube.com/watch?v=z9uSPf9WDbw) | Sydney Opera House | 2:27 | DROP: not public (unlisted) |
| 8 | The Cure | Primavera Sound 2026-06-05 | [nvHGa6fDhUs](https://www.youtube.com/watch?v=nvHGa6fDhUs) | – | – | DROP: not found on YouTube (deleted or private) |
| 9 | Linkin Park | Pinkpop 2012-05-28 | [vXsFpdYAV9c](https://www.youtube.com/watch?v=vXsFpdYAV9c) | – | – | DROP: not found on YouTube (deleted or private) |
| 10 | Linkin Park | Rock in Rio Lisboa 2026-06 | [LLLlJtb7lKE](https://www.youtube.com/watch?v=LLLlJtb7lKE) | – | – | DROP: not found on YouTube (deleted or private) |
| 11 | Limp Bizkit | Pinkpop 1997 | [o1rkPf9Nd00](https://www.youtube.com/watch?v=o1rkPf9Nd00) | Pinkpop Archive | 0:31 | DROP: too short (31 min) |
| 12 | Limp Bizkit | Pinkpop 2001 | [cyRIdVoDYG4](https://www.youtube.com/watch?v=cyRIdVoDYG4) | Pinkpop Archive | 1:02 | PASS (matches the uploader noted in the CSV (Pinkpop Archive)) |
| 13 | Depeche Mode | Telekom Street Gig - Funkhaus 2017-03-17 | [pIo5HnaaMoc](https://www.youtube.com/watch?v=pIo5HnaaMoc) | – | – | DROP: not found on YouTube (deleted or private) |
| 14 | Foo Fighters | Pinkpop 2008-05-31 | [FPvUDWW5FM8](https://www.youtube.com/watch?v=FPvUDWW5FM8) | Pinkpop Archive | 1:29 | PASS (matches the uploader noted in the CSV (Pinkpop Archive)) |
| 15 | Rancid | Pinkpop 1996 | [C-4nuSB_PRE](https://www.youtube.com/watch?v=C-4nuSB_PRE) | Pinkpop Archive | 0:47 | PASS (matches the uploader noted in the CSV (Pinkpop Archive)) |
| 16 | Korn | Pinkpop 2000 | [IRiOUdF_Cqg](https://www.youtube.com/watch?v=IRiOUdF_Cqg) | Pinkpop Archive | 1:01 | PASS (matches the uploader noted in the CSV (Pinkpop Archive)) |
| 17 | Deftones | Pinkpop 2006 | [-qT4CslPrik](https://www.youtube.com/watch?v=-qT4CslPrik) | Pinkpop Archive | 1:03 | PASS (matches the uploader noted in the CSV (Pinkpop Archive)) |
| 18 | Radiohead | Pinkpop 1996 | [7VBl29wkCX4](https://www.youtube.com/watch?v=7VBl29wkCX4) | Pinkpop Archive | 0:55 | PASS (listed official channel (Pinkpop Archive)) |
