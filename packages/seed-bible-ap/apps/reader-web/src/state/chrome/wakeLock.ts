// KEEP THE SCREEN ON — the browser's screen wake lock, held while the setting is on and the tab is visible (the old
// OsManager `requestWakeLock` behind SettingsManager `keepScreenAwake`). A browser releases the lock whenever the
// tab is hidden, so it is asked for again each time the tab comes back. Where the browser has no wake lock the
// setting simply does nothing.
import { effect, type Signal } from "@preact/signals";

interface Sentinel {
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}
interface WakeLockApi {
  request(type: "screen"): Promise<Sentinel>;
}

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export function bindWakeLock(enabled: Signal<boolean>): () => void {
  if (typeof document === "undefined" || !wakeLockSupported()) return () => {};
  const api = (navigator as unknown as { wakeLock: WakeLockApi }).wakeLock;
  let held: Sentinel | null = null;
  const acquire = async () => {
    if (held || !enabled.peek() || document.visibilityState !== "visible")
      return;
    try {
      held = await api.request("screen");
      held.addEventListener("release", () => (held = null));
    } catch {
      held = null;
    }
  };
  const release = async () => {
    const h = held;
    held = null;
    await h?.release().catch(() => undefined);
  };
  const onVisible = () => void acquire();
  document.addEventListener("visibilitychange", onVisible);
  const stop = effect(() => void (enabled.value ? acquire() : release()));
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisible);
    void release();
  };
}
