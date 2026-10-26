#!/usr/bin/env node
// THE SIZE GATE — every chunk the web build emits, gzip-sized and held to an absolute budget
// (scripts/size-budgets.json). `pnpm size` after `pnpm build:web` prints the table and fails on any chunk over
// its budget or with no budget at all; `pnpm size --seed` writes budgets from the current build (+15%) for the
// chunks that have none, or all of them with `--seed --all`. Budgets are by chunk NAME (stable across hashes).
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const DIST = `${here}../apps/reader-web/dist/`;
const BUDGETS = `${here}size-budgets.json`;
const HEADROOM = 1.15;

const seed = process.argv.includes("--seed");
const all = process.argv.includes("--all");

const manifestPath = `${DIST}.vite/manifest.json`;
if (!existsSync(manifestPath)) {
  console.error(`no build at ${manifestPath} — run pnpm build:web first`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const gz = (file) => gzipSync(readFileSync(`${DIST}${file}`)).length;

/** One row per chunk: its JS, plus its CSS as its own row (the entry's stylesheet is the shell's). */
const rows = [];
for (const [key, chunk] of Object.entries(manifest)) {
  const name = chunk.name ?? key.replace(/\.[^.]+$/, "");
  rows.push({
    name,
    file: chunk.file,
    bytes: gz(chunk.file),
    entry: chunk.isEntry === true,
  });
  for (const css of chunk.css ?? [])
    rows.push({
      name: `${name} (css)`,
      file: css,
      bytes: gz(css),
      entry: false,
    });
}
rows.sort((a, b) => b.bytes - a.bytes);
const total = rows.reduce((s, r) => s + r.bytes, 0);

const budgetFile = existsSync(BUDGETS)
  ? JSON.parse(readFileSync(BUDGETS, "utf8"))
  : { note: "", budgets: {}, total: 0 };
const budgets = budgetFile.budgets ?? {};

if (seed) {
  for (const r of rows)
    if (all || budgets[r.name] === undefined)
      budgets[r.name] = Math.ceil((r.bytes * HEADROOM) / 1024) * 1024;
  const totalBudget =
    all || !budgetFile.total
      ? Math.ceil((total * HEADROOM) / 1024) * 1024
      : budgetFile.total;
  writeFileSync(
    BUDGETS,
    JSON.stringify(
      {
        note: "gzip bytes per chunk name (apps/reader-web/dist/.vite/manifest.json); seeded by `pnpm size --seed` at current + 15%. Raise a budget on purpose, in the PR that needs it.",
        total: totalBudget,
        budgets: Object.fromEntries(Object.entries(budgets).sort()),
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    `seeded ${BUDGETS}: ${Object.keys(budgets).length} chunk budgets, total ${totalBudget} B`
  );
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
let failures = 0;
const pad = (s, n) => String(s).padEnd(n);
console.log(
  `${pad("chunk", 34)} ${pad("gzip", 10)} ${pad("budget", 10)} status`
);
for (const r of rows) {
  const b = budgets[r.name];
  let status = "ok";
  if (b === undefined) {
    status = "NO BUDGET — pnpm size --seed";
    failures++;
  } else if (r.bytes > b) {
    status = `OVER by ${kb(r.bytes - b)}`;
    failures++;
  }
  console.log(
    `${pad(r.name.slice(0, 33), 34)} ${pad(kb(r.bytes), 10)} ${pad(b === undefined ? "—" : kb(b), 10)} ${status}`
  );
}
const totalBudget = budgetFile.total ?? 0;
const totalStatus = !totalBudget
  ? "NO BUDGET"
  : total > totalBudget
    ? `OVER by ${kb(total - totalBudget)}`
    : "ok";
if (totalStatus !== "ok") failures++;
console.log(
  `${pad("TOTAL", 34)} ${pad(kb(total), 10)} ${pad(totalBudget ? kb(totalBudget) : "—", 10)} ${totalStatus}`
);
const stale = Object.keys(budgets).filter(
  (n) => !rows.some((r) => r.name === n)
);
if (stale.length)
  console.log(`(budgets with no chunk this build: ${stale.join(", ")})`);
if (failures) {
  console.error(`\n${failures} size check(s) failed`);
  process.exit(1);
}
console.log("\nall chunks within budget");
