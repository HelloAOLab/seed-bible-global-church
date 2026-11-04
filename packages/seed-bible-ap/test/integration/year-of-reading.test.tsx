// MY YEAR OF READING — seedbible.org's History grid on Today: each day's reading time summed from the reader's own
// history (a chapter read counts at least a minute), shaded in four bands up to an hour, and today's square darkens
// once a chapter is read; tapping it lists what was read.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "preact/test-utils";
import { waitFor } from "@testing-library/preact";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";
import {
  YearOfReading,
  shadeFor,
} from "../../apps/reader-web/src/components/social/YearOfReading";
import { localDateKey } from "../../apps/reader-web/src/components/social/VerseOfTheDay";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("my year of reading", () => {
  it("sums a day's reading, a chapter at least a minute", async () => {
    const t = await createTestReaderState({ identity: null });
    const at = new Date();
    at.setHours(10, 0, 0, 0);
    await t.state.history.record("JHN.3", "BSB", at.toISOString());
    await t.state.history.record(
      "JHN.3",
      "BSB",
      new Date(at.getTime() + 20 * 60e3).toISOString()
    );
    await t.state.history.record("GEN.1", "BSB", at.toISOString());
    const day = (await t.state.history.daily()).get(
      localDateKey(at.getTime())
    )!;
    expect(day.seconds).toBe(20 * 60 + 60);
    expect(day.chapters.map((c) => c.chapterRef).sort()).toEqual([
      "GEN.1",
      "JHN.3",
    ]);
  });

  it("shades in seedbible.org's four bands, nothing under a minute", () => {
    expect(shadeFor(30)).toBeUndefined();
    expect(shadeFor(120)).toContain(" 25%");
    expect(shadeFor(30 * 60)).toContain(" 50%");
    expect(shadeFor(5 * 3600)).toContain(" 100%");
  });

  it("draws the year to today and lists a day's chapters when tapped", async () => {
    const t = await createTestReaderState({ identity: null });
    await t.state.history.record("JHN.3", "BSB");
    const opened: string[] = [];
    const r = renderInHost(
      <YearOfReading
        state={t.state}
        label={(c) => c}
        onOpen={(x) => opened.push(x.chapterRef)}
      />
    );
    const cells = () =>
      [
        ...r.container.querySelectorAll<HTMLElement>("[style*='grid-row']"),
      ].filter((e) => !e.className.includes("label"));
    // jsdom drops color-mix() from inline styles, so the shade itself is the band test's; today is the last day drawn
    await waitFor(() => expect(cells().length).toBeGreaterThan(0));
    const today = cells().at(-1)!;
    await act(async () => today.click());
    await waitFor(() => expect(r.container.textContent).toContain("JHN.3"));
    await act(async () =>
      [...r.container.querySelectorAll("button")]
        .find((b) => b.textContent === "JHN.3")!
        .click()
    );
    expect(opened).toEqual(["JHN.3"]);
  });
});
