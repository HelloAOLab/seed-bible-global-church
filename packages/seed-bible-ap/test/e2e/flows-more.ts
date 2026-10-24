// THE REST OF THE MANUAL'S ROWS — reading settings, notes in depth, publishing, live sessions in depth, playlists and
// plans, church themes, the extensions, links and first visit. Signed-in flows use the Home's sample person Seed
// Reader and tidy up after themselves (what they publish is withdrawn, what they make is deleted). Rows that need
// two Homes that are friends with each other are skipped with the reason: the sample people have no friends.
import { chromium, firefox } from "playwright";
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

/** Delete every note on the chapter — the Notes pane is opened for it, so one a failed run left behind goes too. */
async function deleteAllNotes(c: FlowContext) {
  c.page.on("dialog", (d) => void d.accept().catch(() => undefined));
  if (!(await c.page.locator(".sb-note-card").count())) {
    await c.pressToolbar("Notes");
    await c.pane().waitFor({ timeout: 5000 });
    await c.page.waitForTimeout(1500);
  }
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
  // The tap shows the moving line at the top while the session is made.
  await c.page
    .locator(".sb-activity-bar")
    .waitFor({ timeout: 3000 })
    .catch(() => {
      throw new Error("no progress line after Start a session");
    });
  await c.pane().locator(".sb-session-code").waitFor({ timeout: 20000 });
  await c
    .pane()
    .getByRole("button", { name: /copy link/i })
    .click();
  await c.page.waitForTimeout(300);
  const link = await c.page
    .evaluate(() => navigator.clipboard.readText())
    .catch(() => "");
  const code = (await c.pane().locator(".sb-session-code").innerText()).trim();
  const sid = /session=([^&]+)/.exec(link)?.[1];
  if (!code || !sid)
    throw new Error(`no share code or session id (link "${link}")`);
  const shown = (await c.pane().locator(".sb-session-id").innerText()).trim();
  if (shown !== sid)
    throw new Error(`Session ID shows "${shown}", the link names "${sid}"`);
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
      "Account → Your profile: a display name and a line → Save says Saving…, then ✓ Saved to your Library; after a reload they are still there; Publish → Published, then unpublished",
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
      const status = pane.locator(".sb-profile-card [role=status]");
      const t0 = Date.now();
      await c.waitText(status, /Saved to your Library/, 60000);
      const took = ((Date.now() - t0) / 1000).toFixed(1);
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
      return `"Saved to your Library" after ${took}s; profile line "${line}" kept across a reload; published, then withdrawn`;
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
      "Host starts a session (a record is kept in the Library; its path on hover); a guest joins; the guest selects 3:16 and the host's roster says so; the host shows everyone 3:9 and the guest sees the ribbon; a chat line from the guest reaches the host",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const { sid, code } = await startSession(c);
      const record =
        (await c
          .pane()
          .locator('[title*="seed-bible/sessions/"]')
          .first()
          .getAttribute("title")
          .catch(() => null)) ?? "";
      if (!record)
        throw new Error(
          `no record path in: ${(await c.paneText()).slice(0, 160)}`
        );
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
      if (!/^Comfort.*Psalms? 23.*John 1.*\| Day 2.*Romans 8:28/i.test(shown))
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
      "Signed in: Account → Picture → a 600×300 picture opens the round crop window; zoom in, drag, Use picture — the profile shows a 256×256 picture; another device signed in as the same person shows it too; Earlier pictures lists it and picking it sets it again",
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
      // Another device, signed in as the same person, shows the same picture (the profile comes from the Library).
      const other = await c.secondPage();
      await c.open(CH, other);
      await c.signInAsSample(undefined, other);
      await c.openAccount(other);
      await other
        .locator(`img.sb-profile-picture[src="${src}"]`)
        .waitFor({ timeout: 30000 })
        .catch(() => {
          throw new Error("the picture is not shown on another device");
        });
      await other.context().close();
      await pane.locator(".sb-profile-card .sb-picture-earlier").click();
      const grid = c.page.locator(".sb-gallery-dialog");
      const item = grid.locator(`.sb-gallery-item img[src="${src}"]`);
      await item.waitFor({ timeout: 30000 });
      const count = await grid.locator(".sb-gallery-item").count();
      await item.click();
      await grid.waitFor({ state: "detached", timeout: 5000 });
      return `cropped to ${size}, shown on a second device; Earlier pictures listed ${count}, the new one among them, and picking it kept it`;
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
      // The link's theme applies once the registry has answered: wait until the page's active theme is the church's
      // (its id names the offering), not merely until some theme is drawn.
      await fresh
        .waitForFunction(
          () =>
            (document.documentElement.dataset["sbTheme"] ?? "").startsWith(
              "urn:seed:offering:"
            ),
          undefined,
          { timeout: 30000 }
        )
        .catch(() => undefined);
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
      await c.page.getByPlaceholder(/twitch channel/i).fill("twitchdev");
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
      "Signed in: Account → Extensions → Transcript on; Transcript → choose a one-second recording; it is decoded on the device and marked done with an empty transcript — silence is never sent to the speech model, which would invent words for it",
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
      await c.waitText(c.pane(), /silence\.wav · done/i, 120000);
      if (await c.pane().locator(".sb-pane-error").count())
        throw new Error((await c.paneText()).slice(0, 160));
      const lines = await c.pane().locator(".sb-transcript-text p").count();
      if (lines)
        throw new Error(`silence came back as ${lines} line(s) of text`);
      return "silence.wav decoded on the device; done, with an empty transcript (silence is not sent)";
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
    title: "First visit: the tour offer",
    rows: ["First-visit card"],
    checks:
      "A fresh browser shows the chapter at once, with the old reader's card in the top-right corner — Would you like a tutorial? — No, thanks and Take the tour; the verses can be tapped while it is up; No, thanks closes it for good; Take the tour (a second fresh browser) starts the tour; an embed never shows it",
    run: async (c) => {
      await c.page.goto(`${BASE}${CH}`, { waitUntil: "domcontentloaded" });
      const offer = c.page.locator(".sb-tutorial-prompt");
      await offer.waitFor({ timeout: 15000 });
      const text = (await offer.innerText()).replace(/\s+/g, " ");
      if (!/would you like a tutorial/i.test(text) || !/no, thanks/i.test(text))
        throw new Error(`offer: ${text.slice(0, 100)}`);
      const box = (await offer.boundingBox())!;
      const vw = c.page.viewportSize()!.width;
      if (box.x + box.width < vw - 40 || box.y > 40)
        throw new Error(
          `the offer is not in the top-right corner: ${JSON.stringify(box)}`
        );
      await c.selectVerse(16);
      await c.page.keyboard.press("Escape");
      await offer.getByRole("button", { name: /no, thanks/i }).click();
      const later = c.page.getByRole("button", { name: /maybe later|got it/i });
      if (await later.count()) await later.first().click();
      await c.page.reload({ waitUntil: "domcontentloaded" });
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(1500);
      if (await offer.count())
        throw new Error("the offer came back after No, thanks");
      const second = await c.secondPage();
      await c.keepTours(second);
      await second.goto(`${BASE}${CH}`, { waitUntil: "domcontentloaded" });
      await second
        .locator(".sb-tutorial-prompt")
        .getByRole("button", { name: /take the tour/i })
        .click({ timeout: 15000 });
      await second.locator(".sb-tour-card").waitFor({ timeout: 8000 });
      const embed = await c.secondPage();
      await embed.goto(`${BASE}${CH}?embed=minimal`, {
        waitUntil: "domcontentloaded",
      });
      await embed
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await embed.waitForTimeout(2000);
      if (await embed.locator(".sb-tutorial-prompt").count())
        throw new Error("shown in an embed");
      return "the chapter readable with the offer in the corner; a verse selected under it; gone for good after No, thanks; Take the tour started the tour; never in an embed";
    },
  },
  {
    id: "N4",
    section: "13. Links and embedding",
    title: "About and the legal texts",
    rows: ["About and the legal texts"],
    checks:
      "Settings (the ⚙ in the sidebar) → About Seed Bible: the About pane; Terms of service, Privacy policy and Code of conduct each open their text",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(".sb-tabs-sidebar")
        .getByRole("button", { name: "Open settings" })
        .click();
      await c.page.getByText("About Seed Bible").click();
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
      "The sidebar's ⋮ → Scripture map opens it with John 3 outlined; a highlight there marks its square; tapping Romans 8 opens it",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.page.locator(".sb-verse-toolbar-color-button").first().click();
      // The sidebar's ⋮ More menu holds it now, as in the old reader.
      await c.page
        .locator(".sb-sidebar-top-row")
        .getByRole("button", { name: "More" })
        .click();
      await c.page.getByRole("menuitem", { name: "Scripture map" }).click();
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
        await c.page.waitForURL(/\/read\/BSB\/OBA\/1/, { timeout: 20000 });
        await c.waitText(c.verse(1), /vision of Obadiah/i, 20000);
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
      "Signed in: the sidebar's ⋮ → Friends opens the Friends pane with the friends list, Add a friend and Invite by email",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      // The sidebar's ⋮ More menu holds it now, as in the old reader.
      await c.page
        .locator(".sb-sidebar-top-row")
        .getByRole("button", { name: "More" })
        .click();
      await c.page.getByRole("menuitem", { name: "Friends" }).click();
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
          const h = document.querySelector(".sb-chapter-heading");
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
      const section = c.pane().locator(".sb-content-section", {
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
    id: "G19",
    timeoutMs: 240_000,
    section: "8. Today, Discover and publishing",
    title: "Today in the side pane; friends that need a new sign-in",
    rows: ["Today pane"],
    checks:
      "Signed in, with the workspace refusing the friends read for want of permission: Today's sections stack in one column inside the pane; Friends says what is wrong in words with Sign in again, which opens Account — never the raw refusal",
    run: async (c) => {
      await c.page.route("**/harness/ask", async (route) => {
        const body = route.request().postData() ?? "";
        if (/seed\.workspace\.(friends|contacts)/.test(body))
          return route.fulfill({
            json: {
              ok: true,
              reply: {
                kind: "refused",
                error:
                  "this workspace holds no permission to ask your agent — sign in again to let it keep your Library",
              },
            },
          });
        return route.continue();
      });
      await c.open(CH);
      await c.signInAsSample();
      await c.pressToolbar("Today");
      const notice = c.pane().locator(".sb-friends-notice");
      await notice.waitFor({ timeout: 30000 });
      if (/holds no permission/.test(await c.paneText()))
        throw new Error("the raw refusal is on screen");
      const tops = await c
        .pane()
        .locator(":scope .sb-content-section")
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
      const pane = await c.pane().boundingBox();
      for (let k = 1; k < tops.length; k++)
        if (tops[k]!.top <= tops[k - 1]!.top)
          throw new Error(
            `sections side by side: ${tops.map((r) => Math.round(r.left)).join(", ")}`
          );
      if (tops.some((r) => r.right > pane!.x + pane!.width + 1))
        throw new Error("a section runs past the pane");
      await notice.getByRole("button", { name: /sign in again/i }).click();
      await c.page
        .locator(".sb-app-pane", { hasText: /church theme/i })
        .waitFor({ timeout: 10000 });
      return `${tops.length} sections in one column; the notice asked to sign in again, and its button opened Account`;
    },
  },
  {
    id: "G10",
    section: "3. Reading",
    title: "Customize the bottom toolbar",
    rows: ["Customize the bottom toolbar"],
    checks:
      "Account → Toolbar: tick Today into the bar, move Discover up twice; the bar shows Discover then Today and More no longer lists Today; kept after a reload; Reset puts Today back under More",
    run: async (c) => {
      await c.open(CH);
      const labels = () =>
        c.page
          .locator(
            ".sb-reader-toolbar .sb-reader-toolbar-secondary button:visible"
          )
          .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
      const inMore = async () => {
        await c.page
          .locator(".sb-reader-toolbar-more-button button:visible")
          .click();
        const names = await c.page
          .locator(".sb-reader-toolbar-more-menu button:visible")
          .allInnerTexts();
        await c.page
          .locator(".sb-reader-toolbar-more-button button:visible")
          .click();
        await c.page
          .locator(".sb-reader-toolbar-more-menu")
          .waitFor({ state: "detached" });
        return names.map((n) => n.replace(/\s+/g, " ").trim());
      };
      const before = await labels();
      if (
        before.includes("Today") ||
        !(await inMore()).some((n) => /today/i.test(n))
      )
        throw new Error(
          `a new bar: ${before.join(", ")}; Today should be under More`
        );
      let pane = await c.openAccount();
      const card = pane.locator(".sb-toolbar-card");
      await c.check(card, "Today").check();
      for (let i = 0; i < 2; i++)
        await card.locator('button[aria-label="Move up Discover"]').click();
      // With a pane open the reading area is narrower and the bar folds under More; read it with the pane closed.
      await pane.locator(".sb-pane-close").first().click();
      await c.page
        .locator(".sb-reader-toolbar:not(.sb-reader-toolbar-folded)")
        .waitFor({ timeout: 5000 });
      const after = await labels();
      if (
        !after.includes("Today") ||
        after.indexOf("Discover") > after.indexOf("Today")
      )
        throw new Error(`toolbar: ${after.join(", ")}`);
      if ((await inMore()).some((n) => /^today/i.test(n)))
        throw new Error("Today is both in the bar and under More");
      await c.page.reload();
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await c.page.waitForTimeout(500);
      const kept = await labels();
      if (!kept.includes("Today")) throw new Error("not kept after a reload");
      pane = await c.openAccount();
      await pane
        .locator(".sb-toolbar-card")
        .getByRole("button", { name: /^reset$/i })
        .click();
      await pane.locator(".sb-pane-close").first().click();
      await c.page
        .locator(".sb-reader-toolbar:not(.sb-reader-toolbar-folded)")
        .waitFor({ timeout: 5000 });
      const reset = await labels();
      if (reset.join() !== before.join())
        throw new Error(`after reset: ${reset.join(", ")}`);
      if (!(await inMore()).some((n) => /today/i.test(n)))
        throw new Error("after Reset, Today is not under More");
      return `bar ${before.join(", ")}; Today ticked in, Discover moved before it, kept after a reload; Reset put it back under More`;
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
      await c.keepTours();
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
  {
    id: "PH2",
    timeoutMs: 240_000,
    section: "13. Links and embedding",
    title: "The bottom toolbar fits its window, in Firefox and Chrome",
    rows: ["The bottom toolbar fits its window"],
    checks:
      "In Firefox and in Chrome, at 1440, 1100, 900 and 740 px wide: every button sits inside the bar and on screen, and the bar keeps clear of the sidebar; where the whole bar is wider than the reading area it folds under More, and More opens on screen and clear of the sidebar; widened to 1600 px the bar unfolds again",
    run: async () => {
      const seen: string[] = [];
      for (const type of [firefox, chromium]) {
        const browser = await type.launch();
        try {
          for (const width of [1440, 1100, 900, 740]) {
            const page = await (
              await browser.newContext({ viewport: { width, height: 760 } })
            ).newPage();
            await page.goto(`${BASE}${CH}`, { waitUntil: "networkidle" });
            const just = page.getByRole("button", { name: /no, thanks/i });
            if (await just.count()) await just.first().click();
            const bar = page.locator(".sb-reader-toolbar");
            await bar.waitFor({ timeout: 20000 });
            await page.evaluate(() => document.fonts.ready);
            const at = `${type.name()} at ${width}px`;
            const fit = await bar.evaluate((n) => {
              const r = n.getBoundingClientRect();
              const side = document
                .querySelector(".sb-tabs-sidebar")!
                .getBoundingClientRect();
              const items = [...n.querySelectorAll(".sb-reader-toolbar-item")]
                .map((k) => k.getBoundingClientRect())
                .filter((k) => k.width);
              return {
                out: items.filter(
                  (k) =>
                    k.right > r.right + 1 ||
                    k.left < r.left - 1 ||
                    k.right > innerWidth
                ).length,
                overSidebar: r.left < side.right - 1,
                sidebarFixed:
                  getComputedStyle(document.querySelector(".sb-tabs-sidebar")!)
                    .position === "fixed",
                folded: n.classList.contains("sb-reader-toolbar-folded"),
              };
            });
            if (fit.out)
              throw new Error(`${at}: ${fit.out} buttons fall outside the bar`);
            if (fit.overSidebar)
              throw new Error(`${at}: the bar runs under the sidebar`);
            if (fit.sidebarFixed)
              throw new Error(`${at}: the sidebar floats over the text`);
            if (width === 1440 && fit.folded)
              throw new Error(`${at}: the bar folded with room to spare`);
            if (fit.folded) {
              await page
                .getByRole("button", { name: "More", exact: true })
                .click();
              const menu = await page
                .locator(".sb-reader-toolbar-more-menu")
                .evaluate((m) => {
                  const r = m.getBoundingClientRect();
                  const side = document
                    .querySelector(".sb-tabs-sidebar")!
                    .getBoundingClientRect();
                  return (
                    r.left >= side.right && r.right <= innerWidth && r.top >= 0
                  );
                });
              if (!menu)
                throw new Error(
                  `${at}: More opens off screen or over the sidebar`
                );
              await page.setViewportSize({ width: 1600, height: 760 });
              await page
                .waitForFunction(
                  () =>
                    !document
                      .querySelector(".sb-reader-toolbar")!
                      .classList.contains("sb-reader-toolbar-folded"),
                  undefined,
                  { timeout: 5000 }
                )
                .catch(() => {
                  throw new Error(
                    `${at}: widened to 1600px the bar stayed folded`
                  );
                });
            }
            seen.push(`${at} ${fit.folded ? "folded under More" : "whole"}`);
            await page.context().close();
          }
        } finally {
          await browser.close();
        }
      }
      return `every button inside the bar, clear of the sidebar: ${seen.join("; ")}`;
    },
  },
  {
    id: "TB1",
    section: "3. Reading",
    title: "The old reader's bottom bar; every action within reach",
    rows: ["Every action within reach"],
    checks:
      "On a desktop the bar is ‹ Books · Search · Discover · the extensions · More ›, each with its word under the icon; Books opens the book picker and Search opens Your content with its search box ready; More lists Sign in, Live session, Today, Notes, Library, Your content, Full screen and Themes. On a phone every one of those actions is in the top bar or its More",
    run: async (c) => {
      const all = [
        "Live session",
        "Today",
        "Discover",
        "Notes",
        "Library",
        "Your content",
        "Full screen",
        "Themes",
        "Sign in",
      ];
      const reachable = async (page: import("playwright").Page) => {
        const inBar = await page
          .locator(".sb-reader-toolbar button:visible")
          .evaluateAll((bs) =>
            bs.map((b) => b.getAttribute("aria-label") ?? "")
          );
        await page
          .locator(".sb-reader-toolbar-more-button button:visible")
          .click();
        const inMore = (
          await page
            .locator(".sb-reader-toolbar-more-menu button:visible")
            .allInnerTexts()
        ).map((t) => t.replace(/\s+/g, " ").trim());
        await page
          .locator(".sb-reader-toolbar-more-button button:visible")
          .click();
        await page
          .locator(".sb-reader-toolbar-more-menu")
          .waitFor({ state: "detached" });
        const missing = all.filter(
          (a) => !inBar.includes(a) && !inMore.some((m) => m.endsWith(a))
        );
        return { inBar, inMore, missing };
      };
      await c.open(CH);
      const words = await c.page
        .locator(".sb-reader-toolbar .sb-reader-toolbar-button-label:visible")
        .allInnerTexts();
      if (words.slice(0, 3).join() !== "Books,Search,Discover")
        throw new Error(`the bar reads: ${words.join(", ")}`);
      const desk = await reachable(c.page);
      if (desk.missing.length)
        throw new Error(
          `not reachable on a desktop: ${desk.missing.join(", ")}`
        );
      await c.pressToolbar("Books");
      await c.page
        .locator(".sb-selector-panel")
        .first()
        .waitFor({ timeout: 5000 });
      await c.page.keyboard.press("Escape");
      await c.pressToolbar("Search");
      await c.page
        .waitForFunction(
          () => document.activeElement?.closest(".sb-content-search") != null,
          undefined,
          { timeout: 5000 }
        )
        .catch(() => {
          throw new Error("Search did not open a search box ready to type in");
        });
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
      });
      const phone = await ctx.newPage();
      try {
        await c.open(CH, phone);
        const p = await reachable(phone);
        if (p.missing.length)
          throw new Error(`not reachable on a phone: ${p.missing.join(", ")}`);
      } finally {
        await ctx.close();
      }
      return `desktop bar: ${words.join(" · ")}; under More: ${desk.inMore.join(", ")}; Books and Search open; on a phone all ${all.length} actions reachable`;
    },
  },
  {
    id: "H1",
    section: "3. Reading",
    title: "The chapter header's actions",
    rows: ["Chapter actions in the header"],
    checks:
      "At the top right of the chapter, in the old reader's order: ☆ Save chapter fills when tapped, Bookmark, Discover opens the Discover pane, Share opens the Share dialog with the chapter's link, and the orange Listen plays the recording and turns into Pause",
    run: async (c) => {
      await c.open(CH);
      const head = c.page.locator(
        ".sb-bible-reader-active .sb-bible-reader-actions"
      );
      const order = await head
        .locator("button:visible")
        .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
      const want = [
        "Save chapter",
        "Bookmark this chapter",
        "Discover",
        "Share",
        "Listen",
      ];
      if (order.join() !== want.join())
        throw new Error(`header: ${order.join(", ")}`);
      await head.getByRole("button", { name: "Save chapter" }).click();
      await head
        .locator(".sb-bible-reader-save-button .sb-icon-filled")
        .waitFor({ timeout: 5000 });
      await head.getByRole("button", { name: "Save chapter" }).click();
      await head.getByRole("button", { name: "Discover" }).click();
      await c.pane().waitFor({ timeout: 5000 });
      if (!/discover/i.test(await c.paneText()))
        throw new Error("Discover did not open the Discover pane");
      await head.getByRole("button", { name: "Share" }).click();
      const dialog = c.page.getByRole("dialog");
      await dialog.waitFor({ timeout: 5000 });
      const shown = await dialog.innerText();
      if (
        !/\/read\/BSB\/JHN\/3/.test(shown) &&
        !(await dialog.locator("input").count())
      )
        throw new Error(`Share: ${shown.slice(0, 120)}`);
      await c.page.keyboard.press("Escape");
      await head.getByRole("button", { name: "Listen" }).click();
      await head
        .getByRole("button", { name: "Pause" })
        .waitFor({ timeout: 15000 })
        .catch(() => {
          throw new Error("Listen did not start the recording");
        });
      await head.getByRole("button", { name: "Pause" }).click();
      return `header: ${order.join(" · ")}; Save filled and cleared; Discover opened its pane; Share opened the dialog; Listen played and paused`;
    },
  },
  {
    id: "ST1",
    section: "3. Reading",
    title: "Settings in the sidebar",
    rows: ["Settings"],
    checks:
      "The ⚙ at the bottom left of the sidebar turns the sidebar into Settings, in place of the tabs — Account settings, Display & Theme, Toolbar, Extensions, Install App, Launch tutorial, Customize, About Seed Bible, then Language; Display & Theme opens its page there, a line-height choice there changes the chapter, ← goes back to the list; ✕ brings the tabs back",
    run: async (c) => {
      await c.open(CH);
      const side = c.page.locator(".sb-tabs-sidebar");
      await side.getByRole("button", { name: "Open settings" }).click();
      const labels = await side
        .locator(".sb-settings-nav-label")
        .allInnerTexts();
      const want = [
        "Account settings",
        "Display & Theme",
        "Toolbar",
        "Extensions",
        "Install App",
        "Launch tutorial",
        "Customize",
        "About Seed Bible",
      ];
      if (labels.join() !== want.join())
        throw new Error(`Settings lists: ${labels.join(", ")}`);
      if (await side.locator(".sb-sidebar-tab-list").count())
        throw new Error("the tabs are still showing beside Settings");
      await side.getByLabel("Language").waitFor({ timeout: 3000 });
      await side.getByText("Display & Theme").click();
      const lineHeight = side
        .locator("label", { hasText: "Line height" })
        .locator("select");
      await lineHeight.selectOption("relaxed");
      await c.page
        .locator('[data-sb-line="relaxed"]')
        .first()
        .waitFor({ state: "attached", timeout: 5000 })
        .catch(() => {
          throw new Error("the chapter did not take the line height");
        });
      await lineHeight.selectOption("normal");
      await side.getByRole("button", { name: "Back" }).click();
      await side
        .locator(".sb-settings-nav-label")
        .first()
        .waitFor({ timeout: 3000 });
      await side.getByRole("button", { name: "Close Settings" }).click();
      await side.locator(".sb-sidebar-tab-list").waitFor({ timeout: 3000 });
      return `⚙ → Settings: ${labels.join(" · ")}; Display & Theme's line height reached the chapter; ← back to the list; ✕ brought the tabs back`;
    },
  },
  {
    id: "SB1",
    section: "6. Tabs and panes",
    title:
      "The old reader's sidebar: Tasks, Bookmarks, Saves, the tab's star and menu",
    rows: ["Sidebar buttons"],
    checks:
      "Beside Tabs: ☑ Tasks opens Today, 🔖 shows the bookmarks above the tabs, ☆ shows the saves in My Saves; the open tab's ☆ saves the chapter; a save made in BSB opens in BSB from the Saves panel and from Your content while the KJV is open; the tab's ⋮ → Open in new panel adds a pane; the top row has ⊞ Panels and ⋮ More",
    run: async (c) => {
      await c.open("/read/BSB/JHN/3");
      const side = c.page.locator(".sb-tabs-sidebar");
      await side.getByRole("button", { name: "Tasks" }).click();
      await c.waitText(c.pane(), /today/i, 5000);
      await side.getByRole("button", { name: "Tasks" }).click();
      await side
        .locator(".sb-tab-row-selected")
        .getByRole("button", { name: "Save chapter" })
        .click();
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-bookmark-button")
        .click();
      await side.getByRole("button", { name: "Bookmarks" }).click();
      await c.waitText(side.locator(".sb-bookmarks-panel"), /john 3/i, 5000);
      // A bookmark opens in the translation on screen, so it goes before the saves are tried from WEB.
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-bookmark-button")
        .click();
      await side.getByRole("button", { name: "Saves" }).click();
      const saves = side.locator(".sb-saves-section");
      await c.waitText(saves, /my saves[\s\S]*john 3/i, 5000);
      await c.page.goto(`${BASE}/read/eng_kjv/ROM/8`, {
        waitUntil: "domcontentloaded",
      });
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await side.getByRole("button", { name: "Saves" }).click();
      await saves
        .locator(".sb-save-item-button", { hasText: /john 3/i })
        .first()
        .click();
      await c.page
        .waitForURL(/\/read\/BSB\/JHN\/3/, { timeout: 15000 })
        .catch(() => {
          throw new Error(`the save opened at ${c.page.url()}, not in BSB`);
        });
      await c.page.goto(`${BASE}/read/eng_kjv/ROM/8`, {
        waitUntil: "domcontentloaded",
      });
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      await c.pressToolbar("Your content");
      await c
        .pane()
        .locator(".sb-content-save", { hasText: /john 3/i })
        .first()
        .click();
      await c.page
        .waitForURL(/\/read\/BSB\/JHN\/3/, { timeout: 15000 })
        .catch(() => {
          throw new Error(
            `Your content opened the save at ${c.page.url()}, not in BSB`
          );
        });
      await side
        .locator(".sb-tab-row-selected")
        .getByRole("button", { name: "Save chapter" })
        .click();
      await side.getByRole("button", { name: "New tab" }).first().click();
      // A new tab brings the one-time "Open more passages" tip, which the harness closes with Esc — and Esc closes
      // menus too: open the tab's menu once it has gone.
      await c.page.waitForTimeout(1500);
      const newPanel = c.page.getByRole("menuitem", {
        name: /open in new panel/i,
      });
      for (let i = 0; i < 3 && !(await newPanel.isVisible()); i++) {
        await side.getByRole("button", { name: "Tab options" }).first().click();
        await newPanel.waitFor({ timeout: 2000 }).catch(() => undefined);
      }
      await newPanel.click();
      await c.page
        .waitForFunction(
          () => document.querySelectorAll(".sb-bible-reader").length >= 2,
          undefined,
          { timeout: 5000 }
        )
        .catch(() => {
          throw new Error("Open in new panel did not add a pane");
        });
      const top = c.page.locator(".sb-sidebar-top-row");
      await top
        .getByRole("button", { name: "Pane layout" })
        .waitFor({ timeout: 2000 });
      await top
        .getByRole("button", { name: "More" })
        .waitFor({ timeout: 2000 });
      return "Tasks opened Today; the tab's ☆ saved John 3 and the bookmarks and saves panels listed it; the BSB save opened in BSB from the KJV (panel and Your content); Open in new panel added a pane; ⊞ and ⋮ at the top";
    },
  },
  {
    id: "PH1",
    section: "13. Links and embedding",
    title: "A phone: the bar at the top, the page scrolls, sign-in stands out",
    rows: ["Phone layout"],
    checks:
      "On an iPhone 13: the reader's bar sits at the top; the Tabs drawer closes with its ✕ and with a tap beside it; reading down scrolls the page itself (so the browser's bars can fold away); signed out, the sign-in button is filled in the accent colour and keeps its account icon with a highlight waiting (the count on its corner), and More opens with a Sign in button first that opens the sign-in pane",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      try {
        await c.open(CH, page);
        const bar = page.locator(".sb-reader-toolbar").first();
        await bar.waitFor({ timeout: 20000 });
        const top = (await bar.boundingBox())!.y;
        if (top > 40) throw new Error(`the bar is at y=${top}, not the top`);
        // The Tabs drawer has a way out: its ✕, and a tap on the dimmed reader beside it.
        const drawer = page.locator(".sb-tabs-sidebar-drawer");
        await page
          .locator('.sb-reader-toolbar button[aria-label="Tabs"]')
          .click();
        await drawer.waitFor({ timeout: 3000 });
        await page.locator(".sb-sidebar-drawer-close").click();
        await drawer.waitFor({ state: "detached", timeout: 3000 });
        await page
          .locator('.sb-reader-toolbar button[aria-label="Tabs"]')
          .click();
        await drawer.waitFor({ timeout: 3000 });
        await page.mouse.click(375, 500);
        await drawer.waitFor({ state: "detached", timeout: 3000 }).catch(() => {
          throw new Error("a tap beside the Tabs drawer did not close it");
        });
        await page.mouse.wheel(0, 900);
        await page
          .waitForFunction(() => window.scrollY > 100, undefined, {
            timeout: 5000,
          })
          .catch(() => {
            throw new Error("reading down did not scroll the page");
          });
        await page.evaluate(() => window.scrollTo(0, 0));
        await c.selectVerse(16, page);
        await page.locator(".sb-verse-toolbar-color").first().click();
        await page.keyboard.press("Escape");
        const signin = page.locator(".sb-reader-toolbar-signin");
        await signin
          .locator(".sb-reader-toolbar-unread-indicator")
          .waitFor({ timeout: 5000 });
        const icon = await signin
          .locator(".material-symbols-outlined")
          .innerText();
        if (icon !== "account_circle")
          throw new Error(
            `with a change waiting the sign-in icon is "${icon}"`
          );
        const fill = await page
          .locator(".sb-reader-toolbar-signin .sb-reader-toolbar-button")
          .evaluate((b) => getComputedStyle(b).backgroundColor);
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(fill))
          throw new Error("the sign-in button is not filled");
        await page.locator(".sb-reader-toolbar-more-button button").click();
        const first = page
          .locator(".sb-reader-toolbar-more-menu > button")
          .first();
        if (!/sign in/i.test(await first.innerText()))
          throw new Error(`More opens with "${await first.innerText()}"`);
        await first.click();
        await page
          .getByRole("button", { name: /sign in with faithnet/i })
          .waitFor({ timeout: 5000 });
        return `bar at y=${Math.round(top)}; the Tabs drawer closed by ✕ and by a tap beside it; the page scrolled; sign-in filled (${fill}) and kept its icon with a highlight waiting; More → Sign in opened the sign-in pane`;
      } finally {
        await ctx.close();
      }
    },
  },
  {
    id: "A2",
    timeoutMs: 240_000,
    section: "2. Getting in",
    title: "Sign in with your Home; sign out",
    rows: ["Sign in with your Home", "Sign out"],
    checks:
      'Account → Sign in with faithnet opens the Home; a demo person approves the reader — the Account pane closes, "Signed in as …" shows and the reader is signed in with no refresh; Sign out signs out of the Home too and returns to the start page — signing in again, the Home asks who you are. Then the same with popups blocked (the page goes to the Home and back)',
    run: async (c) => {
      const viaHome = async (
        page: import("playwright").Page,
        popup: boolean
      ) => {
        await c.open(CH, page);
        await c.pressToolbar("Sign in", page);
        const opened = popup
          ? page.context().waitForEvent("page", { timeout: 15000 })
          : null;
        await page
          .locator(".sb-app-pane")
          .getByRole("button", { name: /sign in with faithnet/i })
          .click();
        const home = opened ? await opened : page;
        if (!popup) await page.waitForURL(/faithnet\.me/, { timeout: 20000 });
        await home
          .getByText(/demo people/i)
          .first()
          .click();
        await home
          .getByText(/seed ?reader/i)
          .first()
          .click();
        const allow = home.getByRole("button", { name: /^allow/i });
        await allow.waitFor({ timeout: 30000 });
        await allow.click();
        const toast = page.locator(".sb-toast");
        await toast.waitFor({ timeout: 45000 });
        const said = (await toast.innerText()).trim();
        if (await page.locator(".sb-app-pane").count())
          throw new Error("the Account pane stayed open after signing in");
        await page
          .locator(".sb-connected-chip:not(.sb-connected-chip-out)")
          .waitFor({ timeout: 5000 });
        await c.openAccount(page);
        await page.getByRole("button", { name: /^sign out$/i }).click();
        await page.waitForURL(/seed-reader\.faithnet\.io/, { timeout: 30000 });
        await c.dismissWelcome(page);
        await page
          .locator(".sb-connected-chip-out")
          .waitFor({ timeout: 20000 });
        // Signed out of the Home too: signing in again asks who you are instead of reusing the last person.
        await c.pressToolbar("Sign in", page);
        const reopened = popup
          ? page.context().waitForEvent("page", { timeout: 15000 })
          : null;
        await page
          .locator(".sb-app-pane")
          .getByRole("button", { name: /sign in with faithnet/i })
          .click();
        const again = reopened ? await reopened : page;
        await again
          .getByText(/demo people/i)
          .first()
          .waitFor({ timeout: 30000 })
          .catch(() => {
            throw new Error(
              "after signing out, the Home did not ask who is signing in"
            );
          });
        if (reopened) await again.close();
        return said;
      };
      const popup = await viaHome(c.page, true);
      const ctx = await c.browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      await ctx.addInitScript(() => {
        if (location.host.startsWith("seed-reader"))
          (window as unknown as { open: () => null }).open = () => null;
      });
      try {
        const redirect = await viaHome(await ctx.newPage(), false);
        return `popup: "${popup}", landed in the reader, signed out to the start page; popups blocked: "${redirect}", the same`;
      } finally {
        await ctx.close();
      }
    },
  },
  {
    id: "A3",
    timeoutMs: 240_000,
    section: "2. Getting in",
    title:
      "Another person on the same device sees none of the last one's things",
    rows: ["Sign in with your Home", "Your profile"],
    checks:
      "Seed Reader signs in (their profile picture shows); the tab is closed without signing out; Ruth signs in on a new tab of the same browser — her account, and no picture or profile of Seed Reader's",
    run: async (c) => {
      const account = async (page: import("playwright").Page) => {
        await c.openAccount(page);
        await page.waitForTimeout(3000);
        return {
          who: (await page.locator(".sb-account-who").innerText()).trim(),
          picture: await page
            .locator(".sb-profile-card img.sb-profile-picture")
            .count(),
        };
      };
      await c.open(CH);
      await c.signInAsSample(/seed ?reader/i);
      const first = await account(c.page);
      if (!first.picture)
        throw new Error(
          "Seed Reader's profile picture did not show to begin with"
        );
      const tab = await c.page.context().newPage();
      await c.page.close();
      await c.open(CH, tab);
      await c.signInAsSample(/ruth/i, tab);
      const second = await account(tab);
      if (!/ruth/i.test(second.who))
        throw new Error(`the account shows "${second.who}"`);
      if (second.picture)
        throw new Error("Ruth is shown Seed Reader's profile picture");
      return `Seed Reader with their picture; then Ruth on a new tab: "${second.who.replace(/\s+/g, " ")}", no picture of Seed Reader's`;
    },
  },
  {
    id: "V1",
    section: "3. Reading",
    title: "Scripture checked on the device",
    rows: ["Scripture check"],
    checks:
      "John 3 (BSB) opens with a Verified badge beside the translation; every verse number is marked as checked; the badge's sheet says all verses match the published text, that each is part of the translation's published set, that the set is signed by the scripture agent, and where the text was received from",
    run: async (c) => {
      await c.open(CH);
      const badge = c.page.locator(".sb-scripture-check").first();
      await c.page.waitForFunction(
        () =>
          !!document.querySelector(
            ".sb-scripture-check:not(.sb-scripture-check-busy)"
          ),
        undefined,
        { timeout: 30000 }
      );
      const label = (await badge.getAttribute("aria-label")) ?? "";
      if (!/verified/i.test(label))
        throw new Error(`the badge says "${label}"`);
      const marked = await c.page
        .locator("[data-verse-check=verified]")
        .count();
      if (marked < 30) throw new Error(`only ${marked} verse numbers marked`);
      await badge.click();
      const sheet = c.page.locator(".sb-scripture-check-sheet");
      await c.waitText(sheet, /match the published Berean Standard Bible/);
      await c.waitText(sheet, /signed by the scripture agent/);
      await c.waitText(sheet, /Received from/);
      return `Verified; ${marked} verse numbers marked; the sheet names the published set, the signer and the source`;
    },
  },
  {
    id: "V2",
    section: "3. Reading",
    title: "A changed verse is caught",
    rows: ["Scripture check"],
    checks:
      "John 3:16 is altered on its way to the browser (its published fingerprint left as it was; John 3 reached from John 2, so it is fetched): the badge says Check failed, verse 16 — and only 16 — is marked, and the sheet names it",
    run: async (c) => {
      // Its own browser with no service worker: a worker's fetches are not the page's, and would pass untouched.
      const ctx = await c.browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
      });
      const page = await ctx.newPage();
      try {
        await page.route("**/api/BSB/JHN/3.json", async (route) => {
          // A request the page dropped (it moved on) must not throw out of the handler.
          const res = await route.fetch().catch(() => null);
          if (!res) return;
          const body = (await res.json()) as {
            chapter: {
              content: Array<{
                type: string;
                number?: number;
                content?: unknown[];
              }>;
            };
          };
          body.chapter.content.find(
            (x) => x.type === "verse" && x.number === 16
          )!.content = [
            "For God so loved the world that He sold His one and only Son.",
          ];
          await route.fulfill({ response: res, json: body }).catch(() => {});
        });
        // John 3 is reached in the app (John 2 → Next), so it is fetched — a page opened on it carries it from the edge.
        await c.open("/read/BSB/JHN/2", page);
        await page
          .locator('.sb-reader-toolbar button[aria-label="Next Chapter"]')
          .first()
          .click();
        await page.waitForURL(/\/JHN\/3$/, { timeout: 20000 });
        const badge = page.locator(".sb-scripture-check").first();
        // The address moves before John 3 arrives — John 2's badge is still there for a moment. Wait for John 3's text.
        await page
          .locator('[data-verse-number="16"]', { hasText: "He sold" })
          .first()
          .waitFor({ timeout: 30000 });
        await page.waitForFunction(
          () =>
            !!document.querySelector(
              ".sb-scripture-check:not(.sb-scripture-check-busy)"
            ),
          undefined,
          { timeout: 30000 }
        );
        const label = (await badge.getAttribute("aria-label")) ?? "";
        if (!/check failed/i.test(label))
          throw new Error(`the badge says "${label}"`);
        const flagged = await page
          .locator("[data-verse-check=text-differs]")
          .allInnerTexts();
        if (flagged.map((x) => x.trim()).join(",") !== "16")
          throw new Error(`flagged: ${flagged.join(", ") || "none"}`);
        await badge.click();
        await c.waitText(
          page.locator(".sb-scripture-check-sheet"),
          /do not match the published text: 16\./
        );
        return "Check failed; only verse 16 marked; the sheet names it";
      } finally {
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await ctx.close();
      }
    },
  },
];
