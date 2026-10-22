// THE THEME TABLES — ported verbatim from packages/seed-bible ThemeManager (LIGHT_THEME / DARK_THEME) so the reader
// renders with the same colours and type; `generateThemeCssVariables` turns a table into the `--sb-*` variables every
// ported stylesheet reads. Custom themes (customizations) come later; the two built-ins are enough for core reading.

export interface ThemeHighlightColor {
  /**
   * The color of the background for verses which are highlighted with this color.
   */
  color: string;
  /**
   * The color of the font for verses which are highlighted with this color.
   */
  fontColor: string;

  /**
   * The color that should be used to display "words of jesus" text highlighted with this color.
   */
  wordsOfJesusFontColor: string;
}

export interface BibleTheme {
  id: string;
  name: string;
  variables: Record<string, string | undefined>;
  highlightColors: Record<string, ThemeHighlightColor>;
  bookmarkColors?: Record<string, string | undefined>;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

/** Keep a value from closing the `body { }` theme rule and wiping every `--sb-*` color. */
function sanitizeCssValue(value: string): string {
  return value.replace(/[{}<;]/g, "");
}

export function generateThemeCssVariables(variables: BibleTheme): string {
  const cssVariables = Object.entries(variables.variables)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(
      ([key, value]) =>
        `--sb-${toKebabCase(key)}: ${sanitizeCssValue(String(value))};`
    )
    .join("\n");

  const highlightColorVariables = Object.entries(variables.highlightColors)
    .flatMap(([key, value]) => [
      `--sb-highlight-${key}-color: ${sanitizeCssValue(String(value.color))};`,
      `--sb-highlight-${key}-font-color: ${sanitizeCssValue(String(value.fontColor))};`,
      `--sb-highlight-${key}-words-of-jesus-font-color: ${sanitizeCssValue(String(value.wordsOfJesusFontColor))};`,
    ])
    .join("\n");

  const bookmarkColorVariables = Object.entries(variables.bookmarkColors ?? {})
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `--sb-bookmark-${key}-color: ${sanitizeCssValue(String(value))};`
    )
    .join("\n");

  const css = cssVariables + "\n" + highlightColorVariables;
  return bookmarkColorVariables ? css + "\n" + bookmarkColorVariables : css;
}

