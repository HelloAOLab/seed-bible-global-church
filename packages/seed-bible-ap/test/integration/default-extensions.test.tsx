// A FIRST VISIT STARTS WITH seedbible.org's EXTENSIONS — it auto-installs Compare and leaves its Discover sources
// (BibleProject content, cross-references, places, people and events) for the reader to turn on, so a new reader's
// chapter has no Discover card beside it. Turned on, a source stays on.
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/preact";
import { createTestReaderState } from "../helpers/createTestReaderState";

afterEach(() => {
  document.body.innerHTML = "";
});

const SOURCES = ["default-content", "references", "locations", "theographic"];

describe("the extensions a first visit starts with", () => {
  it("Compare on; the Discover sources off", async () => {
    const t = await createTestReaderState({ identity: null });
    const stop = await t.state.start();
    await waitFor(() =>
      expect(t.state.extensions.enabled.value.has("compare")).toBe(true)
    );
    for (const id of SOURCES)
      expect(t.state.extensions.enabled.value.has(id)).toBe(false);
    stop();
  });

  it("a source the reader turns on is remembered on the device", async () => {
    const t = await createTestReaderState({ identity: null });
    const stop = await t.state.start();
    await waitFor(() =>
      expect(t.state.extensions.enabled.value.has("compare")).toBe(true)
    );
    await t.state.extensions.setEnabled("default-content", true);
    stop();
    const again = await createTestReaderState({
      identity: null,
      stores: t.stores,
    });
    const stop2 = await again.state.start();
    await waitFor(() =>
      expect(again.state.extensions.enabled.value.has("default-content")).toBe(
        true
      )
    );
    stop2();
  });
});
