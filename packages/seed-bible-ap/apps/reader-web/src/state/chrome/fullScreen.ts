// THE WHOLE SCREEN — what the reader can do about the browser's own bars. Installed (added to the home screen) it opens
// without them; where the browser has a full-screen mode (Android Chrome, desktop) the reader switches it on; Safari on
// an iPhone has none for a page, so the way there is "Add to Home Screen", which the reader explains.
import { signal } from "@preact/signals";

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The browser's offer to install the reader (Chrome, Edge), kept for a button to use. */
export const installPrompt = signal<InstallPromptEvent | null>(null);
/** The page fills the screen in the browser's full-screen mode right now. */
export const fullScreen = signal(false);

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt.value = e as InstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => (installPrompt.value = null));
  document.addEventListener("fullscreenchange", () => {
    fullScreen.value = !!document.fullscreenElement;
  });
}

/** Opened from the home screen as an app: there are no browser bars to hide. */
export function runningAsApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches
  );
}

/** The browser can put a page in full-screen mode (Safari on an iPhone cannot). */
export const canFullScreen = () =>
  typeof document !== "undefined" && document.fullscreenEnabled === true;

export async function toggleFullScreen(): Promise<void> {
  if (document.fullscreenElement)
    await document.exitFullscreen().catch(() => undefined);
  else
    await document.documentElement
      .requestFullscreen({ navigationUI: "hide" })
      .catch(() => undefined);
}

/** Ask the browser to install the reader; true once accepted. */
export async function install(): Promise<boolean> {
  const p = installPrompt.value;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  installPrompt.value = null;
  return outcome === "accepted";
}

/** An iPhone or iPad (iPadOS reports itself as a Mac with touch). */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}
