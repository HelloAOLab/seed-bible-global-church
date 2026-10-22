# Seed Bible on faithnet — training manual

_Last updated 2026-10-22, after share links for published notes. Everything marked ✅ is deployed on seed-reader.faithnet.io and www.faithnet.me. The app is at **https://seed-reader.faithnet.io**._

This manual is for anyone trying the new reader: what it is, how to use each feature, and which features should
work today. Every feature carries a mark:

| Mark | Meaning                                                                                |
| ---- | -------------------------------------------------------------------------------------- |
| ✅   | Working now on seed-reader.faithnet.io. If it does not, that is a bug worth reporting. |
| 🟡   | Partly there: the core works, but something named in the row is missing.               |
| ⬜   | Not built yet (the step it belongs to is in brackets). Do not report it as broken.     |

Every table has a last column, **Why not yet · when**: for a 🟡 or ⬜ row it says what is holding the feature
back and when to expect it; for a ✅ row it is a dash. "Substrate" means the thing has to be built in the
agenticprimitives repo (the Home, the agents) first, not in this reader — those are the longest waits. The
substrate list is in §15.

## 1. What this is

Seed Bible is being rebuilt on the **agenticprimitives** substrate. The reading experience is the same one as
today's seedbible.org (the same screens, styles and text), but what you mark and keep no longer sits in a central
database. Each reader has a **Home** at **www.faithnet.me** that holds their keys and their **Library** (a file
shelf). When you highlight a verse, the reader app asks the **reader workspace** (`seed-reader.workspace`), and the
workspace asks **your own agent** to write the mark into **your** Library. Nothing of yours is stored by the app.

Three things follow from that, and they shape the manual:

- **Signing in is a Home ceremony**, not an email code. The Home mints a short-lived "ask-as-me" permission (a
  _wire_) that lets the workspace ask your agent to keep your marks. You can see and revoke it at your Home under
  Connected assistants.
- **Everything works on the device first.** Marks are kept in the browser's own database the instant you make
  them, and sent to your Library when you are signed in and online. Reading and marking work offline and while
  signed out; a stranger's marks move into their Library when they later sign in.
- **Sharing is publishing.** Your Library knows "private" and "public". To let others see a note you _publish_ it
  to your public shelf; the Seed registry indexes public slices so Discover and Today can find them (Step 5).

## 2. Getting in

### 2.1 Open the app — ✅

Go to https://seed-reader.faithnet.io. The page opens on the chapter you last read on that device, or John 1.
A chapter URL such as https://seed-reader.faithnet.io/read/BSB/JHN/3 opens straight to the chapter (the text is
already in the page before the app loads, so it reads instantly and search engines see it).

### 2.2 Reading without signing in — ✅

Everything in sections 3 to 6 works signed out. Your marks stay on this device only.

### 2.3 Sign in with your Home — ✅

Tap the **account** icon (the person) in the floating toolbar at the bottom, then **Sign in with faithnet**.
A Home window opens. The Home asks you to approve the reader and to grant the ask-as-me wire; approve both. If the
popup is blocked the page sends you to the Home and back instead.

When you return, the account pane shows your name and address, and one of two lines:

- "Your highlights, notes and bookmarks go to your Library through your own agent." — the wire is held; marks sync.
- "No wire: your marks stay on this device." followed by the Home's or the workspace's reason.

### 2.4 Sign in as a sample person — ✅

Under **Or try it as one of the Home's sample people**, pick a name (for example **Seed Reader**, handle
`seedreader`). This signs you in as that demo person with a wire, no popup. Use these for testing; their Libraries
are shared by everyone who picks them.

### 2.5 First run for a brand-new person — ✅

A person who signs in with their Home for the first time needs nothing by hand. A Home created today is born with
its agent's behaviour (the estate's person playbook, which carries the Library reads and writes the reader uses);
a Home from before playbooks existed is given it during the reader's own sign-in ceremony (the Home runs its
self-heal before handing the reader its code), and again any time the Home portal is opened. If the workspace
still refuses because the agent runs bare, the account pane says so with **Open your Home**; coming back to the
reader's tab retries by itself.

