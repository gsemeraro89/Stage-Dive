// Band photos: licences, Commons/Wikidata parsing, the photocopy treatment, and the job (database).
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { wikidataIdFromRelations } from "../src/lib/collector/musicbrainz";
import { PAPER, photocopy, prng, screen, TONER } from "../src/lib/photos/photocopy";
import { creditLine, imageFromEntity, licenseAllowsChanges, photoFromImageInfo, plainText } from "../src/lib/photos/wikimedia";

describe("licences that allow a photocopied version", () => {
  it("takes public domain, CC0, CC BY and CC BY-SA", () => {
    for (const l of ["Public domain", "PD", "CC0", "CC BY 2.0", "CC BY-SA 4.0", "CC BY-SA 3.0 de", "cc-by-sa-2.5", "CC BY"]) {
      expect(licenseAllowsChanges(l), l).toBe(true);
    }
  });
  it("never takes NoDerivatives, NonCommercial, fair use or unknown", () => {
    for (const l of ["CC BY-ND 2.0", "CC BY-NC 2.0", "CC BY-NC-SA 4.0", "CC BY-NC-ND 3.0", "Fair use", "GFDL", "", null, "All rights reserved"]) {
      expect(licenseAllowsChanges(l), String(l)).toBe(false);
    }
  });
});

describe("Wikidata and Commons answers", () => {
  it("reads the Wikidata link from MusicBrainz relations", () => {
    expect(
      wikidataIdFromRelations([
        { type: "wikidata", ended: true, url: { resource: "https://www.wikidata.org/wiki/Q1" } },
        { type: "wikidata", url: { resource: "https://www.wikidata.org/wiki/Q15920" } },
      ]),
    ).toBe("Q15920");
    expect(wikidataIdFromRelations([{ type: "youtube", url: { resource: "https://youtube.com/@x" } }])).toBeNull();
  });
  it("reads the image (P18) of a Wikidata item", () => {
    const entity = { entities: { Q15920: { claims: { P18: [{ mainsnak: { datavalue: { value: "Metallica live.jpg" } } }] } } } };
    expect(imageFromEntity(entity, "Q15920")).toBe("Metallica live.jpg");
    expect(imageFromEntity({ entities: { Q1: { claims: {} } } }, "Q1")).toBeNull();
  });
  it("reads file, author and licence from Commons, as plain text", () => {
    const answer = {
      query: {
        pages: {
          "-1": {
            title: "File:Metallica live.jpg",
            imageinfo: [
              {
                thumburl: "https://upload.wikimedia.org/thumb/1200px-x.jpg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:Metallica_live.jpg",
                extmetadata: {
                  Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane &amp; Co</a>' },
                  LicenseShortName: { value: "CC BY-SA 4.0" },
                  LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                },
              },
            ],
          },
        },
      },
    };
    expect(photoFromImageInfo(answer)).toEqual({
      title: "File:Metallica live.jpg",
      imageUrl: "https://upload.wikimedia.org/thumb/1200px-x.jpg",
      pageUrl: "https://commons.wikimedia.org/wiki/File:Metallica_live.jpg",
      author: "Jane & Co",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    });
    expect(photoFromImageInfo({ query: { pages: {} } })).toBeNull();
    expect(plainText("<b>A</b>&nbsp; B")).toBe("A B");
  });
  it("credits author and licence, and says the photo was changed", () => {
    expect(creditLine({ author: "Jane", license: "CC BY 2.0" })).toBe("Photo: Jane / CC BY 2.0, via Wikimedia Commons (photocopied by STAGEDIVE)");
    expect(creditLine({ author: "Jane", license: "CC BY-SA 4.0" })).toContain("shared under the same licence");
  });
});

