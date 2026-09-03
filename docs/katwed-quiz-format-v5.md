# Katwed quiz portable format v5

Katwed quiz files are UTF-8 JSON documents with the filename suffix `.katwed.json`. Version 5 supports Standard and Head-to-Head quizzes, all seven question types, Standard speed scoring, Double Score, configurable tile grids, quiz-wide positional answer palettes, and a quiz-selected shared Presentation sound pack. This document describes the preserved v5 format. Visual Pinpoint Authoring exports [version 6](katwed-quiz-format-v6.md) and continues to import versions 1–5.

Exported files contain correct answers. Keep a file closed if the person importing it intends to play the quiz blind. The machine-readable companion is [`schemas/katwed-quiz-v5.schema.json`](schemas/katwed-quiz-v5.schema.json). Runtime import remains authoritative for cross-references, safe media references, theme/background compatibility, Typed Answer normalisation, and normal quiz-save validation.

## Envelope

```json
{
  "format": "katwed-quiz",
  "formatVersion": 5,
  "quiz": {
    "title": "Friday quiz",
    "quizType": "standard",
    "themeId": "katwed",
    "backgroundId": null,
    "coverImagePath": null,
    "answerPaletteId": "classic",
    "customAnswerColours": [
      "#C62828", "#1565C0", "#2E7D32", "#F9A825",
      "#7B1FA2", "#00838F", "#EF6C00", "#455A64"
    ],
    "soundPackId": "katwed",
    "competitors": [],
    "roster": [],
    "questions": []
  }
}
```

All quiz fields shown are required. `title` is 1-120 characters. `quizType` is `standard` or `head-to-head`. `themeId` and non-null `backgroundId` use the shipped controlled registries: 51 themes and exactly three owned backgrounds per theme after Visual Theme Batch 3. Runtime validation remains authoritative for the ownership pair. Cover and other image fields contain safe references only, never embedded image bytes.

Files contain no database IDs, owner, archive state, timestamps, rooms, sessions, players, submitted answers, or scores. Import is create-only: it creates fresh quiz, competitor, roster, question, and option IDs and remaps all portable references.

## Portable keys and assignments

Keys match `[A-Za-z0-9][A-Za-z0-9_-]{0,63}` and are case-sensitive. Competitor, roster, and question keys are unique within a quiz; option keys are unique within a question.

Standard quizzes have no competitors and questions use `assignedTo: null` or omit it. Head-to-Head quizzes contain exactly two differently named competitors and every question assigns one competitor key. Head-to-Head remains untimed and awards one point only for a correct answer by the assigned competitor; play-along and Skip award zero.

```json
"competitors": [
  { "key": "ross", "displayName": "Ross" },
  { "key": "jess", "displayName": "Jess" }
]
```

## Common question fields

Every question requires `key`, `type`, and `prompt`. Supported types are `single-choice`, `multiple-select`, `true-false`, `slider`, `pinpoint`, `typed-answer`, and `mashup`.

| Field | Default | Rule |
|---|---:|---|
| `supportingText` | `""` | Up to 1,000 characters |
| `timeLimitSeconds` | `30` | Integer 5-300 |
| `points` | `1000` | Integer 1-100,000; configured maximum before Double Score |
| `speedScoringEnabled` | `false` | Boolean; Standard only |
| `doubleScore` | `false` | Boolean; Standard only |
| `revealCaption` | `""` | Up to 500 characters |
| `media` | `{ "type": "none" }` | See Media |
| `mediaVisibility` | `"both"` | `presentation`, `players`, or `both` |
| `presentationChoiceVisibility` | `"show"` | `show`, `hide`, or `after-lock` |

For Head-to-Head, `speedScoringEnabled` and `doubleScore` must be omitted or `false`. True values are invalid. Versions 1 and 2 import both settings as false, preserving their historical fixed scoring.

## Standard scoring order

Katwed scores Standard questions in this order:

1. Determine the existing base score. Exact correct answers use `points`; incorrect answers use zero. Multiple Select `partial-wipeout` may produce a positive proportional base, while any selected wrong answer wipes it to zero.
2. If `doubleScore` is true, multiply the positive base score by two.
3. If `speedScoringEnabled` is true, multiply the positive result by `1 - 0.5 * clamp(responseTimeMs / availableQuestionTimeMs, 0, 1)`.
4. Floor the result to an integer.
5. Incorrect and wiped-out scores remain zero.

The speed curve runs linearly from 100% at opening to 50% at the deadline. A 1,000-point question therefore awards 1,000 immediately, 750 halfway, and 500 at the deadline. With Double Score it awards 2,000, 1,500, and 1,000 respectively. PostgreSQL calculates trusted production scores from its authoritative opening, closing, and submission timestamps.

Double Score questions use a fixed 1.5-second server-timed introduction before the question opens. That introduction does not consume question time and is not configurable in version 5.

