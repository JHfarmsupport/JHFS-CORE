import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    // Database-tests kører mod en rigtig Postgres og må ikke køre oven i hinanden.
    fileParallelism: false,
  },
});