describe("photocopy treatment", () => {
  it("keeps the brightest channel: a red stage light stays paper, not grey", () => {
    const red = new Uint8Array([255, 0, 0]);
    const black = new Uint8Array([10, 10, 10]);
    const o = { cell: 6, black: 70, white: 190 };
    expect(screen(red, 1, 1, o)[0]).toBe(0);
    expect(screen(black, 1, 1, o)[0]).toBe(1);
  });
  it("turns mid-grey into a dot screen with about the right amount of toner", () => {
    const w = 120;
    const h = 120;
    const grey = new Uint8Array(w * h * 3).fill(130); // halfway between the crush levels
    const ink = screen(grey, w, h, { cell: 6, black: 70, white: 190 });
    const share = ink.reduce((n, v) => n + v, 0) / ink.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });
  it("prints a two-colour PNG, toner on paper, the same every time", async () => {
    const gradient = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 120, g: 90, b: 200 } } })
      .composite([{ input: Buffer.from('<svg width="400" height="300"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>') }])
      .jpeg()
      .toBuffer();
    const a = await photocopy(gradient, { width: 240, height: 180, seed: "metallica" });
    const b = await photocopy(gradient, { width: 240, height: 180, seed: "metallica" });
    expect(a.png.equals(b.png)).toBe(true);
    const { data, info } = await sharp(a.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([240, 180]);
    const colours = new Set<string>();
    for (let i = 0; i < data.length; i += 3) colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    expect([...colours].sort()).toEqual([TONER.join(","), PAPER.join(",")].sort());
    // Another band's copy gets different dirt.
    const c = await photocopy(gradient, { width: 240, height: 180, seed: "the-cure" });
    expect(c.png.equals(a.png)).toBe(false);
  });
  it("has repeatable dirt", () => {
    const r1 = prng("x");
    const r2 = prng("x");
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("band photo job (database)", () => {
  let db: ReturnType<typeof import("../src/lib/db").createPrismaClient>;
  let job: typeof import("../src/lib/photos/job");
  let image: Buffer;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    const { createPrismaClient } = await import("../src/lib/db");
    const { importSeed } = await import("../src/lib/seed/import");
    const { normalizeSeed } = await import("../src/lib/seed/normalize");
    db = createPrismaClient(url);
    job = await import("../src/lib/photos/job");
    await db.$executeRawUnsafe(
      `TRUNCATE band_photos, band_photo_checks, plays, review_queue, artist_lookups, concert_genres, concert_artists, concerts, tours, artists, venues, genres, venue_kinds, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8"))));
    image = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 90, g: 90, b: 90 } } }).jpeg().toBuffer();
  });
  afterAll(async () => db.$disconnect());

  const photo = (title: string, license = "CC BY-SA 4.0") => ({
    title,
    imageUrl: `https://upload.example/${title}`,
    pageUrl: `https://commons.example/${title}`,
    author: "Jane",
    license,
    licenseUrl: null,
  });

  it("stores a photocopied photo with its credit, and records bands without one", async () => {
    let downloads = 0;
    const stats = await job.refreshBandPhotos(db, {
      mbid: async (name) => (name === "Radiohead" ? null : `mbid-${name}`),
      wikidataId: async (mbid) => (mbid === "mbid-Metallica" ? "Q15920" : mbid === "mbid-The Cure" ? "Q1" : null),
      findPhoto: async (q) => (q === "Q15920" ? { photo: photo("File:M.jpg") } : { photo: null, skipped: "licence does not allow changes (CC BY-NC 2.0)" }),
      download: async () => {
        downloads++;
        return image;
      },
    });
    expect(stats.added).toEqual(["Metallica: File:M.jpg (CC BY-SA 4.0)"]);
    expect(stats.skipped).toEqual(
      expect.arrayContaining(["The Cure: licence does not allow changes (CC BY-NC 2.0)", "Radiohead: not found on MusicBrainz"]),
    );
    expect(downloads).toBe(1);
    const stored = await db.bandPhoto.findFirstOrThrow({ where: { artist: { slug: "metallica" } } });
    expect(stored.license).toBe("CC BY-SA 4.0");
    expect((await sharp(Buffer.from(stored.image)).metadata()).format).toBe("png");
    // The guest (Dave Mustaine) has no concert of his own: never looked up.
    expect(await db.bandPhotoCheck.count()).toBe(6);
  });

  it("does not ask again within 90 days; with force, keeps the same file and takes a changed licence off", async () => {
    const calls: string[] = [];
    const deps = {
      mbid: async (n: string) => (calls.push(n), `mbid-${n}`),
      wikidataId: async (m: string) => (m === "mbid-Metallica" ? "Q15920" : null),
      findPhoto: async () => ({ photo: photo("File:M.jpg") }),
      download: async () => image,
    };
    expect((await job.refreshBandPhotos(db, deps)).checked).toBe(0);
    const again = await job.refreshBandPhotos(db, deps, { force: true });
    expect(again.added).toEqual([]);
    expect(again.replaced).toEqual([]);
    const gone = await job.refreshBandPhotos(db, { ...deps, findPhoto: async () => ({ photo: null, skipped: "licence does not allow changes (CC BY-ND 2.0)" }) }, { force: true });
    expect(gone.removed).toEqual(["Metallica (licence does not allow changes (CC BY-ND 2.0))"]);
    expect(await db.bandPhoto.count()).toBe(0);
  });
});