## Positional answer palettes

Every version 5 quiz requires `answerPaletteId` and `customAnswerColours`. The palette ID is one of `classic`, `katwed`, `festive`, `tropical`, `summer`, `sports`, `arcade`, `neon`, `pastel`, `retro`, `ocean`, `forest`, `galaxy`, `sunset`, `autumn`, `winter`, `halloween`, or `custom`.

`customAnswerColours` is always an array of exactly eight uppercase six-digit hexadecimal colours matching `#[0-9A-F]{6}`. It is retained even when a preset is selected, so switching back to Custom does not discard the authored values. Options take colours by their final displayed position after the shared deterministic ordering step. True is position 1 and False is position 2. Colours 5-8 support questions with more than four choices.

Text colour is not stored in the file. Each audience surface calculates it from the chosen background using the WCAG 2.x relative-luminance contrast ratio and selects whichever of controlled near-black (`#111827`) or white (`#FFFFFF`) gives the higher contrast.

## Sound pack

Every version 5 quiz requires `soundPackId`. It may name a sound pack registered in the shipped browser manifest (for example `hard-rock`), use `katwed` for Katwed Core, or use `none` for no shared Presentation audio. Imports reject unregistered IDs, and the database persists only bounded lowercase slug IDs rather than client-provided asset URLs. Music/effects volume and master mute are local host-device preferences and are deliberately not exported. Older files without audio configuration import as `katwed`.

## Media and tile grids

No media is `{ "type": "none" }`. YouTube media uses an 11-character `videoId` and optional non-negative `startSeconds` and `endSeconds`.

Image media is:

```json
{
  "type": "image",
  "path": "https://example.invalid/image.webp",
  "altText": "A map used by the question.",
  "revealEffect": "tiles",
  "revealDurationSeconds": 12,
  "tileGridSize": 8
}
```

Reveal effects are `immediate`, `blur`, `pixelate`, `tiles`, and `zoom-out`; duration is 0-180 seconds. `tileGridSize` is permitted only for `tiles` and must be 6, 8, 12, or 16, producing 36, 64, 144, or 256 square tiles. Omission is valid and retains Katwed's legacy 24-tile, 6-by-4 layout. New authoring defaults Tiles to 8-by-8. Reveal order remains a deterministic shuffle based on the media path and authoritative question-open timestamp.

## Question-specific fields

- **Single choice:** `options` (2-8), `correctOptionKey`, and optional `randomiseOptions` (default false).
- **Multiple select:** `options` (2-8), at least two unique `correctOptionKeys`, valid `minimumSelections` and `maximumSelections`, `scoringMode` (`exact` or `partial-wipeout`), and optional `randomiseOptions`.
- **True or false:** Boolean `correctValue`.
- **Slider:** numeric `minimum`, `maximum`, positive `step`, `correctValue`, non-negative `tolerance`, plus optional `prefix`, `suffix`, and `unitLabel`.
- **Pinpoint:** image media plus normalised `targetX`, `targetY`, and positive `targetRadius`, each no greater than 1.
- **Typed answer:** `correctAnswer` plus up to 19 `acceptedAnswers`, each 1-120 characters with a Unicode letter or number. Matching uses Unicode NFKC, lower case, and letters/numbers only; it is exact, not fuzzy.
- **Mash-up:** image media and exactly two different active `correctPersonKeys`. Both are required, order is irrelevant, and partial credit is never awarded.

Options contain `key`, `label`, and optional `imagePath`/`imageAlt`. Roster entries contain `key`, unique `displayName`, `shortName`, and Boolean `active`. Correct option, competitor, and people references must resolve within the file.

## Import safety and compatibility

The dashboard limits files to 2 MB, rejects unknown fields and executable/inline media schemes, and shows only spoiler-safe metadata before confirmation. It never displays prompts or answers in that preview and never uploads images during import.

Version 1 remains documented in [`katwed-quiz-format-v1.md`](katwed-quiz-format-v1.md), version 2 in [`katwed-quiz-format-v2.md`](katwed-quiz-format-v2.md), version 3 in [`katwed-quiz-format-v3.md`](katwed-quiz-format-v3.md), and version 4 in [`katwed-quiz-format-v4.md`](katwed-quiz-format-v4.md). V1/V2 imports receive fixed scoring (`speedScoringEnabled: false`, `doubleScore: false`) and retain legacy tiles where no grid is present. V1-V3 imports receive the Classic answer palette. V1-V4 imports receive the Katwed Core sound pack. Version 5 is the only export target after this implementation.

Visual Theme Batches 1, 2 and 3 are additive controlled-ID expansions only. They do not alter the stored fields or their meaning, so exports remain version 5 rather than introducing version 6. The v1-v5 schemas are synchronised with the same 51 theme and 153 background IDs; adding valid IDs does not invalidate any historical supported file.
