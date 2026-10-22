import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    // The same `@seed/*` → `lib/*` mapping as tsconfig `paths` and the Vite alias in apps/reader-web.
    alias: { "@seed": `${here}lib` },
  },
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
