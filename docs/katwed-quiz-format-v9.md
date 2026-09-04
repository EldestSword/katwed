# Katwed portable quiz format v9

V9 adds Standard-only Connections. All exports now write `formatVersion: 9`; imports accept versions 1–9. The v1–v8 schemas and formats remain unchanged. V8 Ordering/Matching, v7 round references, v6 Pinpoint targets, media paths, themes, palettes and sound keep their existing meanings. Team settings and live clue progress belong to sessions and never appear in portable files.

The envelope remains `{ "format": "katwed-quiz", "formatVersion": 9, "quiz": ... }`. See the [v9 JSON Schema](schemas/katwed-quiz-v9.schema.json) and [v8 specification](katwed-quiz-format-v8.md) for the unchanged fields.

A Connections question uses the normal question fields, plus:

```json
{
  "type": "connections",
  "clues": [
    { "key": "clue-1", "text": "Mercury" },
    { "key": "clue-2", "text": "Venus" },
    { "key": "clue-3", "text": "Earth" },
    { "key": "clue-4", "text": "Mars" }
  ],
  "correctAnswer": "Planets",
  "acceptedAnswers": ["Planets of the solar system"],
  "points": 1000,
  "speedScoringEnabled": false,
  "doubleScore": false
}
```

This excerpt omits the unchanged required base fields. Clues have 2–6 ordered, unique file-local keys. Text is trimmed, 1–200 characters, and distinct ignoring case. Key identity and authored order survive a round trip; imports replace keys with fresh UUIDs and exports assign deterministic `clue-1`, `clue-2`, etc. within each question.

The primary connection and up to 19 alternatives use Typed Answer's existing 120-character limit and exact Unicode NFKC/lowercase/letters-and-numbers normalisation. Every variant must be meaningful and distinct after normalisation. The importer performs these semantic checks in addition to structural schema validation. Unknown clue fields, future/live progress fields and Head-to-Head Connections are rejected. Speed scoring is forced off; Double Score remains available.

Import still uses the existing file-size limit, safe media-reference checks, fresh question/round identities and create-only save flow. Versions 1–6 receive their existing silent default round and legacy Pinpoint conversion; versions 7–8 retain authored round references. Re-exporting any supported version produces v9.
