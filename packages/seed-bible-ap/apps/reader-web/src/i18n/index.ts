// I18N — i18next over the 77 locale files scripts/port-locales.mjs copies here (en.json bundled, the rest loaded
// when chosen). `useI18n()` is the hook the ported components call; the language signal re-renders them.
import i18next from "i18next";
import { signal } from "@preact/signals";
import en from "./en.json";

const locales = import.meta.glob("./*.json") as Record<
  string,
  () => Promise<{ default: Record<string, unknown> }>
>;

export const AVAILABLE_LANGUAGES = Object.keys(locales)
  .map((p) => p.replace(/^\.\//, "").replace(/\.json$/, ""))
  .sort();

const RTL = new Set(["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi"]);
export const isRightToLeftLanguage = (lang: string) =>
  RTL.has(lang.split("-")[0] ?? lang);

export const language = signal("en");
const KEY = "sbr.language";

let ready: Promise<void> | null = null;

export function initI18n(
  preferred: readonly string[] = navigatorLanguages()
): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await i18next.init({
      lng: "en",
      fallbackLng: "en",
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
      returnEmptyString: false,
    });
    const saved = readSaved();
    const pick = saved ?? bestMatch(preferred);
    if (pick !== "en") await setLanguage(pick);
  })();
  return ready;
}

function navigatorLanguages(): string[] {
  return typeof navigator === "undefined"
    ? []
    : [...(navigator.languages ?? [navigator.language])];
}

function readSaved(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && AVAILABLE_LANGUAGES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function bestMatch(preferred: readonly string[]): string {
  for (const p of preferred) {
    const lower = p.toLowerCase();
    const exact = AVAILABLE_LANGUAGES.find((l) => l.toLowerCase() === lower);
    if (exact) return exact;
    const base = lower.split("-")[0]!;
    const byBase = AVAILABLE_LANGUAGES.find(
      (l) => l.toLowerCase().split("-")[0] === base
    );
    if (byBase) return byBase;
  }
  return "en";
}

export async function setLanguage(lang: string): Promise<void> {
  if (!AVAILABLE_LANGUAGES.includes(lang)) return;
  if (!i18next.hasResourceBundle(lang, "translation")) {
    const mod = await locales[`./${lang}.json`]!();
    i18next.addResourceBundle(lang, "translation", mod.default, true, true);
  }
  await i18next.changeLanguage(lang);
  language.value = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRightToLeftLanguage(lang) ? "rtl" : "ltr";
  }
}

export type T = (key: string, options?: Record<string, unknown>) => string;

export function useI18n(): {
  t: T;
  language: string;
  isRtl: boolean;
  setLanguage: typeof setLanguage;
} {
  const lang = language.value;
  const t: T = (key, options) =>
    String(i18next.t(key, { lng: lang, ...options }));
  return { t, language: lang, isRtl: isRightToLeftLanguage(lang), setLanguage };
}