### 2.6 Sign out — ✅

Account pane → **Sign out**. Device copies of your marks stay on the device; nothing is deleted.

## 3. Reading

| Feature                                              | Mark | How                                                                                                                                                                                                                                                                                                                               | Why not yet · when |
| ---------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Open a book and chapter                              | ✅   | Tap the **book · chapter** title in the header, or the centre of the bottom toolbar. Pick a book, then a chapter. Search box filters books.                                                                                                                                                                                       | —                  |
| Next / previous chapter                              | ✅   | The arrows in the bottom toolbar. Browser back/forward works too.                                                                                                                                                                                                                                                                 | —                  |
| Change translation                                   | ✅   | Tap the translation code in the header (e.g. **BSB**). Search by name, code or language. The chapter reloads in that translation.                                                                                                                                                                                                 | —                  |
| Headings, poetry, red letters, footnotes             | ✅   | As today. Tap the small **i** after a verse to read its footnote.                                                                                                                                                                                                                                                                 | —                  |
| Hide verse numbers / headings / footnotes / red text | ✅   | Account pane → the checkboxes under the language and size pickers.                                                                                                                                                                                                                                                                | —                  |
| Text size                                            | ✅   | Account pane → **A** picker (XS–XL). Only the Scripture text scales.                                                                                                                                                                                                                                                              | —                  |
| Light / dark theme                                   | ✅   | The sun/moon icon in the bottom toolbar. Follows the system theme until you choose.                                                                                                                                                                                                                                               | —                  |
| Interface language (77 locales)                      | ✅   | Account pane → **Language**. The interface strings change; the Bible text does not.                                                                                                                                                                                                                                               | —                  |
| Resume where you left off                            | ✅   | Per device; on another device, Today → **Recent reading** lists the chapters you read anywhere, newest first, once your history has been pulled from the Library (a minute after sign-in).                                                                                                                                        | —                  |
| Offline reading                                      | ✅   | Any chapter you have opened once opens again without a connection, marked with a small **offline pin** icon in the header. The app shell itself installs as a PWA.                                                                                                                                                                | —                  |
| Reading history                                      | ✅   | A chapter that stays open about eight seconds counts as read: one event per chapter and day, on the device at once and in your Library (`seed-bible/history/<book>/<chapter>.jsonld`) when signed in. Today's **Recent reading** and the Scripture map's shading come from it.                                                    | —                  |
| Install as an app                                    | ✅   | Browser menu → Install / Add to Home Screen.                                                                                                                                                                                                                                                                                      | —                  |
| Margins, line height, UI scale, custom fonts         | ✅   | Account pane → **Line height**, **Margins**, **Interface size** (yours, on this device). A church theme can set its own defaults: fonts, a Google Fonts stylesheet, line height, column width and interface size (Library → Customizations → the text fields under the colours). Fonts load only from Google Fonts or the estate. | —                  |

## 4. Marking the text

Tap a verse to select it. Tap the next or previous verse to extend the selection (or shift-click any verse). The
**verse toolbar** appears above the bottom toolbar with the reference and the actions below. Tap elsewhere to clear.

