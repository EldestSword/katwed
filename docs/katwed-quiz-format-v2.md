# Katwed quiz portable format v2

Katwed quiz files are UTF-8 JSON documents with the filename suffix `.katwed.json`. Version 2 supports Standard and Head-to-Head quizzes and all seven current question types: single choice, multiple select, true or false, slider, pinpoint, typed answer and mash-up. Katwed continues to import versions 1 and 2; new exports use version 3. Typed Answer requires version 2 or later.

Exported files contain correct answers. Keep a file closed if the person importing it intends to play the quiz blind.

The machine-readable companion is [`schemas/katwed-quiz-v2.schema.json`](schemas/katwed-quiz-v2.schema.json). Katwed's runtime importer remains authoritative because it also validates cross-references, theme/background compatibility and the normal quiz-save rules.

## Envelope and quiz

Every file uses this exact envelope:

```json
{
  "format": "katwed-quiz",
  "formatVersion": 2,
  "quiz": {
    "title": "Ross vs Jess",
    "quizType": "head-to-head",
    "themeId": "katwed",
    "backgroundId": null,
    "coverImagePath": null,
    "competitors": [],
    "roster": [],
    "questions": []
  }
}
```

All eight quiz fields shown above are required.

- `title` is 1–120 characters.
- `quizType` is `standard` or `head-to-head`.
- `themeId` is one of `katwed`, `midnight`, `sunset`, `arcade`, `mint` or `paper`.
- `backgroundId` is `null` for Theme default or a compatible built-in background ID.
- `coverImagePath` is `null` or a safe image reference. Image bytes are not embedded.
- `competitors` must be empty for Standard and contain exactly two entries for Head to Head.
- `roster` is the people bank used by mash-up questions and may be empty.
- `questions` is the authored question list. Array order is the play order.

Unknown fields are rejected. Lifecycle and game data such as IDs, owners, archive state, timestamps, room codes, sessions, players, answers and scores must not be included.

## Portable keys

Portable keys replace Katwed's internal database UUIDs. A key must match:

```text
[A-Za-z0-9][A-Za-z0-9_-]{0,63}
```

Keys are case-sensitive references and are never shown during play. They must be unique in their scope:

- competitor keys within the quiz;
- roster keys within the quiz;
- question keys within the quiz;
- option keys within their question.

Readable keys such as `ross`, `jess`, `person-1`, `q1` and `option-a` are recommended. Do not use database UUIDs. Import generates a new quiz record plus fresh competitor, roster, question and option UUIDs, then remaps every reference. Import is always create-only and always creates a new Active quiz, even when another quiz has the same title.

## Standard and Head to Head

Standard uses an empty competitor list and a null or omitted `assignedTo` on every question:

```json
{
  "quizType": "standard",
  "competitors": [],
  "questions": [
    {
      "key": "q1",
      "type": "true-false",
      "assignedTo": null,
      "prompt": "A group of flamingos is called a flamboyance.",
      "correctValue": true
    }
  ]
}
```

The fragment omits the other required quiz-level fields only for readability.

Head to Head requires exactly two competitors. Array order defines Competitor 1 and Competitor 2. Every question must use `assignedTo` with one of their keys:

```json
{
  "quizType": "head-to-head",
  "competitors": [
    { "key": "ross", "displayName": "Ross" },
    { "key": "jess", "displayName": "Jess" }
  ],
  "questions": [
    {
      "key": "q1",
      "type": "true-false",
      "assignedTo": "ross",
      "prompt": "Venus is the closest planet to the Sun.",
      "correctValue": false
    },
    {
      "key": "q2",
      "type": "true-false",
      "assignedTo": "jess",
      "prompt": "Mars has two moons.",
      "correctValue": true
    }
  ]
}
```

Names must be different after case-insensitive comparison and each must contain 1–30 characters. Head-to-Head live play remains untimed and awards one point only to the assigned competitor for a correct answer; stored timer and points fields remain definition metadata.

## People bank

Roster array order defines display order:

```json
{
  "key": "person-1",
  "displayName": "Jane Smith",
  "shortName": "Jane",
  "active": true
}
```

