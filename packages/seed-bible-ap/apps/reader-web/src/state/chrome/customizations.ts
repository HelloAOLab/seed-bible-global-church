// CUSTOMIZATIONS — a branded reader (seed:Customization: theme variants, logo, default edition) published to a
// shelf as a released slice; readers pick one from what the registry lists and the app dresses itself with its
// variant for the system scheme (docs/porting/CustomizationsManager.md). The publisher's side here is the
// signed-in person's own shelf; an organization's (`seed.workspace.ask.org`, hard-problems §11) comes later.
import { computed, signal } from "@preact/signals";
import { Customization, type ThemeVariant } from "@seed/seed-schema";
import type { ReaderBackend } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { LOCAL_AGENT } from "../records/buckets";
import { newOpId, nowIso } from "../records/marks";
import { createWorks } from "../library/works";
import type { Offering } from "../social/discover";
import { DARK_THEME, LIGHT_THEME, type BibleTheme } from "./theme";

export interface Selection {
  descriptorId: string;
  shelf: string;
  label: string;
  variantId?: string;
}

const KEY = "customization:selected";

/** The variant's variables over the built-in theme of its scheme, as a theme the settings can apply. */
export function themeFromVariant(
  c: Customization,
  v: ThemeVariant
): BibleTheme {
  const base = v.scheme === "dark" ? DARK_THEME : LIGHT_THEME;
  return {
    id: `${c["@id"]}#${v["@id"]}`,
    name: `${c.label} · ${v.label}`,
    variables: { ...base.variables, ...v.variables },
    highlightColors: base.highlightColors,
    ...(base.bookmarkColors ? { bookmarkColors: base.bookmarkColors } : {}),
  };
}

export function pickVariant(
  c: Customization,
  prefersDark: boolean,
  variantId?: string
): ThemeVariant {
  const wanted = variantId
    ? c.hasVariant.find((v) => v["@id"] === variantId)
    : undefined;
  if (wanted) return wanted;
  const scheme = prefersDark ? "dark" : "light";
  return c.hasVariant.find((v) => v.scheme === scheme) ?? c.hasVariant[0]!;
}

