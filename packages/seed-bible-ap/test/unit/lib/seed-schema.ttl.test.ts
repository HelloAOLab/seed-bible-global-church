// VERSION SKEW (hard-problems §16): every key a record schema writes must be a property the T-box declares
// (`~/skills/ontology/seed.ttl`), and every class must be declared there. The TTL is the source; this package
// hand-writes the zod mirror and this test is what keeps the two from drifting.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NON_SEED_KEYS, SCHEMAS } from "@seed/seed-schema";

const TTL =
  process.env["SEED_TTL"] ??
  join(process.env["HOME"] ?? "", "skills", "ontology", "seed.ttl");

describe.skipIf(!existsSync(TTL))(
  "seed-schema mirrors ~/skills/ontology/seed.ttl",
  () => {
    const ttl = readFileSync(TTL, "utf8");
    const declaredProps = new Set(
      [
        ...ttl.matchAll(
          /^seed:([A-Za-z]+) a owl:(?:Object|Datatype)Property/gm
        ),
      ].map((m) => m[1]!)
    );
    const declaredClasses = new Set(
      [...ttl.matchAll(/^seed:([A-Za-z]+) a owl:Class/gm)].map((m) => m[1]!)
    );
    const SPECIAL = new Set(["@id", "@type", "@context", "deleted"]);

    for (const [cls, schema] of Object.entries(SCHEMAS)) {
      it(`${cls}: a declared class whose keys are declared properties`, () => {
        expect(declaredClasses.has(cls)).toBe(true);
        const keys = Object.keys(schema.shape).filter(
          (k) => !SPECIAL.has(k) && !(k in NON_SEED_KEYS)
        );
        const undeclared = keys.filter((k) => !declaredProps.has(k));
        expect(undeclared).toEqual([]);
      });
    }

    it("every required shape field of the produced classes is in the schema", () => {
      // The shapes the state check validates after a run: a required field (minCount ≥ 1) the schema does not carry
      // would let the app write a record the ontology calls incomplete.
      for (const [cls, schema] of Object.entries(SCHEMAS)) {
        const shape =
          // one shape statement: from its subject to the `] .` that closes its last property shape
          new RegExp(
            `^seed:${cls}Shape a sh:NodeShape[\\s\\S]*?\\] \\.\\n`,
            "m"
          ).exec(ttl)?.[0] ?? "";
        const required = [
          ...shape.matchAll(/sh:name "([A-Za-z]+)"[^\]]*sh:minCount 1/g),
        ].map((m) => m[1]!);
        const keys = new Set(Object.keys(schema.shape));
        expect(
          required.filter((f) => !keys.has(f)),
          `${cls} is missing a required field`
        ).toEqual([]);
      }
    });
  }
);
