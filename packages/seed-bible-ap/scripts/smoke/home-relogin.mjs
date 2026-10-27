// Open the Home as a demo persona in a real browser so the Home's own session code re-issues the
// interactions grant and the DEL-001 session leaf (session.tsx → activateInteractionsIfNeeded).
import { chromium } from "playwright";

const HOME = "https://www.faithnet.me";
const handle = process.argv[2] ?? "demo-admin";
const principal = (process.argv[3] ?? "").toLowerCase();
const shots = process.argv[4] ?? ".";

const status = async () =>
  (await fetch(`${HOME}/a2a/interactions/${principal}/status`)).json();
console.log("before:", JSON.stringify(await status()).slice(0, 120));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (/interactions|leaf|grant/i.test(m.text()))
    console.log("console:", m.text().slice(0, 200));
});
await page.goto(HOME, { waitUntil: "networkidle" });
await page.screenshot({ path: `${shots}/home-1.png` });
// The demo-people fold: a <details> with one button per persona, labelled by the persona's name.
const personas = await (await fetch(`${HOME}/connect/demo-personas`)).json();
const p = (personas.personas ?? []).find((x) => x.handle === handle);
if (!p)
  throw new Error(
    `no demo persona ${handle}: ${JSON.stringify(personas).slice(0, 200)}`
  );
const label = p.name.split(" — ")[0];
console.log("persona:", handle, "→ button", JSON.stringify(label));
await page.locator("summary", { hasText: "Demo people" }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: label, exact: true }).first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${shots}/home-2.png` });
const t0 = Date.now();
let st = await status();
while (st.leafLive !== true && Date.now() - t0 < 90_000) {
  await page.waitForTimeout(3000);
  st = await status();
}
await page.screenshot({ path: `${shots}/home-3.png` });
console.log("after:", JSON.stringify(st).slice(0, 120));
await browser.close();
process.exit(st.leafLive === true ? 0 : 1);
