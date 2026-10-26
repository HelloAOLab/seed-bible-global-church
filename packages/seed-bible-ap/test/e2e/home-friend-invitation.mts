// Run: SENDER=bob INVITEE=carol SHOTS=<dir> npx tsx test/e2e/home-friend-invitation.mts   (any two demo people with storage on)
// THE HOME'S OWN PATH for friendship by email invitation, live, as two demo people in two browsers — no reader:
// Seed Reader invites from the Home's Friends page and taps "Yes, be friends when they accept"; Ruth opens the
// Home's own invitation page (/invite/friend/<token>) and taps Add; both Homes list each other under Your friends.
// Then each removes the other. Screenshots under SHOTS.
import { chromium, type Page, type BrowserContext } from "playwright";

const HOME = "https://www.faithnet.me";
const SHOTS = process.env.SHOTS ?? ".";
let n = 0;
const shot = (p: Page, name: string) =>
  p
    .screenshot({
      path: `${SHOTS}/${String(++n).padStart(2, "0")}-${name}.png`,
    })
    .catch(() => {});
const fail = (m: string): never => {
  throw new Error(m);
};

async function asPerson(browser: import("playwright").Browser, handle: string) {
  const r = await fetch(`${HOME}/connect/demo-signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle, client_id: "demo-web" }),
  });
  const si = (await r.json()) as { homeSession?: string; agent?: string };
  if (!si.homeSession) fail(`${handle} could not sign in`);
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`${HOME}/friends#session=${si.homeSession}`);
  await page.locator('[data-testid="add-friend"]').waitFor({ timeout: 60000 });
  return {
    ctx,
    page,
    agent: String(si.agent).toLowerCase(),
    session: si.homeSession!,
  };
}

/** The Ask flyout's authority question, answered; waits until the flyout says it is done. */
async function approve(page: Page, yes: RegExp, label: string) {
  const ask = page.locator('[data-testid="ask-authority"]');
  await ask.waitFor({ timeout: 90000 });
  await shot(page, `${label}-question`);
  const q = (await ask.innerText()).split("\n")[0];
  await ask.getByRole("button", { name: yes }).click();
  await ask.waitFor({ state: "detached", timeout: 240000 }).catch(async () => {
    await shot(page, `${label}-stuck`);
    fail(`${label}: the question stayed`);
  });
  await page.waitForTimeout(3000);
  return q;
}
/** The Friends page once its read has answered ("Loading your friends…" gone) — a read can take a minute. */
async function loaded(page: Page) {
  await page.locator('[data-testid="add-friend"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(
    () => !/Loading your friends/.test(document.body.innerText),
    undefined,
    { timeout: 180000 }
  );
}
const friendRow = (page: Page, agent: string) =>
  page.locator(`[data-testid="friends"] [data-testid="friend-${agent}"]`);
async function expectFriend(page: Page, agent: string, label: string) {
  for (let i = 0; i < 4; i++) {
    await loaded(page);
    if (await friendRow(page, agent).count()) {
      await shot(page, label);
      return;
    }
    await page.waitForTimeout(10000);
    await page.reload();
  }
  await shot(page, `${label}-missing`);
  fail(
    `${label}: not listed under Your friends — ${(
      await page
        .locator("main")
        .innerText()
        .catch(() => "")
    )
      .replace(/\s+/g, " ")
      .slice(0, 400)}`
  );
}
/** Remove everything standing toward `agent` on this Home (friend, sent request, ended) through its own buttons. */
async function removeAllToward(page: Page, agent: string, label: string) {
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await loaded(page);
    const row = page
      .locator(
        `[data-testid="friend-${agent}"], [data-testid="sent-${agent}"], [data-testid="ended-${agent}"]`
      )
      .first();
    if (!(await row.count())) return;
    await row
      .getByRole("button", { name: /remove|cancel/i })
      .first()
      .click();
    await approve(page, /yes, remove them/i, `${label}-${i}`);
  }
}

const browser = await chromium.launch();
const sr = await asPerson(browser, process.env.SENDER ?? "seedreader");
const ruth = await asPerson(browser, process.env.INVITEE ?? "ruth");
try {
  await removeAllToward(sr.page, ruth.agent, "pre-sr");
  await removeAllToward(ruth.page, sr.agent, "pre-ruth");
  // 1. Seed Reader invites from the Home's own Friends page, and says Yes
  const p = sr.page;
  await p.getByRole("button", { name: /invite them by email/i }).click();
  const email = `home-${Date.now().toString(36)}@example.invalid`;
  await p.getByLabel("Their email").fill(email);
  const sent = p.waitForResponse(
    (r) =>
      r.url().includes("/connect/friend-invite/email") &&
      r.request().method() === "POST"
  );
  await p.getByRole("button", { name: /send invitation/i }).click();
  const token = String(
    ((await (await sent).json()) as { token?: string }).token ?? ""
  );
  if (!/^[a-f0-9]{40,80}$/.test(token)) fail("no invitation");
  const yes = p.locator('[data-testid="invite-half-yes"]');
  await yes.waitFor({ timeout: 20000 });
  await shot(p, "sr-invited");
  await yes.click();
  await p
    .getByText("You will be friends when they accept.")
    .waitFor({ timeout: 60000 })
    .catch(async () => {
      await shot(p, "sr-half-failed");
      fail(
        `the half was not kept: ${(await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300)}`
      );
    });
  await shot(p, "sr-half-kept");
  // 2. Ruth opens the Home's invitation page and adds Seed Reader
  await ruth.page.goto(`${HOME}/invite/friend/${token}`);
  const add = ruth.page.getByRole("button", { name: /^add .* as a friend$/i });
  await add.waitFor({ timeout: 60000 });
  await shot(ruth.page, "ruth-invite");
  await add.click();
  const q = await approve(ruth.page, /yes, add them/i, "ruth-add");
  // 3. Both Homes: friends
  await ruth.page.goto(`${HOME}/friends`);
  await expectFriend(ruth.page, sr.agent, "ruth-friends");
  await sr.page.reload();
  await expectFriend(sr.page, ruth.agent, "sr-friends");
  console.log(
    `✓ the Home's own path: invited from Friends with Yes; Ruth's '${q}' on the Home's invitation page made them friends on both Homes`
  );
} finally {
  await removeAllToward(sr.page, ruth.agent, "post-sr").catch((e) =>
    console.log("cleanup sr:", String(e).slice(0, 120))
  );
  await removeAllToward(ruth.page, sr.agent, "post-ruth").catch((e) =>
    console.log("cleanup ruth:", String(e).slice(0, 120))
  );
  await browser.close();
}
