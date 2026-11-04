// SETTINGS → MY CHURCH (ap-church spec 203): the site dropdown of a multi-site church is always in sight once the church
// is chosen — a saved choice, "All sites" included, must not hide it — and a church with no sites never asks.
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, waitFor } from "@testing-library/preact";
import { MyChurchCard } from "../../apps/reader-web/src/components/faith/MyChurchCard";
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
    website: "https://calvarybible.com/",
  },
  sites: [
    {
      id: "campus_boulder",
      name: "Boulder",
      address: {
        streetAddress: "3245 Kalmia Ave.",
        addressLocality: "Boulder",
      },
    },
    {
      id: "campus_erie",
      name: "Erie",
      address: { streetAddress: "615 Evans St.", addressLocality: "Erie" },
      services: [{ day: "Sunday", time: "09:30" }],
    },
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

const setup = async () => {
  const t = await createTestReaderState({});
  t.backend!.churchesOnFaithNet.push(calvary, fortMorgan);
  const r = renderInHost(<MyChurchCard state={t.state} />);
  const church = () => r.getByLabelText("Church") as HTMLSelectElement;
  const site = () => r.queryByLabelText("Site") as HTMLSelectElement | null;
  await waitFor(() => expect(church().disabled).toBe(false));
  return { t, r, church, site };
};

describe("Settings → My church", () => {
  it("choosing a multi-site church asks for its site, and saves when the site is chosen", async () => {
    const { t, r, church, site } = await setup();
    expect(site()).toBeNull();
    fireEvent.change(church(), { target: { value: calvary.church.name } });
    await waitFor(() => expect(site()).not.toBeNull());
    expect(t.state.faith.churchHome.value.churches).toEqual([]);
    fireEvent.change(site()!, { target: { value: "campus_erie" } });
    await waitFor(() =>
      expect(t.state.faith.churchHome.value.churches[0]?.site?.id).toBe(
        "campus_erie"
      )
    );
    await waitFor(() => expect(site()!.value).toBe("campus_erie"));
    expect(r.container.textContent).toMatch(/615 Evans St\./);
    expect(r.container.textContent).toMatch(/Sunday 09:30/);
    expect(r.queryByText("Saved.")).not.toBeNull();
  });

  it("a church saved as All sites still shows the site dropdown, and it can be changed", async () => {
    const t = await createTestReaderState({});
    t.backend!.churchesOnFaithNet.push(calvary);
    await t.state.faith.chooseChurch(
      { agent: CALVARY, name: calvary.church.name },
      null
    );
    const r = renderInHost(<MyChurchCard state={t.state} />);
    const site = () => r.queryByLabelText("Site") as HTMLSelectElement | null;
    await waitFor(() => expect(site()?.value).toBe("all"));
    fireEvent.change(site()!, { target: { value: "campus_boulder" } });
    await waitFor(() =>
      expect(t.state.faith.churchHome.value.churches[0]?.site?.id).toBe(
        "campus_boulder"
      )
    );
  });

  it("a church with no sites is saved as soon as it is chosen, and asks nothing", async () => {
    const { t, church, site } = await setup();
    fireEvent.change(church(), { target: { value: fortMorgan.church.name } });
    await waitFor(() =>
      expect(t.state.faith.churchHome.value.defaultChurch).toBe(
        fortMorgan.church.agent
      )
    );
    expect(site()).toBeNull();
  });

  it("a stranger is asked to sign in", async () => {
    const t = await createTestReaderState({ identity: null });
    const r = renderInHost(<MyChurchCard state={t.state} />);
    expect(r.queryByText("Sign in to choose your church.")).not.toBeNull();
    expect(r.queryByLabelText("Church")).toBeNull();
  });
});
