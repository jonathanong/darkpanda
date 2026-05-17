import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["test/**", "dist/**", "vitest.config.mts"],
      include: ["src/**/*.mts"],
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    globals: true,
    pool: "forks",
    testTimeout: 10_000,
  },
});
