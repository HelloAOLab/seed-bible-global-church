// PARITY WITH seedbible.org — the same screens on both apps, desktop and phone width, fresh and signed out, one PNG
// each (Paul's harness, 2026-11-03). `PARITY_OUT` (default ./parity) gets <viewport>-<screen>-<theirs|ours>.png; the
// pixel diff is scripts/parity-diff.py. Read the images, not only the numbers: a verse of the day always differs.
//   node_modules/.bin/tsx scripts/parity.ts            PARITY_ONLY=02-chapter,03-books  PARITY_VP=desktop
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const APPS = {
  theirs: { base: "https://seedbible.org", chapter: "/en/BSB/genesis/1" },
  ours: {
    base: process.env["PARITY_OURS"] ?? "https://seed-reader.faithnet.io",
    chapter: "/en/BSB/genesis/1",
  },
} as const;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  for (const name of [/maybe later/i, /^skip$/i, /^not now$/i]) {
    const b = page.getByRole("button", { name });
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
  }
  await page.waitForTimeout(600);
}
/** A button by its accessible name, on the toolbar first; on a phone, More's sheet too. */
const tap = (name: RegExp) => async (p: Page) => {
  const b = p.getByRole("button", { name }).first();
  if (await b.isVisible().catch(() => false)) await b.click();
  else {
    await p
      .getByRole("button", { name: /^more$/i })
      .first()
      .click();
    await p.getByRole("button", { name }).first().click();
  }
  await settle(p);
};

const SCREENS: Array<{
  id: string;
  first?: boolean;
  act?: (p: Page) => Promise<void>;
}> = [
  { id: "01-first-visit", first: true },
  { id: "02-chapter" },
  { id: "03-books", act: tap(/^books$/i) },
  { id: "04-search", act: tap(/^search$/i) },
  { id: "05-discover", act: tap(/^discover$/i) },
  { id: "06-today", act: tap(/^today$/i) },
  {
    id: "07-verse-menu",
    act: async (p) => {
      await p.getByText("In the beginning God created").first().click();
      await settle(p);
    },
  },
  { id: "08-settings", act: tap(/settings/i) },
  { id: "09-profile", act: tap(/^(profile|you|account|log in)$/i) },
];

const out = process.env["PARITY_OUT"] ?? "parity";
const only = (process.env["PARITY_ONLY"] ?? "").split(",").filter(Boolean);
const vps = (process.env["PARITY_VP"] ?? "desktop,phone").split(",");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  if (!vps.includes(vp)) continue;
  for (const s of SCREENS) {
    if (only.length && !only.includes(s.id)) continue;
    for (const [app, cfg] of Object.entries(APPS)) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      try {
        await page.goto(cfg.base + (s.first ? "/" : cfg.chapter), {
          timeout: 45000,
        });
        await settle(page);
        await s.act?.(page);
      } catch (e) {
        console.warn(
          `${vp} ${s.id} ${app}: ${(e as Error).message.split("\n")[0]}`
        );
      }
      await page.screenshot({ path: `${out}/${vp}-${s.id}-${app}.png` });
      await ctx.close();
    }
    console.log(`${vp} ${s.id}`);
  }
}
await browser.close();
