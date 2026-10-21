import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // `.env.faithnet` beside this file: `vite build --mode faithnet` points the page at the deployed agent.
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [preact()],
  resolve: {
    // `@seed/*` → `lib/*`, the same mapping as tsconfig `paths` and vitest.config.ts.
    alias: { "@seed": fileURLToPath(new URL("../../lib", import.meta.url)) },
  },
  server: {
    port: 5185,
    proxy: {
      // /a2a/<route> in the browser → <route> on reader-a2a (avoids CORS in dev).
      "/a2a": {
        target: "http://127.0.0.1:8891",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/a2a/, ""),
      },
    },
  },
});
