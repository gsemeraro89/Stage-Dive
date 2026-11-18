import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Not needed for `prisma generate`, so fall back to an empty string when unset.
    url: process.env.DATABASE_URL ?? "",
  },
});
