// ABOUT AND THE LEGAL PAGES — the old About page's copy and the three policies (terms, privacy, code of conduct),
// in the reader's language where a translation exists (the policy files travel with the locales).
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { sanitizeNoteHtml } from "../records/noteHtml";

const policies = import.meta.glob("../../i18n/policies/*/*.json") as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

type Policy = "terms-of-service" | "privacy-policy" | "code-of-conduct";

async function loadPolicy(
  policy: Policy,
  lang: string
): Promise<string | null> {
  const pick =
    policies[`../../i18n/policies/${policy}/${lang}.json`] ??
    policies[`../../i18n/policies/${policy}/en.json`];
  if (!pick) return null;
  const mod = await pick();
  const d = mod.default;
  return (
    d[`${policy}-policy`] ??
    d[`${policy}_policy`] ??
    Object.values(d).find((v) => typeof v === "string" && v.length > 200) ??
    null
  );
}

export function AboutPane({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  // Literal keys, so the translation-key test sees them (a key held in a variable is invisible to it).
  const policyTitle = (p: Policy) =>
    p === "terms-of-service"
      ? t("terms-of-service", { defaultValue: "Terms of service" })
      : p === "privacy-policy"
        ? t("privacy-policy", { defaultValue: "Privacy policy" })
        : t("code-of-conduct", { defaultValue: "Code of conduct" });
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    if (!policy) return;
    setHtml(null);
    void loadPolicy(policy, language).then((h) => setHtml(h ?? ""));
  }, [policy, language]);

  return (
    <section
      className="sb-pane sb-about"
      aria-label={t("about-title", { defaultValue: "About Seed Bible" })}
    >
      <header className="sb-pane-header">
        <h2>
          {policy
            ? policyTitle(policy)
            : t("about-title", { defaultValue: "About Seed Bible" })}
        </h2>
        <div>
          {policy && (
            <button
              className="sb-pane-close"
              aria-label={t("back", { defaultValue: "Back" })}
              onClick={() => setPolicy(null)}
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}
          <button
            className="sb-pane-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={() => (state.ui.pane.value = "none")}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>
      {policy ? (
        html === null ? (
          <p className="sb-muted sb-small">
            {t("loading", { defaultValue: "Loading…" })}
          </p>
        ) : html === "" ? (
          <p className="sb-pane-empty">
            {t("policy-unavailable", {
              defaultValue: "This text is not available in your language yet.",
            })}
          </p>
        ) : (
          <div
            className="sb-legal"
            dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(html) }}
          />
        )
      ) : (
        <>
          <p>{t("about-hero-body")}</p>
          <h3>{t("about-content-title")}</h3>
          <p>{t("about-content-body")}</p>
          <h3>{t("about-sessions-title")}</h3>
          <p>{t("about-sessions-body")}</p>
          <h3>{t("about-shared-title")}</h3>
          <p>{t("about-shared-body")}</p>
          <h3>{t("about-playlist-title")}</h3>
          <p>{t("about-playlist-body")}</p>
          <h3>{t("about-mission-title")}</h3>
          <p>{t("about-mission-body")}</p>
          <p>
            <button
              className="sb-note-button"
              onClick={() => {
                state.ui.pane.value = "none";
                state.tours.start("introduction");
              }}
            >
              {t("onboarding-tour", { defaultValue: "Take the tour" })}
            </button>
          </p>
          <h3>{t("on-this-estate", { defaultValue: "On this estate" })}</h3>
          <p className="sb-small">
            {t("about-estate", {
              defaultValue:
                "This build runs on the faithnet estate: your marks live in your own Library at your Home, written by your own agent; this app keeps nothing of yours. Public things you publish are released from your shelf and indexed by the Seed registry.",
            })}
          </p>
          <div className="sb-note-card-actions">
            {(
              [
                "terms-of-service",
                "privacy-policy",
                "code-of-conduct",
              ] as Policy[]
            ).map((p) => (
              <button
                key={p}
                className="sb-note-button"
                onClick={() => setPolicy(p)}
              >
                {policyTitle(p)}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
