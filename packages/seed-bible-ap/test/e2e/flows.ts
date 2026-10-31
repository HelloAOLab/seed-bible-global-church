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
    id: "X11",
    rows: ["Places"],
    section: "12. Extensions",
    title: "Places map without its base map",
    checks:
      "When the base map's library cannot be loaded (as in a tab left open across a deploy, where the host answers the app shell for a chunk it no longer has), the Places map on Acts 6 still draws the chapter's places and says under the map that the base map could not be loaded, with Reload",
    run: async (c) => {
      // The map library's chunk, answered as the host answers a stale tab: the app shell, status 200.
      await c.page.route(/\/assets\/[^/]+\.js(\?.*)?$/, async (route) => {
        try {
          const res = await route.fetch();
          const body = await res.text();
          if (!body.includes("protomaps"))
            return await route.fulfill({ response: res, body });
          return await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: "<!doctype html><html><body></body></html>",
          });
        } catch {
          // A request still in flight as the page goes away.
          await route.continue().catch(() => undefined);
        }
      });
      await c.open("/read/BSB/ACT/6");
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
            .includes("Jerusalem"),
        undefined,
        { timeout: 60000 }
      );
      const problem = c.page.locator(".sb-places-base-problem");
      await c.waitText(problem, /base map could not be loaded/i, 20000);
      await problem.getByRole("button", { name: /^Reload$/ }).waitFor();
      const markers = await c.page.locator(".leaflet-interactive").count();
      if (!markers) throw new Error("no markers");
      const tiles = await c.page.locator("canvas.leaflet-tile").count();
      if (tiles) throw new Error(`${tiles} tile(s) drawn without the library`);
      return `drew ${(await canvas.getAttribute("data-drawn"))?.split(",").length} places (${markers} marker(s)) on a blank map; "${(await problem.innerText()).slice(0, 60)}…" with Reload`;
    },
  },
  {
    id: "X12",
    rows: ["Content", "Interpretations"],
    section: "12. Extensions",
    title: "A study note on a verse",
    checks:
      "On Genesis 1 (BSB), tap verse 2 and Content: the pane's 'Study notes on this verse' shows the Reformation Study Bible's note '1:2 The earth.' with its words and Ligonier's attribution, read from Source Publishing; the Interpretations pane shows the same notes under the verse as a later reader's understanding",
    run: async (c) => {
      await c.open("/read/BSB/GEN/1");
      await c.selectVerse(2);
      const content = c.page.locator(".sb-verse-toolbar-action", {
        has: c.page.locator(".sb-verse-toolbar-action-label", {
          hasText: /^Content$/,
        }),
      });
      await content.first().waitFor({ timeout: 40000 });
      await content.first().click();
      const section = c.page.locator("#sb-content-study-notes");
      await section.waitFor({ timeout: 30000 });
      const item = section.locator(".sb-content-teaching-item", {
        hasText: /1:2 The earth\./,
      });
      await item.first().waitFor({ timeout: 10000 });
      const text = await item.first().innerText();
      if (!/lightless and landless/.test(text))
        throw new Error(`note without its words: ${text.slice(0, 120)}`);
      if (!/Ligonier/.test(text))
        throw new Error(`note without its attribution: ${text.slice(0, 160)}`);
      const notes = await section.locator(".sb-content-teaching-item").count();
      // the verse bar's Interpretations (Genesis 1:2 carries a record)
      await c.selectVerse(2);
      const interpretations = c.page.locator(".sb-verse-toolbar-action", {
        has: c.page.locator(".sb-verse-toolbar-action-label", {
          hasText: /^Interpretations$/,
        }),
      });
      await interpretations.first().waitFor({ timeout: 40000 });
      await interpretations.first().click();
      const interp = c.page.locator(".sb-interp-study-notes");
      await interp.waitFor({ timeout: 30000 });
      await c.waitText(interp, /The earth/, 10000);
      return `${notes} study note(s) on Genesis 1:2, "1:2 The earth." with its words and © Ligonier; shown under the verse in Interpretations too`;
    },
  },
  {
    id: "X13",
    rows: ["Places"],
    section: "12. Extensions",
    title: "Places map on the full page with a place's details",
    checks:
      "On Acts 8 open the Places map, press Expand on its header: the map fills the page beside a details column; tap 'Samaritan believers' in the list: the column shows the group's picture, period and summary and the verses naming it; Shrink puts the map back beside the chapter",
    run: async (c) => {
      await c.open("/read/BSB/ACT/8");
      await c
        .pressToolbar("Places map")
        .catch(async () => c.pressToolbar("Places"));
      await c.page.locator(".sb-places-map-canvas").waitFor({ timeout: 20000 });
      await c.page.getByRole("button", { name: /^Expand$/ }).click();
      const full = c.page.locator(".sb-app-pane-full .sb-places-map-full");
      await full.waitFor({ timeout: 10000 });
      const side = c.page.locator(".sb-places-side");
      await side.waitFor({ timeout: 10000 });
      await side
        .locator(".sb-places-list button", { hasText: /^Samaritan believers$/ })
        .first()
        .click({ timeout: 60000 });
      const detail = c.page.locator(".sb-places-detail");
      await detail.waitFor({ timeout: 10000 });
      await c.waitText(detail, /Samaritan believers/, 5000);
      await detail
        .locator("img.sb-places-detail-image")
        .waitFor({ timeout: 20000 });
      const text = await detail.innerText();
      if (!/Named in/.test(text))
        throw new Error(`no verses in the details: ${text.slice(0, 120)}`);
      const width = await c.page
        .locator(".sb-places-map-canvas")
        .evaluate((el) => el.getBoundingClientRect().width);
      const page = await c.page
        .locator(".sb-app-pane-full")
        .evaluate((el) => el.getBoundingClientRect().width);
      if (width < page * 0.55)
        throw new Error(
          `the full-page map is only ${width}px of the ${page}px pane`
        );
      await c.page.getByRole("button", { name: /^Shrink$/ }).click();
      await c.page
        .locator(".sb-app-pane-full")
        .waitFor({ state: "detached", timeout: 10000 });
      return `full page: map ${Math.round(width)}px of the ${Math.round(page)}px pane with the details column; Samaritan believers' picture, period, summary and verses; shrunk back`;
    },
  },
  {
    id: "X14",
    rows: ["Places"],
    section: "12. Extensions",
    title: "A place in the list goes to its verse",
    checks:
      "On Acts 6 open the Places map and tap 'Alexandria' in the list under it: verse 9 (the Synagogue of the Freedmen) is selected and scrolled into view",
    run: async (c) => {
      await c.open("/read/BSB/ACT/6");
      await c
        .pressToolbar("Places map")
        .catch(async () => c.pressToolbar("Places"));
      const link = c.page.locator(".sb-places-list button", {
        hasText: /^Alexandria$/,
      });
      await link.first().waitFor({ timeout: 60000 });
      await link.first().click();
      const verse = c.verse(9);
      await c.page.waitForFunction(
        () => document.querySelector(".sb-verse-toolbar") !== null,
        undefined,
        { timeout: 10000 }
      );
      const selected = await c.page.evaluate(() =>
        Array.from(
          document.querySelectorAll('[data-verse-number][class*="selected"]')
        ).map((e) => e.getAttribute("data-verse-number"))
      );
      const visible = await verse.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      });
      if (!visible)
        throw new Error(
          `verse 9 not on screen (selected: ${selected.join(",")})`
        );
      return `Alexandria → verse 9 selected (${selected.join(",") || "verse bar shown"}) and on screen`;
    },
  },
  {
    id: "X15",
    rows: ["Interpretations"],
    section: "12. Extensions",
    title: "The Writings pane lists a study Bible's notes as reception",
    checks:
      "On Genesis 1 open Writings (the bottom toolbar): under 'Commentary on the chapter — later readers' the Reformation Study Bible's study notes are listed as a later reading (Reformed confessional) with their note count and Ligonier's attribution; 'Show … notes' opens the notes, each with a link to the whole note at the publisher",
    run: async (c) => {
      await c.open("/read/BSB/GEN/1");
      await c.pressToolbar("Writings");
      const work = c.page.locator(".sb-writing", {
        hasText: /Reformation Study Bible/,
      });
      await work.first().waitFor({ timeout: 60000 });
      const meta = await work.first().innerText();
      if (
        !/later reading \(Reformed confessional\), listed as reception/.test(
          meta
        )
      )
        throw new Error(`not listed as reception: ${meta.slice(0, 200)}`);
      const count = /(\d+) notes on verses/.exec(meta)?.[1];
      if (!count) throw new Error(`no note count: ${meta.slice(0, 200)}`);
      if (!/Ligonier/.test(meta))
        throw new Error(`no attribution: ${meta.slice(0, 200)}`);
      await work
        .first()
        .getByRole("button", { name: /Show \d+ notes/ })
        .click();
      const link = work
        .first()
        .locator("a", { hasText: /read the whole note at the publisher/ });
      await link.first().waitFor({ timeout: 10000 });
      const href = (await link.first().getAttribute("href")) ?? "";
      if (
        !/publishing\.faithnet\.io\/@demo-admin-1\/reformation-study-bible-study-notes-genesis/.test(
          href
        )
      )
        throw new Error(`link elsewhere: ${href}`);
      return `${count} Reformation Study Bible notes on Genesis 1, listed as a later reading (reception) with Ligonier's attribution; each note links to the published work`;
    },
  },
  {
    id: "X16",
    rows: ["Section stories"],
    section: "12. Extensions",
    title: "A section heading opens its pane, published content first",
    checks:
      "On Genesis 1 tap the heading 'The First Day': the pane at the right is titled 'The First Day' and opens on Published, listing BibleProject's 'Genesis 1-11' section from the publishing app (signed); Overview shows what the story layer holds for 1:3–5 (God speaks light into being) with God on stage; Cast lists God under deity",
    run: async (c) => {
      await c.open("/read/BSB/GEN/1");
      await c.page
        .locator(".sb-bible-reader-active .sb-chapter-heading", {
          hasText: "The First Day",
        })
        .click();
      const pane = c.page.locator(".sb-app-pane .sb-pane").first();
      await pane
        .locator(".sb-pane-header h2", { hasText: "The First Day" })
        .waitFor({ timeout: 20000 });
      if (await c.page.locator(".sb-heading-toolbar").count())
        throw new Error("a toolbar opened");
      const story = pane.locator(".sb-story");
      await story
        .getByRole("tab", { name: /^Published/, selected: true })
        .waitFor({ timeout: 30000 });
      const published = (
        await story.locator(".sb-published-media").innerText()
      ).replace(/\s+/g, " ");
      if (!/Genesis 1-11/.test(published))
        throw new Error(`published: ${published.slice(0, 200)}`);
      const work = await story
        .locator("a", { hasText: "Videos and articles about the Bible" })
        .first()
        .getAttribute("href");
      if (!/publishing\.faithnet\.io/.test(work ?? ""))
        throw new Error(`not from the publishing app: ${work}`);
      await story.getByRole("tab", { name: /^Overview/ }).click();
      const scene = await story
        .locator(".sb-story-scene h4")
        .first()
        .innerText();
      if (!/light/i.test(scene)) throw new Error(`overview is '${scene}'`);
      await story.getByRole("tab", { name: /^Cast/ }).click();
      const cast = (await story.locator(".sb-story-cast").innerText()).replace(
        /\s+/g,
        " "
      );
      if (!/deity.*God/i.test(cast))
        throw new Error(`cast: ${cast.slice(0, 200)}`);
      return `pane 'The First Day'; Published: ${published.slice(0, 70)}…; Overview: '${scene}'`;
    },
  },
  {
    id: "X17",
    rows: ["Section stories"],
    section: "12. Extensions",
    title:
      "Drill from a section into a place, a person's oikos and generations",
    checks:
      "On Acts 16 tap the heading 'Lydia’s Conversion in Philippi' → Setting: the map draws Philippi; Cast → Lydia opens her card; Back; tap 'Paul’s Vision of the Macedonian' → Cast → Paul: his Oikos draws rings (Barnabas, Silas among those he walked with) and Generations draws the churches he planted, Church at Philippi among them, and Epaphras's Church at Colossae a generation further",
    run: async (c) => {
      await c.open("/read/BSB/ACT/16");
      const heading = (text: RegExp) =>
        c.page.locator(".sb-bible-reader-active .sb-chapter-heading", {
          hasText: text,
        });
      const story = c.page.locator(".sb-story");
      await heading(/Lydia/).click();
      await story
        .getByRole("tab", { name: /^Setting/ })
        .click({ timeout: 30000 });
      await story.locator(".sb-story-map").waitFor({ timeout: 30000 });
      await c.page.waitForFunction(
        () =>
          /Philippi/.test(
            document
              .querySelector(".sb-story-map")
              ?.getAttribute("data-drawn") ?? ""
          ),
        null,
        { timeout: 20000 }
      );
      await story.getByRole("tab", { name: /^Cast/ }).click();
      await story
        .getByRole("button", { name: /^Lydia/ })
        .first()
        .click();
      const card = c.page.locator(".sb-story-card");
      await card
        .locator(".sb-theo-name", { hasText: "Lydia" })
        .waitFor({ timeout: 20000 });
      await card.getByRole("button", { name: "Back" }).click();
      await heading(/Macedonian/).click();
      await story.getByRole("tab", { name: /^Cast/ }).click({ timeout: 30000 });
      // The story layer names him as the book does: 'Saul, later called Paul'.
      await story
        .getByRole("button", { name: /called Paul/ })
        .first()
        .click();
      await card
        .locator(".sb-theo-name", { hasText: /^Paul$/ })
        .waitFor({ timeout: 20000 });
      const rings = await card.locator(".sb-story-oikos svg").innerHTML();
      for (const who of ["Barnabas", "Silas"])
        if (!rings.includes(who)) throw new Error(`oikos lacks ${who}`);
      await card.getByRole("tab", { name: "Generations" }).click();
      const tree = await card.locator(".sb-story-generations svg").innerHTML();
      for (const body of ["Church at Philippi", "Church at Colossae"])
        if (!tree.includes(body)) throw new Error(`generations lack ${body}`);
      const label =
        (await card
          .locator(".sb-story-generations svg")
          .getAttribute("aria-label")) ?? "";
      return `Philippi on the map; Lydia's card; Paul's oikos (Barnabas, Silas) and generations (${label})`;
    },
  },
  {
    id: "X18",
    rows: ["Section stories"],
    section: "12. Extensions",
    title:
      "The chapter's title opens the book's pane; the book icon opens the book picker",
    checks:
      "On Genesis 1 tap the title: the pane is titled 'Genesis' and opens on Published with BibleProject's two Genesis overviews from the publishing app; About names the Old Testament, Hebrew and the authorship claims; References → Scripture lists the books Genesis points to; the book icon beside the title opens the book picker",
    run: async (c) => {
      await c.open("/read/BSB/GEN/1");
      await c.page
        .locator(
          ".sb-bible-reader-active .sb-bible-reader-title:visible, .sb-bible-reader-active .sb-bible-reader-mobile-content-title:visible"
        )
        .first()
        .click();
      const pane = c.page.locator(".sb-app-pane .sb-pane").first();
      await pane
        .locator(".sb-pane-header h2", { hasText: /^Genesis$/ })
        .waitFor({ timeout: 20000 });
      const story = pane.locator(".sb-story-book");
      await story
        .getByRole("tab", { name: /^Published/, selected: true })
        .waitFor({ timeout: 30000 });
      const published = (
        await story.locator(".sb-published-media").innerText()
      ).replace(/\s+/g, " ");
      for (const v of ["Genesis 1-11", "Genesis 12-50"])
        if (!published.includes(v))
          throw new Error(`published lacks ${v}: ${published.slice(0, 200)}`);
      await story.getByRole("tab", { name: /^About/ }).click();
      const about = (
        await story.locator(".sb-story-about").innerText()
      ).replace(/\s+/g, " ");
      if (
        !/Old Testament/.test(about) ||
        !/Hebrew/.test(about) ||
        !/authorship/i.test(about)
      )
        throw new Error(`about: ${about.slice(0, 200)}`);
      await story.getByRole("tab", { name: /^References/ }).click();
      const refs = (
        await story.locator(".sb-story-xbooks").first().innerText()
      ).replace(/\s+/g, " ");
      if (!/points to/i.test(refs))
        throw new Error(`references: ${refs.slice(0, 200)}`);
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-book-picker:visible")
        .first()
        .click();
      await c.page
        .getByPlaceholder(/Search books/i)
        .waitFor({ timeout: 10000 });
      await c.page.keyboard.press("Escape");
      return `pane 'Genesis'; Published: Genesis 1-11, Genesis 12-50; About: ${about.slice(0, 60)}…; References: ${refs.slice(0, 60)}…; the book icon opens the picker`;
    },
  },
  {
    id: "X19",
    rows: ["Content"],
    section: "12. Extensions",
    title: "A verse's videos and articles come from the publishing app",
    checks:
      "On Matthew 26, tap verse 26 and Content: under 'Videos and articles about this verse' the pane lists Expedition Bible's 'The Last Supper and Pentecost' and BibleProject's section of Matthew 14-28, from the work 'Videos and articles about the Bible' on the publishing app",
    run: async (c) => {
      await c.open("/read/BSB/MAT/26");
      await c.selectVerse(26);
      await c.page
        .locator(".sb-verse-toolbar-action", {
          has: c.page.locator(".sb-verse-toolbar-action-label", {
            hasText: /^Content$/,
          }),
        })
        .first()
        .click();
      const list = c.page.locator("#sb-content-media .sb-published-media");
      await list.waitFor({ timeout: 30000 });
      const said = (await list.innerText()).replace(/\s+/g, " ");
      for (const v of ["The Last Supper and Pentecost", "Matthew 14-28"])
        if (!said.includes(v))
          throw new Error(`lacks ${v}: ${said.slice(0, 200)}`);
      return said.slice(0, 160);
    },
  },
  {
    id: "X20",
    rows: ["Section stories"],
    section: "12. Extensions",
    title:
      "A person's family by generation, and the extended family in the oikos",
    checks:
      "On Ruth 4 tap 'Boaz Marries Ruth' → Cast → Ruth: her card opens on Family, with Boaz among her spouses, Obed her child and Jesse her grandchild, and Naomi a parent-in-law; Oikos draws the household and extended-family rings, and turning the extended family off in the legend takes its ring away",
    run: async (c) => {
      await c.open("/read/BSB/RUT/4");
      await c.page
        .locator(".sb-bible-reader-active .sb-chapter-heading", {
          hasText: "Boaz Marries Ruth",
        })
        .click();
      const story = c.page.locator(".sb-story");
      await story.getByRole("tab", { name: /^Cast/ }).click({ timeout: 30000 });
      await story
        .getByRole("button", { name: /^Ruth the Moabite/ })
        .first()
        .click();
      const card = c.page.locator(".sb-story-card");
      await card
        .getByRole("tab", { name: "Family", selected: true })
        .waitFor({ timeout: 20000 });
      const family = (
        await card.locator(".sb-story-family").innerText()
      ).replace(/\s+/g, " ");
      for (const want of ["Boaz", "Obed", "Jesse", "Naomi"])
        if (!family.includes(want))
          throw new Error(`family lacks ${want}: ${family.slice(0, 300)}`);
      await card.getByRole("tab", { name: "Oikos" }).click();
      const rings = () => card.locator(".sb-story-oikos-ring").count();
      const before = await rings();
      if (before < 2) throw new Error(`only ${before} ring(s)`);
      await card.getByRole("button", { name: /^Extended family/ }).click();
      if ((await rings()) !== before - 1)
        throw new Error("the extended family ring did not go");
      return `Ruth's family: ${family.slice(0, 140)}…; oikos ${before} rings, extended family toggled off`;
    },
  },
  {
    id: "X21",
    rows: ["Section stories"],
    section: "12. Extensions",
    title: "A household the text names, and the church it became",
    checks:
      "On Acts 16 tap 'Lydia’s Conversion in Philippi' → Cast → Lydia → Oikos: her household is in the bodies ring and the ties list it with Acts 16:15; opening Lydia's household shows Lydia as its head, its verses and that it became the Church at Philippi, whose card says it was gathered from Lydia's household and planted by Paul",
    run: async (c) => {
      await c.open("/read/BSB/ACT/16");
      await c.page
        .locator(".sb-bible-reader-active .sb-chapter-heading", {
          hasText: /Lydia/,
        })
        .click();
      const story = c.page.locator(".sb-story");
      await story.getByRole("tab", { name: /^Cast/ }).click({ timeout: 30000 });
      await story
        .getByRole("button", { name: /^Lydia/ })
        .first()
        .click();
      const card = c.page.locator(".sb-story-card");
      await card.getByRole("tab", { name: "Oikos" }).click({ timeout: 20000 });
      const ties = (await card.locator(".sb-story-ties").innerText()).replace(
        /\s+/g,
        " "
      );
      if (!/household.*Lydia's household.*Acts 16:15/i.test(ties))
        throw new Error(`ties: ${ties.slice(0, 200)}`);
      await card
        .locator(".sb-story-ties")
        .getByRole("button", { name: "Lydia's household" })
        .click();
      await card
        .locator(".sb-theo-name", { hasText: "Lydia's household" })
        .waitFor({ timeout: 20000 });
      const house = (await card.innerText()).replace(/\s+/g, " ");
      if (
        !/Head Lydia/i.test(house) ||
        !/Became Church at Philippi/i.test(house)
      )
        throw new Error(`household: ${house.slice(0, 300)}`);
      await card
        .getByRole("button", { name: "Church at Philippi" })
        .first()
        .click();
      await card
        .locator(".sb-theo-name", { hasText: "Church at Philippi" })
        .waitFor({ timeout: 20000 });
      const church = (await card.innerText()).replace(/\s+/g, " ");
      if (
        !/Gathered from Lydia.s household/i.test(church) ||
        !/Planted by Paul/i.test(church)
      )
        throw new Error(`church: ${church.slice(0, 300)}`);
      return `Lydia → Lydia's household (Acts 16:15) → Church at Philippi, gathered from her household, planted by Paul`;
    },
  },
  {
    id: "X22",
    rows: ["Explore"],
    section: "12. Extensions",
    title: "Explore the ontology: canon, voices, sendings, churches, find",
    checks:
      "From the sidebar's More menu open Explore: the canon wheel draws all 66 books and Genesis's sections under the BSB headings ('The Creation', 'The First Day'); a section opens beside the chapter in the Story pane; Voices draws who speaks to whom in Jonah; Sendings draws the commissions and plantings on the map; Churches draws Paul's plantings; Find 'Lydia' opens her card",
    run: async (c) => {
      await c.open("/read/BSB/GEN/1");
      await c.page
        .locator(".sb-tabs-sidebar")
        .getByRole("button", { name: "More" })
        .first()
        .click();
      await c.page.getByRole("menuitem", { name: /Explore/ }).click();
      const ex = c.page.locator(".sb-explore");
      await ex
        .locator(".sb-explore-section")
        .first()
        .waitFor({ timeout: 30000 });
      const books = await ex.locator(".sb-explore-book").count();
      if (books !== 66) throw new Error(`${books} books on the wheel`);
      const strip = (
        await ex.locator(".sb-explore-sections").innerText()
      ).replace(/\s+/g, " ");
      for (const h of ["The First Day", "The Second Day"])
        if (!strip.includes(h)) throw new Error(`sections lack ${h}`);
      await ex.getByRole("tab", { name: "Voices" }).click();
      await ex.locator("select").selectOption("JON");
      await ex
        .locator(".sb-explore-network .sb-explore-node")
        .first()
        .waitFor({ timeout: 30000 });
      const voices = await ex.locator(".sb-explore-network").innerHTML();
      if (!/Jonah/.test(voices)) throw new Error("Jonah not among the voices");
      await ex.getByRole("tab", { name: "Sendings" }).click();
      await c.page.waitForFunction(
        () =>
          Number(
            document
              .querySelector(".sb-explore-map")
              ?.getAttribute("data-drawn") ?? 0
          ) > 10,
        null,
        { timeout: 30000 }
      );
      await ex.getByRole("tab", { name: "Churches" }).click();
      const forest = await ex.locator(".sb-story-generations svg").innerHTML();
      for (const w of ["Paul", "Church at Philippi"])
        if (!forest.includes(w)) throw new Error(`churches lack ${w}`);
      await ex.getByRole("tab", { name: "Find" }).click();
      await ex.locator(".sb-explore-search").fill("Lydia");
      await ex
        .getByRole("button", { name: /^Lydia$/ })
        .first()
        .click();
      await ex
        .locator(".sb-explore-card .sb-theo-name", { hasText: "Lydia" })
        .waitFor({ timeout: 20000 });
      // Voices chose Jonah, and the views share their book: choose Genesis on the wheel again.
      await ex.getByRole("tab", { name: "Canon" }).click();
      // By keyboard: an arc grows under the pointer, which a pointer-driven click waits on.
      await ex.locator('.sb-explore-book[aria-label="Genesis"]').focus();
      await c.page.keyboard.press("Enter");
      await ex
        .locator(".sb-explore-section", { hasText: "The First Day" })
        .click();
      await c.page
        .locator(".sb-app-pane .sb-pane-header h2", {
          hasText: "The First Day",
        })
        .waitFor({ timeout: 20000 });
      const drawn = await c.page.locator(".sb-explore-map").count();
      return `66 books; Genesis sections under BSB headings; Jonah's voices; ${drawn ? "" : "map closed after "}sendings, churches, Lydia's card; 'The First Day' opened in the Story pane`;
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
