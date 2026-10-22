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
export type LineHeight = "compact" | "normal" | "relaxed";
export type Margins = "narrow" | "normal" | "wide";
export type UiScale = "s" | "m" | "l";

/** A theme's font stylesheet is loaded only from Google Fonts or the serving plane's files — never anywhere else. */
export function allowedFontStylesheet(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (
      u.hostname === "fonts.googleapis.com" ||
      /\.faithnet\.io$/.test(u.hostname)
    )
      return u.toString();
    return null;
  } catch {
    return null;
  }
}

const KEY = "sbr.settings";

interface Persisted {
  theme?: ThemeChoice;
  fontSize?: FontSize;
  lineHeight?: LineHeight;
  margins?: Margins;
  uiScale?: UiScale;
  scripture?: Partial<ScriptureElementsBehavior>;
}

function read(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Persisted;
  } catch {
    return {};
  }
}

export interface SettingsDeps {
  /** A selected customization's theme for the scheme, when one is selected (state/chrome/customizations.ts). */
  brand?: (prefersDark: boolean) => BibleTheme | null;
}

export function createSettings(deps: SettingsDeps = {}) {
  const saved = read();
  const theme = signal<ThemeChoice>(saved.theme ?? "system");
  const fontSize = signal<FontSize>(saved.fontSize ?? "m");
  const lineHeight = signal<LineHeight>(saved.lineHeight ?? "normal");
  const margins = signal<Margins>(saved.margins ?? "normal");
  const uiScale = signal<UiScale>(saved.uiScale ?? "m");
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

  const prefersDark = () =>
    theme.value === "dark" || (theme.value === "system" && systemDark.value);
  const resolvedTheme = (): BibleTheme =>
    deps.brand?.(prefersDark()) ?? (prefersDark() ? DARK_THEME : LIGHT_THEME);

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
    // The reader's own typography choices beat the theme's defaults; "normal" leaves the theme's value in force.
    const root = document.documentElement;
    root.dataset["sbLine"] = lineHeight.value;
    root.dataset["sbMargins"] = margins.value;
    root.dataset["sbScale"] = uiScale.value;
    // A theme may bring its fonts (a Google Fonts stylesheet); anything else is not loaded.
    const font = allowedFontStylesheet(t.variables["fontStylesheet"]);
    let link = document.getElementById(
      "sb-theme-font"
    ) as HTMLLinkElement | null;
    if (font) {
      if (!link) {
        link = document.createElement("link");
        link.id = "sb-theme-font";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      if (link.href !== font) link.href = font;
    } else link?.remove();
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (meta && t.variables["background"])
      meta.content = t.variables["background"];
    try {
      const p: Persisted = {
        theme: theme.value,
        fontSize: fontSize.value,
        lineHeight: lineHeight.value,
        margins: margins.value,
        uiScale: uiScale.value,
        scripture: scripture.value,
      };
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* storage blocked: the setting lives for this page */
    }
  });

  const toggleTheme = () => {
    theme.value = prefersDark() ? "light" : "dark";
  };

  return {
    theme,
    fontSize,
    lineHeight,
    margins,
    uiScale,
    scripture,
    resolvedTheme,
    toggleTheme,
    dispose,
  };
}

export type Settings = ReturnType<typeof createSettings>;
