# Porting `PlaylistManager` (playlists, first cut)

Source (read-only): `managers/PlaylistManager.tsx` (3,164 lines), `PlayPlaylistView`, `CreatePlaylistForm`,
`PlaylistItemInput`, `PlaylistHistoryPane`, the Playlists section of Your Content.

| It did                                                                   | With                                              | Now                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a playlist record per user (`recordName.id`), items: verse / html / link | CasualOS records                                  | `seed:Playlist` JSON-LD, one private document per playlist in `seed-bible/playlists/<id>.jsonld` (`state/library/works.ts`); items are `seed:ScriptureItem` (OSIS passage + edition), `seed:HtmlItem`, `seed:LinkItem` |
| list, create, edit, reorder, delete                                      | record CRUD                                       | `seed.work.list/read/save` on the workspace → the reader's own agent; a deleted playlist keeps its document with `deleted`                                                                                             |
| play: step through items, the reader following                           | `PlaylistReadingExtension`                        | `playlists.play/next/prev/stop`; a Scripture item opens its passage in the selected tab                                                                                                                                |
| share a playlist (public page `SharedPagePath`)                          | `publicRead` record + SSR shared page             | **Publish** → a released slice (kind `playlist`, the work in the descriptor, a Markdown rendering) on the reader's shelf, indexed under its first passage; Discover lists it                                           |
| play history, link previews, hero images                                 | records, `OsManager.getLinkPreview`, public files | **not yet** (hero images with the file lane; link previews on the svc)                                                                                                                                                 |

Device-first like marks: the device holds a copy of every work (`prefs` store) and the Library copy wins on refresh.
The old 3,164 lines were mostly the editor's unsaved-changes flows and the AI tools; neither is in this cut.
