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

/** More → Groups or Church (under Friends): the Faith page on its Groups · Church tabs. */
async function openCommunity(c: FlowContext, tab: "Groups" | "Church") {
  await c.page
    .locator(".sb-sidebar-top-row")
    .getByRole("button", { name: "More" })
    .click();
  const items = (await c.page.getByRole("menuitem").allInnerTexts()).map((i) =>
    i.replace(/^\S+\s+/, "").trim()
  );
  const friends = items.indexOf("Friends");
  if (
    friends < 0 ||
    items[friends + 1] !== "Groups" ||
    items[friends + 2] !== "Church"
  )
    throw new Error(
      `Groups and Church are not right under Friends: ${items.join(" | ")}`
    );
  await c.page.getByRole("menuitem", { name: tab, exact: true }).click();
  const pane = c.page.locator(".sb-faith");
  await pane.waitFor({ timeout: 10000 });
  if (
    (await pane
      .getByRole("tab", { name: tab })
      .getAttribute("aria-selected")) !== "true"
  )
    throw new Error(`the page did not open on ${tab}`);
  await pane.locator(".sb-faith-tab").first().waitFor({ timeout: 30000 });
  return pane;
}

/** The sample person's main church is Calvary Bible Church at Erie, whatever an earlier flow left. */
async function ensureCalvary(
  c: FlowContext,
  pane: ReturnType<FlowContext["page"]["locator"]>
) {
  await pane.getByRole("tab", { name: "Church" }).click();
  const church = pane.locator("#my-church-select");
  await church.waitFor({ timeout: 30000 });
  await pane
    .locator('#my-church-select option[value="calvary-bible-co.church"]')
    .waitFor({ state: "attached", timeout: 60000 });
  const site = pane.locator("#my-church-site");
  if ((await church.inputValue()) !== "calvary-bible-co.church")
    await church.selectOption("calvary-bible-co.church");
  await site.waitFor({ timeout: 60000 });
  if ((await site.inputValue()) !== "campus_erie") {
    await site.selectOption("campus_erie");
    await pane.getByText("Saved.").waitFor({ timeout: 90000 });
  }
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
    title: "Choose your church and site in Settings",
    rows: ["Ask your church for care", "Your church and site"],
    timeoutMs: 240_000,
    checks:
      "Settings → My church lists FaithNet's .church churches. Calvary Bible Church shows a Site dropdown (Boulder, Erie, Thornton, All sites); choosing Erie saves it and shows its address and service times; after a reload the dropdown still shows Erie; Care says requests go to Calvary's leaders. Saved as All sites the dropdown stays. Fort Morgan (no sites) saves without a site question.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const openCard = async () => {
        const view = await c.openSettings();
        await view.getByText("My church", { exact: true }).first().click();
        const church = view.locator("#my-church-select");
        await church.waitFor({ timeout: 10000 });
        await view
          .locator('#my-church-select option[value="calvary-bible-co.church"]')
          .waitFor({ state: "attached", timeout: 60000 });
        return { view, church, site: view.locator("#my-church-site") };
      };
      let { view, church, site } = await openCard();
      await church.selectOption("calvary-bible-co.church");
      await site.waitFor({ timeout: 60000 });
      const names = await site.locator("option").allInnerTexts();
      for (const n of ["Boulder", "Erie", "Thornton", "All sites"])
        if (!names.includes(n)) throw new Error(`no ${n}: ${names.join("|")}`);
      await site.selectOption("campus_erie");
      await view.getByText("Saved.").waitFor({ timeout: 60000 });
      await view.getByText(/615 Evans St\./).waitFor({ timeout: 5000 });

      await c.page.reload({ waitUntil: "domcontentloaded" });
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      ({ view, church, site } = await openCard());
      await site.waitFor({ timeout: 60000 });
      if ((await site.inputValue()) !== "campus_erie")
        throw new Error(
          `after a reload the site is ${await site.inputValue()}`
        );

      await site.selectOption("all");
      await view.getByText("Saved.").waitFor({ timeout: 60000 });
      if ((await site.inputValue()) !== "all" || !(await site.isVisible()))
        throw new Error("All sites hid the site dropdown");
      await site.selectOption("campus_erie");
      await view.getByText("Saved.").waitFor({ timeout: 60000 });

      await c.page
        .locator('button[aria-label="Close Settings"]:visible')
        .first()
        .click();
      const pane = await openFaith(c, "Care");
      // With one church Care names it; with others followed it offers them, the default chosen.
      const which = pane.locator("#faith-care-church");
      await pane
        .getByText(/Goes to the leaders of Calvary Bible Church/)
        .or(which)
        .first()
        .waitFor({ timeout: 30000 });
      if (await which.count()) {
        const to = await which.locator("option:checked").innerText();
        if (to !== "Calvary Bible Church")
          throw new Error(`Care goes to ${to}, not the default church`);
      }

      ({ view, church, site } = await openCard());
      await church.selectOption("fort-morgan-household.church");
      await view.getByText("Saved.").waitFor({ timeout: 60000 });
      if (await site.count())
        throw new Error("Fort Morgan, with no sites, asked for a site");
      return "Calvary showed its sites; Erie was saved and held after a reload; All sites kept the dropdown; Care sends to Calvary's leaders; Fort Morgan saved without a site question";
    },
  },
  {
    id: "PY5",
    section: "10a. Prayer, faith journey and care",
    title: "Open your faith journey from the top menu",
    rows: ["Your faith journey"],
    timeoutMs: 120_000,
    checks:
      "The sidebar's ⋮ More menu lists Journey under Friends (after Groups and Church); choosing it opens the Faith page on its Journey tab. The toolbar's Prayer button still opens on Prayer.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      await c.page
        .locator(".sb-sidebar-top-row")
        .getByRole("button", { name: "More" })
        .click();
      const items = await c.page.getByRole("menuitem").allInnerTexts();
      const friends = items.findIndex((i) => /Friends/.test(i));
      const under = items
        .slice(friends + 1, friends + 4)
        .map((i) => i.replace(/^\S+\s+/, "").trim());
      if (friends < 0 || !under.includes("Journey"))
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
  {
    id: "PY6",
    section: "10a. Prayer, faith journey and care",
    title: "Keep your groups: join one your church lists, add one of your own",
    rows: ["Your groups"],
    timeoutMs: 300_000,
    checks:
      "The sidebar's ⋮ More menu lists Groups and Church right under Friends. Groups shows the groups Calvary Bible Church lists. I'm in this group puts one under My groups, marked In my groups; after a reload it is still there; Leave takes it away. A group of your own is added by name and kind, shows as Your own group, and Remove takes it away.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await openCommunity(c, "Groups");
      await ensureCalvary(c, pane);
      await pane.getByRole("tab", { name: "Groups" }).click();
      const listed = pane.getByRole("list", {
        name: "Groups at Calvary Bible Church",
      });
      await listed.waitFor({ timeout: 60000 });
      const mine = pane.getByRole("list", { name: "My groups" });
      const card = listed.locator(".sb-faith-card").first();
      const name = (
        await card.locator(".sb-faith-card-title").innerText()
      ).trim();
      // A run that stopped half way may have left it joined.
      if (await card.getByRole("button", { name: `Leave ${name}` }).count()) {
        await card.getByRole("button", { name: `Leave ${name}` }).click();
        await card
          .getByRole("button", { name: `I'm in ${name}` })
          .waitFor({ timeout: 90000 });
      }
      await card.getByRole("button", { name: `I'm in ${name}` }).click();
      await card.getByText("In my groups").waitFor({ timeout: 90000 });
      await mine
        .locator(".sb-faith-card", { hasText: name })
        .waitFor({ timeout: 10000 });

      await c.page.reload({ waitUntil: "domcontentloaded" });
      await c.page
        .locator(".sb-app:not(.sb-app-ssr)")
        .waitFor({ timeout: 20000 });
      const again = await openCommunity(c, "Groups");
      const kept = again
        .getByRole("list", { name: "My groups" })
        .locator(".sb-faith-card", { hasText: name });
      await kept.waitFor({ timeout: 60000 });
      await kept.getByRole("button", { name: `Leave ${name}` }).click();
      await kept.waitFor({ state: "detached", timeout: 90000 });

      const own = `PY6 group ${stamp()}`;
      await again.locator("#own-group-name").fill(own);
      await again.locator("#own-group-kind").selectOption("prayer");
      await again.getByRole("button", { name: "Add my group" }).click();
      const ownCard = again
        .getByRole("list", { name: "My groups" })
        .locator(".sb-faith-card", { hasText: own });
      await ownCard.waitFor({ timeout: 90000 });
      if (!(await ownCard.getByText("Your own group").count()))
        throw new Error("a group of my own is not marked Your own group");
      if (
        !(await ownCard
          .locator(".sb-faith-chip", { hasText: "Prayer" })
          .count())
      )
        throw new Error("a group of my own lost its kind");
      await ownCard.getByRole("button", { name: `Remove ${own}` }).click();
      await ownCard.waitFor({ state: "detached", timeout: 90000 });
      return `joined ${name} at Calvary, still there after a reload, then left it; added and removed a group of my own`;
    },
  },
  {
    id: "PY7",
    section: "10a. Prayer, faith journey and care",
    title: "Keep more than one church",
    rows: ["Your church and site"],
    timeoutMs: 300_000,
    checks:
      "More → Church shows My church (Calvary Bible Church, Erie) and Other churches I go to. Add another church adds Fort Morgan household church without changing the main church; Remove takes it away again.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await openCommunity(c, "Church");
      await ensureCalvary(c, pane);
      const others = pane.getByRole("list", { name: "Other churches I go to" });
      const row = others.locator(".sb-faith-card", {
        hasText: "Fort Morgan household church",
      });
      const remove = row.getByRole("button", {
        name: "Remove Fort Morgan household church",
      });
      if (await row.count()) {
        await remove.click();
        await row.waitFor({ state: "detached", timeout: 90000 });
      }
      await pane
        .locator("#church-add-other")
        .selectOption("fort-morgan-household.church");
      await row.waitFor({ timeout: 90000 });
      if (
        (await pane.locator("#my-church-select").inputValue()) !==
        "calvary-bible-co.church"
      )
        throw new Error("adding another church changed my main church");
      await remove.click();
      await row.waitFor({ state: "detached", timeout: 90000 });
      return "Fort Morgan was added under Other churches with Calvary still the main church, then removed";
    },
  },
];
