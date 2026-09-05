# Katwed portable quiz format v12

V12 adds the required boolean `buzzInEnabled` to every exported question. The envelope is `{ "format": "katwed-quiz", "formatVersion": 12, "quiz": ... }`. All [v11 fields](katwed-quiz-format-v11.md), question types, media, references, rounds and validation remain supported. See the [v12 JSON Schema](schemas/katwed-quiz-v12.schema.json).

Buzz-In is a Standard question modifier. It may be true for Single Choice, Multiple Select, True/False, Slider, Pinpoint, Mash-up, Typed Answer, Ordering and Matching. Wager, Speed Scoring, Double Score, Teams and Rounds remain valid combinations. Connections, Progressive Reveal and Head-to-Head require false. Unknown fields, non-booleans and missing v12 flags are rejected.

Imports accept v1–v12. Historical v1–v11 schemas remain unchanged and reject the later field; their imported questions receive `buzzInEnabled: false`. Re-export always writes v12, including false explicitly. V11 keeps its explicit version constant. Existing legacy defaults, safe media checks, fresh ID/reference remapping, file-size limit and create-only save boundary remain in effect.

Files contain quiz definitions and answer keys. They never contain the runtime winner, claim time, answer deadline, reconnect tokens, player answers, wagers, scores, Team membership, live clue progress or session records. See [Buzz-In authority and traffic](buzz-in.md).
