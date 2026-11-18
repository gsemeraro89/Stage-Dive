import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Database tests share one test database, so run files one after another.
    fileParallelism: false,
  },
});
