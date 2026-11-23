// News pictures (owner, 23 Nov 2026: "the news section has to be more visual, similar to what we did on
// OpenDecks"): every story's subject, the order its picture is chosen in, free festival photos (matching,
// job) and the data the visual layout uses (lead story, topic stamp). src/lib/news/{subject,covers,festival-photos,topics}.ts.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client";
import { chooseNewsCover, foldName, type NewsCoverSources } from "../src/lib/news/covers";
import {
  festivalHits,
  festivalSearchNames,
  findFestivalPhoto,
  isLogoOrGraphic,
  namedLikeTheFestival,
  refreshFestivalPhotos,
  showsAnArtist,
  toFestivalPhotoView,
  type FestivalPhotoDeps,
} from "../src/lib/news/festival-photos";
import { leadStoryId } from "../src/lib/news/queries";
import { backfillNewsSubjects, newsSubject, storedSubject, subjectColumns } from "../src/lib/news/subject";
import { topicLabel, TOPIC_LABELS } from "../src/lib/news/topics";
import { TOPICS } from "../src/lib/news/writer";
import type { CommonsPhoto } from "../src/lib/photos/wikimedia";
import { BANNED } from "./fixtures/concert-view";

describe("news subject", () => {
  it("is the first band of a story", () => {
    expect(newsSubject({ topic: "tour", bandSlugs: ["muse", "blur"], venueSlug: null })).toEqual({ kind: "band", slug: "muse" });
    expect(newsSubject({ topic: "tour", bandSlugs: ["muse"], venueSlug: "hellfest" })).toEqual({ kind: "band", slug: "muse" });
  });
  it("is the festival for a line-up story naming several bands, or a story with no band", () => {
    expect(newsSubject({ topic: "festival", bandSlugs: ["metallica", "ghost"], venueSlug: "hellfest" })).toEqual({ kind: "venue", slug: "hellfest" });
    expect(newsSubject({ topic: "reunion", bandSlugs: [], venueSlug: "hellfest" })).toEqual({ kind: "venue", slug: "hellfest" });
  });
  it("is the band when a festival story is about one booking", () => {
    expect(newsSubject({ topic: "festival", bandSlugs: ["metallica"], venueSlug: "hellfest" })).toEqual({ kind: "band", slug: "metallica" });
  });
  it("is none for a story with neither", () => {
    expect(newsSubject({ topic: "other", bandSlugs: [], venueSlug: null })).toBeNull();
    expect(subjectColumns({ topic: "other", bandSlugs: [], venueSlug: null })).toEqual({ subject: null, subjectKind: null });
  });
  it("reads the stored subject first, else works it out", () => {
    expect(storedSubject({ subject: "ghost", subjectKind: "band", topic: "festival", bandSlugs: ["metallica", "ghost"], venueSlug: "hellfest" })).toEqual({ kind: "band", slug: "ghost" });
    expect(storedSubject({ subject: null, subjectKind: null, topic: "tour", bandSlugs: ["muse"], venueSlug: null })).toEqual({ kind: "band", slug: "muse" });
    expect(storedSubject({ subject: "x", subjectKind: "nonsense", topic: "tour", bandSlugs: ["muse"], venueSlug: null })).toEqual({ kind: "band", slug: "muse" });
  });
});

