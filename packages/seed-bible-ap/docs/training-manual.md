# Seed Bible on faithnet — training manual

_Last updated 2026-10-22, after the Step 4 (core reading) cuts. The app is at **https://seed-reader.faithnet.io**._

This manual is for anyone trying the new reader: what it is, how to use each feature, and which features should
work today. Every feature carries a mark:

| Mark | Meaning                                                                                |
| ---- | -------------------------------------------------------------------------------------- |
| ✅   | Working now on seed-reader.faithnet.io. If it does not, that is a bug worth reporting. |
| 🟡   | Partly there: the core works, but something named in the row is missing.               |
| ⬜   | Not built yet (the step it belongs to is in brackets). Do not report it as broken.     |

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

### 2.5 First-run consent for a brand-new person — 🟡

A person who just created a Home gets the wire from the sign-in ceremony, but their agent also needs the
**seed-reader behaviour (playbook)** assigned before it will write marks. Today a sample person has it; a new person
must assign it at their Home by hand. The reader shows the workspace's refusal in the account pane but does not yet
guide you to the Home page that fixes it. [Step 5]

### 2.6 Sign out — ✅

Account pane → **Sign out**. Device copies of your marks stay on the device; nothing is deleted.

## 3. Reading

| Feature                                              | Mark | How                                                                                                                                                                |
| ---------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Open a book and chapter                              | ✅   | Tap the **book · chapter** title in the header, or the centre of the bottom toolbar. Pick a book, then a chapter. Search box filters books.                        |
| Next / previous chapter                              | ✅   | The arrows in the bottom toolbar. Browser back/forward works too.                                                                                                  |
| Change translation                                   | ✅   | Tap the translation code in the header (e.g. **BSB**). Search by name, code or language. The chapter reloads in that translation.                                  |
| Headings, poetry, red letters, footnotes             | ✅   | As today. Tap the small **i** after a verse to read its footnote.                                                                                                  |
| Hide verse numbers / headings / footnotes / red text | ✅   | Account pane → the checkboxes under the language and size pickers.                                                                                                 |
| Text size                                            | ✅   | Account pane → **A** picker (XS–XL). Only the Scripture text scales.                                                                                               |
| Light / dark theme                                   | ✅   | The sun/moon icon in the bottom toolbar. Follows the system theme until you choose.                                                                                |
| Interface language (77 locales)                      | ✅   | Account pane → **Language**. The interface strings change; the Bible text does not.                                                                                |
| Resume where you left off                            | ✅   | Per device. (Across devices, through the Library: ⬜ Step 5.)                                                                                                      |
| Offline reading                                      | ✅   | Any chapter you have opened once opens again without a connection, marked with a small **offline pin** icon in the header. The app shell itself installs as a PWA. |
| Install as an app                                    | ✅   | Browser menu → Install / Add to Home Screen.                                                                                                                       |
| Margins, line height, UI scale, custom fonts         | ⬜   | [Step 7, customizations]                                                                                                                                           |

## 4. Marking the text

Tap a verse to select it. Tap the next or previous verse to extend the selection (or shift-click any verse). The
**verse toolbar** appears above the bottom toolbar with the reference and the actions below. Tap elsewhere to clear.

| Feature                                  | Mark | How                                                                                                                                                  |
| ---------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highlight (6 colours)                    | ✅   | Select, tap a colour swatch. The highlight is drawn as a rounded ribbon behind the text, as today. Highlighting over an older highlight replaces it. |
| Clear a highlight                        | ✅   | Select a highlighted verse → **Clear highlight**.                                                                                                    |
| Write a note                             | ✅   | Select → **Note**. The notes pane opens with the rich-text editor (bold, italic, underline, alignment). **Save** or Ctrl/Cmd+Enter.                  |
| Verse references in notes become links   | ✅   | Type "John 3:16" in a note; it turns into a link that opens that chapter and selects the verse.                                                      |
| See which verses have notes              | ✅   | A boxed verse number marks a verse with a note; tap it to jump to the note.                                                                          |
| Edit / delete a note                     | ✅   | Notes pane → **Edit** / **Delete** on the card.                                                                                                      |
| A note edited on two devices             | ✅   | Both versions are kept and the card says so; **Keep this version** settles it. A plain edit from one device never causes this.                       |
| Bookmark a chapter                       | ✅   | The bookmark icon in the chapter header toggles it.                                                                                                  |
| Save a chapter                           | ✅   | The archive icon in the chapter header toggles it.                                                                                                   |
| Save a verse range                       | ✅   | Select → **Save** in the verse toolbar.                                                                                                              |
| Bookmark names and colours, save folders | ⬜   | [later cut; needs ontology additions]                                                                                                                |
| Share a verse / copy link                | ⬜   | [Step 5]                                                                                                                                             |

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

(Highlights and notes across _all_ chapters, reading history and the heat map: ⬜ Step 5.)

## 6. Tabs and panes — ✅

The left sidebar lists your tabs (book · chapter · translation). **+** opens a new tab at the same place; the **x**
closes one. The **columns** icon in the sidebar header picks a layout: one pane, two side by side, three, 2×2, four,
or one left with two stacked right. Each pane shows one tab; tap a pane to make it the active one (the toolbar,
the URL and the panes follow the active tab). The hamburger collapses the sidebar to a rail.

