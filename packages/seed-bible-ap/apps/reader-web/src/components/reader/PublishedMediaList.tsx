// VIDEOS AND ARTICLES AS PUBLISHED — the media the publishing app holds about a book, a passage or a verse
// (state/published.ts), each opening at its maker, with the passage it is about, and the work it was published in, by whom,
// under what licence and whether its signature checks. Shared by the Story pane and the verse's Content pane.
import { useI18n } from "../../i18n";
import type { PublishedMedia } from "../../state/published";

const refText = (osis: string) => osis.replace(/\./, " ").replace(/\./, ":");

export function PublishedMediaList({ media }: { media: PublishedMedia[] }) {
  const { t } = useI18n();
  if (!media.length) return null;
  const works = [...new Map(media.map((m) => [m.release.url, m])).values()];
  return (
    <>
      <ul className="sb-story-list sb-published-media">
        {media.map((m) => (
          <li key={m.item.id} className="sb-story-video" data-media={m.item.id}>
            {m.item.image && <img src={m.item.image} alt="" loading="lazy" />}
            <div>
              <a href={m.item.url} target="_blank" rel="noreferrer">
                <span
                  className="material-symbols-outlined sb-story-video-icon"
                  aria-hidden="true"
                >
                  {m.item.medium === "article" ? "article" : "play_circle"}
                </span>
                <strong>{m.item.title}</strong>
              </a>
              <div className="sb-small sb-muted">
                {m.item.provider} ·{" "}
                {m.references.map((r) => refText(r.osis)).join(", ")}
              </div>
              {m.item.description && (
                <p className="sb-small">
                  {m.item.description.length > 220
                    ? `${m.item.description.slice(0, 217)}…`
                    : m.item.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {works.map((m) => (
        <p key={m.release.url} className="sb-small sb-muted">
          <a href={m.release.url} target="_blank" rel="noreferrer">
            {m.release.title}
          </a>{" "}
          · @{m.publisher.handle} · {m.license}
          {m.release.signatureStatus === "verified"
            ? ` · ${t("published-signed", { defaultValue: "signed by the publisher" })}`
            : ""}
        </p>
      ))}
    </>
  );
}
