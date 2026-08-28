# Katwed Audio Language

Katwed audio is an optional Presentation-only enhancement. Contestant phones and the Controller preview remain silent, and muted, blocked or missing audio never controls game progression.

## Eight stable roles

Every selectable production pack provides at least one variant for each role:

- `lobby` — a self-looping lobby bed;
- `question` — a self-looping question bed;
- `urgent` — the final timed-question cue;
- `double-score` — the server-timed Double Score prelude;
- `lock` — a neutral Answers Closed sting;
- `reveal` — a neutral answer-reveal sting;
- `leaderboard` — a one-shot standings cue;
- `final` — a one-shot final-results cue.

`none` is the deliberate silent special case. Katwed Core remains the original one-variant-per-role pack and retains its established five-second visual Double Score window.

## Local source import

Source audio lives under ignored `audio-source/` and is never committed. New supplier ZIPs stay directly under that folder and are preserved after import. Run:

```powershell
npm run import:audio-sources
```

The importer discovers the ZIPs actually present, derives a safe lowercase kebab-case pack ID, recognises role synonyms and common filename spelling errors, and extracts every distinct useful MP3 variant to:

```text
audio-source/<pack-id>/<role>-01.mp3
audio-source/<pack-id>/<role>-02.mp3
```

Source MP3s remain MP3. Converting lossy MP3 input to WAV would increase storage without recovering quality. The ignored `audio-source/import-report.json` records the original ZIP and filename, final clean filename, role, duration, bitrate, sample rate, channels and byte size. Unclassifiable files are reported and make the command fail rather than being guessed.

## Production preparation

With FFmpeg and FFprobe available, run:

```powershell
npm run prepare:audio
```

`FFMPEG_PATH` and `FFPROBE_PATH` may point to explicit executables. The generic pipeline scans clean source folders, rejects incomplete packs, and writes committed variants under `public/audio/packs/<pack-id>/`. It deliberately does not regenerate `audio-source/katwed-core`.

Each source receives one production encode using:

- two-pass EBU R128 normalisation at approximately −18 LUFS;
- a −1.5 dB true-peak ceiling and LRA 12;
- stereo at 48 kHz;
- `libmp3lame` VBR quality 4;
- no source metadata, chapters, comments, ID3 baggage or cover artwork.

Lobby and Question variants receive a conservative 600 ms tail-to-head crossfade and then loop the same prepared file. One-shot cues receive 15 ms click-prevention fade-ins and short fade-outs. Silence detection uses a conservative −55 dB/450 ms threshold and trims only clearly dead leading or terminal silence; reverb tails, musical decay and uncertain quiet material are preserved.

Preparation generates two committed data files:

- `src/features/audio/generatedSoundPackManifest.json` — the runtime registry source for imported packs;
- `docs/audio-pack-size-report.json` — per-pack role counts, source/production bytes, reduction, prepared Double Score durations and unusual trimming.

The current import contains 15 new packs and 244 variants. Their clean source total is 171,139,013 bytes and production total is 135,568,728 bytes, a reduction of about 20.8%. Katwed Core remains another 2,853,360 production bytes. See the generated size report for exact per-pack figures.

## Registry and Game Setup

`soundPacks.ts` combines Katwed Core, the generated manifest and `none` into one registry. Game Setup automatically renders that registry; the host chooses a musical world, never an individual track. Portable quiz format v5 remains unchanged and its optional `soundPackId` continues only as a backwards-compatible setup default.

Asset variants carry a public path and prepared duration. Game logic knows only the stable roles, pack ID and variant counts—there are no genre-specific branches. The server accepts only a bounded lowercase slug and validated Double Score duration integers; it never accepts asset URLs from a launch client.

## Per-session shuffle bags

Presentation uses an independent shuffle bag for every session, pack and role. Every variant is consumed once before that role reshuffles, with an immediate repeat across cycle boundaries avoided when more than one variant exists.

Selection is keyed to an authoritative event, not a React render. Lobby uses one selection for the room. Question uses the current question ID and authoritative opening timestamp. Urgent, Lock, Reveal, Leaderboard and Final similarly use phase event keys. Countdown updates, duplicate Realtime messages, Strict Mode, reconnect and rerender return the existing selection without consuming another bag item.

Selections and bag cursors are stored in namespaced host-device local storage. The store retains only the 20 most recently used session/pack namespaces and bounds each namespace to 512 event selections. A full Presentation refresh therefore resumes the same Lobby or Question loop. A separate session-storage played-event ledger prevents one-shot cues from replaying after refresh; choosing, deduplicating and playing remain separate responsibilities.

## Server-authoritative Double Score

Double Score is the exception to client selection. At launch, the frontend sends only the selected registered pack’s ordered prepared duration array. PostgreSQL validates 1–64 integer durations in the 500–30,000 ms range and stores no asset paths.

The session persists the duration array, a shuffled zero-based variant-index order, cursor and current index. Each genuine Double Score question transition consumes one index, persists it, looks up that exact duration, and sets:

```text
questionOpenedAt = transition + selected variant duration
questionClosesAt = questionOpenedAt + full question time
```

The selected index is exposed in safe state, so Presentation plays the matching registered file. Refresh and duplicate state reads cannot choose another sting. When the bag is exhausted the server reshuffles and avoids an immediate boundary repeat where possible. Old launch callers and existing sessions fall back to the established single 5,000 ms variant.

## Runtime behaviour

One `GameAudioEngine` exists only on `/present`. It retains the existing 350 ms music crossfades, volume and mute preferences, blocked-autoplay recovery, missing-file containment, YouTube ducking and one-shot replay protection. Presentation-visible YouTube questions silence the Katwed bed because the current iframe has no reliable playback-state API; player-only YouTube does not affect Presentation audio.

Playback ending never advances the game. Server timestamps control preludes, deadlines, submission validation and Speed Scoring.

## Adding another pack

1. Place a ZIP directly under ignored `audio-source/`, or a clean folder containing correctly named role MP3s.
2. Run `npm run import:audio-sources` for ZIP input and review the local traceability report.
3. Confirm all eight roles have at least one useful variant.
4. Run `npm run prepare:audio` and review the generated size report and Double Score durations.
5. Listen for clean loop seams, intact musical tails, consistent relative level and neutral Lock/Reveal meaning.
6. Run the registry, unit, build and browser validation suites, then commit only production output, generated metadata, code and documentation.

Adding a prepared pack does not require changes to the audio engine or a new selector implementation.