describe("news-subjects backfill (admin op)", () => {
  type Row = { id: number; topic: string; bandSlugs: string[]; venueSlug: string | null; subject: string | null; subjectKind: string | null; updatedAt: Date };
  const fake = (rows: Row[]) => {
    const updates: { id: number; data: Record<string, unknown> }[] = [];
    const db = {
      newsArticle: {
        findMany: async ({ where }: { where: { subject?: null } }) => rows.filter((r) => !("subject" in where) || r.subject === null),
        update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          updates.push({ id: where.id, data });
          Object.assign(rows.find((r) => r.id === where.id)!, data);
        },
      },
    };
    return { db: db as unknown as PrismaClient, updates };
  };
  const old = new Date("2026-11-21T10:00:00Z");
  const rows = (): Row[] => [
    { id: 1, topic: "tour", bandSlugs: ["muse"], venueSlug: null, subject: null, subjectKind: null, updatedAt: old },
    { id: 2, topic: "festival", bandSlugs: ["metallica", "ghost"], venueSlug: "hellfest", subject: null, subjectKind: null, updatedAt: old },
    { id: 3, topic: "other", bandSlugs: [], venueSlug: null, subject: null, subjectKind: null, updatedAt: old },
    { id: 4, topic: "tour", bandSlugs: ["blur"], venueSlug: null, subject: "blur", subjectKind: "band", updatedAt: old },
  ];

  it("fills the articles without a subject and keeps their updated date", async () => {
    const { db, updates } = fake(rows());
    const r = await backfillNewsSubjects(db);
    expect(r).toEqual({ looked: 3, set: 2, none: 1, byKind: { band: 1, venue: 1 } });
    expect(updates).toEqual([
      { id: 1, data: { subject: "muse", subjectKind: "band", updatedAt: old } },
      { id: 2, data: { subject: "hellfest", subjectKind: "venue", updatedAt: old } },
    ]);
  });

  it("a second run changes nothing; 'all' writes only what differs", async () => {
    const data = rows();
    const { db, updates } = fake(data);
    await backfillNewsSubjects(db);
    updates.length = 0;
    expect((await backfillNewsSubjects(db)).set).toBe(0);
    expect((await backfillNewsSubjects(db, { all: true })).set).toBe(0);
    expect(updates).toEqual([]);
  });
});

// ---- Cover order ----

const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const listCover = (id: string) => ({ youtubeId: id, thumbnail: { src: thumbUrl(id), srcSet: `${thumbUrl(id)} 480w`, width: 480, height: 360 }, portrait: false });
const bandPhoto = (slug: string) => ({
  src: `/photos/bands/${slug}?v=1`,
  width: 960,
  height: 720,
  credit: `Photo: Jane Doe / CC BY-SA 4.0, via Wikimedia Commons (photocopied by STAGEDIVE, shared under the same licence)`,
  author: "Jane Doe",
  sourcePage: `https://commons.wikimedia.org/wiki/File:${slug}.jpg`,
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
});
const festPhoto = (slug: string) =>
  toFestivalPhotoView(slug, {
    width: 960,
    height: 720,
    author: "John Roe",
    license: "CC BY 2.0",
    licenseUrl: null,
    sourcePage: `https://commons.wikimedia.org/wiki/File:${slug}_crowd.jpg`,
    updatedAt: new Date(0),
  })!;

function sources(o: Partial<{ bandPhotos: string[]; festivalPhotos: string[]; bandConcerts: string[]; noBandCover: string[] }> = {}): NewsCoverSources {
  const bands = ["muse", "metallica", "ghost", "motorhead"];
  const names: Record<string, string> = { muse: "Muse", metallica: "Metallica", ghost: "Ghost", motorhead: "Motörhead" };
  return {
    bands: new Map(bands.map((b) => [b, { name: names[b], cover: o.noBandCover?.includes(b) ? null : listCover(`${b}-newest`) }])),
    festivals: new Map([
      ["hellfest", { name: "Hellfest", cover: listCover("hellfest-newest") }],
      ["pinkpop", { name: "Pinkpop", cover: null }],
    ]),
    bandByName: new Map(bands.map((b) => [foldName(names[b]), b])),
    bandPhotos: new Map((o.bandPhotos ?? []).map((b) => [b, bandPhoto(b)])),
    festivalPhotos: new Map((o.festivalPhotos ?? []).map((f) => [f, festPhoto(f)])),
    bandConcerts: new Map((o.bandConcerts ?? []).map((b) => [b, { youtubeId: `${b}-top`, thumbnailUrl: null }])),
  };
}

