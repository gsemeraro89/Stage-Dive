import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Database tests share one test database, so run files one after another.
    fileParallelism: false,
    // The test database is a remote Neon branch (Frankfurt): every query is a network round trip, the
    // first one may wait for Neon to wake up, and setup runs the migrations. Generous limits.
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