export const LIGHT_THEME: BibleTheme = {
  id: "light",
  name: "Light",
  variables: {
    primaryColor: "#e07b4c",
    primaryFontColor: "#fff",

    secondaryColor: "#faddd1",
    secondaryFontColor: "#333",

    tertiaryColor: "#f0f0f0",

    linkColor: "#e07b4c",
    linkVisitedColor: "#8d5a6b",

    background: "#f8fafc",

    sidebarBackground: "transparent",
    sidebarFontFamily: "inherit",
    sidebarFontColor: "inherit",

    readerBackground: "#ffffff",
    readerFontFamily: "inherit",
    readerFontColor: "#333",

    bookSelectorFontFamily: "inherit",

    fontFamily: "system-ui, sans-serif",
    fontColor: "#333",

    bookTitleFontFamily: "Newsreader, serif",
    bookTitleFontColor: "#333",

    chapterHeadingFontFamily: "Plus Jakarta Sans, sans-serif",
    chapterHeadingFontColor: "#333",
    chapterHeadingFontStyle: "normal",

    verseFontFamily: "Plus Jakarta Sans, sans-serif",
    verseFontColor: "#333",
    verseCursor: "pointer",

    selectedVerseBorderBottom: "none",
    selectedVerseTextDecoration: "underline dotted",
    selectedVerseTextDecorationColor: "currentColor",

    hebrewSubtitleFontFamily: "Newsreader, serif",
    hebrewSubtitleFontColor: "#333",
    hebrewSubtitleFontStyle: "italic",

    readerToolbarBottom: "1.125rem",
    readerToolbarGap: "0.25rem",
    readerToolbarPadding: "1px 0.3125rem",
    readerToolbarBorderRadius: "1.25rem",
    readerToolbarBackground: "#ffffff",
    readerToolbarBorder: "1px solid #00000024",
    readerToolbarBoxShadow:
      "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
    readerToolbarZIndex: "99",
    readerToolbarHeight: "auto",

    readerToolbarFloatingButtonTop: "-4.25rem",
    readerToolbarFloatingButtonWidth: "3rem",
    readerToolbarFloatingButtonHeight: "3rem",
    readerToolbarFloatingButtonBorder: "1px solid #00000024",
    readerToolbarFloatingButtonBorderRadius: "62.4375rem",
    readerToolbarFloatingButtonBackground: "#ffffff",
    readerToolbarFloatingButtonFontColor: "#333",
    readerToolbarFloatingButtonBoxShadow: "0 10px 24px #0000001a",

    verseToolbarGap: "0.125rem",
    verseToolbarPadding: "0.25rem 0.5rem",
    verseToolbarBorderRadius: "0.625rem",
    verseToolbarBorder: "1px solid var(--sb-divider-color)",
    verseToolbarBoxShadow: "0 26px 10px var(--sb-shadow-color)",
    verseToolbarZIndex: "100",
    verseToolbarMinHeight: "0",

    readerToolbarMobileLayoutHeight: "auto",
    readerToolbarMobileLayoutPadding: "0.625rem 2.1875rem",
    readerToolbarMobileLayoutGap: "1rem",
    readerToolbarMobileLayoutItemSize: "2.75rem",
    readerToolbarMobileLayoutCenterButtonWidth: "5.4375rem",
    readerToolbarMobileLayoutCenterButtonHeight: "2.625rem",
    readerToolbarMobileLayoutButtonBorderRadius: "2.5rem",

    readerToolbarFloatingButtonSideOffset: "1rem",

    verseToolbarToolsGap: "0.125rem",
    verseToolbarMobileBottom: "1.125rem",

    menuBackground: "#ffffff",
    menuFontColor: "#333",

    toolbarIconInvert: "0",

    readerToolbarFontColor: "#333",
    readerToolbarFontFamily: "system-ui, sans-serif",

    dividerColor: "rgba(0, 0, 0, 0.12)",
    shadowColor: "rgba(0, 0, 0, 0.14)",

    tabBorder: "1px solid transparent",
    tabBackground: "inherit",
    tabFontColor: "inherit",

    selectedTabBorder: "1px solid var(--sb-primary-color)",
    selectedTabBackground: "var(--sb-secondary-color)",
    selectedTabFontColor: "var(--sb-primary-color)",
  },
  highlightColors: {
    yellow: {
      color: "#fff59d",
      fontColor: "#333",
      wordsOfJesusFontColor: "#c00",
    },
    green: {
      color: "#a5d6a7",
      fontColor: "#333",
      wordsOfJesusFontColor: "#a00",
    },
    cyan: {
      color: "#80deea",
      fontColor: "#333",
      wordsOfJesusFontColor: "#a00",
    },
    blue: {
      color: "#90caf9",
      fontColor: "#333",
      wordsOfJesusFontColor: "#900",
    },
    red: {
      color: "#ef9a9a",
      fontColor: "#333",
      wordsOfJesusFontColor: "#800",
    },
    magenta: {
      color: "#ea80fc",
      fontColor: "#333",
      wordsOfJesusFontColor: "#700",
    },
    pink: {
      color: "#f48fb1",
      fontColor: "#333",
      wordsOfJesusFontColor: "#800",
    },
    purple: {
      color: "#ce93d8",
      fontColor: "#333",
      wordsOfJesusFontColor: "#700",
    },
    orange: {
      color: "#ffcc80",
      fontColor: "#333",
      wordsOfJesusFontColor: "#b00",
    },
    cream: {
      color: "#fff8e1",
      fontColor: "#333",
      wordsOfJesusFontColor: "#c00",
    },
    gray: {
      color: "#cfd8dc",
      fontColor: "#333",
      wordsOfJesusFontColor: "#b00",
    },
    tan: {
      color: "#e0c9a6",
      fontColor: "#333",
      wordsOfJesusFontColor: "#a00",
    },
  },
  bookmarkColors: {
    orange: "#e07b4c",
    red: "#d14343",
    yellow: "#d4a106",
    green: "#3a9a55",
    blue: "#3474d4",
    purple: "#8a56cc",
  },
};

