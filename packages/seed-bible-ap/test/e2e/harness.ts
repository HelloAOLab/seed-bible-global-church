// THE FLOW HARNESS — Playwright over the deployed reader (or a local one): a fresh browser context per flow so
// marks never bleed between flows, the few things every flow does (open a chapter, get past the welcome dialog,
// select a verse, press a toolbar button, sign in as one of the Home's sample people), and the result shape the
// runner (scripts/e2e.ts) writes into docs/e2e-results.* and the training manual's Test column reads.
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";

export const BASE = (
  process.env["E2E_BASE"] ?? "https://seed-reader.faithnet.io"
).replace(/\/$/, "");

export interface FlowResult {
  id: string;
  section: string;
  title: string;
  /** What the flow checks, in one line — what a tester would do by hand. */
  checks: string;
  mark: "✅" | "❌" | "⏭️";
  note: string;
  ms: number;
}

export interface Flow {
  id: string;
  section: string;
  title: string;
  checks: string;
  /** The training manual's feature rows this flow tests (their first cell, exactly); the runner writes its mark there. */
  rows?: string[];
  /** The flow's budget in ms (default 120 s); publishing, two-device sync and transcription take longer. */
  timeoutMs?: number;
  /** Skip with a reason (a feature that cannot be driven headless, say). */
  skip?: string;
  run: (ctx: FlowContext) => Promise<string | void>;
}

export class FlowContext {
  readonly logs: string[] = [];
  constructor(
    readonly browser: Browser,
    readonly context: BrowserContext,
    readonly page: Page
  ) {
    this.watch(page);
  }

  /** The guided tour's card on each page, dismissed whenever it appears (keepTours lets the tour's own flow see it). */
  private tourCards = new WeakMap<
    Page,
    { card: Locator; added: Promise<void> }
  >();

