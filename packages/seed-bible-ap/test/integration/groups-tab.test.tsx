// MORE → GROUPS and MORE → CHURCH (ap-church spec 204): a reader joins a group their church lists, adds one of their
// own, leaves one, and keeps more than one church. Everything is the one record their agent holds.
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, waitFor } from "@testing-library/preact";
import { FaithPane } from "../../apps/reader-web/src/components/faith/FaithPane";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";

afterEach(() => {
  document.body.innerHTML = "";
});

const CALVARY = "0x863bd39e938ac593c8d67a11f2f6c12d824b2526";
const calvary = {
  church: {
    agent: CALVARY,
    name: "calvary-bible-co.church",
    displayName: "Calvary Bible Church",
  },
  sites: [
    { id: "campus_boulder", name: "Boulder" },
    { id: "campus_erie", name: "Erie" },
  ],
  groups: [
    {
      id: "group_mens",
      name: "Men’s Group",
      kind: "men" as const,
      schedule: "Thursdays 6:30 AM",
      site: "campus_erie",
    },
    { id: "group_erie_home", name: "Erie Home Group", kind: "home" as const },
  ],
};
const fortMorgan = {
  church: {
    agent: "0x" + "f".repeat(40),
    name: "fort-morgan-household.church",
    displayName: "Fort Morgan household church",
  },
  sites: [],
};

const open = async (
  tab: "groups" | "church",
  opts: { church?: boolean; identity?: null } = {}
) => {
  const t = await createTestReaderState(
    opts.identity === null ? { identity: null } : {}
  );
  t.backend!.churchesOnFaithNet.push(calvary, fortMorgan);
  if (opts.church)
    await t.state.faith.chooseChurch(
      { agent: CALVARY, name: calvary.church.name },
      "campus_erie"
    );
  t.state.ui.faithTab.value = tab;
  const r = renderInHost(<FaithPane state={t.state} />);
  return { t, r, groups: () => t.state.faith.churchHome.value.groups };
};

describe("More → Groups", () => {
  it("shows the church's groups with when and where they meet, and joins one", async () => {
    const { r, groups } = await open("groups", { church: true });
    const join = await waitFor(() =>
      r.getByRole("button", { name: "I'm in Men’s Group" })
    );
    expect(r.container.textContent).toMatch(/Groups at Calvary Bible Church/);
    expect(r.container.textContent).toMatch(/Thursdays 6:30 AM/);
    expect(r.container.textContent).toMatch(/You have not added a group yet\./);
    fireEvent.click(join);
    await waitFor(() =>
      expect(groups()).toEqual([
        { id: "group_mens", name: "Men’s Group", kind: "men", church: CALVARY },
      ])
    );
    // It now shows under My groups, and the church's card offers Leave instead of joining again.
    await waitFor(() =>
      expect(r.queryByRole("button", { name: "I'm in Men’s Group" })).toBeNull()
    );
    expect(r.queryByText("In my groups")).not.toBeNull();
    expect(r.queryByText("You have not added a group yet.")).toBeNull();
  });

  it("leaves a group", async () => {
    const { t, r, groups } = await open("groups", { church: true });
    await t.state.faith.joinGroup(CALVARY, "group_erie_home");
    const leave = await waitFor(
      () => r.getAllByRole("button", { name: "Leave Erie Home Group" })[0]!
    );
    fireEvent.click(leave);
    await waitFor(() => expect(groups()).toEqual([]));
  });

  it("adds a group of the reader's own, and removes it", async () => {
    const { r, groups } = await open("groups", { church: true });
    const name = r.getByLabelText("Group name") as HTMLInputElement;
    const add = r.getByRole("button", { name: "Add my group" });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.input(name, { target: { value: "Thursday friends" } });
    fireEvent.change(r.getByLabelText("Kind of group"), {
      target: { value: "prayer" },
    });
    fireEvent.click(add);
    await waitFor(() =>
      expect(groups()).toEqual([
        {
          id: "own-thursday-friends",
          name: "Thursday friends",
          kind: "prayer",
          church: null,
        },
      ])
    );
    expect(r.queryByText("Your own group")).not.toBeNull();
    await waitFor(() => expect(name.value).toBe(""));
    fireEvent.click(r.getByRole("button", { name: "Remove Thursday friends" }));
    await waitFor(() => expect(groups()).toEqual([]));
  });

  it("with no church chosen it points to Church, and a group of one's own can still be added", async () => {
    const { t, r, groups } = await open("groups");
    const choose = await waitFor(() =>
      r.getByRole("button", { name: "Choose my church" })
    );
    fireEvent.input(r.getByLabelText("Group name"), {
      target: { value: "Friday breakfast" },
    });
    fireEvent.click(r.getByRole("button", { name: "Add my group" }));
    await waitFor(() =>
      expect(groups().map((g) => g.name)).toEqual(["Friday breakfast"])
    );
    fireEvent.click(choose);
    expect(t.state.ui.faithTab.value).toBe("church");
  });

  it("a church that lists no groups says so", async () => {
    const { t, r } = await open("groups");
    await t.state.faith.chooseChurch(fortMorgan.church, null);
    await waitFor(() =>
      expect(r.container.textContent).toMatch(
        /Fort Morgan household church has not listed any groups yet/
      )
    );
  });

  it("a group the church stops listing stays in My groups, marked, and other groups can still be joined", async () => {
    const { t, r, groups } = await open("groups", { church: true });
    await t.state.faith.joinGroup(CALVARY, "group_mens");
    const listed = t.backend!.churchesOnFaithNet.find(
      (d) => d.church.agent === CALVARY
    )!;
    listed.groups = listed.groups!.filter((g) => g.id !== "group_mens");
    // Leaving the page and coming back asks the church again.
    t.state.ui.faithTab.value = "church";
    await waitFor(() => expect(r.queryByLabelText("Church")).not.toBeNull());
    t.state.ui.faithTab.value = "groups";
    await waitFor(() =>
      expect(r.queryByText("No longer listed by the church")).not.toBeNull()
    );
    fireEvent.click(
      await waitFor(() =>
        r.getByRole("button", { name: "I'm in Erie Home Group" })
      )
    );
    await waitFor(() =>
      expect(groups().map((g) => g.id)).toEqual([
        "group_mens",
        "group_erie_home",
      ])
    );
  });

  it("a stranger is asked to sign in", async () => {
    const { r } = await open("groups", { identity: null });
    expect(r.container.textContent).toMatch(
      /Sign in to keep your groups and your church/
    );
    expect(r.queryByLabelText("Group name")).toBeNull();
  });
});

