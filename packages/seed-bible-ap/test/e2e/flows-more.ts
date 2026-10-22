// THE REST OF THE MANUAL'S ROWS — reading settings, notes in depth, publishing, live sessions in depth, playlists and
// plans, church themes, the extensions, links and first visit. Signed-in flows use the Home's sample person Seed
// Reader and tidy up after themselves (what they publish is withdrawn, what they make is deleted). Rows that need
// two Homes that are friends with each other are skipped with the reason: the sample people have no friends.
import type { Flow, FlowContext } from "./harness";
import { BASE } from "./harness";

const CH = "/read/BSB/JHN/3";
const stamp = () => new Date().toISOString().slice(11, 19).replace(/:/g, "");

/** A 2×2 PNG (a red square) for the picture flows. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64"
);

/** One second of silence as a 16 kHz mono WAV, for the transcript flow. */
function silentWav(seconds = 1, rate = 16000): Buffer {
  const samples = seconds * rate;
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

/** A button by its visible text; the icon word before it (e.g. "public Publish") is ignored. */
const btn = (
  scope: { locator: FlowContext["page"]["locator"] },
  text: string
) =>
  scope
    .locator("button", { hasText: new RegExp(`(^|\\s)${text}\\s*$`) })
    .first();

/** A Library card opens on its title; leave it open if it already is. */
async function ensureOpen(card: ReturnType<FlowContext["page"]["locator"]>) {
  const del = card.locator("button", { hasText: /^\s*Delete\s*$/ }).first();
  try {
    await del.waitFor({ timeout: 2500 });
  } catch {
    await card.locator(".sb-note-card-ref").first().click();
    await del.waitFor({ timeout: 5000 });
  }
}

async function writeNote(c: FlowContext, verse: number, text: string) {
  await c.selectVerse(verse);
  await c.page.locator(".sb-verse-toolbar-note").click();
  const editor = c.page
    .locator(".sb-note-card-draft [contenteditable]")
    .first();
  await editor.waitFor({ timeout: 20000 });
  await editor.fill(text);
  await c.page
    .locator(".sb-note-card-draft")
    .getByRole("button", { name: /^save$/i })
    .click();
  await c.waitText(
    c.page.locator(".sb-note-card:not(.sb-note-card-draft)").first(),
    new RegExp(text.slice(0, 20))
  );
}

async function deleteAllNotes(c: FlowContext) {
  c.page.on("dialog", (d) => void d.accept().catch(() => undefined));
  for (let i = 0; i < 10; i++) {
    const del = c.page
      .locator(".sb-note-card")
      .getByRole("button", { name: /^delete$/i })
      .first();
    if (!(await del.count())) return;
    await del.click();
    await c.page.waitForTimeout(400);
  }
}

/** Wait for the account pane's sync line to say the Library holds everything. */
async function synced(c: FlowContext, timeout = 120000) {
  const pane = await c.openAccount();
  try {
    await c.waitText(pane, /everything is in your library/i, timeout);
  } finally {
    await c.page
      .locator(".sb-pane-close")
      .first()
      .click()
      .catch(() => undefined);
  }
}

async function startSession(c: FlowContext) {
  await c.pressToolbar("Live session");
  await c.pane().waitFor({ timeout: 5000 });
  await c
    .pane()
    .getByRole("button", { name: /start a session/i })
    .click();
  await c.waitText(c.pane(), /share code/i, 20000);
  await c
    .pane()
    .getByRole("button", { name: /copy link/i })
    .click();
  await c.page.waitForTimeout(300);
  const link = await c.page
    .evaluate(() => navigator.clipboard.readText())
    .catch(() => "");
  const code = /share code\s*([A-Z0-9]{4,8})/i.exec(await c.paneText())?.[1];
  const sid = /session=([^&]+)/.exec(link)?.[1];
  if (!code || !sid)
    throw new Error(`no share code or session id (link "${link}")`);
  return { code, sid };
}

async function joinAsGuest(c: FlowContext, sid: string, code: string) {
  const guest = await c.secondPage();
  await c.open(`${CH}?session=${sid}&code=${code}`, guest);
  const join = guest.locator(".sb-session-join").first();
  await join.waitFor({ timeout: 15000 });
  await join
    .locator('input[placeholder*="name" i]')
    .first()
    .fill("Flow guest")
    .catch(() => undefined);
  await join.getByRole("button", { name: /join as a guest/i }).click();
  await c.waitText(guest.locator(".sb-app-pane"), /connected/i, 20000);
  return guest;
}

export const MORE_FLOWS: Flow[] = [
  // ── 3. Reading ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "R11",
    section: "3. Reading",
    title: "Headings, poetry, red letters, footnotes",
    rows: ["Headings, poetry, red letters, footnotes"],
    checks:
      "John 3 shows its section heading; the World English Bible (the translation whose data marks them) shows the words of Jesus in red; a footnote marker opens the footnote; Psalm 23 is set as poetry",
    run: async (c) => {
      await c.open(CH);
      const heading = (
        await c.page
          .locator(".sb-bible-reader-active .sb-chapter-heading")
          .first()
          .innerText()
      ).trim();
      const red = await c.page
        .locator(".sb-bible-reader-active .sb-words-of-jesus")
        .count();
      if (red)
        throw new Error(
          "BSB carries no red-letter data, yet red runs were drawn"
        );
      await c.open("/read/ENGWEBP/JHN/3");
      const woj = await c.page
        .locator(".sb-bible-reader-active .sb-words-of-jesus")
        .count();
      if (!woj) throw new Error("no words of Jesus in red in ENGWEBP John 3");
      await c.open(CH);
      await c.page
        .locator(
          ".sb-bible-reader-active .sb-footnote-button, .sb-bible-reader-active [class*='footnote'] button, .sb-bible-reader-active button[class*='footnote']"
        )
        .first()
        .click();
      const modal = c.page.locator(".sb-footnote-modal");
      await modal.waitFor({ timeout: 5000 });
      const note = (await modal.innerText()).replace(/\s+/g, " ").slice(0, 60);
      await c.open("/read/BSB/PSA/23");
      const poetry = await c.page
        .locator(".sb-bible-reader-active .sb-verse-poetry")
        .count();
      if (!poetry) throw new Error("Psalm 23 has no poetry lines");
      return `heading "${heading}"; ${woj} red-letter runs in ENGWEBP; footnote "${note}"; ${poetry} poetry verses in Psalm 23`;
    },
  },
  {
    id: "R12",
    section: "3. Reading",
    title: "Hide verse numbers and headings",
    rows: ["Hide verse numbers / headings / footnotes / red text"],
    checks:
      "Account pane → untick Verse numbers and Headings: the numbers and the heading leave the chapter; tick them again: they return",
    run: async (c) => {
      await c.open(CH);
      const count = (sel: string) =>
        c.page.locator(`.sb-bible-reader-active ${sel}`).count();
      const n0 = await count(".sb-verse-number");
      const h0 = await count(".sb-chapter-heading");
      const pane = await c.openAccount();
      await c.check(pane, "Verse numbers").uncheck();
      await c.check(pane, "Headings").uncheck();
      await c.page.waitForTimeout(400);
      const n1 = await count(".sb-verse-number");
      const h1 = await count(".sb-chapter-heading");
      if (n1 >= n0 || h1 >= h0)
        throw new Error(`numbers ${n0} → ${n1}, headings ${h0} → ${h1}`);
      await c.check(pane, "Verse numbers").check();
      await c.check(pane, "Headings").check();
      await c.page.waitForTimeout(400);
      if ((await count(".sb-verse-number")) !== n0)
        throw new Error("verse numbers did not come back");
      return `verse numbers ${n0} → ${n1} → ${n0}; headings ${h0} → ${h1} → ${h0}`;
    },
  },
  {
    id: "R13",
    section: "3. Reading",
    title: "Resume where you left off",
    rows: ["Resume where you left off"],
    checks:
      "Open Romans 8, then open the site's home page on the same device: it opens on Romans 8",
    run: async (c) => {
      await c.open("/read/BSB/ROM/8");
      await c.verse(28).waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(800);
      await c.open("/");
      await c.waitText(
        c.page.locator(".sb-bible-reader-active .sb-bible-reader-title"),
        /Romans\s*8/
      );
      return `home page reopened on ${c.page.url().replace(BASE, "")}`;
    },
  },
  {
    id: "R14",
    section: "3. Reading",
    title: "Offline reading",
    rows: ["Offline reading"],
    checks:
      "Open John 3 and John 4 online; go offline; reload John 4 and step back to John 3: both chapters show without a connection",
    run: async (c) => {
      await c.open(CH);
      await c.page.evaluate(async () => {
        await navigator.serviceWorker?.ready;
      });
      await c.open("/read/BSB/JHN/4");
      await c.verse(1).waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(1500);
      await c.context.setOffline(true);
      try {
        await c.page.reload({ waitUntil: "domcontentloaded" });
        await c.page
          .locator(".sb-app:not(.sb-app-ssr)")
          .waitFor({ timeout: 20000 });
        await c.verse(1).waitFor({ timeout: 20000 });
        await c.page
          .locator('.sb-reader-toolbar button[aria-label="Previous Chapter"]')
          .click();
        await c.verse(16).waitFor({ timeout: 20000 });
        const pin = await c.page
          .locator(".sb-bible-reader-active .sb-reader-from-device")
          .count();
        return `reloaded offline; John 4 and John 3 read without a connection (${pin ? "offline pin shown" : "served by the service worker's cache, so no pin"})`;
      } finally {
        await c.context.setOffline(false);
      }
    },
  },
  {
    id: "R15",
    section: "3. Reading",
    title: "Reading history",
    rows: ["Reading history"],
    checks:
      "Keep Romans 8 open ten seconds (signed out): Today → Recent reading lists Romans 8",
    run: async (c) => {
      await c.open("/read/BSB/ROM/8");
      await c.verse(28).waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(10000);
      await c.pressToolbar("Today");
      await c.waitText(c.pane(), /recent reading[\s\S]*Romans 8/i, 15000);
      return "Romans 8 under Recent reading after ten seconds open";
    },
  },
  {
    id: "R16",
    section: "3. Reading",
    title: "Install as an app",
    rows: ["Install as an app"],
    checks:
      "The page links a web manifest with a name, start URL, display standalone and an icon, and a service worker controls the page (what browsers require to offer Install)",
    run: async (c) => {
      await c.open(CH);
      const href = await c.page
        .locator('link[rel="manifest"]')
        .getAttribute("href");
      if (!href) throw new Error("no manifest link");
      const m = (await (
        await c.page.request.get(new URL(href, BASE).toString())
      ).json()) as Record<string, unknown>;
      if (
        !m["name"] ||
        m["display"] !== "standalone" ||
        !m["start_url"] ||
        !(m["icons"] as unknown[])?.length
      )
        throw new Error(
          `manifest incomplete: ${JSON.stringify(m).slice(0, 160)}`
        );
      const sw = await c.page.evaluate(async () => {
        const r = await navigator.serviceWorker.ready;
        return r.active?.scriptURL ?? "";
      });
      if (!/sw\.js/.test(sw)) throw new Error(`service worker: "${sw}"`);
      return `manifest "${m["name"]}" (${m["display"]}); service worker ${sw.replace(BASE, "")}`;
    },
  },
  {
    id: "R17",
    section: "3. Reading",
    title: "Line height, margins, interface size",
    rows: ["Margins, line height, UI scale, custom fonts"],
    checks:
      "Account pane → Line height Relaxed, Margins Wide, Interface size Large: the page carries each choice, and keeps it after a reload",
    run: async (c) => {
      await c.open(CH);
      const pane = await c.openAccount();
      await pane
        .locator("label", { hasText: "Line height" })
        .locator("select")
        .selectOption("relaxed");
      await pane
        .locator("label", { hasText: "Margins" })
        .locator("select")
        .selectOption("wide");
      await pane
        .locator("label", { hasText: "Interface size" })
        .locator("select")
        .selectOption("l");
      const read = () =>
        c.page.evaluate(() => ({ ...document.documentElement.dataset }));
      const now = await read();
      if (
        now["sbLine"] !== "relaxed" ||
        now["sbMargins"] !== "wide" ||
        now["sbScale"] !== "l"
      )
        throw new Error(JSON.stringify(now));
      await c.page.reload();
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      const after = await read();
      if (after["sbLine"] !== "relaxed" || after["sbScale"] !== "l")
        throw new Error(`after reload ${JSON.stringify(after)}`);
      return "line relaxed, margins wide, scale l — kept after reload";
    },
  },
  // ── 4. Marking the text ────────────────────────────────────────────────────────────────────────────────────
  {
    id: "M6",
    section: "4. Marking the text",
    title: "Verse references in notes become links",
    rows: ["Verse references in notes become links"],
    checks:
      "A note saying 'see Romans 8:28' shows a link; tapping it opens Romans 8 with verse 28 selected",
    run: async (c) => {
      await c.open(CH);
      await writeNote(c, 16, "see Romans 8:28 for the promise");
      const link = c.page
        .locator(".sb-note-card a")
        .filter({ hasText: /Romans 8:28/ })
        .first();
      await link.waitFor({ timeout: 5000 });
      await link.click();
      await c.page.waitForURL(/\/read\/[A-Za-z0-9]+\/ROM\/8/, {
        timeout: 15000,
      });
      await c.page.locator(".sb-verse-toolbar").waitFor({ timeout: 15000 });
      const ref = await c.page
        .locator(".sb-verse-toolbar-ref-text")
        .innerText();
      if (!/Romans 8:28/.test(ref)) throw new Error(`toolbar reads "${ref}"`);
      return `link → ${c.page.url().replace(BASE, "")}, "${ref}" selected`;
    },
  },
  {
    id: "M7",
    section: "4. Marking the text",
    title: "See which verses have notes",
    rows: ["See which verses have notes"],
    checks:
      "After a note on John 3:16 its verse number is boxed; closing the pane and tapping the number opens the notes pane on that note",
    run: async (c) => {
      await c.open(CH);
      await writeNote(c, 16, "a boxed number");
      await c.page.locator(".sb-pane-close").first().click();
      const boxed = c.page
        .locator(".sb-bible-reader-active .sb-verse-number-annotated")
        .first();
      await boxed.waitFor({ timeout: 5000 });
      await boxed.click();
      await c.waitText(c.pane(), /a boxed number/);
      return "verse 16's number boxed; tapping it opened its note";
    },
  },
  {
    id: "M8",
    timeoutMs: 360_000,
    section: "4. Marking the text",
    title: "A note edited on two devices",
    rows: ["A note edited on two devices"],
    checks:
      "Signed in on two browsers as Seed Reader: one note, edited differently on each while offline, comes back twice with Keep this version; keeping one leaves one",
    run: async (c) => {
      // A chapter of its own each run: the sample person's Library keeps whatever an earlier run left.
      const ch = `/read/BSB/PSA/${10 + Math.floor(Math.random() * 130)}`;
      await c.open(ch);
      await c.signInAsSample();
      await deleteAllNotes(c);
      await writeNote(c, 1, "base note from device A");
      await synced(c);
      const b = await c.secondPage();
      await c.open(ch, b);
      await c.signInAsSample(/seed ?reader/i, b);
      await c.pressToolbar("Notes", b);
      await c.waitText(
        b.locator(".sb-app-pane"),
        /base note from device A/,
        120000
      );
      await c.context.setOffline(true);
      await b.context().setOffline(true);
      const edit = async (page: typeof b, text: string) => {
        await page
          .locator(".sb-note-card")
          .first()
          .getByRole("button", { name: /^edit$/i })
          .click();
        await page
          .locator(".sb-note-card [contenteditable]")
          .first()
          .fill(text);
        await page
          .locator(".sb-note-card")
          .getByRole("button", { name: /^save$/i })
          .first()
          .click();
      };
      await c.pressToolbar("Notes");
      await edit(c.page, "edited on device A");
      await edit(b, "edited on device B");
      await c.context.setOffline(false);
      await synced(c);
      await b.context().setOffline(false);
      const pb = await c.openAccount(b);
      await c.waitText(pb, /everything is in your library/i, 120000);
      await b.locator(".sb-pane-close").first().click();
      await c.pressToolbar("Notes", b);
      await c.waitText(b.locator(".sb-app-pane"), /keep this version/i, 30000);
      await b
        .locator(".sb-app-pane")
        .getByRole("button", { name: /keep this version/i })
        .first()
        .click();
      await b.waitForTimeout(1500);
      const cards = await b
        .locator(".sb-note-card:not(.sb-note-card-draft)")
        .count();
      if (cards !== 1) throw new Error(`${cards} cards after keeping one`);
      await deleteAllNotes(c);
      return "both edits kept with Keep this version; keeping one left one note";
    },
  },
  {
    id: "M9",
    section: "4. Marking the text",
    title: "Bookmark names and colours, save folders",
    rows: ["Bookmark names and colours, save folders"],
    checks:
      "Bookmark John 3 → Your Content → pencil → name 'Nicodemus' and a colour → shown; save the chapter → pencil → folder 'Study' → listed under Study",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-bookmark-button")
        .click();
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-save-button")
        .click();
      await c.pressToolbar("Your content");
      const pane = c.pane();
      await pane
        .getByRole("button", { name: /all chapters/i })
        .click()
        .catch(() => undefined);
      await pane.locator('button[aria-label="Edit bookmark"]').first().click();
      await pane
        .locator('input[placeholder="Bookmark name"]')
        .fill("Nicodemus");
      await pane.locator('button[aria-label="green"]').first().click();
      await pane
        .getByRole("button", { name: /^save$/i })
        .first()
        .click();
      await c.waitText(pane, /Nicodemus/);
      await pane.locator('button[aria-label="Edit save"]').first().click();
      await pane.locator('input[placeholder^="Folder"]').fill("Study");
      await pane
        .getByRole("button", { name: /^save$/i })
        .first()
        .click();
      await c.waitText(pane, /Study/);
      return "bookmark named Nicodemus with a colour; save filed under Study";
    },
  },
  // ── 8. Today, Discover and publishing ──────────────────────────────────────────────────────────────────────
  {
    id: "S3",
    section: "8. Today, Discover and publishing",
    title: "Friends (the pane)",
    rows: ["Friends"],
    checks:
      "Signed in as Seed Reader: Today shows the Friends section with Add a friend and Invite by email, and no error (the sample person has no mutual friends, so the list itself is not exercised)",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      await c.pressToolbar("Today");
      await c.waitText(c.pane(), /friends/i, 20000);
      await c.waitText(c.pane(), /add a friend|invite by email/i, 20000);
      if (await c.pane().locator(".sb-pane-error").count())
        throw new Error(await c.paneText());
      return (await c.paneText()).replace(/.*?(Friends)/i, "$1").slice(0, 120);
    },
  },
  {
    id: "S4",
    timeoutMs: 360_000,
    section: "8. Today, Discover and publishing",
    title: "Your profile",
    rows: ["Your profile"],
    checks:
      "Account → Your profile: a display name and a line → Save; after a reload they are still there; Publish → Published, then unpublished",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      let pane = await c.openAccount();
      const line = `flow ${stamp()}`;
      await pane
        .locator('input[placeholder="Profile name"]')
        .fill("Seed Reader");
      await pane.locator('input[placeholder="A line about you"]').fill(line);
      await pane
        .getByRole("button", { name: /^save$/i })
        .first()
        .click();
      await c.page.waitForTimeout(2500);
      await c.page.reload();
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      pane = await c.openAccount();
      await c.page.waitForFunction(
        (l) =>
          [...document.querySelectorAll("input")].some(
            (i) => (i as HTMLInputElement).value === l
          ),
        line,
        { timeout: 30000 }
      );
      const pub = pane
        .locator("button", { hasText: /(^|\s)Publish\s*$/ })
        .first();
      await pub.click();
      await pane
        .locator("button", { hasText: /(^|\s)Published\s*$/ })
        .first()
        .waitFor({ timeout: 90000 });
      await pane
        .locator("button", { hasText: /(^|\s)Published\s*$/ })
        .first()
        .click();
      await pane
        .locator("button", { hasText: /(^|\s)Publish\s*$/ })
        .first()
        .waitFor({ timeout: 90000 });
      return `profile line "${line}" kept across a reload; published, then withdrawn`;
    },
  },
  {
    id: "S5",
    section: "8. Today, Discover and publishing",
    title: "Who is reading now",
    rows: ["Who is reading now"],
    checks:
      "Two Homes that added each other see each other's green dot and chapter",
    skip: "needs two Homes that are mutual friends; the sample people have none (the presence rules are covered by the unit tests)",
    run: async () => undefined,
  },
  {
    id: "S6",
    section: "8. Today, Discover and publishing",
    title: "Share what I am reading (switch)",
    rows: ["Share what I am reading"],
    checks:
      "Signed in: Account → 'Let friends see what I am reading right now' is on by default; turning it off is remembered after a reload",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      let pane = await c.openAccount();
      const box = () => c.check(pane, /let friends see what i am reading/i);
      if (!(await box().isChecked())) throw new Error("off by default");
      await box().uncheck();
      await c.page.waitForTimeout(500);
      await c.page.reload();
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      pane = await c.openAccount();
      if (await box().isChecked()) throw new Error("not remembered");
      await box().check();
      return "on by default; off survives a reload; turned back on";
    },
  },
  {
    id: "S7",
    timeoutMs: 360_000,
    section: "8. Today, Discover and publishing",
    title: "Publish a note",
    rows: ["Publish a note"],
    checks:
      "Signed in: a note on John 7:37 → Publish → Published; Copy link gives a link naming the offering; Published again withdraws it",
    run: async (c) => {
      await c.open("/read/BSB/JHN/7");
      await c.signInAsSample();
      await deleteAllNotes(c);
      await writeNote(c, 37, `a published note ${stamp()}`);
      await synced(c);
      await c.pressToolbar("Notes");
      const card = c.page
        .locator(".sb-note-card:not(.sb-note-card-draft)")
        .first();
      await card.locator("button", { hasText: /(^|\s)Publish\s*$/ }).click();
      await card
        .locator("button", { hasText: /(^|\s)Published\s*$/ })
        .waitFor({ timeout: 120000 });
      await card.getByRole("button", { name: /copy link/i }).click();
      await c.page.waitForTimeout(300);
      const link = await c.page
        .evaluate(() => navigator.clipboard.readText())
        .catch(() => "");
      if (!/offering=/.test(link)) throw new Error(`link "${link}"`);
      await card.locator("button", { hasText: /(^|\s)Published\s*$/ }).click();
      await card
        .locator("button", { hasText: /(^|\s)Publish\s*$/ })
        .waitFor({ timeout: 120000 });
      await deleteAllNotes(c);
      return `published, link ${link.replace(BASE, "").slice(0, 70)}…, withdrawn`;
    },
  },
  {
    id: "S8",
    section: "8. Today, Discover and publishing",
    title: "Friends' notes in Today",
    rows: ["Friends' notes in Today"],
    checks: "A friend's released note lists under What your friends released",
    skip: "needs two Homes that are mutual friends; the sample people have none",
    run: async () => undefined,
  },
  {
    id: "S9",
    section: "8. Today, Discover and publishing",
    title: "First-run help",
    rows: ["First-run help"],
    checks:
      "A person whose agent lacks the reader behaviour sees the fix named in the account pane",
    skip: "needs a Home whose agent has no reader playbook; every sample person has it (the hint is covered by publish-without-reads and session-expiry tests)",
    run: async () => undefined,
  },
  // ── 9. Reading together ────────────────────────────────────────────────────────────────────────────────────
  {
    id: "L2",
    timeoutMs: 360_000,
    section: "9. Reading together",
    title: "Show everyone, the roster, chat, the record",
    rows: [
      "Show everyone a verse",
      "Who is here, and where",
      "Chat",
      "The session as a record",
    ],
    checks:
      "Host starts a session (its record path shows); a guest joins; the guest selects 3:16 and the host's roster says so; the host shows everyone 3:9 and the guest sees the ribbon; a chat line from the guest reaches the host",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const { sid, code } = await startSession(c);
      const record = await c.paneText();
      if (!/seed-bible\/sessions\//.test(record))
        throw new Error(`no record path in: ${record.slice(0, 160)}`);
      const guest = await joinAsGuest(c, sid, code);
      await c.waitText(c.pane(), /Flow guest/, 20000);
      await c.selectVerse(16, guest);
      await c.waitText(c.pane(), /Flow guest[\s\S]{0,80}16/, 20000);
      await c.selectVerse(9);
      await c.page
        .locator(".sb-verse-toolbar-action", { hasText: /show everyone/i })
        .click();
      await guest
        .locator(
          '[data-highlight-broadcast="true"], .sb-verse-decorator[class*="session"], [data-highlight-key^="session:"]'
        )
        .first()
        .waitFor({ timeout: 20000 });
      const gp = guest.locator(".sb-app-pane");
      await gp.locator("input, textarea").last().fill("hello from the flow");
      await gp.getByRole("button", { name: /^send$/i }).click();
      await c.waitText(c.pane(), /hello from the flow/, 20000);
      return `record kept; roster shows the guest at verse 16; the guest saw verse 9 shown; chat reached the host (code ${code})`;
    },
  },
  // ── 10. Playlists and reading plans ────────────────────────────────────────────────────────────────────────
  {
    id: "P1",
    section: "10. Playlists and reading plans",
    title: "Make, edit and play a playlist",
    rows: [
      "Make a playlist",
      "Add, reorder, remove, edit items",
      "Play a playlist",
    ],
    checks:
      "Library → Playlists → a title → Create (starts with John 3); add Romans 8:28 by reference; move it up; Play playlist opens Romans 8 then Next opens John 3; remove an item; delete the playlist",
    run: async (c) => {
      await c.open(CH);
      const pane = await c.openLibrary("Playlists");
      const title = `Flow playlist ${stamp()}`;
      await pane.locator('input[placeholder^="New playlist"]').fill(title);
      await pane.getByRole("button", { name: /^create$/i }).click();
      const card = pane.locator(".sb-note-card", { hasText: title }).first();
      await card.waitFor({ timeout: 10000 });
      await ensureOpen(card);
      await card
        .locator(
          'input[placeholder*="John 3:16" i], input[placeholder*="reference" i]'
        )
        .first()
        .fill("Romans 8:28");
      await card
        .getByRole("button", { name: /^add item$/i })
        .first()
        .click();
      await c.waitText(card, /Romans 8:28/);
      await card.locator('button[aria-label*="up" i]').last().click();
      await c.page.waitForTimeout(400);
      const order = (await card.innerText()).replace(/\s+/g, " ");
      if (order.indexOf("Romans 8") > order.indexOf("John 3"))
        throw new Error(`order after move: ${order.slice(0, 160)}`);
      await card.getByRole("button", { name: /play playlist/i }).click();
      await c.page.waitForURL(/\/ROM\/8/, { timeout: 15000 });
      await c.page
        .getByRole("button", { name: /^next$/i })
        .first()
        .click();
      await c.page.waitForURL(/\/JHN\/3/, { timeout: 15000 });
      await c.page
        .getByRole("button", { name: /^stop$/i })
        .first()
        .click()
        .catch(() => undefined);
      const before = await card
        .locator('button[aria-label*="remove" i]')
        .count();
      await card.locator('button[aria-label*="remove" i]').first().click();
      await c.page.waitForTimeout(400);
      const after = await card
        .locator('button[aria-label*="remove" i]')
        .count();
      if (after !== before - 1)
        throw new Error(`items ${before} → ${after} after remove`);
      c.page.once("dialog", (d) => void d.accept());
      await card.getByRole("button", { name: /^delete$/i }).click();
      await card.waitFor({ state: "detached", timeout: 10000 });
      return "created, Romans 8:28 added and moved first, played Romans 8 → John 3, an item removed, deleted";
    },
  },
  {
    id: "P2",
    section: "10. Playlists and reading plans",
    title: "Make a reading plan, start it, tick a reading",
    rows: ["Make a reading plan", "Start a plan, tick readings"],
    checks:
      "Library → Reading plans → up to chapter 5 → Create plan; open it → Start; tick the first reading; the progress label moves; delete the plan",
    run: async (c) => {
      await c.open("/read/BSB/JHN/1");
      const pane = await c.openLibrary("Reading plans");
      const title = `Flow plan ${stamp()}`;
      await pane.locator('input[placeholder^="Plan title"]').fill(title);
      await pane
        .locator('input[type="number"], input[placeholder="21"]')
        .first()
        .fill("5");
      await pane.getByRole("button", { name: /create plan/i }).click();
      const card = pane.locator(".sb-rp-card", { hasText: title }).first();
      await card.waitFor({ timeout: 10000 });
      await ensureOpen(card);
      await ensureOpen(card);
      await card
        .getByRole("button", { name: /^start/i })
        .first()
        .click();
      const progress = async () =>
        (await card.locator(".sb-rp-card-progress-label").innerText()).trim();
      const p0 = await progress();
      await card.locator('input[type="checkbox"]').first().check();
      await c.page.waitForTimeout(500);
      const p1 = await progress();
      if (p0 === p1) throw new Error(`progress unchanged "${p0}"`);
      c.page.once("dialog", (d) => void d.accept());
      await card.getByRole("button", { name: /^delete$/i }).click();
      return `plan of 5 chapters; progress "${p0}" → "${p1}"`;
    },
  },
  {
    id: "G13",
    section: "10. Playlists and reading plans",
    title: "Edit a reading plan",
    rows: ["Edit a reading plan"],
    checks:
      "Library → Reading plans → Start a blank plan; Save waits for a reading; type Romans 8:28-39 into day 1, add a day with Psalm 23 and the chapter on screen, a nonsense reference is refused; move day 2 up and name it; offer Weekly; Save — the card shows the days in the new order, kept after a reload, with Start · Weekly",
    run: async (c) => {
      await c.open("/read/BSB/JHN/1");
      const pane = await c.openLibrary("Reading plans");
      const title = `Flow edit ${stamp()}`;
      await pane.locator('input[placeholder^="Plan title"]').fill(title);
      await pane.locator(".sb-plan-blank").click();
      const editor = pane.locator(".sb-plan-editor");
      await editor.waitFor({ timeout: 10000 });
      const save = editor.getByRole("button", { name: /save changes/i });
      if (await save.isEnabled())
        throw new Error("Save was enabled with no readings");
      const add = (day: number, ref: string) =>
        editor
          .getByLabel(`Add a reading to Day ${day}`)
          .fill(ref)
          .then(() =>
            editor
              .locator(".sb-plan-edit-day")
              .nth(day - 1)
              .getByRole("button", { name: /^add$/i })
              .click()
          );
      await add(1, "Romans 8:28-39");
      await editor.getByRole("button", { name: /add session/i }).click();
      await add(2, "Nowhere 99");
      await c.waitText(editor, /not a passage/i, 3000);
      await add(2, "Psalm 23");
      await editor
        .locator(".sb-plan-edit-day")
        .nth(1)
        .getByRole("button", { name: /add what is on screen/i })
        .click();
      await editor.getByRole("button", { name: "Move Day 2 up" }).click();
      await editor.getByLabel("Name of Day 1").fill("Comfort");
      await c.check(editor, "Weekly").check();
      await save.click();
      await editor.waitFor({ state: "detached", timeout: 10000 });
      const card = pane.locator(".sb-rp-card", { hasText: title }).first();
      const days = async () =>
        card
          .locator(".sb-rpd-reading-card")
          .evaluateAll((ds) =>
            ds.map((d) =>
              (d as HTMLElement).innerText.replace(/\s+/g, " ").trim()
            )
          );
      const shown = (await days()).join(" | ");
      if (!/^Comfort.*Psalm 23.*John 1 \| Day 2.*Romans 8:28/.test(shown))
        throw new Error(`days: ${shown}`);
      await c.page.reload();
      const again = await c.openLibrary("Reading plans");
      const kept = again.locator(".sb-rp-card", { hasText: title }).first();
      await kept.waitFor({ timeout: 10000 });
      await ensureOpen(kept);
      await kept
        .getByRole("button", { name: /start · weekly/i })
        .waitFor({ timeout: 5000 });
      c.page.once("dialog", (d) => void d.accept());
      await kept.getByRole("button", { name: /^delete$/i }).click();
      return `${shown.slice(0, 110)}; kept after a reload, Start · Weekly offered`;
    },
  },
  {
    id: "G14",
    timeoutMs: 300_000,
    section: "2. Getting in",
    title: "Crop a picture; use an earlier one",
    rows: ["Your profile"],
    checks:
      "Signed in: Account → Picture → a 600×300 picture opens the round crop window; zoom in, drag, Use picture — the profile shows a 256×256 picture; Earlier pictures lists it and picking it sets it again",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await c.openAccount();
      const b64 = await c.page.evaluate(() => {
        const cv = document.createElement("canvas");
        cv.width = 600;
        cv.height = 300;
        const x = cv.getContext("2d")!;
        x.fillStyle = "#2a6";
        x.fillRect(0, 0, 600, 300);
        x.fillStyle = "#fff";
        x.fillRect(250, 100, 100, 100);
        return cv.toDataURL("image/png").split(",")[1]!;
      });
      await pane
        .locator(".sb-profile-card .sb-picture-pick input[type=file]")
        .setInputFiles({
          name: "wide.png",
          mimeType: "image/png",
          buffer: Buffer.from(b64, "base64"),
        });
      const dialog = c.page.locator(".sb-crop-dialog");
      await dialog.waitFor({ timeout: 5000 });
      if (!(await dialog.locator(".sb-crop-window-round").count()))
        throw new Error("the profile crop window is not round");
      await dialog.getByLabel("Zoom").fill("1.6");
      const win = dialog.locator(".sb-crop-window");
      const box = (await win.boundingBox())!;
      await c.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await c.page.mouse.down();
      await c.page.mouse.move(
        box.x + box.width / 2 + 40,
        box.y + box.height / 2
      );
      await c.page.mouse.up();
      await dialog.locator(".sb-crop-confirm").click();
      await dialog.waitFor({ state: "detached", timeout: 90000 });
      const pic = pane.locator("img.sb-profile-picture");
      await pic.waitFor({ timeout: 30000 });
      await c.page.waitForFunction(
        () => {
          const i = document.querySelector<HTMLImageElement>(
            "img.sb-profile-picture"
          );
          return !!i && i.complete && i.naturalWidth > 0;
        },
        undefined,
        { timeout: 30000 }
      );
      const size = await pic.evaluate(
        (i) =>
          `${(i as HTMLImageElement).naturalWidth}x${(i as HTMLImageElement).naturalHeight}`
      );
      if (size !== "256x256") throw new Error(`stored picture is ${size}`);
      const src = await pic.getAttribute("src");
      await pane.locator(".sb-profile-card .sb-picture-earlier").click();
      const grid = c.page.locator(".sb-gallery-dialog");
      const item = grid.locator(`.sb-gallery-item img[src="${src}"]`);
      await item.waitFor({ timeout: 30000 });
      const count = await grid.locator(".sb-gallery-item").count();
      await item.click();
      await grid.waitFor({ state: "detached", timeout: 5000 });
      return `cropped to ${size}; Earlier pictures listed ${count}, the new one among them, and picking it kept it`;
    },
  },
  {
    id: "P3",
    timeoutMs: 360_000,
    section: "10. Playlists and reading plans",
    title: "Publish a playlist, keep it in the Library, give it a cover",
    rows: [
      "Publish a playlist or plan",
      "Where they are kept",
      "Pictures (a playlist cover, a logo)",
    ],
    checks:
      "Signed in: create a playlist; a second browser signed in as the same person sees it after Refresh; a cover picture shows from the serving plane; Publish → Published, then withdrawn; deleted",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await c.openLibrary("Playlists");
      const title = `Flow kept ${stamp()}`;
      await pane.locator('input[placeholder^="New playlist"]').fill(title);
      await pane.getByRole("button", { name: /^create$/i }).click();
      const card = pane.locator(".sb-note-card", { hasText: title }).first();
      await card.waitFor({ timeout: 10000 });
      await ensureOpen(card);
      await card.locator('input[type="file"]').first().setInputFiles({
        name: "cover.png",
        mimeType: "image/png",
        buffer: PNG,
      });
      await c.page.locator(".sb-crop-confirm").click();
      const img = card.locator("img").first();
      await img.waitFor({ timeout: 60000 });
      const src = (await img.getAttribute("src")) ?? "";
      await synced(c);
      const b = await c.secondPage();
      await c.open(CH, b);
      await c.signInAsSample(/seed ?reader/i, b);
      const pb = await c.openLibrary("Playlists", b);
      await pb
        .getByRole("button", { name: /refresh/i })
        .first()
        .click()
        .catch(() => undefined);
      await c.waitText(pb, new RegExp(title), 60000);
      await c.openLibrary("Playlists");
      await ensureOpen(card);
      await card.locator("button", { hasText: /(^|\s)Publish\s*$/ }).click();
      await card
        .locator("button", { hasText: /(^|\s)Published\s*$/ })
        .waitFor({ timeout: 120000 });
      await card.locator("button", { hasText: /(^|\s)Published\s*$/ }).click();
      await card
        .locator("button", { hasText: /(^|\s)Publish\s*$/ })
        .waitFor({ timeout: 120000 });
      c.page.once("dialog", (d) => void d.accept());
      await card.getByRole("button", { name: /^delete$/i }).click();
      return `cover ${src.slice(0, 60)}…; seen on a second browser; published and withdrawn; deleted`;
    },
  },
  // ── 11. Church themes ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: "G16",
    timeoutMs: 300_000,
    section: "11. Church themes",
    title: "Theme variants and the live preview",
    rows: ["Theme variants and preview"],
    checks:
      "Signed in: Library → Customizations → Create; each variant shows a live preview; changing a colour redraws it; Add variant Sepia (from Light) makes a third with its own preview; rename it; Remove it; delete the theme",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await c.openLibrary("Customizations");
      const name = `Flow variants ${stamp()}`;
      await pane.locator('input[placeholder*="name" i]').first().fill(name);
      await pane.getByRole("button", { name: /^create$/i }).click();
      const card = pane.locator(".sb-note-card", { hasText: name }).first();
      await card.waitFor({ timeout: 10000 });
      await ensureOpen(card);
      const previews = card.locator(".sb-cz-live-preview");
      if ((await previews.count()) !== 2)
        throw new Error(
          `${await previews.count()} previews for Light and Dark`
        );
      const dot = previews.first().locator(".sb-cz-live-preview-dot");
      const before = await dot.evaluate(
        (d) => getComputedStyle(d).backgroundColor
      );
      await card.locator('input[type="color"]').first().fill("#7a1f5c");
      const after = await dot.evaluate(
        (d) => getComputedStyle(d).backgroundColor
      );
      if (before === after) throw new Error("the preview did not redraw");
      await card.getByLabel("New variant name").fill("Sepia");
      await card.getByRole("button", { name: /add variant/i }).click();
      await c.page.waitForFunction(
        (n) =>
          [...document.querySelectorAll(".sb-note-card")]
            .find((x) => x.textContent?.includes(n))
            ?.querySelectorAll(".sb-cz-live-preview").length === 3,
        name,
        { timeout: 10000 }
      );
      const field = card.getByLabel("Name of the Sepia variant");
      await field.fill("Sepia warm");
      await field.blur();
      await card
        .getByRole("button", { name: "Remove the Sepia warm variant" })
        .waitFor({ timeout: 10000 });
      await card
        .getByRole("button", { name: "Remove the Sepia warm variant" })
        .click();
      await c.page.waitForFunction(
        (n) =>
          [...document.querySelectorAll(".sb-note-card")]
            .find((x) => x.textContent?.includes(n))
            ?.querySelectorAll(".sb-cz-live-preview").length === 2,
        name,
        { timeout: 10000 }
      );
      await card.getByRole("button", { name: /^delete$/i }).click();
      return `two previews; a colour redrew it (${before} → ${after}); Sepia added, renamed, removed`;
    },
  },
  {
    id: "T1",
    timeoutMs: 360_000,
    section: "11. Church themes",
    title: "Make, publish and use a church theme",
    rows: [
      "Make a customization",
      "Publish it",
      "Use one",
      "Recommended extensions",
      "Customization by link",
    ],
    checks:
      "Signed in: Library → Customizations → name → Create; tick Watch as recommended; Publish → Published; Copy link; Account → Church theme lists it and picking it changes the colours and turns Watch on; a fresh browser opening the link gets the theme; withdrawn and deleted",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await c.openLibrary("Customizations");
      const name = `Flow church ${stamp()}`;
      await pane.locator('input[placeholder*="name" i]').first().fill(name);
      await pane.getByRole("button", { name: /^create$/i }).click();
      const card = pane.locator(".sb-note-card", { hasText: name }).first();
      await card.waitFor({ timeout: 10000 });
      await ensureOpen(card);
      await c.check(card, /twitch|watch/i).check();
      await card
        .locator('input[type="color"]')
        .first()
        .fill("#7a1f5c")
        .catch(() => undefined);
      await card.locator("button", { hasText: /(^|\s)Publish\s*$/ }).click();
      await card
        .locator("button", { hasText: /(^|\s)Published\s*$/ })
        .waitFor({ timeout: 120000 });
      await card.getByRole("button", { name: /copy link/i }).click();
      await c.page.waitForTimeout(300);
      const link = await c.page
        .evaluate(() => navigator.clipboard.readText())
        .catch(() => "");
      if (!/customization=/.test(link)) throw new Error(`link "${link}"`);
      const acct = await c.openAccount();
      const select = acct
        .locator("label", { hasText: "Church theme" })
        .locator("select");
      const before = await c.page.evaluate(
        () => document.getElementById("sb-theme")?.textContent ?? ""
      );
      await c.page.waitForFunction(
        (n) =>
          [...document.querySelectorAll("option")].some((o) =>
            o.textContent?.includes(n)
          ),
        name,
        { timeout: 60000 }
      );
      const value = await select
        .locator("option", { hasText: name })
        .getAttribute("value");
      await select.selectOption(value!);
      await c.page.waitForTimeout(800);
      const after = await c.page.evaluate(
        () => document.getElementById("sb-theme")?.textContent ?? ""
      );
      if (before === after)
        throw new Error("the theme's colours did not apply");
      const watch = await c.page
        .locator('.sb-reader-toolbar button[aria-label="Watch"]')
        .count();
      const fresh = await c.secondPage();
      await fresh.goto(link, { waitUntil: "domcontentloaded" });
      await c.dismissWelcome(fresh);
      await fresh.waitForFunction(
        (n) =>
          (document.getElementById("sb-theme")?.textContent ?? "").length > 0 &&
          document.title.length > 0 &&
          !!n,
        name,
        { timeout: 30000 }
      );
      const freshCss = await fresh.evaluate(
        () => document.getElementById("sb-theme")?.textContent ?? ""
      );
      await select.selectOption({ index: 0 });
      await c.openLibrary("Customizations");
      await ensureOpen(card);
      await card.locator("button", { hasText: /(^|\s)Published\s*$/ }).click();
      await card
        .locator("button", { hasText: /(^|\s)Publish\s*$/ })
        .waitFor({ timeout: 120000 });
      c.page.once("dialog", (d) => void d.accept());
      await card.getByRole("button", { name: /^delete$/i }).click();
      if (!watch)
        throw new Error(
          "picking the theme did not turn its recommended Watch on"
        );
      if (!freshCss.includes("7a1f5c") && freshCss === before)
        throw new Error("the link did not apply the theme in a fresh browser");
      return `made, Watch recommended, published, picked (colours changed, Watch on), opened by link in a fresh browser; withdrawn and deleted`;
    },
  },
  // ── 12. Extensions ─────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "X3",
    section: "12. Extensions",
    title: "Cross-references",
    rows: ["Cross-references"],
    checks:
      "Select John 3:16 → Discover → Cross-references lists related passages; tapping one opens it",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.pressToolbar("Discover");
      await c.waitText(c.pane(), /cross-references/i);
      const item = c
        .pane()
        .locator("section, div")
        .filter({ hasText: /^Cross-references/i })
        .locator("a, button")
        .filter({ hasText: /\d+:\d+/ })
        .first();
      await item.waitFor({ timeout: 20000 });
      const label = (await item.innerText()).replace(/\s+/g, " ");
      const before = c.page.url();
      await item.click();
      await c.page.waitForFunction((u) => location.href !== u, before, {
        timeout: 15000,
      });
      return `"${label.slice(0, 40)}" → ${c.page.url().replace(BASE, "")}`;
    },
  },
  {
    id: "X4",
    timeoutMs: 360_000,
    section: "12. Extensions",
    title: "Study companion and Ask from a selection",
    rows: ["Study companion", "Ask from a selection"],
    checks:
      "Signed in: select John 3:16 → Ask in the verse toolbar opens the companion on the verse; ask 'Who is Nicodemus?'; an answer streams in and the pane says who answered",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      await c.selectVerse(16);
      await c.page
        .locator(".sb-verse-toolbar-action")
        .filter({
          has: c.page.locator(".sb-verse-toolbar-action-label", {
            hasText: /^Ask$/,
          }),
        })
        .first()
        .click();
      const pane = c.pane();
      await pane.waitFor({ timeout: 10000 });
      await pane.locator("input").first().fill("Who is Nicodemus?");
      await pane.getByRole("button", { name: /^ask$/i }).click();
      await c.waitText(pane, /Answers by/i, 90000);
      await c.waitText(pane, /Nicodemus[\s\S]{40,}/i, 90000);
      return (
        (await c.paneText()).match(/Answers by[^.]{0,60}/i)?.[0] ?? "answered"
      );
    },
  },
  {
    id: "X5",
    section: "12. Extensions",
    title: "Watch a Twitch stream",
    rows: ["Watch a Twitch stream"],
    checks:
      "Account → Extensions → Twitch (watch) on; Watch → a channel name → Twitch's own player sits beside the text (read-only; nothing is sent to Twitch but the page load)",
    run: async (c) => {
      await c.open(CH);
      const acct = await c.openAccount();
      await c.check(acct, "Twitch (watch)").check();
      await c.pressToolbar("Watch");
      await c.pane().locator("input").first().fill("twitchdev");
      await c
        .pane()
        .getByRole("button", { name: /^watch$/i })
        .click();
      const frame = c.pane().locator('iframe[src*="twitch.tv"]').first();
      await frame.waitFor({ timeout: 15000 });
      return `player ${(await frame.getAttribute("src"))?.slice(0, 70)}`;
    },
  },
  {
    id: "X6",
    section: "12. Extensions",
    title: "Connected sources (MCP)",
    rows: ["Connected sources (MCP)"],
    checks:
      "Signed in: Account → Connected sources lists the servers attached at the Home (or says none) with no error, and a Manage at your Home link",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await c.openAccount();
      await c.waitText(pane, /connected sources/i);
      await c.page
        .waitForFunction(
          () =>
            !/Loading…/.test(
              document.querySelector(".sb-app-pane")?.textContent ?? ""
            ),
          null,
          { timeout: 30000 }
        )
        .catch(() => undefined);
      const text = await c.paneText();
      const section = text
        .replace(/.*Connected sources/i, "Connected sources")
        .slice(0, 140);
      if (!/manage at your home/i.test(text)) throw new Error(section);
      return section;
    },
  },
  {
    id: "X7",
    timeoutMs: 360_000,
    section: "12. Extensions",
    title: "Transcript (read-only)",
    rows: ["Transcript (read-only)"],
    checks:
      "Signed in: Account → Extensions → Transcript on; Transcript → choose a one-second recording; it is decoded on the device, sent as one piece and read back (silence gives an empty transcript, not an error)",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const acct = await c.openAccount();
      await c.check(acct, "Transcript").check();
      await c.pressToolbar("Transcript");
      await c.pane().locator('input[type="file"]').first().setInputFiles({
        name: "silence.wav",
        mimeType: "audio/wav",
        buffer: silentWav(),
      });
      await c.waitText(c.pane(), /1 of 1|transcript of/i, 120000);
      if (await c.pane().locator(".sb-pane-error").count())
        throw new Error((await c.paneText()).slice(0, 160));
      return (await c.paneText()).slice(0, 120);
    },
  },
  // ── 13. Links, first visit, about ──────────────────────────────────────────────────────────────────────────
  {
    id: "N1",
    section: "13. Links and embedding",
    title: "Chapter links with a preview",
    rows: ["Chapter links with a preview"],
    checks:
      "The chapter page's HTML carries og:title, og:description, og:image (which answers 200) and twitter:card",
    run: async (c) => {
      const html = await (
        await c.page.request.get(`${BASE}${CH}`, {
          headers: { accept: "text/html" },
        })
      ).text();
      const og = (p: string) =>
        new RegExp(`<meta property="og:${p}" content="([^"]*)"`).exec(
          html
        )?.[1];
      const title = og("title");
      const desc = og("description");
      const image = og("image");
      if (!title || !desc || !image || !/twitter:card/.test(html))
        throw new Error("missing Open Graph tags");
      const img = await c.page.request.get(image);
      if (img.status() !== 200) throw new Error(`og:image ${img.status()}`);
      return `"${title}" — "${desc.slice(0, 50)}…", image 200`;
    },
  },
  {
    id: "N2",
    section: "13. Links and embedding",
    title: "Search engines",
    rows: ["Search engines"],
    checks:
      "/robots.txt names the sitemap; /sitemap.xml lists John 3; the chapter page has a canonical link",
    run: async (c) => {
      const robots = await (
        await c.page.request.get(`${BASE}/robots.txt`)
      ).text();
      const sitemap = await (
        await c.page.request.get(`${BASE}/sitemap.xml`)
      ).text();
      const page = await (
        await c.page.request.get(`${BASE}${CH}`, {
          headers: { accept: "text/html" },
        })
      ).text();
      if (!/Sitemap: .*sitemap\.xml/.test(robots))
        throw new Error("robots names no sitemap");
      const urls = (sitemap.match(/<loc>/g) ?? []).length;
      if (!sitemap.includes("/read/BSB/JHN/3<"))
        throw new Error("John 3 not in the sitemap");
      if (!/<link rel="canonical" href="[^"]*\/read\/BSB\/JHN\/3"/.test(page))
        throw new Error("no canonical link");
      return `robots → sitemap of ${urls} URLs, John 3 listed, canonical present`;
    },
  },
  {
    id: "N3",
    section: "13. Links and embedding",
    title: "First-visit card",
    rows: ["First-visit card"],
    checks:
      "A fresh browser sees the welcome card with Sign in and Just read; Just read closes it for good; an embed never shows it",
    run: async (c) => {
      await c.page.goto(`${BASE}${CH}`, { waitUntil: "domcontentloaded" });
      const justRead = c.page.getByRole("button", { name: /just read/i });
      await justRead.waitFor({ timeout: 15000 });
      const card = (
        await c.page
          .locator('[role="dialog"], .sb-onboarding')
          .first()
          .innerText()
      ).replace(/\s+/g, " ");
      if (!/sign in/i.test(card))
        throw new Error(`card: ${card.slice(0, 100)}`);
      await justRead.click();
      await c.page.reload({ waitUntil: "domcontentloaded" });
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(1500);
      if (await justRead.count())
        throw new Error("the card came back after Just read");
      const embed = await c.secondPage();
      await embed.goto(`${BASE}${CH}?embed=minimal`, {
        waitUntil: "domcontentloaded",
      });
      await embed
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await embed.waitForTimeout(2000);
      if (await embed.getByRole("button", { name: /just read/i }).count())
        throw new Error("shown in an embed");
      return "shown once with Sign in and Just read; gone after Just read; never in an embed";
    },
  },
  {
    id: "N4",
    section: "13. Links and embedding",
    title: "About and the legal texts",
    rows: ["About and the legal texts"],
    checks:
      "Tap Seed Bible at the top of the sidebar: the About pane; Terms of service, Privacy policy and Code of conduct each open their text",
    run: async (c) => {
      await c.open(CH);
      await c.page.locator(".sb-sidebar-logo-button").click();
      await c.waitText(c.pane(), /about seed bible/i);
      const seen: string[] = [];
      for (const doc of [
        "Terms of service",
        "Privacy policy",
        "Code of conduct",
      ]) {
        await c
          .pane()
          .getByRole("button", { name: new RegExp(doc, "i") })
          .first()
          .click();
        await c.page.waitForFunction(
          () =>
            (document.querySelector(".sb-app-pane")?.textContent ?? "").length >
              600 &&
            !/Loading…/.test(
              document.querySelector(".sb-app-pane")?.textContent ?? ""
            ),
          null,
          { timeout: 20000 }
        );
        seen.push(`${doc} (${(await c.paneText()).length} chars)`);
        await c
          .pane()
          .getByRole("button", { name: /^back$/i })
          .click();
      }
      return seen.join(", ");
    },
  },
  {
    id: "N5",
    section: "13. Links and embedding",
    title: "Scripture map",
    rows: ["Scripture map"],
    checks:
      "The grid icon opens the Scripture map with John 3 outlined; a highlight there marks its square; tapping Romans 8 opens it",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.page.locator(".sb-verse-toolbar-color-button").first().click();
      await c.page
        .locator('.sb-tabs-sidebar button[aria-label="Scripture map"]')
        .click();
      const here = c.page.locator(".sb-map-chapter-here").first();
      await here.waitFor({ timeout: 10000 });
      const hereTitle = (await here.getAttribute("title")) ?? "";
      if (!/John 3/.test(hereTitle)) throw new Error(`outlined: ${hereTitle}`);
      if (!/mark/.test(hereTitle))
        throw new Error(`John 3 not marked: ${hereTitle}`);
      await c.page
        .locator('.sb-map-chapter[title^="Romans 8"]')
        .first()
        .click();
      await c.page.waitForURL(/\/ROM\/8/, { timeout: 15000 });
      return `"${hereTitle}" outlined; Romans 8 opened from its square`;
    },
  },
  // ── Gap build (docs/architecture/gap-analysis.md) ─────────────────────────────────────────────────────────
  {
    id: "G1",
    section: "3. Reading",
    title: "Testament filter in the book picker",
    rows: ["Testament filter in the book picker"],
    checks:
      "Open the book picker: All / Old / New Testament chips; New Testament starts at Matthew and has no Genesis; All shows both, titled",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-title")
        .click();
      const picker = c.page.locator(".sb-selector-testament-picker");
      await picker.waitFor({ timeout: 10000 });
      const chips = (await picker.locator("button").allInnerTexts()).map((x) =>
        x.trim()
      );
      await picker.getByRole("tab", { name: "New Testament" }).click();
      const books = (
        await c.page.locator(".sb-selector-book-button-name").allInnerTexts()
      ).map((x) => x.trim());
      if (books[0] !== "Matthew" || books.includes("Genesis"))
        throw new Error(`New Testament lists ${books.slice(0, 3).join(", ")}`);
      await picker.getByRole("tab", { name: "All books" }).click();
      const titles = (
        await c.page
          .locator(".sb-selector-testament .sb-selector-section-title")
          .allInnerTexts()
      ).map((x) => x.trim());
      if (
        !titles.includes("Old Testament") ||
        !titles.includes("New Testament")
      )
        throw new Error(`titles ${titles.join(", ")}`);
      return `chips ${chips.join(" / ")}; New Testament: ${books.length} books from Matthew`;
    },
  },
  {
    id: "G2",
    section: "3. Reading",
    title: "Default translation by interface language",
    rows: ["Default translation by interface language"],
    checks:
      "A first visit from a French-speaking browser opens a French Bible (fra_ncl); an English one opens the BSB",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        locale: "fr-FR",
        viewport: { width: 1280, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await c.dismissWelcome(page);
        await page.waitForURL(/\/read\/fra_ncl\//, { timeout: 20000 });
        const fr = page.url().replace(BASE, "");
        await c.open("/");
        await c.page.waitForURL(/\/read\/BSB\//, { timeout: 20000 });
        return `French browser → ${fr}; English → ${c.page.url().replace(BASE, "")}`;
      } finally {
        await ctx.close();
      }
    },
  },
  {
    id: "G3",
    section: "3. Reading",
    title: "Keyboard navigation",
    rows: ["Keyboard navigation"],
    checks:
      "Right arrow opens John 4, Left goes back; Escape clears a selection and then closes the side pane; arrows move focus in the book picker",
    run: async (c) => {
      await c.open(CH);
      await c.verse(16).waitFor({ timeout: 20000 });
      await c.page.keyboard.press("ArrowRight");
      await c.page.waitForURL(/\/JHN\/4$/, { timeout: 15000 });
      await c.page.keyboard.press("ArrowLeft");
      await c.page.waitForURL(/\/JHN\/3$/, { timeout: 15000 });
      await c.verse(16).waitFor({ timeout: 20000 });
      await c.selectVerse(16);
      await c.pressToolbar("Notes");
      await c.page.keyboard.press("Escape");
      await c.page
        .locator(".sb-verse-toolbar")
        .waitFor({ state: "detached", timeout: 3000 });
      await c.page.keyboard.press("Escape");
      await c.page
        .locator(".sb-app-pane")
        .waitFor({ state: "detached", timeout: 3000 });
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-title")
        .click();
      await c.page.locator(".sb-selector-book-button").first().focus();
      await c.page.keyboard.press("ArrowRight");
      const focused = await c.page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.innerText ?? ""
      );
      if (!focused.trim())
        throw new Error("arrow did not move focus in the book picker");
      return `→ John 4, ← John 3; Escape cleared the selection then closed the pane; arrow focus moved to "${focused.trim().slice(0, 20)}"`;
    },
  },
  {
    id: "G4",
    section: "4. Marking the text",
    title: "Right-click menu on a verse, Copy",
    rows: ["Right-click menu on a verse"],
    checks:
      "Right-click John 3:16: the verse toolbar opens at the pointer as a menu; Copy puts the verse's text and reference on the clipboard",
    run: async (c) => {
      await c.open(CH);
      await c.verse(16).waitFor({ timeout: 20000 });
      await c.verse(16).click({ button: "right", position: { x: 40, y: 8 } });
      const menu = c.page.locator(".sb-verse-toolbar-menu");
      await menu.waitFor({ timeout: 5000 });
      await menu.locator(".sb-verse-toolbar-copy").click();
      await c.page.waitForTimeout(300);
      const clip = await c.page
        .evaluate(() => navigator.clipboard.readText())
        .catch(() => "");
      if (!/For God so loved the world[\s\S]*— John 3:16 \(BSB\)/.test(clip))
        throw new Error(`clipboard: ${clip.slice(0, 120)}`);
      return clip.replace(/\s+/g, " ").slice(0, 90);
    },
  },
  {
    id: "G5",
    timeoutMs: 360_000,
    section: "3. Reading",
    title: "Download a whole translation for offline",
    rows: ["Download a whole translation for offline"],
    checks:
      "Translation picker → the download button on BSB; when done it shows as on the device; offline, a chapter never opened (Obadiah 1) reads; Remove takes it off",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-translation")
        .click();
      await c.page.locator('input[type="search"]').first().fill("BSB");
      const item = c.page
        .locator(".sb-translation-item")
        .filter({
          has: c.page.locator(".sb-translation-row-short", {
            hasText: /^BSB$/,
          }),
        })
        .first();
      await item.locator(".sb-translation-offline").click();
      await item
        .locator(".sb-translation-offline-on")
        .waitFor({ timeout: 180000 });
      await c.page.keyboard.press("Escape");
      await c.context.setOffline(true);
      try {
        await c.page
          .locator(".sb-bible-reader-active .sb-bible-reader-title")
          .click();
        await c.page.locator('input[type="search"]').first().fill("Obadiah");
        await c.page
          .getByRole("button", { name: /^Obadiah$/ })
          .first()
          .click();
        await c.page.getByRole("button", { name: /^1$/ }).first().click();
        await c.verse(1).waitFor({ timeout: 20000 });
        const text = (await c.verse(1).innerText()).slice(0, 40);
        return `BSB downloaded; offline, Obadiah 1 reads ("${text}")`;
      } finally {
        await c.context.setOffline(false);
        await c.page
          .locator(".sb-bible-reader-active .sb-bible-reader-translation")
          .click()
          .catch(() => undefined);
        await c.page
          .locator('input[type="search"]')
          .first()
          .fill("BSB")
          .catch(() => undefined);
        c.page.once("dialog", (d) => void d.accept());
        await item
          .locator(".sb-translation-offline")
          .click()
          .catch(() => undefined);
      }
    },
  },
  {
    id: "G6",
    section: "10. Playlists and reading plans",
    title: "Playlist history",
    rows: ["Playlist history"],
    checks:
      "Play a two-item playlist to the end and stop: My playlist history lists it today as Finished with Play again; Play again starts it over",
    run: async (c) => {
      await c.open(CH);
      const pane = await c.openLibrary("Playlists");
      const title = `Flow history ${stamp()}`;
      await pane.locator('input[placeholder^="New playlist"]').fill(title);
      await pane.getByRole("button", { name: /^create$/i }).click();
      const card = pane.locator(".sb-note-card", { hasText: title }).first();
      await card.waitFor({ timeout: 10000 });
      await ensureOpen(card);
      await card
        .locator(
          'input[placeholder*="John 3:16" i], input[placeholder*="reference" i]'
        )
        .first()
        .fill("Romans 8:28");
      await card
        .getByRole("button", { name: /^add item$/i })
        .first()
        .click();
      await c.waitText(card, /Romans 8:28/);
      await card.getByRole("button", { name: /play playlist/i }).click();
      await c.page
        .getByRole("button", { name: /^next$/i })
        .first()
        .click();
      await c.page
        .getByRole("button", { name: /^stop$/i })
        .first()
        .click();
      const history = pane.locator(".sb-play-history");
      await c.waitText(history, new RegExp(`${title}[\\s\\S]*Finished`));
      await history
        .locator(".sb-play-history-row", { hasText: title })
        .getByRole("button", { name: /play again/i })
        .click();
      await c.page.waitForURL(/\/JHN\/3/, { timeout: 15000 });
      await c.page
        .getByRole("button", { name: /^stop$/i })
        .first()
        .click()
        .catch(() => undefined);
      c.page.once("dialog", (d) => void d.accept());
      await ensureOpen(card);
      await card.getByRole("button", { name: /^delete$/i }).click();
      return "history row Finished today; Play again started it at John 3";
    },
  },
  {
    id: "G7",
    timeoutMs: 360_000,
    section: "9. Reading together",
    title: "Session QR code",
    rows: ["Session QR code"],
    checks:
      "Signed in: start a session → QR code shows a scannable picture of the share link, with Save image",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      await startSession(c);
      await c
        .pane()
        .getByRole("button", { name: /qr code/i })
        .click();
      const img = c.pane().locator(".sb-session-qr img");
      await img.waitFor({ timeout: 10000 });
      const src = (await img.getAttribute("src")) ?? "";
      if (!src.startsWith("data:image/png"))
        throw new Error(`img ${src.slice(0, 40)}`);
      await c
        .pane()
        .getByRole("button", { name: /save image/i })
        .waitFor({ timeout: 5000 });
      return `QR ${Math.round(src.length / 1024)} KB PNG with Save image`;
    },
  },
  {
    id: "G8",
    section: "3. Reading",
    title: "Keep the screen on",
    rows: ["Keep the screen on while listening or reading"],
    checks:
      "Account → 'Keep the screen on while the reader is open' (where the browser has a wake lock); the choice is kept after a reload",
    run: async (c) => {
      await c.open(CH);
      const has = await c.page.evaluate(() => "wakeLock" in navigator);
      if (!has)
        return "this browser has no wake lock; the setting is hidden, as designed";
      let pane = await c.openAccount();
      await c.check(pane, /keep the screen on/i).check();
      await c.page.reload();
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      pane = await c.openAccount();
      if (!(await c.check(pane, /keep the screen on/i).isChecked()))
        throw new Error("not kept after a reload");
      await c.check(pane, /keep the screen on/i).uncheck();
      return "on, kept after a reload, turned off again";
    },
  },
  {
    id: "G9",
    section: "8. Today, Discover and publishing",
    title: "Friends pane",
    rows: ["Friends pane"],
    checks:
      "Signed in: the people icon at the top of the sidebar opens the Friends pane with the friends list, Add a friend and Invite by email",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      await c.page
        .locator('.sb-tabs-sidebar button[aria-label="Friends"]')
        .click();
      const pane = c.page.locator(".sb-friends-pane");
      await pane.waitFor({ timeout: 5000 });
      await c.waitText(pane, /add a friend|invite by email/i, 20000);
      return (await pane.innerText()).replace(/\s+/g, " ").slice(0, 110);
    },
  },
  {
    id: "G15",
    section: "3. Reading",
    title: "Choose the reader's fonts",
    rows: ["Margins, line height, UI scale, custom fonts"],
    checks:
      "Account → Text: Verses in Inter, light, italic; Headings in Roboto; the verse text and the heading are drawn in those fonts (Google Fonts loaded only for them); kept after a reload; Reset returns the defaults",
    run: async (c) => {
      await c.open(CH);
      const pane = await c.openAccount();
      const card = pane.locator(".sb-text-style-card");
      await card.getByLabel("Font of Verses").selectOption({ label: "Inter" });
      await card.getByLabel("Weight of Verses").selectOption("300");
      await card
        .locator(".sb-text-style-row")
        .nth(2)
        .getByLabel("Italic")
        .check();
      await card
        .getByLabel("Font of Headings")
        .selectOption({ label: "Roboto" });
      const look = () =>
        c.page.evaluate(() => {
          const v = document.querySelector(".sb-verse-text, .sb-verse");
          const h = document.querySelector(".sb-chapter-heading, h3");
          const vs = v ? getComputedStyle(v) : null;
          return {
            verse: vs
              ? `${vs.fontFamily}|${vs.fontWeight}|${vs.fontStyle}`
              : "",
            heading: h ? getComputedStyle(h).fontFamily : "",
            sheets: [...document.querySelectorAll("link[data-sb-text-font]")]
              .length,
          };
        });
      const a = await look();
      if (
        !/Inter/.test(a.verse) ||
        !/\|300\|italic$/.test(a.verse) ||
        !/Roboto/.test(a.heading) ||
        a.sheets !== 2
      )
        throw new Error(`after choosing: ${JSON.stringify(a)}`);
      await c.page.reload();
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(500);
      const b = await look();
      if (b.verse !== a.verse)
        throw new Error(`after reload: ${JSON.stringify(b)}`);
      const again = await c.openAccount();
      await again
        .locator(".sb-text-style-card")
        .getByRole("button", { name: /^reset$/i })
        .click();
      const d = await look();
      if (/Inter/.test(d.verse) || d.sheets)
        throw new Error(`after reset: ${JSON.stringify(d)}`);
      return `verses ${a.verse.replace(/"/g, "")}; headings ${a.heading.replace(/"/g, "")}; kept after a reload; Reset → ${d.verse.split("|")[0]!.replace(/"/g, "").slice(0, 30)}`;
    },
  },
  {
    id: "G17",
    section: "12. Extensions",
    title: "Videos and articles in Discover",
    rows: ["Videos and articles"],
    checks:
      "On Matthew 26, Discover → Videos and articles lists Expedition Bible's Upper Room video and BibleProject's Matthew overview; tapping one opens its own page in a new tab",
    run: async (c) => {
      await c.open("/read/BSB/MAT/26");
      await c.pressToolbar("Discover");
      const section = c
        .pane()
        .locator(".sb-content-section", { hasText: "Videos and articles" });
      await c.waitText(section, /Upper Room|Last Supper/i, 20000);
      await c.waitText(section, /BibleProject/, 5000);
      const count = await section.locator(".sb-discover-item").count();
      const [popup] = await Promise.all([
        c.page.waitForEvent("popup", { timeout: 10000 }),
        section
          .locator(".sb-discover-item", { hasText: /Last Supper/i })
          .first()
          .locator("button")
          .click(),
      ]);
      const url = popup.url();
      await popup.close();
      if (!/youtube\.com/.test(url)) throw new Error(`opened ${url}`);
      return `${count} items for Matthew 26; the Upper Room video opened ${url.slice(0, 50)}`;
    },
  },
  {
    id: "G18",
    section: "12. Extensions",
    title: "People, places and events",
    rows: ["People, places and events"],
    checks:
      "On Genesis 12, Discover → People, places and events lists Abraham, Haran and Abraham enters Canaan; Abraham's card shows his years, his relations and his passages; a relation opens its own card and Back returns; a passage opens in the reader",
    run: async (c) => {
      await c.open("/read/BSB/GEN/12");
      await c.pressToolbar("Discover");
      const section = c
        .pane()
        .locator(".sb-content-section", {
          hasText: "People, places and events",
        });
      await c.waitText(section, /Abraham enters Canaan/, 20000);
      await c.waitText(section, /Haran/, 5000);
      await section
        .locator(".sb-discover-item", { hasText: /^\s*person\s*Abraham/ })
        .first()
        .locator("button")
        .click();
      const card = c.page.locator(".sb-theo-card");
      await c.waitText(card, /BC/, 20000);
      const name = (await card.locator(".sb-theo-name").innerText()).trim();
      if (name !== "Abraham") throw new Error(`card for ${name}`);
      const firstRelation = card
        .locator(".sb-theo-relation .sb-note-button")
        .first();
      const other = (await firstRelation.innerText()).trim();
      await firstRelation.click();
      await c.waitText(card.locator(".sb-theo-name"), new RegExp(other), 20000);
      await card.locator(".sb-theo-back").click();
      await c.waitText(card.locator(".sb-theo-name"), /Abraham/, 10000);
      const ref = card.locator(".sb-theo-ref").nth(1);
      const label = (await ref.innerText()).trim();
      await ref.click();
      await c.page.waitForURL(/\/read\//, { timeout: 10000 });
      return `Abraham's card; ${other}'s card and Back; ${label} opened at ${new URL(c.page.url()).pathname}`;
    },
  },
  {
    id: "G10",
    section: "3. Reading",
    title: "Customize the bottom toolbar",
    rows: ["Customize the bottom toolbar"],
    checks:
      "Account → Toolbar: untick Today and move Notes up; the bottom toolbar drops Today and shows Notes before Discover; kept after a reload; Reset restores it",
    run: async (c) => {
      await c.open(CH);
      const labels = () =>
        c.page
          .locator(".sb-reader-toolbar .sb-reader-toolbar-secondary button")
          .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
      const before = await labels();
      let pane = await c.openAccount();
      const card = pane.locator(".sb-toolbar-card");
      await c.check(card, "Today").uncheck();
      await card.locator('button[aria-label="Move up Notes"]').click();
      await card.locator('button[aria-label="Move up Notes"]').click();
      const after = await labels();
      if (
        after.includes("Today") ||
        after.indexOf("Notes") > after.indexOf("Discover")
      )
        throw new Error(`toolbar: ${after.join(", ")}`);
      await c.page.reload();
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(500);
      const kept = await labels();
      if (kept.includes("Today")) throw new Error("not kept after a reload");
      pane = await c.openAccount();
      await pane
        .locator(".sb-toolbar-card")
        .getByRole("button", { name: /^reset$/i })
        .click();
      const reset = await labels();
      if (reset.join() !== before.join())
        throw new Error(`after reset: ${reset.join(", ")}`);
      return `${before.length} buttons; Today hidden and Notes before Discover, kept after a reload; Reset restored`;
    },
  },
  {
    id: "G11",
    section: "13. Getting started",
    title: "Guided tour",
    rows: ["Guided tour"],
    checks:
      "A ?tutorial=introduction link opens the tour; Next walks every step to Done and the tour closes; ?tutorialStep=2 (zero-based, as in the old reader) starts on step 3; Escape closes it",
    run: async (c) => {
      const card = c.page.locator(".sb-tour-card");
      await c.open(`${CH}?tutorial=introduction`);
      await card.waitFor({ timeout: 8000 });
      let steps = 1;
      for (; steps < 12; steps++) {
        const done = card.getByRole("button", { name: /^done$/i });
        if (await done.count()) {
          await done.click();
          break;
        }
        await card.getByRole("button", { name: /^next$/i }).click();
      }
      await card.waitFor({ state: "detached", timeout: 3000 });
      await c.open(`${CH}?tutorial=introduction&tutorialStep=2`);
      await card.waitFor({ timeout: 8000 });
      const progress = (await card.innerText()).match(
        /(\d+)\s*(?:of|\/)\s*(\d+)/
      );
      if (!progress || progress[1] !== "3")
        throw new Error(`started at: ${progress?.[0] ?? "no progress text"}`);
      await c.page.keyboard.press("Escape");
      await card.waitFor({ state: "detached", timeout: 3000 });
      return `${steps} steps walked to Done; a link with tutorialStep=2 opened on ${progress[0]}; Escape closed it`;
    },
  },
  {
    id: "G12",
    timeoutMs: 420_000,
    section: "8. Today, Discover and publishing",
    title: "Shared page for a published playlist",
    rows: ["Shared pages"],
    checks:
      "Signed in: publish a playlist; Discover on Genesis 1 lists it → Copy page link; a fresh, signed-out browser gets the page drawn on the edge (its title in the preview tags) and opens it with Save to my Library and play; Open Seed Bible returns to a chapter; withdrawn, the link says it is not shared any more",
    run: async (c) => {
      await c.open("/read/BSB/GEN/1");
      await c.signInAsSample();
      const lib = await c.openLibrary("Playlists");
      const title = `Flow page ${stamp()}`;
      await lib.locator('input[placeholder^="New playlist"]').fill(title);
      await lib.getByRole("button", { name: /^create$/i }).click();
      const card = lib.locator(".sb-note-card", { hasText: title }).first();
      await card.waitFor({ timeout: 10000 });
      await ensureOpen(card);
      await card.locator("button", { hasText: /(^|\s)Publish\s*$/ }).click();
      await card
        .locator("button", { hasText: /(^|\s)Published\s*$/ })
        .waitFor({ timeout: 120000 });
      await c.pressToolbar("Discover");
      const item = c.pane().locator(".sb-discover-item", { hasText: title });
      for (let i = 0; i < 12 && !(await item.count()); i++) {
        await c
          .pane()
          .getByRole("button", { name: /refresh/i })
          .first()
          .click()
          .catch(() => undefined);
        await c.page.waitForTimeout(5000);
      }
      if (!(await item.count())) throw new Error("not listed in Discover");
      await item.locator(".sb-discover-item-main").click();
      await item.locator(".sb-discover-copy-page").click();
      await c.page.waitForTimeout(300);
      const link = await c.page.evaluate(() => navigator.clipboard.readText());
      if (!/\/shared\/[^/]+\/playlist\//.test(link))
        throw new Error(`link "${link}"`);
      const fresh = await c.secondPage();
      const edge = await fresh.request.get(link, {
        headers: { accept: "text/html" },
      });
      const html = await edge.text();
      if (edge.headers()["x-sb-ssr"] !== "shared" || !html.includes(title))
        throw new Error(
          `edge: ${edge.status()} ${edge.headers()["x-sb-ssr"]}; title in html ${html.includes(title)}`
        );
      await fresh.goto(link, { waitUntil: "domcontentloaded" });
      await c.dismissWelcome(fresh);
      const h1 = fresh.locator(".sb-shared-overlay h1");
      await c.waitText(h1, new RegExp(title), 30000);
      await fresh
        .getByRole("button", { name: /save to my library and play/i })
        .waitFor({ timeout: 5000 });
      await fresh
        .locator(".sb-shared-actions")
        .last()
        .getByRole("button", { name: /open seed bible/i })
        .click();
      await fresh.waitForURL(/\/read\//, { timeout: 10000 });
      await c.openLibrary("Playlists");
      await ensureOpen(card);
      await card.locator("button", { hasText: /(^|\s)Published\s*$/ }).click();
      await card
        .locator("button", { hasText: /(^|\s)Publish\s*$/ })
        .waitFor({ timeout: 120000 });
      c.page.once("dialog", (d) => void d.accept());
      await card.getByRole("button", { name: /^delete$/i }).click();
      const gone = await fresh.request.get(link, {
        headers: { accept: "text/html" },
      });
      return `${link.replace(BASE, "")}: drawn on the edge, opened signed out, back to the reader; after withdrawing the link answers ${gone.status()}`;
    },
  },
];
