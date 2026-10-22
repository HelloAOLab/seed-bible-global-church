// Chapter audio over a fake element: the recording follows the chapter, the timings map seconds to verses (and
// section ticks), and play/seek/stop drive the element the way the scrubber expects.
import { describe, expect, it } from "vitest";
import {
  createChapterAudio,
  type AudioLike,
} from "../../../apps/reader-web/src/state/media/audio";
import type { TranslationBookChapter } from "../../../apps/reader-web/src/backend/bible";

function fakeAudio() {
  const listeners = new Map<string, Array<() => void>>();
  const el: AudioLike & { fire: (t: string) => void; played: number } = {
    src: "",
    currentTime: 0,
    duration: NaN,
    paused: true,
    played: 0,
    play() {
      el.paused = false;
      el.played++;
      el.fire("play");
    },
    pause() {
      el.paused = true;
      el.fire("pause");
    },
    addEventListener: (t, l) =>
      void listeners.set(t, [...(listeners.get(t) ?? []), l]),
    removeEventListener: () => {},
    fire: (t) => listeners.get(t)?.forEach((l) => l()),
  };
  return el;
}

const chapter = {
  translation: { id: "BSB", language: "eng" },
  book: { id: "JHN", name: "John" },
  thisChapterAudioLinks: { gilbert: "https://audio.test/JHN/3.mp3" },
  thisChapterAudioTimings: { gilbert: "/api/BSB/JHN/3/gilbert.json" },
  chapter: {
    number: 3,
    content: [
      { type: "heading", content: ["Jesus and Nicodemus"] },
      { type: "verse", number: 1, content: ["a"] },
      { type: "verse", number: 2, content: ["b"] },
      { type: "heading", content: ["Born again"] },
      { type: "verse", number: 3, content: ["c"] },
    ],
    footnotes: [],
  },
} as unknown as TranslationBookChapter;

describe("chapter audio", () => {
  it("loads the first reader's recording and its timings, and maps time to verses", async () => {
    const el = fakeAudio();
    const audio = createChapterAudio({
      api: { getAudioTimings: async () => ({ verses: [0, 4.5, 9] }) as never },
      createAudio: () => el,
    });
    await audio.load(chapter);
    expect(audio.available.value).toBe(true);
    expect(audio.reader.value).toBe("gilbert");
    expect(el.src).toBe("https://audio.test/JHN/3.mp3");
    expect(audio.controller.verseAt!(0)).toEqual({
      number: 1,
      heading: "Jesus and Nicodemus",
    });
    expect(audio.controller.verseAt!(5)).toEqual({ number: 2, heading: null });
    expect(audio.controller.verseAt!(20)).toEqual({
      number: 3,
      heading: "Born again",
    });
    expect(audio.controller.verseMarks!()).toEqual([
      { position: 0, startsSection: true },
      { position: 4.5, startsSection: false },
      { position: 9, startsSection: true },
    ]);
  });

  it("plays, follows the element's time, seeks to a verse, and stops back to the start", async () => {
    const el = fakeAudio();
    const audio = createChapterAudio({
      api: { getAudioTimings: async () => ({ verses: [0, 4.5, 9] }) as never },
      createAudio: () => el,
    });
    await audio.load(chapter);
    audio.play();
    expect(el.played).toBe(1);
    expect(audio.controller.isPlaying.value).toBe(true);
    el.currentTime = 6;
    el.fire("timeupdate");
    expect(audio.controller.currentTime.value).toBe(6);
    expect(audio.currentVerse.value).toBe(2);
    audio.seekToVerse(3);
    expect(el.currentTime).toBe(9);
    audio.stop();
    expect(el.paused).toBe(true);
    expect(el.currentTime).toBe(0);
    expect(audio.controller.isPlaying.value).toBe(false);
    expect(audio.currentVerse.value).toBeNull();
  });

  it("lists every reader of a chapter, switches between them, and keeps the choice for later chapters", async () => {
    const two = {
      ...chapter,
      thisChapterAudioLinks: {
        gilbert: "https://audio.test/JHN/3-g.mp3",
        hays: "https://audio.test/JHN/3-h.mp3",
      },
      thisChapterAudioTimings: {
        gilbert: "https://audio.test/JHN/3-g.json",
        hays: "https://audio.test/JHN/3-h.json",
      },
    } as typeof chapter;
    const el = fakeAudio();
    const audio = createChapterAudio({
      api: {
        getAudioTimings: async (link: string) =>
          ({ verses: link.includes("-h") ? [0, 5] : [0, 2] }) as never,
      },
      createAudio: () => el,
    });
    await audio.load(two as never);
    expect(audio.readers.value).toEqual(["gilbert", "hays"]);
    expect(audio.reader.value).toBe("gilbert");
    expect(el.src).toContain("3-g.mp3");
    await audio.setReader("hays");
    expect(audio.reader.value).toBe("hays");
    expect(el.src).toContain("3-h.mp3");
    expect(audio.controller.verseMarks!().map((m) => m.position)).toEqual([
      0, 5,
    ]);
    // The next chapter opens on the chosen reader when they recorded it, else on whoever did.
    await audio.load(two as never);
    expect(audio.reader.value).toBe("hays");
    await audio.load(chapter as never);
    expect(audio.reader.value).toBe("gilbert");
  });

  it("reports no recording for a chapter without audio links", async () => {
    const audio = createChapterAudio({
      api: { getAudioTimings: async () => ({}) as never },
      createAudio: fakeAudio,
    });
    await audio.load({
      ...chapter,
      thisChapterAudioLinks: {},
      thisChapterAudioTimings: {},
    } as TranslationBookChapter);
    expect(audio.available.value).toBe(false);
    audio.play();
    expect(audio.controller.isPlaying.value).toBe(false);
  });
});

describe("silence", () => {
  it("is not sent to the speech model, which would invent words for it", async () => {
    const { isSilent } =
      await import("../../../apps/reader-web/src/extensions/transcript/audio");
    expect(isSilent(new Float32Array(16000))).toBe(true);
    const hiss = Float32Array.from({ length: 16000 }, (_, i) =>
      i % 2 ? 0.001 : -0.001
    );
    expect(isSilent(hiss)).toBe(true);
    const voice = Float32Array.from(
      { length: 16000 },
      (_, i) => 0.2 * Math.sin(i / 8)
    );
    expect(isSilent(voice)).toBe(false);
    expect(isSilent(new Float32Array(0))).toBe(true);
  });
});