| Feature                                  | Mark | How                                                                                                                                                                                                                                                   | Why not yet · when |
| ---------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Highlight (6 colours)                    | ✅   | Select, tap a colour swatch. The highlight is drawn as a rounded ribbon behind the text, as today. Highlighting over an older highlight replaces it.                                                                                                  | —                  |
| Clear a highlight                        | ✅   | Select a highlighted verse → **Clear highlight**.                                                                                                                                                                                                     | —                  |
| Write a note                             | ✅   | Select → **Note**. The notes pane opens with the rich-text editor (bold, italic, underline, alignment). **Save** or Ctrl/Cmd+Enter.                                                                                                                   | —                  |
| Verse references in notes become links   | ✅   | Type "John 3:16" in a note; it turns into a link that opens that chapter and selects the verse.                                                                                                                                                       | —                  |
| See which verses have notes              | ✅   | A boxed verse number marks a verse with a note; tap it to jump to the note.                                                                                                                                                                           | —                  |
| Edit / delete a note                     | ✅   | Notes pane → **Edit** / **Delete** on the card.                                                                                                                                                                                                       | —                  |
| A note edited on two devices             | ✅   | Both versions are kept and the card says so; **Keep this version** settles it. A plain edit from one device never causes this.                                                                                                                        | —                  |
| Bookmark a chapter                       | ✅   | The bookmark icon in the chapter header toggles it.                                                                                                                                                                                                   | —                  |
| Save a chapter                           | ✅   | The archive icon in the chapter header toggles it.                                                                                                                                                                                                    | —                  |
| Save a verse range                       | ✅   | Select → **Save** in the verse toolbar.                                                                                                                                                                                                               | —                  |
| Bookmark names and colours, save folders | ✅   | Your Content → the pencil on a bookmark renames it and picks a colour (the highlight colours); the pencil on a save gives it a label and a folder (type a new one or pick an existing). Saves list by folder, unfiled first. Both sync like any mark. | —                  |
| Share a verse / copy link                | ✅   | Select → **Share** in the verse toolbar: the system share sheet on a phone, else the link is copied (`…/read/BSB/JHN/3?v=16-18`). Opening it selects those verses; pasted in a chat, the preview shows the verses' text.                              | —                  |

### Where your marks go — ✅

- The instant you make a mark it is on the device (even offline, even signed out).
- Signed in with a wire and online, the app sends changed chapters to your Library a moment later — **one request
  per chapter**, however many marks you made. The account icon shows a cloud with a count while something waits;
  the account pane shows "Everything is in your Library." when done, or the error if the Library could not be
  reached (it retries when you come back online, or with **Sync now**).
- Signing in later moves marks you made as a stranger into your Library.
- Another device signed in as you sees your marks when it opens the chapter.

## 5. Your Content and search — ✅

The **books** icon in the bottom toolbar opens **Your Content**:

- **Search** at the top. Type a reference ("1 Kings 2", "John 3:16") and press Enter to open it. Type words and the
  verses containing them (in the open translation) list below; tap one to open it with the verse selected.
- **Saves** and **Bookmarks** — every one you have, newest first; tap to open, bin icon to remove.
- **Highlights** and **Notes** of the chapter on screen.

(Highlights and notes across _all_ chapters: **This chapter / All chapters** at the top of the pane. ✅ The list is what this
device holds: what you marked here plus what was pulled from your Library after sign-in.)

## 6. Tabs and panes — ✅

The left sidebar lists your tabs (book · chapter · translation). **+** opens a new tab at the same place; the **x**
closes one. The **columns** icon in the sidebar header picks a layout: one pane, two side by side, three, 2×2, four,
or one left with two stacked right. Each pane shows one tab; tap a pane to make it the active one (the toolbar,
the URL and the panes follow the active tab). The hamburger collapses the sidebar to a rail.

Tabs, the layout and which tab was selected are remembered on the device and come back on the next visit; a
chapter link opens in the selected tab. ✅ On a phone (under 720 px) the sidebar is a **drawer**: the menu icon at
the left of the bottom toolbar opens it over the reader; picking a tab closes it. On a narrow phone (under 480 px)
the actions after the chapter controls sit under **⋯ More**. ✅

Drag the divider between two panes to resize them; double-click it to reset. The widths are remembered per layout
on the device. ✅

## 7. Listening — ✅

- When the translation has a recording (the BSB does), a **play** icon sits in the bottom toolbar. Playing shows the
  scrubber, pause and stop; the verse being read is underlined as it goes. Drag or tap the scrubber to move; the
  ticks mark verses, thicker ones section starts.
- When there is no recording and your browser has a voice for the language, a **Listen** icon reads the chapter aloud
  with the device's own voice instead.

