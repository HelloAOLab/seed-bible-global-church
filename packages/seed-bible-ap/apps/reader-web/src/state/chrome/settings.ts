// SETTINGS — the few the core reader needs now (ported from SettingsManager's scripture-elements and theme bits):
// which scripture elements show, the theme, the reader glyph size. Preferences live in localStorage (nothing
// session-like does — ADR-0003's rule is about tokens, not a font size).
import {
  cleanTextStyle,
  textStyleProperties,
  textStyleSheets,
  type TextStyle,
} from "./textStyle";
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
export type FontSize = "xs" | "s" | "m" | "l" | "xl" | "xxl";
export type LineHeight = "compact" | "normal" | "relaxed" | "loose";
export type Margins = "narrow" | "normal" | "wide";
export type UiScale = "s" | "m" | "l" | "xl";
/** The Old Testament in the Christian order, or the Tanakh's (Torah, Prophets, Writings). */
export type BookOrder = "traditional" | "tanakh";
/** Whose verse taps flare in a live session, on this device: as the host set (default), always, or never. */
export type SelectionEffects = "default" | "enabled" | "disabled";

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
export const MAX_CUSTOM_COLORS = 3;

interface Persisted {
  theme?: ThemeChoice;
  fontSize?: FontSize;
  lineHeight?: LineHeight;
  margins?: Margins;
  uiScale?: UiScale;
  scripture?: Partial<ScriptureElementsBehavior>;
  keepScreenAwake?: boolean;
  textStyle?: TextStyle;
  customColors?: string[];
  highlightOverrides?: HighlightOverrides;
  bookOrder?: BookOrder;
  showDiscovered?: boolean;
  selectionEffects?: SelectionEffects;
}

/** The reader's own colours for the twelve highlight colours (Settings → Themes → Highlight colors): background and
 *  text, each optional; what is not here is the theme's. */
export type HighlightOverrides = Record<
  string,
  { color?: string; fontColor?: string }
>;
const HEX = /^#[0-9a-f]{6}$/i;
function cleanOverrides(raw: unknown): HighlightOverrides {
  const out: HighlightOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const o = v as { color?: unknown; fontColor?: unknown };
    const color =
      typeof o?.color === "string" && HEX.test(o.color) ? o.color : undefined;
    const fontColor =
      typeof o?.fontColor === "string" && HEX.test(o.fontColor)
        ? o.fontColor
        : undefined;
    if (color || fontColor)
      out[id] = {
        ...(color ? { color } : {}),
        ...(fontColor ? { fontColor } : {}),
      };
  }
  return out;
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
  /** Keep the screen on while the reader is open (state/chrome/wakeLock.ts). */
  const keepScreenAwake = signal(saved.keepScreenAwake === true);
  /** Font, weight and italics for the book title, headings and verses (state/chrome/textStyle.ts). */
  const textStyle = signal<TextStyle>(cleanTextStyle(saved.textStyle));
  /** Up to three highlight colours of the reader's own (#rrggbb), after the twelve in the verse toolbar. */
  const customColors = signal<string[]>(
    (saved.customColors ?? [])
      .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
      .slice(0, MAX_CUSTOM_COLORS)
  );
  const highlightOverrides = signal<HighlightOverrides>(
    cleanOverrides(saved.highlightOverrides)
  );
  const bookOrder = signal<BookOrder>(
    saved.bookOrder === "tanakh" ? "tanakh" : "traditional"
  );
  /** The Discover card beside the chapter (the old reader's "Show discovered content"). */
  const showDiscovered = signal(saved.showDiscovered !== false);
  const selectionEffects = signal<SelectionEffects>(
    saved.selectionEffects === "enabled" ||
      saved.selectionEffects === "disabled"
      ? saved.selectionEffects
      : "default"
  );
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
  /** The theme for the scheme (a customization's, else the reader's), with the reader's own highlight colours. */
  const resolvedTheme = (): BibleTheme => {
    const base =
      deps.brand?.(prefersDark()) ?? (prefersDark() ? DARK_THEME : LIGHT_THEME);
    const own = highlightOverrides.value;
    if (!Object.keys(own).length) return base;
    const highlightColors = { ...base.highlightColors };
    for (const [id, o] of Object.entries(own))
      if (highlightColors[id])
        highlightColors[id] = { ...highlightColors[id]!, ...o };
    return { ...base, highlightColors };
  };

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
    for (const [prop, value] of Object.entries(
      textStyleProperties(textStyle.value)
    ))
      if (value) root.style.setProperty(prop, value);
      else root.style.removeProperty(prop);
    const sheets = textStyleSheets(textStyle.value);
    document
      .querySelectorAll<HTMLLinkElement>("link[data-sb-text-font]")
      .forEach((l) => {
        if (!sheets.includes(l.href)) l.remove();
      });
    for (const href of sheets)
      if (!document.querySelector(`link[data-sb-text-font][href="${href}"]`)) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        l.dataset["sbTextFont"] = "";
        document.head.appendChild(l);
      }
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
        keepScreenAwake: keepScreenAwake.value,
        textStyle: textStyle.value,
        customColors: customColors.value,
        highlightOverrides: highlightOverrides.value,
        bookOrder: bookOrder.value,
        showDiscovered: showDiscovered.value,
        selectionEffects: selectionEffects.value,
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
    keepScreenAwake,
    textStyle,
    customColors,
    highlightOverrides,
    bookOrder,
    showDiscovered,
    selectionEffects,
    resolvedTheme,
    toggleTheme,
    dispose,
  };
}

export type Settings = ReturnType<typeof createSettings>;
