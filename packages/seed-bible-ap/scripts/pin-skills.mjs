#!/usr/bin/env node
/**
 * PIN THE SKILLS BY DIGEST (hard-problems §16). reader-a2a plans only against `skill:seed/*` at the digests recorded
 * here: for every seed archetype the registry's compiled definition — its digest and, per tool, the SKILL.md it was
 * compiled from (canonical id, version, contract digest) — plus the published version of each skill. A test holds
 * the workspace's tool table to this file; a mismatch is bare harness, never a guess.
 *
 *   pnpm pin:skills          # → apps/reader-a2a/src/pins/skills.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
const A2A =
  process.env.SKILLS_A2A ??
  "https://skills-a2a-production.richardpedersen3.workers.dev";
const DOMAIN = "seed";
const ARCHETYPES = ["seed-reader", "seed-publisher", "seed-workspace"];
const j = async (u) => {
  const r = await fetch(u, {
    headers: { "user-agent": "Mozilla/5.0 (pin-skills)" },
  });
  if (!r.ok) throw new Error(`${u} → ${r.status}`);
  return r.json();
};

const skills = {};
const archetypes = {};
for (const id of ARCHETYPES) {
  const def = await j(
    `${A2A}/context/contexts/${DOMAIN}/archetypes/${id}/definition`
  );
  archetypes[id] = {
    digest: def.digest,
    tools: (def.definition?.tools ?? []).length,
    warnings: (def.warnings ?? []).length,
  };
  for (const t of def.definition?.tools ?? []) {
    const s = t.source;
    if (!s?.skillId) continue;
    const prev = skills[s.skillId];
    if (prev && prev.contractDigest !== s.contractDigest)
      throw new Error(
        `${s.skillId}: two archetypes compile different contract digests (${prev.contractDigest} vs ${s.contractDigest})`
      );
    skills[s.skillId] = {
      version: s.version,
      contractDigest: s.contractDigest,
      capability: t.capability?.id ?? t.id ?? null,
    };
  }
}
for (const id of Object.keys(skills)) {
  const row = await j(`${A2A}/skill?id=${encodeURIComponent(id)}`);
  skills[id].publishedVersion = row.latestVer ?? null;
  skills[id].owner = row.owner ?? null;
  // The capability is the SKILL.md's own declaration (ADR-0051 dotted id); the compiled tool id is the first of its
  // `tools:` and is not it.
  skills[id].capability = row.frontmatter?.capability ?? skills[id].capability;
}
const out = {
  pinnedAt: new Date().toISOString(),
  registry: A2A,
  domain: DOMAIN,
  archetypes,
  skills: Object.fromEntries(Object.entries(skills).sort()),
};
mkdirSync(new URL("../apps/reader-a2a/src/pins/", import.meta.url), {
  recursive: true,
});
writeFileSync(
  new URL("../apps/reader-a2a/src/pins/skills.json", import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`
);
console.log(
  `${Object.keys(skills).length} skills · ${ARCHETYPES.length} archetypes → apps/reader-a2a/src/pins/skills.json`
);
for (const [id, s] of Object.entries(out.skills))
  console.log(
    `  ${id.padEnd(36)} v${s.version} ${String(s.contractDigest).slice(0, 14)}… capability ${s.capability}`
  );
for (const [id, a] of Object.entries(archetypes))
  console.log(
    `  ${id.padEnd(36)} ${String(a.digest).slice(0, 14)}… ${a.tools} tools${a.warnings ? ` · ${a.warnings} warning(s)` : ""}`
  );