When a chapter has more than one reader, a **Reader** picker sits beside the scrubber (and in Account → Listening);
the choice carries to later chapters. Account → Listening → **When a chapter's recording ends, play the next
chapter** keeps the reading going. ✅ The player's phone layout is the same bar, under ⋯ More on narrow screens.

## 8. Today, Discover and publishing

| Feature                 | Mark | How                                                                                                                                                                                                                                                                                                                                                                     | Why not yet · when |
| ----------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Today pane              | ✅   | The **calendar** icon in the bottom toolbar: continue reading, your recent bookmarks and saves, your friends, and what they released.                                                                                                                                                                                                                                   | —                  |
| Friends                 | ✅   | Your friends are the people you and they have **added each other** as contacts (role friend) at your Home. Today lists them, shows who added you and is waiting (**Add back at your Home**), and who has not added you back yet. **Add a friend** opens your Home's Contacts; **Invite by email** sends a friend without a Home a link that signs them up and adds you. | —                  |
| Who is reading now      | ✅   | A green dot next to a friend in Today means they are here right now, with where ("reading John 3 · BSB"); tap it to open the same chapter. Only mutual friends see each other; it fades by itself a minute and a half after their tab goes quiet. The Home's Contacts page shows the same dot.                                                                          | —                  |
| Share what I am reading | ✅   | On by default while signed in. Account pane → **Let friends see what I am reading right now** turns it off (remembered on the device); signing out or closing the tab ends it at once.                                                                                                                                                                                  | —                  |
| Publish a note          | ✅   | Notes pane → **Publish** on a note (signed in with a wire). It goes to your public shelf as a released slice; **Published** again makes it private. **Copy link** on a published note gives a link that opens the verses with your note in Discover (after the registry's next crawl, up to 15 minutes).                                                                | —                  |
| Discover                | ✅   | The **compass** icon: everything released for the chapter on screen (published notes, studies, offerings). Tap one to read its text. The registry re-crawls every 15 minutes, so a fresh publish can take up to that long to appear.                                                                                                                                    | —                  |
| Friends' notes in Today | ✅   | Once a contact has published something, it lists under "What your friends released"; tap to open the passage.                                                                                                                                                                                                                                                           | —                  |
| First-run help          | ✅   | The sign-in at the Home makes sure your agent carries the reader's behaviour (§2.5). If it still refuses, the account pane names the fix and the reader retries when you come back to the tab.                                                                                                                                                                          | —                  |

## 9. Reading together (live sessions)

| Feature                     | Mark | How                                                                                                                                            | Why not yet · when                                                                                                                                        |
| --------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start a session             | ✅   | The **people** icon in the bottom toolbar → **Start a session here** (signed in). You lead; the pane shows the share code and **Copy link**.   | —                                                                                                                                                         |
| Join a session              | ✅   | Open the link a host shared (sign in if asked), or paste the session id and share code in the pane. Without the code you are refused.          | —                                                                                                                                                         |
| Follow the leader           | ✅   | When the leader changes chapter, every device follows. The host can make someone else leader or navigator from the roster.                     | —                                                                                                                                                         |
| Show everyone a verse       | ✅   | Leader or decorator: select verses → **Show everyone**. They appear as outlined ribbons on every device for this session.                      | —                                                                                                                                                         |
| Who is here, and where      | ✅   | The roster shows each person's role and the verse they have selected.                                                                          | —                                                                                                                                                         |
| Chat                        | ✅   | In the pane. Kept with the session, not in your Library.                                                                                       | —                                                                                                                                                         |
| The session as a record     | ✅   | Starting a session keeps a `seed:ReadingSession` record in the host's Library (the pane shows where). The room itself keeps nothing permanent. | —                                                                                                                                                         |
| Anonymous guests, voice, QR | ⬜   | [later cuts of step 6]                                                                                                                         | Guests need a guest identity the room can trust without a Home; voice needs a media relay. Later live-sessions cuts, after the real-app planning session. |

## 10. Playlists and reading plans

The **music-list** icon in the bottom toolbar opens the Library pane.

| Feature                             | Mark | How                                                                                                                                                                                                                                                                                                                                                                        | Why not yet · when |
| ----------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Make a playlist                     | ✅   | Playlists tab → type a title → **Create**. It starts with the passage on screen (the selected verses, or the chapter).                                                                                                                                                                                                                                                     | —                  |
| Add, reorder, remove, edit items    | ✅   | Open the playlist → **Add the passage on screen**, **Add a passage by reference** (type "John 3:16-18"), **Add a note** (the rich-text editor), or paste a link. The pencil edits an item in place: a title and note on a passage, the text of a note, a link's title and whether it embeds (YouTube and Vimeo play inside the player). Arrows reorder, the **x** removes. | —                  |
| Play a playlist                     | ✅   | **Play playlist**: the reader opens each passage in turn; **Next** / **Previous** / **Stop** in the player card.                                                                                                                                                                                                                                                           | —                  |
| Make a reading plan                 | ✅   | Reading plans tab → up to which chapter → **Create plan**: one chapter a day from the chapter on screen.                                                                                                                                                                                                                                                                   | —                  |
| Start a plan, tick readings         | ✅   | Open the plan → **Start · Daily** or **Self-paced**. The day's session is outlined; tick a reading when done. Progress syncs like a mark.                                                                                                                                                                                                                                  | —                  |
| Publish a playlist or plan          | ✅   | **Publish** on the card (signed in with a wire): it goes to your public shelf and Discover lists it under its first passage.                                                                                                                                                                                                                                               | —                  |
| Where they are kept                 | ✅   | On this device at once; in your Library when signed in (the card's **Refresh** re-reads the Library).                                                                                                                                                                                                                                                                      | —                  |
| Pictures (a playlist cover, a logo) | ✅   | Pick a picture on the card (up to 1.4 MB; a bigger one is shrunk on the device). It is kept in **your** Library as a public document and served from the serving plane; the catalog entry (`seed:GalleryImage`) names the Library document.                                                                                                                                | —                  |

## 11. Church themes (customizations)

| Feature                | Mark | How                                                                                                                                                    | Why not yet · when                                                                                                                           |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Make a customization   | ✅   | Library pane → **Customizations** → name → **Create**. Pick colours for the Light and Dark variants, a logo from a picture, the default translation.   | —                                                                                                                                            |
| Publish it             | ✅   | **Publish** on the card (signed in with a wire). It is released from **your** shelf; a church's own agent as publisher is a later step.                | —                                                                                                                                            |
| Use one                | ✅   | Account pane → **Church theme** → pick one (↻ refreshes the list). The reader takes its colours in light and dark; **None** goes back to Seed Bible's. | —                                                                                                                                            |
| Recommended extensions | ⬜   | [later]                                                                                                                                                | A church's recommended extensions wait on the org publisher (§11 open question) so a church can publish its list. Second church-library cut. |

## 12. Extensions and the study companion

Account pane → **Extensions** turns each one on or off. All four are on to start.

| Feature              | Mark | How                                                                                                                                                                                                                                                                                    | Why not yet · when |
| -------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Compare translations | ✅   | Select verses → **Compare** in the verse toolbar. The pane shows them in the open translation and others; **Add translation** picks more; a block's header switches the reader to it.                                                                                                  | —                  |
| Cross-references     | ✅   | Discover pane → **Cross-references**: related passages for the verses you selected (or the chapter's best). Tap one to open it with the verse selected.                                                                                                                                | —                  |
| Places               | ✅   | Discover pane → **Places** lists the places the chapter names; the **map** icon in the bottom toolbar opens the **Places map**: a web map with each place drawn (OpenStreetMap tiles and OpenBible.info geometry, both served through the workspace), tap a place to select its verse. | —                  |
| Study companion      | ✅   | The **flame** icon (signed in): ask about the chapter or your selection; the answer streams in and the pane says who answered (the estate's model on seed-bible.svc). It is a model, not a person; it can be wrong.                                                                    | —                  |
| Ask from a selection | ✅   | Select verses → **Ask** in the verse toolbar.                                                                                                                                                                                                                                          | —                  |

## 13. Links, embedding, first visit, about — Step 9

| Feature                      | Mark | How                                                                                                                                                                                                                       | Why not yet · when |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Chapter links with a preview | ✅   | Paste https://seed-reader.faithnet.io/read/BSB/JHN/3 into a chat or a post: the title and the first verses show as the preview (Open Graph tags are in the page).                                                         | —                  |
| Search engines               | ✅   | `/sitemap.xml` lists every chapter of the BSB; `/robots.txt` points at it; each chapter page carries a canonical link.                                                                                                    | —                  |
| Embed in another site        | ✅   | Put the reader in an iframe with `?embed=minimal` on the URL: the reader alone, no sidebar or toolbars. `?theme=dark` or `light` fixes the theme.                                                                         | —                  |
| Customization by link        | ✅   | A published theme's card has **Copy link**: `…?customization=grace-church-blue` (the title as a slug; the descriptor id works too). Opening it applies the theme.                                                         | —                  |
| First-visit card             | ✅   | On a device's first visit: what this is, **Sign in with faithnet**, **Just read**, and **Install the app** where the browser offers it. Never shown in an embed.                                                          | —                  |
| About and the legal texts    | ✅   | Tap **Seed Bible** at the top of the sidebar: the about text, how this build keeps your things, and **Terms of service**, **Privacy policy**, **Code of conduct**.                                                        | —                  |
| Scripture map                | ✅   | The **grid** icon in the sidebar header: every book as a row of chapters, the chapter on screen outlined, each chapter shaded by how many days you read it, a dot where you have a highlight or note. Tap a square to go. | —                  |

## 14. Coming next (not working yet)

| Feature                                                                | Why not yet                                                                                                                                                                                                                   | When                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Profile, friends, invitations                                          | Friends and email invitations are done (§8). A profile (a picture, a line about you) is not written anywhere yet.                                                                                                             | Profile: next social cut.                                                                           |
| Today pane: your recent reading, friends' public notes                 | Done: **Recent reading** in Today, from your reading history (one event per chapter and day, kept in your Library like a mark).                                                                                               | —                                                                                                   |
| Discover: public notes and offerings for the chapter from the registry | Done (§8).                                                                                                                                                                                                                    | —                                                                                                   |
| Publish a note to your public shelf from the app; share links          | Done: a published note's card has **Copy link** — the link opens the verses with the note shown in Discover.                                                                                                                  | —                                                                                                   |
| First-run guidance to assign the seed-reader behaviour at the Home     | **Substrate.** One-step consent at the Home (hard problem §5) is ap-home work.                                                                                                                                                | With the ap-home consent work.                                                                      |
| Live reading sessions, chat, presence                                  | Done (§9) inside the room. Presence **across** the app (who is reading now, without a session) is a substrate capability the Home should offer every app, not something this reader should build alone.                       | Sessions: now. App-wide presence: when it lands in the agenticprimitives repo.                      |
| Church customizations, playlists, reading plans, photos                | Themes, playlists and plans are done (§10, §11). Photos go to the serving plane's R2 bucket today; the plan is the Home Library's own file handling (the Home already keeps files) so a photo is in your Library like a mark. | Files through the Home Library: next church-library cut, after the Library's file API is confirmed. |
| Extensions (audio reader, references, transcript, Twitch …), AI        | Audio, references, places, compare and the companion are done (§7, §12). Transcripts and Twitch need a secret kept in your vault and an outbound allowlist on the workspace (§10 open question).                              | Last, by design, after the real-app planning session.                                               |
| Sitemap, embed mode, onboarding tour, legal modals                     | Done (§13).                                                                                                                                                                                                                   | —                                                                                                   |

## 15. What has to be built in the substrate first

These are capabilities the Home and the agents offer every app, built in ap-home (the Home and the person-agent
runtime) with their contracts in the skills repo. Four of the six are done; one-step consent and org acts remain.

| Capability                  | What the reader needs it for                                                                                                                                                                                                                                      | Where it goes                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Friends                     | **Done 2026-10-22.** `person.friend.list` on the person agent (ap-home runtime): mutual friend-role contacts, requests, requested. The reader's Today uses it.                                                                                                    | ap-home `apps/agent-runtime/src/friends.ts`; contract `skills/agentic-trust/person-friend-read` (attach to the person-steward archetype pending) |
| Invitations by email        | **Done 2026-10-22.** Home → Contacts → Invite by email; the mail goes out as you through the Worker's rail; the link signs the friend up and adds you back.                                                                                                       | ap-home `/connect/friend-invite/email`, `/invite/friend/<token>`                                                                                 |
| Presence                    | **Done 2026-10-22.** A presence object per person at the runtime; a device beats under the person's own token, mutual friends read it (`person.presence.list` for the Ask, `/presence/friends` for apps). No act, no record; it lapses on its own.                | ap-home `apps/agent-runtime/src/presence.ts`, `presence-do.ts`; contract `skills/agentic-trust/person-presence-read`                             |
| Files in the Library        | **Done 2026-10-22.** A picture goes into your own Library first (`seed-bible/files/<sha256>.<ext>`, public), then to the serving plane for pages to load; the registry's crawl re-puts any missing copy from your shelf, so the bucket is rebuildable (ADR-0004). | The Library's existing `library.file.save` with bytes; reader-a2a `seed.file.put`; `seed-bible.svc` crawl `refillImages`                         |
| One-step consent            | A brand-new person assigns the reader behaviour and mints the wire on one screen (§2.5).                                                                                                                                                                          | ap-home                                                                                                                                          |
| Org acts from the reader UI | A church publishes as itself (customizations, offerings) — the open question §11.                                                                                                                                                                                 | ap-home + the workspace: the ask-as-org wire                                                                                                     |

## 16. For testers: how to check it yourself

- **The live gate** (needs the repo): `cd packages/seed-bible-ap && A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:reader-web`
  signs in as `seedreader`, makes marks on one "device", reads them on a second, edits a note and cleans up.
  "all checks passed" means the whole path — Home → workspace → the reader's agent → Library — is up.
- **Live sessions:** `A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:session` (two devices, follow, decoration, chat, a stranger refused, the record outliving the room).
- **Unit tests:** `pnpm test` (offline flush, two-device merge, reading, tabs, audio, search, markup, SSR, social, library, files, customizations, extensions, and the cutover integration test: Open Graph, sitemap, embed).
- **Is the sitemap on?** `curl -s https://seed-reader.faithnet.io/sitemap.xml | head -3`; `curl -s https://seed-reader.faithnet.io/robots.txt`.
- **Is the edge render on?** `curl -sI -H "accept: text/html" https://seed-reader.faithnet.io/read/BSB/JHN/3 | grep x-sb-ssr`
  prints `x-sb-ssr: chapter`.

### What the app never does

It never writes to anything outside the estate. Every outside source it uses — the Bible text, search, map tiles,
place geometry, and later Twitch, transcripts or an MCP connector — is read only. What you do here changes your own
Library, the workspace, and the serving plane's copies; never a site elsewhere.

### What to report

Say which sample person (or your own Home) you used, the chapter, what you did, and what the account pane said
under the sync line. For a note conflict or a lost mark, the two devices and the order of edits matter.

### Known limits today

- The workspace's reply can take a few seconds (it is a run on your agent); the UI never waits on it.
- A brand-new Home person needs the seed-reader behaviour assigned at the Home before marks sync (§2.5).
- Sample people share a Library: another tester's marks may be there already.
- Phones: the sidebar is a drawer from the toolbar's menu icon; under 480 px the extra actions are under ⋯ More.
- Friends and presence need two people who added each other at the Home; the sample people have no friends yet, so test with two real Homes (or add a sample person back from your own Home).
- The person-steward archetype now lists the friends and presence reads, so the Home's Ask plans "who is online" by itself. A Home that has not been opened since 2026-10-22 picks up the new playbook on its next open or app sign-in.
