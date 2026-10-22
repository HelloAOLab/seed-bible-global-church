// THEME VARIANTS beyond Light and Dark: a new one starts as a copy of its scheme's variant and gets a unique id from
// its name; renaming keeps the id a reader's selection names; the last variant cannot be removed; a reader who
// picked a variant gets it whatever their system scheme, and Automatic follows the scheme.
import { describe, expect, it } from "vitest";
import type { Customization } from "@seed/seed-schema";
import {
  pickVariant,
  withVariantAdded,
  withVariantChanged,
} from "../../../apps/reader-web/src/state/chrome/customizations";

const church = (): Customization =>
  ({
    "@id": "urn:seed:customization:c1",
    "@type": "seed:Customization",
    publishedBy: "0xabc",
    label: "Grace",
    hasVariant: [
      {
        "@type": "seed:ThemeVariant",
        "@id": "light",
        label: "Light",
        scheme: "light",
        variables: { primaryColor: "#123456" },
      },
      {
        "@type": "seed:ThemeVariant",
        "@id": "dark",
        label: "Dark",
        scheme: "dark",
        variables: { primaryColor: "#abcdef" },
      },
    ],
  }) as Customization;

describe("theme variants", () => {
  it("adds a variant as a copy of its scheme's, with a unique id from its name", () => {
    let c = withVariantAdded(church(), "Sepia", "light");
    c = withVariantAdded(c, "Sepia", "light");
    expect(c.hasVariant.map((v) => v["@id"])).toEqual([
      "light",
      "dark",
      "sepia",
      "sepia-2",
    ]);
    expect(c.hasVariant[2]).toMatchObject({
      label: "Sepia",
      scheme: "light",
      variables: { primaryColor: "#123456" },
    });
    c.hasVariant[2]!.variables["primaryColor"] = "#999999";
    expect(c.hasVariant[0]!.variables["primaryColor"]).toBe("#123456");
  });

  it("renames without changing the id, ignores a blank name, and keeps the last variant", () => {
    let c = withVariantChanged(church(), "dark", { label: " Night " });
    expect(c.hasVariant[1]).toMatchObject({ "@id": "dark", label: "Night" });
    expect(withVariantChanged(c, "dark", { label: "  " })).toBe(c);
    c = withVariantChanged(c, "light", "remove");
    expect(c.hasVariant.map((v) => v["@id"])).toEqual(["dark"]);
    expect(withVariantChanged(c, "dark", "remove").hasVariant).toHaveLength(1);
  });

  it("gives a reader the variant they picked, or the one for their scheme", () => {
    const c = withVariantAdded(church(), "Sepia", "light");
    expect(pickVariant(c, true, "sepia")["@id"]).toBe("sepia");
    expect(pickVariant(c, true)["@id"]).toBe("dark");
    expect(pickVariant(c, false, "gone")["@id"]).toBe("light");
  });
});
