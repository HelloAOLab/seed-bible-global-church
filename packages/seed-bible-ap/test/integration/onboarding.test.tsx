// THE WELCOME CARD: shown once on a device to someone not signed in, and gone the moment they are signed in — however
// that sign-in arrives. The case that stuck: the popup was blocked, the page went to the Home and came back, the card
// came up while the sign-in was still being finished, and stayed until a refresh.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "preact/test-utils";
import { waitFor } from "@testing-library/preact";
import {
  Onboarding,
  ONBOARDING_KEY,
} from "../../apps/reader-web/src/components/chrome/Onboarding";
import {
  createTestReaderState,
  sessionFor,
  TEST_READER,
} from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the welcome card", () => {
  it("goes away, and stays away, when a sign-in finishes after it came up", async () => {
    const t = await createTestReaderState({ identity: null });
    const r = renderInHost(<Onboarding state={t.state} />);
    await waitFor(() =>
      expect(r.queryByText("Welcome to Seed Bible")).not.toBeNull()
    );

    // the redirect return: the session lands while the card is up, not through any of its buttons
    await act(async () => {
      t.state.session.value = sessionFor(TEST_READER);
    });

    await waitFor(() =>
      expect(r.queryByText("Welcome to Seed Bible")).toBeNull()
    );
    await waitFor(async () =>
      expect(await t.stores.prefs.get(ONBOARDING_KEY)).toBeTruthy()
    );
  });

  it("does not come up for someone already signed in", async () => {
    const t = await createTestReaderState({});
    const r = renderInHost(<Onboarding state={t.state} />);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });
    expect(r.queryByText("Welcome to Seed Bible")).toBeNull();
  });

  it("does not come up again once it has been dismissed", async () => {
    const t = await createTestReaderState({ identity: null });
    await t.stores.prefs.set(ONBOARDING_KEY, "2026-10-24T00:00:00.000Z");
    const r = renderInHost(<Onboarding state={t.state} />);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });
    expect(r.queryByText("Welcome to Seed Bible")).toBeNull();
  });
});
