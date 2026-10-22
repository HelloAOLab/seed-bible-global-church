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
  /** Publish AS an organization the reader stewards (its address): the slice lands on the organization's shelf. */
  as?: string;
}

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "slice";

type Existing = { id: string; version: number } | undefined;

/**
 * The id a slice's document gets when the agent cannot be asked what it holds: a playbook assigned before the
 * Library reads joined the corpus offers the saves but refuses `library.file.read` as unknown (the Home brings the
 * reads on its next open). A well-formed id the save supplies is kept by the Library (ap-home `upsertEntry`), so the
 * same slice re-published lands as a new version of the same document, never a twin on the shelf.
 */
export function deterministicId(folder: string, name: string): string {
  return `sb-${`${folder}/${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`.slice(0, 64);
}

const READS_NOT_OFFERED = /does not offer|unknown_tool|plan_refused/i;

async function existingId(
  agent: {
    run: <T>(
      steps: Parameters<Awaited<ReturnType<typeof agentFor>>["run"]>[0],
      message: string
    ) => Promise<{ result: T; runRef: string | null }>;
  },
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
    if (e instanceof WireRefusal && READS_NOT_OFFERED.test(e.message))
      return { id: deterministicId(folder, name), version: 0 };
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
  // A customization or a profile is not passage-scoped; everything else is.
  if (
    kind !== "customization" &&
    kind !== "profile" &&
    !isOsisRef(String(raw.passage ?? ""))
  )
    throw new WireRefusal(400, "passage must be an OSIS reference (JHN.3)");
  if (!raw.title?.trim()) throw new WireRefusal(400, "title required");
  if (!raw.markdown?.trim()) throw new WireRefusal(400, "markdown required");
  const slug = slugOf(raw.slug ?? raw.title);
  const folder = `${PUBLIC_FOLDER}/${kind}`;
  // The schema checks the fields the registry indexes and drops the rest — but the rest is the point for a
  // playlist, plan or theme (`work`: what a reader saves or applies) and its provenance. They ride along under the
  // checked fields, which always win.
  const extras = Object.fromEntries(
    Object.entries(raw.descriptor ?? {}).filter(
      ([k]) => k === "work" || k === "prov:wasDerivedFrom"
    )
  );
  const descriptor = {
    ...extras,
    ...Offering.parse({
      "@context": SEED_CONTEXT,
      ...(raw.descriptor ?? {}),
      "@id": `urn:seed:offering:${raw.as && /^0x[0-9a-f]{40}$/i.test(raw.as) ? raw.as.toLowerCase() : reader}:${kind}:${slug}`,
      "@type": "seed:Offering",
      label: raw.title.trim(),
      publishedBy:
        raw.as && /^0x[0-9a-f]{40}$/i.test(raw.as)
          ? raw.as.toLowerCase()
          : reader,
      ...(raw.passage ? { offeredForPassage: raw.passage } : {}),
      offeringKind: conceptIri("offeringkind", kind),
      visibility: conceptIri("visibility", "world"),
    }),
  };
  const person = await agentFor(env, reader);
  // AS AN ORGANIZATION: every step is addressed to the organization, asked as the reader who stewards it; the
  // descriptor names the organization as the publisher and the slice lands on ITS shelf.
  const publisher =
    raw.as && /^0x[0-9a-f]{40}$/i.test(raw.as) ? raw.as.toLowerCase() : reader;
  const agent = {
    run: <T>(steps: Parameters<typeof person.run>[0], message: string) =>
      person.run<T>(
        steps,
        message,
        publisher === reader ? {} : { addressee: publisher }
      ),
  };
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
  raw: { kind: string; slug: string; as?: string }
) {
  const kind = String(raw.kind ?? "");
  const slug = slugOf(String(raw.slug ?? ""));
  const folder = `${PUBLIC_FOLDER}/${kind}`;
  const person = await agentFor(env, reader);
  const publisher =
    raw.as && /^0x[0-9a-f]{40}$/i.test(raw.as) ? raw.as.toLowerCase() : reader;
  const agent = {
    run: <T>(steps: Parameters<typeof person.run>[0], message: string) =>
      person.run<T>(
        steps,
        message,
        publisher === reader ? {} : { addressee: publisher }
      ),
  };
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
