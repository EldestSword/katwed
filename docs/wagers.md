# Wagers — Phase 2 Pass 7A

`wagerEnabled` is an optional boolean on the browser's QuestionBase (missing means false), explicitly false in factories and explicit in saved/v11 portable data. It is a question modifier for all ten Standard types, including Teams and Rounds. Duplication and moves preserve it. Head-to-Head offers no editor control and rejects enabled flags on conversion, import, save and launch.

## Scoring

`WagerPercent = 0 | 25 | 50 | 100`. Stake is exactly `floor(question.points × percent / 100)`, using integer arithmetic in TypeScript and PostgreSQL. At 999 base points the choices are 0/249/499/999. The authored base value always determines the stake.

The underlying type calculates its ordinary raw score and full `correct` Boolean. Existing scoring order is preserved: ordinary Speed Scoring doubles first, then applies its existing timed floor; Progressive Reveal floors the raw positive score before Double; Connections floors its clue-stage score before Double and ignores Speed. Matching partial points retain their existing Speed exclusion, while Progressive may reduce them. Wager runs last: full correct adds the stake, anything else subtracts it. Partial Matching and Multiple Select therefore lose the wager; Mash-up remains exact pair with no partial credit.

Examples: ordinary 820 plus a 500 stake earns 1320; wrong zero minus 500 earns −500; Progressive 625 doubled plus 500 earns 1750; partial 250 minus 1000 earns −750. Scores and player/Team totals may be negative. Sorting, signed score animation, podium and deterministic commentary keep their existing behaviour. Correct-answer counts, response-time totals and Final Awards remain correctness-based.

## One authoritative transaction

Forward migration `20260904141715_wagers.sql` adds `questions.wager_enabled boolean not null default false` and `player_answers.wager_percent smallint not null default 0`, constrained to the four allowed values. It changes only the constraints preventing negative awarded/player totals; an ordinary zero-wager answer still cannot store negative awarded points. There is no stored stake or Team total.

The retained Standard submission function acquires its existing locks and checks session, token and deadline before extracting the optional numeric `wagerPercent`. Missing means zero; nonzero on a disabled question is rejected. Strings, nulls, fractions and unsupported percentages are rejected. Only wager metadata is removed before exact core payload and existing type validation. Ordinary scoring and final adjustment feed the existing single answer insert and player total update. The stored core payload contains no wager metadata. Internal integer helpers are revoked from public/anon/authenticated callers. Patches fail loudly if their expected predecessor is absent; existing RPC signatures, owner checks, RLS and locks remain intact.

Typed Answer host accept/undo uses original response time, current ordinary scoring rules and persisted percentage, then updates totals and correctness metrics by the existing delta. A wrong 50% wager can move −500 → 1500 → −500, or use the original Progressive/Speed value. Wager is never editable by the host.

Defaults preserve old definitions, rows and payloads for a database-first release. No earlier migration is modified. Local verification uses disposable PostgreSQL; the hosted database and production deployment remain untouched.

## Three screens and traffic

Player radios default to No wager. They have native keyboard/checked semantics, wrap at 320px and remain independent of answer drafts and Progressive timing. Same-question polls/clue changes preserve selection; a new question/opening resets it. Round Intro has no controls. The choice travels only with Lock in. Existing submitted-answer local storage validates and restores the percentage; unsent choices are not persisted.

Locked and Reveal summaries show the submitted stake without inventing a wager outcome. Progressive points remain ordinary available points; the wager is labelled separately as a possible gain/loss. Shared Presentation shows only “Wager question · Up to … pts at risk”, including compact preview. Private current-question response metadata carries submitted percentages; the controller derives the stake, even when raw answer details are bounded. Other players' choices never enter safe state.

There are zero new broadcasts, subscriptions, channels, safe-state fetches, polling, preliminary RPCs, session selection writes, answer writes or Team aggregation writes. Team totals continue to derive from authoritative individual scores. [Portable v11](katwed-quiz-format-v11.md) includes only the authored flag; v1–v10 remain importable with false defaults.

## Focused verification

Wager utility, scoring, validation, local persistence, editor, player, presentation, private host, negative animation, Team/Round and portable tests cover the modifier and directly affected systems. Dedicated Wager browser checks cover authoring, correct/lost stakes, negative totals, refresh, Round Intro, keyboard/320px, Progressive, Connections, Teams and compact/16:9 layouts. No complete unit or browser suite is run.

