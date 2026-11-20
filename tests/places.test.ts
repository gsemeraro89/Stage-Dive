// One name per place and one form per country: venue matching in the collector, the merge-venue and
// normalize-countries admin ops, and countries on display.
import { describe, expect, it } from "vitest";
import { mergeVenues, normalizeCountries } from "../src/lib/admin/merge";
import { findOrCreateVenue } from "../src/lib/collector/store";
import { countryName, duplicateVenues, matchVenue, sameVenue, venueKey } from "../src/lib/places";

type Db = Parameters<typeof mergeVenues>[0];

describe("countries", () => {
  it("writes every country as its full English name", () => {
    expect(countryName("NL")).toBe("Netherlands");
    expect(countryName("nl")).toBe("Netherlands");
    expect(countryName("Netherlands")).toBe("Netherlands");
    expect(countryName("The Netherlands")).toBe("Netherlands");
    expect(countryName("Holland")).toBe("Netherlands");
    expect(countryName("US")).toBe("United States");
    expect(countryName("USA")).toBe("United States");
    expect(countryName("UK")).toBe("United Kingdom");
    expect(countryName("GB")).toBe("United Kingdom");
    expect(countryName("England")).toBe("England");
    expect(countryName("Scotland")).toBe("Scotland");
    expect(countryName("DE")).toBe("Germany");
    expect(countryName(" Brazil ")).toBe("Brazil");
    expect(countryName("")).toBeNull();
    expect(countryName(null)).toBeNull();
  });
  it("is stable: a full name stays as it is", () => {
    for (const c of ["Netherlands", "United States", "United Kingdom", "Germany", "Czechia"]) expect(countryName(countryName(c))).toBe(c);
  });
});

describe("venue names", () => {
  it("ignores case, accents, punctuation, a leading 'the' and 'festival'/'fest' at either end", () => {
    expect(venueKey("Pinkpop Festival")).toBe("pinkpop");
    expect(venueKey("PINKPOP")).toBe("pinkpop");
    expect(venueKey("The Pinkpop Fest")).toBe("pinkpop");
    expect(venueKey("Festival Pinkpop")).toBe("pinkpop");
    expect(venueKey("Eurockéennes de Belfort")).toBe("eurockeennes de belfort");
    expect(venueKey("Open'er Festival")).toBe("open er");
    expect(venueKey("Bonnaroo Music & Arts Festival")).toBe("bonnaroo music and arts");
    expect(venueKey("Hellfest")).toBe("hellfest");
    expect(venueKey("Festival")).toBe("festival");
  });
  it("matches the same name in the same place, and never across countries or cities", () => {
    const pinkpop = { name: "Pinkpop", city: "Landgraaf", country: "NL" };
    expect(sameVenue(pinkpop, { name: "Pinkpop Festival", city: "Landgraaf", country: "Netherlands" })).toBe(true);
    expect(sameVenue(pinkpop, { name: "Pinkpop Festival", city: null, country: null })).toBe(true);
    expect(sameVenue({ name: "Lollapalooza", city: "Santiago", country: "Chile" }, { name: "Lollapalooza", city: "Chicago", country: "US" })).toBe(false);
    expect(sameVenue({ name: "Music Hall", city: "Houston", country: "US" }, { name: "Music Hall", city: "Dallas", country: "US" })).toBe(false);
    expect(sameVenue({ name: "Olympiapark", city: "Munich", country: "DE" }, { name: "Olympiastadion", city: "Munich", country: "DE" })).toBe(false);
  });
  it("finds the stored venue first, so its name wins, and groups duplicates", () => {
    const stored = [
      { id: 1, name: "Pinkpop", city: "Landgraaf", country: "NL" },
      { id: 2, name: "Pinkpop Festival", city: "Landgraaf", country: "Netherlands" },
      { id: 3, name: "Hellfest", city: "Clisson", country: "France" },
    ];
    expect(matchVenue(stored, { name: "The Pinkpop Festival", city: null, country: "Netherlands" })?.id).toBe(1);
    expect(matchVenue(stored, { name: "Graspop", city: null, country: null })).toBeNull();
    expect(duplicateVenues(stored).map((g) => g.map((v) => v.id))).toEqual([[1, 2]]);
  });
});

