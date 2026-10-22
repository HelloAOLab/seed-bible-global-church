// THEOGRAPHIC — ported from packages/theographic-extension: the people, places and events of the chapter on screen
// (the selected verses' first) in Discover, and a card for each — who they were, when, how they are related, and
// every passage they appear in, each a link into the reader. Browser-local: the Bible API's public dataset only.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import type { ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  chapterEntities,
  chapterPath,
  entityOf,
  itemsForChapter,
  readTheographic,
  yearText,
  type Entity,
} from "./data";
import "./theographic.css";

/** The cards opened, newest last: Back pops one. */
const trail = signal<string[]>([]);

function Card({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const path = trail.value[trail.value.length - 1];
  const [entity, setEntity] = useState<Entity | null | undefined>(undefined);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setEntity(undefined);
    setMore(false);
    readTheographic(path, state.stores.chapters)
      .then((r) => live && setEntity(entityOf(r)))
      .catch(() => live && setEntity(null));
    return () => {
      live = false;
    };
  }, [path]);
  if (!path)
    return (
      <p className="sb-pane-empty">
        {t("theographic-empty", {
          defaultValue: "Open a person, place or event from Discover.",
        })}
      </p>
    );
  const open = (apiLink: string) => (trail.value = [...trail.value, apiLink]);
  const bookName = (id: string) =>
    state.reading.books.value.find((b) => b.id === id)?.name ?? id;
  return (
    <div className="sb-theo-card">
      {trail.value.length > 1 && (
        <button
          className="sb-note-button sb-theo-back"
          onClick={() => (trail.value = trail.value.slice(0, -1))}
        >
          {t("back", { defaultValue: "Back" })}
        </button>
      )}
      {entity === undefined && (
        <p className="sb-muted sb-small">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      )}
      {entity === null && (
        <p className="sb-muted sb-small">
          {t("theographic-unreadable", {
            defaultValue: "This record could not be read.",
          })}
        </p>
      )}
      {entity && (
        <>
          <h3 className="sb-theo-name">{entity.name}</h3>
          <p className="sb-small sb-muted">
            {[
              entity.alsoCalled?.length
                ? `${t("theographic-also", { defaultValue: "Also called" })} ${entity.alsoCalled.join(", ")}`
                : "",
              entity.birthYear !== undefined
                ? `${yearText(entity.birthYear)} – ${yearText(entity.deathYear)}`
                : "",
              entity.featureType ?? "",
              entity.startDate ? yearText(entity.startDate) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {entity.description?.length ? (
            <div className="sb-theo-description">
              {(more ? entity.description : entity.description.slice(0, 1)).map(
                (d, i) =>
                  (more ? d : d.length > 600 ? `${d.slice(0, 600)}…` : d)
                    .split(/\n\s*\n/)
                    .map((para, j) => <p key={`${i}-${j}`}>{para.trim()}</p>)
              )}
              {(entity.description.length > 1 ||
                entity.description[0]!.length > 600) && (
                <button
                  className="sb-note-button"
                  onClick={() => setMore(!more)}
                >
                  {more
                    ? t("show-less", { defaultValue: "Show less" })
                    : t("show-more", { defaultValue: "Show more" })}
                </button>
              )}
            </div>
          ) : null}
          {entity.relations.map((r) => (
            <div key={r.label} className="sb-theo-relation">
              <span className="sb-rp-section-label">{r.label}</span>
              <div className="sb-theo-chips">
                {r.items.map((x) => (
                  <button
                    key={x.apiLink}
                    className="sb-note-button"
                    onClick={() => open(x.apiLink)}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {entity.references.length > 0 && (
            <div className="sb-theo-relation">
              <span className="sb-rp-section-label">
                {t("theographic-passages", {
                  defaultValue: "In {{count}} passages",
                  count: entity.references.length,
                })}
              </span>
              <div className="sb-theo-chips">
                {entity.references.slice(0, 30).map((r, i) => (
                  <button
                    key={i}
                    className="sb-note-button sb-theo-ref"
                    onClick={() =>
                      void state.reading
                        .goTo(
                          state.reading.translationId.value,
                          r.book,
                          r.chapter
                        )
                        .then(() =>
                          state.selection.select(r.verse, r.endVerse ?? r.verse)
                        )
                    }
                  >
                    {bookName(r.book)} {r.chapter}:{r.verse}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="sb-small sb-muted sb-theo-credit">
            Theographic Bible Metadata · CC BY-SA 4.0
          </p>
        </>
      )}
    </div>
  );
}

const theographic: ExtensionRegistration = {
  id: "theographic",
  label: "People, places and events",
  description:
    "Who and where in the chapter on screen, from the Theographic dataset, in Discover.",
  init: function* (ctx) {
    const { state } = ctx;
    yield ctx.panes.register({
      id: "theographic",
      title: "People, places and events",
      render: () => <Card state={state} />,
    });
    yield ctx.discover.registerProvider({
      id: "theographic",
      label: "People, places and events",
      discover: async (d) => {
        const [book, ch] = d.chapterRef.split(".");
        const raw = await readTheographic(
          chapterPath(book!, Number(ch)),
          state.stores.chapters
        ).catch(() => null);
        if (!raw) return [];
        return itemsForChapter(chapterEntities(raw), d.selectedVerses).map(
          (it) => ({
            ...it,
            onOpen: () => {
              trail.value = [it.apiLink];
              ctx.panes.open("theographic");
            },
          })
        );
      },
    });
    yield () => {
      trail.value = [];
    };
  },
};

export default theographic;