`supabase/tests/wagers_test.sql` exercises strict server metadata, old-client defaults, negative scores, original-time accept/undo, Progressive/Double, Connections/Teams, H2H guards and privacy. The complete local migration chain also runs existing Pinpoint, Rounds, Teams, Ordering/Matching, Connections and Progressive fixtures. `wagers_concurrency.mjs` accepts a disposable PostgreSQL client factory and checks 75 simultaneous answers: exactly one row each, correct stored percentage/core payload/score/total, no duplicates, zero broadcasts and unchanged session state. Production credentials are neither needed nor used.

## Pass 7A results

- 692 focused unit/component tests across 52 files passed in the final verification and focused correction rerun. The first run had one historical test still treating v11 as unsupported; the corrected 45-test portable file passed. No full unit suite ran.
- Six dedicated Wager browser checks passed in desktop/mobile Chromium. The 320px player, 16:9 presentation and compact controller screenshots were inspected; answer drafts, wagers, negative totals, refresh, Round Intro, Progressive and Connections/Team flows passed. No unrelated E2E files ran.
- Full migration chain passed on disposable PostgreSQL 17.10 with real pgcrypto and local Auth/Storage/Realtime fixtures. All seven SQL files passed, alongside 12 Standard/H2H Pinpoint games and both Connections lock orders. An existing answer row was unchanged except for its new zero percentage.
- 75 simultaneous wagered submissions completed in 624 ms in the final local burst: 75 unique rows, exact percentages/core payloads/awarded points/player totals, zero broadcasts and unchanged session state. This is local concurrency validation, not a production latency claim.
- Typecheck, lint and production build passed. Main, production DB, Netlify, earlier migrations, historical schemas and unrelated artwork were untouched.

## Files changed

- `README.md`
- `docs/katwed-quiz-format-v11.md`
- `docs/schemas/katwed-quiz-v11.schema.json`
- `docs/wagers.md`
- `src/components/Leaderboard.wager.test.tsx`
- `src/features/game/HostResponseMonitor.test.tsx`
- `src/features/game/HostResponseMonitor.tsx`
- `src/features/game/PlayerQuestion.tsx`
- `src/features/game/PlayerSubmissionSummary.tsx`
- `src/features/game/PresentationStage.tsx`
- `src/features/game/WagerControl.tsx`
- `src/features/game/hostResponses.ts`
- `src/features/game/wager.test.tsx`
- `src/features/questions/answerPayload.ts`
- `src/features/questions/factories.ts`
- `src/features/quiz-editor/WagerSettings.tsx`
- `src/features/quiz-editor/validation.ts`
- `src/features/quiz-transfer/katwedQuizFormat.test.ts`
- `src/features/quiz-transfer/katwedQuizFormat.ts`
- `src/features/quiz-transfer/katwedQuizV10.test.ts`
- `src/features/quiz-transfer/katwedQuizV11.test.ts`
- `src/features/quiz-transfer/katwedQuizV7.test.ts`
- `src/features/quiz-transfer/katwedQuizV8.test.ts`
- `src/features/quiz-transfer/katwedQuizV9.test.ts`
- `src/features/scoring/wager.test.ts`
- `src/features/scoring/wager.ts`
- `src/lib/demo/DemoGameRepository.ts`
- `src/lib/demo/wager.test.ts`
- `src/lib/supabase/safeGameState.ts`
- `src/lib/supabase/wager.test.ts`
- `src/routes/QuizEditorPage.test.tsx`
- `src/routes/QuizEditorPage.tsx`
- `src/services/playerSession.ts`
- `src/services/playerSession.wager.test.ts`
- `src/styles/wager.css`
- `src/test/legacyPortable.ts`
- `src/test/wagerFixtures.ts`
- `src/types/domain.ts`
- `src/utils/scoring.ts`
- `supabase/migrations/20260904141715_wagers.sql`
- `supabase/tests/pinpoint_targets_test.sql`
- `supabase/tests/wagers_concurrency.mjs`
- `supabase/tests/wagers_test.sql`
- `tests/e2e/wagers.spec.ts`
