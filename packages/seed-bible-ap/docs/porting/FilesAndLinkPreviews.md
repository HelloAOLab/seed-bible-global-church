# Porting `UserGalleryManager`, `uploadPublicFile` and `OsManager.getLinkPreview` (files and link previews)

Source (read-only): `managers/UserGalleryManager.ts`, `OsManager.uploadPublicFile`, `OsManager.getLinkPreview`,
`PhotoChooser`, `HeroImageField`, the link item of `PlaylistItemInput`.

| It did                                                       | With                                  | Now                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| upload a public file (hero image, photo) to CasualOS records | `os.recordFile`                       | `seed.file.put` on the workspace: the bytes go to the serving plane (`PUT /files/<owner>/<sha256>.<ext>` on `seed-bible.svc`, R2 bucket `seed-bible-files`, shared upload token), content-addressed under the reader's address; served at `GET /files/…` immutable |
| the user's gallery                                           | gallery records                       | `seed:GalleryImage` works in `seed-bible/files/` (`state/library/files.ts`), device-first like the rest; the vault holds the catalog, R2 holds bytes that can be re-put (ADR-0004)                                                                                 |
| link previews                                                | `os.client.getLinkPreview` (CasualOS) | `GET /preview?url=` on the serving plane (`src/preview.ts`: Open Graph / Twitter / title, 512 KB cap, 8 s timeout, cached a day); the workspace's `seed.workspace.preview`; remembered on the device                                                               |
| the playlist's hero image and link items                     | `HeroImageField`, link item + preview | the Library pane: **Cover image** on a playlist, **Add link** (the preview names it), link cards in the player                                                                                                                                                     |

Not ported: profile photos and the photo chooser modal (profile is the Home's), image cropping, the Discover
hero thumbnails for offerings (`heroImage` is in the descriptor when a work has one).
