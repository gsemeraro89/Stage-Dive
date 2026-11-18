// Imports data/seed-concerts.json into the database. Run with: npm run db:seed
// Also runs before every start on Render: it gives up after STARTUP_STEP_LIMIT_MS so the site always starts.
import "dotenv/config";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPrismaClient } from "../src/lib/db";
import { runWithDeadline, STARTUP_STEP_LIMIT_MS } from "../src/lib/deadline";
import { importSeed } from "../src/lib/seed/import";
import { normalizeSeed, type SeedFile } from "../src/lib/seed/normalize";

const file = resolve(process.argv[2] ?? "data/seed-concerts.json");
if (!existsSync(file)) {
  // data/seed-concerts.json is written by `npm run seed-check` (needs YOUTUBE_API_KEY). Until then: nothing to import.
  console.log(`No seed file at ${file}: run npm run seed-check first. Nothing imported.`);
  process.exit(0);
}
const seed = JSON.parse(await readFile(file, "utf8")) as SeedFile;
const db = createPrismaClient();
const result = await runWithDeadline(async () => {
  try {
    return await importSeed(db, normalizeSeed(seed));
  } finally {
    await db.$disconnect();
  }
}, STARTUP_STEP_LIMIT_MS);
if (result.timedOut) {
  // The import runs in one transaction: if it had not finished, Postgres rolls it back when this process exits.
  console.warn(`Seed import gave up after ${STARTUP_STEP_LIMIT_MS / 1000}s (database slow or unreachable); site still starts.`);
  process.exit(0);
}
console.log(`Seed imported from ${file}:`, result.value);
