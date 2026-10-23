// THE CHECK OF THE CHAPTER ON SCREEN, said plainly (state/reading/scriptureCheck.ts): a badge beside the translation —
// Verified, Check failed, Not checked — and, on a tap, what was checked against what: every verse's words against the
// published commitments, those against the translation's corpus, and that corpus against the attestation the scripture
// agent signed; where the text came from (the release received), and its licence.
import { useState } from "preact/hooks";
import type { ChapterCheck } from "../../state/reading/scriptureCheck";
import type { VerseCheck } from "@seed/scripture/verify";
import { useI18n } from "../../i18n";

type T = ReturnType<typeof useI18n>["t"];

export function verseCheckTitle(t: T): (s: VerseCheck) => string {
  return (s) =>
    s === "verified"
      ? t("verse-check-verified", {
          defaultValue: "Checked: these words match the published text",
        })
      : s === "text-differs"
        ? t("verse-check-differs", {
            defaultValue: "These words do not match the published text",
          })
        : s === "not-in-corpus"
          ? t("verse-check-not-in-corpus", {
              defaultValue:
                "This verse is not part of the published translation",
            })
          : t("verse-check-none", {
              defaultValue: "This verse could not be checked",
            });
}

export function ScriptureCheckBadge({
  check,
  translationName,
  chapterLabel,
}: {
  check: ChapterCheck | null;
  translationName: string;
  chapterLabel: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!check) return null;
  const look =
    check.status === "verified"
      ? {
          icon: "verified",
          label: t("scripture-verified", { defaultValue: "Verified" }),
          tone: "ok",
        }
      : check.status === "checking"
        ? {
            icon: "hourglass_top",
            label: t("scripture-checking", { defaultValue: "Checking…" }),
            tone: "busy",
          }
        : check.status === "differs"
          ? {
              icon: "gpp_maybe",
              label: t("scripture-differs", { defaultValue: "Check failed" }),
              tone: "bad",
            }
          : check.status === "unattested"
            ? {
                icon: "gpp_maybe",
                label: t("scripture-unattested", {
                  defaultValue: "Not attested",
                }),
                tone: "bad",
              }
            : {
                icon: "help",
                label: t("scripture-not-checked", {
                  defaultValue: "Not checked",
                }),
                tone: "none",
              };
  return (
    <>
      <button
        type="button"
        className={`sb-scripture-check sb-scripture-check-${look.tone}`}
        aria-label={t("scripture-check-open", {
          state: look.label,
          defaultValue: "Scripture check: {{state}}",
        })}
        aria-haspopup="dialog"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {look.icon}
        </span>
        <span className="sb-scripture-check-label">{look.label}</span>
      </button>
      {open && (
        <ScriptureCheckSheet
          check={check}
          translationName={translationName}
          chapterLabel={chapterLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ScriptureCheckSheet({
  check,
  translationName,
  chapterLabel,
  onClose,
}: {
  check: ChapterCheck;
  translationName: string;
  chapterLabel: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
  return (
    <div className="sb-share-overlay" onClick={onClose}>
      <div
        className="sb-share-dialog sb-scripture-check-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-scripture-check-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="sb-scripture-check-title">
          {t("scripture-check-title", {
            chapter: chapterLabel,
            defaultValue: "Scripture check · {{chapter}}",
          })}
        </h3>
        {check.status === "checking" && (
          <p>
            {t("scripture-checking-long", {
              defaultValue: "Checking each verse against the published text…",
            })}
          </p>
        )}
        {check.status === "not-checked" && (
          <p>
            {check.reason === "no-verification"
              ? t("scripture-no-verification", {
                  defaultValue:
                    "This copy carries no published fingerprints to check against (a downloaded copy, or a source that does not publish them). Open it online to check it.",
                })
              : t("scripture-unreachable", {
                  defaultValue:
                    "The published fingerprints could not be reached just now, so this chapter was not checked. It will be checked when they can be.",
                })}
          </p>
        )}
        {"verses" in check && (
          <>
            <p className="sb-scripture-check-summary">
              {check.status === "verified"
                ? t("scripture-verified-long", {
                    count: check.checked,
                    translation: translationName,
                    defaultValue:
                      "All {{count}} verses match the published {{translation}}, word for word.",
                  })
                : check.status === "differs"
                  ? t("scripture-differs-long", {
                      verses: check.problems.join(", "),
                      defaultValue:
                        "These verses do not match the published text: {{verses}}. They are marked in the chapter. The rest match.",
                    })
                  : t("scripture-unattested-long", {
                      defaultValue:
                        "The words match the fingerprints this copy came with, but those fingerprints are not signed by the scripture agent, so they cannot be trusted.",
                    })}
            </p>
            <ul className="sb-scripture-check-list">
              <li>
                {t("scripture-check-step-words", {
                  defaultValue:
                    "Each verse's words were fingerprinted on this device and compared with the fingerprint published for it.",
                })}
              </li>
              <li>
                {t("scripture-check-step-corpus", {
                  count: check.translation.verseCount.toLocaleString(),
                  defaultValue:
                    "Each fingerprint was proven to be one of the {{count}} in this translation's published set.",
                })}
              </li>
              <li>
                {check.translation.attestation.ok
                  ? t("scripture-check-step-attested", {
                      defaultValue:
                        "That set is signed by the scripture agent (scripture-resolver.svc) through its signing key.",
                    })
                  : t("scripture-check-step-not-attested", {
                      reason: check.translation.attestation.reason,
                      defaultValue:
                        "The set's signature did not check: {{reason}}.",
                    })}
              </li>
            </ul>
            <dl className="sb-scripture-check-facts">
              <dt>
                {t("scripture-check-source", { defaultValue: "Received from" })}
              </dt>
              <dd>
                {check.translation.source.replace(/\/api\/.*$/, "")} ·{" "}
                {t("scripture-check-release", {
                  release: check.translation.release.slice(0, 12),
                  date: new Date(
                    check.translation.receivedAt
                  ).toLocaleDateString(),
                  defaultValue: "release {{release}}, {{date}}",
                })}
              </dd>
              <dt>
                {t("scripture-check-set", { defaultValue: "Published set" })}
              </dt>
              <dd>
                <code>{short(check.translation.corpusRoot)}</code>
              </dd>
              {check.translation.licenseUrl && (
                <>
                  <dt>
                    {t("scripture-check-license", { defaultValue: "Licence" })}
                  </dt>
                  <dd>
                    <a
                      href={check.translation.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {translationName}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            <p className="sb-small sb-muted">
              {t("scripture-check-limit", {
                defaultValue:
                  "Checked here, on this device. Whether the agent's signing key is still authorised is confirmed by a validator, not here.",
              })}
            </p>
          </>
        )}
        <div className="sb-note-card-actions">
          <button type="button" className="sb-note-button" onClick={onClose}>
            {t("close", { defaultValue: "Close" })}
          </button>
        </div>
      </div>
    </div>
  );
}
