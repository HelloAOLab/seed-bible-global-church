# ADRs for `packages/seed-bible-ap`

Decisions local to this package. Estate-wide ADRs (e.g. ADR-0044 browser never calls MCP, ADR-0055 serving plane is rebuildable) live in ap-home and are cited, not copied.

| ADR                                                  | Title                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| [0001](./0001-only-this-folder-changes.md)           | Only `packages/seed-bible-ap` changes in this repository                   |
| 0002                                                 | One workspace package; shared code in `lib/` via tsconfig paths            |
| 0003                                                 | The browser talks only to reader-a2a's origin                              |
| 0004                                                 | The vault is the record; DO/D1/R2 are a serving plane                      |
| 0005                                                 | Live sessions: A2A control plane, Agents SDK room on the reader-a2a origin |
| [0006](./0006-chapter-buckets-and-the-vault-path.md) | Chapter buckets, manifests, and the vault path over the reader's own agent |
