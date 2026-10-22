// THE LIBRARY PANE — playlists and reading plans: the lists, a maker for each from the chapter on screen, the
// player (walks the reader through a playlist's items), a plan's sessions with their readings to tick, and
// Publish for each. Dressed by the copied `playlists.css` / `plans.css` where the classes match.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { PlaylistItem } from "@seed/seed-schema";
import { spanOf } from "../../state/records/marks";
import { sanitizeNoteHtml } from "../records/noteHtml";
import { EDITABLE_VARIABLES } from "../../state/chrome/customizations";
import type { LinkPreview } from "../../backend/ReaderBackend";

function itemLabel(state: ReaderState, it: PlaylistItem): string {
  if (it["@type"] === "seed:ScriptureItem") {
    const { chapter, start, end } = spanOf(it.aboutPassage);
    const [book, ch] = chapter.split(".");
    const name =
      state.reading.books.value.find((b) => b.id === book)?.name ?? book;
    const verses =
      it.aboutPassage.split(".").length > 2
        ? `:${start}${end !== start ? `–${end}` : ""}`
        : "";
    return `${name} ${ch}${verses}${it.ofEdition ? ` · ${it.ofEdition}` : ""}`;
  }
  if (it["@type"] === "seed:HtmlItem") return it.label ?? "Note";
  return it.label ?? it.url;
}

function openItem(state: ReaderState, it: PlaylistItem) {
  if (it["@type"] !== "seed:ScriptureItem") return;
  const { chapter, start, end } = spanOf(it.aboutPassage);
  const [book, ch] = chapter.split(".");
  const verses = it.aboutPassage.split(".").length > 2;
  void state.reading
    .goTo(it.ofEdition ?? state.reading.translationId.value, book!, Number(ch))
    .then(() => {
      if (verses) state.selection.select(start, end);
    });
}

function LinkCard({
  state,
  url,
  label,
}: {
  state: ReaderState;
  url: string;
  label?: string;
}) {
  const [p, setP] = useState<LinkPreview | null>(null);
  useEffect(() => {
    let live = true;
    void state.files
      .preview(url)
      .then((x) => live && setP(x))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <a className="sb-link-card" href={url} target="_blank" rel="noreferrer">
      {p?.image && <img className="sb-link-card-image" src={p.image} alt="" />}
      <span className="sb-link-card-text">
        <span className="sb-link-card-title">{p?.title ?? label ?? url}</span>
        {p?.description && (
          <span className="sb-link-card-description">{p.description}</span>
        )}
        <span className="sb-link-card-site">
          {p?.siteName ?? new URL(url).hostname}
        </span>
      </span>
    </a>
  );
}

function Player({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const c = state.playlists.current.value;
  if (!c) return null;
  const it = c.item;
  return (
    <div className="sb-play-playlist sb-account-card">
      <div className="sb-play-playlist-about">
        <strong>{c.playlist.label}</strong>
        <span className="sb-muted sb-small">
          {" "}
          {c.index + 1} / {c.count}
        </span>
      </div>
      <div className="sb-play-playlist-body">
        {it["@type"] === "seed:ScriptureItem" && (
          <>
            <p className="sb-small">
              <strong>{itemLabel(state, it)}</strong>
            </p>
            {it.note && <p className="sb-small">{it.note}</p>}
          </>
        )}
        {it["@type"] === "seed:HtmlItem" && (
          <div
            className="sb-note-card-body"
            dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(it.html) }}
          />
        )}
        {it["@type"] === "seed:LinkItem" && (
          <LinkCard state={state} url={it.url} label={it.label} />
        )}
      </div>
      <div className="sb-play-controls sb-note-card-actions">
        <button
          className="sb-note-button"
          disabled={c.index === 0}
          onClick={() => state.playlists.prev()}
        >
          {t("previous", { defaultValue: "Previous" })}
        </button>
        <button
          className="sb-note-button sb-note-button-primary"
          disabled={c.index + 1 >= c.count}
          onClick={() => state.playlists.next()}
        >
          {t("next", { defaultValue: "Next" })}
        </button>
        <button
          className="sb-note-button"
          onClick={() => state.playlists.stop()}
        >
          {t("stop", { defaultValue: "Stop" })}
        </button>
      </div>
    </div>
  );
}