/** `Grace Church · Blue` → `grace-church-blue`. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export function createCustomizations(
  backend: ReaderBackend,
  stores: ReaderStores,
  identity: () => { agent: string } | null
) {
  // The reader's own customizations (publisher side), as works.
  const mine = createWorks<Customization>(
    "seed-bible/customizations",
    backend,
    stores,
    (raw) => Customization.parse(raw)
  );
  // What the estate's shelves released, as the registry lists them.
  const available = signal<
    Array<{ offering: Offering; customization: Customization }>
  >([]);
  const loading = signal(false);
  const error = signal<string | null>(null);
  const selected = signal<Selection | null>(null);
  const ready = stores.prefs.get(KEY).then((v) => {
    if (v && typeof v === "object") selected.value = v as Selection;
  });

  /** The link form of a customization: its title as a slug (`grace-church-blue`); the descriptor id also works. */
  function refOf(entry: {
    offering: Offering;
    customization: Customization;
  }): string {
    return slugify(entry.customization.label) || entry.offering.descriptorId;
  }
  /** The customization a link names — by title slug, descriptor id, or the work's own id. */
  function findByRef(ref: string) {
    const r = ref.trim();
    const slug = slugify(r);
    return (
      available.value.find(
        (a) =>
          a.offering.descriptorId === r ||
          a.customization["@id"] === r ||
          (slug && slugify(a.customization.label) === slug)
      ) ?? null
    );
  }

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      const rows = await backend.discover({ kind: "customization" });
      const out: Array<{ offering: Offering; customization: Customization }> =
        [];
      for (const o of rows) {
        const work = (o.descriptor as { work?: unknown }).work;
        try {
          out.push({ offering: o, customization: Customization.parse(work) });
        } catch {
          /* a descriptor without a valid work is skipped */
        }
      }
      available.value = out;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** The selected customization's document, from the list when it is there, else from the device copy. */
  const current = computed<Customization | null>(() => {
    const s = selected.value;
    if (!s) return null;
    return (
      available.value.find((a) => a.offering.descriptorId === s.descriptorId)
        ?.customization ??
      (stashed.value?.["@id"] === s.descriptorId ? stashed.value : null)
    );
  });
  // The selected customization's work is kept on the device so the theme applies before the registry answers.
  const stashed = signal<(Customization & { "@id": string }) | null>(null);
  const stashReady = stores.prefs.get(`${KEY}:work`).then((v) => {
    if (v && typeof v === "object") {
      try {
        stashed.value = Customization.parse(v) as Customization & {
          "@id": string;
        };
      } catch {
        stashed.value = null;
      }
    }
  });

  async function select(
    entry: { offering: Offering; customization: Customization } | null,
    variantId?: string
  ) {
    await ready;
    await stashReady;
    if (!entry) {
      selected.value = null;
      stashed.value = null;
      await stores.prefs.delete(KEY);
      await stores.prefs.delete(`${KEY}:work`);
      return;
    }
    selected.value = {
      descriptorId: entry.offering.descriptorId,
      shelf: entry.offering.shelf,
      label: entry.customization.label,
      ...(variantId ? { variantId } : {}),
    };
    stashed.value = {
      ...entry.customization,
      "@id": entry.offering.descriptorId,
    };
    await stores.prefs.set(KEY, selected.value);
    await stores.prefs.set(`${KEY}:work`, stashed.value);
  }

  const theme = (prefersDark: boolean): BibleTheme | null => {
    const c = current.value;
    if (!c) return null;
    return themeFromVariant(
      c,
      pickVariant(c, prefersDark, selected.value?.variantId)
    );
  };

  // Publisher side: make and edit one of your own.
  async function create(label: string): Promise<Customization> {
    const id = `urn:seed:customization:${newOpId()}`;
    const doc: Customization = {
      "@id": id,
      "@type": "seed:Customization",
      publishedBy: identity()?.agent ?? LOCAL_AGENT,
      label,
      hasVariant: [
        {
          "@type": "seed:ThemeVariant",
          "@id": "light",
          label: "Light",
          scheme: "light",
          variables: { primaryColor: LIGHT_THEME.variables["primaryColor"]! },
        },
        {
          "@type": "seed:ThemeVariant",
          "@id": "dark",
          label: "Dark",
          scheme: "dark",
          variables: { primaryColor: DARK_THEME.variables["primaryColor"]! },
        },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await mine.save(doc);
    return doc;
  }

  async function setVariable(
    id: string,
    variantId: string,
    name: string,
    value: string
  ) {
    const c = mine.byId(id);
    if (!c) return;
    await mine.save({
      ...c,
      hasVariant: c.hasVariant.map((v) =>
        v["@id"] === variantId
          ? {
              ...v,
              variables: value
                ? { ...v.variables, [name]: value }
                : Object.fromEntries(
                    Object.entries(v.variables).filter(([k]) => k !== name)
                  ),
            }
          : v
      ),
    });
  }

  async function update(
    id: string,
    patch: Partial<
      Pick<Customization, "label" | "logo" | "defaultEdition" | "description">
    >
  ) {
    const c = mine.byId(id);
    if (c) await mine.save({ ...c, ...patch });
  }

  return {
    mine,
    available,
    refOf,
    findByRef,
    loading,
    error,
    selected,
    current,
    ready,
    refresh,
    select,
    theme,
    create,
    setVariable,
    update,
  };
}

export type Customizations = ReturnType<typeof createCustomizations>;

/** The typography a church theme may set, as text: fonts, a Google Fonts stylesheet, line height, column width, UI size. */
export const EDITABLE_TEXT_VARIABLES: Array<[string, string, string]> = [
  ["readerFontFamily", "Reader font", "Newsreader, serif"],
  ["fontFamily", "Interface font", "Plus Jakarta Sans, sans-serif"],
  [
    "fontStylesheet",
    "Font stylesheet (Google Fonts URL)",
    "https://fonts.googleapis.com/css2?family=Lora&display=swap",
  ],
  ["readerLineHeight", "Reader line height", "1.7"],
  ["readerMaxWidth", "Reader column width", "42rem"],
  ["uiFontSize", "Interface size", "100%"],
  ["twitchChannel", "Twitch channel (read-only embed)", "yourchurch"],
];

/** The variables a church editor exposes, in order, with plain names. */
export const EDITABLE_VARIABLES: Array<[string, string]> = [
  ["primaryColor", "Accent"],
  ["primaryFontColor", "Text on accent"],
  ["secondaryColor", "Secondary"],
  ["secondaryFontColor", "Text on secondary"],
  ["background", "Page background"],
  ["readerBackground", "Reader background"],
  ["readerFontColor", "Reader text"],
  ["fontColor", "Interface text"],
  ["linkColor", "Links"],
  ["readerToolbarBackground", "Toolbar background"],
];
