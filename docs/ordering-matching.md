# Ordering and Matching

> **Current production status (6 September 2026): shipped.** Migration `20260904110937_ordering_matching_questions.sql` is applied to production and Ordering/Matching are part of the merged Phase 2 frontend. Portable export has since advanced from v8 to v12. The remainder of this file preserves the original Pass 5A engineering/verification record; pre-release deployment wording and the v8 export statement describe that pass at the time it was written. See [`current-production-state.md`](current-production-state.md) for authoritative current status.

Phase 2 Pass 5A adds two text interaction types without changing existing question scoring or session progression. Migration `20260904110937_ordering_matching_questions.sql` follows Visual Pinpoint, Core Rounds and Core Team Mode. It is pending deliberate release; this pass does not apply it to production.

## Definitions and storage

Both types use 2–8 stable `{ id, label }` text items, trimmed labels of 1–120 characters, unique IDs (up to 128 characters) and case-insensitive visible uniqueness. Matching requires distinct labels within each side and unique IDs across both sides. Ordering stores `items` in `questions.type_config` and the complete `correctItemIds` permutation in `answer_key`. Matching stores `leftItems`, `rightItems` and `scoringMode` in `type_config`, and a complete bijection `correctPairs` in `answer_key`.

The migration extends the existing type constraint and patches retained save, validation, question serialisation, safe-state and answer functions. Missing retained signatures or source markers abort the migration. Existing public security wrappers, grants, scoring paths and phase transitions remain intact. New pure helpers are private. There are no new tables, subscriptions, broadcasts, per-player display rows or additional browser requests. The same public save/load/join/submission signatures continue to serve old types and old clients after the database is upgraded first.

## Safe display order

Safe serialisation sorts items by a deterministic hash of the session answer-option seed, question ID, side and item ID. Matching sides use independent seeds. PostgreSQL uses MD5 as a stable sorting hash; Demo uses a small integer hash with an avalanche step. Neither uses an answer key or authored array position. Every browser receives the already-scrambled arrays, preserving display order across polling and reconnect. Even the lower-level answer-excluding question serialiser scrambles by question ID before constructing its result.

Coincidental correct initial arrangements are allowed. Forcing the initial arrangement to be wrong would reveal the answer by inversion for two items. Changing authored order or answer keys while retaining item IDs and the seed cannot change the safe display. Tests explicitly exercise this independence in both Demo and PostgreSQL. Correct keys remain absent from SafeQuestion, and reveal keys appear only in the existing permitted reveal/leaderboard/finished phases.

## Interaction and scoring

Ordering provides pointer capture for mouse/touch dragging and visible 44-pixel Move up/down buttons. Position changes have a polite announcement. Initial display is unchosen: Lock In requires deliberate interaction, even if the display happens to be correct. Matching uses native buttons: choose an item then its partner, using taps, clicks, Enter or Space. Pair numbers communicate relationships without relying on colour. Selecting a paired item unpairs it; assigning an already-used partner removes its previous pair. Lock In requires a complete bijection. Controls are disabled while submitting and replaced by the saved-answer summary after submission.

Ordering is exact. Matching defaults to partial: `floor(basePoints × correctPairCount / totalPairCount)`, with automatic correctness only for a complete correct mapping. Invalid/incomplete payloads and extra fields are rejected before writes. Matching partial points remain fixed over time; Double Score applies to the computed base. Fully correct answers use the existing timed reduction and doubling. H2H overrides both types to binary assigned-competitor points, preserving untimed play and zero-point play-along.

The editor shows the correct order/pair rows with add, edit, remove and up/down controls. Question duplication remaps every item/reference while preserving the round; quiz duplication also remaps rounds. Presentation consumes safe item lists during questions and shows the numbered correct sequence or pairs on reveal. Player reveal shows the submitted and correct answers, restored through the existing submitted-answer cache after refresh. Private response monitoring formats submitted labels. The mobile player layout wraps Ordering controls and stacks Matching sides at narrow widths. Large item sets use denser presentation cards; only compact preview truncates long labels to two lines, while full presentation and player screens retain the complete text.

