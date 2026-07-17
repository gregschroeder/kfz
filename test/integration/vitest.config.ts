import path from "node:path";
import { defineConfig } from "vitest/config";
import { quietVitestTestOptions } from "../helpers/vitest-quiet";

export default defineConfig({
  test: {
    include: [path.join(import.meta.dirname, "**/*.integration.test.ts")],
    environment: "node",
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
    setupFiles: [path.join(import.meta.dirname, "setup.ts")],
    ...quietVitestTestOptions,
  },
});
