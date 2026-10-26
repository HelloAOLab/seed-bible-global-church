// `bucket_merge` — the item-level merge of two chapter buckets (skill:seed/bucket-merge), as a pure tool: no vault,
// no principal. reader-a2a hands it the reader's current bucket and a device's incoming one and gets the merged
// document and a report; the same function lives in lib/library-client, which is the one place the rule is written.
import {
  mergeBuckets,
  parseBucket,
  type Collection,
} from "../../../../lib/library-client";

export const BUCKET_MERGE_TOOL = {
  name: "bucket_merge",
  description:
    "Merges two Seed Bible chapter buckets at the item level: keyed by @id; a replayed opId is kept; the later updatedAt wins; a note whose body differs on both sides is kept twice and flagged conflictOf. Pure: reads nothing, writes nothing.",
  inputSchema: {
    type: "object",
    properties: {
      collection: {
        type: "string",
        enum: ["highlights", "annotations", "bookmarks", "saves"],
      },
      chapter: {
        type: "string",
        description: "OSIS chapter for highlights/annotations (JHN.3)",
      },
      current: {
        type: "object",
        description: "The reader's bucket as the Library holds it",
      },
      incoming: { type: "object", description: "The device's bucket" },
    },
    required: ["collection", "current", "incoming"],
  },
} as const;

export function bucketMerge(args: {
  collection: Collection;
  chapter?: string;
  current: unknown;
  incoming: unknown;
}) {
  const current = parseBucket(
    JSON.stringify(args.current),
    args.collection,
    args.chapter
  );
  const incoming = parseBucket(
    JSON.stringify(args.incoming),
    args.collection,
    args.chapter
  );
  return mergeBuckets(current, incoming);
}