Team sessions still receive independent player answers and derive team totals from ordinary player scores. Round Intro, within-round order, leaderboard animation/commentary, Final Awards, Pinpoint and Slider retain their existing paths.

## Portable format and local verification

See [portable v8](katwed-quiz-format-v8.md). V1–v7 retain their original schemas and remain importable; all exports use v8. Team session settings are excluded.

Focused tests cover definitions/factories/duplication, strict validation, exact/partial scoring, safe-state guards and array-order independence, pointer/keyboard interactions, editor row limits, player/presentation reveals, v8/schema and legacy imports, Team/Rounds and H2H. Dedicated browser checks author, save, reload and play both types in Individual and Team sessions through Round Intro, including 320-pixel controls and mouse/touch dragging. `supabase/tests/ordering_matching_test.sql` checks 24 local Standard/Team/H2H games, 106 malformed definitions/payloads, safe serialisation, reveal gating, fixed partial points, speed and Double Score. The full migration chain and existing Pinpoint/Rounds/Team SQL regressions run on disposable PostgreSQL with real pgcrypto and local Auth/Storage/Realtime fixtures; no hosted Supabase service is contacted.

### Pass 5A validation results

- 428 focused unit/component tests passed across 31 files. No complete repository suite was run.
- Six dedicated Playwright checks passed: Individual game, Team game and eight-item layout, each on desktop Chromium and mobile Chromium. No unrelated E2E files were run.
- The full local migration chain passed on disposable PostgreSQL 17.10, including the 24 new games and 106 malformed-input checks, existing Pinpoint/Rounds/Team SQL fixtures, and 12 additional Standard/H2H Pinpoint hit/miss games.
- Type checking, lint and the production build passed. The build was local; nothing was deployed.
- Production main, the hosted database, prior migrations, v1–v7 schemas and unrelated artwork were untouched.

### Files changed in this pass

- `README.md`
- `docs/katwed-quiz-format-v8.md`
- `docs/ordering-matching.md`
- `docs/schemas/katwed-quiz-v8.schema.json`
- `src/features/game/ArrangementResult.tsx`
- `src/features/game/Arrangements.test.tsx`
- `src/features/game/PlayerAnswerReveal.tsx`
- `src/features/game/PlayerMatchingAnswer.tsx`
- `src/features/game/PlayerOrderingAnswer.tsx`
- `src/features/game/PlayerQuestion.tsx`
- `src/features/game/PlayerSubmissionSummary.tsx`
- `src/features/game/PresentationStage.tsx`
- `src/features/game/hostAnswerFormatting.ts`
- `src/features/game/hostResponses.ts`
- `src/features/questions/arrangementQuestions.test.ts`
- `src/features/questions/arrangementQuestions.ts`
- `src/features/questions/factories.ts`
- `src/features/questions/registry.ts`
- `src/features/quiz-editor/ArrangementEditor.tsx`
- `src/features/quiz-editor/duplicateQuiz.ts`
- `src/features/quiz-editor/validation.ts`
- `src/features/quiz-transfer/katwedQuizFormat.test.ts`
- `src/features/quiz-transfer/katwedQuizFormat.ts`
- `src/features/quiz-transfer/katwedQuizV7.test.ts`
- `src/features/quiz-transfer/katwedQuizV8.test.ts`
- `src/lib/demo/DemoGameRepository.test.ts`
- `src/lib/demo/DemoGameRepository.ts`
- `src/lib/demo/arrangements.test.ts`
- `src/lib/supabase/arrangementSafeState.test.ts`
- `src/lib/supabase/safeGameState.ts`
- `src/main.tsx`
- `src/routes/QuizEditorPage.tsx`
- `src/services/playerSession.arrangements.test.ts`
- `src/services/playerSession.ts`
- `src/styles/arrangement.css`
- `src/styles/backstage.css`
- `src/test/arrangementFixtures.ts`
- `src/types/domain.ts`
- `src/utils/scoring.ts`
- `supabase/migrations/20260904110937_ordering_matching_questions.sql`
- `supabase/tests/ordering_matching_test.sql`
- `tests/e2e/arrangements.spec.ts`
