// Imports data/seed-sets.json into the database. Run with: npm run db:seed
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPrismaClient } from "../src/lib/db";
import { importSeed } from "../src/lib/seed/import";
import { normalizeSeed, type SeedFile } from "../src/lib/seed/normalize";

const file = resolve(process.argv[2] ?? "data/seed-sets.json");
const seed = JSON.parse(await readFile(file, "utf8")) as SeedFile;
const db = createPrismaClient();
try {
  const summary = await importSeed(db, normalizeSeed(seed));
  console.log(`Seed imported from ${file}:`, summary);
} finally {
  await db.$disconnect();
}
