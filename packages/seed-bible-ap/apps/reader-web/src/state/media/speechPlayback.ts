// THE DEVICE VOICE AS A PLAYER — the old reader's text-to-speech playback controller: the chapter's verses read in
// turn, with a position by verse, so the same scrubber the recordings use can show where it is, pause and pick it up
// again there, and jump to any verse. Pausing keeps the place; Stop forgets it.
import { computed, effect, signal } from "@preact/signals";
import type { AudioPlaybackController } from "./audio";
import type {
  SpeakOptions,
  SpeechVerse,
  TextToSpeechManager,
} from "./textToSpeech";

export function createSpeechPlayback(tts: TextToSpeechManager) {
  const verses = signal<SpeechVerse[]>([]);
  /** Which of the verses is being read (or will be, on Play). */
  const position = signal(0);
  let options: SpeakOptions = { lang: null };

  // Where the voice is, as it moves on.
  effect(() => {
    const n = tts.currentVerse.value;
    if (n === null) return;
    const i = verses.peek().findIndex((v) => v.number === n);
    if (i >= 0) position.value = i;
  });

  function from(index: number) {
    const list = verses.peek();
    if (!list.length) return;
    const start = Math.min(Math.max(0, Math.round(index)), list.length - 1);
    position.value = start;
    tts.speak(list.slice(start), {
      ...options,
      onFinished: () => {
        verses.value = [];
        position.value = 0;
        options.onFinished?.();
      },
    });
  }

  const controller: AudioPlaybackController = {
    unit: "verses",
    isPlaying: tts.isSpeaking,
    currentTime: position,
    duration: computed(() => verses.value.length || null),
    play: () => from(position.peek()),
    pause: () => tts.stop(),
    seek: (p) => {
      if (tts.isSpeaking.peek()) from(p);
      else
        position.value = Math.min(
          Math.max(0, Math.round(p)),
          Math.max(0, verses.peek().length - 1)
        );
    },
    stop: () => {
      tts.stop();
      verses.value = [];
      position.value = 0;
    },
    verseAt: (p) => {
      const v = verses.peek()[Math.round(p)];
      return v ? { number: v.number, heading: null } : null;
    },
    verseMarks: () =>
      verses.peek().map((v, i) => ({
        position: i,
        startsSection: false,
      })),
  };

  return {
    controller,
    /** Whether a chapter is loaded into the voice (playing or paused). */
    loaded: computed(() => verses.value.length > 0),
    /** Read these verses from the first, replacing whatever was loaded. */
    start(list: SpeechVerse[], opts: SpeakOptions) {
      options = opts;
      verses.value = list;
      from(0);
    },
  };
}

export type SpeechPlayback = ReturnType<typeof createSpeechPlayback>;
