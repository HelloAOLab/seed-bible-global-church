// PLAYLIST HISTORY: one row per playlist, the step the reader reached and whether they stopped, resumable; rows
// group by day, newest first.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createPlaylists } from "../../../apps/reader-web/src/state/library/playlists";
import {
  dayKind,
  groupPlayHistoryByDay,
  isComplete,
  percentOf,
  type PlayHistoryEntry,
} from "../../../apps/reader-web/src/state/library/playHistory";

const scripture = (passage: string) =>
  ({
    "@type": "seed:ScriptureItem",
    aboutPassage: passage,
    translation: "BSB",
  }) as never;

describe("playlist history", () => {
  it("keeps one row per playlist with the step reached, and the end when stopped", async () => {
    const stores = memoryStores();
    const pls = createPlaylists(createDevBackend(null), stores, () => null);
    const a = await pls.create("Advent", [
      scripture("ISA.9"),
      scripture("LUK.1"),
      scripture("LUK.2"),
    ]);
    const b = await pls.create("Psalms", [scripture("PSA.23")]);
    pls.play(a["@id"]);
    pls.next();
    pls.next();
    pls.stop();
    pls.play(b["@id"]);
    pls.stop();
    pls.play(a["@id"], 1);
    expect(
      pls.history.value.map((h) => [h.title, h.currentStep, !!h.endedAt])
    ).toEqual([
      ["Advent", 1, false],
      ["Psalms", 0, true],
    ]);
    const advent = pls.history.value[0]!;
    expect(advent.lastItem).toBe("LUK.1");
    expect(percentOf(advent)).toBe(67);
    expect(isComplete(pls.history.value[1]!)).toBe(true);
    // Kept on the device: a new manager over the same stores reads it back.
    await new Promise((r) => setTimeout(r, 0));
    const again = createPlaylists(createDevBackend(null), stores, () => null);
    await new Promise((r) => setTimeout(r, 0));
    expect(again.history.value.map((h) => h.title)).toEqual([
      "Advent",
      "Psalms",
    ]);
  });

  it("groups by day, newest first, and names today and yesterday", () => {
    const now = new Date("2026-10-22T15:00:00").getTime();
    const row = (id: string, at: number): PlayHistoryEntry => ({
      playlistId: id,
      title: id,
      totalSteps: 2,
      currentStep: 0,
      lastItem: "",
      startedAt: at,
      durationMs: 0,
    });
    const groups = groupPlayHistoryByDay([
      row("a", now - 86_400_000),
      row("b", now),
      row("c", now - 3 * 86_400_000),
      row("b", now - 1000),
    ]);
    expect(
      groups.map((g) => [g.day, g.entries.map((e) => e.playlistId)])
    ).toEqual([
      ["2026-10-22", ["b"]],
      ["2026-10-21", ["a"]],
      ["2026-10-19", ["c"]],
    ]);
    expect(groups.map((g) => dayKind(g.day, now))).toEqual([
      "today",
      "yesterday",
      "earlier",
    ]);
  });
});
