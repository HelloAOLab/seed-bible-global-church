// EVERY WORD THE READER SHOWS HAS A KEY, AND EVERY KEY IS SHOWN SOMEWHERE (test-plan A3.4): the static scan of
// apps/reader-web/src finds each `t("…")`, `t('…')` and `i18nKey="…"`; each must be in en.json, and each en.json
// key must be used — or match a pattern in i18n-keys.allowlist.json for the few keys built at runtime. English
// only: the other locale files are the translators' (CLAUDE.md), and a key missing there falls back to English.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import en from "../../../apps/reader-web/src/i18n/en.json";
import allowlist from "./i18n-keys.allowlist.json";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "../../../apps/reader-web/src");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Each key the components name, with the files naming it. */
function usedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const note = (key: string, file: string) => {
    const list = used.get(key) ?? [];
    list.push(file.slice(SRC.length + 1));
    used.set(key, list);
  };
  for (const file of sources(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\(\s*(["'])([^"']+)\1/g))
      note(m[2]!, file);
    for (const m of src.matchAll(/i18nKey=(["'])([^"']+)\1/g))
      note(m[2]!, file);
  }
  return used;
}

const runtimeBuilt = allowlist.patterns.map((p) => new RegExp(p));

describe("translation keys", () => {
  const used = usedKeys();
  const keys = new Set(Object.keys(en));

  it("every t() call names its key literally (a variable key is invisible to these checks)", () => {
    const dynamic: string[] = [];
    for (const file of sources(SRC)) {
      if (file.endsWith("/i18n/index.ts")) continue;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/(?<![.\w])t\(\s*([A-Za-z_][\w.]*)\s*[,)]/g))
        dynamic.push(`${file.slice(SRC.length + 1)}: t(${m[1]})`);
    }
    expect(dynamic).toEqual([]);
  });

  it("finds the components' keys", () => {
    expect(used.size).toBeGreaterThan(100);
  });

  it("every key a component names is in en.json", () => {
    const missing = [...used.keys()].filter((k) => !keys.has(k)).sort();
    expect(
      missing.map((k) => `${k} (${used.get(k)![0]})`),
      "keys named in a component but not in en.json"
    ).toEqual([]);
  });

  it("every en.json key is named by a component, or is built at runtime (allowlisted)", () => {
    const unreferenced = [...keys]
      .filter((k) => !used.has(k) && !runtimeBuilt.some((re) => re.test(k)))
      .sort();
    expect(unreferenced, "en.json keys no component names").toEqual([]);
  });

  it("the allowlist names only patterns some en.json key or component actually needs", () => {
    for (const re of runtimeBuilt) {
      const hit = [...keys].some((k) => re.test(k));
      const built = sources(SRC).some((f) =>
        /\bt\(\s*`/.test(readFileSync(f, "utf8"))
      );
      expect(hit || built, `${re} matches nothing`).toBe(true);
    }
  });
});
