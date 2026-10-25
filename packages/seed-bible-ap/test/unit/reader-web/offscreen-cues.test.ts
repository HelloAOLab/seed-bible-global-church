// Off-screen highlights: which of someone else's highlights lie wholly above or below the visible reader, one bubble
// per run of verses of one colour by one person.
import { describe, expect, it } from "vitest";
import {
  cueStyle,
  placeOffscreenCues,
  scrollEdges,
  type CueAuthor,
  type MeasuredCueMark,
} from "../../../apps/reader-web/src/state/reading/offscreenCues";

const ruth: CueAuthor = { key: "a", name: "Ruth", color: "#f00" };
const boaz: CueAuthor = { key: "b", name: "Boaz", color: "#00f" };
/** Verse n laid out 100px tall, one under another. */
const mark = (
  verse: number,
  color = "yellow",
  author: CueAuthor | null = ruth
): MeasuredCueMark => ({
  verse,
  ...cueStyle(color),
  author,
  top: (verse - 1) * 100,
  bottom: verse * 100,
});
const view = { top: 1000, bottom: 1500 }; // verses 11–15 on screen

describe("off-screen highlight cues", () => {
  it("gathers a run of one colour by one person into one bubble, on its side", () => {
    const { up, down } = placeOffscreenCues(
      [mark(3), mark(4), mark(5), mark(12), mark(20)],
      view
    );
    expect(up.map((c) => c.label)).toEqual(["3–5"]);
    expect(up[0]!.verse).toBe(3);
    expect(down.map((c) => c.label)).toEqual(["20"]);
  });

  it("keeps runs apart when the colour or the person changes, or a verse is skipped", () => {
    const { down } = placeOffscreenCues(
      [
        mark(20),
        mark(21, "green"),
        mark(22, "green", boaz),
        mark(24, "green", boaz),
      ],
      view
    );
    expect(down.map((c) => `${c.label}:${c.author?.name}`)).toEqual([
      "20:Ruth",
      "21:Ruth",
      "22:Boaz",
      "24:Boaz",
    ]);
  });

  it("a verse on screen raises nothing; one showing no more than a hair still counts as off screen", () => {
    const peeking: MeasuredCueMark = { ...mark(10), top: 900, bottom: 1005 };
    expect(placeOffscreenCues([mark(12), peeking], view)).toEqual({
      up: [],
      down: [],
    });
    const hair: MeasuredCueMark = { ...mark(10), top: 900, bottom: 1001 };
    expect(placeOffscreenCues([hair], view).up.map((c) => c.label)).toEqual([
      "10",
    ]);
  });

  it("a sideways row shows an arrow only towards bubbles past its edge", () => {
    expect(scrollEdges(0, 300, 300)).toEqual({ left: false, right: false });
    expect(scrollEdges(0, 600, 300)).toEqual({ left: false, right: true });
    expect(scrollEdges(300, 600, 300)).toEqual({ left: true, right: false });
  });
});
