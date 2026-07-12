import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Prevents a v8-coverage flush race: small projects (e.g. packages/logging)
    // finish fast and their worker can exit before coverage data is written out,
    // producing non-deterministic 0% results on an otherwise-passing run.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: [
        "packages/*/src/**/*.ts",
        "services/*/src/**/*.ts",
        "ui/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/dist/**",
        "**/node_modules/**",
        "**/*.config.*",
        "**/*.d.ts",
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
    projects: ["packages/*", "services/*", "ui"],
  },
});