Not yet: dragging the divider between panes, tabs remembered across visits, the tab strip on phones (the sidebar
hides below 720 px). ⬜

## 7. Listening — ✅

- When the translation has a recording (the BSB does), a **play** icon sits in the bottom toolbar. Playing shows the
  scrubber, pause and stop; the verse being read is underlined as it goes. Drag or tap the scrubber to move; the
  ticks mark verses, thicker ones section starts.
- When there is no recording and your browser has a voice for the language, a **Listen** icon reads the chapter aloud
  with the device's own voice instead.

Not yet: choosing between readers, auto-continue to the next chapter, the phone layout of the player. ⬜

## 8. Today, Discover and publishing

| Feature                 | Mark | How                                                                                                                                                                                                                                  |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today pane              | ✅   | The **calendar** icon in the bottom toolbar: continue reading, your recent bookmarks and saves, your friends, and what they released.                                                                                                |
| Friends                 | 🟡   | Your friends are your **contacts at your Home** (www.faithnet.me → You → contacts). The pane lists them; adding someone is done at the Home, not in the app.                                                                         |
| Publish a note          | ✅   | Notes pane → **Publish** on a note (signed in with a wire). It goes to your public shelf as a released slice; **Published** again makes it private.                                                                                  |
| Discover                | ✅   | The **compass** icon: everything released for the chapter on screen (published notes, studies, offerings). Tap one to read its text. The registry re-crawls every 15 minutes, so a fresh publish can take up to that long to appear. |
| Friends' notes in Today | ✅   | Once a contact has published something, it lists under "What your friends released"; tap to open the passage.                                                                                                                        |
| First-run help          | 🟡   | If your agent refuses because it lacks the reader behaviour, the account pane says so with a link to your Home; the assignment itself is a Home screen.                                                                              |

## 9. Reading together (live sessions)

| Feature                     | Mark | How                                                                                                                                            |
| --------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Start a session             | ✅   | The **people** icon in the bottom toolbar → **Start a session here** (signed in). You lead; the pane shows the share code and **Copy link**.   |
| Join a session              | ✅   | Open the link a host shared (sign in if asked), or paste the session id and share code in the pane. Without the code you are refused.          |
| Follow the leader           | ✅   | When the leader changes chapter, every device follows. The host can make someone else leader or navigator from the roster.                     |
| Show everyone a verse       | ✅   | Leader or decorator: select verses → **Show everyone**. They appear as outlined ribbons on every device for this session.                      |
| Who is here, and where      | ✅   | The roster shows each person's role and the verse they have selected.                                                                          |
| Chat                        | ✅   | In the pane. Kept with the session, not in your Library.                                                                                       |
| The session as a record     | ✅   | Starting a session keeps a `seed:ReadingSession` record in the host's Library (the pane shows where). The room itself keeps nothing permanent. |
| Anonymous guests, voice, QR | ⬜   | [later cuts of step 6]                                                                                                                         |

## 10. Coming next (not working yet)

| Feature                                                                | Step |
| ---------------------------------------------------------------------- | ---- |
| Profile, friends (Home contacts), invitations                          | 5    |
| Today pane: your recent reading, friends' public notes                 | 5    |
| Discover: public notes and offerings for the chapter from the registry | 5    |
| Publish a note to your public shelf from the app; share links          | 5    |
| First-run guidance to assign the seed-reader behaviour at the Home     | 5    |
| Live reading sessions, chat, presence                                  | 6    |
| Church customizations, playlists, reading plans, photos                | 7    |
| Extensions (audio reader, references, transcript, Twitch …), AI        | 8    |
| Sitemap, embed mode, onboarding tour, legal modals                     | 9    |

## 11. For testers: how to check it yourself

- **The live gate** (needs the repo): `cd packages/seed-bible-ap && A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:reader-web`
  signs in as `seedreader`, makes marks on one "device", reads them on a second, edits a note and cleans up.
  "all checks passed" means the whole path — Home → workspace → the reader's agent → Library — is up.
- **Live sessions:** `A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:session` (two devices, follow, decoration, chat, a stranger refused, the record outliving the room).
- **Unit tests:** `pnpm test` (offline flush, two-device merge, reading, tabs, audio, search, markup, SSR).
- **Is the edge render on?** `curl -sI -H "accept: text/html" https://seed-reader.faithnet.io/read/BSB/JHN/3 | grep x-sb-ssr`
  prints `x-sb-ssr: chapter`.

### What to report

Say which sample person (or your own Home) you used, the chapter, what you did, and what the account pane said
under the sync line. For a note conflict or a lost mark, the two devices and the order of edits matter.

### Known limits today

- The workspace's reply can take a few seconds (it is a run on your agent); the UI never waits on it.
- A brand-new Home person needs the seed-reader behaviour assigned at the Home before marks sync (§2.5).
- Sample people share a Library: another tester's marks may be there already.
- Phones: the sidebar is hidden; the rest works, the toolbar can be crowded on small screens.
