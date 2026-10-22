// VERSION SKEW (hard-problems §16): the workspace plans only against `skill:seed/*` at the digests in pins/skills.json.
// Every act tool the host offers must be a pinned skill's capability; a tool with no pin is a tool nobody agreed to.
import { describe, expect, it } from "vitest";
import pins from "../../../apps/reader-a2a/src/pins/skills.json";
import { TOOLS } from "../../../apps/reader-a2a/src/skills";

/** Tools the workspace answers itself — reads, and the hello — need no person-agent skill behind them. */
const WORKSPACE_LOCAL = new Set([
  "seed.hello",
  "seed.bucket.read",
  "seed.workspace.discover",
  "seed.workspace.contacts",
]);

describe("pinned skills", () => {
  const byCapability = new Map(
    Object.entries(pins.skills).map(([id, s]) => [s.capability, { id, ...s }])
  );

  it("pins every skill with a version, a contract digest and a published version", () => {
    for (const [id, s] of Object.entries(pins.skills)) {
      expect(id, "skill id").toMatch(/^skill:seed\/[a-z-]+$/);
      expect(s.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(s.contractDigest).toMatch(/^0x[0-9a-f]{64}$/);
      expect(s.publishedVersion).toBeGreaterThanOrEqual(1);
    }
    for (const a of Object.values(pins.archetypes))
      expect(a.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("every act tool the host offers is a pinned skill's capability", () => {
    for (const t of TOOLS) {
      if (WORKSPACE_LOCAL.has(t.id)) continue;
      expect(byCapability.has(t.id), `${t.id} has no pinned SKILL.md`).toBe(
        true
      );
    }
  });
});