  watch(page: Page) {
    // A contextual tour shows the first time the book picker or the translation list opens; a flow about something
    // else dismisses it the way a reader would (Esc) and carries on.
    const card = page.locator(".sb-tour-card");
    const added = page
      .addLocatorHandler(
        card,
        async () => {
          // Only while it still shows: an Esc after it has gone would close whatever the flow opened.
          if (await card.isVisible()) await page.keyboard.press("Escape");
        },
        { noWaitAfter: true }
      )
      .catch(() => undefined);
    this.tourCards.set(page, { card, added });
    page.on("pageerror", (e) => this.logs.push(`[pageerror] ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") this.logs.push(`[console.error] ${m.text()}`);
    });
  }

  /** Stop dismissing tours on this page: the flow is about the tour. */
  async keepTours(page: Page = this.page): Promise<void> {
    const held = this.tourCards.get(page);
    if (!held) return;
    await held.added;
    await page.removeLocatorHandler(held.card);
  }

  /** A second device: its own storage, same browser. */
  async secondPage(): Promise<Page> {
    const ctx = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    const page = await ctx.newPage();
    this.watch(page);
    return page;
  }

  async open(path: string, page: Page = this.page): Promise<void> {
    // tsx names the functions a flow hands to page.evaluate with a `__name` helper the page does not have.
    await page.addInitScript({ content: "window.__name = (f) => f;" });
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await this.dismissWelcome(page);
    await page.locator(".sb-app:not(.sb-app-ssr)").waitFor({ timeout: 20000 });
  }

  /** Turn down the first visit's tour offer, and the install offer that can follow it. */
  async dismissWelcome(page: Page = this.page): Promise<void> {
    const noThanks = page.getByRole("button", { name: /no, thanks/i });
    try {
      await noThanks.waitFor({ timeout: 4000 });
      await noThanks.click();
    } catch {
      return; /* no offer this time (a returning device) */
    }
    const later = page.getByRole("button", { name: /maybe later|got it/i });
    if (await later.count()) await later.first().click();
  }

  verse(n: number, page: Page = this.page): Locator {
    return page
      .locator(`.sb-bible-reader-active [data-verse-number="${n}"]`)
      .first();
  }

  /** Select a verse by tapping its text (blank space in a poetry line does not select, by design). */
  async selectVerse(n: number, page: Page = this.page): Promise<void> {
    await this.verse(n, page).waitFor({ timeout: 20000 });
    await this.verse(n, page).click({ position: { x: 40, y: 8 } });
    await page.locator(".sb-verse-toolbar").waitFor({ timeout: 5000 });
    await this.settled(page.locator(".sb-verse-toolbar"));
  }

  /** Wait until an element stops moving (the verse toolbar slides into place after it appears). */
  async settled(locator: Locator, timeout = 3000): Promise<void> {
    const t0 = Date.now();
    let last = "";
    for (;;) {
      const b = await locator.boundingBox();
      const now = b
        ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}`
        : "";
      if (now && now === last) return;
      last = now;
      if (Date.now() - t0 > timeout) return;
      await locator.page().waitForTimeout(150);
    }
  }

  /** A bottom-toolbar button by its label (aria-label), e.g. "Notes", "Your content", "Today". */
  toolbar(label: string | RegExp, page: Page = this.page): Locator {
    return page
      .locator(".sb-reader-toolbar .sb-reader-toolbar-button")
      .filter({ has: page.locator(`[aria-label]`) })
      .or(page.locator(".sb-reader-toolbar .sb-reader-toolbar-button"))
      .filter({ hasText: label })
      .first()
      .or(
        page.locator(`.sb-reader-toolbar button[aria-label="${label}"]`).first()
      );
  }

  async pressToolbar(label: string, page: Page = this.page): Promise<void> {
    // Only what is on screen: the phone's and the desktop's buttons are both in the page, CSS shows one set.
    const byAria = page
      .locator(`.sb-reader-toolbar button[aria-label="${label}"]:visible`)
      .first();
    if (await byAria.count()) {
      await byAria.click();
      return;
    }
    const more = page
      .locator(".sb-reader-toolbar-more-button button:visible")
      .first();
    if (await more.count()) await more.click();
    await page
      .locator(
        `.sb-reader-toolbar-more-menu button[aria-label="${label}"]:visible, .sb-reader-toolbar-more-menu button:visible:has-text("${label}")`
      )
      .first()
      .click();
  }

  /** The account pane, signed in or not: signed in, Profile (the sidebar's profile circle, the phone's account button)
   *  → Account settings; signed out, More → Sign in. */
  async openAccount(page: Page = this.page): Promise<Locator> {
    const signedIn = !!(await page.evaluate(() =>
      document.querySelector(".sb-sidebar-profile-button-in")
    ));
    const phoneAccount = page
      .locator('.sb-reader-toolbar button[aria-label="Profile"]:visible')
      .first();
    if (signedIn) {
      if (await phoneAccount.count()) await phoneAccount.click();
      else
        await page
          .locator(".sb-sidebar-profile-button:visible")
          .first()
          .click();
      await page
        .locator(".sb-profile-row", { hasText: "Account settings" })
        .click();
      await page.locator(".sb-account-pane").waitFor({ timeout: 5000 });
    } else await this.pressToolbar("Sign in", page);
    await this.pane(page).waitFor({ timeout: 5000 });
    return this.pane(page);
  }

  /** The Library pane on one of its tabs. */
  async openLibrary(
    tab: "Playlists" | "Reading plans" | "Customizations",
    page: Page = this.page
  ): Promise<Locator> {
    await this.pressToolbar("Library", page);
    await this.pane(page).waitFor({ timeout: 5000 });
    await this.pane(page).getByRole("tab", { name: tab }).click();
    return this.pane(page);
  }

  /** A checkbox in a pane by the text of its label. */
  check(scope: Locator, label: string | RegExp): Locator {
    return scope
      .locator("label", { hasText: label })
      .locator('input[type="checkbox"]')
      .first();
  }

  pane(page: Page = this.page): Locator {
    return page.locator(".sb-app-pane").first();
  }

  async paneText(page: Page = this.page): Promise<string> {
    return (
      await this.pane(page)
        .innerText()
        .catch(() => "")
    ).replace(/\s+/g, " ");
  }

  /** Sign in as one of the Home's sample people (Quick Connect): the account pane's list. */
  async signInAsSample(
    preferred = /seed ?reader/i,
    page: Page = this.page
  ): Promise<string> {
    await this.pressToolbar("Sign in", page);
    await this.pane(page).waitFor({ timeout: 5000 });
    const details = page.locator(".sb-app-pane details").first();
    await details.waitFor({ timeout: 15000 });
    if (!(await details.getAttribute("open")))
      await details.locator("summary").click();
    const buttons = details.locator("button");
    await buttons.first().waitFor({ timeout: 15000 });
    const names = await buttons.allInnerTexts();
    let idx = names.findIndex((n) => preferred.test(n));
    if (idx < 0) idx = 0;
    await buttons.nth(idx).click();
    await page
      .locator(".sb-sidebar-profile-button-in")
      .waitFor({ timeout: 30000 });
    await page
      .locator(".sb-pane-close")
      .first()
      .click()
      .catch(() => undefined);
    return names[idx]!.trim();
  }

  async waitText(locator: Locator, re: RegExp, timeout = 15000): Promise<void> {
    const t0 = Date.now();
    for (;;) {
      const text = (await locator.innerText().catch(() => "")).replace(
        /\s+/g,
        " "
      );
      if (re.test(text)) return;
      if (Date.now() - t0 > timeout)
        throw new Error(
          `waited ${timeout}ms for ${re} in: ${text.slice(0, 160)}`
        );
      await locator.page().waitForTimeout(250);
    }
  }
}

export async function launch(): Promise<Browser> {
  // A fake microphone (a steady tone) with no prompt, so the call's flows can talk.
  return chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
}

export async function newFlowContext(browser: Browser): Promise<FlowContext> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write", "microphone"],
  });
  const page = await context.newPage();
  return new FlowContext(browser, context, page);
}
