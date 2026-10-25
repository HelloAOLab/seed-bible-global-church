// The extension host: an extension's init yields cleanups; enabling installs, disabling runs them; what it added
// (verse tools, Discover providers, toolbar items, panes) appears and disappears; the enabled set is remembered.
// Plus the pure parts of the ported extensions: cross-reference items, places, the companion's stream parser.
import { describe, expect, it } from "vitest";
import {
  createExtensionHost,
  type ExtensionRegistration,
} from "../../../apps/reader-web/src/extensions/host";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import {
  itemsFor,
  loadChapterReferences,
} from "../../../apps/reader-web/src/extensions/references";
import {
  findPlacesInText,
  placesInChapter,
} from "../../../apps/reader-web/src/extensions/locations";
import { parseSse } from "../../../apps/reader-web/src/extensions/companion";
import { crossReferenceItems } from "../../../apps/reader-a2a/src/routes/passage";
import { parseLocus } from "../../../lib/locus";
import type { ReaderState } from "../../../apps/reader-web/src/state";
import type { TranslationBookChapter } from "../../../apps/reader-web/src/backend/bible";

const fakeState = () =>
  ({ ui: { pane: { value: "none" as string } } }) as unknown as ReaderState;

describe("the extension host", () => {
  it("installs what is enabled, cleans up on disable, and remembers the set", async () => {
    const stores = memoryStores();
    const host = createExtensionHost(stores);
    const log: string[] = [];
    const ext: ExtensionRegistration = {
      id: "x",
      label: "X",
      init: function* (ctx) {
        log.push("init");
        yield ctx.tools.registerVerseTool({
          id: "x-tool",
          label: "X",
          icon: "star",
          onSelect: () => log.push("select"),
        });
        yield ctx.discover.registerProvider({
          id: "x-prov",
          label: "X",
          discover: async () => [],
        });
        yield ctx.toolbar.add({
          id: "x",
          label: "X",
          icon: "star",
          onSelect: () => ctx.panes.open("x"),
        });
        yield ctx.panes.register({
          id: "x",
          title: "X pane",
          render: () => null,
        });
        yield ctx.header.add({
          id: "x-head",
          label: "X",
          icon: "star",
          onSelect: (ref) => log.push(`header ${ref}`),
        });
        yield () => log.push("cleanup");
      },
    };
    const off: ExtensionRegistration = {
      id: "off",
      label: "Off",
      defaultEnabled: false,
      init: function* () {
        log.push("off-init");
      },
    };
    host.register(ext);
    host.register(off);
    const state = fakeState();
    await host.bind(state);
    expect(log).toEqual(["init"]);
    expect(host.verseTools.value.map((t) => t.id)).toEqual(["x-tool"]);
    expect(host.providers.value.map((p) => p.id)).toEqual(["x-prov"]);
    expect(host.toolbarItems.value).toHaveLength(1);
    expect(host.panes.value.map((p) => p.id)).toEqual(["x"]);
    host.toolbarItems.value[0]!.onSelect();
    expect(state.ui.pane.value).toBe("ext:x");
    expect(host.headerButtons.value.map((b) => b.id)).toEqual(["x-head"]);
    host.headerButtons.value[0]!.onSelect("JHN.3");
    expect(log).toEqual(["init", "header JHN.3"]);
    log.splice(1);

    await host.setEnabled("x", false);
    expect(log).toEqual(["init", "cleanup"]);
    expect(host.verseTools.value).toHaveLength(0);
    expect(host.providers.value).toHaveLength(0);
    expect(host.panes.value).toHaveLength(0);
    expect(host.headerButtons.value).toHaveLength(0);
    expect(await stores.prefs.get("extensions:enabled")).toEqual([]);

    await host.setEnabled("off", true);
    expect(log).toContain("off-init");
    const again = createExtensionHost(stores);
    again.register(ext);
    again.register(off);
    await again.bind(fakeState());
    expect([...again.enabled.value]).toEqual(["off"]);
  });

  it("keeps an extension that throws on init from taking the rest down", async () => {
    const host = createExtensionHost(memoryStores());
    host.register({
      id: "bad",
      label: "Bad",
      init: function* () {
        throw new Error("boom");
      },
    });
    host.register({
      id: "good",
      label: "Good",
      init: function* (ctx) {
        yield ctx.toolbar.add({
          id: "g",
          label: "G",
          icon: "g",
          onSelect: () => {},
        });
      },
    });
    await host.bind(fakeState());
    expect(host.errors.value["bad"]).toBe("boom");
    expect(host.toolbarItems.value).toHaveLength(1);
  });
});

