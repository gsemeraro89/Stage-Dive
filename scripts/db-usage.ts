// Daily database usage watch (src/lib/db-usage.ts): prints this billing period's data transfer, compute and
// storage from the Neon API, and exits with an error (the GitHub job fails, GitHub emails the owner) when
// compute or data transfer passes its budget. npm run db-usage
// Needs NEON_API_KEY (a Neon API key) and NEON_PROJECT_ID. Without a key it says so and stops without error.
import "dotenv/config";
import { budgetFromEnv, fetchNeonProject, usageReport } from "../src/lib/db-usage";

const apiKey = process.env.NEON_API_KEY?.trim();
const projectId = process.env.NEON_PROJECT_ID?.trim();

async function main() {
  if (!apiKey) {
    console.log("Database usage watch skipped: NEON_API_KEY is not set (add it as a repository secret to switch the watch on).");
    return;
  }
  if (!projectId) {
    console.log("Database usage watch skipped: NEON_PROJECT_ID is not set.");
    return;
  }
  const report = usageReport(await fetchNeonProject(projectId, apiKey), budgetFromEnv(process.env));
  for (const line of report.lines) console.log(line);
  for (const h of report.heading) console.log(`::warning::Database usage: ${h}`);
  if (report.over.length) {
    for (const o of report.over) console.log(`::error::Database usage: ${o}`);
    process.exitCode = 1;
  } else console.log("Within budget.");
}

main().catch((error) => {
  console.error(`::error::Database usage watch failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
