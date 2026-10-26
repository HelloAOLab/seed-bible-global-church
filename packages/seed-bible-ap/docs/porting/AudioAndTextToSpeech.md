# Porting `AudioPlaybackManager`, the audio reader, and `TextToSpeechManager`

Source (read-only): `managers/AudioPlaybackManager.tsx`, `components/AudioScrubber`, the audio section of
`BibleReaderToolbar`, `managers/TextToSpeechManager.tsx`.

| It did                                                              | Now                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the audio-reader extension played a reader's recording from the API | `state/media/audio.ts` — the first reader in `thisChapterAudioLinks` through an `HTMLAudioElement`; the timings file maps seconds to verses, the verse being read is marked `sb-verse-playing`                  |
| `AudioPlaybackController` driving `AudioScrubber`                   | the same controller shape; `components/reader/AudioScrubber.tsx` copied with its stylesheet                                                                                                                     |
| toolbar: scrubber, pause, stop while playing                        | the same desktop layout in `ReaderToolbar`; a Play item when a recording exists and nothing is playing                                                                                                          |
| `TextToSpeechManager` (browser `speechSynthesis`)                   | `state/media/textToSpeech.ts` copied verbatim; `listen()` speaks the chapter's verses in the translation's language (`languages.ts` maps ISO 639-3 to BCP-47) when no recording exists and a voice is installed |

No CasualOS was involved; the extension host (step 8) will let the audio-reader extension replace this built-in
player. Not ported: the mobile floating nav with the scrubber, per-reader choice, the "ends → next chapter" chain.
