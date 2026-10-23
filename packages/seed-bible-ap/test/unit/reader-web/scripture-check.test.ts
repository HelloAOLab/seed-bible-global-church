// THE SCRIPTURE CHECK NEVER JUDGES ON A KEPT COPY: a translation the scripture agent has re-signed can still sit in a
// browser's cache with its earlier answer; "Not attested" is only said once a fresh answer fails too.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createScriptureCheck } from "../../../apps/reader-web/src/state/reading/scriptureCheck";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(HERE, "../../fixtures/scripture", name), "utf8")
  );
const chapter = fixture("BSB-JHN-3.json");
const proofs = fixture("BSB-JHN-3.proofs.json");
const good = fixture("BSB.verification.json");
const unsigned = { ...good, attestation: null };

function check(answer: (fresh: boolean) => unknown) {
  const asked: string[] = [];
  const sc = createScriptureCheck({
    endpoint: "https://reader.test/bible/",
    fetchImpl: async (input) => {
      const url = String(input);
      asked.push(url);
      if (url.includes("proofs")) return Response.json(proofs);
      return Response.json(answer(url.includes("fresh=")));
    },
  });
  return { sc, asked };
}
async function settle(sc: ReturnType<typeof createScriptureCheck>) {
  for (let i = 0; i < 100; i++) {
    const s = sc.of(chapter);
    if (s && s.status !== "checking") return s;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error("the check did not settle");
}

describe("the translation's attestation", () => {
  it("is asked for again, fresh, when the kept answer fails — and the fresh one decides", async () => {
    const { sc, asked } = check((fresh) => (fresh ? good : unsigned));
    expect((await settle(sc)).status).toBe("verified");
    expect(asked.filter((u) => u.includes("verification.json"))).toHaveLength(
      2
    );
  });

  it("is 'not attested' only when the fresh answer fails too", async () => {
    const { sc } = check(() => unsigned);
    expect((await settle(sc)).status).toBe("unattested");
  });

  it("is asked for once when the first answer passes", async () => {
    const { sc, asked } = check(() => good);
    expect((await settle(sc)).status).toBe("verified");
    expect(asked.filter((u) => u.includes("verification.json"))).toHaveLength(
      1
    );
  });
});
