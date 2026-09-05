# Katwed portable quiz format v10

V10 adds the required boolean `progressiveRevealEnabled` to every exported question. It is a modifier, not a new question type. Exports write `formatVersion: 10`; imports accept versions 1–10. The v1–v9 schemas remain unchanged, continue rejecting unknown fields and import with the modifier defaulted to false.

The envelope remains `{ "format": "katwed-quiz", "formatVersion": 10, "quiz": ... }`. See the [v10 JSON Schema](schemas/katwed-quiz-v10.schema.json) and [v9 specification](katwed-quiz-format-v9.md) for unchanged fields, including Connections, Ordering/Matching, rounds and structured Pinpoint targets.

An enabled modifier uses the existing question and image fields:

```json
{
  "type": "typed-answer",
  "progressiveRevealEnabled": true,
  "timeLimitSeconds": 60,
  "points": 1000,
  "speedScoringEnabled": false,
  "doubleScore": false,
  "media": {
    "type": "image",
    "path": "/quiz-images/example.webp",
    "altText": "Descriptive authored text",
    "revealEffect": "tiles",
    "revealDurationSeconds": 20,
    "tileGridSize": 8
  }
}
```

This excerpt omits unchanged required question and answer fields. Enabled questions must be Standard, use an image with blur/pixelate/tiles/zoom-out and a duration greater than zero, at most 180 seconds and no longer than the question timer. Pinpoint and Connections reject the modifier, as does Head-to-Head. The importer checks duration against the timer semantically in addition to schema validation. A true speed flag remains valid authored data, but Progressive Reveal takes precedence at runtime.

The normal size limit, media-reference checks, fresh IDs, answer-key validation and create-only import flow remain in effect. Files contain definitions and authored alt text, never session progress, available points, player or Team data. See [scoring and privacy design](progressive-reveal.md).
