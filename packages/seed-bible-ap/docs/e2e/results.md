# Flow results — 2026-10-22 17:43 UTC — https://seed-reader.faithnet.io

| Flow | Feature | Mark | What was checked | Result |
| --- | --- | --- | --- | --- |
| R1 | Open a chapter | ✅ | /read/BSB/JHN/3 is rendered on the edge (verse 16 in the HTML) and the app takes over without clearing it | edge-rendered, then live; header "John3" |
| R2 | Next / previous chapter | ✅ | The toolbar arrows move to John 4 and back; the URL follows | John 3 → 4 → 3, and browser back → 4 |
| R3 | Pick a book and chapter | ✅ | Tap the header title, search 'Psalms', pick the book and chapter 23; the chapter opens | Psalm 23 opened from the selector |
| R4 | Change translation | ✅ | Tap the translation code, choose another (search 'World English'), the header shows the new code | switched to AAB Accessible Ancients Bible English |
| R5 | Share link selects verses | ✅ | ?v=16-18 opens with John 3:16–18 selected and the verse toolbar naming them | toolbar "John 3:16–18", 3 verses selected |
| R6 | Embed and theme parameters | ✅ | ?embed=minimal hides the sidebar and toolbars; ?theme=dark applies the dark theme | embed hides the chrome; data-sb-theme="dark" |
| R7 | Light / dark theme toggle | ✅ | The Themes button in the toolbar flips the theme marker | data-sb-theme "light" → "dark" |
| R8 | Text size | ✅ | Account pane → size XL; the reader carries sb-font-size-xl | reader class sb-font-size-xl |
| R9 | Interface language | ✅ | Account pane → Language → français; the sidebar heading changes from 'Tabs' | "menu Seed Bible grid…" → "menu Seed Bible grid…" |
| R10 | Tabs | ✅ | New tab adds a second tab on the same chapter; closing it leaves one | tabs 1 → 2 → 1 |
| M1 | Highlight and clear | ✅ | Select 3:16, tap a colour → a ribbon appears; select again → Clear highlight → gone | ribbon drawn, then cleared |
| M2 | Write, edit and delete a note | ✅ | Select 3:16 → Note → type → Save → the card lists it; Edit changes it; Delete removes it | created, edited, deleted; the pane counts 0 notes |
| M3 | Bookmark and save a chapter; see them in Your Content | ✅ | Header bookmark and archive icons toggle; Your Content → All chapters lists John 3 under both | John 3 listed under bookmarks and saves |
| M4 | Share a verse (copy link) | ✅ | Select 3:16 → Share copies a link ending in ?v=16 | https://seed-reader.faithnet.io/read/BSB/JHN/3?v=16 |
| M5 | Save a verse range | ✅ | Select 3:15–16 → Save in the verse toolbar; Your Content lists John 3:15–16 | John 3:15–16 saved |
| C1 | Search verses | ✅ | Your Content → search 'so loved the world' → John 3:16 among the results | John 3:16 found |
| S1 | Discover for a chapter | ✅ | The Discover pane opens for John 3 and lists what was published (or says nothing yet) without an error | Discover · John 3 refresh close Nothing released for this chapter yet. Publish one of your notes to  |
| S2 | Today, signed out | ✅ | The Today pane opens and asks for sign-in rather than failing | Today close CONTINUE WHERE YOU LEFT OFF menu_book John 3 · BSB Bookmarks No bookmarks yet. Saves No  |
| X1 | Places map | ✅ | On Genesis 12 the Places map pane shows a Leaflet map with at least one place marker | map with 6 marker(s) |
| X2 | Compare translations | ✅ | Select 3:16 → Compare in the verse toolbar; the pane shows the verse in other translations | Compare close John 3:16 add Add translation BSB Berean Standard Bible 16 For God |
| A1 | Sign in as a sample person, mark, sync, sign out | ✅ | Account pane → a sample person → the chip shows their name; a highlight reaches the Library ('Everything is in your Library'); Sign out clears the chip | signed in as Seed Reader; the highlight reached the Library; signed out |
| L1 | Start a session; a guest joins and follows | ✅ | Signed in: Start a session → share code; a second browser joins as a guest with id and code; the host moves to John 4 and the guest follows | code B79ZTX; the guest followed to John 4 |
