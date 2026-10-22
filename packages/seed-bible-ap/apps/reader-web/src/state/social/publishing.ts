// PUBLISHING — a note becomes a public slice on the reader's own shelf (`seed.publish.slice`: descriptor +
// markdown, released); withdrawing makes it private again and the next crawl drops it from the registry. Which
// notes are published is remembered on the device (the registry is the truth for everyone else).
import { signal } from "@preact/signals";
import type { ReaderBackend } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { isHtmlNote } from "../../components/records/noteHtml";
import {
  noteHtmlToMarkdown,
  plainToMarkdown,
} from "../../components/records/noteMarkdown";
import type { Note } from "../records/annotations";
import type {
  Customization,
  Playlist,
  ReadingPlan,
  PlaylistItem,
} from "@seed/seed-schema";
import { spanOf } from "../records/marks";
import { passageOf } from "../records/marks";

export interface PublishedNote {
  noteId: string;
  slug: string;
  descriptorId: string;
  passage: string;
  publishedAt: string;
}

const KEY = "published-notes";

export function createPublishing(backend: ReaderBackend, stores: ReaderStores) {
  const published = signal<Record<string, PublishedNote>>({});
  const busy = signal<string | null>(null);
  const error = signal<string | null>(null);
  const ready = stores.prefs.get(KEY).then((v) => {
    if (v && typeof v === "object")
      published.value = v as Record<string, PublishedNote>;
  });
  const save = () => stores.prefs.set(KEY, published.value);
  /** The published slice of a note (its descriptor id names it to the registry), or null. */
  const recordOf = (noteId: string): PublishedNote | null =>
    published.value[noteId] ?? null;

  const slugOf = (note: Note) =>
    `note-${note.id.split(":").pop()!.slice(0, 12).toLowerCase()}`;

  async function publishNote(chapterRef: string, note: Note, title: string) {
    busy.value = note.id;
    error.value = null;
    try {
      const passage = passageOf(chapterRef, note.start, note.end);
      const markdown = `# ${title}\n\n${isHtmlNote(note.note) ? noteHtmlToMarkdown(note.note) : plainToMarkdown(note.note)}`;
      const r = await backend.publishSlice({
        kind: "note",
        passage,
        title,
        slug: slugOf(note),
        markdown,
        descriptor: { "prov:wasDerivedFrom": note.id },
      });
      published.value = {
        ...published.value,
        [note.id]: {
          noteId: note.id,
          slug: slugOf(note),
          descriptorId: r.descriptorId,
          passage,
          publishedAt: new Date().toISOString(),
        },
      };
      await save();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = null;
    }
  }

  async function withdrawNote(note: Note) {
    const p = published.value[note.id];
    if (!p) return;
    busy.value = note.id;
    error.value = null;
    try {
      await backend.withdrawSlice("note", p.slug);
      const next = { ...published.value };
      delete next[note.id];
      published.value = next;
      await save();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = null;
    }
  }

  const itemLine = (it: PlaylistItem) =>
    it["@type"] === "seed:ScriptureItem"
      ? `- ${it.aboutPassage}${it.ofEdition ? ` (${it.ofEdition})` : ""}${it.note ? ` — ${it.note}` : ""}`
      : it["@type"] === "seed:HtmlItem"
        ? `- ${it.label ?? "Note"}`
        : `- [${it.label ?? it.url}](${it.url})`;

  /** A playlist or plan released to the public shelf as a slice (kind playlist / plan), indexed under its first passage. */
  async function publishWork(work: Playlist | ReadingPlan | Customization) {
    if (work["@type"] === "seed:Customization")
      return publishCustomization(work);
    const kind = work["@type"] === "seed:Playlist" ? "playlist" : "plan";
    const items: PlaylistItem[] =
      work["@type"] === "seed:Playlist"
        ? work.hasItem
        : work.hasSession.flatMap((s) => s.readings.map((r) => r.item));
    const first = items.find((it) => it["@type"] === "seed:ScriptureItem");
    const passage =
      first && first["@type"] === "seed:ScriptureItem"
        ? spanOf(first.aboutPassage).chapter
        : "GEN.1";
    const body =
      work["@type"] === "seed:Playlist"
        ? work.hasItem.map(itemLine).join("\n")
        : work.hasSession
            .map(
              (s, i) =>
                `## ${s.label ?? `Day ${i + 1}`}\n\n${s.readings.map((r) => itemLine(r.item)).join("\n")}`
            )
            .join("\n\n");
    const slug = `${kind}-${work["@id"].split(":").pop()!.slice(0, 12).toLowerCase()}`;
    busy.value = work["@id"];
    error.value = null;
    try {
      const r = await backend.publishSlice({
        kind,
        passage,
        title: work.label,
        slug,
        markdown: `# ${work.label}\n\n${work.description ? `${work.description}\n\n` : ""}${body}`,
        descriptor: { "prov:wasDerivedFrom": work["@id"], work },
      });
      published.value = {
        ...published.value,
        [work["@id"]]: {
          noteId: work["@id"],
          slug,
          descriptorId: r.descriptorId,
          passage,
          publishedAt: new Date().toISOString(),
        },
      };
      await save();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = null;
    }
  }

  async function publishCustomization(work: Customization) {
    const slug = `customization-${work["@id"].split(":").pop()!.slice(0, 12).toLowerCase()}`;
    busy.value = work["@id"];
    error.value = null;
    try {
      const r = await backend.publishSlice({
        kind: "customization",
        title: work.label,
        slug,
        markdown: `# ${work.label}\n\n${work.description ?? ""}\n\n${work.hasVariant.map((v) => `- ${v.label}${v.scheme ? ` (${v.scheme})` : ""}`).join("\n")}`,
        descriptor: { "prov:wasDerivedFrom": work["@id"], work },
      });
      published.value = {
        ...published.value,
        [work["@id"]]: {
          noteId: work["@id"],
          slug,
          descriptorId: r.descriptorId,
          passage: "",
          publishedAt: new Date().toISOString(),
        },
      };
      await save();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = null;
    }
  }

  async function withdrawWork(
    id: string,
    kind: "playlist" | "plan" | "customization"
  ) {
    const p = published.value[id];
    if (!p) return;
    busy.value = id;
    try {
      await backend.withdrawSlice(kind, p.slug);
      const next = { ...published.value };
      delete next[id];
      published.value = next;
      await save();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = null;
    }
  }

  return {
    recordOf,
    published,
    busy,
    error,
    ready,
    publishNote,
    withdrawNote,
    publishWork,
    withdrawWork,
    isPublished: (noteId: string) => noteId in published.value,
  };
}

export type Publishing = ReturnType<typeof createPublishing>;