const story = (o: Partial<Parameters<typeof chooseNewsCover>[0]> = {}) => ({ topic: "tour", bandSlugs: ["muse"], venueSlug: null, ...o });

describe("news cover order", () => {
  it("1. the subject band's photo, with its credit", () => {
    const c = chooseNewsCover(story({ venueSlug: "hellfest" }), sources({ bandPhotos: ["muse"], festivalPhotos: ["hellfest"], bandConcerts: ["muse"] }));
    expect(c).toMatchObject({ kind: "band-photo", src: "/photos/bands/muse?v=1", of: "Muse" });
    expect(c?.credit).toMatchObject({ author: "Jane Doe", license: "CC BY-SA 4.0", sourcePage: "https://commons.wikimedia.org/wiki/File:muse.jpg" });
    expect(c?.credit?.line).toMatch(/^Photo: Jane Doe \/ CC BY-SA 4\.0, via Wikimedia Commons/);
  });

  it("2. the festival's photo, with its credit, when the band has none", () => {
    const c = chooseNewsCover(story({ venueSlug: "hellfest" }), sources({ festivalPhotos: ["hellfest"], bandConcerts: ["muse"] }));
    expect(c).toMatchObject({ kind: "festival-photo", of: "Hellfest", src: "/photos/festivals/hellfest?v=0" });
    expect(c?.credit).toMatchObject({ author: "John Roe", license: "CC BY 2.0" });
  });

  it("3. the subject band's most watched concert", () => {
    const c = chooseNewsCover(story(), sources({ bandConcerts: ["muse", "metallica"] }));
    expect(c).toMatchObject({ kind: "band-concert", of: "Muse" });
    expect(c?.src).toContain("/muse-top/");
    expect(c?.srcSet).toBeTruthy();
    expect(c?.credit).toBeUndefined();
    // No concert read for it: the picture its band page uses.
    expect(chooseNewsCover(story(), sources())?.src).toContain("/muse-newest/");
  });

  it("4. a story about the festival: the festival's photo, else its newest concert, before any band", () => {
    const lineup = story({ topic: "festival", bandSlugs: ["metallica", "ghost"], venueSlug: "hellfest" });
    expect(chooseNewsCover(lineup, sources({ festivalPhotos: ["hellfest"], bandPhotos: ["metallica"] }))?.kind).toBe("festival-photo");
    expect(chooseNewsCover(lineup, sources({ bandConcerts: ["metallica"] }))).toMatchObject({ kind: "festival-concert", of: "Hellfest" });
  });

  it("5. any other band named in the story, its bands first, then the artists it names", () => {
    const s = sources({ bandConcerts: ["metallica"], noBandCover: ["muse"] });
    expect(chooseNewsCover(story({ bandSlugs: ["muse", "metallica"] }), s)).toMatchObject({ kind: "band-concert", of: "Metallica" });
    // A festival story whose festival has no concert picture: the bands' concerts.
    const pinkpop = story({ topic: "festival", bandSlugs: ["muse", "ghost"], venueSlug: "pinkpop" });
    expect(chooseNewsCover(pinkpop, sources({ bandConcerts: ["ghost"], noBandCover: ["muse"] }))).toMatchObject({ of: "Ghost" });
    // Named only in the text ("Motörhead" spelled as in the source).
    const named = story({ bandSlugs: ["muse"], artists: ["Lemmy", "Motorhead"] });
    expect(chooseNewsCover(named, sources({ bandConcerts: ["motorhead"], noBandCover: ["muse"] }))).toMatchObject({ of: "Motörhead" });
  });

  it("6. the festival's newest concert, 7. none", () => {
    const s = sources({ noBandCover: ["muse"] });
    expect(chooseNewsCover(story({ venueSlug: "hellfest" }), s)).toMatchObject({ kind: "festival-concert", of: "Hellfest" });
    expect(chooseNewsCover(story({ venueSlug: "pinkpop" }), s)).toBeNull();
    expect(chooseNewsCover(story({ bandSlugs: ["not-on-the-site"] }), s)).toBeNull();
  });

  it("follows the stored subject", () => {
    const s = sources({ bandPhotos: ["metallica", "ghost"] });
    expect(chooseNewsCover(story({ bandSlugs: ["metallica", "ghost"], subject: "ghost", subjectKind: "band" }), s)?.of).toBe("Ghost");
  });
});

