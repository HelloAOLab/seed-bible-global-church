// THEME PREVIEWS — the old CustomizationPreviews: a small "Aa" thumbnail of a theme (its background, its text in its
// own font, its primary and secondary colours), and a miniature reader drawn from one theme's values so every colour
// and font edit shows where it is made — including the link and highlight colours the editor itself never uses.
import type { BibleTheme } from "../../state/chrome/theme";
import { useI18n } from "../../i18n";

export function ThemeThumbnail({ theme }: { theme: BibleTheme }) {
  const v = theme.variables;
  return (
    <span
      className="sb-cz-theme-thumb"
      aria-hidden="true"
      style={{ background: v["readerBackground"], color: v["readerFontColor"] }}
    >
      <span
        className="sb-cz-theme-thumb-aa"
        style={{ fontFamily: v["bookTitleFontFamily"] }}
      >
        Aa
      </span>
      <span className="sb-cz-theme-thumb-bars">
        <span style={{ background: v["primaryColor"] }} />
        <span style={{ background: v["secondaryColor"] }} />
      </span>
    </span>
  );
}

export function ThemeLivePreview({ theme }: { theme: BibleTheme }) {
  const { t } = useI18n();
  const v = theme.variables;
  const mark = theme.highlightColors["yellow"];
  return (
    <div
      className="sb-cz-live-preview"
      aria-hidden="true"
      style={{ background: v["background"], fontFamily: v["fontFamily"] }}
    >
      <div
        className="sb-cz-live-preview-toolbar"
        style={{
          background: v["readerToolbarBackground"],
          color: v["readerToolbarFontColor"],
        }}
      >
        <span
          className="sb-cz-live-preview-dot"
          style={{ background: v["primaryColor"] }}
        />
        <span className="sb-cz-live-preview-bar" />
      </div>
      <div
        className="sb-cz-live-preview-reader"
        style={{
          background: v["readerBackground"],
          color: v["readerFontColor"],
          fontFamily: v["readerFontFamily"],
        }}
      >
        <div
          className="sb-cz-live-preview-book"
          style={{
            color: v["bookTitleFontColor"],
            fontFamily: v["bookTitleFontFamily"],
          }}
        >
          {t("customization-preview-book", {
            defaultValue: "The Gospel of John",
          })}
        </div>
        <div
          className="sb-cz-live-preview-chapter"
          style={{
            color: v["chapterHeadingFontColor"],
            fontFamily: v["chapterHeadingFontFamily"],
          }}
        >
          {t("customization-preview-chapter", { defaultValue: "John 1" })}
        </div>
        <p
          className="sb-cz-live-preview-verse"
          style={{
            color: v["verseFontColor"],
            fontFamily: v["verseFontFamily"],
          }}
        >
          {t("customization-preview-verse-start", {
            defaultValue: "In the beginning was the",
          })}{" "}
          <mark style={{ background: mark?.color, color: mark?.fontColor }}>
            {t("customization-preview-verse-word", { defaultValue: "Word" })}
          </mark>
          {t("customization-preview-verse-middle", {
            defaultValue: ", and the Word was with",
          })}{" "}
          <span
            className="sb-cz-live-preview-link"
            style={{ color: v["linkColor"] }}
          >
            {t("customization-preview-verse-god", { defaultValue: "God" })}
          </span>
          {t("customization-preview-verse-end", {
            defaultValue: ", and the Word was God.",
          })}
        </p>
        <div className="sb-cz-live-preview-buttons">
          <span
            style={{
              background: v["primaryColor"],
              color: v["primaryFontColor"],
            }}
          >
            {t("customization-primaryColor", { defaultValue: "Primary" })}
          </span>
          <span
            style={{
              background: v["secondaryColor"],
              color: v["secondaryFontColor"],
            }}
          >
            {t("customization-secondaryColor", { defaultValue: "Secondary" })}
          </span>
        </div>
      </div>
    </div>
  );
}
