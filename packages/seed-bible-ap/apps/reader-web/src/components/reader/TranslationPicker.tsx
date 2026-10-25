// THE TRANSLATION WINDOW — the old reader's TranslationModal and TranslationList (packages/seed-bible components/
// BibleSelector, TranslationList): a search, the filter (complete / all / popular translations), one folding section
// per language (the chosen translation's language first and open), a ring for how much of the Bible each one has,
// its licence behind ⓘ, and on each row the device download (download, its progress — tap to cancel —, a retry
// after a failure, update when a newer file is out, remove with a confirmation) and a share link.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { ReaderState } from "../../state";
import { offerLanguageFor, useI18n } from "../../i18n";
import { bibleLanguageToBcp47 } from "../../state/media/languages";
import type { Translation } from "../../backend/bible";
import {
  DEFAULT_POPULAR_LANGUAGES,
  filterTranslationGroups,
  groupTranslationsByLanguage,
  type TranslationLanguageGroup,
  type TranslationViewMode,
} from "../../state/reading/translationGrouping";
import { routeOf } from "../../state/reading/route";
import { CANCELLED } from "../../state/reading/offlineTranslations";

const VIEW_MODE_KEY = "sb-translation-view-mode";
const PAGE = 50;
const CANON_BOOK_COUNT = 66;

function storedViewMode(): TranslationViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === "all" || v === "popular" || v === "complete") return v;
  } catch {
    // Storage blocked: the default.
  }
  return "complete";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function TickIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 10C7.7614 10 10 7.7614 10 5C10 2.23857 7.7614 0 5 0C2.23857 0 0 2.23857 0 5C0 7.7614 2.23857 10 5 10ZM7.72855 3.72856L4.5 6.9571L2.39645 4.85355L3.10356 4.14645L4.5 5.5429L7.02145 3.02144L7.72855 3.72856Z"
        fill="var(--sb-font-color)"
      />
    </svg>
  );
}

function SelectedIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6.66667 13.3333C2.98477 13.3333 0 10.3485 0 6.66667C0 2.98477 2.98477 0 6.66667 0C10.3485 0 13.3333 2.98477 13.3333 6.66667C13.3333 10.3485 10.3485 13.3333 6.66667 13.3333ZM6.66667 12C9.6122 12 12 9.6122 12 6.66667C12 3.72115 9.6122 1.33333 6.66667 1.33333C3.72115 1.33333 1.33333 3.72115 1.33333 6.66667C1.33333 9.6122 3.72115 12 6.66667 12ZM6.66667 10C4.82572 10 3.33333 8.5076 3.33333 6.66667C3.33333 4.82572 4.82572 3.33333 6.66667 3.33333C8.5076 3.33333 10 4.82572 10 6.66667C10 8.5076 8.5076 10 6.66667 10Z"
        fill="var(--sb-primary-color)"
      />
    </svg>
  );
}