describe("More → Church", () => {
  it("adds another church without changing the main one, then makes it the main one, then removes it", async () => {
    const { t, r } = await open("church", { church: true });
    const home = () => t.state.faith.churchHome.value;
    const add = (await waitFor(() =>
      r.getByLabelText("Add another church")
    )) as HTMLSelectElement;
    await waitFor(() => expect(add.options.length).toBe(2));
    fireEvent.change(add, { target: { value: fortMorgan.church.name } });
    await waitFor(() => expect(home().churches).toHaveLength(2));
    expect(home().defaultChurch).toBe(CALVARY);
    fireEvent.click(
      await waitFor(() =>
        r.getByRole("button", {
          name: "Make Fort Morgan household church my main church",
        })
      )
    );
    await waitFor(() =>
      expect(home().defaultChurch).toBe(fortMorgan.church.agent)
    );
    // Calvary is now the other church, still at Erie.
    fireEvent.click(
      await waitFor(() =>
        r.getByRole("button", { name: "Remove Calvary Bible Church" })
      )
    );
    await waitFor(() =>
      expect(home().churches.map((c) => c.agent)).toEqual([
        fortMorgan.church.agent,
      ])
    );
  });

  it("another church with several sites can have its site chosen", async () => {
    const { t, r } = await open("church");
    await t.state.faith.chooseChurch(fortMorgan.church, null);
    await t.state.faith.addChurch(calvary.church, null);
    const site = (await waitFor(() =>
      r.getByLabelText("Site at Calvary Bible Church")
    )) as HTMLSelectElement;
    expect(site.value).toBe("all");
    fireEvent.change(site, { target: { value: "campus_boulder" } });
    await waitFor(() =>
      expect(
        t.state.faith.churchHome.value.churches.find((c) => c.agent === CALVARY)
          ?.site?.id
      ).toBe("campus_boulder")
    );
    expect(t.state.faith.churchHome.value.defaultChurch).toBe(
      fortMorgan.church.agent
    );
  });
});
