// VIDEOS AND ARTICLES — the old reader's content cards (packages/seed-bible DiscoverPane ContentSection): grouped
// under their author (BibleProject, Expedition Bible…), each with its picture, title, a description that opens with
// Read more, and the video playing in place (or the page opening, for an article).
import { useState } from "preact/hooks";
import { useI18n } from "../../i18n";
import type { DiscoverItem } from "../../extensions/host";

/** Items with an author, grouped by it in the order they come; the rest are for the plain list. */
export function byAuthor(items: DiscoverItem[]): {
  groups: Array<[string, DiscoverItem[]]>;
  rest: DiscoverItem[];
} {
  const groups = new Map<string, DiscoverItem[]>();
  const rest: DiscoverItem[] = [];
  for (const it of items) {
    if (!it.author) {
      rest.push(it);
      continue;
    }
    groups.set(it.author, [...(groups.get(it.author) ?? []), it]);
  }
  return { groups: [...groups.entries()], rest };
}

function ContentCard({ it }: { it: DiscoverItem }) {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [more, setMore] = useState(false);
  const text = it.longText ?? it.description ?? "";
  const long = text.length > 140;
  return (
    <li className="sb-discover-item sb-content-card" data-content-id={it.id}>
      {playing && it.embedUrl ? (
        <iframe
          className="sb-content-card-player"
          src={`${it.embedUrl}${it.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
          title={it.title}
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allowFullScreen
        />
      ) : it.image ? (
        <button
          type="button"
          className="sb-content-card-picture"
          aria-label={
            it.embedUrl
              ? t("play-video", {
                  title: it.title,
                  defaultValue: "Play {{title}}",
                })
              : t("open-content", {
                  title: it.title,
                  defaultValue: "Open {{title}}",
                })
          }
          onClick={() => (it.embedUrl ? setPlaying(true) : it.onOpen?.())}
        >
          <img
            className="sb-discover-item-image"
            src={it.image}
            alt=""
            loading="lazy"
          />
          {it.embedUrl && (
            <span
              className="material-symbols-outlined sb-content-card-play"
              aria-hidden="true"
            >
              play_circle
            </span>
          )}
        </button>
      ) : null}
      <button
        type="button"
        className="sb-discover-item-title sb-content-card-title"
        onClick={() => (it.embedUrl ? setPlaying(true) : it.onOpen?.())}
      >
        {it.title}
      </button>
      {text && (
        <p
          className={`sb-discover-item-description${long && !more ? " sb-content-card-clamped" : ""}`}
        >
          {text}
        </p>
      )}
      <div className="sb-content-card-actions">
        {long && (
          <button
            type="button"
            className="sb-content-see-all"
            onClick={() => setMore(!more)}
          >
            {more
              ? t("read-less", { defaultValue: "Read less" })
              : t("read-more", { defaultValue: "Read more" })}
          </button>
        )}
        {it.onOpen && (
          <button
            type="button"
            className="sb-content-see-all"
            onClick={() => it.onOpen?.()}
          >
            {t("open-page", { defaultValue: "Open page" })}
          </button>
        )}
      </div>
    </li>
  );
}

/** One section per author, its cards under it. */
export function ContentCards(props: {
  groups: Array<[string, DiscoverItem[]]>;
  limit?: number;
}) {
  return (
    <>
      {props.groups.map(([author, items]) => (
        <section key={author} className="sb-discover-section sb-content-cards">
          <h3 className="sb-discover-section-title">{author}</h3>
          <ul className="sb-discover-list">
            {(props.limit ? items.slice(0, props.limit) : items).map((it) => (
              <ContentCard key={it.id} it={it} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
