import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = fileURLToPath(new URL(".", import.meta.url));

// Two projects over one tree: node for the state, the agents and the libs; jsdom for components and the pages. Both
// carry the `@seed` alias, Preact's JSX and the two guards (no real sockets, no real network beyond the Bible API).
const shared = {
  resolve: { alias: { "@seed": `${here}lib` } },
  // The room (`rooms/ReadingSession.ts`) uses the Agents SDK's `@callable()`; node runs no decorators natively, so the
  // runner compiles them (wrangler's esbuild does the same for the deploy).
  oxc: {
    jsx: { runtime: "automatic", importSource: "preact" },
    decorator: { legacy: true },
  },
};
const setupFiles = [
  "test/setup/blockRealSockets.ts",
  "test/setup/blockRealFetch.ts",
];
const DOM = [
  "test/unit/reader-web/components/**/*.test.{ts,tsx}",
  "test/unit/reader-web/**/*.test.tsx",
  "test/integration/**/*.test.tsx",
];

export default defineConfig({
  ...shared,
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["apps/**/src/**", "lib/**"],
      exclude: ["**/*.md", "**/*.json", "**/*.d.ts"],
    },
    projects: [
      {
        ...shared,
        test: {
          name: "node",
          environment: "node",
          include: ["test/**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", ...DOM],
          setupFiles,
        },
      },
      {
        ...shared,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: DOM,
          setupFiles,
        },
      },
    ],
  },
});
