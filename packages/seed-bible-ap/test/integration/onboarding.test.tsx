// THE FIRST VISIT, as the old reader has it: the tour offer in the corner over a readable chapter, answered once on a
// device; Take the tour starts the introduction; No, thanks then offers to install, once, where the browser can; an
// embed never shows any of it.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "preact/test-utils";
import { fireEvent, waitFor } from "@testing-library/preact";
import {
  INSTALL_OFFER_KEY,
  Onboarding,
  ONBOARDING_KEY,
} from "../../apps/reader-web/src/components/chrome/Onboarding";
import {
  installPrompt,
  type InstallPromptEvent,
} from "../../apps/reader-web/src/state/chrome/fullScreen";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";

const OFFER = "Welcome to Seed Bible. Would you like a tutorial?";
const flush = () =>
  act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });

afterEach(() => {
  document.body.innerHTML = "";
  installPrompt.value = null;
});

describe("the first visit", () => {
  it("offers the tour in the corner, whether signed in or not, and Take the tour starts it", async () => {
    const t = await createTestReaderState({});
    const r = renderInHost(<Onboarding state={t.state} />);
    await waitFor(() => expect(r.queryByText(OFFER)).not.toBeNull());
    expect(r.getByRole("dialog").getAttribute("aria-modal")).toBe("false");

    fireEvent.click(r.getByRole("button", { name: /take the tour/i }));
    await waitFor(() =>
      expect(t.state.tours.active.value?.id).toBe("introduction")
    );
    expect(r.queryByText(OFFER)).toBeNull();
    expect(await t.stores.prefs.get(ONBOARDING_KEY)).toBeTruthy();
  });

  it("No, thanks closes it for good; with nothing to install, nothing follows", async () => {
    const t = await createTestReaderState({ identity: null });
    const r = renderInHost(<Onboarding state={t.state} />);
    await waitFor(() => expect(r.queryByText(OFFER)).not.toBeNull());
    fireEvent.click(r.getByRole("button", { name: /no, thanks/i }));
    await waitFor(() => expect(r.queryByText(OFFER)).toBeNull());
    expect(r.queryByRole("dialog")).toBeNull();
    expect(t.state.tours.active.value).toBeNull();
    expect(await t.stores.prefs.get(ONBOARDING_KEY)).toBeTruthy();

    const again = renderInHost(<Onboarding state={t.state} />);
    await flush();
    expect(again.queryByText(OFFER)).toBeNull();
  });

  it("after No, thanks, offers to install once where the browser can", async () => {
    let prompted = 0;
    installPrompt.value = {
      prompt: async () => void prompted++,
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    } as unknown as InstallPromptEvent;
    const t = await createTestReaderState({ identity: null });
    const r = renderInHost(<Onboarding state={t.state} />);
    await waitFor(() => expect(r.queryByText(OFFER)).not.toBeNull());
    fireEvent.click(r.getByRole("button", { name: /no, thanks/i }));
    const installBtn = await r.findByRole("button", { name: /install app/i });
    fireEvent.click(installBtn);
    await waitFor(() => expect(prompted).toBe(1));
    await waitFor(() =>
      expect(r.queryByRole("button", { name: /install app/i })).toBeNull()
    );
    expect(await t.stores.prefs.get(INSTALL_OFFER_KEY)).toBeTruthy();
  });

  it("never comes up in an embed", async () => {
    const t = await createTestReaderState({ identity: null });
    t.state.ui.embed.value = true;
    const r = renderInHost(<Onboarding state={t.state} />);
    await flush();
    expect(r.queryByText(OFFER)).toBeNull();
  });
});