export function LibraryPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { playlists, plans, reading } = state;
  const [tab, setTab] = useState<"playlists" | "plans" | "customizations">(
    "playlists"
  );
  const [variableDrafts, setVariableDrafts] = useState<Record<string, string>>(
    {}
  );
  const [open, setOpen] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [planTo, setPlanTo] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const canPublish = !!state.session.value?.wire;
  const [copied, setCopied] = useState<string | null>(null);
  const currentPassage = () => {
    const v = state.selection.verses.value;
    const chapter = reading.chapterRef.value;
    return v.length
      ? `${chapter}.${Math.min(...v)}${v.length > 1 ? `-${chapter}.${Math.max(...v)}` : ""}`
      : chapter;
  };
  const scriptureItem = (): PlaylistItem => ({
    "@type": "seed:ScriptureItem",
    aboutPassage: currentPassage(),
    ofEdition: reading.translationId.value,
  });

  return (
    <section
      className="sb-pane sb-library-pane"
      aria-label={t("library", { defaultValue: "Library" })}
    >
      <header className="sb-pane-header">
        <div className="sb-selector-pane-picker" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "playlists"}
            className={`sb-selector-pane-chip${tab === "playlists" ? " sb-selector-pane-chip-selected" : ""}`}
            onClick={() => setTab("playlists")}
          >
            {t("playlists", { defaultValue: "Playlists" })}
          </button>
          <button
            role="tab"
            aria-selected={tab === "plans"}
            className={`sb-selector-pane-chip${tab === "plans" ? " sb-selector-pane-chip-selected" : ""}`}
            onClick={() => setTab("plans")}
          >
            {t("reading-plans", { defaultValue: "Reading plans" })}
          </button>
          <button
            role="tab"
            aria-selected={tab === "customizations"}
            className={`sb-selector-pane-chip${tab === "customizations" ? " sb-selector-pane-chip-selected" : ""}`}
            onClick={() => setTab("customizations")}
          >
            {t("customizations", { defaultValue: "Customizations" })}
          </button>
        </div>
        <div>
          <button
            className="sb-pane-close"
            aria-label={t("refresh", { defaultValue: "Refresh" })}
            onClick={() =>
              void (tab === "playlists" ? playlists.refresh() : plans.refresh())
            }
          >
            <span className="material-symbols-outlined">refresh</span>
          </button>
          <button
            className="sb-pane-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={() => (state.ui.pane.value = "none")}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>
      {(playlists.error.value ||
        plans.error.value ||
        state.publishing.error.value) && (
        <p className="sb-pane-error">
          {playlists.error.value ??
            plans.error.value ??
            state.publishing.error.value}
        </p>
      )}

      {tab === "playlists" && (
        <>
          <Player state={state} />
          <form
            className="sb-account-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void playlists
                .create(title.trim(), [scriptureItem()])
                .then((p) => setOpen(p["@id"]));
              setTitle("");
            }}
          >
            <input
              className="sb-note-editor"
              placeholder={t("new-playlist-title", {
                defaultValue:
                  "New playlist, starting with the passage on screen",
              })}
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
            <div className="sb-note-card-actions">
              <button
                type="submit"
                className="sb-note-button sb-note-button-primary"
                disabled={!title.trim()}
              >
                {t("create-playlist", { defaultValue: "Create" })}
              </button>
            </div>
          </form>
          {!playlists.live().length && (
            <p className="sb-pane-empty">
              {t("playlists-empty", { defaultValue: "No playlists yet." })}
            </p>
          )}
          {playlists.live().map((pl) => {
            const isOpen = open === pl["@id"];
            const published = state.publishing.isPublished(pl["@id"]);
            return (
              <article key={pl["@id"]} className="sb-note-card">
                <header className="sb-note-card-header">
                  <button
                    className="sb-note-card-ref"
                    onClick={() => setOpen(isOpen ? null : pl["@id"])}
                  >
                    {pl.label}
                  </button>
                  <span className="sb-note-card-when">
                    {pl.hasItem.length} {t("items", { defaultValue: "items" })}
                  </span>
                </header>
                {isOpen && (
                  <>
                    <ol className="sb-library-items">
                      {pl.hasItem.map((it, i) => (
                        <li key={i} className="sb-library-item">
                          <button
                            className="sb-note-card-ref"
                            onClick={() => openItem(state, it)}
                          >
                            {itemLabel(state, it)}
                          </button>
                          <span>
                            <button
                              className="sb-content-kebab"
                              aria-label={t("move-up", {
                                defaultValue: "Move up",
                              })}
                              disabled={i === 0}
                              onClick={() =>
                                void playlists.moveItem(pl["@id"], i, i - 1)
                              }
                            >
                              <span className="material-symbols-outlined">
                                arrow_upward
                              </span>
                            </button>
                            <button
                              className="sb-content-kebab"
                              aria-label={t("remove-playlist-item", {
                                defaultValue: "Remove item",
                              })}
                              onClick={() =>
                                void playlists.removeItem(pl["@id"], i)
                              }
                            >
                              <span className="material-symbols-outlined">
                                close
                              </span>
                            </button>
                          </span>
                        </li>
                      ))}
                    </ol>
                    {pl.heroImage && (
                      <img
                        className="sb-hero-thumb sb-playlist-hero"
                        src={pl.heroImage}
                        alt=""
                      />
                    )}
                    <div className="sb-note-card-actions">
                      <label className="sb-note-button">
                        {state.files.uploading.value
                          ? "…"
                          : t("cover-image", { defaultValue: "Cover image" })}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={!state.session.value}
                          onChange={(e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            if (f)
                              void state.files
                                .upload(f)
                                .then((img) =>
                                  playlists.update(pl["@id"], {
                                    heroImage: img.url,
                                  })
                                )
                                .catch(() => {});
                          }}
                        />
                      </label>
                      <form
                        className="sb-inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const u = linkUrl.trim();
                          if (!/^https?:\/\//.test(u)) return;
                          void state.files
                            .preview(u)
                            .catch(() => ({ url: u }) as LinkPreview)
                            .then((p) =>
                              playlists.addItem(pl["@id"], {
                                "@type": "seed:LinkItem",
                                url: u,
                                ...(p.title ? { label: p.title } : {}),
                              })
                            );
                          setLinkUrl("");
                        }}
                      >
                        <input
                          className="sb-note-editor"
                          placeholder={t("add-link-url", {
                            defaultValue: "Add a link (https://…)",
                          })}
                          value={linkUrl}
                          onInput={(e) =>
                            setLinkUrl((e.target as HTMLInputElement).value)
                          }
                        />
                        <button
                          type="submit"
                          className="sb-note-button"
                          disabled={!/^https?:\/\//.test(linkUrl.trim())}
                        >
                          {t("add-link", { defaultValue: "Add link" })}
                        </button>
                      </form>
                    </div>
                    <div className="sb-note-card-actions">
                      <button
                        className="sb-note-button sb-note-button-primary"
                        onClick={() => playlists.play(pl["@id"])}
                      >
                        {t("play-playlist", { defaultValue: "Play playlist" })}
                      </button>
                      <button
                        className="sb-note-button"
                        onClick={() =>
                          void playlists.addItem(pl["@id"], scriptureItem())
                        }
                      >
                        {t("add-passage-on-screen", {
                          defaultValue: "Add the passage on screen",
                        })}
                      </button>
                      {canPublish && (
                        <button
                          className={`sb-note-button${published ? " sb-note-button-published" : ""}`}
                          disabled={state.publishing.busy.value === pl["@id"]}
                          onClick={() =>
                            void (
                              published
                                ? state.publishing.withdrawWork(
                                    pl["@id"],
                                    "playlist"
                                  )
                                : state.publishing.publishWork(pl)
                            ).catch(() => {})
                          }
                        >
                          {published
                            ? t("published", { defaultValue: "Published" })
                            : t("publish", { defaultValue: "Publish" })}
                        </button>
                      )}
                      <button
                        className="sb-note-button sb-note-button-danger"
                        onClick={() => void playlists.remove(pl["@id"])}
                      >
                        {t("delete-playlist", { defaultValue: "Delete" })}
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </>
      )}

      {tab === "customizations" && (
        <>
          <form
            className="sb-account-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void state.customizations
                .create(title.trim())
                .then((c) => setOpen(c["@id"]));
              setTitle("");
            }}
          >
            <p className="sb-small sb-muted">
              {t("customization-maker-blurb", {
                defaultValue:
                  "A branded reader: colours for light and dark, a logo, a default translation. Publish it and readers can pick it under Church theme.",
              })}
            </p>
            <input
              className="sb-note-editor"
              placeholder={t("customization-name", {
                defaultValue: "Name (your church or ministry)",
              })}
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
            <div className="sb-note-card-actions">
              <button
                type="submit"
                className="sb-note-button sb-note-button-primary"
                disabled={!title.trim()}
              >
                {t("create-customization", { defaultValue: "Create" })}
              </button>
            </div>
          </form>
          {!state.customizations.mine.live().length && (
            <p className="sb-pane-empty">
              {t("customizations-empty", {
                defaultValue: "No customizations yet.",
              })}
            </p>
          )}
          {state.customizations.mine.live().map((c) => {
            const isOpen = open === c["@id"];
            const published = state.publishing.isPublished(c["@id"]);
            return (
              <article key={c["@id"]} className="sb-note-card">
                <header className="sb-note-card-header">
                  <button
                    className="sb-note-card-ref"
                    onClick={() => setOpen(isOpen ? null : c["@id"])}
                  >
                    {c.label}
                  </button>
                  {c.logo && (
                    <img
                      className="sb-customization-logo"
                      src={c.logo}
                      alt=""
                    />
                  )}
                </header>
                {isOpen && (
                  <>
                    {c.hasVariant.map((v) => (
                      <div key={v["@id"]} className="sb-customization-variant">
                        <div className="sb-rp-section-label">{v.label}</div>
                        <div className="sb-customization-grid">
                          {EDITABLE_VARIABLES.map(([name, label]) => {
                            const key = `${c["@id"]}:${v["@id"]}:${name}`;
                            const value =
                              variableDrafts[key] ?? v.variables[name] ?? "";
                            return (
                              <label
                                key={name}
                                className="sb-small sb-customization-field"
                              >
                                <input
                                  type="color"
                                  value={
                                    /^#[0-9a-f]{6}$/i.test(value)
                                      ? value
                                      : "#888888"
                                  }
                                  onInput={(e) =>
                                    setVariableDrafts({
                                      ...variableDrafts,
                                      [key]: (e.target as HTMLInputElement)
                                        .value,
                                    })
                                  }
                                  onChange={(e) =>
                                    void state.customizations.setVariable(
                                      c["@id"],
                                      v["@id"],
                                      name,
                                      (e.target as HTMLInputElement).value
                                    )
                                  }
                                />{" "}
                                {label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="sb-note-card-actions">
                      <label className="sb-note-button">
                        {t("logo", { defaultValue: "Logo" })}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={!state.session.value}
                          onChange={(e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            if (f)
                              void state.files
                                .upload(f)
                                .then((img) =>
                                  state.customizations.update(c["@id"], {
                                    logo: img.url,
                                  })
                                )
                                .catch(() => {});
                          }}
                        />
                      </label>
                      <button
                        className="sb-note-button"
                        onClick={() =>
                          void state.customizations.update(c["@id"], {
                            defaultEdition: reading.translationId.value,
                          })
                        }
                      >
                        {t("default-edition-here", {
                          defaultValue: "Default translation:",
                        })}{" "}
                        {c.defaultEdition ?? "—"} →{" "}
                        {reading.translationId.value}
                      </button>
                      {canPublish && (
                        <button
                          className={`sb-note-button${published ? " sb-note-button-published" : ""}`}
                          disabled={state.publishing.busy.value === c["@id"]}
                          onClick={() =>
                            void (
                              published
                                ? state.publishing.withdrawWork(
                                    c["@id"],
                                    "customization"
                                  )
                                : state.publishing.publishWork(c)
                            ).catch(() => {})
                          }
                        >
                          {published
                            ? t("published", { defaultValue: "Published" })
                            : t("publish", { defaultValue: "Publish" })}
                        </button>
                      )}
                      {published && (
                        <button
                          className="sb-note-button"
                          title={t("customization-link-hint", {
                            defaultValue:
                              "A link that opens the reader in this theme",
                          })}
                          onClick={() => {
                            const entry =
                              state.customizations.available.value.find(
                                (a) => a.customization["@id"] === c["@id"]
                              );
                            const ref = entry
                              ? state.customizations.refOf(entry)
                              : c["@id"];
                            const url = `${location.origin}${location.pathname}?customization=${encodeURIComponent(ref)}`;
                            void navigator.clipboard?.writeText(url);
                            setCopied(c["@id"]);
                          }}
                        >
                          {copied === c["@id"]
                            ? t("link-copied", { defaultValue: "Copied" })
                            : t("copy-link", { defaultValue: "Copy link" })}
                        </button>
                      )}
                      <button
                        className="sb-note-button sb-note-button-danger"
                        onClick={() =>
                          void state.customizations.mine.remove(c["@id"])
                        }
                      >
                        {t("delete-customization", { defaultValue: "Delete" })}
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </>
      )}

      {tab === "plans" && (
        <>
          <form
            className="sb-account-card"
            onSubmit={(e) => {
              e.preventDefault();
              const to = Number(planTo) || reading.chapterNumber.value;
              const from = reading.chapterNumber.value;
              const label =
                title.trim() || `${reading.bookName.value} ${from}–${to}`;
              void plans
                .createFromChapters(
                  label,
                  reading.translationId.value,
                  reading.bookId.value,
                  from,
                  Math.max(from, to)
                )
                .then((p) => setOpen(p["@id"]));
              setTitle("");
              setPlanTo("");
            }}
          >
            <p className="sb-small sb-muted">
              {t("plan-maker-blurb", {
                defaultValue:
                  "A plan from the chapter on screen, one chapter a day, up to chapter:",
              })}
            </p>
            <input
              className="sb-note-editor"
              placeholder={t("plan-title", {
                defaultValue: "Plan title (optional)",
              })}
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
            <input
              className="sb-note-editor"
              type="number"
              min={reading.chapterNumber.value}
              placeholder={String(reading.book.value?.numberOfChapters ?? "")}
              value={planTo}
              onInput={(e) => setPlanTo((e.target as HTMLInputElement).value)}
            />
            <div className="sb-note-card-actions">
              <button
                type="submit"
                className="sb-note-button sb-note-button-primary"
              >
                {t("create-plan", { defaultValue: "Create plan" })}
              </button>
            </div>
          </form>
          {!plans.views.value.length && (
            <p className="sb-pane-empty">
              {t("plans-empty", { defaultValue: "No reading plans yet." })}
            </p>
          )}
          {plans.views.value.map((v) => {
            const pl = v.plan;
            const isOpen = open === pl["@id"];
            const published = state.publishing.isPublished(pl["@id"]);
            return (
              <article key={pl["@id"]} className="sb-rp-card sb-note-card">
                <header className="sb-note-card-header">
                  <button
                    className="sb-note-card-ref sb-rp-card-title"
                    onClick={() => setOpen(isOpen ? null : pl["@id"])}
                  >
                    {pl.label}
                  </button>
                  <span className="sb-note-card-when sb-rp-card-progress-label">
                    {v.done}/{v.total}
                  </span>
                </header>
                <div className="sb-rp-card-progress-bar">
                  <div
                    className="sb-rp-card-progress-fill"
                    style={{
                      width: `${v.total ? (100 * v.done) / v.total : 0}%`,
                    }}
                  />
                </div>
                {isOpen && (
                  <>
                    {!v.progress && (
                      <div className="sb-note-card-actions">
                        {pl.cadenceOptions.map((c) => (
                          <button
                            key={c["@id"]}
                            className="sb-note-button sb-note-button-primary"
                            onClick={() =>
                              void plans.start(pl["@id"], c["@id"])
                            }
                          >
                            {t("start-plan", { defaultValue: "Start" })} ·{" "}
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {pl.hasSession.map((s, si) => {
                      const sp = v.progress?.sessions.find(
                        (x) => x.session === s["@id"]
                      );
                      return (
                        <div
                          key={s["@id"]}
                          className={`sb-rpd-reading-card${v.todayIndex === si ? " sb-rp-today" : ""}`}
                        >
                          <div className="sb-rp-section-label">
                            {s.label ??
                              `${t("day", { defaultValue: "Day" })} ${si + 1}`}
                            {v.todayIndex === si
                              ? ` · ${t("today", { defaultValue: "Today" })}`
                              : ""}
                          </div>
                          {s.readings.map((r) => {
                            const done = !!sp?.completed.includes(r["@id"]);
                            return (
                              <div key={r["@id"]} className="sb-rpb-row">
                                <input
                                  type="checkbox"
                                  className="sb-rpb-check"
                                  checked={done}
                                  disabled={!v.progress}
                                  onChange={(e) =>
                                    void plans.setDone(
                                      pl["@id"],
                                      s["@id"],
                                      r["@id"],
                                      (e.target as HTMLInputElement).checked
                                    )
                                  }
                                />
                                <button
                                  className="sb-note-card-ref"
                                  onClick={() => openItem(state, r.item)}
                                >
                                  {itemLabel(state, r.item)}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    <div className="sb-note-card-actions">
                      {canPublish && (
                        <button
                          className={`sb-note-button${published ? " sb-note-button-published" : ""}`}
                          disabled={state.publishing.busy.value === pl["@id"]}
                          onClick={() =>
                            void (
                              published
                                ? state.publishing.withdrawWork(
                                    pl["@id"],
                                    "plan"
                                  )
                                : state.publishing.publishWork(pl)
                            ).catch(() => {})
                          }
                        >
                          {published
                            ? t("published", { defaultValue: "Published" })
                            : t("publish", { defaultValue: "Publish" })}
                        </button>
                      )}
                      {v.progress && (
                        <button
                          className="sb-note-button"
                          onClick={() => void plans.reset(pl["@id"])}
                        >
                          {t("restart-plan", { defaultValue: "Restart" })}
                        </button>
                      )}
                      <button
                        className="sb-note-button sb-note-button-danger"
                        onClick={() => void plans.remove(pl["@id"])}
                      >
                        {t("delete-reading-plan", { defaultValue: "Delete" })}
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </>
      )}
    </section>
  );
}