describe("lead story and topic stamp (visual news)", () => {
  it("the lead story is the newest with a picture", () => {
    const pic = { src: "x", width: 1, height: 1, of: "Muse", kind: "band-concert" as const };
    expect(leadStoryId([{ id: 9, cover: null }, { id: 8, cover: pic }, { id: 7, cover: pic }])).toBe(8);
    expect(leadStoryId([{ id: 9, cover: null }])).toBeNull();
    expect(leadStoryId([])).toBeNull();
  });
  it("every topic has a short label, within the copy rules", () => {
    for (const t of TOPICS) expect(TOPIC_LABELS[t], t).toBeTruthy();
    expect(topicLabel("live-release")).toBe("Live album");
    expect(topicLabel("line-up-change")).toBe("Line-up");
    expect(topicLabel("new-music")).toBe("New music");
    expect(topicLabel("other")).toBe("News");
    expect(topicLabel("something-new")).toBe("News");
    for (const l of Object.values(TOPIC_LABELS)) expect(l).not.toMatch(BANNED);
  });
});

// ---- Festival photos ----

describe("festival photos (Wikidata search)", () => {
  it("keeps only results described as a music festival and named like ours", () => {
    const hits = [
      { id: "Q1", label: "Hellfest", description: "French heavy metal festival" },
      { id: "Q2", label: "Hellfest", description: "2018 horror film" },
      { id: "Q3", label: "Pants Festival", description: "music festival" },
      { id: "Q4", label: "Hellfest Open Air", description: "annual rock and metal festival in Clisson, France" },
      { id: "Q5", label: "Hellfest", description: "film festival in Texas" },
    ];
    expect(festivalHits("Hellfest", hits).map((h) => h.id)).toEqual(["Q1", "Q4"]);
    expect(festivalHits("Clisson", hits)).toEqual([]);
    expect(festivalHits("Wacken Open Air", [{ id: "Q6", label: "Wacken Open Air", description: "heavy metal open air in Germany" }]).map((h) => h.id)).toEqual(["Q6"]);
    expect(festivalHits("Pinkpop", [{ id: "Q7", label: "Pinkpop Festival", description: "annual music festival in the Netherlands" }]).map((h) => h.id)).toEqual(["Q7"]);
  });
  it("searches under the festival's own names", () => {
    expect(festivalSearchNames("Wacken Open Air")).toEqual(["Wacken Open Air", "Wacken"]);
    expect(festivalSearchNames("Rock Werchter 2019 (Main Stage)")).toEqual(["Rock Werchter", "Rock Werchter 2019 (Main Stage)"]);
  });
});

describe("festival photos: the festival, not a band, not a logo", () => {
  const ours = ["Metallica", "Rage Against the Machine", "Muse", "The Cure"];
  it("refuses a file named after one of our bands", () => {
    expect(showsAnArtist("Metallica, Rock am Ring 2014.jpg", ours)).toBe(true);
    expect(showsAnArtist("RageAgainstTheMachine Pinkpop.jpg", ours)).toBe(true);
    expect(showsAnArtist("Cure at Glastonbury 2019.jpg", ours)).toBe(true);
    expect(showsAnArtist("Wacken 2016 crowd.jpg", ours)).toBe(false);
    expect(showsAnArtist("Rock am Ring main stage.jpg", ours)).toBe(false);
  });
  it("refuses logos, posters and maps", () => {
    expect(isLogoOrGraphic("Hellfest logo.svg")).toBe(true);
    expect(isLogoOrGraphic("Wacken Open Air Logo.png")).toBe(true);
    expect(isLogoOrGraphic("Download Festival 2019 poster.jpg")).toBe(true);
    expect(isLogoOrGraphic("Hellfest 2017 Mainstage.jpg")).toBe(false);
  });
  it("keeps files named after the festival or a festival scene, not portraits", () => {
    expect(namedLikeTheFestival("James Hetfield.jpg", ["Download Festival"])).toBe(false);
    expect(namedLikeTheFestival("Hellfest2017Mainstage.jpg", ["Hellfest"])).toBe(true);
    expect(namedLikeTheFestival("WOA 2016 crowd.jpg", ["Wacken Open Air"])).toBe(true);
    expect(namedLikeTheFestival("Clisson 2012 001.jpg", ["Hellfest", "Hellfest Open Air"])).toBe(false);
    expect(namedLikeTheFestival("Pinkpop 2008 (2).jpg", ["Pinkpop"])).toBe(true);
  });
});

