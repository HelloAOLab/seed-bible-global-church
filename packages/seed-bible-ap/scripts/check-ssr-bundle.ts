// THE SSR SMOKE (test-plan A4): after `pnpm build:web`, the built Worker is started in-process (wrangler
// `unstable_dev` on apps/reader-web/wrangler.toml) and asked for a chapter page, which must carry the doctype, the
// Open Graph title, the canonical link, the seed the client reuses and a non-empty root rendered from this build.
// Then the Worker is bundled the way a deploy bundles it (`wrangler deploy --dry-run`) and the output is checked
// for an import that was left unresolved — a relative sibling import that would 404 at the edge. Non-zero on any
// failure. The chapter comes from the Bible API, the one third party the reader talks to.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev } from "wrangler";

const here = fileURLToPath(new URL(".", import.meta.url));
const CONFIG = join(here, "..", "apps", "reader-web", "wrangler.toml");
const SCRIPT = join(here, "..", "apps", "reader-web", "worker", "index.ts");
const PAGE = "/read/BSB/JHN/3";

let failures = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  console.log(
    `${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`
  );
  if (!ok) failures++;
};

async function pageChecks() {
  const worker = await unstable_dev(SCRIPT, {
    config: CONFIG,
    local: true,
    logLevel: "error",
    experimental: { disableExperimentalWarning: true },
  });
  try {
    const res = await worker.fetch(PAGE, { headers: { accept: "text/html" } });
    const html = await res.text();
    check(
      `GET ${PAGE} answers 200 text/html`,
      res.status === 200 &&
        (res.headers.get("content-type") ?? "").includes("text/html"),
      `${res.status} ${res.headers.get("content-type")}`
    );
    check(
      "the page is rendered on the edge (x-sb-ssr: chapter)",
      res.headers.get("x-sb-ssr") === "chapter",
      res.headers.get("x-sb-ssr") ?? "no header"
    );
    check("starts with <!doctype", /^\s*<!doctype/i.test(html));
    check(
      "carries og:title",
      /<meta property="og:title" content="John 3 · [^"]+"/.test(html)
    );
    check(
      "carries a canonical link",
      /<link rel="canonical" href="[^"]+\/read\/BSB\/JHN\/3"/.test(html)
    );
    check(
      "carries the seed the client reuses (window.__SB_SEED__)",
      /<script>window\.__SB_SEED__=\{/.test(html)
    );
    check(
      "the root is not empty and names this build",
      /<div id="root"><div class="sb-app sb-app-ssr" data-sb-route="\/read\/BSB\/JHN\/3" data-sb-build="[^"]+">/.test(
        html
      )
    );
    check("verse 16 is in the markup", /data-verse-number="16"/.test(html));
    const robots = await worker.fetch("/robots.txt");
    check(
      "/robots.txt answers",
      robots.status === 200 && (await robots.text()).includes("Sitemap:")
    );
    const asset = await worker.fetch("/manifest.webmanifest");
    check(
      "a static asset is served by the asset binding",
      asset.status === 200
    );
  } finally {
    await worker.stop();
  }
}

function bundleChecks() {
  const out = mkdtempSync(join(tmpdir(), "sb-ssr-bundle-"));
  try {
    const r = spawnSync(
      "npx",
      ["wrangler", "deploy", "--dry-run", "--outdir", out, "-c", CONFIG],
      {
        encoding: "utf8",
        cwd: join(here, ".."),
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      }
    );
    check(
      "wrangler bundles the Worker (deploy --dry-run)",
      r.status === 0,
      (r.stderr || r.stdout).slice(-400)
    );
    const files = readdirSync(out).filter((f) => f.endsWith(".js"));
    check("the bundle has one entry file", files.length >= 1, files.join(", "));
    for (const f of files) {
      const src = readFileSync(join(out, f), "utf8");
      const unresolved =
        src.match(/\b(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g) ?? [];
      check(
        `${f}: no unresolved relative import`,
        unresolved.length === 0,
        unresolved.slice(0, 3).join(" | ")
      );
      check(
        `${f}: renders chapters (entry-server bundled in)`,
        src.includes("__SB_SEED__") && src.includes("sb-app-ssr")
      );
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

await pageChecks().catch((e) =>
  check(
    "the built Worker starts and answers",
    false,
    e instanceof Error ? e.message : String(e)
  )
);
bundleChecks();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
