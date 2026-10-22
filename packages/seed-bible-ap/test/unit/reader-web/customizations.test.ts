// A customization made and published by one person is what another reader finds, selects, and is dressed with.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import {
  createCustomizations,
  pickVariant,
  themeFromVariant,
} from "../../../apps/reader-web/src/state/chrome/customizations";
import { createPublishing } from "../../../apps/reader-web/src/state/social/publishing";
import { createSettings } from "../../../apps/reader-web/src/state/chrome/settings";

const STEWARD = { agent: "0x" + "66".repeat(20), name: "Steward", wire: true };
const READER = { agent: "0x" + "77".repeat(20), name: "Reader", wire: true };

describe("customizations", () => {
  it("a published customization is listed by kind, selected by a reader, and themes the app", async () => {
    const backend = createDevBackend(STEWARD);
    const stewardStores = memoryStores();
    const steward = createCustomizations(backend, stewardStores, () => STEWARD);
    const c = await steward.create("Grace Church");
    await steward.setVariable(c["@id"], "light", "primaryColor", "#123456");
    await steward.setVariable(c["@id"], "dark", "primaryColor", "#abcdef");
    await steward.update(c["@id"], {
      logo: "https://files.test/logo.png",
      defaultEdition: "BSB",
    });
    const publishing = createPublishing(backend, stewardStores);
    await publishing.publishWork(steward.mine.byId(c["@id"])!);
    expect(publishing.isPublished(c["@id"])).toBe(true);

    backend.setIdentity(READER);
    const readerStores = memoryStores();
    const reader = createCustomizations(backend, readerStores, () => READER);
    await reader.refresh();
    expect(reader.available.value.map((a) => a.customization.label)).toEqual([
      "Grace Church",
    ]);
    const settings = createSettings({ brand: (dark) => reader.theme(dark) });
    expect(settings.resolvedTheme().variables["primaryColor"]).not.toBe(
      "#123456"
    );
    await reader.select(reader.available.value[0]!);
    settings.theme.value = "light";
    expect(settings.resolvedTheme().variables["primaryColor"]).toBe("#123456");
    expect(settings.resolvedTheme().name).toBe("Grace Church · Light");
    settings.theme.value = "dark";
    expect(settings.resolvedTheme().variables["primaryColor"]).toBe("#abcdef");

    // The selection survives a reload even before the registry answers.
    const again = createCustomizations(backend, readerStores, () => READER);
    await again.ready;
    await new Promise((r) => setTimeout(r, 0));
    expect(again.theme(false)?.variables["primaryColor"]).toBe("#123456");
    await again.select(null);
    expect(again.theme(false)).toBeNull();
    settings.dispose();
  });

  it("picks the variant for the scheme, or the first", () => {
    const c = {
      "@id": "urn:x",
      "@type": "seed:Customization" as const,
      publishedBy: STEWARD.agent,
      label: "X",
      hasVariant: [
        {
          "@type": "seed:ThemeVariant" as const,
          "@id": "d",
          label: "Dark",
          scheme: "dark" as const,
          variables: { background: "#000" },
        },
        {
          "@type": "seed:ThemeVariant" as const,
          "@id": "l",
          label: "Light",
          scheme: "light" as const,
          variables: { background: "#fff" },
        },
      ],
    };
    expect(pickVariant(c, true)["@id"]).toBe("d");
    expect(pickVariant(c, false)["@id"]).toBe("l");
    expect(pickVariant(c, false, "d")["@id"]).toBe("d");
    expect(themeFromVariant(c, c.hasVariant[0]!).variables["background"]).toBe(
      "#000"
    );
    expect(
      themeFromVariant(c, c.hasVariant[0]!).variables["primaryColor"]
    ).toBeTruthy();
  });
});
