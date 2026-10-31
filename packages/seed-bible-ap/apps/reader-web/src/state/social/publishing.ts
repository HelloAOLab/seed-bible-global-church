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
  /** Whom to publish as: the reader (null) or an organization they steward — a device preference. */
  const publishAs = signal<{ agent: string; name: string | null } | null>(null);
  void stores.prefs.get("publish:as").then((v) => {
    if (
      v &&
      typeof v === "object" &&
      typeof (v as { agent?: unknown }).agent === "string"
    )
      publishAs.value = v as { agent: string; name: string | null };
  });
  async function setPublishAs(
    org: { agent: string; name: string | null } | null
  ) {
    publishAs.value = org;
    if (org) await stores.prefs.set("publish:as", org);
    else await stores.prefs.delete("publish:as");
  }
  const asArg = () => (publishAs.value ? { as: publishAs.value.agent } : {});
  /** The published slice of a note (its descriptor id names it to the registry), or null. */
  const recordOf = (noteId: string): PublishedNote | null =>
    published.value[noteId] ?? null;

  const slugOf = (note: Note) =>
    `note-${note.id.split(":").pop()!.slice(0, 12).toLowerCase()}`;

  /** A note's first words, plain — what a friend's Today quotes. */
  const excerptOf = (text: string) => {
    const plain = (isHtmlNote(text) ? text.replace(/<[^>]+>/g, " ") : text)
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plain.length > 240 ? `${plain.slice(0, 239).trimEnd()}…` : plain;
  };
  async function publishNote(chapterRef: string, note: Note, title: string) {
    busy.value = note.id;
    error.value = null;
    try {
      const passage = passageOf(chapterRef, note.start, note.end);
      const markdown = `# ${title}\n\n${isHtmlNote(note.note) ? noteHtmlToMarkdown(note.note) : plainToMarkdown(note.note)}`;
      const r = await backend.publishSlice({
        ...asArg(),
        kind: "note",
        passage,
        title,
        slug: slugOf(note),
        markdown,
        descriptor: {
          "prov:wasDerivedFrom": note.id,
          "schema:abstract": excerptOf(note.note),
        },
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

  /** Take one of the reader's public releases down by what the registry lists — also a copy whose note is gone (a
   *  note deleted while published, before deleting took it down). */
  async function withdrawOffering(o: { kind: string; descriptorId: string }) {
    const slug = o.descriptorId.split(":").pop() ?? "";
    if (!slug) return;
    await backend.withdrawSlice(o.kind, slug, publishAs.value?.agent);
    const next = Object.fromEntries(
      Object.entries(published.value).filter(([, p]) => p.slug !== slug)
    );
    if (Object.keys(next).length !== Object.keys(published.value).length) {
      published.value = next;
      await save();
    }
  }

  async function withdrawNote(note: Pick<Note, "id">) {
    const p = published.value[note.id];
    if (!p) return;
    busy.value = note.id;
    error.value = null;
    try {
      await backend.withdrawSlice("note", p.slug, publishAs.value?.agent);
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
        ...asArg(),
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

  /** The reader's profile released to the public shelf (kind profile, no passage): friends' Today shows it. */

  async function publishCustomization(work: Customization) {
    const slug = `customization-${work["@id"].split(":").pop()!.slice(0, 12).toLowerCase()}`;
    busy.value = work["@id"];
    error.value = null;
    try {
      const r = await backend.publishSlice({
        ...asArg(),
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
    kind: "playlist" | "plan" | "customization" | "profile"
  ) {
    const p = published.value[id];
    if (!p) return;
    busy.value = id;
    try {
      await backend.withdrawSlice(kind, p.slug, publishAs.value?.agent);
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
    withdrawOffering,
    recordOf,
    publishAs,
    setPublishAs,
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
