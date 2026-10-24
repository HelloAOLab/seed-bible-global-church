// Screenshots of the same screen on the old reader and ours, for side-by-side review.
import { chromium } from "playwright";
const OUT = process.argv[2];
const only = (process.argv[3] ?? "").split(",").filter(Boolean);
const SITES = {
  legacy: (p) => `https://seedbible.org/en/BSB/john/3${p}`,
  ours: (p) => `https://seed-reader.faithnet.io/read/BSB/JHN/3${p}`,
};
const tap = async (p, sel) => {
  const l = p.locator(sel).filter({ visible: true }).first();
  await l
    .click({ timeout: 8000 })
    .catch((e) =>
      console.log("  miss", sel, String(e).split("\n")[0].slice(0, 90))
    );
  await p.waitForTimeout(1500);
};
const tapText = async (p, re) => {
  const l = p
    .getByRole("button", { name: re })
    .filter({ visible: true })
    .first();
  await l.click({ timeout: 8000 }).catch(() => console.log("  miss", re));
  await p.waitForTimeout(1500);
};
const SCREENS = {
  reader: { legacy: async () => {}, ours: async () => {} },
  verse: {
    both: async (p) => {
      await tap(
        p,
        '[data-verse-number="16"] .sb-verse-number, .sb-verse-number >> text="16"'
      );
    },
  },
  more: {
    both: async (p, phone) => {
      if (phone) await tapText(p, /^more$/i);
      else await tapText(p, /^more$/i);
    },
  },
  search: {
    both: async (p) => {
      await tapText(p, /^search$/i);
    },
  },
  discover: {
    both: async (p) => {
      await tapText(p, /^discover$/i);
    },
  },
  settings: {
    both: async (p, phone) => {
      if (phone) {
        await tapText(p, /^more$/i);
        await tapText(p, /settings/i);
      } else
        await tap(
          p,
          ".sb-sidebar-settings-button, button[aria-label*='ettings' i]"
        );
    },
  },
  today: {
    both: async (p, phone) => {
      if (phone) await tapText(p, /^today$/i);
      else
        await tap(
          p,
          "button[aria-label*='Tasks' i], button[title*='Today' i], .sb-sidebar-tasks-button"
        );
    },
  },
  tabsplus: {
    both: async (p) => {
      await tap(
        p,
        ".sb-sidebar-tabs-header button[aria-label*='add' i], .sb-tabs-add-button, button[aria-label*='New tab' i]"
      );
    },
  },
  profile: {
    both: async (p, phone) => {
      if (phone) await tapText(p, /^you$/i);
      else
        await tap(
          p,
          ".sb-sidebar-profile-button, button[aria-label*='rofile' i]"
        );
    },
  },
};
const b = await chromium.launch();
for (const [name, s] of Object.entries(SCREENS)) {
  if (only.length && !only.includes(name)) continue;
  for (const [vw, vh, tag] of [
    [1495, 860, "d"],
    [390, 844, "m"],
  ]) {
    for (const site of ["legacy", "ours"]) {
      const ctx = await b.newContext({
        viewport: { width: vw, height: vh },
        isMobile: vw < 500,
        hasTouch: vw < 500,
      });
      const p = await ctx.newPage();
      await p
        .goto(SITES[site](""), { waitUntil: "networkidle", timeout: 45000 })
        .catch(() => {});
      await p.waitForTimeout(2500);
      for (const n of [/no, thanks/i, /maybe later|got it/i]) {
        const x = p.getByRole("button", { name: n });
        if (await x.count())
          await x
            .first()
            .click()
            .catch(() => {});
        await p.waitForTimeout(300);
      }
      const act = s.both ?? s[site];
      try {
        await act(p, vw < 500);
      } catch (e) {
        console.log(" ", name, site, String(e).slice(0, 100));
      }
      for (let i = 0; i < 2; i++) {
        const sk = p.getByRole("button", { name: /^skip$/i });
        if (await sk.count()) {
          await sk
            .first()
            .click()
            .catch(() => {});
          await p.waitForTimeout(400);
        }
        const off = p.getByRole("button", {
          name: /turn off tutorials|just this one/i,
        });
        if (await off.count()) {
          await off
            .first()
            .click()
            .catch(() => {});
          await p.waitForTimeout(400);
        }
      }
      await p.screenshot({ path: `${OUT}/${name}-${tag}-${site}.png` });
      await ctx.close();
    }
  }
  console.log("done", name);
}
await b.close();
