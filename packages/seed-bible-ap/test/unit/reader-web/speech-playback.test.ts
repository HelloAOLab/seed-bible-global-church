// The device voice as a player: reads the verses in turn, keeps its place by verse when paused, picks up there on
// Play, jumps to a verse while reading, and forgets the place on Stop. The browser's speech engine is the boundary.
import { describe, expect, it } from "vitest";
import { signal } from "@preact/signals";
import { createSpeechPlayback } from "../../../apps/reader-web/src/state/media/speechPlayback";
import type {
  SpeakOptions,
  SpeechVerse,
  TextToSpeechManager,
} from "../../../apps/reader-web/src/state/media/textToSpeech";

function fakeVoice() {
  const isSpeaking = signal(false);
  const currentVerse = signal<number | null>(null);
  const runs: { verses: number[]; options: SpeakOptions }[] = [];
  const tts: TextToSpeechManager = {
    isSupported: signal(true),
    canSpeakLanguage: () => true,
    isSpeaking,
    currentVerse,
    speak: (verses: readonly SpeechVerse[], options: SpeakOptions) => {
      runs.push({ verses: verses.map((v) => v.number), options });
      isSpeaking.value = true;
      currentVerse.value = verses[0]?.number ?? null;
    },
    stop: () => {
      isSpeaking.value = false;
      currentVerse.value = null;
    },
    dispose: () => {},
  };
  /** The engine moving on to a verse, as its utterances start. */
  const reach = (n: number) => (currentVerse.value = n);
  /** The last utterance ending by itself. */
  const finish = () => {
    isSpeaking.value = false;
    currentVerse.value = null;
    runs[runs.length - 1]?.options.onFinished?.();
  };
  return { tts, runs, reach, finish };
}

const verses = [1, 2, 3, 4, 5].map((n) => ({ number: n, text: `verse ${n}` }));

describe("the device voice as a player", () => {
  it("pauses on a verse and Play carries on from that verse", () => {
    const v = fakeVoice();
    const sp = createSpeechPlayback(v.tts);
    sp.start(verses, { lang: "en" });
    expect(sp.controller.duration.value).toBe(5);
    v.reach(3);
    expect(sp.controller.currentTime.value).toBe(2);
    sp.controller.pause();
    expect(sp.controller.isPlaying.value).toBe(false);
    expect(sp.loaded.value).toBe(true);
    sp.controller.play();
    expect(v.runs[v.runs.length - 1]!.verses).toEqual([3, 4, 5]);
  });

  it("a jump while reading starts there; a jump while paused waits for Play", () => {
    const v = fakeVoice();
    const sp = createSpeechPlayback(v.tts);
    sp.start(verses, { lang: "en" });
    sp.controller.seek(3);
    expect(v.runs[v.runs.length - 1]!.verses).toEqual([4, 5]);
    sp.controller.pause();
    sp.controller.seek(1);
    expect(v.runs).toHaveLength(2);
    expect(sp.controller.verseAt?.(1)).toEqual({ number: 2, heading: null });
    sp.controller.play();
    expect(v.runs[v.runs.length - 1]!.verses).toEqual([2, 3, 4, 5]);
  });

  it("Stop, or reaching the end, forgets the chapter", () => {
    const v = fakeVoice();
    const sp = createSpeechPlayback(v.tts);
    let ended = 0;
    sp.start(verses, { lang: "en", onFinished: () => ended++ });
    v.finish();
    expect(ended).toBe(1);
    expect(sp.loaded.value).toBe(false);
    sp.start(verses, { lang: "en" });
    v.reach(4);
    sp.controller.stop();
    expect(sp.loaded.value).toBe(false);
    expect(sp.controller.currentTime.value).toBe(0);
  });
});
