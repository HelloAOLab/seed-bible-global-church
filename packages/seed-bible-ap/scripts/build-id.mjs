#!/usr/bin/env node
// Write the build id (the git short hash, else the time) into apps/reader-web/src/build.ts before a build, so the
// edge-rendered page and the client bundle carry the same one. `--reset` puts "dev" back (what a checkout holds).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(
  new URL("../apps/reader-web/src/build.ts", import.meta.url)
);
const reset = process.argv.includes("--reset");
let id = "dev";
if (!reset) {
  try {
    id = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    id = String(Date.now());
  }
}
const src = readFileSync(file, "utf8");
const next = src.replace(
  /export const BUILD_ID = "[^"]*";/,
  `export const BUILD_ID = "${id}";`
);
if (next === src && !src.includes(`"${id}"`))
  throw new Error("build.ts has no BUILD_ID line");
writeFileSync(file, next);
console.log(`BUILD_ID = ${id}`);
