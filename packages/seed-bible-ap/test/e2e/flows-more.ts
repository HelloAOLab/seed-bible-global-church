// THE REST OF THE MANUAL'S ROWS — reading settings, notes in depth, publishing, live sessions in depth, playlists and
// plans, church themes, the extensions, links and first visit. Signed-in flows use the Home's sample person Seed
// Reader and tidy up after themselves (what they publish is withdrawn, what they make is deleted). Rows that need
// two Homes that are friends with each other are skipped with the reason: the sample people have no friends.
import { chromium, firefox, type Page } from "playwright";
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
    await card.locator(".sb-note-card-ref, .sb-rp-card-open").first().click();
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
  await c.page
    .locator(".sb-note-card:not(.sb-note-card-draft)", {
      hasText: text.slice(0, 20),
    })
    .first()
    .waitFor({ timeout: 15000 });
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
    const card = c.page.locator(".sb-notes-pane .sb-annotation-item").first();
    if (!(await card.count())) return;
    await c.noteAction(card, /^delete$/i);
    await c.page.waitForTimeout(400);
  }
}

/** Back to a chapter and delete its notes (a flow that left it). */
async function deleteAllNotesOn(c: FlowContext, path: string) {
  await c.open(path);
  await deleteAllNotes(c);
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

/** The call bar's chip for a name, and whether it is lit (its person talking). */
async function chipTalking(
  page: import("playwright").Page,
  name: RegExp,
  want: boolean,
  timeout = 15000
) {
  const chip = page
    .locator(".sb-huddle-bar .sb-huddle-chip", { hasText: name })
    .first();
  await chip.waitFor({ timeout });
  const t0 = Date.now();
  for (;;) {
    if (((await chip.getAttribute("data-talking")) === "true") === want) return;
    if (Date.now() - t0 > timeout)
      throw new Error(
        `the chip for ${name} ${want ? "never lit" : "stayed lit"}`
      );
    await page.waitForTimeout(200);
  }
}

export const MORE_FLOWS: Flow[] = [
  {
    id: "HC1",
    section: "4. Marking the text",
    title: "Twelve highlight colours and colours of your own",
    rows: ["Highlight (6 colours)"],
    checks:
      "Highlight shows the old reader's twelve colours and a + for a colour of your own. Cyan highlights John 3:16; a colour chosen with + highlights 3:14 in exactly that colour and joins the picker after the twelve; right-click takes it away again; both highlights clear",
    run: async (c) => {
      await c.open(CH);
      await c.selectVerse(16);
      await c.page.locator(".sb-verse-toolbar-highlight-trigger").click();
      const swatches = c.page.locator(
        ".sb-verse-toolbar-swatches > button.sb-verse-toolbar-color-button"
      );
      const n = await swatches.count();
      if (n !== 12) throw new Error(`${n} colours in the picker`);
      await c.page.getByRole("button", { name: "Highlight cyan" }).click();
      const cyan = c.page.locator(".sb-bible-reader-active .sb-highlight-cyan");
      await cyan.first().waitFor({ timeout: 5000 });
      await c.selectVerse(14);
      await c.page.locator(".sb-verse-toolbar-highlight-trigger").click();
      await c.page
        .locator('.sb-verse-toolbar input[type="color"]')
        .fill("#2a6fdb");
      const mine = c.page.locator(
        '.sb-bible-reader-active [data-highlight-custom="#2a6fdb"]'
      );
      await mine.first().waitFor({ timeout: 5000 });
      await c.selectVerse(14);
      await c.page.locator(".sb-verse-toolbar-highlight-trigger").click();
      const own = c.page.getByRole("button", { name: "Highlight #2a6fdb" });
      await own.waitFor({ timeout: 3000 });
      if ((await own.getAttribute("aria-pressed")) !== "true")
        throw new Error("the picker does not show 3:14's own colour as chosen");
      await own.click({ button: "right" });
      await own.waitFor({ state: "detached", timeout: 3000 });
      await c.page.locator(".sb-verse-toolbar-clear").click();
      await mine.first().waitFor({ state: "detached", timeout: 5000 });
      await c.selectVerse(16);
      await c.clearHighlight();
      await cyan.first().waitFor({ state: "detached", timeout: 5000 });
      return "twelve colours and a +; cyan on 3:16; #2a6fdb on 3:14 and in the picker; right-click removed it; both cleared";
    },
  },
  {
    id: "PS1",
    section: "9. Reading together",
    title: "Where everyone is in the text; connection notices",
    rows: ["Where everyone is"],
    checks:
      "Signed in, the host starts a session and a guest joins. The guest reads further down John 3: on the host's screen a bar in the guest's colour runs beside the verses on the guest's screen, with the guest's initials at its top. When the host leaves the page, the guest is told 'The host disconnected'",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const { code, sid } = await startSession(c);
      const guest = await joinAsGuest(c, sid, code);
      await guest.keyboard.press("Escape");
      await c.page.keyboard.press("Escape");
      await guest.evaluate(() =>
        document
          .querySelector('.sb-bible-reader-active [data-verse-number="16"]')
          ?.scrollIntoView({ block: "center" })
      );
      const bar = c.page
        .locator('.sb-presence-marker[data-agent^="guest:"]')
        .first();
      await bar.waitFor({ timeout: 20000 });
      // The bar moves once the guest's scrolling rests and their verses reach this screen.
      await c.page
        .waitForFunction(
          () => {
            const m = document
              .querySelector<HTMLElement>(
                '.sb-presence-marker[data-agent^="guest:"]'
              )
              ?.getBoundingClientRect();
            const v = document
              .querySelector('.sb-bible-reader-active [data-verse-number="16"]')
              ?.getBoundingClientRect();
            return !!m && !!v && m.top <= v.top + 2 && m.bottom >= v.top;
          },
          undefined,
          { timeout: 15000 }
        )
        .catch(() => {
          throw new Error("the guest's bar does not run beside John 3:16");
        });
      const initials = (
        await c.page.locator(".sb-presence-initials").first().innerText()
      ).trim();
      if (initials !== "FG")
        throw new Error(`the guest's avatar reads "${initials}"`);
      await c.page.goto("about:blank");
      await c.waitText(guest.locator(".sb-toast"), /host disconnected/i, 20000);
      return `the guest's bar ran beside John 3:16 with "${initials}" at its top; the guest was told the host disconnected`;
    },
  },
  {
    id: "SS1",
    section: "9. Reading together",
    title: "Session settings",
    rows: ["Live session settings"],
    checks:
      "The host starts a session and a guest joins. Session settings shows the session's link, Navigation and Sharing, and the participants with a Host badge. By default the guest's › moves the host too; with 'Only host can navigate' ticked the guest's › moves only the guest. A verse the host taps flares on the guest's screen. The host's End Session ends it for the guest",
    run: async (c) => {
      let step = "";
      try {
        step = "start and join";
        await c.open(CH);
        await c.signInAsSample();
        const { code, sid } = await startSession(c);
        const guest = await joinAsGuest(c, sid, code);
        await guest.keyboard.press("Escape");

        step = "the settings window";
        await c
          .pane()
          .getByRole("button", { name: /session settings/i })
          .click();
        const win = c.page.getByRole("dialog", { name: "Session settings" });
        await win.waitFor({ timeout: 5000 });
        await c.waitText(
          win,
          /session url[\s\S]*navigation[\s\S]*sharing[\s\S]*participants/i,
          5000
        );
        await c.waitText(
          win.locator(".sb-session-participants"),
          /host[\s\S]*flow guest/i,
          10000
        );
        if (!(await win.locator("#sb-session-share-translation").isEnabled()))
          throw new Error("the host cannot change the settings");

        step = "everyone navigates by default";
        await win
          .getByRole("button", { name: /^close$/i })
          .last()
          .click();
        await guest.keyboard.press("ArrowRight");
        await c.page.waitForURL(/\/JHN\/4/, { timeout: 15000 }).catch(() => {
          throw new Error(
            `the guest moved; the host stayed at ${c.page.url()}`
          );
        });

        step = "only the host navigates";
        await c
          .pane()
          .getByRole("button", { name: /session settings/i })
          .click();
        await win.locator("#sb-session-only-host-navigate").check();
        await win
          .getByRole("button", { name: /^close$/i })
          .last()
          .click();
        await guest.waitForTimeout(800);
        await guest.keyboard.press("ArrowRight");
        await guest.waitForURL(/\/JHN\/5/, { timeout: 15000 });
        await c.page.waitForTimeout(2000);
        if (!/\/JHN\/4/.test(c.page.url()))
          throw new Error(`the host was moved to ${c.page.url()}`);

        step = "the host's tap flares for the guest";
        await c.page.keyboard.press("ArrowRight");
        await guest.waitForURL(/\/JHN\/5/, { timeout: 15000 });
        await c.page.waitForURL(/\/JHN\/5/, { timeout: 15000 });
        await c.page.waitForTimeout(800);
        await c.tapVerse(3);
        await guest
          .locator(
            '.sb-bible-reader-active .sb-verse-number[data-flare="true"]'
          )
          .first()
          .waitFor({ state: "attached", timeout: 10000 });

        step = "End Session";
        await c.page.keyboard.press("Escape");
        await c
          .pane()
          .getByRole("button", { name: /session settings/i })
          .click();
        await win.getByRole("button", { name: /end session/i }).click();
        await c.pressToolbar("Live session", guest);
        await c.waitText(
          guest.locator(".sb-app-pane"),
          /start a session|join a session|session id/i,
          20000
        );
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "link, settings and participants shown; the guest moved the host by default and not after Only host can navigate; the host's tap flared on the guest's screen; End Session ended it";
    },
  },
  {
    id: "CH1",
    section: "9. Reading together",
    title: "The chat panel",
    rows: ["Chat"],
    checks:
      "The host starts a session; the bar gains Chat, which opens the old reader's chat panel listing Session chat and Study companion. A guest joins: the host's chat says 'Flow guest joined'. The guest types @ and picks the host from the list, adds 'see John 3:16': the host sees 'Flow guest is typing...', then the line with their @name marked and John 3:16 as a link, which opens John 3 with verse 16 chosen. With the chat closed, '@everyone hello' puts @ on the host's Chat button; opening the chat clears it",
    run: async (c) => {
      let step = "";
      try {
        step = "start";
        await c.open(CH);
        await c.signInAsSample();
        const { code, sid } = await startSession(c);
        await c.page.keyboard.press("Escape");
        const chatButton = c.page
          .locator('.sb-reader-toolbar-desk button[aria-label="Chat"]')
          .first();
        await chatButton.click();
        const panel = c.page.locator(".sb-floating-chat-panel");
        step = "the chat list";
        await c.waitText(panel, /session chat[\s\S]*study companion/i, 5000);
        await panel
          .locator(".sb-floating-chat-list-item", { hasText: /session chat/i })
          .click();
        await c.waitText(panel, /start a conversation/i, 5000);

        step = "a guest joins";
        const guest = await joinAsGuest(c, sid, code);
        await c.waitText(panel, /flow guest joined/i, 20000);

        step = "the guest mentions the host";
        await guest
          .locator(".sb-app-pane")
          .getByRole("button", { name: /open chat/i })
          .click();
        const gpanel = guest.locator(".sb-floating-chat-panel");
        const input = gpanel.locator(".sb-chat-view-input");
        await input.click();
        await input.pressSequentially("@Se", { delay: 60 });
        await gpanel
          .locator(".sb-chat-view-mention-picker-item", {
            hasText: /seed reader/i,
          })
          .first()
          .click();
        await input.pressSequentially("see John 3:16", { delay: 60 });
        await c.waitText(panel, /flow guest is typing/i, 10000);
        await input.press("Enter");

        step = "the host sees it";
        const line = panel.locator(".sb-chat-view-message", {
          hasText: /see John 3:16/,
        });
        await line.waitFor({ timeout: 15000 }).catch(async () => {
          throw new Error(
            `host: ${(await panel.innerText()).replace(/\s+/g, " ").slice(-200)} | guest: ${(await gpanel.innerText()).replace(/\s+/g, " ").slice(-200)}`
          );
        });
        await line
          .locator(".sb-chat-mention-self", { hasText: /@seed reader/i })
          .waitFor({ timeout: 3000 });
        await line.locator(".sb-verse-reference-link").click();
        await c.page
          .locator(
            '.sb-bible-reader-active [data-verse-number="16"].sb-verse-selected, .sb-bible-reader-active .sb-verse-selected[data-verse-number="16"]'
          )
          .first()
          .waitFor({ state: "attached", timeout: 10000 })
          .catch(async () => {
            if (!(await c.page.locator(".sb-verse-toolbar").count()))
              throw new Error("the link did not choose John 3:16");
          });

        step = "unread @";
        await panel.getByRole("button", { name: /^close$/i }).click();
        await panel.waitFor({ state: "detached", timeout: 3000 });
        await input.fill("@everyone hello");
        await input.press("Enter");
        await c.waitText(
          c.page.locator(
            ".sb-reader-toolbar-desk .sb-reader-toolbar-unread-indicator"
          ),
          /^@$/,
          15000
        );
        await chatButton.click();
        await c.page
          .locator(
            ".sb-reader-toolbar-desk .sb-reader-toolbar-unread-indicator"
          )
          .waitFor({ state: "detached", timeout: 5000 });
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "Chat listed Session chat and Study companion; the join, typing, the @mention, the John 3:16 link and the @ badge all worked";
    },
  },
  {
    id: "SH1",
    section: "9. Reading together",
    title: "The session's Shared tab",
    rows: ["Live session settings"],
    checks:
      "The host starts a session in John 3 and a guest joins: that tab is marked Shared with the people on it (Host first); its ⋮ has Session settings, Share session and Open chat instead of Save. A new tab moved to Romans 8 does not move the session (the guest stays in John 3). Closing the Shared tab from its ⋮ ends the session for the guest",
    run: async (c) => {
      let step = "";
      try {
        step = "start and join";
        await c.open(CH);
        await c.signInAsSample();
        const { code, sid } = await startSession(c);
        const guest = await joinAsGuest(c, sid, code);
        await c.page.keyboard.press("Escape");
        const side = c.page.locator(".sb-tabs-sidebar");
        const sharedTab = side.locator('.sb-tab-row[data-shared="true"]');
        step = "the Shared tab";
        await sharedTab.waitFor({ timeout: 10000 });
        await c.waitText(sharedTab, /shared[\s\S]*host/i, 15000);
        await sharedTab
          .locator(".sb-tab-user")
          .nth(1)
          .waitFor({ timeout: 15000 });
        await sharedTab.getByRole("button", { name: "Tab options" }).click();
        const menu = c.page.locator(".sb-context-menu");
        await c.waitText(
          menu,
          /session settings[\s\S]*share session[\s\S]*open chat/i,
          3000
        );
        if (/save chapter/i.test(await menu.innerText()))
          throw new Error("the Shared tab still offers Save chapter");
        await c.page.keyboard.press("Escape");

        step = "another tab does not move the session";
        await side.getByRole("button", { name: "New tab" }).first().click();
        await c.page.waitForTimeout(1200);
        await c.page.keyboard.press("ArrowRight");
        await c.page.waitForURL(/\/JHN\/4/, { timeout: 15000 });
        await guest.waitForTimeout(2500);
        if (!/\/JHN\/3/.test(guest.url()))
          throw new Error(`the guest was moved to ${guest.url()}`);

        step = "closing the Shared tab ends it";
        await sharedTab
          .getByRole("button", { name: "Tab options" })
          .click({ timeout: 8000 })
          .catch(async (e: Error) => {
            throw new Error(
              `${e.message
                .split("\n")
                .filter((l) => /intercepts|waiting for/.test(l))
                .slice(-2)
                .join(
                  " / "
                )} | dialogs: ${(await c.page.locator("[role=dialog]").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").slice(0, 60)).join(" / ")}`
            );
          });
        await c.page.getByRole("menuitem", { name: /^close$/i }).click();
        if (!(await guest.locator(".sb-app-pane").isVisible()))
          await c.pressToolbar("Live session", guest);
        await c.waitText(
          guest.locator(".sb-app-pane"),
          /start a session|join a session|session id/i,
          20000
        );
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "the session's tab showed Shared with its people and the session menu; another tab left the guest in John 3; closing the tab ended it";
    },
  },
  {
    id: "SP1",
    section: "9. Reading together",
    title: "Start and share a session from Share",
    rows: ["Start a session"],
    checks:
      "Signed in, the chapter's Share → Start and share session starts one and copies its link (with the session and its code); Share again offers Share current session and the session's QR card; tapping the code opens a large Scan to join view",
    run: async (c) => {
      let step = "";
      try {
        await c.open(CH);
        await c.signInAsSample();
        const head = c.page.locator(
          ".sb-bible-reader-active .sb-bible-reader-header"
        );
        const dialog = c.page.locator(".sb-share-dialog");
        step = "Start and share session";
        await head.getByRole("button", { name: "Share" }).click();
        await dialog
          .getByRole("button", { name: /start and share session/i })
          .click();
        await dialog.waitFor({ state: "detached", timeout: 20000 });
        await c.waitText(c.page.locator(".sb-toast"), /link to join/i, 10000);
        const clip = await c.page
          .evaluate(() => navigator.clipboard.readText())
          .catch(() => "");
        if (!/[?&]session=[^&]+&code=\w+/.test(clip))
          throw new Error(`clipboard: ${clip}`);
        step = "Share current session";
        await head.getByRole("button", { name: "Share" }).click();
        await dialog
          .getByRole("button", { name: /share current session/i })
          .waitFor({ timeout: 5000 });
        await dialog
          .getByRole("button", { name: /show a larger qr code/i })
          .click();
        const big = c.page.getByRole("dialog", { name: "Scan to join" });
        await big.locator("img").waitFor({ timeout: 5000 });
        await c.page.keyboard.press("Escape");
        await big.waitFor({ state: "detached", timeout: 3000 });
        await c.page.keyboard.press("Escape");
        await c.pressToolbar("Live session");
        await c
          .pane()
          .getByRole("button", { name: /end session/i })
          .click();
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "Share started a session and copied its link; Share again offered Share current session and the QR, whose large view opened";
    },
  },
  {
    id: "PP1",
    section: "9. Reading together",
    title: "Who is here, on a phone",
    rows: ["Who is here, and where"],
    checks:
      "The host starts a session on a computer; a guest joins on a phone: the chapter's top bar shows a stack of faces (2 people); a tap opens the Participants sheet with the host marked Host and the guest marked (you), and its Session settings opens the settings window",
    run: async (c) => {
      let step = "";
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
      });
      try {
        step = "start";
        await c.open(CH);
        await c.signInAsSample();
        const { code, sid } = await startSession(c);
        step = "the guest on a phone";
        const page = await ctx.newPage();
        c.watch(page);
        await c.open(`${CH}?session=${sid}&code=${code}`, page);
        const join = page.locator(".sb-session-join").first();
        await join.waitFor({ timeout: 15000 });
        await join
          .locator('input[placeholder*="name" i]')
          .first()
          .fill("Phone guest")
          .catch(() => undefined);
        await join.getByRole("button", { name: /join as a guest/i }).tap();
        await c.waitText(page.locator(".sb-app-pane"), /connected/i, 20000);
        await page.keyboard.press("Escape");
        step = "the stack";
        const stack = page
          .locator(
            ".sb-bible-reader-active .sb-bible-reader-mobile-header .sb-session-participants-stack"
          )
          .first();
        await stack.waitFor({ timeout: 15000 });
        const faces = await stack
          .locator(".sb-session-participants-stack-item")
          .count();
        if (faces !== 2) throw new Error(`${faces} faces in the stack`);
        step = "the sheet";
        await stack.tap();
        const sheet = page.getByRole("dialog", { name: "Participants" });
        await c.waitText(
          sheet,
          /host[\s\S]*seed reader|seed reader[\s\S]*host/i,
          5000
        );
        await c.waitText(sheet, /phone guest \(you\)/i, 5000);
        await sheet.getByRole("button", { name: /session settings/i }).tap();
        await page
          .getByRole("dialog", { name: "Session settings" })
          .waitFor({ timeout: 5000 });
        await c.page.keyboard.press("Escape");
        await c.pressToolbar("Live session");
        await c
          .pane()
          .getByRole("button", { name: /end session/i })
          .click();
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await ctx.close();
      }
      return "the phone's top bar showed 2 faces; the sheet named the Host and the guest (you); Session settings opened";
    },
  },
  {
    id: "DS1",
    section: "3. Reading",
    title: "The old reader's display choices",
    rows: ["Margins, line height, UI scale, custom fonts"],
    checks:
      "Settings → Display & Theme: text size XXL, line height Loose (2.5), interface Extra large (125%); Book order Tanakh puts Isaiah right after 2 Kings in the book picker; Show discovered content off takes the Discover card away; Verse selection effects offers Default, Enabled, Disabled",
    run: async (c) => {
      let step = "";
      try {
        await c.open(CH);
        const side = c.page.locator(".sb-tabs-sidebar");
        await side.getByRole("button", { name: "Open settings" }).click();
        await side.getByText("Display & Theme").click();
        const select = (label: string) =>
          side.locator("label", { hasText: label }).locator("select").first();
        step = "XXL";
        await select("A").selectOption("xxl");
        await c.page
          .locator(".sb-bible-reader-active.sb-font-size-xxl")
          .waitFor({ timeout: 5000 });
        step = "Loose";
        await select("Line height").selectOption("loose");
        const lh = await c.page
          .locator(".sb-bible-reader-active")
          .evaluate((e) => getComputedStyle(e).lineHeight);
        const fs = await c.page
          .locator(".sb-bible-reader-active")
          .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
        if (Math.abs(parseFloat(lh) / fs - 2.5) > 0.05)
          throw new Error(`line height ${lh} at ${fs}px`);
        step = "Extra large";
        await select("Interface size").selectOption("xl");
        const root = await c.page.evaluate(
          () => getComputedStyle(document.documentElement).fontSize
        );
        if (root !== "20px") throw new Error(`the interface is ${root}`);
        await select("Interface size").selectOption("m");
        step = "Tanakh";
        await select("Book order").selectOption("tanakh");
        await c.page
          .locator(".sb-bible-reader-active .sb-bible-reader-title")
          .click();
        await c.page
          .locator(".sb-selector-book-name")
          .first()
          .waitFor({ timeout: 10000 });
        const flat = (
          await c.page.locator(".sb-selector-book-name").allInnerTexts()
        ).map((n) => n.trim());
        const k = flat.findIndex((n) => /^2 Kings$/.test(n));
        if (k < 0 || !/^Isaiah$/.test(flat[k + 1] ?? ""))
          throw new Error(`after 2 Kings: ${flat.slice(k, k + 3).join(", ")}`);
        await c.page.keyboard.press("Escape");
        await select("Book order").selectOption("traditional");
        step = "Show discovered content";
        await c.page
          .locator(".sb-discover-content-panel")
          .first()
          .waitFor({ timeout: 15000 });
        await side
          .locator("label", { hasText: "Show discovered content" })
          .locator("input")
          .uncheck();
        await c.page
          .locator(".sb-discover-content-panel")
          .waitFor({ state: "detached", timeout: 5000 });
        await side
          .locator("label", { hasText: "Show discovered content" })
          .locator("input")
          .check();
        step = "Verse selection effects";
        const opts = await select("Verse selection effects")
          .locator("option")
          .allInnerTexts();
        if (opts.join() !== "Default,Enabled,Disabled")
          throw new Error(`effects: ${opts.join(", ")}`);
        await select("A").selectOption("m");
        await select("Line height").selectOption("normal");
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "XXL, Loose and Extra large applied; Tanakh order put Isaiah after 2 Kings; the Discover card hid and came back; the effects choice is there";
    },
  },
  {
    id: "SI1",
    section: "2. Getting in",
    title: "Sign-in asks for the terms",
    rows: ["Sign in with your Home"],
    checks:
      "Today says why to sign in with a Log in button, which opens sign-in; there, signing in without ticking 'I agree to the Terms of service' says 'Please agree to the terms of service to continue.'; under it Privacy policy, Code of conduct and Terms of service open those pages; the old ?privacy=open link opens the privacy policy",
    run: async (c) => {
      let step = "";
      try {
        step = "Today's Log in";
        await c.open(CH);
        await c.pressToolbar("Today");
        await c
          .pane()
          .getByRole("button", { name: /^log in$/i })
          .click();
        const pane = c.pane();
        await pane.locator("#sb-login-terms").waitFor({ timeout: 5000 });
        step = "the terms";
        const details = pane.locator("details").first();
        await details.waitFor({ timeout: 15000 });
        if (!(await details.getAttribute("open")))
          await details.locator("summary").click();
        await details.locator("button").first().click();
        await c.waitText(
          pane,
          /agree to the terms of service to continue/i,
          5000
        );
        if (await c.page.locator(".sb-sidebar-profile-button-in").count())
          throw new Error("signed in without agreeing");
        step = "the links";
        await pane
          .locator(".sb-login-legal")
          .getByText("Code of conduct")
          .click();
        await c.waitText(
          c.pane().locator(".sb-pane-header"),
          /code of conduct/i,
          5000
        );
        step = "?privacy=open";
        await c.open(`${CH}?privacy=open`);
        await c.waitText(
          c.pane().locator(".sb-pane-header"),
          /privacy policy/i,
          10000
        );
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "Today's Log in opened sign-in; it refused without the terms; Code of conduct and ?privacy=open opened those pages";
    },
  },
  {
    id: "MS1",
    section: "3. Reading",
    title: "The phone's Theme & text sheet",
    rows: ["Margins, line height, UI scale, custom fonts"],
    checks:
      "On an iPhone 13 the sliders in the chapter's top bar open the old reader's Theme & text sheet: the larger A makes the verses larger and the smaller A smaller; the line-spacing button cycles the spacing; UI size L, then M; Keep screen awake toggles; Go to all settings opens the Settings list in the drawer",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      c.watch(page);
      try {
        await c.open(CH, page);
        await page
          .getByRole("button", { name: "Text settings" })
          .filter({ visible: true })
          .first()
          .tap();
        const sheet = page.getByRole("dialog", { name: "Theme & text" });
        await sheet.waitFor({ timeout: 5000 });
        await c.settleTours(page);
        const fontClass = () =>
          page
            .locator(".sb-bible-reader-active")
            .first()
            .evaluate((n) => /sb-font-size-(\w+)/.exec(n.className)?.[1]);
        const before = await fontClass();
        await sheet
          .getByRole("button", { name: "Increase scripture font size" })
          .tap();
        const larger = await fontClass();
        await sheet
          .getByRole("button", { name: "Decrease scripture font size" })
          .tap();
        if (larger === before || (await fontClass()) !== before)
          throw new Error(
            `text size ${before} → ${larger} → ${await fontClass()}`
          );
        const lineOf = () =>
          page.evaluate(() => document.documentElement.dataset["sbLine"]);
        const l0 = await lineOf();
        await sheet.getByRole("button", { name: "Change line spacing" }).tap();
        const l1 = await lineOf();
        if (l1 === l0) throw new Error(`line spacing stayed ${l0}`);
        for (let i = 0; i < 3; i++)
          await sheet
            .getByRole("button", { name: "Change line spacing" })
            .tap();
        if ((await lineOf()) !== l0)
          throw new Error("four taps did not come back to the first spacing");
        await sheet.getByRole("button", { name: "L", exact: true }).tap();
        if (
          (await page.evaluate(
            () => document.documentElement.dataset["sbScale"]
          )) !== "l"
        )
          throw new Error("UI size L not applied");
        await sheet.getByRole("button", { name: "M", exact: true }).tap();
        const awake = sheet.getByLabel("Keep screen awake");
        const was = await awake.isChecked();
        await awake.tap();
        if ((await awake.isChecked()) === was)
          throw new Error("Keep screen awake did not toggle");
        await awake.tap();
        await sheet.getByRole("button", { name: "Go to all settings" }).tap();
        await page
          .locator(".sb-tabs-sidebar-drawer .sb-settings-nav-label")
          .first()
          .waitFor({ timeout: 5000 });
        return `text ${before} → ${larger} → ${before}; spacing ${l0} → ${l1} and back; UI size L then M; keep awake toggled; Go to all settings opened Settings`;
      } finally {
        await ctx.close();
      }
    },
  },
  {
    id: "VS1",
    section: "4. Marking the text",
    title: "The phone's verse sheet",
    rows: ["Highlight (6 colours)"],
    checks:
      "On an iPhone 13, tapping John 3:3 brings up the old reader's sheet along the bottom in place of the tabs: a handle, ✕, 'John 3:3' and four cards Highlight · Save · Note · Copy, with 'Swipe up to see more'. A tap on the handle shows Share and Compare; a swipe down closes the sheet and the tabs come back. Highlight turns it into the colour strip with ← and the eraser; a colour highlights the verse and closes the sheet",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      c.watch(page);
      try {
        await c.open(CH, page);
        const sheet = page.locator(".sb-verse-toolbar-mobile");
        const tap3 = async () => {
          await c.verse(3, page).locator(".sb-verse-number").first().tap();
          await sheet.waitFor({ timeout: 5000 });
          await c.settleTours(page);
        };
        await tap3();
        if (await page.locator(".sb-phone-nav").count())
          throw new Error("the tabs still show under the sheet");
        const cards = await sheet
          .locator(
            ".sb-verse-toolbar-cards > .sb-verse-toolbar-action-item .sb-verse-toolbar-action-label"
          )
          .allInnerTexts();
        if (cards.join() !== "Highlight,Save,Note,Copy")
          throw new Error(`cards: ${cards.join(", ")}`);
        if (
          (
            await sheet.locator(".sb-verse-toolbar-ref-text").innerText()
          ).trim() !== "John 3:3"
        )
          throw new Error("the sheet does not name John 3:3");
        await c.waitText(sheet, /swipe up to see more/i, 3000);
        await sheet.locator(".sb-verse-toolbar-handle-area").tap();
        await sheet
          .getByRole("button", { name: "Share" })
          .waitFor({ timeout: 3000 });
        await sheet
          .getByRole("button", { name: "Compare" })
          .waitFor({ timeout: 3000 });
        await sheet.locator(".sb-verse-toolbar-handle-area").tap();
        const box = (await sheet
          .locator(".sb-verse-toolbar-ref")
          .boundingBox())!;
        await page.mouse.move(195, box.y + 5);
        await page.mouse.down();
        await page.mouse.move(195, box.y + 220, { steps: 10 });
        await page.mouse.up();
        await sheet.waitFor({ state: "detached", timeout: 3000 }).catch(() => {
          throw new Error("a swipe down did not close the sheet");
        });
        await page.locator(".sb-phone-nav").waitFor({ timeout: 3000 });
        await tap3();
        await sheet.locator(".sb-verse-toolbar-highlight-trigger").tap();
        await sheet
          .locator(".sb-verse-toolbar-swatches")
          .waitFor({ timeout: 3000 });
        await sheet
          .getByRole("button", { name: "Back" })
          .waitFor({ timeout: 3000 });
        await sheet
          .locator(".sb-verse-toolbar-clear")
          .waitFor({ timeout: 3000 });
        await sheet.locator(".sb-verse-toolbar-color-button").first().tap();
        await sheet.waitFor({ state: "detached", timeout: 3000 });
        await page
          .locator(
            '.sb-bible-reader-active [data-verse-number="3"] [data-highlight-fill], .sb-bible-reader-active [data-highlight-fill]'
          )
          .first()
          .waitFor({ timeout: 5000 });
        // Leave the page as it was.
        await c.verse(3, page).locator(".sb-verse-number").first().tap();
        await c.clearHighlight(page);
        return `cards ${cards.join(" · ")} in place of the tabs; the handle showed Share and Compare; a swipe down closed it; Highlight → the strip with ← and the eraser; a colour highlighted 3:3`;
      } finally {
        await ctx.close();
      }
    },
  },
  {
    id: "TD1",
    section: "8. Today, Discover and publishing",
    title: "Today's Community card",
    rows: ["Today's community feed"],
    checks:
      "After John 3 stays open a while, Today shows the COMMUNITY card with All · Notes · Reading and History: 'You read John 3' under All and Reading, none under Notes ('No notes in this time frame yet.'); History lists today with John 3; tapping John 3 opens it",
    run: async (c) => {
      await c.open(CH);
      await c.page.waitForTimeout(10_000);
      await c.pressToolbar("Today");
      const card = c.page.locator(".sb-today-community");
      await card.waitFor({ timeout: 10000 });
      const chips = (
        await card.locator(".sb-today-feed-kind-option").allInnerTexts()
      ).map((x) => x.trim());
      if (chips.join() !== "All,Notes,Reading")
        throw new Error(`chips: ${chips.join(", ")}`);
      const row = card
        .locator(".sb-today-feed-row-reading", { hasText: /You read John 3/ })
        .first();
      await row.waitFor({ timeout: 10000 });
      await card
        .locator(".sb-today-feed-kind-option", { hasText: "Notes" })
        .click();
      await c.waitText(card, /No notes in this time frame yet/, 5000);
      await card
        .locator(".sb-today-feed-kind-option", { hasText: "Reading" })
        .click();
      await row.waitFor({ timeout: 5000 });
      await card.getByRole("button", { name: "History" }).click();
      const hist = card.locator(".sb-today-history");
      await c.waitText(hist, /John 3/, 5000);
      await hist.getByRole("button", { name: "John 3" }).first().click();
      await c.page.waitForURL(/\/read\/BSB\/JHN\/3/, { timeout: 10000 });
      return `chips ${chips.join(" · ")}; 'You read John 3' under All and Reading; Notes empty; History listed John 3 and opened it`;
    },
  },
  {
    id: "FR1",
    section: "8. Today, Discover and publishing",
    title: "Friends: the old reader's full page",
    rows: ["Friends pane"],
    checks:
      "Signed in: Profile → Friends opens a full page (the reading area gives way) with ← back to Profile: Friends (each with Remove), Add a friend (Send request; your friend link with Copy and Email it; your user ID with Copy) and, when there are any, Friend requests (Accept, Decline) and Sent requests (Cancel). Send request opens your Home's add-a-contact page for exactly that name; Remove asks first (Remove friend?) and then opens your Home's page to remove exactly that friend. (The test records the Home address instead of opening it, so nothing is signed)",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      await c.page.locator(".sb-sidebar-profile-button").click();
      await c.pane().locator(".sb-profile-row", { hasText: "Friends" }).click();
      const page = c.page.locator(".sb-friends-pane");
      await page.waitFor({ timeout: 5000 });
      if (await c.page.locator(".sb-app-main").isVisible())
        throw new Error("Friends is not a full page");
      await c.waitText(page, /add a friend/i, 20000);
      const heads = (
        await page.locator(".sb-friends-heading-text").allInnerTexts()
      ).map((x) => x.trim());
      if (!heads.includes("Friends") || !heads.includes("Add a friend"))
        throw new Error(`headings: ${heads.join(", ")}`);
      // The Home is never opened: the address the reader would open is recorded instead, so nothing can be signed.
      await c.page.evaluate(() => {
        (window as unknown as { __opened: string[] }).__opened = [];
        window.open = ((u: string) => {
          (window as unknown as { __opened: string[] }).__opened.push(
            String(u)
          );
          return null;
        }) as typeof window.open;
      });
      const popup = async (act: () => Promise<void>) => {
        await act();
        return c.page.evaluate(
          () =>
            (window as unknown as { __opened: string[] }).__opened.at(-1) ?? ""
        );
      };
      await page.locator(".sb-friends-add-input").fill("flowtest-nobody.me");
      const addUrl = await popup(() =>
        page.getByRole("button", { name: /send request/i }).click()
      );
      if (!/\/contacts\?add=flowtest-nobody\.me$/.test(addUrl))
        throw new Error(`Send request opened ${addUrl}`);
      await c.page
        .locator(".sb-friend-waiting")
        .getByRole("button", { name: /cancel/i })
        .click()
        .catch(() => {});
      const remove = page
        .getByRole("button", { name: /^Remove .* as a friend$/ })
        .first();
      let removed = "no friends to remove";
      if (await remove.count()) {
        await remove.click();
        const dialog = c.page.getByRole("dialog", { name: /remove friend\?/i });
        await dialog.waitFor({ timeout: 3000 });
        const rmUrl = await popup(() =>
          dialog.getByRole("button", { name: /^remove$/i }).click()
        );
        if (!/\/contacts\?remove=0x[0-9a-f]{40}$/i.test(rmUrl))
          throw new Error(`Remove opened ${rmUrl}`);
        await c.page
          .locator(".sb-friend-waiting")
          .getByRole("button", { name: /cancel/i })
          .click()
          .catch(() => {});
        removed =
          "Remove asked first, then opened the Home to remove exactly that friend";
      }
      await page.getByRole("button", { name: "Back" }).click();
      await c.page.locator(".sb-profile-screen").waitFor({ timeout: 3000 });
      return `full page with ${heads.join(" · ")}; Send request opened the Home for that name; ${removed}; ← back to Profile`;
    },
  },
  {
    id: "YC1",
    section: "5. Your Content and search",
    title:
      "Your content as the old reader's: chips, your own search, quotes and menus",
    rows: ["Your content", "Search your own things"],
    checks:
      "With a note on John 3:16 and a highlight on 3:14, Your content shows + Create (Playlist, Reading plan) and the chips All · Annotations · Highlights · Saves · Bookmarks · Playlists · Reading plans · Images; the note's card quotes its verse ('For God so loved…') above the note; the highlight quotes its verse. Searching a word of the note finds only the note; a word of the highlighted verse finds the highlight; the Highlights chip shows only highlights; each item's ⋯ deletes it (Delete, Clear highlight)",
    run: async (c) => {
      await c.open(CH);
      const word = `mustard${Date.now().toString(36)}`;
      await writeNote(c, 16, `${word} seed`);
      await c.selectVerse(14);
      await c.pickColor(0);
      await c.page.keyboard.press("Escape");
      await c.pressToolbar("Your content");
      const pane = c.pane();
      await pane.locator(".sb-content-chips").waitFor({ timeout: 10000 });
      const chips = (
        await pane.locator(".sb-content-chip").allInnerTexts()
      ).map((x) => x.trim());
      const want = [
        "All",
        "Annotations",
        "Highlights",
        "Saves",
        "Bookmarks",
        "Playlists",
        "Reading plans",
        "Images",
      ];
      if (chips.join() !== want.join())
        throw new Error(`chips: ${chips.join(", ")}`);
      await pane.locator(".sb-content-create").click();
      const create = (
        await c.page.locator(".sb-context-menu [role=menuitem]").allInnerTexts()
      ).join(" ");
      if (!/playlist/i.test(create) || !/reading plan/i.test(create))
        throw new Error(`+ Create offers: ${create}`);
      await c.page.keyboard.press("Escape");
      const card = pane
        .locator(".sb-content-annotation", { hasText: word })
        .first();
      await card.waitFor({ timeout: 15000 });
      await c.waitText(
        card.locator(".sb-content-quote"),
        /For God so loved/,
        15000
      );
      const hl = pane
        .locator(".sb-content-highlight-row", { hasText: "John 3:14" })
        .first();
      await c.waitText(hl, /Moses lifted up the snake/, 15000);
      const search = pane.locator(".sb-content-search input");
      await search.fill(word);
      await c.page.waitForTimeout(400);
      if ((await pane.locator(".sb-content-highlight-row").count()) !== 0)
        throw new Error("a search for the note's word kept the highlights");
      await card.waitFor({ timeout: 3000 });
      await search.fill("Moses lifted up");
      await hl.waitFor({ timeout: 15000 });
      if (
        await pane.locator(".sb-content-annotation", { hasText: word }).count()
      )
        throw new Error("a search for the verse's words kept the note");
      await search.fill("");
      await pane.locator(".sb-content-chip", { hasText: "Highlights" }).click();
      await hl.waitFor({ timeout: 5000 });
      if (await pane.locator(".sb-content-annotation").count())
        throw new Error("the Highlights chip still shows notes");
      await hl.locator(".sb-content-kebab").click();
      await c.page
        .locator(".sb-context-menu [role=menuitem]", {
          hasText: /clear highlight/i,
        })
        .click();
      await hl.waitFor({ state: "detached", timeout: 10000 });
      await pane
        .locator(".sb-content-chip", { hasText: "Annotations" })
        .click();
      await card.locator(".sb-content-kebab").click();
      await c.page
        .getByRole("menuitem", { name: "Delete", exact: true })
        .click();
      await card.waitFor({ state: "detached", timeout: 10000 });
      return `chips ${chips.join(" · ")}; + Create: Playlist, Reading plan; the note quoted 3:16 and the highlight 3:14; each search found only its own; the Highlights chip; ⋯ cleared the highlight and deleted the note`;
    },
  },
  {
    id: "SR1",
    section: "3. Reading",
    title: "Search: the floating box above the toolbar",
    rows: ["Search the Bible"],
    checks:
      "Search in the toolbar opens a box just above it, ready to type in. 'Gen 2' offers Genesis 2 under Books at once; ↓ then Enter opens it. 'loved the world' finds John 3:16 among the verses; tapping it opens John 3 with verse 16 selected; its ↗ opens it in a new tab. Esc closes the box",
    run: async (c) => {
      await c.open(CH);
      await c.pressToolbar("Search");
      const panel = c.page.locator(".sb-floating-search-panel");
      const input = panel.locator("input");
      await input.waitFor({ timeout: 5000 });
      await c.page.waitForFunction(
        () =>
          document.activeElement?.classList.contains(
            "sb-floating-search-input"
          ),
        undefined,
        { timeout: 3000 }
      );
      const bar = (await c.page
        .locator(".sb-reader-toolbar-desk")
        .boundingBox())!;
      const box = (await panel.boundingBox())!;
      if (box.y + box.height > bar.y)
        throw new Error("the search box is not above the toolbar");
      await input.fill("Gen 2");
      await c.waitText(
        panel.locator(".sb-floating-search-book").first(),
        /Genesis 2/,
        5000
      );
      await input.press("ArrowDown");
      await input.press("Enter");
      await c.page.waitForURL(/\/read\/BSB\/GEN\/2$/, { timeout: 15000 });
      await c.pressToolbar("Search");
      await input.fill("loved the world");
      const hit = panel
        .locator(".sb-floating-search-result:not(.sb-floating-search-book)", {
          hasText: "3:16",
        })
        .first();
      await hit.waitFor({ timeout: 20000 });
      await hit.click();
      await c.page.waitForURL(/\/read\/BSB\/JHN\/3/, { timeout: 15000 });
      await c.page.locator(".sb-verse-toolbar").waitFor({ timeout: 15000 });
      const tabsBefore = await c.page
        .locator(".sb-sidebar-tab-list .sb-tab-main, .sb-sidebar-tab-list > *")
        .count();
      await c.pressToolbar("Search");
      await input.fill("loved the world");
      await hit.waitFor({ timeout: 20000 });
      await hit.locator(".sb-floating-search-result-action").click();
      await c.page
        .waitForFunction(
          (n) =>
            document.querySelectorAll(
              ".sb-sidebar-tab-list .sb-tab-main, .sb-sidebar-tab-list > *"
            ).length > n,
          tabsBefore,
          { timeout: 10000 }
        )
        .catch(() => {
          throw new Error("↗ did not open a new tab");
        });
      await c.pressToolbar("Search");
      await input.waitFor({ timeout: 5000 });
      await input.press("Escape");
      await panel.waitFor({ state: "detached", timeout: 3000 });
      return "the box opened above the toolbar, ready to type in; Gen 2 → Genesis 2 by ↓ Enter; 'loved the world' → John 3:16 opened with the verse selected; ↗ opened a new tab; Esc closed it";
    },
  },
  {
    id: "SEL1",
    section: "3. Reading",
    title: "The book picker is laid out as the old reader's",
    rows: ["Open a book and chapter"],
    checks:
      "At 1495 px: one row of the translation (BSB ▾), the search box and All books; Old Testament in three columns filled down each column (Genesis, Exodus… then 2 Chronicles), New Testament in two; the book on screen open with its chapters as a full-width row of square buttons and the current chapter filled; Song Of Solomon by its full name. At 390 px: a header of ×, Books and the tabs, one column, and the current chapter in view",
    run: async (c) => {
      await c.open("/read/BSB/MAT/3");
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-title")
        .click();
      const panel = c.page.locator(".sb-selector-panel");
      await panel.locator(".sidebar-itm").first().waitFor({ timeout: 10000 });
      const layout = await panel.evaluate((p) => {
        const box = (sel: string) =>
          p.querySelector(sel)!.getBoundingClientRect();
        const head = [
          ".sidebar-translation-selector",
          ".searchbar",
          ".dropdown",
        ].map((s) => box(s));
        const cols = (i: number) => {
          const items = [...p.querySelectorAll(".testament-container")][
            i
          ]!.querySelectorAll(".sidebar-itm");
          return new Set(
            [...items].map((n) => Math.round(n.getBoundingClientRect().left))
          ).size;
        };
        const names = [
          ...p.querySelectorAll(".sidebar-itm .sb-selector-book-name"),
        ].map((n) => n.textContent!.trim());
        const grid = p
          .querySelector(".show-sidebar-chapter")!
          .getBoundingClientRect();
        const nt = [
          ...p.querySelectorAll(".testament-container"),
        ][1]!.getBoundingClientRect();
        const btn = p.querySelector(".chapter-btn")!.getBoundingClientRect();
        return {
          oneRow: head.every((r) => Math.abs(r.top - head[0]!.top) < 4),
          ot: cols(0),
          nt: cols(1),
          second: names[1],
          sixteenth: names[13],
          song: names.some((n) => /^song of solomon$/i.test(n)),
          fullWidth: grid.width > nt.width - 40,
          square: Math.abs(btn.width - btn.height) < 2 && btn.width < 60,
          current: p.querySelector(".chapter-btn-current")?.textContent?.trim(),
        };
      });
      const bad = [
        !layout.oneRow && "the translation, search and filter are not one row",
        layout.ot !== 3 && `Old Testament in ${layout.ot} columns`,
        layout.nt !== 2 && `New Testament in ${layout.nt} columns`,
        layout.second !== "Exodus" &&
          `second book ${layout.second} (not filled down the column)`,
        !layout.song && "Song Of Solomon is not by its full name",
        !layout.fullWidth && "the chapters are not a full-width row",
        !layout.square && "chapter buttons are not small squares",
        layout.current !== "3" && `current chapter ${layout.current}`,
      ].filter(Boolean);
      if (bad.length) throw new Error(bad.join("; "));
      const phone = await c.secondPage();
      await phone.setViewportSize({ width: 390, height: 844 });
      await c.open("/read/BSB/MAT/3", phone);
      await phone.locator(".sb-reader-floating-nav-label").first().click();
      const head = phone.locator(
        ".sb-selector-panel .sb-bible-reader-mobile-header-title"
      );
      await head.waitFor({ timeout: 10000 });
      const cur = phone.locator(".sb-selector-panel .chapter-btn-current");
      await phone.waitForTimeout(400);
      const inView = await cur.evaluate((n) => {
        const r = n.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      });
      if (!inView)
        throw new Error("on a phone the current chapter is not in view");
      return `desktop: one header row, OT ${layout.ot} columns, NT ${layout.nt}, full-width chapter row, chapter 3 filled; phone: × Books ☰, current chapter in view`;
    },
  },
  {
    id: "HU1",
    timeoutMs: 240_000,
    section: "9. Reading together",
    title:
      "A call in the session: chips that light when someone talks, and video",
    rows: ["Call in a live session"],
    checks:
      "Signed in, the host starts a session and its call (Start a call); a bar of chips shows over the reading with their own chip, microphone off. A second signed-in person opens the session's link, sees the call is running and joins it: each bar shows both people. The second person unmutes and talks (a test tone): their chip lights on the host's bar, and goes dark when they mute. The friend turns their camera on: the host sees their picture move in their chip and in a tile in the session pane, and it goes when they turn it off. The host ends the call for everyone and both bars go",
    run: async (c) => {
      await c.open(CH);
      const host = await c.signInAsSample();
      const { code, sid } = await startSession(c);
      await c
        .pane()
        .getByRole("button", { name: /start a call/i })
        .click();
      const bar = c.page.locator(".sb-huddle-bar");
      await bar.waitFor({ timeout: 30000 });
      await c.waitText(bar, /\(you\)/i, 15000);
      if (!(await bar.locator(".sb-huddle-chip-muted").count()))
        throw new Error("the host's microphone should start off");

      const other = await c.secondPage();
      await c.open(CH, other);
      const friend = await c.signInAsSample(/^(?!.*seed ?reader)/i, other);
      await c.open(`${CH}?session=${sid}&code=${code}`, other);
      // Following the link opens the session pane already.
      if (
        !(await c
          .pane(other)
          .isVisible()
          .catch(() => false))
      )
        await c.pressToolbar("Live session", other);
      const join = c
        .pane(other)
        .getByRole("button", { name: /join the call/i });
      await join.waitFor({ timeout: 30000 });
      await join.click();
      await other.locator(".sb-huddle-bar").waitFor({ timeout: 30000 });
      const first = (n: string) =>
        new RegExp(n.split(/\s+/)[0]!.replace(/[^\w]/g, ""), "i");
      await chipTalking(c.page, first(friend), false, 30000);
      await chipTalking(other, first(host), false, 30000);

      await other
        .locator(".sb-huddle-bar")
        .getByRole("button", { name: /unmute/i })
        .click();
      await chipTalking(c.page, first(friend), true, 20000);
      await other
        .locator(".sb-huddle-bar")
        .getByRole("button", { name: /^mute$/i })
        .click();
      await chipTalking(c.page, first(friend), false, 20000);

      // Video: the friend starts their camera; the host sees it move, in the friend's chip and in a tile.
      await other
        .locator(".sb-huddle-bar")
        .getByRole("button", { name: /turn camera on/i })
        .click();
      const playing = async (sel: string) => {
        const t0 = Date.now();
        for (;;) {
          const w = await c.page
            .locator(sel)
            .first()
            .evaluate((v) => (v as HTMLVideoElement).videoWidth)
            .catch(() => 0);
          if (w > 0) return w;
          if (Date.now() - t0 > 20000)
            throw new Error(`no moving picture in ${sel}`);
          await c.page.waitForTimeout(300);
        }
      };
      await playing(
        ".sb-huddle-bar .sb-huddle-chip:not([title*='(you)']) video"
      );
      await playing(".sb-app-pane .sb-huddle-tile video");
      await other
        .locator(".sb-huddle-bar")
        .getByRole("button", { name: /turn camera off/i })
        .click();
      await c.page
        .locator(".sb-app-pane .sb-huddle-tile")
        .first()
        .waitFor({ state: "detached", timeout: 20000 });

      await c
        .pane()
        .getByRole("button", { name: /end call for everyone/i })
        .click();
      await bar.waitFor({ state: "detached", timeout: 15000 });
      await other
        .locator(".sb-huddle-bar")
        .waitFor({ state: "detached", timeout: 30000 })
        .catch(() => undefined);
      return `${host} and ${friend} in the call; ${friend}'s chip lit while talking and went dark on mute; their camera showed in their chip and a tile, and went when turned off; the host ended it`;
    },
  },
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
      const chosen = await c.page
        .locator(".sb-bible-reader-active .sb-verse-selected")
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute("data-verse-number"))
        );
      if (chosen.join() !== "28")
        throw new Error(`verses chosen: ${chosen.join(", ")}`);
      const opened = c.page.url().replace(BASE, "");
      await deleteAllNotesOn(c, CH);
      return `link → ${opened}, verse 28 selected`;
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
        await c.noteAction(
          page.locator(".sb-note-card").first(),
          /^edit$/i,
          page
        );
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
    id: "NO1",
    section: "4. Marking the text",
    title: "Notes as the old reader shows them",
    rows: ["Write a note"],
    checks:
      "With no notes, the Notes pane says 'You don't have any notes for this chapter.' with Create a note; with nothing chosen it writes a note on the whole chapter (grouped as John 3, 'Annotation saved'); a note on 3:16 groups under John 3:16 with 'You' and when; a group folds; while a draft is open, choosing 3:17–18 moves it there",
    run: async (c) => {
      let step = "";
      try {
        step = "empty";
        await c.open(CH);
        await deleteAllNotes(c);
        if (!(await c.pane().isVisible())) await c.pressToolbar("Notes");
        await c.waitText(
          c.pane(),
          /you don't have any notes for this chapter/i,
          10000
        );
        step = "a note on the whole chapter";
        await c
          .pane()
          .getByRole("button", { name: /create a note/i })
          .click();
        const draft = c.page.locator(".sb-note-card-draft");
        await c.waitText(draft.locator(".sb-note-card-ref"), /^John 3$/, 5000);
        const ed = draft.locator("[contenteditable]").first();
        await ed.waitFor({ timeout: 20000 });
        await ed.fill("about the whole chapter");
        await draft.getByRole("button", { name: /^save$/i }).click();
        await c.waitText(
          c.page.locator(".sb-toast"),
          /annotation saved/i,
          5000
        );
        const groups = c.pane().locator(".sb-annotation-group");
        await c.waitText(
          groups.first(),
          /^John 3[\s\S]*about the whole chapter/,
          10000
        );
        step = "a note on 3:16, with author and time";
        await writeNote(c, 16, "on verse sixteen");
        const g16 = groups.filter({ hasText: /John 3:16/ }).first();
        await c.waitText(g16, /on verse sixteen[\s\S]*You[\s\S]*\|/, 10000);
        step = "a group folds";
        await g16.locator(".sb-annotation-group-header").click();
        await g16
          .locator(".sb-annotation-item")
          .waitFor({ state: "detached", timeout: 3000 });
        await g16.locator(".sb-annotation-group-header").click();
        step = "the draft follows the selection";
        await c.selectVerse(17);
        await c
          .pane()
          .getByRole("button", { name: /write a note on/i })
          .click();
        await c.waitText(
          draft.locator(".sb-note-card-ref"),
          /John 3:17$/,
          5000
        );
        await c.tapVerse(18);
        await c.waitText(
          draft.locator(".sb-note-card-ref"),
          /John 3:17.18/,
          5000
        );
        await draft.getByRole("button", { name: /^cancel$/i }).click();
        await deleteAllNotes(c);
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "empty state, a whole-chapter note, a grouped verse note with You and when, folding, and the draft following 3:17–18";
    },
  },
  {
    id: "NO2",
    section: "4. Marking the text",
    title: "A note when the editor cannot load",
    rows: ["Write a note"],
    checks:
      "With the rich editor's file blocked, Note opens a plain text box that says so; the note saved from it is listed",
    run: async (c) => {
      // The offline worker would serve the editor's file from its cache, past the block: none here.
      const ctx = await c.browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
      });
      const page = await ctx.newPage();
      c.watch(page);
      try {
        await page.route(/TipTapEditor[^/]*\.(js|tsx)/, (r) => r.abort());
        await c.open(CH, page);
        await c.selectVerse(16, page);
        await page.locator(".sb-verse-toolbar-note").click();
        const box = page.locator(".sb-note-card-draft .sb-note-editor-plain");
        await box.waitFor({ timeout: 30000 });
        await c.waitText(
          page.locator(".sb-note-card-draft"),
          /could not be loaded/i,
          3000
        );
        await box.fill("typed in the plain box");
        await page
          .locator(".sb-note-card-draft")
          .getByRole("button", { name: /^save$/i })
          .click();
        await page
          .locator(".sb-note-card", { hasText: "typed in the plain box" })
          .first()
          .waitFor({ timeout: 10000 });
      } finally {
        await ctx.close();
      }
      return "the plain box took the note and it was listed";
    },
  },
  {
    id: "M9",
    section: "4. Marking the text",
    title: "Bookmark names and colours, save folders",
    rows: ["Bookmark names and colours, save folders"],
    checks:
      "Bookmark John 3 → Your Content → its ⋯ → Edit bookmark → name 'Nicodemus' and a colour → shown; save the chapter → its ⋯ → Edit save → folder 'Study' → shown beside it",
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
      const pane = c.pane();
      await pane
        .locator('button[aria-label="Bookmark options"]')
        .first()
        .click();
      await c.page
        .locator(".sb-context-menu [role=menuitem]", {
          hasText: "Edit bookmark",
        })
        .click();
      await pane
        .locator('input[placeholder="Bookmark name"]')
        .fill("Nicodemus");
      await pane.locator('button[aria-label="Green"]').first().click();
      await pane
        .getByRole("button", { name: /^save$/i })
        .first()
        .click();
      await c.waitText(pane, /Nicodemus/);
      await pane.locator('button[aria-label="Save options"]').first().click();
      await c.page
        .locator(".sb-context-menu [role=menuitem]", { hasText: "Edit save" })
        .click();
      await c.savePicker({ folders: ["Study"] });
      await c.waitText(pane, /Study/);
      return "bookmark named Nicodemus with a colour; save filed under Study";
    },
  },
  {
    id: "SV1",
    section: "4. Marking the text",
    title: "The save window: several folders, rename and delete a folder",
    rows: ["Bookmark names and colours, save folders"],
    checks:
      "Select 3:16 → Save opens the save window with My Saves ticked → Add to new 'Memory' → Save: the sidebar's saves list it under My Saves and Memory; Save again opens it as Edit save; Memory's ⋮ → Rename 'Verses' moves it; Edit save → untick My Saves → it is only in Verses; Verses' ⋮ → Delete puts it back in My Saves; Remove from all folders unsaves it",
    run: async (c) => {
      let step = 0;
      try {
        step = 1;
        await c.open(CH);
        step = 2;
        await c.selectVerse(16);
        step = 3;
        await c.settled(c.page.locator(".sb-verse-toolbar"));
        step = 4;
        await c.page
          .locator(".sb-verse-toolbar-action", { hasText: "Save" })
          .first()
          .click();
        const box = c.page.locator(".sb-save-picker");
        step = 5;
        await box.waitFor({ timeout: 5000 });
        const ticked = await box
          .locator('.sb-save-picker-category[aria-checked="true"]')
          .allInnerTexts();
        step = 6;
        if (ticked.join() !== "My Saves")
          throw new Error(`ticked at first: ${ticked.join(", ")}`);
        step = 7;
        await c.savePicker({ folders: ["Memory"] });
        const side = c.page.locator(".sb-tabs-sidebar");
        step = 8;
        await side.getByRole("button", { name: "Saves" }).click();
        const list = side.locator(".sb-saves-section");
        const folder = (name: string) =>
          list.locator(".sb-save-category", {
            has: c.page.locator(".sb-save-category-name", { hasText: name }),
          });
        const openFolder = async (name: string) => {
          const t = folder(name).locator(".sb-save-category-toggle");
          if ((await t.getAttribute("aria-expanded")) !== "true")
            await t.click();
        };
        step = 9;
        await c.waitText(folder("My Saves"), /john 3:16/i, 5000);
        step = 10;
        await openFolder("Memory");
        step = 11;
        await c.waitText(folder("Memory"), /john 3:16/i, 5000);

        step = 12;
        await c.selectVerse(16);
        step = 13;
        await c.settled(c.page.locator(".sb-verse-toolbar"));
        step = 14;
        await c.page
          .locator(".sb-verse-toolbar-action", { hasText: "Save" })
          .first()
          .click();
        step = 15;
        await c.waitText(
          c.page.locator(".sb-footnote-modal-title"),
          /edit save/i,
          5000
        );
        step = 16;
        await c.page
          .locator(".sb-footnote-modal-close", {
            has: c.page.locator("text=close"),
          })
          .first()
          .click();
        step = 17;
        await box.waitFor({ state: "detached", timeout: 5000 });

        step = 18;
        await folder("Memory")
          .getByRole("button", { name: "Folder options" })
          .click();
        step = 19;
        await c.page.getByRole("menuitem", { name: /rename/i }).click();
        const rename = list.locator(".sb-save-category-rename-input");
        step = 20;
        await rename.fill("Verses");
        step = 21;
        await rename.press("Enter");
        step = 22;
        await openFolder("Verses");
        step = 23;
        await c.waitText(folder("Verses"), /john 3:16/i, 5000);
        step = 24;
        if (await folder("Memory").count())
          throw new Error("Memory is still listed after the rename");

        step = 25;
        await folder("Verses")
          .getByRole("button", { name: "Save options" })
          .first()
          .click();
        step = 26;
        await c.page.getByRole("menuitem", { name: /edit save/i }).click();
        step = 27;
        await box.waitFor({ timeout: 5000 });
        step = 28;
        await box
          .locator(".sb-save-picker-category", { hasText: "My Saves" })
          .click();
        step = 29;
        await c.savePicker();
        step = 30;
        await openFolder("My Saves");
        for (let i = 0; i < 20; i++) {
          if (!/john 3:16/i.test(await folder("My Saves").innerText())) break;
          await c.page.waitForTimeout(250);
        }
        step = 31;
        if (/john 3:16/i.test(await folder("My Saves").innerText()))
          throw new Error("still in My Saves after unticking it");

        step = 32;
        await folder("Verses")
          .getByRole("button", { name: "Folder options" })
          .click();
        step = 33;
        await c.page.getByRole("menuitem", { name: /delete/i }).click();
        step = 34;
        await c.waitText(folder("My Saves"), /john 3:16/i, 5000);
        step = 35;
        if (await folder("Verses").count())
          throw new Error("Verses is still listed after Delete");

        step = 36;
        await c.selectVerse(16);
        step = 37;
        await c.settled(c.page.locator(".sb-verse-toolbar"));
        step = 38;
        await c.page
          .locator(".sb-verse-toolbar-action", { hasText: "Save" })
          .first()
          .click();
        step = 39;
        await c.savePicker({ remove: true });
        for (let i = 0; i < 20; i++) {
          if (!/john 3:16/i.test(await list.innerText())) break;
          await c.page.waitForTimeout(250);
        }
        step = 40;
        if (/john 3:16/i.test(await list.innerText()))
          throw new Error("Remove from all folders left the save");
      } catch (e) {
        throw new Error(`step ${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "saved to My Saves and a new folder; renamed, moved, deleted and removed";
    },
  },
  {
    id: "BM1",
    section: "4. Marking the text",
    title: "The movable bookmark",
    rows: ["Bookmark a chapter"],
    checks:
      "John 3's bookmark button opens the bookmark window with 'My bookmark' in orange ready → Save: the button shows the ribbon and names it; on Romans 8 the window says to tap a bookmark to move it → tap: it leaves John 3 for Romans 8; + New bookmark offers 'My bookmark 2' in red → Save: two ribbons; the sidebar's bookmarks list both as 'Romans 8 • BSB'; at five, + New bookmark is off and says why",
    run: async (c) => {
      let step = "";
      try {
        const button = () =>
          c.page.locator(
            ".sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-bookmark-button"
          );
        const box = c.page.locator(".sb-bookmark-picker");
        step = "open John 3";
        await c.open("/read/BSB/JHN/3");
        await button().click();
        await box.waitFor({ timeout: 5000 });
        step = "the offered first bookmark";
        const name = await box.locator(".sb-bookmark-form-name").inputValue();
        const orange = await box
          .locator('.sb-bookmark-form-color[aria-checked="true"]')
          .getAttribute("aria-label");
        if (name !== "My bookmark" || orange !== "Orange")
          throw new Error(`offered ${name} in ${orange}`);
        await c.bookmarkPicker();
        step = "the button names it";
        await c.page
          .locator(
            '.sb-bible-reader-header [aria-label="Bookmark on this chapter: My bookmark"]'
          )
          .waitFor({ timeout: 5000 });

        step = "move it to Romans 8";
        await c.open("/read/BSB/ROM/8");
        await button().click();
        await c.waitText(box, /tap a bookmark to move it/i, 5000);
        await box
          .locator(".sb-bookmark-picker-choice", { hasText: "My bookmark" })
          .click();
        await box.waitFor({ state: "detached", timeout: 5000 });
        await c.page
          .locator(
            '.sb-bible-reader-header [aria-label="Bookmark on this chapter: My bookmark"]'
          )
          .waitFor({ timeout: 5000 });

        step = "a second bookmark";
        await button().click();
        await box.locator(".sb-bookmark-add-new").click();
        const second = await box.locator(".sb-bookmark-form-name").inputValue();
        const red = await box
          .locator('.sb-bookmark-form-color[aria-checked="true"]')
          .getAttribute("aria-label");
        if (second !== "My bookmark 2" || red !== "Red")
          throw new Error(`second offered ${second} in ${red}`);
        await box.locator(".sb-bookmark-picker-save").click();
        await box.waitFor({ state: "detached", timeout: 5000 });
        await c.page
          .locator(".sb-bible-reader-header .sb-bookmark-stack-icon")
          .waitFor({ timeout: 5000 });

        step = "the sidebar's bookmarks";
        const side = c.page.locator(".sb-tabs-sidebar");
        await side.getByRole("button", { name: "Bookmarks" }).click();
        const panel = side.locator(".sb-bookmarks-panel");
        await c.waitText(panel, /my bookmark 2[\s\S]*romans 8/i, 5000);
        const rows = await panel
          .locator(".sb-bookmarks-panel-row")
          .allInnerTexts();
        if (
          rows.length !== 2 ||
          !rows.every((r) => /romans 8\s*•\s*BSB/i.test(r))
        )
          throw new Error(`panel: ${rows.join(" | ")}`);

        step = "John 3 has none now";
        await c.open("/read/BSB/JHN/3");
        await button().waitFor({ timeout: 10000 });
        if (
          (await button().getAttribute("aria-label")) !==
          "Bookmark this chapter"
        )
          throw new Error(
            `John 3: ${await button().getAttribute("aria-label")}`
          );

        step = "the cap of five";
        for (let n = 0; n < 3; n++) {
          await button().click();
          await c.bookmarkPicker();
        }
        await button().click();
        const add = box.locator(".sb-bookmark-add-new");
        if (!(await add.isDisabled()))
          throw new Error("+ New bookmark is still on at five");
        await c.waitText(box, /up to 5 bookmarks/i, 3000);
        await c.page.locator(".sb-footnote-modal-close").first().click();
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "placed on John 3, moved to Romans 8, a second in red, both in the sidebar; five is the most";
    },
  },
  {
    id: "TL1",
    section: "3. Reading",
    title: "The translation window, grouped by language",
    rows: ["Change translation"],
    checks:
      "The translation code opens the old reader's window (Esc on its download tip closes only the tip): English first and open with BSB ticked; the filter offers Complete / All / Popular translations and Popular keeps only the popular languages; searching 'Español' shows the Spanish section; ⓘ on a row shows its licence; share copies the translation's link; a download can be cancelled part way and its button comes back; Esc closes",
    run: async (c) => {
      let step = "";
      try {
        step = "open";
        await c.keepTours();
        await c.open("/read/BSB/JHN/3");
        await c.page
          .locator(".sb-bible-reader-active .sb-bible-reader-translation")
          .click();
        const win = c.page.locator(".sb-translation-picker .modal");
        const first = win.locator(".sb-translation-list-language").first();
        await first.waitFor({ timeout: 40000 });
        step = "Esc on the download tip leaves the window open";
        const tip = c.page.locator(".sb-tour-card");
        await tip.waitFor({ timeout: 5000 });
        await c.page.keyboard.press("Escape");
        await tip.waitFor({ state: "detached", timeout: 3000 });
        await c.page.waitForTimeout(300);
        if (!(await win.isVisible()))
          throw new Error("Esc on the tip closed the translation window too");
        const justThis = c.page.getByRole("button", { name: /just this one/i });
        // Skipping a tip asks whether to turn tutorials off.
        await justThis.waitFor({ timeout: 3000 }).catch(() => undefined);
        if (await justThis.isVisible().catch(() => false))
          await justThis.click();
        step = "English first, open, BSB ticked";
        if (!/english/i.test(await first.innerText()))
          throw new Error(`first section: ${await first.innerText()}`);
        if ((await first.getAttribute("aria-expanded")) !== "true")
          throw new Error("English is not open");
        await win
          .locator('.translation-option[aria-selected="true"]', {
            hasText: "(BSB)",
          })
          .waitFor({ timeout: 5000 });

        step = "the filter";
        const countAll = async () =>
          win.locator(".sb-translation-list-language").count();
        await win.locator(".filters-icon").click();
        const menu = c.page.locator(".sb-translation-view-mode-menu");
        await c.waitText(
          menu,
          /complete translations[\s\S]*all translations[\s\S]*popular translations/i,
          3000
        );
        await menu
          .getByRole("menuitemradio", { name: /all translations/i })
          .click();
        const all = await countAll();
        await win.locator(".filters-icon").click();
        await menu
          .getByRole("menuitemradio", { name: /popular translations/i })
          .click();
        const popular = await countAll();
        if (!(popular > 0 && popular < all && popular <= 6))
          throw new Error(`popular ${popular} of ${all} languages`);

        step = "search a language";
        await win.locator("#translation-search-input").fill("Español");
        await c.waitText(
          win.locator(".sb-translation-list-language").first(),
          /español/i,
          10000
        );

        step = "the licence";
        await win.locator("#translation-search-input").fill("");
        const info = win.locator(".sb-translation-info-button").first();
        if (await info.count()) {
          await info.click();
          await c.page
            .locator(".translationInfoModal")
            .waitFor({ timeout: 3000 });
          // Esc takes the note away and leaves the window.
          await c.page.keyboard.press("Escape");
          await c.page
            .locator(".translationInfoModal")
            .waitFor({ state: "detached", timeout: 3000 });
          if (!(await win.isVisible()))
            throw new Error(
              `Esc on the licence closed the window too (${await c.page.locator(".sb-translation-picker").count()} pickers, ${await c.page
                .locator(".sb-translation-picker .modal")
                .evaluate((e) => JSON.stringify(e.getBoundingClientRect()))
                .catch(() => "none")})`
            );
        }

        step = "share";
        await c.context.grantPermissions(["clipboard-read", "clipboard-write"]);
        const bsb = win
          .locator(".translation-option", { hasText: "(BSB)" })
          .first();
        await bsb.locator(".share-btn").click();
        const clip = await c.page.evaluate(() =>
          navigator.clipboard.readText()
        );
        if (!/\/read\/BSB\/JHN\/3/.test(clip))
          throw new Error(`clipboard: ${clip}`);

        step = "cancel a download";
        const web = win
          .locator(".translation-option", { hasText: /\(WEB\w*\)/ })
          .first();
        await win.locator("#translation-search-input").fill("World English");
        await web.waitFor({ timeout: 10000 });
        await web.locator(".sb-offline-btn").first().click();
        const going = web.locator(".sb-offline-btn.downloading");
        await going.waitFor({ timeout: 10000 });
        await going.click();
        await web
          .locator(".sb-offline-btn:not(.downloading):not(.downloaded)")
          .waitFor({ timeout: 10000 });

        step = "Esc closes";
        await c.page.keyboard.press("Escape");
        await win.waitFor({ state: "detached", timeout: 3000 });
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "grouped by language with English first; filter, search, licence, share and a cancelled download all worked";
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
      "Signed in: a note on John 7:37 → its ⋮ → Publish to your public shelf → marked Published; ⋮ → Copy link gives a link naming the offering; ⋮ → Make private again withdraws it",
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
      await c.noteAction(card, /publish to your public shelf/i);
      await card.locator(".sb-note-published-tag").waitFor({ timeout: 120000 });
      await c.noteAction(card, /copy link/i);
      await c.page.waitForTimeout(300);
      const link = await c.page
        .evaluate(() => navigator.clipboard.readText())
        .catch(() => "");
      if (!/offering=/.test(link)) throw new Error(`link "${link}"`);
      await c.noteAction(card, /make private again/i);
      await card
        .locator(".sb-note-published-tag")
        .waitFor({ state: "detached", timeout: 120000 });
      await deleteAllNotes(c);
      return `published, link ${link.replace(BASE, "").slice(0, 70)}…, withdrawn`;
    },
  },
  {
    id: "S8",
    section: "8. Today, Discover and publishing",
    title: "Friends' notes in Today",
    rows: ["Friends' notes in Today"],
    checks:
      "A friend's released note shows in Today's Community card ('Ruth noted on John 3:16', with its title)",
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
      await guest
        .locator(".sb-app-pane")
        .getByRole("button", { name: /open chat/i })
        .click();
      const gchat = guest.locator(".sb-floating-chat-panel");
      await gchat.locator(".sb-chat-view-input").fill("hello from the flow");
      await gchat.getByRole("button", { name: /send message/i }).click();
      await c
        .pane()
        .getByRole("button", { name: /open chat/i })
        .click();
      await c.waitText(
        c.page.locator(".sb-floating-chat-panel"),
        /hello from the flow/,
        20000
      );
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
      "Library → Playlists → a title → Create (starts with John 3); add Romans 8:28 by reference; move it up; Play playlist opens Romans 8 then Next opens John 3; a passage typed across chapters (John 3:16-4:2) keeps both ends; remove an item; delete the playlist",
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
      // A passage across chapters keeps its end: "John 3:16–4:2", not John 3:16 alone.
      await card
        .locator(
          'input[placeholder*="John 3:16" i], input[placeholder*="reference" i]'
        )
        .first()
        .fill("John 3:16-4:2");
      await card
        .getByRole("button", { name: /^add item$/i })
        .first()
        .click();
      await c.waitText(card, /John 3:16–4:2/);
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
      await c.confirmDelete();
      await card.waitFor({ state: "detached", timeout: 10000 });
      return "created, Romans 8:28 added and moved first, played Romans 8 → John 3, John 3:16–4:2 kept both ends, an item removed, deleted";
    },
  },
  {
    id: "PL2",
    section: "10. Playlists and reading plans",
    title: "A playlist as the old reader has it",
    rows: [
      "Make a playlist",
      "Add, reorder, remove, edit items",
      "Play a playlist",
    ],
    checks:
      "Make a playlist; Edit playlist gives it a new title and a description; with it open, choosing John 3:16 offers Add to Playlist in the verse toolbar; Move down; Play, then close the Library: Save and Bookmark leave the chapter header, and a note beside the reading says '1 of 2' with Next →, ✕ folds it to Show note; Next to the last item and Finish says 'You've reached the end of …'; Delete asks 'Delete playlist?'",
    run: async (c) => {
      let step = "";
      try {
        step = "make it";
        await c.open(CH);
        const pane = await c.openLibrary("Playlists");
        const title = `Flow list ${stamp()}`;
        await pane.locator('input[placeholder^="New playlist"]').fill(title);
        await pane.getByRole("button", { name: /^create$/i }).click();
        let card = pane.locator(".sb-note-card", { hasText: title }).first();
        await card.waitFor({ timeout: 10000 });
        await ensureOpen(card);
        step = "Edit playlist";
        await card.getByRole("button", { name: /edit playlist/i }).click();
        const renamed = `${title} renamed`;
        await card.getByLabel("Title").fill(renamed);
        await card.getByLabel("Description").fill("for the flow");
        await card
          .getByRole("button", { name: /^save$/i })
          .first()
          .click();
        card = pane.locator(".sb-note-card", { hasText: renamed }).first();
        await c.waitText(card, /for the flow/, 10000);
        step = "Add to Playlist";
        await c.selectVerse(16);
        await c.page
          .locator(".sb-verse-toolbar-action", { hasText: /add to playlist/i })
          .first()
          .click();
        await c.waitText(card, /John 3:16/, 10000);
        step = "Move down";
        await card.locator('button[aria-label="Move down"]').first().click();
        await c.page.waitForTimeout(500);
        const items = await card.locator(".sb-library-item").allInnerTexts();
        if (!/John 3:16/.test(items[0] ?? ""))
          throw new Error(`order: ${items.join(" | ")}`);
        step = "play in the reader";
        await card.getByRole("button", { name: /play playlist/i }).click();
        await c.page
          .locator(".sb-library-pane .sb-pane-close[aria-label='Close']")
          .click();
        const note = c.page.locator(".sb-playlist-note");
        await note.waitFor({ timeout: 10000 });
        await c.waitText(note, /1 of 2/, 5000);
        if (
          await c.page
            .locator(
              ".sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-save-button, .sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-bookmark-button"
            )
            .count()
        )
          throw new Error(
            "Save and Bookmark still show while the playlist plays"
          );
        await note.getByRole("button", { name: /hide note/i }).click();
        await c.page.getByRole("button", { name: /show note/i }).click();
        await note.getByRole("button", { name: /next/i }).click();
        await c.waitText(note, /2 of 2/, 5000);
        await note.getByRole("button", { name: /finish/i }).click();
        const done = c.page.getByRole("dialog", { name: "Playlist finished" });
        await c.waitText(done, /reached the end of/i, 5000);
        await done
          .getByRole("button", { name: /^close$/i })
          .last()
          .click();
        step = "delete";
        const pane2 = await c.openLibrary("Playlists");
        card = pane2.locator(".sb-note-card", { hasText: renamed }).first();
        await ensureOpen(card);
        await card.getByRole("button", { name: /^delete$/i }).click();
        await c.waitText(
          c.page.getByRole("dialog", { name: "Delete playlist?" }),
          /can't be undone/,
          5000
        );
        await c.confirmDelete();
        await card.waitFor({ state: "detached", timeout: 10000 });
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "renamed with a description, John 3:16 added from the verse toolbar and moved, played in the reader 1 of 2 (Save and Bookmark stepped aside) → 2 of 2 → finished, deleted after the check";
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
      await card.locator(".sb-rpd-reading-toggle").first().click();
      await c.page.waitForTimeout(500);
      const p1 = await progress();
      if (p0 === p1) throw new Error(`progress unchanged "${p0}"`);
      c.page.once("dialog", (d) => void d.accept());
      await card.getByRole("button", { name: /^delete$/i }).click();
      await c.confirmDelete();
      return `plan of 5 chapters; progress "${p0}" → "${p1}"`;
    },
  },
  {
    id: "RP1",
    section: "10. Playlists and reading plans",
    title: "A reading plan as the old reader shows it",
    rows: ["Start a plan, tick readings"],
    checks:
      "A plan of John 1–3 started Daily shows '3 days · started …', 'Next: Day 1 · John 1', and open, 'ends …', '~N min/day' and Day 1–3 tabs; Read plays Day 1 in the reader and at its end asks 'Nice reading! Mark Day 1 complete?' → Mark as complete ticks Day 1; Day 2's Mark complete waits for its reading, then says 'Day 2 complete!'; Delete asks 'Delete reading plan?'",
    run: async (c) => {
      let step = "";
      try {
        step = "make and start";
        await c.open("/read/BSB/JHN/1");
        let pane = await c.openLibrary("Reading plans");
        const title = `Flow rp ${stamp()}`;
        await pane.locator('input[placeholder^="Plan title"]').fill(title);
        await pane.locator('input[type="number"]').first().fill("3");
        await pane.getByRole("button", { name: /create plan/i }).click();
        let card = pane.locator(".sb-rp-card", { hasText: title }).first();
        await card.waitFor({ timeout: 10000 });
        await ensureOpen(card);
        await card.getByRole("button", { name: /start · daily/i }).click();
        step = "the summary";
        await c.waitText(card, /3 days · started/, 5000);
        await c.waitText(card, /Next: Day 1 · John 1/, 5000);
        await c.waitText(card, /ends .*[\s\S]*~\d+ min\/day/, 5000);
        if ((await card.locator(".sb-rpd-day-tab").count()) !== 3)
          throw new Error("not three day tabs");
        step = "Read the day";
        await card
          .getByRole("button", { name: /^play_arrow\s*read$|^read$/i })
          .click();
        const note = c.page.locator(".sb-playlist-note");
        await note.waitFor({ timeout: 10000 });
        await note.getByRole("button", { name: /finish/i }).click();
        const nudge = c.page.locator(".sb-rpb-toast");
        await c.waitText(
          nudge,
          /nice reading![\s\S]*mark day 1 complete\?/i,
          5000
        );
        await nudge.getByRole("button", { name: /mark as complete/i }).click();
        step = "Day 1 ticked";
        pane = await c.openLibrary("Reading plans");
        card = pane.locator(".sb-rp-card", { hasText: title }).first();
        await ensureOpen(card);
        await c.waitText(
          card.locator(".sb-rp-card-progress-label"),
          /^1\/3$/,
          10000
        );
        step = "Mark Day 2 complete";
        // The celebration has no title in it: hold the card by its plan.
        const id = await card.getAttribute("data-plan-id");
        card = pane.locator(`.sb-rp-card[data-plan-id="${id}"]`);
        await card.locator(".sb-rpd-day-tab").nth(1).click();
        const mark = card.getByRole("button", { name: /mark day 2 complete/i });
        if (await mark.isEnabled())
          throw new Error("Mark Day 2 complete before its reading was ticked");
        await card.locator(".sb-rpd-reading-toggle").first().click();
        await mark.click();
        await c.waitText(card, /day 2 complete!/i, 5000);
        await card.getByRole("button", { name: /back to plan/i }).click();
        step = "delete";
        await card.getByRole("button", { name: /^delete$/i }).click();
        await c.page
          .getByRole("dialog", { name: "Delete reading plan?" })
          .waitFor({ timeout: 5000 });
        await c.confirmDelete();
        await card.waitFor({ state: "detached", timeout: 10000 });
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
      return "summary, Read with the Nice reading prompt, Day 2 complete!, deleted after the check";
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
      await ensureOpen(card);
      // One day at a time, as the old reader shows a plan: the day's name, then its readings.
      const day = async (n: number) => {
        await card
          .locator(".sb-rpd-day-tab")
          .nth(n - 1)
          .click();
        return (await card.locator(".sb-rpd-body").innerText())
          .replace(/\s+/g, " ")
          .trim();
      };
      const shown = `${await day(1)} | ${await day(2)}`;
      if (!/Comfort.*Psalms? 23.*John 1.*\| .*Romans 8:28/i.test(shown))
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
      await c.confirmDelete();
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
      await c.confirmDelete();
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
      await c.confirmDelete();
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
      await c.confirmDelete();
      if (!watch)
        throw new Error(
          "picking the theme did not turn its recommended Watch on"
        );
      if (!freshCss.includes("7a1f5c") && freshCss === before)
        throw new Error("the link did not apply the theme in a fresh browser");
      return `made, Watch recommended, published, picked (colours changed, Watch on), opened by link in a fresh browser; withdrawn and deleted`;
    },
  },
  {
    id: "EX1",
    section: "12. Extensions",
    title: "The Extensions page",
    rows: ["Extensions page"],
    checks:
      "Settings → Extensions shows Installed and Available with counts; Cross-references' Configure sets References per verse to 1 and Discover lists fewer, Reset to defaults puts it back; Uninstall takes Study companion off the bar and Available → Install brings it back; Download Extensions saves the set as a file",
    run: async (c) => {
      let step = "";
      try {
        step = "the page";
        await c.open(CH);
        const discoverRefs = async () => {
          // The source's own chip lists all of it (All shows the first few).
          await c.page
            .locator(".sb-discover-content-panel .sb-dcp-chip", {
              hasText: /cross-references/i,
            })
            .click();
          const sec = c.page
            .locator(".sb-discover-content-panel .sb-discover-section", {
              hasText: /cross-references/i,
            })
            .first();
          await sec
            .locator(".sb-discover-item")
            .first()
            .waitFor({ timeout: 20000 });
          await c.page.waitForTimeout(500);
          return sec.locator(".sb-discover-item").count();
        };
        const before = await discoverRefs();
        const side = c.page.locator(".sb-tabs-sidebar");
        await side.getByRole("button", { name: "Open settings" }).click();
        await side.getByText("Extensions", { exact: true }).click();
        await c.waitText(
          side.locator(".sb-extensions-tabs"),
          /installed\s*\d+[\s\S]*available\s*\d+/i,
          5000
        );
        step = "Configure";
        const refs = side.locator(
          '.sb-extension-row[data-extension="references"]'
        );
        await refs.getByRole("button", { name: "Configure" }).click();
        await side.getByLabel("References per verse").fill("1");
        await side.getByLabel("References per verse").press("Tab");
        const after = await discoverRefs();
        if (!(after < before))
          throw new Error(`cross-references ${before} → ${after}`);
        await side.getByRole("button", { name: /reset to defaults/i }).click();
        if (
          (await side.getByLabel("References per verse").inputValue()) !== "3"
        )
          throw new Error("Reset did not put 3 back");
        await side.locator(".sb-settings-back").first().click();
        step = "Uninstall and Install";
        const companion = side.locator(
          '.sb-extension-row[data-extension="companion"]'
        );
        await companion.getByRole("button", { name: "Uninstall" }).click();
        await c.page
          .locator(
            '.sb-reader-toolbar-desk button[aria-label="Study companion"]'
          )
          .waitFor({ state: "detached", timeout: 5000 });
        await side
          .locator(".sb-extensions-tab", { hasText: /available/i })
          .click();
        await companion.getByRole("button", { name: "Install" }).click();
        await c.page
          .locator(
            '.sb-reader-toolbar-desk button[aria-label="Study companion"]'
          )
          .waitFor({ timeout: 5000 });
        step = "Download Extensions";
        const [dl] = await Promise.all([
          c.page.waitForEvent("download", { timeout: 5000 }),
          side.getByRole("button", { name: /download extensions/i }).click(),
        ]);
        if (dl.suggestedFilename() !== "seed-bible-extensions.json")
          throw new Error(`file ${dl.suggestedFilename()}`);
        return `tabs with counts; ${before} → ${after} cross-references at 1 per verse, reset; companion off and on; the set downloaded`;
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
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
      "Account → Extensions → Available → Twitch (watch) → Install; Watch → a channel name → Twitch's own player sits beside the text (read-only; nothing is sent to Twitch but the page load)",
    run: async (c) => {
      await c.open(CH);
      const acct = await c.openAccount();
      await c.installExtension(acct, "Twitch (watch)");
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
      "Signed in: Account → Extensions → Available → Transcript → Install; Transcript → choose a one-second recording; it is decoded on the device and marked done with an empty transcript — silence is never sent to the speech model, which would invent words for it",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const acct = await c.openAccount();
      await c.installExtension(acct, "Transcript");
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
      await c.pickColor(0);
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
      "Open the book picker: its All books / Old / New Testament filter; New Testament starts at Matthew and has no Genesis; All books shows both, titled",
    run: async (c) => {
      await c.open(CH);
      await c.page
        .locator(".sb-bible-reader-active .sb-bible-reader-title")
        .click();
      const picker = c.page.locator(".sb-selector-testament-select");
      await picker.waitFor({ timeout: 10000 });
      const chips = (await picker.locator("option").allInnerTexts()).map((x) =>
        x.trim()
      );
      await picker.selectOption("new");
      const books = (
        await c.page
          .locator(".sidebar-itm .sb-selector-book-name")
          .allInnerTexts()
      ).map((x) => x.trim());
      if (books[0] !== "Matthew" || books.includes("Genesis"))
        throw new Error(`New Testament lists ${books.slice(0, 3).join(", ")}`);
      await picker.selectOption("all");
      const titles = (
        await c.page
          .locator(".sb-selector-panel .testament-title")
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
      await c.settleTours();
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
      await c.page.locator(".sb-selector-panel .sidebar-itm").first().focus();
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
      if (!/For God so loved the world[\s\S]*\(John 3:16 BSB\)$/.test(clip))
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
      await c.page.locator("#translation-search-input").fill("BSB");
      const item = c.page
        .locator(".translation-option", { hasText: "(BSB)" })
        .first();
      await item.locator(".sb-offline-btn").first().click();
      await item
        .locator(".sb-offline-btn.downloaded")
        .waitFor({ timeout: 180000 });
      await c.page.keyboard.press("Escape");
      await c.page
        .locator(".sb-translation-picker")
        .waitFor({ state: "detached", timeout: 5000 });
      await c.context.setOffline(true);
      try {
        await c.page
          .locator(".sb-bible-reader-active .sb-bible-reader-title")
          .click();
        await c.page
          .locator('input[type="search"]')
          .first()
          .fill("Obadiah")
          .catch((e: Error) => {
            throw new Error(`book search: ${e.message.split("\n")[0]}`);
          });
        // A search down to one book opens its chapters already; a tap on the book would fold them.
        const one = c.page.getByRole("button", { name: /^1$/ }).first();
        if (!(await one.isVisible().catch(() => false)))
          await c.page
            .getByRole("button", { name: /^Obadiah$/ })
            .first()
            .click();
        await c.page
          .getByRole("button", { name: /^1$/ })
          .first()
          .click()
          .catch((e: Error) => {
            throw new Error(`chapter 1: ${e.message.split("\n")[0]}`);
          });
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
          .locator("#translation-search-input")
          .fill("BSB")
          .catch(() => undefined);
        await item
          .locator(".sb-offline-btn.downloaded")
          .click()
          .catch(() => undefined);
        await c.page
          .locator(".sb-offline-delete-confirm")
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
      await c.confirmDelete();
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
      "Signed in: start a session → QR code shows a scannable picture of the share link, with Save image; tapping it opens a large Scan to join view, Esc closes it",
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
        .first()
        .waitFor({ timeout: 5000 });
      await c
        .pane()
        .getByRole("button", { name: /show a larger qr code/i })
        .click();
      const big = c.page.getByRole("dialog", { name: "Scan to join" });
      await big.locator("img").waitFor({ timeout: 5000 });
      const w = (await big.locator("img").boundingBox())?.width ?? 0;
      if (w < 250) throw new Error(`the large code is ${w}px wide`);
      await c.page.keyboard.press("Escape");
      await big.waitFor({ state: "detached", timeout: 3000 });
      return `QR ${Math.round(src.length / 1024)} KB PNG with Save image; tapped, a ${Math.round(w)}px Scan to join view`;
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
      "On Matthew 26, Discover shows the old reader's picture cards under their authors (Expedition Bible, BibleProject); Read more opens a card's description; tapping the Upper Room video's picture plays it in place; Open page opens its own page in a new tab",
    run: async (c) => {
      let step = "";
      try {
        step = "cards";
        await c.open("/read/BSB/MAT/26");
        await c.pressToolbar("Discover");
        const pane = c.pane();
        const eb = pane
          .locator(".sb-content-cards", { hasText: /Expedition Bible/i })
          .first();
        await eb.waitFor({ timeout: 20000 });
        await pane
          .locator(".sb-content-cards", { hasText: /BibleProject/ })
          .first()
          .waitFor({ timeout: 5000 });
        const card = eb
          .locator(".sb-content-card", { hasText: /Last Supper/i })
          .first();
        if (!(await card.locator("img").count()))
          throw new Error("the card has no picture");
        step = "Read more";
        const more = card.getByRole("button", { name: /read more/i });
        if (await more.count()) {
          await more.click();
          await card.getByRole("button", { name: /read less/i }).waitFor();
        }
        step = "Open page";
        const [popup] = await Promise.all([
          c.page.waitForEvent("popup", { timeout: 10000 }),
          card.getByRole("button", { name: /open page/i }).click(),
        ]);
        const url = popup.url();
        await popup.close();
        if (!/youtube\.com/.test(url)) throw new Error(`opened ${url}`);
        step = "plays in place";
        await card.locator(".sb-content-card-picture").click();
        const player = card.locator("iframe.sb-content-card-player");
        await player.waitFor({ timeout: 5000 });
        const src = (await player.getAttribute("src")) ?? "";
        if (!/youtube-nocookie\.com\/embed\//.test(src))
          throw new Error(`player ${src}`);
        return `picture cards by author; the Upper Room video played in place and its page opened (${url.slice(0, 40)})`;
      } catch (e) {
        throw new Error(`${step}: ${(e as Error).message.split("\n")[0]}`);
      }
    },
  },
  {
    id: "G18",
    section: "12. Extensions",
    title: "People, places and events",
    rows: ["People, places and events"],
    checks:
      "On Genesis 12, Discover → People, places and events lists Abraham, Haran and Abraham enters Canaan under People, Places and Events (each with a count); Abraham's card shows his years, his relations and his passages; a relation opens its own card and Back returns; a passage opens in the reader",
    run: async (c) => {
      await c.open("/read/BSB/GEN/12");
      await c.pressToolbar("Discover");
      const section = c.pane().locator(".sb-content-section", {
        hasText: "People, places and events",
      });
      await c.waitText(section, /Abraham enters Canaan/, 20000);
      await c.waitText(section, /Haran/, 5000);
      // Each kind in its own folding section with a count, as the old reader shows them.
      await c.waitText(
        section,
        /People \d+[\s\S]*Places \d+[\s\S]*Events \d+/,
        5000
      );
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
        .locator(".sb-reader-toolbar-desk:not(.sb-reader-toolbar-folded)")
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
        .locator(".sb-reader-toolbar-desk:not(.sb-reader-toolbar-folded)")
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
      await c.confirmDelete();
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
            const bar = page.locator(".sb-reader-toolbar-desk");
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
                .locator(".sb-reader-toolbar-desk")
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
      "On a desktop the bar is ‹ Books · Search · Discover · the extensions · More ›, each with its word under the icon; Books opens the book picker and Search opens the floating search box, ready to type in; More lists Sign in, Live session, Today, Notes, Library, Your content, Full screen and Themes. On a phone every one of those actions is in its five tabs (Today · You · Bible · Search · More) or the More sheet",
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
      // A phone's five tabs (Sign in and Your content are under You) and its More sheet.
      const reachablePhone = async (page: import("playwright").Page) => {
        const tabs = await page
          .locator(".sb-phone-nav .sb-reader-toolbar-mobile-tab-button:visible")
          .evaluateAll((bs) =>
            bs.map((b) => b.getAttribute("aria-label") ?? "")
          );
        await page.locator(".sb-phone-more-tab > button").click();
        const inMore = (
          await page
            .locator(".sb-mobile-more-menu button:visible")
            .allInnerTexts()
        ).map((t) => t.replace(/\s+/g, " ").trim());
        await page.locator(".sb-phone-more-tab > button").click();
        const via: Record<string, string> = {
          "Sign in": "You",
          "Your content": "You",
        };
        const missing = all.filter(
          (a) =>
            !tabs.includes(via[a] ?? a) && !inMore.some((m) => m.endsWith(a))
        );
        return { inBar: tabs, inMore, missing };
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
          () =>
            document.activeElement?.closest(".sb-floating-search-panel") !=
            null,
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
        const p = await reachablePhone(phone);
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
      await c.savePicker();
      await head
        .locator(".sb-bible-reader-save-button .sb-icon-filled")
        .waitFor({ timeout: 5000 });
      await head.getByRole("button", { name: "Save chapter" }).click();
      await c.savePicker({ remove: true });
      await head.getByRole("button", { name: "Discover" }).click();
      await c.pane().waitFor({ timeout: 5000 });
      if (!/discover/i.test(await c.paneText()))
        throw new Error("Discover did not open the Discover pane");
      await head.getByRole("button", { name: "Share" }).click();
      const dialog = c.page.getByRole("dialog");
      await dialog.waitFor({ timeout: 5000 });
      const shown = await dialog.innerText();
      if (!/share a link[\s\S]*embed/i.test(shown))
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
      await c.savePicker();
      await c.page
        .locator(
          ".sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-bookmark-button"
        )
        .click();
      await c.bookmarkPicker();
      await side.getByRole("button", { name: "Bookmarks" }).click();
      await c.waitText(side.locator(".sb-bookmarks-panel"), /john 3/i, 5000);
      // A bookmark opens in the translation on screen, so it goes before the saves are tried from WEB.
      await c.page
        .locator(
          ".sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-bookmark-button"
        )
        .click();
      await c.bookmarkPicker({ remove: true });
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
      await c.savePicker({ remove: true });
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
    id: "HL1",
    section: "4. Marking the text",
    title: "Clearing or re-colouring part of a highlight keeps the rest",
    rows: ["Highlight (6 colours)"],
    checks:
      "Highlight John 3:14–17 yellow; clear verse 15: 14, 16 and 17 stay yellow; colour 16 green: 17 stays yellow; clear them all",
    run: async (c) => {
      await c.open(CH);
      const colourOf = (n: number) =>
        c.page
          .locator(`.sb-bible-reader-active [data-verse-number="${n}"]`)
          .first()
          .evaluate((el) => {
            const h = el.closest(".sb-highlight");
            return h
              ? (h.className.match(/sb-highlight-([a-z]+)/)?.[1] ?? "")
              : "";
          });
      // A verse is picked by its number: a verse that starts mid-line has the one before it at its left edge.
      const pick = async (n: number, shift = false) => {
        await c.page
          .locator(
            `.sb-bible-reader-active [data-verse-number="${n}"] .sb-verse-number`
          )
          .first()
          .click(shift ? { modifiers: ["Shift"] } : {});
        await c.page.locator(".sb-verse-toolbar").waitFor({ timeout: 5000 });
      };
      await pick(14);
      await pick(17, true);
      await c.page.locator(".sb-verse-toolbar-highlight-trigger").click();
      await c.page
        .locator('.sb-verse-toolbar button[aria-label="Highlight yellow"]')
        .click();
      await c.page.keyboard.press("Escape");
      for (const n of [14, 15, 16, 17])
        if ((await colourOf(n)) !== "yellow")
          throw new Error(`verse ${n} not yellow after highlighting 14–17`);
      await pick(15);
      await c.clearHighlight();
      await c.page.keyboard.press("Escape");
      // The change lands in a moment (the old highlight goes, the kept pieces follow): wait for it.
      const settle = async (verses: number[], want: string) => {
        let got = "";
        for (let t = 0; t < 30; t++) {
          got = (await Promise.all(verses.map(colourOf))).join();
          if (got === want) break;
          await c.page.waitForTimeout(100);
        }
        return got.split(",");
      };
      const after = await settle([14, 15, 16, 17], "yellow,,yellow,yellow");
      if (after.join() !== "yellow,,yellow,yellow")
        throw new Error(`after clearing 15: ${after.join(", ")} (14–17)`);
      await pick(16);
      await c.page.locator(".sb-verse-toolbar-highlight-trigger").click();
      await c.page
        .locator('.sb-verse-toolbar button[aria-label="Highlight green"]')
        .click();
      await c.page.keyboard.press("Escape");
      const recoloured = await settle([16, 17], "green,yellow");
      if (recoloured.join() !== "green,yellow")
        throw new Error(
          `after colouring 16 green: 16 ${recoloured[0]}, 17 ${recoloured[1]}`
        );
      for (const n of [14, 16, 17]) {
        await pick(n);
        await c.clearHighlight();
        await c.page.keyboard.press("Escape");
      }
      return "14–17 yellow; clearing 15 kept 14, 16, 17; colouring 16 green kept 17 yellow; cleared";
    },
  },
  {
    id: "TH1",
    section: "3. Reading",
    title: "Theme: Light, Dark or System",
    rows: ["Light / dark theme"],
    checks:
      "Settings → Display & Theme shows the old reader's gallery — Light, Dark, System; Dark makes the reader dark; More → Themes flips it; System brings back the device's choice (light in this browser)",
    run: async (c) => {
      await c.open(CH);
      const theme = () =>
        c.page.evaluate(() => document.documentElement.dataset["sbTheme"]);
      const side = c.page.locator(".sb-tabs-sidebar");
      await side.getByRole("button", { name: "Open settings" }).click();
      await side.getByText("Display & Theme").click();
      const cards = side.locator(".sb-theme-ready-card");
      if ((await cards.count()) !== 3)
        throw new Error(`${await cards.count()} theme cards`);
      await cards.filter({ hasText: "Dark" }).click();
      await c.page.waitForFunction(
        () => document.documentElement.dataset["sbTheme"] === "dark",
        undefined,
        { timeout: 5000 }
      );
      await side.getByRole("button", { name: "Close Settings" }).click();
      await c.pressToolbar("Themes");
      await c.page.waitForFunction(
        () => document.documentElement.dataset["sbTheme"] === "light",
        undefined,
        { timeout: 5000 }
      );
      await c.pressToolbar("Themes");
      if ((await theme()) !== "dark")
        throw new Error("More → Themes did not flip back to dark");
      await side.getByRole("button", { name: "Open settings" }).click();
      await side.getByText("Display & Theme").click();
      await side
        .locator(".sb-theme-ready-card")
        .filter({ hasText: /^System/ })
        .click();
      await c.page
        .waitForFunction(
          () => document.documentElement.dataset["sbTheme"] === "light",
          undefined,
          { timeout: 5000 }
        )
        .catch(() => {
          throw new Error("System did not bring back the device's light theme");
        });
      return "three cards; Dark → dark; More → Themes flipped it; System → light again (the device's choice)";
    },
  },
  {
    id: "NT1",
    section: "3. Reading",
    title: "A link to a translation that isn't served",
    rows: ["Open a book and chapter"],
    checks:
      "A link to a translation the scripture agent does not serve (/read/WEB/ROM/8) says so instead of a dead Retry, with Read in BSB — which opens Romans 8 in BSB — and Choose a translation",
    run: async (c) => {
      await c.open("/read/WEB/ROM/8");
      const err = c.page.locator(".sb-bible-reader-active .sb-reader-error");
      await c.waitText(err, /isn't available here/i, 20000);
      await err
        .getByRole("button", { name: /choose a translation/i })
        .waitFor({ timeout: 3000 });
      await err.getByRole("button", { name: /read in bsb/i }).click();
      await c.page.waitForURL(/\/read\/BSB\/ROM\/8/, { timeout: 15000 });
      await c.verse(28).waitFor({ timeout: 20000 });
      return "WEB said it isn't available here; Read in BSB opened Romans 8 in BSB";
    },
  },
  {
    id: "LK1",
    section: "13. Links and embedding",
    title: "seedbible.org links open here",
    rows: ["Links from seedbible.org"],
    checks:
      "The old reader's links land on the same place: /en/BSB/john/3?verse=16 opens John 3 with verse 16 selected; /BSB/romans/8 (no language) opens Romans 8; /en/BSB/1-samuel/17 opens 1 Samuel 17; /es/BSB/john/3 opens John 3 in Spanish; /?translation=BSB&book=genesis&chapter=12 opens Genesis 12",
    run: async (c) => {
      const seen: string[] = [];
      const land = async (from: string, want: RegExp) => {
        await c.page.goto(`${BASE}${from}`, { waitUntil: "domcontentloaded" });
        await c.page.waitForURL(want, { timeout: 15000 }).catch(() => {
          throw new Error(`${from} landed at ${c.page.url()}`);
        });
        await c.page
          .locator(".sb-app:not(.sb-app-ssr)")
          .waitFor({ timeout: 20000 });
        seen.push(`${from} → ${new URL(c.page.url()).pathname}`);
      };
      await land("/en/BSB/john/3?verse=16", /\/read\/BSB\/JHN\/3/);
      await c.dismissWelcome();
      await c.waitText(c.page.locator(".sb-verse-toolbar"), /John 3:16/, 15000);
      await land("/BSB/romans/8", /\/read\/BSB\/ROM\/8/);
      await land("/en/BSB/1-samuel/17", /\/read\/BSB\/1SA\/17/);
      await land("/es/BSB/john/3", /\/read\/BSB\/JHN\/3/);
      await c.page
        .waitForFunction(
          () => document.documentElement.lang === "es",
          undefined,
          { timeout: 10000 }
        )
        .catch(() => {
          throw new Error("/es/… did not switch the interface to Spanish");
        });
      await c.page.evaluate(() => localStorage.removeItem("sbr.language"));
      await land(
        "/?translation=BSB&book=genesis&chapter=12",
        /\/read\/BSB\/GEN\/12/
      );
      return `${seen.join("; ")}; verse 16 selected; Spanish taken from /es/`;
    },
  },
  {
    id: "PR1",
    timeoutMs: 240_000,
    section: "2. Getting in",
    title: "Profile",
    rows: ["Profile"],
    checks:
      "The profile circle at the bottom of the sidebar opens Profile as a full page: signed out, the old reader's card — Sign in to keep your highlights… — with Log in; signed in, the card with the name and the Home name, ✎ to Edit profile (← back to Profile), Your content, Friends (with its count line) and Account settings rows, and Sign out",
    run: async (c) => {
      await c.open(CH);
      const circle = c.page.locator(".sb-sidebar-profile-button");
      await circle.click();
      const pane = c.pane();
      await c.waitText(pane, /sign in to keep your highlights/i, 5000);
      await pane
        .getByRole("button", { name: /^log in$/i })
        .waitFor({ timeout: 3000 });
      await pane.locator(".sb-pane-close").first().click();
      const who = await c.signInAsSample();
      await circle.click();
      await c.waitText(
        pane,
        /your content[\s\S]*friends[\s\S]*account settings/i,
        10000
      );
      const card = (
        await pane.locator(".sb-profile-identity").innerText()
      ).replace(/\s+/g, " ");
      await pane.getByRole("button", { name: "Edit profile" }).first().click();
      await c.waitText(pane, /edit profile/i, 5000);
      await pane.getByRole("button", { name: "Back" }).click();
      await pane.locator(".sb-profile-row", { hasText: "Friends" }).click();
      await c.page.locator(".sb-friends-pane").waitFor({ timeout: 5000 });
      await circle.click();
      await pane
        .locator(".sb-profile-row", { hasText: "Your content" })
        .click();
      await c.waitText(c.pane(), /your content/i, 5000);
      await circle.click();
      await pane
        .locator(".sb-profile-row", { hasText: "Account settings" })
        .click();
      await c.page.locator(".sb-account-pane").waitFor({ timeout: 5000 });
      await circle.click();
      await pane.getByRole("button", { name: /sign out/i }).click();
      await c.page
        .locator(
          ".sb-sidebar-profile-button:not(.sb-sidebar-profile-button-in)"
        )
        .waitFor({ timeout: 30000 });
      return `signed out: Log in card; signed in as ${who}: "${card.slice(0, 60)}"; Edit profile and back; Friends, Your content, Account settings opened; signed out`;
    },
  },
  {
    id: "PH1",
    section: "13. Links and embedding",
    title: "A phone: the old reader's phone shell",
    rows: ["Phone layout"],
    checks:
      "On an iPhone 13: a thin bar at the top (the translation, then ☆, bookmark, share and text settings), the chapter's title centred and large (John over a big 3), and along the bottom play and the chapter pill ‹ John 3 › above the five tabs Today · You · Bible · Search · More, with Bible lit. The pill's › goes to John 4 and its label opens the book picker; Bible on the text opens it too. More → Tabs opens the Tabs drawer, which closes with its ✕ and with a tap beside it; reading down scrolls the page itself; signed out, You carries the count of changes waiting and opens the sign-in pane",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      c.watch(page);
      let step = "open";
      try {
        step = "await c.open(CH page)";
        await c.open(CH, page);
        const head = page.locator(
          ".sb-bible-reader-active .sb-bible-reader-mobile-header"
        );
        step = "await head.waitFor( timeout 20000 )";
        await head.waitFor({ timeout: 20000 });
        const headBox = (await head.boundingBox())!;
        if (headBox.y > 4 || headBox.height > 60)
          throw new Error(
            `the top bar is at y=${headBox.y}, ${headBox.height}px tall`
          );
        step = "const actions await head";
        const actions = await head
          .locator("button:visible")
          .evaluateAll((bs) =>
            bs.map((b) => b.getAttribute("aria-label") ?? "")
          );
        const wantHead = [
          "Save chapter",
          "Bookmark this chapter",
          "Share",
          "Text settings",
        ];
        if (
          !wantHead.every((w) => actions.includes(w)) ||
          !/^Change translation/.test(actions[0] ?? "")
        )
          throw new Error(`top bar: ${actions.join(", ")}`);
        const title = page.locator(
          ".sb-bible-reader-active .sb-bible-reader-mobile-content-title"
        );
        const t = (await title.innerText()).replace(/\s+/g, " ").trim();
        if (t !== "John 3") throw new Error(`title reads "${t}"`);
        step = "const tabs await page";
        const tabs = await page
          .locator(".sb-phone-nav .sb-reader-toolbar-mobile-tab-button")
          .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
        if (tabs.join() !== "Today,You,Bible,Search,More")
          throw new Error(`tabs: ${tabs.join(", ")}`);
        const bible = page.locator('.sb-phone-nav button[aria-label="Bible"]');
        if (!(await bible.getAttribute("class"))!.includes("active"))
          throw new Error("Bible is not lit on the text");
        const nav = page.locator(".sb-reader-floating-nav");
        const navBox = (await nav.boundingBox())!;
        const tabBox = (await page
          .locator(".sb-phone-nav .sb-reader-toolbar-mobile-layout")
          .boundingBox())!;
        if (!(navBox.y < tabBox.y && tabBox.y + tabBox.height >= 660))
          throw new Error(
            "the chapter pill and the tabs are not along the bottom"
          );
        step = "await nav.getByRole( button name Next Chapter ).clic";
        await nav.getByRole("button", { name: "Next Chapter" }).click();
        step = "await page.waitForURL( JHN 4 timeout 15000 )";
        await page.waitForURL(/\/JHN\/4$/, { timeout: 15000 });
        step = "await nav.locator( .sb-reader-floating-nav-label ).click()";
        await nav.locator(".sb-reader-floating-nav-label").click();
        step = "await page.locator( .sb-selector-panel ).waitFor( timeout";
        await page.locator(".sb-selector-panel").waitFor({ timeout: 5000 });
        step = "await page";
        await page
          .locator(".sb-selector-panel .sb-selector-mobile-close")
          .first()
          .click();
        step = "await bible.click()";
        await bible.click();
        step = "await page.locator( .sb-selector-panel ).waitFor( timeout";
        await page.locator(".sb-selector-panel").waitFor({ timeout: 5000 });
        step = "await page";
        await page
          .locator(".sb-selector-panel .sb-selector-mobile-close")
          .first()
          .click();
        // More → Tabs: the drawer, closed by its ✕ and by a tap beside it.
        const drawer = page.locator(".sb-tabs-sidebar-drawer");
        const openTabs = async () => {
          await page.locator(".sb-phone-more-tab > button").click();
          await page
            .locator(".sb-mobile-more-menu button", { hasText: "Tabs" })
            .click();
          await drawer.waitFor({ timeout: 3000 });
        };
        step = "await openTabs()";
        await openTabs();
        step = "await page.locator( .sb-sidebar-drawer-close ).click()";
        await page.locator(".sb-sidebar-drawer-close").click();
        step = "await drawer.waitFor( state detached timeout 3000 )";
        await drawer.waitFor({ state: "detached", timeout: 3000 });
        step = "await openTabs()";
        await openTabs();
        step = "await page.mouse.click(375 300)";
        await page.mouse.click(375, 300);
        step = "await drawer.waitFor( state detached timeout 3000 ).c";
        await drawer.waitFor({ state: "detached", timeout: 3000 }).catch(() => {
          throw new Error("a tap beside the Tabs drawer did not close it");
        });
        step = "await page.mouse.wheel(0 900)";
        await page.mouse.wheel(0, 900);
        step = "await page";
        await page
          .waitForFunction(() => window.scrollY > 100, undefined, {
            timeout: 5000,
          })
          .catch(() => {
            throw new Error("reading down did not scroll the page");
          });
        step = "await page.evaluate(() window.scrollTo(0 0))";
        await page.evaluate(() => window.scrollTo(0, 0));
        step = "await c.selectVerse(16 page)";
        await c.selectVerse(16, page);
        step = "pick a colour";
        await c.pickColor(0, page);
        step = "await page.keyboard.press( Escape )";
        await page.keyboard.press("Escape");
        const you = page.locator('.sb-phone-nav button[aria-label="You"]');
        step = "await you";
        await you
          .locator(".sb-reader-toolbar-unread-indicator")
          .waitFor({ timeout: 5000 });
        step = "await you.click()";
        await you.click();
        step = "await page";
        await page
          .getByRole("button", { name: /sign in with faithnet/i })
          .waitFor({ timeout: 5000 });
        return `top bar: ${actions.length} buttons; title "${t}"; tabs ${tabs.join(" · ")}; › and the pill and Bible worked; the Tabs drawer closed by ✕ and by a tap beside it; the page scrolled; You carried the waiting count and opened sign-in`;
      } catch (e) {
        throw new Error(
          `at ${step}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`
        );
      } finally {
        step = "await ctx.close()";
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
        // Without the terms ticked it says so and goes nowhere (the old reader's).
        await page
          .locator(".sb-app-pane")
          .getByRole("button", { name: /sign in with faithnet/i })
          .click();
        await c.waitText(
          page.locator(".sb-app-pane"),
          /agree to the terms of service to continue/i,
          5000
        );
        await page.locator("#sb-login-terms").check();
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
          .locator(".sb-sidebar-profile-button-in")
          .waitFor({ timeout: 5000 });
        await c.openAccount(page);
        await page.getByRole("button", { name: /^sign out$/i }).click();
        await page.waitForURL(/seed-reader\.faithnet\.io/, { timeout: 30000 });
        await c.dismissWelcome(page);
        await page
          .locator(
            ".sb-sidebar-profile-button:not(.sb-sidebar-profile-button-in)"
          )
          .waitFor({ timeout: 20000 });
        // Signed out of the Home too: signing in again asks who you are instead of reusing the last person.
        await c.pressToolbar("Sign in", page);
        await page.locator("#sb-login-terms").check();
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
  {
    id: "TB2",
    section: "2. Tabs and panes",
    title: "Tab marks and the collapsed rail",
    rows: ["Sidebar buttons"],
    checks:
      "A bookmark on John 3 puts its ribbon on the tab's row, and Listen puts a speaker there while it plays. With the sidebar closed to its rail, the tab is the old reader's tile: 'JHN 3', the speaker, and a label that says it is playing audio",
    run: async (c) => {
      await c.open(CH);
      const page = c.page;
      const row = page.locator(".sb-tab-row-selected");
      await page
        .locator(
          ".sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-bookmark-button"
        )
        .click();
      await c.bookmarkPicker();
      try {
        await row
          .locator(".sb-tab-bookmark-marker svg")
          .waitFor({ timeout: 5000 })
          .catch(() => {
            throw new Error("no bookmark ribbon on the tab's row");
          });
        const head = page.locator(
          ".sb-bible-reader-active .sb-bible-reader-actions"
        );
        await head.getByRole("button", { name: "Listen" }).click();
        await row
          .locator(".sb-tab-audio-icon")
          .waitFor({ timeout: 15000 })
          .catch(() => {
            throw new Error("no speaker on the tab's row while it plays");
          });
        await page.locator(".sb-sidebar-collapse-button").click();
        const tile = page.locator(".sb-collapsed-tab-tile-selected");
        await tile.waitFor({ timeout: 3000 });
        const title = (
          await tile.locator(".sb-collapsed-tab-title").innerText()
        ).trim();
        if (title !== "JHN 3") throw new Error(`tile title: ${title}`);
        await tile
          .locator(".sb-collapsed-tab-audio-icon")
          .waitFor({ timeout: 3000 });
        const label = (await tile.getAttribute("aria-label")) ?? "";
        if (!/playing audio/i.test(label))
          throw new Error(`tile label: ${label}`);
        await head.getByRole("button", { name: "Pause" }).click();
        await tile
          .locator(".sb-collapsed-tab-audio-icon")
          .waitFor({ state: "detached", timeout: 3000 });
        await page.locator(".sb-sidebar-collapse-button").click();
        return `row: ribbon and speaker; rail tile '${title}', '${label}'; the speaker went with Pause`;
      } finally {
        if (await page.locator(".sb-collapsed-tab-tile").count())
          await page.locator(".sb-sidebar-collapse-button").click();
        await page
          .locator(
            ".sb-bible-reader-active .sb-bible-reader-header .sb-bible-reader-bookmark-button"
          )
          .click();
        await c.bookmarkPicker({ remove: true });
      }
    },
  },
  {
    id: "SW1",
    section: "3. Reading",
    title: "The phone's swipe shows the next chapter",
    rows: ["Next / previous chapter"],
    checks:
      "On an iPhone 13 at John 3, dragging the page to the left moves it with the finger and John 4 slides in beside it with its title and text; letting go part-way springs back to John 3, and a full swipe lands on John 4. Dragging right from John 4 shows John 3 coming in from the left",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      c.watch(page);
      try {
        await c.open(CH, page);
        await c.settleTours(page);
        const reader = page.locator(".sb-bible-reader-active").first();
        const preview = (re: RegExp) =>
          page
            .locator(".sb-reader-swipe-preview")
            .filter({ hasText: re })
            .first();
        await preview(/John 4/)
          .locator(".sb-chapter-content [data-verse-number]")
          .first()
          .waitFor({ state: "attached", timeout: 10000 })
          .catch(() => {
            throw new Error("John 4 was not fetched ahead");
          });
        // Touch events by hand: the reader follows touchstart/move/end.
        const drag = (from: number, to: number, release: boolean) =>
          page.evaluate(
            ({ from, to, release }) => {
              const el = document.querySelector(
                ".sb-bible-reader-active .sb-chapter-content"
              )!;
              const at = (x: number) =>
                new Touch({
                  identifier: 1,
                  target: el,
                  clientX: x,
                  clientY: 300,
                });
              const fire = (type: string, x: number) =>
                el.dispatchEvent(
                  new TouchEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    touches: type === "touchend" ? [] : [at(x)],
                    changedTouches: [at(x)],
                  })
                );
              fire("touchstart", from);
              for (let i = 1; i <= 10; i++)
                fire("touchmove", from + ((to - from) * i) / 10);
              if (release) fire("touchend", to);
            },
            { from, to, release }
          );
        const leftOf = (sel: ReturnType<typeof preview>) =>
          sel.evaluate((el) => el.getBoundingClientRect().left);
        await drag(300, 150, false);
        const next = preview(/John 4/);
        if (!(await next.isVisible()))
          throw new Error("John 4 did not show while dragging");
        const mid = await leftOf(next);
        if (!(mid > 150 && mid < 300))
          throw new Error(`John 4 sits at ${Math.round(mid)}px mid-drag`);
        // Brought back and let go: John 3 stays.
        await page.evaluate(() => {
          const el = document.querySelector(
            ".sb-bible-reader-active .sb-chapter-content"
          )!;
          const t = new Touch({
            identifier: 1,
            target: el,
            clientX: 285,
            clientY: 300,
          });
          el.dispatchEvent(
            new TouchEvent("touchmove", {
              bubbles: true,
              cancelable: true,
              touches: [t],
              changedTouches: [t],
            })
          );
          el.dispatchEvent(
            new TouchEvent("touchend", {
              bubbles: true,
              cancelable: true,
              changedTouches: [t],
            })
          );
        });
        await drag(300, 270, true);
        await page.waitForTimeout(400);
        if (!/\/JHN\/3/.test(page.url()))
          throw new Error(`a short drag turned the page: ${page.url()}`);
        await drag(320, 40, true);
        await page.waitForURL(/\/JHN\/4/, { timeout: 5000 }).catch(() => {
          throw new Error("a full swipe did not land on John 4");
        });
        await reader
          .locator(".sb-bible-reader-mobile-header-title")
          .waitFor({ timeout: 3000 });
        await preview(/John 3/)
          .locator(".sb-chapter-content [data-verse-number]")
          .first()
          .waitFor({ state: "attached", timeout: 10000 });
        await drag(100, 250, false);
        const back = await leftOf(preview(/John 3/));
        if (!(back < 0 && back > -390))
          throw new Error(
            `John 3 sits at ${Math.round(back)}px dragging right`
          );
        await drag(250, 250, true);
        return `mid-drag John 4 at ${Math.round(mid)}px; a short drag stayed; a full one landed on John 4; dragging right brought John 3 in at ${Math.round(back)}px`;
      } finally {
        await ctx.close();
      }
    },
  },
  {
    id: "LS1",
    section: "1. Getting started",
    title: "Switch language?",
    rows: ["Interface language"],
    checks:
      "Picking a Spanish Bible from the English interface asks '¿Cambiar de idioma?' in Spanish with Cambiar, No cambies and Nunca vuelvas a preguntar; No cambies keeps English and it is not asked again in that tab. In a new tab Cambiar turns the interface Spanish. Back to an English Bible it asks in English; Never Ask Again stops it for good",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const fresh = async () => {
        const page = await ctx.newPage();
        c.watch(page);
        await c.open("/read/BSB/JHN/3", page);
        await c.settleTours(page);
        return page;
      };
      const pickIn = async (page: Page, language: RegExp, search: string) => {
        await page
          .locator(".sb-bible-reader-active .sb-bible-reader-translation")
          .click();
        const win = page.locator(".sb-translation-picker .modal");
        await win
          .locator(".sb-translation-list-language")
          .first()
          .waitFor({ timeout: 40000 });
        await c.settleTours(page);
        await win.locator("#translation-search-input").fill(search);
        const section = win
          .locator(".sb-translation-list-language")
          .filter({ hasText: language })
          .first();
        await section.waitFor({ timeout: 10000 });
        const option = win
          .locator('[role="option"].translation-option:visible')
          .first();
        await option.waitFor({ timeout: 1500 }).catch(() => section.click());
        await option.click({ timeout: 5000 });
        await win.waitFor({ state: "detached", timeout: 5000 });
      };
      const prompt = (page: Page) =>
        page.locator(".sb-onboarding-card[role=dialog]");
      try {
        let page = await fresh();
        await pickIn(page, /español/i, "Español");
        await c.waitText(prompt(page), /¿cambiar de idioma\?/i, 5000);
        const buttons = await prompt(page).locator("button").allInnerTexts();
        if (buttons.join() !== "Cambiar,No cambies,Nunca vuelvas a preguntar")
          throw new Error(`buttons: ${buttons.join(", ")}`);
        await prompt(page).getByRole("button", { name: "No cambies" }).click();
        await prompt(page).waitFor({ state: "detached", timeout: 3000 });
        if ((await page.evaluate(() => document.documentElement.lang)) === "es")
          throw new Error("No cambies switched the interface");
        await pickIn(page, /english/i, "English");
        await pickIn(page, /español/i, "Español");
        await page.waitForTimeout(800);
        if (await prompt(page).count())
          throw new Error("asked twice in one tab");
        await page.close();

        page = await fresh();
        await pickIn(page, /español/i, "Español");
        await prompt(page).getByRole("button", { name: "Cambiar" }).click();
        await page
          .waitForFunction(() => document.documentElement.lang === "es", null, {
            timeout: 5000,
          })
          .catch(() => {
            throw new Error("Cambiar did not switch the interface to Spanish");
          });
        await page.close();

        page = await fresh();
        await pickIn(page, /english/i, "English");
        await c.waitText(prompt(page), /switch language\?/i, 5000);
        await prompt(page)
          .getByRole("button", { name: "Never Ask Again" })
          .click();
        await page.close();

        page = await fresh();
        await pickIn(page, /english/i, "English");
        await page.waitForTimeout(800);
        if (await prompt(page).count())
          throw new Error("asked again after Never Ask Again");
        return "asked in Spanish with its three answers; No cambies kept English and it stayed quiet in that tab; Cambiar turned Spanish; back to English it asked in English; Never Ask Again stopped it";
      } finally {
        await ctx.close();
      }
    },
  },
  {
    id: "EM1",
    section: "13. Links and embedding",
    title: "The embed's own controls",
    rows: ["Embed in another site"],
    checks:
      "John 3 embedded (?embed=minimal) has only Open in New Tab and Text settings in its header, and the ‹ John 3 › bar along the bottom: › goes to John 4. Open in New Tab opens John 4 in Seed Bible itself, without the embed. A verse offers Copy, Compare, Share and Cancel — no Highlight, Save or Note. Text settings opens the Theme & text sheet without 'Go to all settings'",
    run: async (c) => {
      const page = c.page;
      await c.open(`${CH}?embed=minimal`);
      const head = page.locator(
        ".sb-bible-reader-active .sb-bible-reader-actions"
      );
      const actions = await head
        .locator("button:visible")
        .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
      if (actions.join() !== "Open in New Tab,Text settings")
        throw new Error(`header: ${actions.join(", ")}`);
      const bar = page.locator(".sb-reader-toolbar-wrap-embed");
      await c.waitText(bar, /john\s*3/i, 5000);
      await bar.getByRole("button", { name: "Next Chapter" }).click();
      await c.waitText(bar, /john\s*4/i, 8000);
      const [tab] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 5000 }),
        head.getByRole("button", { name: "Open in New Tab" }).click(),
      ]);
      await tab.waitForLoadState("domcontentloaded");
      const opened = tab.url();
      await tab.close();
      if (!/\/read\/BSB\/JHN\/4/.test(opened) || /embed/.test(opened))
        throw new Error(`Open in New Tab opened ${opened}`);
      await c.verse(3).locator(".sb-verse-number").first().click();
      const tools = page.locator(".sb-verse-toolbar");
      await tools.waitFor({ timeout: 5000 });
      const labels = await tools
        .locator("button:visible")
        .evaluateAll((bs) =>
          bs.map(
            (b) => b.getAttribute("aria-label") ?? (b.textContent ?? "").trim()
          )
        );
      const joined = labels.join(" · ");
      if (
        /highlight|save|note/i.test(joined) ||
        !/copy/i.test(joined) ||
        !/share/i.test(joined)
      )
        throw new Error(`verse toolbar: ${joined}`);
      await page.keyboard.press("Escape");
      await page
        .locator(".sb-verse-toolbar")
        .waitFor({ state: "detached", timeout: 3000 })
        .catch(() => undefined);
      await head.getByRole("button", { name: "Text settings" }).click();
      const sheet = page.locator(".sb-mobile-settings-sheet");
      await sheet.waitFor({ timeout: 3000 });
      if (await sheet.getByText(/go to all settings/i).count())
        throw new Error("the sheet offers Go to all settings in an embed");
      await page.keyboard.press("Escape");
      return `header: ${actions.join(" · ")}; the bar went to John 4; Open in New Tab opened ${new URL(opened).pathname}; verse: ${joined}; the sheet without Go to all settings`;
    },
  },
  {
    id: "LK2",
    section: "13. Links and embedding",
    title: "The old reader's page links",
    rows: ["Links from seedbible.org"],
    checks:
      "/en/about opens About; ?today=open opens Today; ?search=open opens the floating search; ?chatFirst=true puts Chat first on the desktop bar outside a live session, and on a phone makes Chat the fourth tab with Search under More",
    run: async (c) => {
      const page = c.page;
      const seen: string[] = [];
      await c.open("/en/about");
      await page
        .locator(".sb-about")
        .waitFor({ timeout: 8000 })
        .catch(() => {
          throw new Error("/en/about did not open About");
        });
      seen.push("/en/about → About");
      await c.open(`${CH}?today=open`);
      await page
        .locator(".sb-today-container")
        .waitFor({ timeout: 8000 })
        .catch(() => {
          throw new Error("?today=open did not open Today");
        });
      seen.push("?today=open → Today");
      await c.open(`${CH}?search=open`);
      await page
        .locator(".sb-floating-search-panel")
        .waitFor({ timeout: 8000 })
        .catch(() => {
          throw new Error("?search=open did not open the search box");
        });
      seen.push("?search=open → search");
      await c.open(`${CH}?chatFirst=true`);
      const words = await page
        .locator(".sb-reader-toolbar .sb-reader-toolbar-button-label:visible")
        .allInnerTexts();
      const books = words.indexOf("Books");
      const chatAt = words.indexOf("Chat");
      if (chatAt < 0)
        throw new Error(`no Chat on the bar: ${words.join(", ")}`);
      const before = words
        .slice(0, chatAt)
        .filter((w) => !["Books", "Search"].includes(w));
      if (books < 0 || before.length)
        throw new Error(
          `Chat is not first after the chapter controls: ${words.join(", ")}`
        );
      seen.push(`desktop: ${words.slice(0, chatAt + 2).join(" · ")}`);
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
      });
      const phone = await ctx.newPage();
      c.watch(phone);
      try {
        await c.open(`${CH}?chatFirst=true`, phone);
        await c.settleTours(phone);
        const tabs = await phone
          .locator(".sb-phone-nav .sb-reader-toolbar-mobile-tab-button:visible")
          .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
        if (tabs.slice(0, 4).join() !== "Today,You,Bible,Chat")
          throw new Error(`phone tabs: ${tabs.join(", ")}`);
        await phone.locator(".sb-phone-more-tab > button").click();
        await phone
          .locator(".sb-mobile-more-menu")
          .getByRole("menuitem", { name: "Search" })
          .or(
            phone.locator(".sb-mobile-more-menu button", { hasText: "Search" })
          )
          .first()
          .waitFor({ timeout: 3000 })
          .catch(() => {
            throw new Error("Search is not under More");
          });
        seen.push(`phone: ${tabs.join(" · ")}, Search under More`);
      } finally {
        await ctx.close();
      }
      return seen.join("; ");
    },
  },
  {
    id: "RD2",
    section: "3. Reading",
    title: "Footnote links, an embed's marks, the phone's note count",
    rows: ["Headings, poetry, red letters, footnotes"],
    checks:
      "John 1:23's footnote 'Isaiah 40:3' is a link that opens Isaiah 40 with verse 3 chosen; a highlight on John 3:3 is not drawn when John 3 is embedded; with a note on John 3:16, a phone shows a note marker in the margin level with verse 16 and the note count in its header; each opens the note",
    run: async (c) => {
      const page = c.page;
      let step = "";
      try {
        step = "a footnote's reference";
        await c.open("/read/BSB/JHN/1");
        await c.verse(23).locator(".sb-inline-footnote-button").first().click();
        const link = page
          .locator(".sb-footnote-modal-content a")
          .filter({ hasText: "Isaiah 40:3" });
        await link.waitFor({ timeout: 5000 });
        await link.click();
        await page.waitForURL(/\/read\/BSB\/ISA\/40/, { timeout: 8000 });
        await page
          .locator(
            '.sb-bible-reader-active [data-verse-number="3"].sb-verse-selected, .sb-bible-reader-active .sb-verse-selected[data-verse-number="3"]'
          )
          .first()
          .waitFor({ timeout: 8000 })
          .catch(() => {
            throw new Error("Isaiah 40:3 is not chosen");
          });
        step = "the embed leaves out the visitor's highlight";
        await c.open(CH);
        await c.selectVerse(3);
        await c.pickColor(0);
        const fill = ".sb-bible-reader-active [data-highlight-fill]";
        await page.locator(fill).first().waitFor({ timeout: 5000 });
        await c.open(`${CH}?embed=minimal`);
        await c.verse(3).waitFor({ timeout: 20000 });
        await page.waitForTimeout(800);
        if (await page.locator(fill).count())
          throw new Error("the embed draws the visitor's highlight");
        await c.open(CH);
        await page.locator(fill).first().waitFor({ timeout: 10000 });
        await c.selectVerse(3);
        await c.clearHighlight();
        step = "the phone's note count";
        await deleteAllNotes(c);
        await writeNote(c, 16, "a note for the count");
        await page.setViewportSize({ width: 390, height: 664 });
        await c.open(CH);
        const count = page.locator(
          ".sb-bible-reader-active .sb-bible-reader-mobile-header-notes"
        );
        await count.waitFor({ timeout: 8000 });
        const label = (await count.getAttribute("aria-label")) ?? "";
        if (!/^1 note for this chapter$/i.test(label))
          throw new Error(`note count: ${label}`);
        const marker = page.locator(
          '.sb-bible-reader-active .sb-note-gutter-marker[aria-label="Notes for verse 16"]'
        );
        await marker.waitFor({ timeout: 5000 }).catch(() => {
          throw new Error("no note marker in the margin beside 3:16");
        });
        const [mb, vb] = await Promise.all([
          marker.boundingBox(),
          c.verse(16).locator(".sb-verse-number").first().boundingBox(),
        ]);
        if (
          !mb ||
          !vb ||
          Math.abs(mb.y + mb.height / 2 - (vb.y + vb.height / 2)) > 16
        )
          throw new Error(
            "the margin marker is not level with verse 16's number"
          );
        await marker.click();
        await c.waitText(c.pane(), /a note for the count/, 8000);
        await page.keyboard.press("Escape");
        await count.click();
        await c.waitText(c.pane(), /a note for the count/, 8000);
        return `John 1:23's footnote opened Isaiah 40:3; the embed left out the highlight; the phone's margin marker and header ('${label}') each opened it`;
      } catch (e) {
        (e as Error).message = `${step}: ${(e as Error).message}`;
        throw e;
      } finally {
        await page.setViewportSize({ width: 1280, height: 900 });
        await c.open(CH).catch(() => undefined);
        await deleteAllNotes(c).catch(() => undefined);
      }
    },
  },
  {
    id: "DS2",
    section: "4. Marking the text",
    title: "Drag over the text to choose verses",
    rows: ["Highlight (6 colours)"],
    checks:
      "On John 3, dragging the mouse from the words of verse 3 to the words of verse 5 chooses 3, 4 and 5 and brings up the verse toolbar; the click that ends the drag does not undo it",
    run: async (c) => {
      const page = c.page;
      await c.open(CH);
      await c.verse(5).waitFor({ timeout: 20000 });
      await c.settleTours();
      const box = async (n: number) =>
        (await c
          .verse(n)
          .locator(".sb-verse-text, span")
          .last()
          .boundingBox())!;
      const a = await box(3);
      const b = await box(5);
      await page.mouse.move(a.x + 8, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
      await page.locator(".sb-verse-toolbar").waitFor({ timeout: 5000 });
      await page.waitForTimeout(300);
      const chosen = await page
        .locator(
          ".sb-bible-reader-active .sb-verse-selected[data-verse-number]"
        )
        .evaluateAll((els) => [
          ...new Set(els.map((e) => (e as HTMLElement).dataset["verseNumber"])),
        ]);
      if (chosen.join() !== "3,4,5")
        throw new Error(`chosen: ${chosen.join(", ")}`);
      await page.keyboard.press("Escape");
      return `the drag chose ${chosen.join(", ")} and the verse toolbar came up`;
    },
  },
  {
    id: "ER1",
    section: "3. Reading",
    title: "When a chapter can't be shown",
    rows: ["Offline reading"],
    checks:
      "Turning from John 3 to a John 4 that cannot be fetched says 'Chapter unavailable', 'We were unable to load the data for this chapter…', with Reload and Choose a translation; once it can be fetched, Reload shows it. /read/BSB/TOB/1 (Tobit is not in the BSB) says 'Book not found' — 'We couldn't find that book in Berean Standard Bible.' — and Go to Genesis 1 goes there",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
      });
      const page = await ctx.newPage();
      c.watch(page);
      try {
        // Live, the first chapter comes with the page and the next through the scripture agent: block both lanes,
        // then turn to John 4 from John 3.
        await c.open(CH, page);
        await c.settleTours(page);
        await c.verse(1, page).waitFor({ timeout: 20000 });
        const block = (r: import("playwright").Route) => r.abort();
        await page.route("**/JHN/4.json*", block);
        await page.route("**/harness/ask", block);
        await page.keyboard.press("ArrowRight");
        const err = page.locator(".sb-bible-reader-active .sb-reader-error");
        await c.waitText(
          err,
          /chapter unavailable[\s\S]*unable to load the data for this chapter/i,
          20000
        );
        const buttons = await err.locator("button").allInnerTexts();
        if (buttons.join() !== "Reload,Choose a translation")
          throw new Error(`buttons: ${buttons.join(", ")}`);
        await page.unroute("**/JHN/4.json*");
        await page.unroute("**/harness/ask");
        await err.getByRole("button", { name: "Reload" }).click();
        await c.verse(1, page).waitFor({ timeout: 20000 });
        await c.open("/read/BSB/TOB/1", page);
        const nf = page.locator(".sb-bible-reader-active .sb-reader-not-found");
        await c.waitText(
          nf,
          /book not found[\s\S]*couldn't find that book in Berean Standard Bible/i,
          20000
        );
        await nf.getByRole("button", { name: "Go to Genesis 1" }).click();
        await page.waitForURL(/\/read\/BSB\/GEN\/1/, { timeout: 8000 });
        return "Chapter unavailable with Reload and Choose a translation, Reload brought John 4; Tobit: Book not found, Go to Genesis 1 went there";
      } finally {
        await ctx.close();
      }
    },
  },
  {
    id: "HF1",
    section: "4. Marking the text",
    title: "Highlights fade in and out",
    rows: ["Clear a highlight"],
    checks:
      "Highlighting John 3:7 draws a new ribbon that fades in; clearing it fades the ribbon out (still drawn, transparent) before it goes",
    run: async (c) => {
      const page = c.page;
      await c.open(CH);
      const ribbons = page.locator(
        ".sb-bible-reader-active .sb-highlight-layer .sb-highlight-ribbon"
      );
      const before = await ribbons.count();
      await c.selectVerse(7);
      await c.pickColor(2);
      await page
        .locator(".sb-bible-reader-active .sb-highlight-ribbon-enter")
        .first()
        .waitFor({ state: "attached", timeout: 5000 })
        .catch(() => {
          throw new Error("the new ribbon did not fade in");
        });
      const during = await ribbons.count();
      await c.selectVerse(7);
      await c.clearHighlight();
      const fading = await page
        .locator(".sb-bible-reader-active .sb-highlight-ribbon")
        .evaluateAll(
          (els) =>
            els.filter((e) => (e as SVGElement).style.opacity === "0").length
        );
      if (fading < 1) throw new Error("the cleared ribbon did not fade out");
      for (let i = 0; i < 20 && (await ribbons.count()) > before; i++)
        await page.waitForTimeout(100);
      if ((await ribbons.count()) !== before)
        throw new Error("the cleared ribbon stayed");
      return `ribbons ${before} → ${during} (fading in) → ${before} after fading out`;
    },
  },
  {
    id: "PT1",
    section: "4. Marking the text",
    title: "Tap beside a short poetry line",
    rows: ["Highlight (6 colours)"],
    checks:
      "On an iPhone 13 at Psalm 23, a tap in the blank space after the short first line of verse 1 chooses verse 1 (the verse sheet says Psalms 23:1); on a desktop a mouse click in that space chooses nothing",
    run: async (c) => {
      // The blank space past the end of verse 1's first poetry line, on the same line.
      const spot = (page: Page) =>
        page
          .locator(
            '.sb-bible-reader-active .sb-verse-poetry[data-verse-number="1"] .sb-verse-decorator'
          )
          .first()
          .evaluate((deco) => {
            const r = deco.getClientRects()[0]!;
            const line = (
              deco.closest(".sb-verse-line, .sb-verse-poetry") as HTMLElement
            ).getBoundingClientRect();
            const x = Math.min(line.right - 12, r.right + 40);
            return { x, y: r.top + r.height / 2, room: line.right - r.right };
          });
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
      });
      const phone = await ctx.newPage();
      c.watch(phone);
      let room = 0;
      try {
        await c.open("/read/BSB/PSA/23", phone);
        await c.settleTours(phone);
        await c.verse(1, phone).waitFor({ timeout: 20000 });
        const p = await spot(phone);
        room = Math.round(p.room);
        if (p.room < 30)
          throw new Error(`no blank space after the line (${room}px)`);
        await phone.touchscreen.tap(p.x, p.y);
        const sheet = phone.locator(".sb-verse-toolbar-mobile");
        await sheet.waitFor({ timeout: 5000 }).catch(() => {
          throw new Error("a tap beside the line did not choose the verse");
        });
        await c.waitText(
          sheet.locator(".sb-verse-toolbar-ref-text"),
          /Psalms? 23:1$/,
          3000
        );
      } finally {
        await ctx.close();
      }
      await c.open("/read/BSB/PSA/23");
      await c.verse(1).waitFor({ timeout: 20000 });
      await c.settleTours();
      const d = await spot(c.page);
      await c.page.mouse.click(d.x, d.y);
      await c.page.waitForTimeout(500);
      if (
        await c.page
          .locator(".sb-bible-reader-active .sb-verse-selected")
          .count()
      )
        throw new Error("a mouse click in the blank space chose the verse");
      return `phone: a tap ${room}px of blank space after the line chose Psalms 23:1; desktop: a click there chose nothing`;
    },
  },
  {
    id: "VG1",
    section: "4. Marking the text",
    title: "Choose any verses, gaps and all",
    rows: ["Highlight (6 colours)", "Share a verse / copy link"],
    checks:
      "On a phone, tapping John 3:16 then 3:18 chooses both (the sheet says 'John 3:16, 18'), and tapping 16 again drops it ('John 3:18'). On a desktop with 16 and 18 chosen, Copy puts '… (John 3:16 BSB)' and '… (John 3:18 BSB)' a blank line apart and says Copied; a colour highlights 16 and 18 but not 17",
    run: async (c) => {
      const ctx = await c.browser.newContext({
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
      });
      const phone = await ctx.newPage();
      c.watch(phone);
      try {
        await c.open(CH, phone);
        await c.settleTours(phone);
        const sheetRef = phone.locator(
          ".sb-verse-toolbar-mobile .sb-verse-toolbar-ref-text"
        );
        await c.tapVerse(16, phone);
        await c.waitText(sheetRef, /^John 3:16$/, 5000);
        await c.tapVerse(18, phone);
        await c.waitText(sheetRef, /^John 3:16, 18$/, 5000);
        await c.tapVerse(16, phone);
        await c.waitText(sheetRef, /^John 3:18$/, 5000);
      } finally {
        await ctx.close();
      }
      const desk = await c.browser.newContext({
        viewport: { width: 1280, height: 900 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await desk.newPage();
      c.watch(page);
      try {
        await c.open(CH, page);
        await c.settleTours(page);
        await c.selectVerse(16, page);
        await c.tapVerse(18, page);
        await page.locator(".sb-verse-toolbar-copy").click();
        await c.waitText(page.locator(".sb-toast"), /copied/i, 3000);
        const copied = await page.evaluate(() =>
          navigator.clipboard.readText()
        );
        if (
          !/^For God so loved the world[^\n]*\(John 3:16 BSB\)\n\n.*\(John 3:18 BSB\)$/s.test(
            copied
          )
        )
          throw new Error(`copied: ${copied.slice(0, 160)}`);
        await c.pickColor(4, page);
        const filled = async (n: number) =>
          (await c.verse(n, page).locator("[data-highlight-fill]").count()) >
            0 ||
          (await page
            .locator(
              `.sb-bible-reader-active [data-highlight-fill]:has([data-verse-number="${n}"])`
            )
            .count()) > 0;
        for (let i = 0; i < 30 && !(await filled(18)); i++)
          await page.waitForTimeout(100);
        const marks = [await filled(16), await filled(17), await filled(18)];
        if (marks.join() !== "true,false,true")
          throw new Error(`highlighted 16, 17, 18: ${marks.join(", ")}`);
        for (const n of [16, 18]) {
          await c.selectVerse(n, page);
          await c.clearHighlight(page);
        }
        return "phone: 16 and 18 chosen, then 16 dropped; desktop: Copy gave each verse with its reference, a colour marked 16 and 18 and not 17";
      } finally {
        await desk.close();
      }
    },
  },
  {
    id: "SN1",
    section: "4. Marking the text",
    title: "The verse sheet shows the chosen verses' notes",
    rows: ["See which verses have notes", "Edit / delete a note"],
    checks:
      "With a note on John 3:16, a phone's verse sheet for 3:16, pulled up, shows the note under 'John 3:16' with ⋮ Edit and Delete; Delete asks 'Delete annotation?' and the note goes",
    run: async (c) => {
      const page = c.page;
      try {
        await c.open(CH);
        await deleteAllNotes(c);
        await writeNote(c, 16, "a note in the sheet");
        await page.setViewportSize({ width: 390, height: 664 });
        await c.open(CH);
        await c.settleTours();
        await c.tapVerse(16);
        const sheet = page.locator(".sb-verse-toolbar-mobile");
        await sheet.waitFor({ timeout: 5000 });
        await sheet
          .locator(".sb-verse-toolbar-handle-area")
          .tap()
          .catch(() => sheet.locator(".sb-verse-toolbar-handle-area").click());
        const notes = sheet.locator(".sb-verse-toolbar-notes");
        await c.waitText(notes, /John 3:16[\s\S]*a note in the sheet/, 5000);
        await notes.locator(".sb-annotation-item-menu").first().click();
        for (const name of [/^edit$/i, /^delete$/i])
          await page
            .getByRole("menuitem", { name })
            .first()
            .waitFor({ timeout: 3000 });
        await page.keyboard.press("Escape");
        await c.noteAction(
          notes.locator(".sb-annotation-item").first(),
          /^delete$/i
        );
        await notes.waitFor({ state: "detached", timeout: 5000 }).catch(() => {
          throw new Error("the note stayed in the sheet after Delete");
        });
        return "the sheet showed the note under John 3:16 with Edit and Delete; Delete asked and removed it";
      } finally {
        await page.setViewportSize({ width: 1280, height: 900 });
        await c.open(CH).catch(() => undefined);
        await deleteAllNotes(c).catch(() => undefined);
      }
    },
  },
];