const commons = (file: string, license = "CC BY-SA 4.0"): CommonsPhoto => ({
  title: `File:${file}`,
  imageUrl: `https://upload.wikimedia.org/${encodeURIComponent(file)}`,
  pageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
  author: "Jane Doe",
  license,
  licenseUrl: null,
});

describe("finding a festival's photo", () => {
  const search = async (name: string) =>
    name === "Hellfest"
      ? [
          { id: "Q1", label: "Hellfest", description: "French metal festival" },
          { id: "Q2", label: "Hellfest", description: "music festival edition" },
        ]
      : [];
  it("skips a logo and takes the next item's photo", async () => {
    const files: Record<string, CommonsPhoto> = { Q1: commons("Hellfest logo.svg"), Q2: commons("Hellfest 2017 Mainstage.jpg") };
    const r = await findFestivalPhoto("Hellfest", { search, findPhoto: async (q) => ({ photo: files[q] ?? null }) }, ["Metallica"]);
    expect(r).toMatchObject({ qid: "Q2", photo: { title: "File:Hellfest 2017 Mainstage.jpg" } });
  });
  it("says why there is none", async () => {
    expect(await findFestivalPhoto("Nowhere Fest", { search, findPhoto: async () => ({ photo: null }) }, [])).toEqual({ qid: null, photo: null, skipped: "not on Wikidata" });
    const band = await findFestivalPhoto("Hellfest", { search, findPhoto: async () => ({ photo: commons("Metallica Hellfest 2022.jpg") }) }, ["Metallica"]);
    expect(band).toMatchObject({ qid: "Q1", photo: null });
    expect(band.skipped).toMatch(/one band/);
    const nc = await findFestivalPhoto("Hellfest", { search, findPhoto: async () => ({ photo: null, skipped: "licence does not allow changes (CC BY-NC 2.0)" }) }, []);
    expect(nc.skipped).toMatch(/licence/);
  });
});