- `displayName` is required, 1–60 characters and unique case-insensitively.
- `shortName` is required and at most 30 characters; it may be empty.
- `active` is a required Boolean.

Mash-up correct-person references must resolve to exactly two different active roster entries.

## Common question fields and defaults

Every question requires `key`, `type` and `prompt`. Head-to-Head questions also require `assignedTo`; Standard questions may omit it or use `null`.

The importer supplies these defaults when the fields are omitted:

| Field | Default |
|---|---|
| `supportingText` | `""` |
| `timeLimitSeconds` | `30` |
| `points` | `1000` |
| `revealCaption` | `""` |
| `media` | `{ "type": "none" }` |
| `mediaVisibility` | `"both"` |
| `presentationChoiceVisibility` | `"show"` |

`prompt` is 1–300 characters. `timeLimitSeconds` is an integer from 5 to 300. `points` is an integer from 1 to 100,000. `revealCaption` is at most 500 characters.

Media visibility is `presentation`, `players` or `both`. Presentation choice visibility is `show`, `hide` or `after-lock`.

Correct answers, Head-to-Head assignments, slider numbers, pinpoint targets and mash-up answer pairs never receive defaults.

## Media

No media:

```json
{ "type": "none" }
```

Image media:

```json
{
  "type": "image",
  "path": "https://example.invalid/image.webp",
  "altText": "A map used by the question.",
  "revealEffect": "tiles",
  "revealDurationSeconds": 12
}
```

`revealEffect` is `immediate`, `blur`, `pixelate`, `tiles` or `zoom-out`. Reveal duration is from 0 to 180 seconds.

YouTube media:

```json
{
  "type": "youtube",
  "videoId": "abcdefghijk",
  "startSeconds": 10,
  "endSeconds": 45
}
```

The video ID is the normal 11-character YouTube ID. Start and end are optional; when both exist, end must be after start.

Version 2 stores image references only. It does not embed or upload binary files. HTTPS references and valid Katwed application paths are accepted; executable or inline schemes such as `javascript:` and `data:` are rejected. An exported file that refers to Supabase Storage or a browser-local Demo image is therefore not guaranteed to display that image in a different Katwed deployment or browser. Within the same deployment, the reference is intentionally shared and protected by Katwed's exact shared-reference deletion checks.

## Choice options

Single-choice and multiple-select options use:

```json
{
  "key": "a",
  "label": "Mars",
  "imagePath": "https://example.invalid/mars.webp",
  "imageAlt": "The planet Mars"
}
```

`key` and `label` are required. `imagePath` and `imageAlt` are optional. Between two and eight options are required. A blank label is valid only when a valid image is present.

## Single choice

```json
{
  "key": "q1",
  "type": "single-choice",
  "assignedTo": null,
  "prompt": "Which planet is known as the Red Planet?",
  "options": [
    { "key": "a", "label": "Venus" },
    { "key": "b", "label": "Mars" },
    { "key": "c", "label": "Jupiter" }
  ],
  "correctOptionKey": "b",
  "randomiseOptions": true
}
```

`correctOptionKey` is required and must reference an option in this question. `randomiseOptions` defaults to `false`.

## Multiple select

```json
{
  "key": "q2",
  "type": "multiple-select",
  "assignedTo": null,
  "prompt": "Which are primary colours of light?",
  "options": [
    { "key": "red", "label": "Red" },
    { "key": "green", "label": "Green" },
    { "key": "blue", "label": "Blue" },
    { "key": "yellow", "label": "Yellow" }
  ],
  "correctOptionKeys": ["red", "green", "blue"],
  "minimumSelections": 3,
  "maximumSelections": 3,
  "scoringMode": "exact",
  "randomiseOptions": false
}
```

Correct keys must be unique and belong to this question. At least two must be correct. Selection bounds must be valid for the option count and contain the correct-set size. `scoringMode` is `exact` or `partial-wipeout`. The latter awards proportional credit for selected correct options but any selected wrong option wipes the score to zero.

## True or false

```json
{
  "key": "q3",
  "type": "true-false",
  "assignedTo": null,
  "prompt": "A group of flamingos is called a flamboyance.",
  "correctValue": true
}
```