describe("the ported extensions' pure parts", () => {
  it("cross-references: read once per chapter, listed for the selected verses by score", async () => {
    let fetches = 0;
    // The Bible API's real shape: each verse's references under `chapter.content`.
    const data = {
      dataset: { id: "open-cross-ref" },
      book: { id: "JHN" },
      chapter: {
        number: 3,
        content: [
          {
            verse: 16,
            references: [
              { book: "ROM", chapter: 5, verse: 8, score: 9 },
              { book: "1JN", chapter: 4, verse: 9, endVerse: 10, score: 12 },
            ],
          },
          { verse: 3, references: [{ book: "1PE", chapter: 1, verse: 23 }] },
        ],
      },
    };
    // reader-a2a's passage answer, made from that dataset by the server's own mapping.
    const chapter = parseLocus("JHN.3")!;
    const answer = {
      ok: true,
      locus: chapter,
      items: crossReferenceItems(chapter, 3, data),
      sources: { scripture: { ok: true, count: 3 } },
    };
    const fetchImpl = (async (url: RequestInfo | URL) => {
      fetches++;
      expect(String(url)).toMatch(/\/api\/passage\/JHN\.3$/);
      return new Response(JSON.stringify(answer), { status: 200 });
    }) as typeof fetch;
    const cache = memoryStores().chapters;
    const refs = (await loadChapterReferences("JHN", 3, cache, fetchImpl))!;
    await loadChapterReferences("JHN", 3, cache, fetchImpl);
    expect(fetches).toBe(1);
    const name = (id: string) =>
      ({ ROM: "Romans", "1JN": "1 John", "1PE": "1 Peter" })[id] ?? id;
    expect(itemsFor(refs, [16], name).map((i) => i.title)).toEqual([
      "1 John 4:9–10",
      "Romans 5:8",
    ]);
    expect(itemsFor(refs, [], name).map((i) => i.fromVerse)).toEqual([
      3, 16, 16,
    ]);
  });

  it("places: the gazetteer finds places in text and the first verse naming each", () => {
    expect(
      findPlacesInText("They went down from Capernaum to Jerusalem").map(
        (p) => p.place
      )
    ).toEqual(["Capernaum", "Jerusalem"]);
    const chapter = {
      chapter: {
        content: [
          { type: "verse", number: 1, content: ["In Bethlehem of Galilee"] },
          {
            type: "verse",
            number: 2,
            content: ["again Bethlehem, then Nazareth"],
          },
        ],
      },
    } as unknown as TranslationBookChapter;
    expect(
      placesInChapter(chapter).map((p) => `${p.place.place}@${p.verse}`)
    ).toEqual(["Bethlehem@1", "Galilee@1", "Nazareth@2"]);
  });

  it("companion: the stream parser yields text and the answerer, across chunk boundaries", () => {
    const text: string[] = [];
    let who = "";
    let rest = parseSse(
      'event: who\ndata: seed-bible.svc · llama\n\ndata: {"response":"For "}\n\ndata: {"respo',
      (t) => text.push(t),
      (w) => (who = w)
    );
    rest = parseSse(
      rest + 'nse":"God"}\n\ndata: [DONE]\n\n',
      (t) => text.push(t),
      (w) => (who = w)
    );
    expect(who).toBe("seed-bible.svc · llama");
    expect(text.join("")).toBe("For God");
    expect(rest).toBe("");
  });
});
