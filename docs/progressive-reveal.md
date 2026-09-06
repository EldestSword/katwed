# Progressive Reveal — Phase 2 Pass 6

> **Current production status (6 September 2026): shipped.** Migration `20260904131727_progressive_reveal.sql` is applied to production and Progressive Reveal is part of the merged Phase 2 frontend. Portable export has since advanced from v10 to v12. The remainder of this file preserves the original Pass 6 engineering/verification record; pre-release deployment wording and the v10 export statement describe that pass at the time it was written. See [`current-production-state.md`](current-production-state.md) for authoritative current status.

Progressive Reveal is the saved boolean question modifier `progressiveRevealEnabled`, default false. Legacy browser definitions may omit it; factory, save and v10 export paths supply the default. It applies to Standard image questions, including Team games and Rounds. Single Choice, Multiple Select, True/False, Slider, Mash-up, Typed Answer, Ordering and Matching retain their own answer validation and correctness rules. Head-to-Head, Pinpoint and Connections reject it in editor/validation, portable import and database save/launch.

## Scoring and timing

The existing image must use blur, pixelate, tiles or zoom-out. Its reveal duration is positive, at most 180 seconds and no longer than the question timer. It has no separate scoring duration. The existing server submission path obtains `response_time_ms` after the session's shared lock; the client submits its ordinary typed answer without progress, timing or score claims.

For duration `d` in milliseconds and authoritative response time `t`:

```text
elapsed = clamp(t, 0, d)
decayed = floor(rawEarnedBase × (4d − 3 × elapsed) / (4d))
score = decayed × (doubleScore ? 2 : 1)
```

Duration converts to the nearest millisecond, with a one-millisecond minimum for positive sub-millisecond values. The TypeScript utility uses integer arithmetic; PostgreSQL uses exact numeric arithmetic. At 0/5/10/15/20 seconds, a 1000-point, 20-second reveal awards 1000/812/625/437/250. Later answers stay at 250. A raw partial score of 500 halfway through earns 312, then 624 with Double Score. Zero remains zero.

Progressive Reveal replaces ordinary Speed Scoring even if both authored flags are true. Public state reports speed scoring false. Existing Matching and Multiple Select first calculate their normal raw partial score, then apply this modifier. Mash-up still requires exactly two different people, both correct, with no partial credit. Ordinary scoring, including its existing Double Score order, remains unchanged when the modifier is off. Host Typed Answer accept/undo uses the original response time through the same formula.

Question opening, Double Score preludes, round starts, deadlines and host transitions remain unchanged. Round Intro contains no running image or points badge. Team scores continue to sum individual authoritative contributions. Leaderboard animation, commentary and awards history are untouched.

## Local rendering and spoiler protection

`QuestionMedia` takes an explicit modifier prop and reuses its existing reveal clock, effects and deterministic tile order. The separate `ProgressiveRevealPoints` component refreshes only its own display every 250 ms, stopping at the floor. It never remounts answer controls or requests state. Typed, choice, ordering, matching and slider drafts/focus survive these updates. The badge uses `aria-live="off"` to avoid repeated announcements.

Presentation, compact preview and Player respect media visibility. After submission/Lock the image continues, without an available-points badge. Answer Reveal makes the image complete immediately. Progressive images cannot open the viewer before natural completion or Answer Reveal; a question change also closes an existing viewer. Ordinary image enlargement is unchanged.

Public safe state uses “Progressively revealing question image” as alt text throughout Question and Locked, including after timed completion. This deliberately avoids needing another fetch at completion. Authored alt text returns only in existing reveal-permitted phases; private host authoring retains it. The safe-state parser rejects descriptive alt text before reveal, and the image component also supplies neutral alt while obscured. The feature is visual obscuration using the existing media URL, not encrypted media delivery.

Reduced motion uses the same elapsed-time window with discrete 0/25/50/75/100% states and no interpolated image transition. It does not reveal the complete progressive image early. Ordinary cosmetic image reveals retain their previous reduced-motion behaviour. No new animation library is added.

## Storage, traffic and compatibility

Forward migration `20260904131727_progressive_reveal.sql` adds only `questions.progressive_reveal_enabled boolean not null default false`. It patches the retained validation, save/read, submission and Typed Answer correction functions, failing if an expected predecessor is missing. Its private scoring helper is not executable by anonymous or authenticated API callers. Missing fields from old save clients become false, so a database-first release preserves existing quizzes and clients. Applied and earlier pending migrations are unchanged.

There are **zero new session columns, progress writes, play RPCs, broadcasts, subscriptions, channels, fetches or polling changes**. No progression is persisted, sent to the server or broadcast. Existing image requests, submission writes and phase signals retain their established paths. The 250 ms badge clock is local rendering only.

