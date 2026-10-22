// SETTINGS — the few the core reader needs now (ported from SettingsManager's scripture-elements and theme bits):
// which scripture elements show, the theme, the reader glyph size. Preferences live in localStorage (nothing
// session-like does — ADR-0003's rule is about tokens, not a font size).
import { effect, signal } from "@preact/signals";
import {
  DARK_THEME,
  LIGHT_THEME,
  generateThemeCssClasses,
  generateThemeCssVariables,
  type BibleTheme,
} from "./theme";

export interface ScriptureElementsBehavior {
  showVerseNumbers: boolean;
  showHeadings: boolean;
  showFootnotes: boolean;
  showRedLettering: boolean;
  showHighlights: boolean;
}

export type ThemeChoice = "light" | "dark" | "system";
export type FontSize = "xs" | "s" | "m" | "l" | "xl";

const KEY = "sbr.settings";

interface Persisted {
  theme?: ThemeChoice;
  fontSize?: FontSize;
  scripture?: Partial<ScriptureElementsBehavior>;
}

function read(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Persisted;
  } catch {
    return {};
  }
}

export function createSettings() {
  const saved = read();
  const theme = signal<ThemeChoice>(saved.theme ?? "system");
  const fontSize = signal<FontSize>(saved.fontSize ?? "m");
  const scripture = signal<ScriptureElementsBehavior>({
    showVerseNumbers: true,
    showHeadings: true,
    showFootnotes: true,
    showRedLettering: true,
    showHighlights: true,
    ...saved.scripture,
  });
  const systemDark = signal(
    typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-color-scheme: dark)").matches
  );
  if (typeof matchMedia !== "undefined") {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", (e) => (systemDark.value = e.matches));
  }

  const resolvedTheme = (): BibleTheme =>
    theme.value === "dark" || (theme.value === "system" && systemDark.value)
      ? DARK_THEME
      : LIGHT_THEME;

  // Theme variables are injected body-scoped (what the old ThemeManager did), so they beat the :root defaults.
  const dispose = effect(() => {
    const t = resolvedTheme();
    if (typeof document === "undefined") return;
    let el = document.getElementById("sb-theme") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "sb-theme";
      document.head.appendChild(el);
    }
    el.textContent = `body {\n${generateThemeCssVariables(t)}\n}\n${generateThemeCssClasses(t)}`;
    document.documentElement.dataset["sbTheme"] = t.id;
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (meta && t.variables["background"])
      meta.content = t.variables["background"];
    try {
      const p: Persisted = {
        theme: theme.value,
        fontSize: fontSize.value,
        scripture: scripture.value,
      };
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* storage blocked: the setting lives for this page */
    }
  });

  const toggleTheme = () => {
    theme.value = resolvedTheme().id === "dark" ? "light" : "dark";
  };

  return { theme, fontSize, scripture, resolvedTheme, toggleTheme, dispose };
}

export type Settings = ReturnType<typeof createSettings>;
