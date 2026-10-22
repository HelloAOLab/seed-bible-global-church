// LOCATIONS — ported from packages/locations-extension: the places named in the chapter (a bundled gazetteer),
// offered in Discover; opening one selects the verse that names it. The map is a plain web map (PlacesMapPane):
// a toolbar item opens it when the chapter names a place.
import { h } from "preact";
import locations from "./locations.json";
import { PlacesMapPane } from "./PlacesMapPane";
import type { ExtensionRegistration } from "../host";
import type { TranslationBookChapter } from "../../backend/bible";
import { getVersePlainText } from "../../components/reader/chapterContent";

export interface PlaceData {
  place: string;
  geojson: string;
}

const GAZETTEER = locations as Record<string, PlaceData>;

export function findPlacesInText(text: string): PlaceData[] {
  const found: PlaceData[] = [];
  const seen = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    const place = GAZETTEER[word];
    if (place && !seen.has(place.place)) {
      seen.add(place.place);
      found.push(place);
    }
  }
  return found;
}

/** Each place with the first verse of the chapter that names it. */
export function placesInChapter(
  chapter: TranslationBookChapter
): Array<{ place: PlaceData; verse: number }> {
  const out: Array<{ place: PlaceData; verse: number }> = [];
  const seen = new Set<string>();
  for (const e of chapter.chapter.content) {
    if (!e || typeof e !== "object" || e.type !== "verse") continue;
    for (const p of findPlacesInText(getVersePlainText(e.content))) {
      if (seen.has(p.place)) continue;
      seen.add(p.place);
      out.push({ place: p, verse: e.number });
    }
  }
  return out;
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
        return placesInChapter(d.chapter).map(({ place, verse }) => ({
          id: `place:${place.place}`,
          title: place.place,
          description: `verse ${verse}`,
          icon: "location_on",
          onOpen: () => state.selection.select(verse, verse),
        }));
      },
    });
  },
};
export default locationsExtension;
