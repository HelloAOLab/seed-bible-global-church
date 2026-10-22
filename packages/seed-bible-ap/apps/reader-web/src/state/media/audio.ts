// CHAPTER AUDIO — ported from the AudioPlaybackManager / audio-reader shape of packages/seed-bible: the API offers
// one or more readers' recordings per chapter (`thisChapterAudioLinks`) with per-verse timings; this plays one
// through an HTMLAudioElement and exposes the `AudioPlaybackController` the ported scrubber drives. The element is
// injectable so the controller is tested without a browser.
import { computed, signal, type ReadonlySignal } from "@preact/signals";
import type {
  AudioTimings,
  FreeUseBibleAPI,
  TranslationBookChapter,
} from "../../backend/bible";

export interface PlaybackVerseMark {
  position: number;
  /** Whether a heading sits directly above the verse; drawn thicker. */
  startsSection: boolean;
}

/** A verse as the scrubber's preview names it. */
export interface PlaybackVerse {
  number: number;
  /** The heading directly above the verse, or null when it doesn't start a section. */
  heading: string | null;
}

export interface AudioPlaybackController {
  unit: "seconds" | "verses";
  isPlaying: ReadonlySignal<boolean>;
  currentTime: ReadonlySignal<number>;
  duration: ReadonlySignal<number | null>;
  play: () => void;
  pause: () => void;
  seek: (position: number) => void;
  stop: () => void;
  verseAt?: (position: number) => PlaybackVerse | null;
  verseMarks?: () => PlaybackVerseMark[];
}

export function formatPlaybackTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  return `${minutes}:${secs}`;
}

/** The slice of HTMLAudioElement the controller uses. */
export interface AudioLike {
  src: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface ChapterAudioDeps {
  api: Pick<FreeUseBibleAPI, "getAudioTimings">;
  createAudio?: () => AudioLike;
}

/** Verse numbers that follow a heading in the chapter's content. */
export function sectionStarts(chapter: TranslationBookChapter): Set<number> {
  const starts = new Set<number>();
  let afterHeading = false;
  for (const entry of chapter.chapter.content) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type === "heading") afterHeading = true;
    else if (entry.type === "verse") {
      if (afterHeading) starts.add(entry.number);
      afterHeading = false;
    }
  }
  return starts;
}

/** The heading text directly above each verse that starts a section. */
export function headingsByVerse(
  chapter: TranslationBookChapter
): Map<number, string> {
  const out = new Map<number, string>();
  let heading: string | null = null;
  for (const entry of chapter.chapter.content) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type === "heading")
      heading = (entry.content as unknown[])
        .filter((x) => typeof x === "string")
        .join(" ");
    else if (entry.type === "verse") {
      if (heading) out.set(entry.number, heading);
      heading = null;
    }
  }
  return out;
}

export function createChapterAudio(deps: ChapterAudioDeps) {
  const createAudio =
    deps.createAudio ??
    (() =>
      (typeof Audio === "undefined" ? null : new Audio()) as AudioLike | null);
  const available = signal(false);
  const reader = signal<string | null>(null);
  const isPlaying = signal(false);
  const currentTime = signal(0);
  const duration = signal<number | null>(null);
  const timings = signal<AudioTimings | null>(null);
  const error = signal<string | null>(null);
  let chapter: TranslationBookChapter | null = null;
  let el: AudioLike | null = null;
  let generation = 0;

  const ensureElement = () => {
    if (el) return el;
    el = createAudio();
    if (!el) return null;
    el.addEventListener(
      "timeupdate",
      () => (currentTime.value = el!.currentTime)
    );
    el.addEventListener("durationchange", () => {
      duration.value = Number.isFinite(el!.duration) ? el!.duration : null;
    });
    el.addEventListener("play", () => (isPlaying.value = true));
    el.addEventListener("pause", () => (isPlaying.value = false));
    el.addEventListener("ended", () => {
      isPlaying.value = false;
      onEnded?.();
    });
    el.addEventListener("error", () => {
      error.value = "the recording could not be played";
      isPlaying.value = false;
    });
    return el;
  };
  let onEnded: (() => void) | null = null;

  /** Point the player at a chapter's recording (first reader), without playing. */
  async function load(next: TranslationBookChapter | null) {
    const gen = ++generation;
    chapter = next;
    stop();
    timings.value = null;
    duration.value = null;
    error.value = null;
    const links = next?.thisChapterAudioLinks ?? {};
    const first = Object.keys(links)[0] ?? null;
    reader.value = first;
    available.value = !!first;
    if (!next || !first) return;
    const audio = ensureElement();
    if (audio) {
      audio.src = links[first]!;
      audio.load?.();
    }
    const timingLink = next.thisChapterAudioTimings?.[first];
    if (!timingLink) return;
    try {
      const t = await deps.api.getAudioTimings(timingLink);
      if (gen === generation) timings.value = t;
    } catch {
      /* no timings: the scrubber works by time alone */
    }
  }

  /** Where each verse starts, in seconds, from the timings file (cumulative). */
  const verseStarts = computed<number[]>(() => timings.value?.verses ?? []);

  const verseNumbers = (): number[] =>
    (chapter?.chapter.content ?? [])
      .filter(
        (e): e is Extract<typeof e, { type: "verse" }> =>
          !!e && typeof e === "object" && e.type === "verse"
      )
      .map((e) => e.number);

  /** The verse being read at `position` seconds, or null before the first. */
  const verseAt = (position: number): PlaybackVerse | null => {
    const starts = verseStarts.value;
    if (!starts.length || !chapter) return null;
    let i = -1;
    for (let k = 0; k < starts.length; k++) if (starts[k]! <= position) i = k;
    if (i < 0) return null;
    const number = verseNumbers()[i] ?? i + 1;
    return { number, heading: headingsByVerse(chapter).get(number) ?? null };
  };

  const verseMarks = (): PlaybackVerseMark[] => {
    if (!chapter) return [];
    const starts = sectionStarts(chapter);
    const numbers = verseNumbers();
    return verseStarts.value.map((position, i) => ({
      position,
      startsSection: starts.has(numbers[i] ?? i + 1),
    }));
  };

  const currentVerse = computed<number | null>(() =>
    isPlaying.value || currentTime.value > 0
      ? (verseAt(currentTime.value)?.number ?? null)
      : null
  );

  function play() {
    const audio = ensureElement();
    if (!audio || !available.value) return;
    void Promise.resolve(audio.play()).catch(() => {
      error.value = "the recording could not be played";
    });
  }
  function pause() {
    el?.pause();
  }
  function seek(position: number) {
    const audio = ensureElement();
    if (!audio) return;
    audio.currentTime = Math.max(0, position);
    currentTime.value = audio.currentTime;
  }
  function seekToVerse(number: number) {
    const i = verseNumbers().indexOf(number);
    const at = i >= 0 ? verseStarts.value[i] : undefined;
    if (at !== undefined) seek(at);
  }
  function stop() {
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    isPlaying.value = false;
    currentTime.value = 0;
  }

  const controller: AudioPlaybackController = {
    unit: "seconds",
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    seek,
    stop,
    verseAt,
    verseMarks,
  };

  return {
    available,
    reader,
    error,
    controller,
    currentVerse,
    load,
    play,
    pause,
    stop,
    seek,
    seekToVerse,
    setOnEnded: (f: (() => void) | null) => (onEnded = f),
  };
}

export type ChapterAudio = ReturnType<typeof createChapterAudio>;
