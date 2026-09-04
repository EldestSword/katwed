# Katwed quiz format v8

V8 is the current export format on the Phase 2 development branch. It inherits every v7 field, including Rounds, structured Pinpoint targets, themes/backgrounds, palettes, sound, media, scoring and H2H assignments. See the [v8 JSON Schema](schemas/katwed-quiz-v8.schema.json) and the [v7 reference](katwed-quiz-format-v7.md) for inherited fields.

Imports accept versions 1–8; re-export always writes v8. The v1–v7 schemas and meanings are unchanged. Legacy Pinpoint circles still become equivalent structured circles, and versions before v7 receive a silent default round. Team settings, memberships and scores belong to sessions and are never portable quiz fields.

## Ordering

```json
{
  "key": "q1", "roundKey": "round-1", "type": "ordering",
  "prompt": "Put these events in chronological order",
  "items": [
    { "key": "item-1", "label": "Apollo 11 lands" },
    { "key": "item-2", "label": "World War II ends" },
    { "key": "item-3", "label": "The Berlin Wall falls" }
  ],
  "correctItemKeys": ["item-2", "item-1", "item-3"]
}
```

Use 2–8 text items. Keys must be unique; labels are trimmed, 1–120 characters and unique ignoring case and surrounding whitespace. `correctItemKeys` is a complete permutation of item keys, independent from `items` array order. Scoring is exact: full base points only for the complete correct sequence.

## Matching

```json
{
  "key": "q2", "roundKey": "round-1", "type": "matching",
  "prompt": "Match the film to its director",
  "leftItems": [{ "key": "left-1", "label": "Jaws" }, { "key": "left-2", "label": "Alien" }],
  "rightItems": [{ "key": "right-1", "label": "Ridley Scott" }, { "key": "right-2", "label": "Steven Spielberg" }],
  "correctPairs": [{ "leftKey": "left-1", "rightKey": "right-2" }, { "leftKey": "left-2", "rightKey": "right-1" }],
  "scoringMode": "partial"
}
```

Use 2–8 items on each side, with equal lengths. Keys must be unique across both sides. Labels follow Ordering's limits, with visible uniqueness required within each side. Every left and right key must appear in exactly one correct pair. `scoringMode` is required and must be `exact` or `partial`; the editor defaults new Matching questions to `partial`.

Partial base points are `floor(points × correct pairs / total pairs)`. All correct earns full base points and is the only automatically correct result. Incomplete or invalid submissions are rejected. A valid, partially correct answer retains fixed proportional points; Double Score doubles those points. Fully correct answers use the existing speed reduction from 100% to 50% and Double Score. H2H always awards exactly 1 point to the assigned competitor for a fully correct answer, otherwise 0; play-along earns 0.

## Validation and identity

Item objects permit only `key` and `label`; matching pair objects permit only `leftKey` and `rightKey`. Unknown fields, duplicate/unknown references and incomplete mappings are rejected by the importer. Cross-reference completeness and case-insensitive label uniqueness are enforced by runtime validation, beyond structural JSON Schema checks. New types require v8. Imported quiz, round, question and item identities become fresh UUIDs with all answer references remapped. Items do not support images in this pass.

These files deliberately contain correct answers and belong with the host. The game server produces a separate safe display order; portable array positions are never passed through as the player display order.
