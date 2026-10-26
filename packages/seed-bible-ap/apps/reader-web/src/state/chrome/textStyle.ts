// THE READER'S TEXT STYLE — the old Settings → Text: a font, a weight and italics for each of the book title, the
// section headings and the verses, on this device. Unset leaves the default (or a church theme's) in force. The
// choices are the old TEXT_FONT_OPTIONS; two of them come from Google Fonts and are loaded only when chosen.

export type TextSection = "bookTitle" | "heading" | "verse";
export const TEXT_SECTIONS: TextSection[] = ["bookTitle", "heading", "verse"];

export interface SectionStyle {
  font?: string;
  weight?: "300" | "400" | "700";
  italic?: boolean;
}
export type TextStyle = Partial<Record<TextSection, SectionStyle>>;

export const TEXT_FONTS: Array<{
  value: string;
  label: string;
  stylesheet?: string;
}> = [
  { value: "'Newsreader', serif", label: "Newsreader" },
  { value: "'Plus Jakarta Sans', sans-serif", label: "Plus Jakarta Sans" },
  { value: "system-ui, sans-serif", label: "System UI" },
  {
    value: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    label: "Helvetica Neue",
  },
  {
    value: "'Roboto', sans-serif",
    label: "Roboto",
    stylesheet:
      "https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&display=swap",
  },
  {
    value: "'Inter', sans-serif",
    label: "Inter",
    stylesheet:
      "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,300..700&display=swap",
  },
];

/** A stored style with anything this build does not offer dropped (an old or hand-edited value). */
export function cleanTextStyle(raw: unknown): TextStyle {
  const out: TextStyle = {};
  if (!raw || typeof raw !== "object") return out;
  for (const s of TEXT_SECTIONS) {
    const v = (raw as Record<string, unknown>)[s];
    if (!v || typeof v !== "object") continue;
    const { font, weight, italic } = v as Record<string, unknown>;
    const style: SectionStyle = {};
    if (typeof font === "string" && TEXT_FONTS.some((f) => f.value === font))
      style.font = font;
    if (weight === "300" || weight === "400" || weight === "700")
      style.weight = weight;
    if (italic === true) style.italic = true;
    if (Object.keys(style).length) out[s] = style;
  }
  return out;
}

/** The CSS custom properties to set on the page (null: remove, so the default applies). */
export function textStyleProperties(
  style: TextStyle
): Record<string, string | null> {
  const props: Record<string, string | null> = {};
  for (const s of TEXT_SECTIONS) {
    const v = style[s] ?? {};
    props[`--text-${s}-font`] = v.font ?? null;
    props[`--text-${s}-weight`] = v.weight ?? null;
    props[`--text-${s}-font-style`] = v.italic ? "italic" : null;
  }
  return props;
}

/** The Google Fonts stylesheets the chosen fonts need. */
export function textStyleSheets(style: TextStyle): string[] {
  const used = new Set(
    TEXT_SECTIONS.map((s) => style[s]?.font).filter(Boolean)
  );
  return TEXT_FONTS.filter((f) => f.stylesheet && used.has(f.value)).map(
    (f) => f.stylesheet!
  );
}
