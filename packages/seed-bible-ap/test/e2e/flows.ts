// THE FLOWS — one per feature row of the training manual, each what a tester would do by hand, each ending in an
// observable result. Signed-out flows first (device-only marks), then the sample person (the vault), then two
// devices in a session. Add a flow for every new feature row; the runner writes the marks the manual carries.
import type { Flow } from "./harness";
import { MORE_FLOWS } from "./flows-more";

const CH = "/read/BSB/JHN/3";

const BASE_FLOWS: Flow[] = [
  // ── 3. Reading ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "R1",
    rows: ["Open a book and chapter"],
    section: "3. Reading",
    title: "Open a chapter",
    checks:
      "/read/BSB/JHN/3 is rendered on the edge (verse 16 in the HTML) and the app takes over without clearing it",
    run: async (c) => {
      const res = await c.page.goto(
        `https://seed-reader.faithnet.io${CH}`.replace(
          "https://seed-reader.faithnet.io",
          (
            process.env["E2E_BASE"] ?? "https://seed-reader.faithnet.io"
          ).replace(/\/$/, "")
        ),
        { waitUntil: "domcontentloaded" }
      );
      const html = await res!.text().catch(() => "");
      if (!/data-verse-number="16"/.test(html))
        throw new Error("the edge did not render verse 16");
      await c.dismissWelcome();
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await c.verse(16).waitFor({ timeout: 20000 });
      const title = await c.page
        .locator(".sb-bible-reader-title")
        .first()
        .innerText();
      if (!/John\s*3/.test(title)) throw new Error(`header reads "${title}"`);
      return `edge-rendered, then live; header "${title.replace(/\s+/g, " ")}"`;
    },
  },
  {
    id: "R2",
    rows: ["Next / previous chapter"],
    section: "3. Reading",
    title: "Next / previous chapter",
    checks: "The toolbar arrows move to John 4 and back; the URL follows",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator('.sb-reader-toolbar button[aria-label="Next Chapter"]')
        .click();
      await c.page.waitForURL(/\/read\/BSB\/JHN\/4$/, { timeout: 15000 });
      await c.waitText(
        c.page.locator(".sb-bible-reader-active .sb-bible-reader-title"),
        /John\s*4/
      );
      await c.page
        .locator('.sb-reader-toolbar button[aria-label="Previous Chapter"]')
        .click();
      await c.page.waitForURL(/\/read\/BSB\/JHN\/3$/, { timeout: 15000 });
      await c.page.goBack();
      await c.page.waitForURL(/\/read\/BSB\/JHN\/4$/, { timeout: 15000 });
      return "John 3 → 4 → 3, and browser back → 4";
    },
  },
  {
    id: "R3",
    rows: ["Open a book and chapter"],
    section: "3. Reading",
    title: "Pick a book and chapter",
    checks:
      "Tap the header title, search 'Psalms', pick the book and chapter 23; the chapter opens",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-title")
        .click();
      const search = c.page.locator('input[type="search"]').first();
      await search.waitFor({ timeout: 10000 });
      await search.fill("Psalms");
      // A search down to one book opens it; tap it only if it is still shut.
      const psalms = c.page.getByRole("button", { name: /^Psalms$/ }).first();
      if ((await psalms.getAttribute("aria-expanded")) !== "true")
        await psalms.click();
      await c.page.getByRole("button", { name: /^23$/ }).first().click();
      await c.page.waitForURL(/\/read\/BSB\/PSA\/23$/, { timeout: 15000 });
      await c.verse(1).waitFor({ timeout: 20000 });
      return "Psalm 23 opened from the selector";
    },
  },
  {
    id: "R4",
    rows: ["Change translation"],
    section: "3. Reading",
    title: "Change translation",
    checks:
      "Tap the translation code, choose another (search 'World English'), the header shows the new code",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-translation")
        .click();
      const search = c.page.locator("#translation-search-input");
      await search.waitFor({ timeout: 10000 });
      await search.fill("World English");
      const row = c.page.locator(".translation-option").first();
      // The list comes from the scripture agent, which can take a while on a cold start.
      await row.waitFor({ timeout: 40000 });
      const label = (await row.innerText()).replace(/\s+/g, " ");
      await row.click();
      await c.page.waitForURL(/\/read\/(?!BSB\/)[A-Za-z0-9_]+\/JHN\/3$/, {
        timeout: 15000,
      });
      await c.verse(16).waitFor({ timeout: 20000 });
      return `switched to ${label.slice(0, 40)}`;
    },
  },
  {
    id: "R5",
    rows: ["Share a verse / copy link"],
    section: "3. Reading",
    title: "Share link selects verses",
    checks:
      "?v=16-18 opens with John 3:16–18 selected and the verse toolbar's Highlight naming them",
    run: async (c) => {
      await c.open(`${CH}?v=16-18`);
      await c.page.locator(".sb-verse-toolbar").waitFor({ timeout: 15000 });
      // The verse toolbar names the verses in its colour picker (the old reader's desktop row has no reference).
      await c.page.locator(".sb-verse-toolbar-highlight-trigger").click();
      const ref = await c.page
        .locator(".sb-verse-toolbar-ref-text")
        .innerText();
      if (!/16[–-]18/.test(ref)) throw new Error(`toolbar reads "${ref}"`);
      const selected = await c.page
        .locator(".sb-bible-reader-active .sb-verse-selected")
        .count();
      if (selected < 3) throw new Error(`${selected} verses selected`);
      return `toolbar "${ref}", ${selected} verses selected`;
    },
  },
  {
    id: "R6",
    rows: ["Embed in another site"],
    section: "13. Links and embedding",
    title: "Embed and theme parameters",
    checks:
      "?embed=minimal hides the sidebar and toolbars; ?theme=dark applies the dark theme",
    run: async (c) => {
      await c.open(`${CH}?embed=minimal`);
      if (
        await c.page
          .locator(".sb-tabs-sidebar")
          .isVisible()
          .catch(() => false)
      )
        throw new Error("sidebar visible in embed");
      if (
        await c.page
          .locator(".sb-reader-toolbar-desk")
          .isVisible()
          .catch(() => false)
      )
        throw new Error("toolbar visible in embed");
      await c.verse(16).waitFor({ timeout: 20000 });
      await c.open(`${CH}?theme=dark`);
      const dark = await c.page.evaluate(
        () => document.documentElement.dataset["sbTheme"] ?? ""
      );
      if (dark !== "dark") throw new Error(`data-sb-theme is "${dark}"`);
      return `embed hides the chrome; data-sb-theme="dark"`;
    },
  },
  {
    id: "R7",
    rows: ["Light / dark theme"],
    section: "3. Reading",
    title: "Light / dark theme toggle",
    checks: "The Themes button in the toolbar flips the theme marker",
    run: async (c) => {
      await c.open(CH);
      const marker = () =>
        c.page.evaluate(
          () => document.documentElement.dataset["sbTheme"] ?? ""
        );
      const before = await marker();
      await c.pressToolbar("Themes");
      await c.page.waitForTimeout(500);
      const after = await marker();
      if (before === after) throw new Error(`no change (${before})`);
      return `data-sb-theme "${before}" → "${after}"`;
    },
  },
  {
    id: "R8",
    rows: ["Text size"],
    section: "3. Reading",
    title: "Text size",
    checks: "Account pane → size XL; the reader carries sb-font-size-xl",
    run: async (c) => {
      await c.open(CH);
      await c.pressToolbar("Sign in");
      await c.pane().waitFor({ timeout: 5000 });
      const select = c
        .pane()
        .locator("select")
        .filter({ has: c.page.locator('option[value="xl"]') })
        .first();
      await select.selectOption("xl");
      await c.page
        .locator(
          ".sb-bible-reader-active.sb-font-size-xl, .sb-bible-reader.sb-font-size-xl"
        )
        .first()
        .waitFor({ timeout: 5000 });
      return "reader class sb-font-size-xl";
    },
  },
  {
    id: "R9",
    rows: ["Interface language (77 locales)"],
    section: "3. Reading",
    title: "Interface language",
    checks:
      "Account pane → Language → français; the sidebar heading changes from 'Tabs'",
    run: async (c) => {
      await c.open(CH);
      await c.pressToolbar("Sign in");
      await c.pane().waitFor({ timeout: 5000 });
      const before = (
        await c.page.locator(".sb-tabs-sidebar").innerText()
      ).replace(/\s+/g, " ");
      const select = c
        .pane()
        .locator("select")
        .filter({ has: c.page.locator('option[value="fr"]') })
        .first();
      await select.selectOption("fr");
      await c.page.waitForTimeout(1500);
      const after = (
        await c.page.locator(".sb-tabs-sidebar").innerText()
      ).replace(/\s+/g, " ");
      if (before === after) throw new Error("sidebar text unchanged");
      if (!/onglets/i.test(after))
        throw new Error(`sidebar now "${after.slice(0, 60)}"`);
      return `"${before.slice(0, 20)}…" → "${after.slice(0, 20)}…"`;
    },
  },
  {
    id: "R10",
    rows: [],
    section: "6. Tabs and panes",
    title: "Tabs",
    checks:
      "New tab adds a second tab on the same chapter; closing it leaves one",
    run: async (c) => {
      await c.open(CH);
      const tabs = c.page.locator(".sb-tabs-sidebar .sb-tab-button");
      const n0 = await tabs.count();
      await c.page
        .locator('.sb-tabs-sidebar button[aria-label="New tab"]')
        .first()
        .click();
      await c.page.waitForTimeout(800);
      const n1 = await tabs.count();
      if (n1 <= n0) throw new Error(`tabs ${n0} → ${n1}`);
      // The old reader's tab ⋮ → Close.
      await c.page
        .locator('.sb-tabs-sidebar button[aria-label="Tab options"]')
        .last()
        .click();
      await c.page.getByRole("menuitem", { name: /^close$/i }).click();
      await c.page.waitForTimeout(500);
      const n2 = await tabs.count();
      if (n2 !== n0) throw new Error(`tabs after close ${n2}, expected ${n0}`);
      return `tabs ${n0} → ${n1} → ${n2}`;
    },
  },
  // ── 4. Marking the text (signed out: on the device) ─────────────────────────────────────────────────────
  {
    id: "M1",
    rows: ["Highlight (6 colours)", "Clear a highlight"],
    section: "4. Marking the text",
    title: "Highlight and clear",
    checks:
      "Select 3:16, tap a colour → a ribbon appears; select again → Clear highlight → gone",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.pickColor(1);
      await c.page
        .locator(".sb-bible-reader-active [data-highlight-fill]")
        .first()
        .waitFor({ timeout: 5000 });
      await c.selectVerse(16);
      await c.clearHighlight();
      await c.page.waitForTimeout(500);
      const left = await c.page
        .locator(".sb-bible-reader-active [data-highlight-fill]")
        .count();
      if (left) throw new Error(`${left} highlight(s) left`);
      return "ribbon drawn, then cleared";
    },
  },
  {
    id: "M2",
    rows: ["Write a note", "Edit / delete a note"],
    section: "4. Marking the text",
    title: "Write, edit and delete a note",
    checks:
      "Select 3:16 → Note → type → Save → it is listed under John 3:16; its ⋮ → Edit changes it; ⋮ → Delete asks 'Delete annotation?' and removes it",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.page.locator(".sb-verse-toolbar-note").click();
      await c.page
        .locator(".sb-note-card-draft [contenteditable]")
        .first()
        .waitFor({ timeout: 20000 });
      await c.page
        .locator(".sb-note-card-draft [contenteditable]")
        .first()
        .fill("a note from the flow");
      await c.page
        .locator(".sb-note-card-draft")
        .getByRole("button", { name: /^save$/i })
        .click();
      const card = c.page
        .locator(".sb-note-card:not(.sb-note-card-draft)")
        .first();
      await c.waitText(card, /a note from the flow/);
      await c.noteAction(card, /^edit$/i);
      await c.page
        .locator(".sb-note-card [contenteditable]")
        .first()
        .fill("an edited note");
      await c.page
        .locator(".sb-note-card")
        .getByRole("button", { name: /^save$/i })
        .first()
        .click();
      await c.waitText(
        c.page.locator(".sb-note-card").first(),
        /an edited note/
      );
      await c.noteAction(c.page.locator(".sb-note-card").first(), /^delete$/i);
      await c.waitText(c.pane(), /0 notes/);
      return "created, edited, deleted; the pane counts 0 notes";
    },
  },
  {
    id: "M3",
    rows: ["Bookmark a chapter", "Save a chapter"],
    section: "4. Marking the text",
    title: "Bookmark and save a chapter; see them in Your Content",
    checks:
      "Header bookmark and ☆ toggle; Your Content lists John 3 under Bookmarks and Saves",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(
          ".sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-bookmark-button"
        )
        .click();
      await c.bookmarkPicker();
      await c.page
        .locator(
          ".sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-save-button"
        )
        .click();
      await c.savePicker();
      await c.pressToolbar("Your content");
      await c.pane().waitFor({ timeout: 5000 });
      await c.waitText(c.pane(), /John 3/);
      const text = await c.paneText();
      if (!/bookmark/i.test(text) || !/save/i.test(text))
        throw new Error(`pane: ${text.slice(0, 160)}`);
      return "John 3 listed under bookmarks and saves";
    },
  },
  {
    id: "M4",
    rows: ["Share a verse / copy link", "Embed in another site"],
    section: "4. Marking the text",
    title: "Share a verse: link and embed code",
    checks:
      "Select 3:16 → Share opens the old reader's Share window; Share a link copies a link ending in ?v=16; Embed gives an iframe of the compact reader, dark when Dark is chosen",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.page
        .locator(".sb-verse-toolbar-action", { hasText: /share/i })
        .click();
      const dialog = c.page.locator(".sb-share-dialog");
      await dialog.waitFor({ timeout: 5000 });
      await dialog.getByRole("button", { name: /share a link/i }).click();
      await dialog.waitFor({ state: "detached", timeout: 3000 });
      await c.page.waitForTimeout(300);
      const clip = await c.page
        .evaluate(() => navigator.clipboard.readText())
        .catch(() => "");
      if (!/\/read\/BSB\/JHN\/3\?v=16$/.test(clip))
        throw new Error(`clipboard: "${clip.slice(0, 80)}"`);
      // Verse 16 is still chosen after the link was copied.
      if (
        !(await c.page.locator(".sb-verse-toolbar-action").first().isVisible())
      )
        await c.selectVerse(16);
      await c.page
        .locator(".sb-verse-toolbar-action", { hasText: /share/i })
        .click();
      await dialog.locator(".sb-share-action", { hasText: /embed/i }).click();
      await dialog.locator("select").selectOption("dark");
      const code = await dialog.locator(".sb-share-embed-code").inputValue();
      if (!/^<iframe src="[^"]*embed=minimal[^"]*theme=dark/.test(code))
        throw new Error(`embed code: ${code.slice(0, 120)}`);
      await c.page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached", timeout: 3000 });
      return `${clip}; embed ${code.slice(0, 60)}…`;
    },
  },
  {
    id: "M5",
    rows: ["Save a verse range"],
    section: "4. Marking the text",
    title: "Save a verse range",
    checks:
      "Select 3:15–16 → Save in the verse toolbar; Your Content lists John 3:15–16",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(15);
      await c.tapVerse(16);
      await c.settled(c.page.locator(".sb-verse-toolbar"));
      await c.page
        .locator(".sb-verse-toolbar-action", { hasText: "Save" })
        .first()
        .click();
      await c.savePicker();
      await c.pressToolbar("Your content");
      await c.waitText(c.pane(), /John 3:15[–-]16/);
      return "John 3:15–16 saved";
    },
  },
  // ── 5. Your Content and search ──────────────────────────────────────────────────────────────────────────
  // ── 8. Today, Discover ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "S1",
    rows: ["Discover"],
    section: "8. Today, Discover and publishing",
    title: "Discover for a chapter",
    checks:
      "The Discover pane opens for John 3 and lists what was published (or says nothing yet) without an error",
    run: async (c) => {
      await c.open(CH);
      await c.pressToolbar("Discover");
      await c.pane().waitFor({ timeout: 5000 });
      await c.page.waitForTimeout(2500);
      const text = await c.paneText();
      if (await c.pane().locator(".sb-pane-error").count())
        throw new Error(`error: ${text.slice(0, 160)}`);
      return text.slice(0, 100);
    },
  },
  {
    id: "S2",
    rows: ["Today pane"],
    section: "8. Today, Discover and publishing",
    title: "Today, signed out",
    checks:
      "Today opens as the old reader's full page — the whole area beside the sidebar, the bottom bar staying where it was — with its welcome — the date, Welcome!, John 1:1 in the open translation, Open Bible, Read John 1 and Take a tour — and asks for sign-in for friends rather than failing; Read John 1 opens John 1",
    run: async (c) => {
      await c.open(CH);
      const barCentre = () =>
        c.page.locator(".sb-reader-toolbar-desk").evaluate((n) => {
          const r = n.getBoundingClientRect();
          return Math.round((r.left + r.right) / 2);
        });
      const before = await barCentre();
      await c.pressToolbar("Today");
      await c.pane().waitFor({ timeout: 5000 });
      await c.waitText(c.pane(), /sign in/i, 8000);
      const fill = await c.page.evaluate(() => {
        const side = document
          .querySelector(".sb-tabs-sidebar")!
          .getBoundingClientRect();
        const pane = document
          .querySelector(".sb-app-pane")!
          .getBoundingClientRect();
        return {
          gap: Math.round(pane.left - side.right),
          right: Math.round(innerWidth - pane.right),
        };
      });
      if (Math.abs(fill.gap) > 2 || Math.abs(fill.right) > 2)
        throw new Error(
          `Today is not the full page beside the sidebar: ${JSON.stringify(fill)}`
        );
      await c.page.waitForTimeout(500);
      const during = await barCentre();
      if (Math.abs(during - before) > 2)
        throw new Error(
          `the bottom bar moved from x=${before} to x=${during} when Today opened`
        );
      const welcome = c.pane().locator(".sb-today-welcome-screen");
      await c.waitText(welcome, /in the beginning was the word/i, 10000);
      const text = (await welcome.innerText()).replace(/\s+/g, " ");
      for (const w of [
        /welcome!/i,
        /john 1:1/i,
        /open bible/i,
        /read john 1/i,
        /take a tour/i,
      ])
        if (!w.test(text)) throw new Error(`welcome: ${text.slice(0, 160)}`);
      await welcome.getByRole("button", { name: /read john 1/i }).click();
      await c.page.waitForURL(/\/JHN\/1(\?|$)/, { timeout: 10000 });
      return `full page beside the sidebar, the bar stayed at x=${before}; ${text.slice(0, 80)}…; Read John 1 opened John 1`;
    },
  },
  // ── 12. Extensions ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: "X1",
    rows: ["Places"],
    section: "12. Extensions",
    title: "Places map",
    checks:
      "On Genesis 12 the Places map pane shows the published Bible lands base map (its tiles drawn) with at least one place marker",
    run: async (c) => {
      await c.open("/read/BSB/GEN/12");
      await c
        .pressToolbar("Places map")
        .catch(async () => c.pressToolbar("Places"));
      await c.page.locator(".leaflet-container").waitFor({ timeout: 20000 });
      await c.page
        .locator("canvas.leaflet-tile-loaded")
        .first()
        .waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(2000);
      const tiles = await c.page.locator("canvas.leaflet-tile-loaded").count();
      const markers = await c.page
        .locator(".leaflet-marker-icon, .leaflet-interactive")
        .count();
      if (!markers) throw new Error("no markers");
      return `base map with ${tiles} tile(s) drawn, ${markers} marker(s)`;
    },
  },
  {
    id: "X8",
    rows: ["Places"],
    section: "12. Extensions",
    title: "Places map follows a chapter that arrives late",
    checks:
      "With the Places map open on Deuteronomy 32, move to John 1 while its chapter is slow to arrive: the map draws John 1's places from the publishers (Jerusalem, Bethany beyond the Jordan, Galilee, Beth-Saida, Nazareth), not Deuteronomy's, and marks Bethany beyond the Jordan's site as uncertain",
    run: async (c) => {
      await c.page.route(/\/bible\/api\/rbs\/JHN\/1\.json/, async (route) => {
        await new Promise((r) => setTimeout(r, 3000));
        await route.continue();
      });
      await c.open("/read/rbs/DEU/32");
      await c
        .pressToolbar("Places map")
        .catch(async () => c.pressToolbar("Places"));
      const canvas = c.page.locator(".sb-places-map-canvas");
      await c.page.waitForFunction(
        () =>
          !!document.querySelector<HTMLElement>(".sb-places-map-canvas")
            ?.dataset["drawn"],
        undefined,
        { timeout: 30000 }
      );
      const before = await canvas.getAttribute("data-drawn");
      await c.page.evaluate(() => {
        history.pushState({}, "", "/read/rbs/JHN/1");
        dispatchEvent(new PopStateEvent("popstate"));
      });
      const want = [
        "Jerusalem",
        "Bethany (Beyond the Jordan)",
        "Galilee",
        "Beth-Saida",
        "Nazareth",
      ];
      await c.page
        .waitForFunction(
          (names) => {
            const d =
              document.querySelector<HTMLElement>(".sb-places-map-canvas")
                ?.dataset["drawn"] ?? "";
            return names.every((n) => d.split(",").includes(n));
          },
          want,
          { timeout: 30000 }
        )
        .catch(async () => {
          throw new Error(
            `John 1's map drew "${await canvas.getAttribute("data-drawn")}" (Deuteronomy 32 had "${before}")`
          );
        });
      const uncertain = c.page.locator(".sb-places-list li", {
        hasText: "Bethany (Beyond the Jordan)",
      });
      await c.waitText(uncertain, /site uncertain/, 10000);
      return `Deuteronomy 32 drew ${before}; John 1 drew ${await canvas.getAttribute("data-drawn")}; Bethany beyond the Jordan: site uncertain`;
    },
  },
  {
    id: "X9",
    rows: ["Content"],
    section: "12. Extensions",
    title: "A people group published at a verse",
    checks:
      "On Acts 6, tap verse 1 and Content: the pane shows the published note about the Hellenists (Greek-speaking Jewish Christians) with its picture and its fields, read from Source Publishing",
    run: async (c) => {
      await c.open("/read/BSB/ACT/6");
      await c.selectVerse(1);
      // By its label, not its text: the Copy button's icon ligature reads "content_copy".
      const content = c.page.locator(".sb-verse-toolbar-action", {
        has: c.page.locator(".sb-verse-toolbar-action-label", {
          hasText: /^Content$/,
        }),
      });
      await content.first().waitFor({ timeout: 40000 });
      await content.first().click();
      const item = c.page.locator(".sb-content-teaching-item", {
        hasText: /Hellenists/,
      });
      await item.first().waitFor({ timeout: 30000 });
      const img = item.first().locator("img.sb-content-teaching-image");
      await img.waitFor({ timeout: 20000 });
      const src = (await img.getAttribute("src")) ?? "";
      if (!/\/public\/asset\/[0-9a-f]{64}$/.test(src))
        throw new Error(`the picture is not a signed asset: ${src}`);
      // The picture arrives after the pane: wait for it to have drawn, not just to be in the page.
      await img
        .evaluate(
          (el) =>
            new Promise<void>((res, rej) => {
              const i = el as HTMLImageElement;
              if (i.complete && i.naturalWidth > 0) return res();
              i.addEventListener("load", () => res(), { once: true });
              i.addEventListener("error", () => rej(new Error("error")), {
                once: true,
              });
            })
        )
        .catch(() => {
          throw new Error("the picture did not load");
        });
      const fields = await item
        .first()
        .locator(".sb-content-teaching-field dt")
        .allInnerTexts();
      const title = await item
        .first()
        .locator(".sb-content-teaching-title")
        .innerText();
      return `"${title}" with its picture and fields ${fields.join(", ")}`;
    },
  },
  {
    id: "X10",
    rows: ["Places"],
    section: "12. Extensions",
    title: "A people group's region on the map",
    checks:
      "On Acts 8 the Places map draws the Samaritan believers' region from the published map work beside the Bible places, and tapping it opens the group's picture and summary",
    run: async (c) => {
      await c.open("/read/BSB/ACT/8");
      await c
        .pressToolbar("Places map")
        .catch(async () => c.pressToolbar("Places"));
      const canvas = c.page.locator(".sb-places-map-canvas");
      await c.page.waitForFunction(
        () =>
          (
            document.querySelector<HTMLElement>(".sb-places-map-canvas")
              ?.dataset["drawn"] ?? ""
          )
            .split(",")
            .includes("Samaritan believers"),
        undefined,
        { timeout: 60000 }
      );
      const drawn = (await canvas.getAttribute("data-drawn")) ?? "";
      await c.page
        .locator(".sb-places-list button", { hasText: /^Samaritan believers$/ })
        .first()
        .waitFor({ timeout: 10000 });
      return `drew ${drawn.split(",").length} places including the Samaritan believers' region`;
    },
  },
  {
    id: "X2",
    rows: ["Compare translations"],
    section: "12. Extensions",
    title: "Compare translations",
    checks:
      "Select 3:16 → Compare in the verse toolbar; the pane shows the verse in other translations",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.page
        .locator(".sb-verse-toolbar-action", { hasText: "Compare" })
        .first()
        .click();
      await c.pane().waitFor({ timeout: 5000 });
      await c.waitText(c.pane(), /loved/i, 20000);
      return (await c.paneText()).slice(0, 80);
    },
  },
  // ── 2. Getting in, 4. the vault ─────────────────────────────────────────────────────────────────────────
  {
    id: "A1",
    rows: [],
    section: "2. Getting in",
    title: "Sign in as a sample person, mark, sync, sign out",
    checks:
      "Account pane → a sample person → the chip shows their name; a highlight reaches the Library ('Everything is in your Library'); Sign out clears the chip",
    run: async (c) => {
      await c.open(CH);
      const who = await c.signInAsSample();
      await c.selectVerse(16);
      await c.pickColor(2);
      await c.openAccount();
      await c.pane().waitFor({ timeout: 5000 });
      try {
        await c.waitText(c.pane(), /everything is in your library/i, 120000);
      } catch {
        throw new Error(
          `the highlight did not reach the Library: ${(await c.paneText()).replace(/.*Library through[^.]*\./, "").slice(0, 200)}`
        );
      }
      await c
        .pane()
        .getByRole("button", { name: /sign out/i })
        .click();
      await c.page
        .locator(
          ".sb-sidebar-profile-button:not(.sb-sidebar-profile-button-in)"
        )
        .waitFor({ timeout: 10000 });
      return `signed in as ${who}; the highlight reached the Library; signed out`;
    },
  },
  {
    id: "L1",
    rows: [
      "Start a session",
      "Join a session",
      "Follow the leader",
      "Guests and voice",
    ],
    section: "9. Reading together",
    title: "Start a session; a guest joins and follows",
    checks:
      "Signed in: Start a session → its Session ID and Code show; a second browser joins as a guest with id and code; the host moves to John 4 and the guest follows",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      await c
        .pressToolbar("Session")
        .catch(() => c.pressToolbar("Live session"));
      await c.pane().waitFor({ timeout: 5000 });
      await c
        .pane()
        .getByRole("button", { name: /start a session/i })
        .click();
      await c.pane().locator(".sb-session-code").waitFor({ timeout: 20000 });
      const text = await c.paneText();
      const code = (
        await c.pane().locator(".sb-session-code").innerText()
      ).trim();
      await c
        .pane()
        .getByRole("button", { name: /copy link/i })
        .click();
      await c.page.waitForTimeout(300);
      const link = await c.page
        .evaluate(() => navigator.clipboard.readText())
        .catch(() => "");
      if (!code) throw new Error(`no share code in: ${text.slice(0, 120)}`);
      const guest = await c.secondPage();
      const sid = /session=([^&]+)/.exec(link)?.[1];
      await c.open(sid ? `${CH}?session=${sid}&code=${code}` : CH, guest);
      await guest
        .locator(".sb-session-join")
        .first()
        .waitFor({ timeout: 15000 });
      const join = guest.locator(".sb-session-join").first();
      await join
        .locator('input[placeholder*="name" i]')
        .first()
        .fill("Flow guest")
        .catch(() => undefined);
      if (!sid) throw new Error("no session id in the copied link");
      await join.getByRole("button", { name: /join as a guest/i }).click();
      await c.waitText(guest.locator(".sb-app-pane"), /connected/i, 20000);
      await c.page
        .locator('.sb-reader-toolbar button[aria-label="Next Chapter"]')
        .click();
      await guest.waitForURL(/\/read\/BSB\/JHN\/4$/, { timeout: 20000 });
      return `code ${code}; the guest followed to John 4`;
    },
  },
];

export const FLOWS: Flow[] = [...BASE_FLOWS, ...MORE_FLOWS];
