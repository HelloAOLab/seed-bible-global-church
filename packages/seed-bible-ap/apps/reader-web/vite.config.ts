import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import {
  selectCoreAssetFiles,
  selectCoreAssets,
  type PrecacheManifestEntry,
  type ViteManifestChunk,
} from "./src/sw/precache";

const here = fileURLToPath(new URL(".", import.meta.url));

/** The Workbox `manifestTransforms` hook: the globbed output narrowed to this build's core (src/sw/precache.ts). */
function transformPrecacheManifest(entries: PrecacheManifestEntry[]) {
  const manifest = JSON.parse(
    readFileSync(`${here}dist/.vite/manifest.json`, "utf8")
  ) as Record<string, ViteManifestChunk>;
  const out = selectCoreAssets(entries, selectCoreAssetFiles(manifest));
  for (const w of out.warnings) console.warn(`[sw precache] ${w}`);
  return out;
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // `.env.faithnet` beside this file: `vite build --mode faithnet` points the page at the deployed agent.
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    preact(),
    // The service worker: the app shell precached, chapters and fonts cached as they are read, so a chapter read
    // once opens again offline (the IndexedDB read model holds the reader's own marks).
    VitePWA({
      registerType: "autoUpdate",
      // A hand-written worker (src/sw/sw.ts): one shared shell entry for navigations, this build's own files
      // cached, the agent's lanes left alone — not something generateSW's declarative config can say.
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "sw.ts",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Seed Bible",
        short_name: "Seed Bible",
        description: "Read, mark and keep Scripture in your own Library.",
        start_url: "/",
        display: "standalone",
        // Installed on Android: the whole screen where the system allows it, else an app window without browser bars.
        display_override: ["fullscreen", "standalone"],
        background_color: "#f8fafc",
        theme_color: "#f8fafc",
        icons: [
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
      injectManifest: {
        // Glob everything cacheable; transformPrecacheManifest keeps the boot chunks, images and fonts.
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,webp,woff,woff2,webmanifest}",
        ],
        manifestTransforms: [transformPrecacheManifest],
        // Workbox drops files over 2 MiB by default, which would leave the vendor chunk out of the precache.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      },
    }),
  ],
  // `.vite/manifest.json`: what the service worker's precache selection reads (transformPrecacheManifest).
  build: { manifest: true },
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
        ws: true,
        rewrite: (path) => path.replace(/^\/a2a/, ""),
      },
    },
  },
});