export const DARK_THEME: BibleTheme = {
  id: "dark",
  name: "Dark",
  variables: {
    primaryColor: "#e07b4c",
    primaryFontColor: "#111111",

    secondaryColor: "#433228",
    secondaryFontColor: "#f5f5f5",

    tertiaryColor: "#1c1c1c",

    linkColor: "#e07b4c",
    linkVisitedColor: "#d99bb0",

    background: "#0a0a0a",

    sidebarBackground: "#0f0f0f",
    sidebarFontFamily: "inherit",
    sidebarFontColor: "#e6e6e6",

    readerBackground: "#121212",
    readerFontFamily: "inherit",
    readerFontColor: "#e6e6e6",

    bookSelectorFontFamily: "inherit",

    fontFamily: "system-ui, sans-serif",
    fontColor: "#e6e6e6",

    bookTitleFontFamily: "Newsreader, serif",
    bookTitleFontColor: "#fafafa",

    chapterHeadingFontFamily: "Plus Jakarta Sans, sans-serif",
    chapterHeadingFontColor: "#e6e6e6",
    chapterHeadingFontStyle: "normal",

    verseFontFamily: "Plus Jakarta Sans, sans-serif",
    verseFontColor: "#e6e6e6",
    verseCursor: "pointer",

    selectedVerseBorderBottom: "none",
    selectedVerseTextDecoration: "underline dotted",
    selectedVerseTextDecorationColor: "currentColor",

    hebrewSubtitleFontFamily: "Newsreader, serif",
    hebrewSubtitleFontColor: "#e6e6e6",
    hebrewSubtitleFontStyle: "italic",

    readerToolbarBottom: "1.125rem",
    readerToolbarGap: "0.25rem",
    readerToolbarPadding: "1px 0.3125rem",
    readerToolbarBorderRadius: "1.25rem",
    readerToolbarBackground: "#181818",
    readerToolbarBorder: "1px solid rgba(255, 255, 255, 0.1)",
    readerToolbarBoxShadow: "0 26px 10px rgba(0, 0, 0, 0.5)",
    readerToolbarZIndex: "99",
    readerToolbarHeight: "auto",
    readerToolbarFloatingButtonTop: "-4.25rem",
    readerToolbarFloatingButtonWidth: "3rem",
    readerToolbarFloatingButtonHeight: "3rem",
    readerToolbarFloatingButtonBorder: "1px solid rgba(255, 255, 255, 0.1)",
    readerToolbarFloatingButtonBorderRadius: "62.4375rem",
    readerToolbarFloatingButtonBackground: "#181818",
    readerToolbarFloatingButtonFontColor: "#e6e6e6",
    readerToolbarFloatingButtonBoxShadow: "0 10px 24px rgba(0, 0, 0, 0.5)",

    verseToolbarGap: "0.125rem",
    verseToolbarPadding: "0.25rem 0.5rem",
    verseToolbarBorderRadius: "0.625rem",
    verseToolbarBorder: "1px solid var(--sb-divider-color)",
    verseToolbarBoxShadow: "0 26px 10px var(--sb-shadow-color)",
    verseToolbarZIndex: "100",
    verseToolbarMinHeight: "0",

    readerToolbarMobileLayoutHeight: "auto",
    readerToolbarMobileLayoutPadding: "0.625rem 2.1875rem",
    readerToolbarMobileLayoutGap: "1rem",
    readerToolbarMobileLayoutItemSize: "2.75rem",
    readerToolbarMobileLayoutCenterButtonWidth: "5.4375rem",
    readerToolbarMobileLayoutCenterButtonHeight: "2.625rem",
    readerToolbarMobileLayoutButtonBorderRadius: "2.5rem",

    readerToolbarFloatingButtonSideOffset: "1rem",

    verseToolbarToolsGap: "0.125rem",
    verseToolbarMobileBottom: "1.125rem",

    menuBackground: "#181818",
    menuFontColor: "#e6e6e6",

    toolbarIconInvert: "1",

    readerToolbarFontColor: "#e6e6e6",
    readerToolbarFontFamily: "system-ui, sans-serif",

    dividerColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "rgba(0, 0, 0, 0.6)",

    tabBorder: "1px solid transparent",
    tabBackground: "inherit",
    tabFontColor: "inherit",

    selectedTabBorder: "1px solid var(--sb-primary-color)",
    selectedTabBackground: "var(--sb-secondary-color)",
    selectedTabFontColor: "var(--sb-primary-color)",
  },
  // Dark-theme highlights are solid, saturated-but-dark versions of each hue
  // rather than the bright pastels used in light mode. They read as clearly
  // colorful and distinct from one another, yet stay dark enough that white
  // text stays legible on top. The font color is an explicit white (`#ffffff`)
  // rather than `inherit` — inherit resolved to a non-white color in practice,
  // so it is pinned here to guarantee the highlighted verse text stays white.
  // (Translucent tints were tried first but blending low-opacity colors into
  // the near-black background dragged every hue toward gray — they came out
  // muddy and washed out, so solid colors are used.)
  highlightColors: {
    yellow: {
      color: "#756a0a",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    green: {
      color: "#2f6d3a",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    cyan: {
      color: "#1a6b73",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    blue: {
      color: "#2f5f9e",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    red: {
      color: "#8e3a3a",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    magenta: {
      color: "#7a2f6e",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    pink: {
      color: "#93395c",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    purple: {
      color: "#5b4489",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    orange: {
      color: "#98551c",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    cream: {
      color: "#6b6040",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    gray: {
      color: "#4a4a4a",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
    tan: {
      color: "#6d4c33",
      fontColor: "#ffffff",
      wordsOfJesusFontColor: "#ff9e80",
    },
  },
  bookmarkColors: {
    orange: "#f29b72",
    red: "#f07878",
    yellow: "#f2cc4d",
    green: "#6ccb85",
    blue: "#7aaef2",
    purple: "#b893ee",
  },
};

/** The per-colour classes the chapter uses: `.sb-highlight-<id>` sets the font colour and the fill the run paints. */
export function generateThemeCssClasses(theme: BibleTheme): string {
  return Object.keys(theme.highlightColors)
    .map(
      (id) =>
        `.sb-highlight-${id} { color: var(--sb-highlight-${id}-font-color); --sb-highlight-fill: var(--sb-highlight-${id}-color); }\n` +
        `.sb-highlight-${id} .sb-words-of-jesus { color: var(--sb-highlight-${id}-words-of-jesus-font-color); }`
    )
    .join("\n");
}
