# Katwed Audio Language

Audio Pass 1 adds one shared game-show pack, **Katwed!**, plus **None**. Audio is an optional enhancement: Presentation remains fully understandable when muted, blocked, unavailable or configured off. Contestant phones stay silent.

## Source inventory and selection

All 17 masters are 48 kHz, 16-bit stereo WAV files. They remain unchanged under ignored `audio-source/katwed-core/` and never enter the application bundle.

| Source master | Duration | Bytes | Likely role | Relationship / decision |
|---|---:|---:|---|---|
| `Final Standings (2).wav` | 27.800 s | 5,337,772 | Final Results | Selected: earlier-labelled variant and cleaner half-second decay. |
| `Final Standings (3).wav` | 27.880 s | 5,353,132 | Final Results | Preserved alternate. |
| `Katwed! Core - Lobby 01 (1).wav` | 9.400 s | 1,804,972 | Lobby | Preserved shorter alternate. |
| `Katwed! Core - Lobby 01.wav` | 13.560 s | 2,603,692 | Lobby | Selected: clearly labelled default and longer repeat interval. |
| `Katwed! Core - Question 01 (1).wav` | 59.880 s | 11,497,132 | Question | Preserved alternate with a longer silent tail. |
| `Katwed! Core - Question 01.wav` | 59.840 s | 11,489,452 | Question | Selected: clearly labelled default and shorter tail for looping. |
| `Seamless Premium Leaderboard Music Loop For A Modern British Tv Quiz Show. Br... (1).wav` | 11.720 s | 2,250,412 | Leaderboard | Preserved shorter alternate. |
| `Seamless Premium Leaderboard Music Loop For A Modern British Tv Quiz Show. Br....wav` | 13.880 s | 2,665,132 | Leaderboard | Selected: clearly labelled default; played once, not looped. |
| `Short Premium Game-show Double Score Sting. Bright Polished Electronic Produc... (1).wav` | 9.680 s | 1,858,732 | Double Score | Preserved long alternate. |
| `Short Premium Game-show Double Score Sting. Bright Polished Electronic Produc....wav` | 10.480 s | 2,012,332 | Double Score | Preserved long default. |
| `Urgency1.wav` | 17.120 s | 3,287,212 | Urgent | Selected: first clearly numbered candidate; its useful body covers the maximum ten-second urgency window. |
| `Urgency2.wav` | 15.000 s | 2,880,172 | Urgent | Preserved alternate. |
| `Very Short Premium Game-show Double Score Sonic Sting. One Musical Impact Onl... (1).wav` | 4.920 s | 944,812 | Double Score | Preserved short alternate. |
| `Very Short Premium Game-show Double Score Sonic Sting. One Musical Impact Onl....wav` | 4.920 s | 944,812 | Double Score | Selected: clearly labelled default, trimmed for the existing visual moment. |
| `Very Short Premium Quiz-show Answer Reveal Sting. Around 2–3 Seconds Of Actua....wav` | 6.360 s | 1,221,292 | Reveal | Only candidate; selected. |
| `Very Short Premium Quiz-show Lock Sting. One Clean Decisive Electronic Punctu... (1).wav` | 4.240 s | 814,252 | Answers Locked | Selected: shorter candidate with the cleanest measured ending. |
| `Very Short Premium Quiz-show Lock Sting. One Clean Decisive Electronic Punctu....wav` | 5.160 s | 990,892 | Answers Locked | Preserved longer alternate. |

Selection is technical where the candidates provide an objective distinction; no unselected master is deleted or overwritten.

## Production pack

`npm run prepare:audio` reads the local masters and writes 48 kHz stereo, 160 kbit/s MP3 assets under `public/audio/packs/katwed/`. Set `FFMPEG_PATH` when ffmpeg is not on `PATH`. Two-pass EBU R128 normalisation targets -18 LUFS with a -1.5 dB true-peak ceiling and preserves source dynamics. One-shot cues receive a 15 ms fade-in and a 120–300 ms fade-out.

| Asset | Playback | Prepared duration | Bytes |
|---|---|---:|---:|
| `lobby.mp3` | Loop | 12.38 s | 248,310 |
| `question.mp3` | Loop | 58.68 s | 1,174,230 |
| `urgent.mp3` | Once | 17.16 s | 343,830 |
| `double-score.mp3` | Once | 1.78 s | 36,150 |
| `lock.mp3` | Once | 4.27 s | 86,070 |
| `reveal.mp3` | Once | 6.38 s | 128,310 |
| `leaderboard.mp3` | Once | 13.92 s | 279,030 |
| `final.mp3` | Once | 27.84 s | 557,430 |

The complete compressed pack is **2,853,360 bytes (2.72 MiB)**. Lobby and Question encode a 600 ms linear crossfade from the source tail into its head, then rotate the middle section after that seam. Browser looping therefore meets a deliberately blended boundary rather than an untreated fade-out. Runtime phase changes use a restrained 350 ms crossfade. Double Score is trimmed to 1.75 seconds with a 250 ms ending fade; the 1.5-second visual state is unchanged.

## Ownership and architecture

Authoritative safe game state flows through the pure phase mapper into one `GameAudioEngine`, then through the selected sound-pack registry. Only the full `/present` route constructs the engine. The Controller's compact Presentation preview and all `/play/:roomCode` contestant views remain silent.

The initial registry contains `katwed` and `none`. A future pack supplies the same eight stable cue roles; phase logic does not change. `soundPackId` belongs to the quiz definition and player-safe display metadata. Master mute, music volume (70% default) and effects volume (80% default) are local host-device preferences shared between Controller and Presentation windows through local storage.

## Phase language

- Lobby loops until the game begins.
- Question loops for the ordinary timed or untimed question bed.
- Urgent replaces Question with a 350 ms crossfade at 10 seconds remaining when the limit is over 15 seconds, or at 5 seconds for a 10–15 second limit. Questions under 10 seconds retain Question audio and visual urgency only.
- Double Score plays once during the existing server-timed introduction.
- Answers Locked stops the bed and plays Lock once.
- Reveal plays once and carries no correct/incorrect meaning.
- Leaderboard plays once and then leaves the stage silent.
- Final Results plays once for Standard results, Head-to-Head winners and draws.

One-shot event keys combine the session, current question, authoritative opening timestamp and cue. The engine plus browser storage ledger suppress Strict Mode, duplicate Realtime, rerender and reconnect replay. Re-entering a genuinely new opening produces a new key.

## Autoplay, media and failure safety

Presentation attempts playback but contains every rejected promise. If the browser blocks sound, a concise non-blocking **Enable sound** control appears in that window; gameplay continues. After successful playback, the selected pack is fetched into browser cache. Missing or undecodable files report an audio-only status and never block phase rendering or host actions.

The current YouTube component is a privacy-enhanced iframe without reliable player-state events. For Audio Pass 1, a Presentation-visible YouTube question therefore fades Katwed background music to silence for the whole question. Player-only YouTube does not affect Presentation audio. Stings remain phase-led. A future YouTube API integration may replace this conservative policy with exact duck/restore events.

Audio never carries information that is absent visually, and mute is independent of reduced-motion preference. Adding a future pack requires compressed assets for the eight cue keys, a registry entry, level/loop QA, tests and documentation; arbitrary uploads and per-question music are outside Audio Pass 1.
