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
      await c.page
        .getByRole("button", { name: /^Psalms$/ })
        .first()
        .click();
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
      const search = c.page.locator('input[type="search"]').first();
      await search.waitFor({ timeout: 10000 });
      await search.fill("World English");
      const row = c.page.locator(".sb-translation-row").first();
      await row.waitFor({ timeout: 15000 });
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
      "?v=16-18 opens with John 3:16–18 selected and the verse toolbar naming them",
    run: async (c) => {
      await c.open(`${CH}?v=16-18`);
      await c.page.locator(".sb-verse-toolbar").waitFor({ timeout: 15000 });
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
          .locator(".sb-reader-toolbar")
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
      await c.page
        .locator('.sb-tabs-sidebar button[aria-label="Close tab"]')
        .last()
        .click();
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
      await c.page.locator(".sb-verse-toolbar-color-button").nth(1).click();
      await c.page
        .locator(".sb-bible-reader-active [data-highlight-fill]")
        .first()
        .waitFor({ timeout: 5000 });
      await c.selectVerse(16);
      await c.page
        .locator(".sb-verse-toolbar-action", { hasText: /clear highlight/i })
        .click();
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
      "Select 3:16 → Note → type → Save → the card lists it; Edit changes it; Delete removes it",
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
      await card.getByRole("button", { name: /^edit$/i }).click();
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
      c.page.once("dialog", (d) => void d.accept());
      await c.page
        .locator(".sb-note-card")
        .first()
        .getByRole("button", { name: /^delete$/i })
        .click();
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
      "Header bookmark and archive icons toggle; Your Content → All chapters lists John 3 under both",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-bookmark-button")
        .click();
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-save-button")
        .click();
      await c.page.waitForTimeout(500);
      await c.pressToolbar("Your content");
      await c.pane().waitFor({ timeout: 5000 });
      await c
        .pane()
        .getByRole("button", { name: /all chapters/i })
        .click()
        .catch(() => undefined);
      await c.waitText(c.pane(), /John 3/);
      const text = await c.paneText();
      if (!/bookmark/i.test(text) || !/save/i.test(text))
        throw new Error(`pane: ${text.slice(0, 160)}`);
      return "John 3 listed under bookmarks and saves";
    },
  },
  {
    id: "M4",
    rows: ["Share a verse / copy link"],
    section: "4. Marking the text",
    title: "Share a verse (copy link)",
    checks: "Select 3:16 → Share copies a link ending in ?v=16",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.page
        .locator(".sb-verse-toolbar-action", { hasText: /share/i })
        .click();
      await c.page.waitForTimeout(500);
      const clip = await c.page
        .evaluate(() => navigator.clipboard.readText())
        .catch(() => "");
      if (!/\/read\/BSB\/JHN\/3\?v=16/.test(clip))
        throw new Error(`clipboard: "${clip.slice(0, 80)}"`);
      return clip;
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
      await c.verse(16).click({ position: { x: 40, y: 8 } });
      await c.settled(c.page.locator(".sb-verse-toolbar"));
      await c.page
        .locator(".sb-verse-toolbar-action", { hasText: "Save" })
        .first()
        .click();
      await c.pressToolbar("Your content");
      await c.waitText(c.pane(), /John 3:15[–-]16/);
      return "John 3:15–16 saved";
    },
  },
  // ── 5. Your Content and search ──────────────────────────────────────────────────────────────────────────
  {
    id: "C1",
    rows: [],
    section: "5. Your Content and search",
    title: "Search verses",
    checks:
      "Your Content → search 'so loved the world' → John 3:16 among the results",
    run: async (c) => {
      await c.open(CH);
      await c.pressToolbar("Your content");
      const input = c
        .pane()
        .locator('input[type="search"], input[placeholder*="earch"]')
        .first();
      await input.fill("so loved the world");
      await c.waitText(c.pane(), /John 3:16/, 20000);
      return "John 3:16 found";
    },
  },
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
    checks: "The Today pane opens and asks for sign-in rather than failing",
    run: async (c) => {
      await c.open(CH);
      await c.pressToolbar("Today");
      await c.pane().waitFor({ timeout: 5000 });
      await c.waitText(c.pane(), /sign in/i, 8000);
      return (await c.paneText()).slice(0, 100);
    },
  },
  // ── 12. Extensions ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: "X1",
    rows: ["Places"],
    section: "12. Extensions",
    title: "Places map",
    checks:
      "On Genesis 12 the Places map pane shows a Leaflet map with at least one place marker",
    run: async (c) => {
      await c.open("/read/BSB/GEN/12");
      await c
        .pressToolbar("Places map")
        .catch(async () => c.pressToolbar("Places"));
      await c.page.locator(".leaflet-container").waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(2000);
      const markers = await c.page
        .locator(".leaflet-marker-icon, .leaflet-interactive")
        .count();
      if (!markers) throw new Error("no markers");
      return `map with ${markers} marker(s)`;
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
      await c.page.locator(".sb-verse-toolbar-color-button").nth(2).click();
      await c.pressToolbar("Account settings");
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
        .locator(".sb-connected-chip-out")
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
      "Signed in: Start a session → share code; a second browser joins as a guest with id and code; the host moves to John 4 and the guest follows",
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
      await c.waitText(c.pane(), /share code/i, 20000);
      const text = await c.paneText();
      const code = /share code\s*([A-Z0-9]{4,8})/i.exec(text)?.[1];
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