/** A tiny in-memory stand-in for the venue, alias and concert tables. */
function fakeDb() {
  const venues = [
    { id: 1, slug: "pinkpop", name: "Pinkpop", city: "Landgraaf", country: "NL" as string | null },
    { id: 2, slug: "pinkpop-festival", name: "Pinkpop Festival", city: "Landgraaf", country: "Netherlands" as string | null },
  ];
  const aliases: { slug: string; venueId: number }[] = [{ slug: "pinkpop-fest", venueId: 2 }];
  const concerts = [
    { id: 10, venueId: 1, country: "NL" as string | null },
    { id: 11, venueId: 2, country: "Netherlands" as string | null },
    { id: 12, venueId: 2, country: "US" as string | null },
  ];
  let nextId = 3;
  const match = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && "not" in (v as object) ? row[k] !== (v as { not: unknown }).not : row[k] === v,
    );
  const distinct = <T extends { country: string | null }>(rows: T[]) => [...new Set(rows.map((r) => r.country))].map((country) => ({ country }));
  const db = {
    venue: {
      findUnique: async ({ where }: { where: { slug: string } }) => venues.find((v) => v.slug === where.slug) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { slug: string } }) => {
        const v = venues.find((x) => x.slug === where.slug);
        if (!v) throw new Error("not found");
        return v;
      },
      findMany: async (args: { where?: Record<string, unknown>; distinct?: string[] } = {}) => {
        const rows = venues.filter((v) => match(v, args.where ?? {}));
        return args.distinct ? distinct(rows) : rows;
      },
      create: async ({ data }: { data: (typeof venues)[number] }) => {
        const v = { ...data, id: nextId++ };
        venues.push(v);
        return v;
      },
      update: async ({ where, data }: { where: { id: number }; data: object }) => Object.assign(venues.find((v) => v.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
        const rows = venues.filter((v) => match(v, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      delete: async ({ where }: { where: { id: number } }) => venues.splice(venues.findIndex((v) => v.id === where.id), 1)[0],
    },
    venueAlias: {
      findUnique: async ({ where, include }: { where: { slug: string }; include?: object }) => {
        const a = aliases.find((x) => x.slug === where.slug);
        return a ? { ...a, ...(include ? { venue: venues.find((v) => v.id === a.venueId) } : {}) } : null;
      },
      updateMany: async ({ where, data }: { where: { venueId: number }; data: { venueId: number } }) => {
        const rows = aliases.filter((a) => a.venueId === where.venueId);
        rows.forEach((r) => (r.venueId = data.venueId));
        return { count: rows.length };
      },
      upsert: async ({ where, create, update }: { where: { slug: string }; create: { slug: string; venueId: number }; update: { venueId: number } }) => {
        const a = aliases.find((x) => x.slug === where.slug);
        if (a) Object.assign(a, update);
        else aliases.push({ ...create });
        return a;
      },
      deleteMany: async ({ where }: { where: { slug: string } }) => {
        const i = aliases.findIndex((a) => a.slug === where.slug);
        if (i >= 0) aliases.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
    },
    concert: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
        const rows = concerts.filter((c) => match(c, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      findMany: async (args: { where?: Record<string, unknown>; distinct?: string[] } = {}) => distinct(concerts.filter((c) => match(c, args.where ?? {}))),
    },
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return { db: db as unknown as Db, venues, aliases, concerts };
}

describe("admin op merge-venue", () => {
  it("moves every concert, keeps the target's slug and name, redirects the old slugs and deletes the empty venue", async () => {
    const { db, venues, aliases, concerts } = fakeDb();
    expect(await mergeVenues(db, "pinkpop-festival", "pinkpop")).toEqual({ from: "pinkpop-festival", into: "pinkpop", concertsMoved: 2, alreadyDone: false });
    expect(venues.map((v) => v.slug)).toEqual(["pinkpop"]);
    expect(venues[0]).toMatchObject({ name: "Pinkpop", country: "Netherlands" });
    expect(concerts.every((c) => c.venueId === 1)).toBe(true);
    expect(aliases).toEqual([
      { slug: "pinkpop-fest", venueId: 1 },
      { slug: "pinkpop-festival", venueId: 1 },
    ]);
  });
  it("is safe to run again, and refuses an unknown or identical venue", async () => {
    const { db } = fakeDb();
    await mergeVenues(db, "pinkpop-festival", "pinkpop");
    expect(await mergeVenues(db, "pinkpop-festival", "pinkpop")).toEqual({ from: "pinkpop-festival", into: "pinkpop", concertsMoved: 0, alreadyDone: true });
    await expect(mergeVenues(db, "nowhere", "pinkpop")).rejects.toThrow('no venue "nowhere"');
    await expect(mergeVenues(db, "pinkpop", "pinkpop")).rejects.toThrow("same venue");
  });
});

describe("admin op normalize-countries", () => {
  it("rewrites every country in full, and changes nothing the second time", async () => {
    const { db, venues, concerts } = fakeDb();
    const first = await normalizeCountries(db);
    expect(first).toEqual({ concerts: 2, venues: 1, changes: ["NL -> Netherlands", "US -> United States"] });
    expect(concerts.map((c) => c.country)).toEqual(["Netherlands", "Netherlands", "United States"]);
    expect(venues.map((v) => v.country)).toEqual(["Netherlands", "Netherlands"]);
    expect(await normalizeCountries(db)).toEqual({ concerts: 0, venues: 0, changes: [] });
  });
});

describe("the collector's venue", () => {
  it("files a new spelling under the stored venue, follows aliases, and creates only a new place", async () => {
    const { db, venues } = fakeDb();
    const store = db as unknown as Parameters<typeof findOrCreateVenue>[0];
    expect((await findOrCreateVenue(store, "PinkPop Festival", "Landgraaf", "NL")).slug).toBe("pinkpop-festival");
    expect((await findOrCreateVenue(store, "The Pinkpop Fest", null, "Netherlands")).slug).toBe("pinkpop");
    expect((await findOrCreateVenue(store, "Pinkpop Fest", null, null)).slug).toBe("pinkpop-festival");
    await mergeVenues(db, "pinkpop-festival", "pinkpop");
    expect((await findOrCreateVenue(store, "Pinkpop Festival", null, null)).slug).toBe("pinkpop");
    const created = await findOrCreateVenue(store, "Graspop Metal Meeting", "Dessel", "BE");
    expect(created).toMatchObject({ slug: "graspop-metal-meeting", name: "Graspop Metal Meeting", country: "Belgium" });
    expect(venues).toHaveLength(2);
  });
});