`correctValue` is a required JSON Boolean, not the string `"true"` or `"false"`.

## Slider

```json
{
  "key": "q4",
  "type": "slider",
  "assignedTo": null,
  "prompt": "How many minutes are in a day?",
  "minimum": 0,
  "maximum": 2000,
  "step": 10,
  "correctValue": 1440,
  "tolerance": 10,
  "prefix": "",
  "suffix": "",
  "unitLabel": "minutes"
}
```

Minimum must be below maximum. Step must be positive and no larger than the range. The answer must be inside the range and tolerance cannot be negative. `prefix`, `suffix` and `unitLabel` default to empty strings.

## Pinpoint

```json
{
  "key": "q5",
  "type": "pinpoint",
  "assignedTo": null,
  "prompt": "Pinpoint London on the map.",
  "media": {
    "type": "image",
    "path": "https://example.invalid/map.webp",
    "altText": "A map of the United Kingdom.",
    "revealEffect": "immediate",
    "revealDurationSeconds": 0
  },
  "targetX": 0.62,
  "targetY": 0.74,
  "targetRadius": 0.05
}
```

Pinpoint requires image media. `targetX` and `targetY` are normalised from 0 to 1. `targetRadius` is greater than 0 and no more than 1.

## Typed answer

```json
{
  "key": "q6",
  "type": "typed-answer",
  "assignedTo": null,
  "prompt": "Name the television programme.",
  "correctAnswer": "Red Dwarf",
  "acceptedAnswers": ["The Red Dwarf"]
}
```

`correctAnswer` is the required primary answer shown at reveal. `acceptedAnswers` is a required array containing up to 19 alternatives. Every answer must contain 1–120 characters and at least one Unicode letter or number. Answers must be unique after Katwed normalises Unicode with NFKC, converts to lower case and removes whitespace, punctuation, apostrophes, hyphens and every other non-letter/non-number character. Matching is exact after that normalisation; it is not fuzzy and does not correct spelling. Alternative answers are part of the secret answer key and are never sent to player-safe state or reveal payloads.

## Mash-up

```json
{
  "key": "q7",
  "type": "mashup",
  "assignedTo": null,
  "prompt": "Who is in this mash-up?",
  "media": {
    "type": "image",
    "path": "https://example.invalid/mashup.webp",
    "altText": "A merged portrait.",
    "revealEffect": "immediate",
    "revealDurationSeconds": 0
  },
  "correctPersonKeys": ["person-2", "person-5"]
}
```

Mash-up requires image media and exactly two different active roster keys. Both people are required, order is irrelevant and partial credit is never awarded.

## Background IDs

Use `null` for Theme default. A non-null ID must belong to the selected theme:

- `katwed`: `katwed-bubbles`, `katwed-confetti`, `katwed-ribbons`;
- `midnight`: `midnight-aurora`, `midnight-glow`, `midnight-stars`;
- `sunset`: `sunset-horizon`, `sunset-lights`, `sunset-ribbons`;
- `arcade`: `arcade-circuit`, `arcade-grid`, `arcade-neon`;
- `mint`: `mint-depth`, `mint-shapes`, `mint-waves`;
- `paper`: `paper-collage`, `paper-geometry`, `paper-notebook`.

Katwed rejects an unknown or wrong-theme explicit background rather than silently changing it.

## Import behaviour and safety

The dashboard accepts files up to 2 MB. It parses local JSON as untrusted data, rejects unknown structure and references, remaps portable keys to new UUIDs, then runs the normal Katwed quiz validation before saving through the existing repository boundary. No image upload occurs.

Before confirmation, the dashboard shows only spoiler-safe metadata: title, quiz type, question count, Head-to-Head competitor names, appearance and whether image references are present. It does not render prompts, options, correct answers, reveal captions, slider values, pinpoint coordinates or mash-up answers. A successful import remains on the dashboard and never opens the editor automatically.

Imported quizzes contain no archive state, room, sessions, players, submitted answers, scores or timestamps from the file. The ordinary persistence layer supplies new lifecycle timestamps. Import never overwrites or merges with an existing quiz.
