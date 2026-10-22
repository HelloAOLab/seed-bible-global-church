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

  return {
    published,
    busy,
    error,
    ready,
    publishNote,
    withdrawNote,
    isPublished: (noteId: string) => noteId in published.value,
  };
}

export type Publishing = ReturnType<typeof createPublishing>;
