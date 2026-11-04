// THE FIRST TRANSLATION A DEVICE OPENS — by its interface language, copied from the old BibleReadingManager
// `DEFAULT_TRANSLATIONS_BY_LANGUAGE` (packages/seed-bible, 2026-10-22; every id checked against the Bible API).
// English opens on AAB, as seedbible.org does (read straight from the Bible API: the scripture agent does not serve it);
// a language with no entry falls back to BSB, the agent's checked English.
import { DEFAULT_TRANSLATION } from "./reading";

export const DEFAULT_TRANSLATIONS_BY_LANGUAGE: ReadonlyMap<string, string> =
  new Map([
    ["en", "AAB"],
    ["am", "amh_amh"],
    ["ar", "ARBNAV"],
    ["bn", "ben_ocv"],
    ["es", "spa_onbv"],
    ["fa", "pes_opcb"],
    ["fr", "fra_ncl"],
    ["hi", "hin_cvb"],
    ["ind", "ind_ayt"],
    ["id", "ind_ayt"],
    ["ja", "jpn_loc"],
    ["ko", "kor_old"],
    ["ne", "npi_ncb"],
    ["pt", "por_onbv"],
    ["ru", "rus_syn"],
    ["sw", "swh_onmm"],
    ["tr", "tur_ytc"],
    ["ug", "uig_ara"],
    ["uk", "ukr_ufb"],
    ["ur", "urd_oucv"],
    ["vi", "vie_vcb"],
    ["zh", "cmn_cbt"],
  ]);

/** The translation a first visit opens for an interface language (`pt-BR` uses `pt`'s). */
export function defaultTranslationFor(uiLanguage: string): string {
  const lang = uiLanguage.toLowerCase();
  return (
    DEFAULT_TRANSLATIONS_BY_LANGUAGE.get(lang) ??
    DEFAULT_TRANSLATIONS_BY_LANGUAGE.get(lang.split("-")[0]!) ??
    DEFAULT_TRANSLATION
  );
}
