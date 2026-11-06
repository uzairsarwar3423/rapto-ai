import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Test runner config. Pure-logic suites run in node; component suites opt into jsdom with a
 * `// @vitest-environment jsdom` pragma. `server-only` is stubbed because Next provides it at build time.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
