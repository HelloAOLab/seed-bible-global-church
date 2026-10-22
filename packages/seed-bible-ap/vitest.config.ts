import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = fileURLToPath(new URL(".", import.meta.url));

// Two projects over one tree: node for the state, the agents and the libs; jsdom for components and the pages. Both
// carry the `@seed` alias, Preact's JSX and the two guards (no real sockets, no real network beyond the Bible API).
const shared = {
  resolve: { alias: { "@seed": `${here}lib` } },
  esbuild: { jsx: "automatic" as const, jsxImportSource: "preact" },
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
