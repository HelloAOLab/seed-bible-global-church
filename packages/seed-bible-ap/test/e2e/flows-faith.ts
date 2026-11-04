// THE FAITH PAGE — Prayer, Journey and Care, kept by the sample person's own agent at the Home (person.faith.*).
// Each flow tidies up after itself: its prayer is removed, its milestone removed, its care request withdrawn.
import type { Flow, FlowContext } from "./harness";

const CH = "/read/BSB/JHN/3";
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
    id: "FA1",
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
      const label = `FA1 prayer ${stamp()}`;
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
    id: "FA2",
    section: "10a. Prayer, faith journey and care",
    title: "Say where you are on your journey; add a milestone",
    rows: ["Your faith journey"],
    timeoutMs: 240_000,
    checks:
      "Journey: tapping New believer makes it the current stage and Next steps lists Reading the Bible. Adding the milestone Baptized with a place lists it under Milestones with the place; Remove takes it away.",
    run: async (c) => {
      await c.open(CH);
      await c.signInAsSample();
      const pane = await openFaith(c, "Journey");
      const stage = pane.locator(".sb-faith-stage", {
        hasText: "New believer",
      });
      if ((await stage.getAttribute("aria-pressed")) !== "true")
        await stage.click();
      await pane
        .locator(".sb-faith-stage-current", { hasText: "New believer" })
        .waitFor({ timeout: 60000 });
      await pane
        .locator(".sb-faith-steps", { hasText: "Reading the Bible" })
        .waitFor({ timeout: 5000 });
      const place = `FA2 place ${stamp()}`;
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
    id: "FA3",
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
      const label = `FA3 please call ${stamp()}`;
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
];
