// WORK IN FLIGHT FROM A TAP — what the moving line at the top of the page shows: a request the reader started (begun
// soon after a tap, a click, Enter or a form sent) counts while it runs. Background work (the outbox, presence,
// polling) starts without a tap and never shows, so the line means "the thing you just asked for is happening".
import { signal } from "@preact/signals";

/** How long after a tap a request still counts as the tap's. */
export const GESTURE_WINDOW_MS = 1500;

export function createActivity(now: () => number = Date.now) {
  const busy = signal(0);
  let lastGesture = -Infinity;
  const gesture = () => {
    lastGesture = now();
  };
  /** Count `work` while it runs, if it began from a tap. */
  function track<T>(work: Promise<T>): Promise<T> {
    if (now() - lastGesture > GESTURE_WINDOW_MS) return work;
    // Counted a microtask later: a request can start inside a render or an effect, where writing a signal loops.
    queueMicrotask(() => {
      busy.value++;
    });
    const done = () =>
      queueMicrotask(() => {
        busy.value = Math.max(0, busy.value - 1);
      });
    work.then(done, done);
    return work;
  }
  return { busy, gesture, track };
}

export type Activity = ReturnType<typeof createActivity>;

export const activity = createActivity();

/** Watch taps and wrap `fetch` (in the browser, once). Returns the undo. */
export function watchActivity(a: Activity = activity): () => void {
  if (typeof window === "undefined") return () => {};
  const events = ["pointerdown", "click", "submit"] as const;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") a.gesture();
  };
  for (const ev of events) document.addEventListener(ev, a.gesture, true);
  document.addEventListener("keydown", onKey, true);
  const original = window.fetch;
  window.fetch = (...args: Parameters<typeof fetch>) =>
    a.track(original.apply(window, args));
  return () => {
    for (const ev of events) document.removeEventListener(ev, a.gesture, true);
    document.removeEventListener("keydown", onKey, true);
    window.fetch = original;
  };
}
