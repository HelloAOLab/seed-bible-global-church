// PUBLISH A SLICE — `skill:seed/publish-slice`: the reader's decision to make a note, playlist or plan public. A plan
// over three Home skills the reader's agent already has: save the `seed:Offering` descriptor and its markdown
// rendering PUBLIC under `seed-bible/public/<kind>/`, then mint a signed release of each. The Seed registry
// (seed-bible.svc) crawls the shelf and indexes the release by passage. Withdrawal is the descriptor made private.
import {
  Offering,
  OFFERING_KINDS,
  SEED_CONTEXT,
  conceptIri,
} from "../../../../lib/seed-schema";
import {
  LIBRARY_FILE_READ,
  LIBRARY_FILE_SAVE,
  LIBRARY_FILE_PUBLISH,
  isMissing,
  publishStep,
  readStep,
  visibilityStep,
  type LibraryRead,
  type LibrarySaved,
} from "../../../../lib/library-client";
import { isOsisRef } from "../../../../lib/seed-protocol";
import { agentFor, type VaultEnv } from "./vault";
import { WireRefusal } from "../wires";

export const PUBLIC_FOLDER = "seed-bible/public";

export interface PublishArgs {
  kind: string;
  /** The OSIS passage the slice is for; a customization has none. */
  passage?: string;
  title: string;
  markdown: string;
  /** Extra descriptor fields (prov:wasDerivedFrom, …); the required ones are built here. */
  descriptor?: Record<string, unknown>;
  /** The shelf name of the slice; defaults to a slug of the title. Re-publishing the same slug is a new version. */
  slug?: string;
}

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "slice";

type Existing = { id: string; version: number } | undefined;

async function existingId(
  agent: Awaited<ReturnType<typeof agentFor>>,
  folder: string,
  name: string
): Promise<Existing> {
  try {
    const out = await agent.run<LibraryRead>(
      [readStep(folder, name)],
      `find ${folder}/${name} on my shelf`
    );
    const r = out.result;
    if (!r.read) return isMissing(r) ? undefined : undefined;
    return r.file?.id
      ? { id: r.file.id, version: Number(r.file.version ?? 1) }
      : undefined;
  } catch (e) {
    if (e instanceof WireRefusal && /no document named/i.test(e.message))
      return undefined;
    throw e;
  }
}

export async function publishSlice(
  env: VaultEnv,
  reader: string,
  raw: PublishArgs
) {
  const kind = String(raw.kind ?? "");
  if (!(OFFERING_KINDS as readonly string[]).includes(kind))
    throw new WireRefusal(
      400,
      `kind must be one of ${OFFERING_KINDS.join(", ")}`
    );
  // A customization is not passage-scoped; everything else is.
  if (kind !== "customization" && !isOsisRef(String(raw.passage ?? "")))
    throw new WireRefusal(400, "passage must be an OSIS reference (JHN.3)");
  if (!raw.title?.trim()) throw new WireRefusal(400, "title required");
  if (!raw.markdown?.trim()) throw new WireRefusal(400, "markdown required");
  const slug = slugOf(raw.slug ?? raw.title);
  const folder = `${PUBLIC_FOLDER}/${kind}`;
  const descriptor = Offering.parse({
    "@context": SEED_CONTEXT,
    ...(raw.descriptor ?? {}),
    "@id": `urn:seed:offering:${reader}:${kind}:${slug}`,
    "@type": "seed:Offering",
    label: raw.title.trim(),
    publishedBy: reader,
    ...(raw.passage ? { offeredForPassage: raw.passage } : {}),
    offeringKind: conceptIri("offeringkind", kind),
    visibility: conceptIri("visibility", "world"),
  });
  const agent = await agentFor(env, reader);
  const runRefs: string[] = [];
  const save = async (
    name: string,
    text: string,
    fileKind: "json-ld" | "md",
    contentType: string,
    existing: Existing,
    why: string
  ) => {
    const out = await agent.run<LibrarySaved>(
      [
        {
          toolId: LIBRARY_FILE_SAVE,
          args: {
            folder,
            name,
            text,
            kind: fileKind,
            contentType,
            accessPolicy: "public",
            ...(existing ? { id: existing.id } : {}),
          },
        },
      ],
      why
    );
    if (out.runRef) runRefs.push(out.runRef);
    const f = out.result.file;
    if (!out.result.saved || !f?.id)
      throw new WireRefusal(
        502,
        out.result.refused ?? `your agent did not save ${folder}/${name}`
      );
    return { id: f.id, version: Number(f.version ?? 1) };
  };
  const release = async (id: string, what: string) => {
    const out = await agent.run<{
      published?: boolean;
      release?: { releaseId?: string; version?: string; signed?: boolean };
      refused?: string;
    }>([publishStep(id)], `release ${what} on my shelf`);
    if (out.runRef) runRefs.push(out.runRef);
    if (!out.result.published)
      throw new WireRefusal(
        502,
        out.result.refused ?? `your agent did not release ${what}`
      );
    return out.result.release ?? null;
  };
  const jsonName = `${slug}.jsonld`;
  const mdName = `${slug}.md`;
  const descriptorFile = await save(
    jsonName,
    JSON.stringify({ ...descriptor, "@context": SEED_CONTEXT }),
    "json-ld",
    "application/ld+json",
    await existingId(agent, folder, jsonName),
    `publish my ${kind} "${raw.title}" for ${raw.passage}`
  );
  const markdownFile = await save(
    mdName,
    raw.markdown,
    "md",
    "text/markdown",
    await existingId(agent, folder, mdName),
    `publish the rendering of "${raw.title}"`
  );
  const descriptorRelease = await release(
    descriptorFile.id,
    `the ${kind} descriptor`
  );
  const markdownRelease = await release(
    markdownFile.id,
    `the ${kind} rendering`
  );
  return {
    published: true,
    kind,
    slug,
    passage: raw.passage,
    descriptorId: descriptor["@id"],
    descriptor: {
      ...descriptorFile,
      path: `${folder}/${jsonName}`,
      release: descriptorRelease,
    },
    markdown: {
      ...markdownFile,
      path: `${folder}/${mdName}`,
      release: markdownRelease,
    },
    runRefs,
  };
}

/** Withdraw: the descriptor (and its rendering) made private again. The registry tombstones it on its next crawl. */
export async function withdrawSlice(
  env: VaultEnv,
  reader: string,
  raw: { kind: string; slug: string }
) {
  const kind = String(raw.kind ?? "");
  const slug = slugOf(String(raw.slug ?? ""));
  const folder = `${PUBLIC_FOLDER}/${kind}`;
  const agent = await agentFor(env, reader);
  const runRefs: string[] = [];
  const made: string[] = [];
  for (const name of [`${slug}.jsonld`, `${slug}.md`]) {
    const existing = await existingId(agent, folder, name);
    if (!existing) continue;
    const out = await agent.run<{ declared?: boolean; refused?: string }>(
      [visibilityStep(existing.id, "private")],
      `take ${folder}/${name} off my public shelf`
    );
    if (out.runRef) runRefs.push(out.runRef);
    if (!out.result.declared)
      throw new WireRefusal(
        502,
        out.result.refused ?? `your agent did not withdraw ${name}`
      );
    made.push(`${folder}/${name}`);
  }
  return { withdrawn: made.length > 0, private: made, runRefs };
}

export const PUBLISH_TOOL_IDS = {
  read: LIBRARY_FILE_READ,
  save: LIBRARY_FILE_SAVE,
  publish: LIBRARY_FILE_PUBLISH,
};
