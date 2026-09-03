# Katwed quiz format v7

Version 7 is the export target for Core Rounds. It retains [v6 Pinpoint targets](katwed-quiz-format-v6.md), scoring, media, themes, palettes and audio, and adds portable round structure. The [v7 JSON Schema](schemas/katwed-quiz-v7.schema.json) describes the complete file.

`quiz.rounds` is a required, non-empty array. Each entry contains exactly:

```json
{
  "key": "round-1",
  "title": "Picture round",
  "subtitle": "Look closely",
  "introEnabled": true
}
```

Round keys use the same 1–64 character file-local key syntax as questions and people. Keys must be unique within the rounds array. Titles contain 1–80 characters and cannot be blank; subtitles contain up to 200 characters, with `""` for no subtitle. `introEnabled` must be Boolean. No database IDs, per-round scoring, timers or theme configuration are accepted.

Every question includes a required `roundKey` referencing one of these keys. Round-array order defines round order. Question-array order defines the order **within** each round; interleaved input is grouped by round on save/export. Exports write grouped questions with global `q1`, `q2`, … keys and `round-1`, `round-2`, … keys. Import remaps all round IDs and question references to fresh identities. Duplicate keys, missing/unknown round references, unsupported fields and malformed metadata reject the whole import. Application/database checks enforce reference integrity beyond JSON Schema validation.

Head-to-Head has exactly one structural round. Its competitors retain control of untimed play; the Standard round intro setting has no effect on that flow. Standard quizzes can contain several rounds. Empty rounds may be saved as drafts, but every round needs a question before launching.

Versions **1–6 remain importable** and receive one generated `Round 1`, empty subtitle and `introEnabled: false`. Their question order is unchanged. V6 circle, rectangle and polygon target objects survive exactly; v1–v5 legacy Pinpoint coordinates still become equivalent circles. Re-export writes version 7. The v1–v6 schemas remain unchanged for existing generators.

Round intros are host-controlled waiting screens. They do not contain a live question, answer key, timer or leaderboard. Starting a round opens its first question through the existing question-prelude and deadline logic. Session question shuffle changes only the order within each round; round order stays authored. Global question numbering and deliberate final-results reveal remain unchanged.

The matching forward migration is `20260903221013_core_rounds.sql`, after `20260903203203_visual_pinpoint_targets.sql`. Both require deliberate release before the matching frontend. This feature does not apply production migrations or deploy the site.