Portable [v10](katwed-quiz-format-v10.md) writes the explicit flag on every question. Imports 1–9 remain supported with false defaults; all nine historic schemas remain unchanged. Team/session state is excluded from portable files.

## Focused verification

Tests cover exact integer scoring, partial/Double order, ordinary speed regression, eligibility, safe alt text, all four effects, reduced motion, viewer gating, all five draft controls, media visibility, locked/reveal phases, editor save/reload and v1–v10 compatibility. Repository tests exercise early/late scores, original-time Typed Answer corrections, partial Matching, Team totals and Round Intro.

`supabase/tests/progressive_reveal_test.sql` runs in a disposable local database with the existing local Realtime recorder. It covers eight eligible types, raw partial scores, saved/default flags, private/public alt text, overrides, H2H/exclusion guards, no answer/session writes from progression, and 75 players reading existing state without new broadcasts. It rolls back. The complete local migration chain also reruns the existing Pinpoint, Rounds, Team, Ordering/Matching and Connections assertions and real PostgreSQL Connections lock-order checks.

Dedicated browser checks cover authoring/reload, early versus late scoring, two teammates, Round Intro, reduced motion, enlargement, a 320px player, 16:9 presentation and the compact controller preview. Production main, the hosted database and Netlify remain untouched; this feature and its pending predecessors await a deliberate release.

## Pass 6 results

- 524 focused unit/component tests across 38 files passed. No complete repository suite was run.
- Six dedicated Playwright checks passed across desktop and mobile Chromium: author/save/reload, Individual play and Team play. Additional focused layout assertions checked the actual visible controller frame, the points footer and locked image; presentation, preview and 320px screenshots were inspected. No unrelated browser files were executed.
- The full migration chain passed on disposable PostgreSQL 17.10 with real pgcrypto and local Auth/Storage/Realtime fixtures. All six SQL fixture files passed, including the new Progressive checks and existing Pinpoint, Rounds, Team, Ordering/Matching and Connections checks. Twelve Standard/H2H Pinpoint games and both real Connections transaction lock orders also passed.
- The 75-player Progressive fixture generated zero progression broadcasts, session changes or answers; submissions preserved session state and generated zero answer broadcasts. Existing fetch/subscription code was unchanged.
- Typecheck, lint and production build passed. Main, historical migrations, v1–v9 schemas and unrelated untracked artwork were unchanged. No PR, merge, deployment or hosted database operation was performed.

## Files changed

- `README.md`
- `docs/katwed-quiz-format-v10.md`
- `docs/progressive-reveal.md`
- `docs/schemas/katwed-quiz-v10.schema.json`
- `src/components/QuestionMedia.progressive.test.tsx`
- `src/components/QuestionMedia.tsx`
- `src/features/game/PlayerQuestion.tsx`
- `src/features/game/PresentationStage.tsx`
- `src/features/game/ProgressiveRevealPoints.tsx`
- `src/features/game/progressiveReveal.test.tsx`
- `src/features/questions/factories.ts`
- `src/features/quiz-editor/ProgressiveRevealSettings.tsx`
- `src/features/quiz-editor/validation.ts`
- `src/features/quiz-transfer/katwedQuizFormat.test.ts`
- `src/features/quiz-transfer/katwedQuizFormat.ts`
- `src/features/quiz-transfer/katwedQuizV10.test.ts`
- `src/features/quiz-transfer/katwedQuizV6Schema.test.ts`
- `src/features/quiz-transfer/katwedQuizV7.test.ts`
- `src/features/quiz-transfer/katwedQuizV8.test.ts`
- `src/features/quiz-transfer/katwedQuizV9.test.ts`
- `src/features/scoring/progressiveReveal.test.ts`
- `src/features/scoring/progressiveReveal.ts`
- `src/features/scoring/standardScoring.ts`
- `src/lib/demo/DemoGameRepository.ts`
- `src/lib/demo/progressiveReveal.test.ts`
- `src/lib/supabase/progressiveSafeState.test.ts`
- `src/lib/supabase/safeGameState.ts`
- `src/main.tsx`
- `src/routes/PlayPage.tsx`
- `src/routes/QuizEditorPage.test.tsx`
- `src/routes/QuizEditorPage.tsx`
- `src/styles/progressive-reveal.css`
- `src/test/legacyPortable.ts`
- `src/test/progressiveFixtures.ts`
- `src/types/domain.ts`
- `supabase/migrations/20260904131727_progressive_reveal.sql`
- `supabase/tests/pinpoint_targets_test.sql`
- `supabase/tests/progressive_reveal_test.sql`
- `tests/e2e/progressive-reveal.spec.ts`
