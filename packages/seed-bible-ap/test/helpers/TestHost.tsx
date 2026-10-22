// THE DOM HOST — children rendered with i18n ready: en.json is in i18next before the first render (synchronous
// init, so a component's `t()` never answers a bare key), the language signal set. There is no provider component
// in apps/reader-web/src/i18n — `useI18n` reads i18next and the `language` signal directly — so the host's job is
// readiness, not context.
import type { ComponentChildren } from "preact";
import { render, type RenderResult } from "@testing-library/preact";
import i18next from "i18next";
import en from "../../apps/reader-web/src/i18n/en.json";
import { language } from "../../apps/reader-web/src/i18n";

export function ensureI18n(locale = "en"): void {
  if (!i18next.isInitialized)
    void i18next.init({
      lng: "en",
      fallbackLng: "en",
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      initImmediate: false,
    });
  if (language.value !== locale) language.value = locale;
}

export function TestHost(props: {
  children?: ComponentChildren;
  locale?: string;
}) {
  ensureI18n(props.locale);
  return <div data-test-host>{props.children}</div>;
}

/** `render` from @testing-library/preact, inside the host. */
export function renderInHost(
  ui: ComponentChildren,
  locale?: string
): RenderResult {
  return render(<TestHost locale={locale}>{ui}</TestHost>);
}
