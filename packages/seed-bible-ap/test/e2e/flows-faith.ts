// THE FAITH PAGE — Prayer, Journey and Care, kept by the sample person's own agent at the Home (person.faith.*).
// Each flow tidies up after itself: its prayer is removed, its milestone removed, its care request withdrawn.
import type { Flow, FlowContext } from "./harness";

const CH = "/en/BSB/john/3";
const stamp = () => new Date().toISOString().slice(11, 19).replace(/:/g, "");

async function openFaith(c: FlowContext, tab: "Prayer" | "Journey" | "Care") {
  await c.pressToolbar("Prayer");
  const pane = c.page.locator(".sb-faith");
  await pane.waitFor({ timeout: 10000 });
  await pane.getByRole("tab", { name: tab }).click();
  await pane.locator(".sb-faith-tab").first().waitFor({ timeout: 30000 });
  return pane;
}

export const FAITH_FLOWS: Flow[] = [
  {
    id: "PY1",
    section: "10a. Prayer, faith journey and care",
    title: "Keep a prayer, pray for it, mark it answered",
    rows: ["Prayer list"],
    timeoutMs: 240_000,
    checks:
      "Signed in as Seed Reader, Prayer → Prayer request: a new prayer is added under Praying, marked Only me. I prayed shows 'Prayed 1 times'. Answered, with words, moves it to Answered prayers with those words. Remove takes it away.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await openFaith(c, "Prayer");
      const label = `PY1 prayer ${stamp()}`;
      await pane.locator("#faith-prayer-label").fill(label);
      await pane.locator("#faith-praying-for").fill("my neighbour");
      await pane.getByRole("button", { name: "Add" }).click();
      const card = pane.locator(".sb-faith-card", { hasText: label });
      await card.waitFor({ timeout: 60000 });
      if (
        !(await card.locator(".sb-faith-chip", { hasText: "Only me" }).count())
      )
        throw new Error("a new prayer is not marked Only me");
      await card.getByRole("button", { name: "I prayed" }).click();
      await card.getByText(/Prayed 1 times/).waitFor({ timeout: 60000 });
      await card.getByRole("button", { name: "Answered" }).click();
      await card.locator("textarea").fill("Answered in the flow");
      await card.getByRole("button", { name: "Save" }).click();
      const answered = pane
        .locator(".sb-faith-heading", { hasText: "Answered prayers" })
        .locator("xpath=following-sibling::ul[1]")
        .locator(".sb-faith-card", { hasText: label });
      await answered.waitFor({ timeout: 60000 });
      await answered
        .getByText("Answered in the flow")
        .waitFor({ timeout: 5000 });
      await answered.getByRole("button", { name: "Remove" }).click();
      await pane
        .locator(".sb-faith-card", { hasText: label })
        .waitFor({ state: "detached", timeout: 60000 });
      return "added under Praying (Only me); I prayed counted 1; Answered moved it to Answered prayers with the words; removed";
    },
  },
  {
    id: "PY2",
    section: "10a. Prayer, faith journey and care",
    title: "Say where you are on your journey; add a milestone",
    rows: ["Your faith journey"],
    timeoutMs: 240_000,
    checks:
      "Journey: tapping New believer (after Change my step, when a step is set) makes it the You are here card and closes the list, and Next steps lists Reading the Bible. Add a milestone, Baptized with a place, lists it under Milestones with the place; Remove takes it away.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await openFaith(c, "Journey");
      // With a step already chosen the page shows only "You are here"; the steps open from Change my step.
      const here = pane.locator(".sb-faith-here-name");
      if (!(await here.filter({ hasText: "New believer" }).count())) {
        const change = pane.getByRole("button", { name: "Change my step" });
        if (await change.count()) await change.click();
        await pane
          .locator(".sb-faith-stage", { hasText: "New believer" })
          .click();
      }
      await here
        .filter({ hasText: "New believer" })
        .waitFor({ timeout: 60000 });
      if (await pane.locator(".sb-faith-stages").count())
        throw new Error("the steps list stayed open after a step was saved");
      await pane
        .locator(".sb-faith-steps", { hasText: "Reading the Bible" })
        .waitFor({ timeout: 5000 });
      const place = `PY2 place ${stamp()}`;
      await pane.getByRole("button", { name: "Add a milestone" }).click();
      await pane.locator("#faith-milestone").selectOption("Baptized");
      await pane.locator("#faith-milestone-place").fill(place);
      await pane
        .locator(".sb-faith-form")
        .getByRole("button", { name: "Save" })
        .click();
      const card = pane.locator(".sb-faith-card", { hasText: place });
      await card.waitFor({ timeout: 60000 });
      await card.getByRole("button", { name: "Remove" }).click();
      await card.waitFor({ state: "detached", timeout: 60000 });
      return "New believer became the current stage, with Reading the Bible as a next step; the Baptized milestone with its place was listed, then removed";
    },
  },
  {
    id: "PY3",
    section: "10a. Prayer, faith journey and care",
    title: "Ask your church for care; withdraw it",
    rows: ["Ask your church for care"],
    timeoutMs: 240_000,
    checks:
      "Care: the page says it is not for emergencies. A request is kept and listed under Your requests; 'I don't need this any more' marks it Withdrawn.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await openFaith(c, "Care");
      await pane.getByText(/not for emergencies/).waitFor({ timeout: 5000 });
      const label = `PY3 please call ${stamp()}`;
      await pane.locator("#faith-care-label").fill(label);
      await pane.getByRole("button", { name: "Ask for care" }).click();
      const card = pane.locator(".sb-faith-card", { hasText: label });
      await card.waitFor({ timeout: 60000 });
      await card
        .getByRole("button", { name: "I don't need this any more" })
        .click();
      await card.getByText("Withdrawn").waitFor({ timeout: 60000 });
      return "the emergency note shows; the request was kept under Your requests, then withdrawn";
    },
  },
  {
    id: "PY4",
    section: "10a. Prayer, faith journey and care",
    title: "Choose your church and site from FaithNet's churches",
    rows: ["Ask your church for care", "Your church and site"],
    timeoutMs: 240_000,
    checks:
      "Journey → Your church lists FaithNet's .church churches; Calvary Bible Church says its own sites (Boulder, Erie, Thornton, with addresses and service times); choosing Erie saves Calvary Bible Church · Erie through the reader's agent; Care then says requests go to Calvary's leaders; choosing Fort Morgan (no sites) makes it the church without a site question.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await openFaith(c, "Journey");
      const card = pane.locator(".sb-faith-church");
      if (await card.count())
        await card.getByRole("button", { name: "Change" }).click();
      const calvary = pane.locator(".sb-faith-churches button", {
        hasText: "Calvary Bible Church",
      });
      await calvary.waitFor({ timeout: 60000 });
      await calvary.click();
      const erie = pane.locator(".sb-faith-site", { hasText: "Erie" });
      await erie.waitFor({ timeout: 60000 });
      if (!/615 Evans/.test(await erie.innerText()))
        throw new Error(`Erie shows no address: ${await erie.innerText()}`);
      await erie.locator("input").check();
      await pane.getByRole("button", { name: "Save" }).click();
      await card
        .filter({ hasText: "Calvary Bible Church" })
        .filter({ hasText: "Erie" })
        .waitFor({ timeout: 60000 });
      await pane.getByRole("tab", { name: "Care" }).click();
      await pane
        .getByText(/Goes to the leaders of Calvary Bible Church/)
        .waitFor({ timeout: 10000 });
      await pane.getByRole("tab", { name: "Journey" }).click();
      await card.getByRole("button", { name: "Change" }).click();
      await pane
        .locator(".sb-faith-churches button", { hasText: "Fort Morgan" })
        .click();
      await card
        .filter({ hasText: "Fort Morgan" })
        .filter({ hasText: "All sites" })
        .waitFor({ timeout: 60000 });
      return "Calvary Bible Church listed its sites; Erie was saved and Care sends to Calvary's leaders; Fort Morgan (no sites) was chosen without a site question";
    },
  },
  {
    id: "PY5",
    section: "10a. Prayer, faith journey and care",
    title: "Open your faith journey from the top menu",
    rows: ["Your faith journey"],
    timeoutMs: 120_000,
    checks:
      "The sidebar's ⋮ More menu lists Journey under Friends; choosing it opens the Faith page on its Journey tab. The toolbar's Prayer button still opens on Prayer.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      await c.page
        .locator(".sb-sidebar-top-row")
        .getByRole("button", { name: "More" })
        .click();
      const items = await c.page.getByRole("menuitem").allInnerTexts();
      const friends = items.findIndex((i) => /Friends/.test(i));
      if (friends < 0 || !/Journey/.test(items[friends + 1] ?? ""))
        throw new Error(`Journey is not under Friends: ${items.join(" | ")}`);
      await c.page.getByRole("menuitem", { name: "Journey" }).click();
      const pane = c.page.locator(".sb-faith");
      await pane.waitFor({ timeout: 10000 });
      if (
        (await pane
          .getByRole("tab", { name: "Journey" })
          .getAttribute("aria-selected")) !== "true"
      )
        throw new Error("the Faith page did not open on Journey");
      await c.pressToolbar("Prayer");
      await pane.waitFor({ state: "detached", timeout: 5000 });
      await c.pressToolbar("Prayer");
      await pane.waitFor({ timeout: 10000 });
      if (
        (await pane
          .getByRole("tab", { name: "Prayer" })
          .getAttribute("aria-selected")) !== "true"
      )
        throw new Error("the Prayer button did not open on Prayer");
      return "More → Journey (under Friends) opened the Journey tab; the Prayer button opened on Prayer";
    },
  },
];