describe("festival photo job", () => {
  const NOW = new Date("2026-11-23T12:00:00Z");
  async function jpeg() {
    return sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 120, g: 60, b: 30 } } }).jpeg().toBuffer();
  }
  function fakeDb(photos: Map<number, Record<string, unknown>>) {
    const venues = [
      { id: 1, slug: "hellfest", name: "Hellfest" },
      { id: 2, slug: "pinkpop", name: "Pinkpop" },
      { id: 3, slug: "wacken", name: "Wacken Open Air" },
    ];
    const db = {
      venue: {
        findMany: async () =>
          venues.map((v) => {
            const p = photos.get(v.id);
            return { ...v, photo: p ? { sourceTitle: p.sourceTitle ?? null, checkedAt: p.checkedAt, width: p.width ?? null } : null };
          }),
      },
      newsArticle: { findMany: async () => [{ venueSlug: "wacken" }] },
      artist: { findMany: async () => [{ name: "Metallica" }] },
      festivalPhoto: {
        upsert: async ({ where, create, update }: { where: { venueId: number }; create: Record<string, unknown>; update: Record<string, unknown> }) =>
          photos.set(where.venueId, photos.has(where.venueId) ? { ...photos.get(where.venueId), ...update } : create),
        update: async ({ where, data }: { where: { venueId: number }; data: Record<string, unknown> }) => photos.set(where.venueId, { ...photos.get(where.venueId), ...data }),
      },
    };
    return db as unknown as PrismaClient;
  }
  const deps = (img: Buffer, calls: string[]): FestivalPhotoDeps => ({
    search: async (name) => {
      calls.push(`search:${name}`);
      if (name === "Hellfest") return [{ id: "Q1", label: "Hellfest", description: "metal festival" }];
      if (name === "Wacken Open Air") return [{ id: "Q3", label: "Wacken Open Air", description: "heavy metal open air" }];
      return [];
    },
    findPhoto: async (qid) => ({ photo: qid === "Q1" ? commons("Hellfest 2017 Mainstage.jpg") : qid === "Q3" ? commons("Wacken logo.svg") : null }),
    download: async () => img,
  });

  it("photocopies a free photo, records why others have none, festivals in the news first", async () => {
    const photos = new Map<number, Record<string, unknown>>();
    const calls: string[] = [];
    const r = await refreshFestivalPhotos(fakeDb(photos), deps(await jpeg(), calls), { now: NOW });
    expect(calls[0]).toBe("search:Wacken Open Air");
    expect(r.looked).toBe(3);
    expect(r.added).toEqual(["Hellfest: File:Hellfest 2017 Mainstage.jpg (CC BY-SA 4.0)"]);
    expect(r.none.map((x) => x.split(":")[0]).sort()).toEqual(["Pinkpop", "Wacken Open Air"]);
    const hell = photos.get(1)!;
    expect(hell).toMatchObject({ qid: "Q1", author: "Jane Doe", license: "CC BY-SA 4.0", sourceTitle: "File:Hellfest 2017 Mainstage.jpg", skipped: null });
    expect((hell.image as Uint8Array).length).toBeGreaterThan(100);
    expect(photos.get(2)).toMatchObject({ image: null, skipped: "not on Wikidata" });
    expect(String(photos.get(3)!.skipped)).toMatch(/logo/);
  });

  it("looks again only after 30 days, and then refreshes the credit without making the image again", async () => {
    const photos = new Map<number, Record<string, unknown>>();
    const img = await jpeg();
    await refreshFestivalPhotos(fakeDb(photos), deps(img, []), { now: NOW });
    const calls: string[] = [];
    expect((await refreshFestivalPhotos(fakeDb(photos), deps(img, calls), { now: new Date(NOW.getTime() + 5 * 86_400_000) })).looked).toBe(0);
    expect(calls).toEqual([]);
    let downloads = 0;
    const later = { ...deps(img, []), download: async () => (downloads++, img) };
    const r = await refreshFestivalPhotos(fakeDb(photos), later, { now: new Date(NOW.getTime() + 31 * 86_400_000) });
    expect(r.looked).toBe(3);
    expect(r.added).toEqual([]);
    expect(downloads).toBe(0);
  });

  it("takes a photo off when its licence no longer allows changes", async () => {
    const photos = new Map<number, Record<string, unknown>>();
    const img = await jpeg();
    await refreshFestivalPhotos(fakeDb(photos), deps(img, []), { now: NOW });
    const nc = { ...deps(img, []), findPhoto: async () => ({ photo: null, skipped: "licence does not allow changes (CC BY-NC 2.0)" }) };
    const r = await refreshFestivalPhotos(fakeDb(photos), nc, { now: NOW, force: true });
    expect(r.removed).toEqual(["Hellfest: licence does not allow changes (CC BY-NC 2.0)"]);
    expect(photos.get(1)).toMatchObject({ image: null, width: null, author: null });
  });

  it("a stored row without a photo is not shown", () => {
    expect(toFestivalPhotoView("x", { width: null, height: null, author: null, license: null, licenseUrl: null, sourcePage: null, updatedAt: NOW })).toBeNull();
  });
});
