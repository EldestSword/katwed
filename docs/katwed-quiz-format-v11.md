# Katwed portable quiz format v11

V11 adds required boolean `wagerEnabled` to every exported question. The envelope is `{ "format": "katwed-quiz", "formatVersion": 11, "quiz": ... }`. All [v10 fields](katwed-quiz-format-v10.md), question types, media, references, rounds and validation remain supported. See the [v11 JSON Schema](schemas/katwed-quiz-v11.schema.json).

Wager is a question modifier. It may be true for every Standard question type, including combinations with Progressive Reveal, Connections, Speed Scoring and Double Score. Head-to-Head requires false. Unknown fields, non-booleans and missing v11 flags are rejected.

Imports accept v1–v11. Historical v1–v10 schemas remain unchanged and reject the later field; their imported questions receive `wagerEnabled: false`. Re-export always writes v11, including false explicitly. V10 keeps its explicit version constant. Existing legacy defaults, safe media checks, fresh ID/reference remapping, file-size limit and create-only save boundary remain in effect.

Files contain quiz definitions and answer keys, never player choices, `wagerPercent`, stakes, scores, Team settings, live clue progress or session records. See [Wager scoring and storage](wagers.md).
