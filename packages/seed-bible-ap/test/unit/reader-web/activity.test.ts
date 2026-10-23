// THE TOP LINE'S COUNT: work started soon after a tap counts until it settles (done or failed); work started with
// no tap (background sync, polling) never counts.
import { describe, expect, it } from "vitest";
import {
  GESTURE_WINDOW_MS,
  createActivity,
} from "../../../apps/reader-web/src/state/chrome/activity";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("work in flight from a tap", () => {
  it("counts a tap's requests until each settles, failures too", async () => {
    let t = 1000;
    const a = createActivity(() => t);
    a.gesture();
    const ok = deferred();
    const bad = deferred();
    a.track(ok.promise);
    a.track(bad.promise).catch(() => {});
    await flush();
    expect(a.busy.value).toBe(2);
    ok.resolve();
    bad.reject(new Error("refused"));
    await flush();
    expect(a.busy.value).toBe(0);
  });

  it("ignores work begun with no tap, or long after one", async () => {
    let t = 1000;
    const a = createActivity(() => t);
    a.track(deferred().promise);
    expect(a.busy.value).toBe(0);
    a.gesture();
    t += GESTURE_WINDOW_MS + 1;
    a.track(deferred().promise);
    await flush();
    expect(a.busy.value).toBe(0);
  });
});
