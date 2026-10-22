import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

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
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Seed Bible",
        short_name: "Seed Bible",
        description: "Read, mark and keep Scripture in your own Library.",
        start_url: "/",
        display: "standalone",
        background_color: "#f8fafc",
        theme_color: "#f8fafc",
        icons: [
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/a2a\//, /^\/api\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // The 77 locale chunks are fetched when chosen, not precached.
        globIgnores: [
          "**/assets/[a-z][a-z]-*.js",
          "**/assets/[a-z][a-z][a-z]-*.js",
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/bible\.helloao\.org\/api\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "sb-bible-api",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "sb-fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
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