function FiltersIcon() {
  const s = {
    stroke: "var(--sb-font-color)",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  } as const;
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5.28613 13H11.0718" {...s} />
      <path d="M5.28613 19.0664H16.8576" {...s} />
      <path d="M14.9287 13H20.7144" {...s} />
      <path d="M20.715 6.93359H9.14355" {...s} />
      <path
        d="M5.28613 6.93248C5.28613 8.16676 5.98042 8.86105 7.2147 8.86105C8.44899 8.86105 9.14328 8.16676 9.14328 6.93248C9.14328 5.69819 8.44899 5.00391 7.2147 5.00391C5.98042 5.00391 5.28613 5.69819 5.28613 6.93248Z"
        {...s}
      />
      <path
        d="M16.8574 19.0653C16.8574 20.2996 17.5517 20.9939 18.786 20.9939C20.0203 20.9939 20.7146 20.2997 20.7146 19.0654C20.7146 17.831 20.0203 17.1367 18.786 17.1367C17.5517 17.1367 16.8574 17.831 16.8574 19.0653Z"
        {...s}
      />
      <path
        d="M11.1016 12.9989C11.1016 14.2332 11.7958 14.9275 13.0301 14.9275C14.2644 14.9275 14.9587 14.2332 14.9587 12.9989C14.9587 11.7646 14.2644 11.0703 13.0301 11.0703C11.7958 11.0703 11.1016 11.7646 11.1016 12.9989Z"
        {...s}
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="22"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14.3196 6.94844L9.51246 2.14128C9.25093 1.87947 8.80406 1.99894 8.70809 2.35633C8.69719 2.39692 8.69166 2.43876 8.69164 2.48079V4.9054C7.13292 5.03879 5.41136 5.80193 3.99505 7.00312C2.28971 8.45007 1.22793 10.3146 1.005 12.2531C0.941261 12.8045 1.49834 13.2182 2.00775 12.9977C2.09844 12.9584 2.1801 12.9009 2.24765 12.8288C2.90863 12.1251 5.26053 9.90003 8.69164 9.70414V12.0951C8.69181 12.4652 9.09252 12.6962 9.4129 12.5111C9.44929 12.49 9.48276 12.4643 9.51246 12.4346L14.3196 7.62745C14.5068 7.43981 14.5068 7.13607 14.3196 6.94844ZM9.65307 10.9348V9.2108C9.65307 8.9453 9.43785 8.73007 9.17235 8.73009C7.48504 8.73009 5.8416 9.17054 4.28768 10.04C3.49627 10.4848 2.7589 11.0196 2.09021 11.6336C2.43873 10.2011 3.31724 8.83885 4.61697 7.73621C6.01225 6.55305 7.71518 5.84579 9.17235 5.84579C9.43785 5.84579 9.65307 5.63057 9.65307 5.36508V3.64172L13.2999 7.28794L9.65307 10.9348Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** How much of the 66 books a translation has, as a ring that names itself. */
function Completion(props: { translation: Translation; blank: boolean }) {
  const { t } = useI18n();
  if (props.blank)
    return <span className="sb-translation-completion" aria-hidden="true" />;
  const included = Math.min(props.translation.numberOfBooks, CANON_BOOK_COUNT);
  const label = t("translation-book-coverage", {
    defaultValue: "{{included}} of {{total}} books",
    included,
    total: CANON_BOOK_COUNT,
  });
  return (
    <span
      className="sb-translation-completion sb-translation-completion--ring"
      style={{
        "--sb-completion-percent": Math.ceil(
          (included / CANON_BOOK_COUNT) * 100
        ),
      }}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}

function LanguageSection(props: {
  group: TranslationLanguageGroup;
  query: string;
  viewMode: TranslationViewMode;
  groupCount: number;
  selectedId: string;
  expandedLanguage: string | null;
  onPick: (tr: Translation) => void;
  onInfo: (tr: Translation, e: MouseEvent) => void;
  actions: (tr: Translation) => ComponentChildren;
}) {
  const { group, query, groupCount, expandedLanguage, selectedId } = props;
  const { t } = useI18n();
  const auto =
    query.length > 0 ||
    groupCount === 1 ||
    expandedLanguage === group.language.toLowerCase();
  const [open, setOpen] = useState(auto);
  useEffect(() => setOpen(auto), [auto]);
  const sorted = useMemo(
    () =>
      [...group.translations].sort((a, b) =>
        a.id === selectedId
          ? -1
          : b.id === selectedId
            ? 1
            : a.name.localeCompare(b.name)
      ),
    [group.translations, selectedId]
  );
  return (
    <>
      <button
        type="button"
        className="sb-translation-list-language flex-between"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          backgroundColor: open ? "" : "var(--sb-background)",
          marginBottom: open ? "0px" : "0.625rem",
          gap: "0.5rem",
        }}
      >
        <span style={{ textTransform: "capitalize", flex: "1 1 auto" }}>
          {group.languageName}
        </span>
        {group.language !== "eng" &&
          group.languageName !== group.languageEnglishName &&
          group.languageEnglishName && (
            <span className="sb-language-english-name">
              ({group.languageEnglishName})
            </span>
          )}
        <span
          className={`material-symbols-outlined sb-translation-list-chevron${open ? " sb-translation-list-chevron--open" : ""}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {open && (
        <div style={{ margin: "0.3125rem 0.3125rem" }}>
          {sorted.map((tr) => {
            const selected = tr.id === selectedId;
            return (
              <div
                key={tr.id}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => props.onPick(tr)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") props.onPick(tr);
                }}
                style={{
                  background: selected
                    ? "color-mix(in srgb, var(--pageBookBackground) 50%, transparent)"
                    : "var(--sb-background)",
                }}
                className="translation-option flex-between-center-gap-md"
              >
                <span className="translation-title inline-flex-start-center-gap-sm">
                  {selected ? (
                    <TickIcon />
                  ) : (
                    <Completion
                      translation={tr}
                      blank={props.viewMode === "complete"}
                    />
                  )}
                  <span className="translation-description">{`${tr.name} (${tr.shortName})`}</span>
                  {tr.licenseNotice && (
                    <button
                      type="button"
                      className="sb-translation-info-button"
                      style={{ display: "flex" }}
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                        props.onInfo(tr, e);
                      }}
                      aria-label={t("information-about-this-translation", {
                        defaultValue: "Information about this translation",
                      })}
                      title={t("information-about-this-translation", {
                        defaultValue: "Information about this translation",
                      })}
                    >
                      <span
                        style={{ fontSize: "1.125rem" }}
                        className="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        info
                      </span>
                    </button>
                  )}
                </span>
                <span className="sb-translation-list-actions inline-flex-start-center-gap-sm">
                  {props.actions(tr)}
                </span>
              </div>
            );
          })}
          <div
            className="sb-translation-list-separator"
            style={{ width: "100%" }}
          />
        </div>
      )}
    </>
  );
}

/** The row's device download: download / progress (tap to cancel) / retry / update / on the device (tap to remove). */
function OfflineButtons(props: {
  state: ReaderState;
  tr: Translation;
  onRemove: (tr: Translation) => void;
}) {
  const { state, tr } = props;
  const { t } = useI18n();
  const offline = state.offline;
  const going = offline.progress.value;
  const busy = !!going && going.id !== tr.id;
  const start = () =>
    void offline.download(tr).catch((e: unknown) => {
      if ((e as Error)?.message !== CANCELLED)
        state.ui.toast.value = {
          key: "translation-download-failed",
          values: { name: tr.shortName },
        };
    });
  if (going?.id === tr.id) {
    const percent =
      going.phase === "downloading" && going.fraction === 0.45
        ? null
        : Math.round(going.fraction * 100);
    const label =
      going.phase === "saving"
        ? t("saving-translation-to-device", {
            percent: percent ?? 0,
            defaultValue: "Saving to this device… {{percent}}% — tap to cancel",
          })
        : percent === null
          ? t("cancel-translation-download-unknown-size", {
              size: formatBytes(going.receivedBytes ?? 0),
              defaultValue: "Downloading {{size}} so far — tap to cancel",
            })
          : t("cancel-translation-download", {
              percent,
              defaultValue: "Downloading {{percent}}% — tap to cancel",
            });
    return (
      <button
        type="button"
        className="sb-offline-btn downloading flex-center"
        title={label}
        aria-label={label}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          offline.cancel(tr.id);
        }}
      >
        <span
          className={`sb-offline-progress${percent === null ? " indeterminate" : ""}`}
          style={{ "--sb-offline-progress": `${percent ?? 0}%` }}
        >
          {percent !== null && (
            <span className="sb-offline-progress-label">{percent}</span>
          )}
        </span>
      </button>
    );
  }
  const entry = offline.entry(tr.id);
  const error = offline.errors.value[tr.id];
  const downloadTitle = error
    ? t("retry-translation-download", {
        error,
        defaultValue: "Download failed ({{error}}) — tap to retry",
      })
    : t("download-translation-offline", {
        defaultValue: "Download for offline use",
      });
  const updateLabel = t("update-offline-translation", {
    defaultValue: "A newer version is available — tap to update",
  });
  const onDeviceLabel = entry?.sizeBytes
    ? t("translation-available-offline", {
        size: formatBytes(entry.sizeBytes),
        defaultValue: "Available offline ({{size}}) — tap to remove",
      })
    : t("translation-available-offline-no-size", {
        defaultValue: "Available offline — tap to remove",
      });
  return (
    <>
      {entry && offline.updateAvailable(tr) && (
        <button
          type="button"
          className="sb-offline-btn update flex-center"
          title={updateLabel}
          aria-label={updateLabel}
          disabled={busy}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            start();
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            sync
          </span>
        </button>
      )}
      {entry ? (
        <button
          type="button"
          className="sb-offline-btn downloaded flex-center"
          title={onDeviceLabel}
          aria-label={onDeviceLabel}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            props.onRemove(tr);
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            offline_pin
          </span>
        </button>
      ) : (
        <button
          type="button"
          className={`sb-offline-btn flex-center${error ? " has-error" : ""}`}
          title={downloadTitle}
          aria-label={downloadTitle}
          disabled={busy}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            start();
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            download
          </span>
        </button>
      )}
    </>
  );
}

/** A licence notice as lines, its web addresses as links. */
function LicenceLines({ notice }: { notice: string }) {
  const parts = notice
    .split(/(https?:\/\/[^\s]+|\n)/g)
    .filter((p) => p !== "\n" && p.trim() !== "");
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", color: "var(--sb-primary-color)" }}
          >
            {p}
          </a>
        ) : (
          <span key={i} style={{ display: "block" }}>
            {p}
          </span>
        )
      )}
    </>
  );
}

export function TranslationPicker({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading } = state;
  const [query, setQuery] = useState("");
  const [viewMode, setViewModeState] =
    useState<TranslationViewMode>(storedViewMode);
  const [limit, setLimit] = useState(PAGE);
  const [filters, setFilters] = useState(false);
  const [info, setInfo] = useState<{
    tr: Translation;
    x: number;
    y: number;
  } | null>(null);
  const [removing, setRemoving] = useState<Translation | null>(null);
  const close = () => (state.ui.selector.value = null);
  const setViewMode = (m: TranslationViewMode) => {
    setViewModeState(m);
    try {
      localStorage.setItem(VIEW_MODE_KEY, m);
    } catch {
      // Storage blocked: the choice lasts this visit.
    }
  };

  // Esc closes only what is on top. Read through a ref: a listener re-made after each render would still hold the
  // last render's state for an Esc pressed right after a note opened, and close the whole window.
  const onTop = useRef({ removing, info, filters });
  onTop.current = { removing, info, filters };
  useEffect(() => {
    void reading.loadTranslations();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      const now = onTop.current;
      if (now.removing) setRemoving(null);
      else if (now.info) setInfo(null);
      else if (now.filters) setFilters(false);
      else close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const all = reading.translations.value;
  // The download tip, once the list (and so the button it points at) is there.
  const listed = all.length > 0;
  useEffect(() => {
    if (!listed) return;
    const id = setTimeout(
      () => state.tours.startContextual("offline-download"),
      300
    );
    return () => clearTimeout(id);
  }, [listed]);
  const selected =
    all.find((x) => x.id === reading.translationId.value) ?? null;
  const grouped = useMemo(() => groupTranslationsByLanguage(all), [all]);
  const { groups, totalMatching } = filterTranslationGroups({
    groups: grouped,
    query,
    viewMode,
    limit,
    selectedTranslation: selected,
    popularLanguages: DEFAULT_POPULAR_LANGUAGES,
  });

  const pick = (tr: Translation) => {
    void reading.setTranslation(tr.id);
    close();
    void offerLanguageFor(bibleLanguageToBcp47(tr.language));
  };
  const share = (tr: Translation) => {
    const url = `${location.origin}${routeOf({
      translationId: tr.id,
      bookId: reading.bookId.value,
      chapterNumber: reading.chapterNumber.value,
    })}`;
    void navigator.clipboard?.writeText(url).catch(() => {});
    state.ui.toast.value = { key: "copied-translation-share-link" };
  };
  const viewModes: [TranslationViewMode, string][] = [
    [
      "complete",
      t("complete-translations", { defaultValue: "Complete translations" }),
    ],
    ["all", t("all-translations", { defaultValue: "All translations" })],
    [
      "popular",
      t("popular-translations", { defaultValue: "Popular translations" }),
    ],
  ];

  return (
    <>
      <div
        className="modal-overlay flex-center sb-translation-picker"
        onClick={close}
      >
        <div
          className="modal"
          role="dialog"
          aria-label={t("choose-a-translation", {
            defaultValue: "Choose a translation",
          })}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            setFilters(false);
            setInfo(null);
          }}
        >
          <div
            className="sidebar-book-selector flex-between-center-gap-md"
            style={{ padding: "0.9375rem 0.3125rem" }}
          >
            <div
              className="searchbar flex-align-center"
              style={{ width: "100%", height: "1.875rem" }}
            >
              <span
                className="search-icon material-symbols-outlined"
                aria-hidden="true"
              >
                search
              </span>
              <input
                type="text"
                autoFocus
                placeholder={t("search-translation", {
                  defaultValue: "Search translations...",
                })}
                aria-label={t("search-translation", {
                  defaultValue: "Search translations...",
                })}
                value={query}
                onInput={(e) => {
                  setQuery((e.target as HTMLInputElement).value);
                  setLimit(PAGE);
                }}
                id="translation-search-input"
                className="flex-1"
              />
            </div>
            <button
              type="button"
              className="filters-icon"
              aria-label={t("translation-filters", {
                defaultValue: "Which translations to show",
              })}
              aria-expanded={filters}
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                setFilters(!filters);
                setInfo(null);
              }}
            >
              <FiltersIcon />
            </button>
            <button
              type="button"
              className="close-icon material-symbols-outlined"
              aria-label={t("close", { defaultValue: "Close" })}
              onClick={close}
            >
              close
            </button>
          </div>
          {groups.length === 0 ? (
            <div className="sb-translation-list sb-translation-list-empty">
              {!all.length ? (
                <span>{t("loading", { defaultValue: "Loading…" })}</span>
              ) : viewMode !== "all" ? (
                <>
                  <span>
                    {t("no-translation-results-found", {
                      defaultValue:
                        "No results found. Would you like to expand your search to include partial and incomplete translations as well?",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMode("all")}
                    className="sb-translation-list-expand-button"
                  >
                    {t("show-all-translations", {
                      defaultValue: "Show all translations",
                    })}
                  </button>
                </>
              ) : (
                <span>
                  {t("no-results-found", {
                    defaultValue: "No results found.",
                  })}
                </span>
              )}
            </div>
          ) : (
            <div
              className="sb-translation-list"
              role="listbox"
              onScroll={() => {
                setInfo(null);
                setFilters(false);
              }}
            >
              {groups.map((g) => (
                <LanguageSection
                  key={g.language}
                  group={g}
                  query={query}
                  viewMode={viewMode}
                  groupCount={groups.length}
                  selectedId={reading.translationId.value}
                  expandedLanguage={selected?.language?.toLowerCase() ?? null}
                  onPick={pick}
                  onInfo={(tr, e) =>
                    setInfo(
                      info?.tr.id === tr.id
                        ? null
                        : { tr, x: e.clientX, y: e.clientY }
                    )
                  }
                  actions={(tr) => (
                    <>
                      <OfflineButtons
                        state={state}
                        tr={tr}
                        onRemove={setRemoving}
                      />
                      <button
                        type="button"
                        className="share-btn flex-center"
                        aria-label={t("share-translation", {
                          name: tr.shortName,
                          defaultValue: "Share a link to {{name}}",
                        })}
                        title={t("share-translation", {
                          name: tr.shortName,
                          defaultValue: "Share a link to {{name}}",
                        })}
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation();
                          share(tr);
                        }}
                      >
                        <ShareIcon />
                      </button>
                    </>
                  )}
                />
              ))}
              {limit < totalMatching && (
                <button
                  type="button"
                  className="sb-translation-list-load-more"
                  onClick={() => setLimit(limit + PAGE)}
                >
                  <span className="sb-translation-list-load-more-label">
                    {t("show-more-languages", {
                      defaultValue: "Show more languages",
                    })}
                  </span>
                  <span className="sb-translation-list-load-more-count">
                    {t("showing-languages-count", {
                      defaultValue: "Showing {{shown}} of {{total}}",
                      shown: groups.length,
                      total: totalMatching,
                    })}
                  </span>
                  <span
                    className="material-symbols-outlined sb-translation-list-chevron"
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {filters && (
        <div className="modal translationSettingsModal">
          <div className="sb-translation-view-mode-menu" role="menu">
            {viewModes.map(([mode, label]) => {
              const on = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  className={`translation-option flex-between-center-gap-md sb-translation-view-mode-option${on ? " sb-translation-view-mode-option--selected" : ""}`}
                  onClick={() => {
                    setViewMode(mode);
                    setLimit(PAGE);
                    setFilters(false);
                  }}
                >
                  <span className="translation-title inline-flex-start-center-gap-sm">
                    {on ? (
                      <SelectedIcon />
                    ) : (
                      <span className="emptyCircle sb-translation-view-mode-bullet" />
                    )}
                    <span className="translation-description">{label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {info?.tr.licenseNotice && (
        <div
          className="modal translationInfoModal"
          role="note"
          style={{
            top: `${Math.min(info.y + 12, window.innerHeight - 200)}px`,
            left: `${Math.max(8, Math.min(info.x - 140, window.innerWidth - 300))}px`,
          }}
        >
          <LicenceLines notice={info.tr.licenseNotice} />
        </div>
      )}
      {removing && (
        <div
          className="modal translationDeleteModal"
          role="dialog"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <p className="sb-offline-delete-title">
            {t("remove-offline-translation-title", {
              defaultValue: "Remove download?",
            })}
          </p>
          <p className="sb-offline-delete-message">
            {t("remove-offline-translation-message", {
              name: removing.shortName,
              defaultValue:
                'Remove "{{name}}" from this device? You\'ll need a connection to read it again.',
            })}
          </p>
          <div className="sb-offline-delete-actions">
            <button
              type="button"
              className="sb-offline-delete-cancel"
              onClick={() => setRemoving(null)}
            >
              {t("cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              className="sb-offline-delete-confirm"
              onClick={() => {
                const tr = removing;
                setRemoving(null);
                void state.offline.remove(tr.id).then(
                  () =>
                    (state.ui.toast.value = {
                      key: "translation-removed-from-device",
                      values: { name: tr.shortName },
                    })
                );
              }}
            >
              {t("remove", { defaultValue: "Remove" })}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
