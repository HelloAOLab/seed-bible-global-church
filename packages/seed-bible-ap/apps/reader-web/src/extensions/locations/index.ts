// LOCATIONS — the places a chapter names, from the publishers through the workspace (`/api/places/chapter/<JHN.1>`: the
// scripture publisher's Bible places and any map features people or ministries published for the chapter), offered in
// Discover and drawn on the Places map (PlacesMapPane). Each place carries the verses of the chapter that name it and
// how sure its site is; a disputed site is shown with its doubt, never dropped and never shown as certain.
import { h } from "preact";
import { PlacesMapPane } from "./PlacesMapPane";
import type { ExtensionRegistration } from "../host";
import { A2A_BASE } from "../../api";

export interface ChapterPlace {
  id: string;
  name: string;
  site?: string;
  geometry: { type: string; coordinates: unknown };
  verses: number[];
  identification: { confidence: number; method: string; basis?: string };
  source: "scripture" | "publishing";
  publisher: string;
  work: string;
  license: string;
  attribution: string;
}

/** Below this, the map and the list say the site is uncertain. */
export const SITE_CERTAIN = 0.7;
export const siteUncertain = (p: Pick<ChapterPlace, "identification">) =>
  p.identification.confidence < SITE_CERTAIN;

// One answer per chapter per page load: the Discover list and the map ask for the same chapter.
const asked = new Map<string, Promise<ChapterPlace[]>>();

/** The places of a chapter (`JHN.1`); empty when the workspace cannot answer (the next ask tries again). */
export function loadChapterPlaces(
  ref: string,
  fetchImpl: typeof fetch = fetch
): Promise<ChapterPlace[]> {
  let p = asked.get(ref);
  if (!p) {
    p = fetchImpl(`${A2A_BASE}/api/places/chapter/${encodeURIComponent(ref)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { places?: ChapterPlace[] } | null) => b?.places ?? [])
      .catch(() => []);
    p.then((list) => {
      if (!list.length) asked.delete(ref);
    });
    asked.set(ref, p);
  }
  return p;
}

const locationsExtension: ExtensionRegistration = {
  id: "locations",
  label: "Places",
  description: "The places a chapter names, in Discover.",
  init: function* (ctx) {
    const { state } = ctx;
    yield ctx.panes.register({
      id: "places-map",
      title: "Places map",
      render: () => h(PlacesMapPane, { state }),
    });
    yield ctx.toolbar.add({
      id: "places-map",
      label: "Places map",
      icon: "map",
      onSelect: () => ctx.panes.open("places-map"),
    });
    yield ctx.discover.registerProvider({
      id: "locations",
      label: "Places",
      discover: async (d) => {
        if (!d.chapter) return [];
        const ref = `${d.chapter.book.id}.${d.chapter.chapter.number}`;
        return (await loadChapterPlaces(ref)).map((p) => ({
          id: `place:${p.id}`,
          title: p.name,
          description: `verse ${p.verses.join(", ")}${siteUncertain(p) ? " · site uncertain" : ""}`,
          icon: "location_on",
          onOpen: () => state.selection.select(p.verses[0]!, p.verses[0]!),
        }));
      },
    });
  },
};
export default locationsExtension;
